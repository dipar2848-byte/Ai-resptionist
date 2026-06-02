/**
 * POST /api/voice/inbound
 *
 * Twilio Voice webhook for INCOMING calls. Set this as the "A CALL COMES IN"
 * webhook (HTTP POST) on your Twilio phone number.
 *
 * Responsibilities:
 *   - Safely parse + validate the Twilio request
 *   - Route To-number -> tenant (multi-tenant)
 *   - Create the per-call session
 *   - Greet the caller and <Gather> their first utterance
 */

const { parseTwilioRequest } = require('../../../lib/twilio/request');
const { getTenantByNumber } = require('../../../lib/tenants/tenantStore');
const { getOrCreateSession, saveSession } = require('../../../lib/session/sessionManager');
const { resolveBaseUrl, gatherSpeech, sayAndHangup } = require('../../../lib/twilio/twiml');
const { genericGreeting, noTenantResponse } = require('../../../lib/ai/fallbacks');
const { logger } = require('../../../lib/utils/logger');

// Disable Next body parsing so we can read the raw body for signature checks.
export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  const baseUrl = resolveBaseUrl(req);

  const { ok, params, reason } = await parseTwilioRequest(req);
  if (!ok) {
    logger.warn('Rejected inbound webhook', { reason });
    res.setHeader('Content-Type', 'text/xml');
    // Even on rejection, return valid TwiML so the caller hears something.
    return res.status(reason === 'invalid_signature' ? 403 : 400).send(
      sayAndHangup({ text: "Sorry, we can't take your call right now. Goodbye.", baseUrl })
    );
  }

  const { CallSid, From, To } = params;
  const log = logger.child({ call_sid: CallSid, to: To, from: From });

  const tenant = getTenantByNumber(To);
  if (!tenant) {
    log.warn('No tenant configured for number');
    res.setHeader('Content-Type', 'text/xml');
    return res.status(200).send(sayAndHangup({ text: noTenantResponse(), baseUrl }));
  }

  try {
    const session = await getOrCreateSession({
      callSid: CallSid,
      clientId: tenant.client_id,
      from: From,
      to: To,
    });
    await saveSession(session);

    const greeting = genericGreeting(tenant);
    const hints = Array.isArray(tenant.services) ? tenant.services.join(', ') : '';

    log.info('Inbound call routed', { client_id: tenant.client_id });
    res.setHeader('Content-Type', 'text/xml');
    return res.status(200).send(
      gatherSpeech({ text: greeting, baseUrl, hints })
    );
  } catch (err) {
    log.error('Inbound handler error', { error: err.message });
    res.setHeader('Content-Type', 'text/xml');
    return res.status(200).send(
      sayAndHangup({ text: 'Sorry, something went wrong. Please call again shortly. Goodbye.', baseUrl })
    );
  }
}
