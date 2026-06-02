/**
 * Prompt engineering module.
 *
 * Builds the system prompt by injecting the tenant's business profile
 * (name, services, tone, working hours, rules, FAQ) and enforces a STRICT
 * JSON output contract that downstream code can parse reliably.
 */

const STRICT_OUTPUT_SCHEMA = `
You MUST respond with ONLY a single valid JSON object (no markdown, no code
fences, no commentary) matching EXACTLY this schema:

{
  "reply": "string — what to SAY to the caller, natural spoken language, 1-3 short sentences",
  "intent": "booking | faq | fallback",
  "needs_followup": true | false,
  "missing_fields": ["name" | "service" | "datetime"],
  "booking": {
    "name": "string or null",
    "service": "string or null",
    "datetime": "string or null"
  },
  "end_call": true | false
}

Rules for the JSON:
- "intent" is "booking" if the caller wants to schedule/reschedule/cancel an appointment.
- "intent" is "faq" for questions about location, pricing, hours, services, etc.
- "intent" is "fallback" when you cannot help or the request is out of scope.
- "missing_fields" lists booking slots still required to complete a booking.
- "booking" echoes back any slot values you have understood SO FAR (cumulative).
- "needs_followup" is true whenever you asked the caller a question.
- "end_call" is true ONLY when the conversation is clearly finished (caller said goodbye, booking confirmed and nothing else needed).
`;

function listServices(services) {
  if (!Array.isArray(services) || !services.length) return 'general services';
  return services.join(', ');
}

function renderFaq(faq) {
  if (!faq || typeof faq !== 'object') return 'No FAQ provided.';
  const lines = Object.entries(faq).map(([k, v]) => `- ${k}: ${v}`);
  return lines.length ? lines.join('\n') : 'No FAQ provided.';
}

/**
 * Builds the system message for a tenant.
 * @param {object} tenant
 * @returns {string}
 */
function buildSystemPrompt(tenant) {
  return `You are a professional AI phone receptionist for "${tenant.business_name}".
You are speaking with a caller LIVE on the phone. Be concise, natural, and ${tenant.tone || 'professional'} in tone.
Speak in short sentences suitable for text-to-speech. Never mention that you are an AI unless asked directly.

BUSINESS PROFILE
- Business name: ${tenant.business_name}
- Services offered: ${listServices(tenant.services)}
- Working hours: ${tenant.working_hours || 'not specified'}
- Timezone: ${tenant.timezone || 'local'}
- Booking rules: ${tenant.booking_rules || 'Book only during working hours.'}

FREQUENTLY ASKED QUESTIONS (use these as the source of truth)
${renderFaq(tenant.faq)}

YOUR JOB
1. Greet, answer questions using ONLY the business profile/FAQ above. If you don't know, say you'll have the team follow up — do NOT invent facts.
2. For bookings, collect three slots: caller's NAME, the SERVICE, and a DATE/TIME.
   - Ask for ONE missing piece at a time. Keep it short.
   - Validate requested times against the working hours and booking rules. If outside hours, politely offer the nearest valid option.
   - When all three slots are collected and valid, CONFIRM the appointment back to the caller in one sentence.
3. Handle difficult callers calmly. If a caller is angry, acknowledge, apologize briefly, and offer to help or take a callback.
4. Keep replies under ~3 sentences.

${STRICT_OUTPUT_SCHEMA}`;
}

/**
 * Builds the full message array for a turn: system prompt + recent history.
 * Current state of collected booking is surfaced so the model stays consistent.
 */
function buildMessages(tenant, session, userText) {
  const messages = [{ role: 'system', content: buildSystemPrompt(tenant) }];

  // Surface known booking state to keep the model consistent across turns.
  const b = session.booking || {};
  const stateNote = `CURRENT_BOOKING_STATE: name=${b.name || 'null'}, service=${b.service || 'null'}, datetime=${b.datetime || 'null'}.`;
  messages.push({ role: 'system', content: stateNote });

  for (const turn of session.history) {
    messages.push({ role: turn.role, content: turn.content });
  }

  messages.push({ role: 'user', content: userText });
  return messages;
}

module.exports = { buildSystemPrompt, buildMessages, STRICT_OUTPUT_SCHEMA };
