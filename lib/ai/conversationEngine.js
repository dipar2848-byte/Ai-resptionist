/**
 * Conversation engine — the brain that processes one user turn end-to-end.
 *
 * Flow:
 *   1. Edge-case short-circuits (empty/unclear/angry/goodbye/human request)
 *   2. Build messages from tenant profile + session history
 *   3. Call LLM -> parse strict JSON (with retry-once on parse failure)
 *   4. Merge booking slots, validate hours, confirm booking if complete
 *   5. Return a normalized "decision" object the webhook layer turns into TwiML
 *
 * Always returns a decision — never throws — so the phone call stays graceful.
 */

const { chatCompletion } = require('./llmClient');
const { buildMessages } = require('./promptBuilder');
const { parseAiResponse } = require('./responseParser');
const { logger } = require('../utils/logger');
const fallbacks = require('./fallbacks');
const edge = require('./edgeCases');
const booking = require('../booking/bookingService');

/**
 * @typedef {Object} Decision
 * @property {string} reply        - text to speak
 * @property {boolean} endCall     - whether to hang up after speaking
 * @property {boolean} transfer    - whether to dial the human transfer number
 * @property {string} intent
 * @property {object} booking
 * @property {string[]} missingFields
 */

function decision(partial) {
  return {
    reply: '',
    endCall: false,
    transfer: false,
    intent: 'faq',
    booking: { name: null, service: null, datetime: null },
    missingFields: [],
    ...partial,
  };
}

async function callLlmWithRetry(messages, log) {
  // First attempt.
  let raw = await chatCompletion(messages);
  let parsed = parseAiResponse(raw);
  if (parsed.ok) return parsed.data;

  // One corrective retry with an explicit reminder.
  log.warn('AI response parse failed; retrying once');
  const retryMessages = [
    ...messages,
    {
      role: 'system',
      content:
        'Your previous response was not valid JSON. Respond again with ONLY the JSON object matching the required schema. No prose, no code fences.',
    },
  ];
  raw = await chatCompletion(retryMessages, { temperature: 0.1 });
  parsed = parseAiResponse(raw);
  if (parsed.ok) return parsed.data;

  throw new Error('AI returned unparseable output twice');
}

/**
 * Process a single conversational turn.
 * @param {object} params { tenant, session, userText }
 * @returns {Promise<Decision>}
 */
async function processTurn({ tenant, session, userText }) {
  const log = logger.child({ client_id: tenant.client_id, call_sid: session.callSid });

  // ── Edge case: caller explicitly wants a human ──
  if (edge.wantsHuman(userText) && tenant.transfer_number) {
    return decision({
      reply: `Of course — let me connect you to our team at ${tenant.business_name}. One moment please.`,
      transfer: true,
      intent: 'fallback',
    });
  }

  // ── Edge case: goodbye ──
  if (edge.isGoodbye(userText)) {
    return decision({
      reply: `Thank you for calling ${tenant.business_name}. Have a great day. Goodbye!`,
      endCall: true,
      intent: 'faq',
    });
  }

  // ── Edge case: angry caller (handle empathetically, still try AI after) ──
  // We let the AI handle most anger, but if the LLM is down this gives a good default.
  const angry = edge.isAngry(userText);

  // ── Try the AI ──
  let aiData;
  try {
    const messages = buildMessages(tenant, session, userText);
    aiData = await callLlmWithRetry(messages, log);
  } catch (err) {
    log.error('AI turn failed; using fallback', { error: err.message });
    const reply = angry ? fallbacks.angryUserResponse(tenant) : fallbacks.aiFailureFallback(tenant);
    return decision({ reply, intent: 'fallback', needs_followup: true });
  }

  // ── Merge + validate booking state ──
  booking.mergeBooking(session, aiData.booking);
  let reply = aiData.reply;
  let endCall = aiData.end_call;
  const intent = aiData.intent;

  if (intent === 'booking') {
    const missing = booking.missingSlots(session.booking);

    if (missing.length === 0) {
      // Validate the requested time against working hours before confirming.
      const check = booking.validateWithinHours(session.booking.datetime, tenant.working_hours);
      if (!check.valid) {
        // Clear the bad datetime and ask again.
        log.info('Requested time outside working hours', { reason: check.reason });
        session.booking.datetime = null;
        reply =
          aiData.reply ||
          `I'm sorry, that time is outside our hours (${tenant.working_hours}). What other time works for you?`;
        return decision({
          reply,
          intent,
          booking: session.booking,
          missingFields: ['datetime'],
        });
      }

      const saved = await booking.confirmBooking(session, tenant);
      log.info('Booking saved', { booking_id: saved.id });
      // If the model didn't already confirm, build a confirmation sentence.
      if (!/confirm|booked|scheduled|see you/i.test(reply)) {
        reply = `Great, ${session.booking.name}! I've booked your ${session.booking.service} for ${session.booking.datetime}. We look forward to seeing you. Anything else?`;
      }
      return decision({
        reply,
        intent,
        booking: session.booking,
        missingFields: [],
        endCall,
      });
    }

    return decision({
      reply,
      intent,
      booking: session.booking,
      missingFields: missing,
      endCall: false,
    });
  }

  return decision({
    reply,
    intent,
    booking: session.booking,
    missingFields: aiData.missing_fields,
    endCall,
  });
}

module.exports = { processTurn, decision };
