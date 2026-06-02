/**
 * POST /api/voice/turn
 *
 * Handles each conversational turn. Twilio's <Gather> posts the recognized
 * SpeechResult here; we run the conversation engine and return TwiML that
 * speaks the reply and gathers the next utterance (or hangs up / transfers).
 *
 * Edge cases handled here:
 *   - No speech / silence (?noinput=1 or empty SpeechResult)
 *   - Unclear/noise input
 *   - Repeated identical questions
 *   - AI failure (graceful fallback via engine)
 */

const { parseTwilioRequest } = require('../../../lib/twilio/request');
const { getTenantByNumber } = require('../../../lib/tenants/tenantStore');
const {
  getOrCreateSession,
  saveSession,
  endSession,
  appendUserTurn,
  appendAssistantTurn,
  recordNoInput,
} = require('../../../lib/session/sessionManager');
const {
  resolveBaseUrl,
  gatherSpeech,
  sayAndHangup,
  sayAndDial,
} = require('../../../lib/twilio/twiml');
const { processTurn } = require('../../../lib/ai/conversationEngine');
const edge = require('../../../lib/ai/edgeCases');
const fallbacks = require('../../../lib/ai/fallbacks');
const { logger } = require('../../../lib/utils/logger');

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  const baseUrl = resolveBaseUrl(req);
  res.setHeader('Content-Type', 'text/xml');

  const { ok, params, reason } = await parseTwilioRequest(req);
  if (!ok) {
    logger.warn('Rejected turn webhook', { reason });
    return res
      .status(reason === 'invalid_signature' ? 403 : 400)
      .send(sayAndHangup({ text: "Sorry, we can't continue this call. Goodbye.", baseUrl }));
  }

  const { CallSid, From, To, SpeechResult, Confidence } = params;
  const noInputFlag = req.url.includes('noinput=1') || !SpeechResult || !SpeechResult.trim();
  const log = logger.child({ call_sid: CallSid, client: To });

  const tenant = getTenantByNumber(To);
  if (!tenant) {
    return res.status(200).send(sayAndHangup({ text: fallbacks.noTenantResponse(), baseUrl }));
  }

  let session;
  try {
    session = await getOrCreateSession({ callSid: CallSid, clientId: tenant.client_id, from: From, to: To });
  } catch (err) {
    log.error('Session load failed', { error: err.message });
    return res.status(200).send(
      gatherSpeech({ text: fallbacks.aiFailureFallback(tenant), baseUrl })
    );
  }

  // ── Edge case: no speech / silence ──
  if (noInputFlag) {
    recordNoInput(session);
    const attempt = session.noInputCount;
    const reply = fallbacks.noInputFallback(tenant, attempt);
    await saveSession(session);

    if (attempt >= 3) {
      await endSession(session);
      return res.status(200).send(sayAndHangup({ text: reply, baseUrl }));
    }
    return res.status(200).send(gatherSpeech({ text: reply, baseUrl }));
  }

  const userText = SpeechResult.trim();
  log.info('Caller said', { text: userText, confidence: Confidence });

  // ── Edge case: noise / empty after trim ──
  if (edge.isEmptyOrNoise(userText)) {
    const reply = fallbacks.unclearInputFallback();
    return res.status(200).send(gatherSpeech({ text: reply, baseUrl }));
  }

  appendUserTurn(session, userText);

  // ── Edge case: repeated identical question (>=2 repeats) ──
  if (session.repeatCount >= 2) {
    const reply = fallbacks.repeatedQuestionFallback();
    appendAssistantTurn(session, reply);
    session.repeatCount = 0;
    await saveSession(session);
    return res.status(200).send(gatherSpeech({ text: reply, baseUrl }));
  }

  // ── Run the conversation engine ──
  let decision;
  try {
    decision = await processTurn({ tenant, session, userText });
  } catch (err) {
    log.error('processTurn threw unexpectedly', { error: err.message });
    const reply = fallbacks.aiFailureFallback(tenant);
    appendAssistantTurn(session, reply);
    await saveSession(session);
    return res.status(200).send(gatherSpeech({ text: reply, baseUrl }));
  }

  appendAssistantTurn(session, decision.reply);
  await saveSession(session);

  // ── Transfer to human ──
  if (decision.transfer && tenant.transfer_number) {
    await endSession(session);
    return res.status(200).send(
      sayAndDial({ text: decision.reply, baseUrl, dialNumber: tenant.transfer_number })
    );
  }

  // ── End of call ──
  if (decision.endCall) {
    await endSession(session);
    return res.status(200).send(sayAndHangup({ text: decision.reply, baseUrl }));
  }

  // ── Continue conversation ──
  const hints = Array.isArray(tenant.services) ? tenant.services.join(', ') : '';
  return res.status(200).send(gatherSpeech({ text: decision.reply, baseUrl, hints }));
}
