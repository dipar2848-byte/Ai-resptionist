/**
 * Parses and validates the strict JSON output from the LLM.
 *
 * The model is instructed to return pure JSON, but we defensively:
 *  - strip code fences if present
 *  - extract the first {...} block if there's stray text
 *  - coerce/normalize fields to the contract
 *  - never throw — return a safe fallback object instead
 */

const VALID_INTENTS = ['booking', 'faq', 'fallback'];
const VALID_FIELDS = ['name', 'service', 'datetime'];

function stripFences(text) {
  return String(text)
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim();
}

function extractJsonBlock(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  return text.slice(start, end + 1);
}

function safeBool(v, fallback = false) {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') return ['true', 'yes', '1'].includes(v.toLowerCase());
  return fallback;
}

function normalizeBooking(b) {
  const out = { name: null, service: null, datetime: null };
  if (b && typeof b === 'object') {
    if (typeof b.name === 'string' && b.name.trim()) out.name = b.name.trim();
    if (typeof b.service === 'string' && b.service.trim()) out.service = b.service.trim();
    if (typeof b.datetime === 'string' && b.datetime.trim()) out.datetime = b.datetime.trim();
  }
  return out;
}

/**
 * @param {string} raw - raw LLM content
 * @returns {{ ok: boolean, data: object }}
 */
function parseAiResponse(raw) {
  let text = stripFences(raw || '');
  let obj = null;

  try {
    obj = JSON.parse(text);
  } catch (_) {
    const block = extractJsonBlock(text);
    if (block) {
      try {
        obj = JSON.parse(block);
      } catch (_) {
        obj = null;
      }
    }
  }

  if (!obj || typeof obj !== 'object') {
    return { ok: false, data: null };
  }

  const reply = typeof obj.reply === 'string' && obj.reply.trim()
    ? obj.reply.trim()
    : null;

  if (!reply) return { ok: false, data: null };

  let intent = String(obj.intent || '').toLowerCase();
  if (!VALID_INTENTS.includes(intent)) intent = 'faq';

  let missing = Array.isArray(obj.missing_fields) ? obj.missing_fields : [];
  missing = missing
    .map((f) => String(f).toLowerCase())
    .filter((f) => VALID_FIELDS.includes(f));

  const data = {
    reply,
    intent,
    needs_followup: safeBool(obj.needs_followup, missing.length > 0),
    missing_fields: missing,
    booking: normalizeBooking(obj.booking),
    end_call: safeBool(obj.end_call, false),
  };

  return { ok: true, data };
}

module.exports = { parseAiResponse, VALID_INTENTS, VALID_FIELDS };
