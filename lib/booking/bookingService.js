/**
 * Booking logic.
 *
 * Merges newly-understood slot values into the session's cumulative booking
 * state, determines which slots are still missing, validates requested times
 * against the tenant's working hours, and (when complete) persists a mock
 * booking via the storage adapter.
 */

const { getStore } = require('../storage');
const { logger } = require('../utils/logger');

const REQUIRED_SLOTS = ['name', 'service', 'datetime'];

/**
 * Merge AI-extracted booking values into the session (cumulative — never
 * overwrite a known value with null).
 */
function mergeBooking(session, aiBooking) {
  const current = session.booking || { name: null, service: null, datetime: null };
  const merged = { ...current };
  if (aiBooking) {
    for (const slot of REQUIRED_SLOTS) {
      if (aiBooking[slot]) merged[slot] = aiBooking[slot];
    }
  }
  session.booking = merged;
  return merged;
}

function missingSlots(booking) {
  return REQUIRED_SLOTS.filter((s) => !booking || !booking[s]);
}

function isComplete(booking) {
  return missingSlots(booking).length === 0;
}

/**
 * Lightweight working-hours sanity check.
 * working_hours expected as "HH:MM-HH:MM" (24h). We try to find an "HH" or
 * "H am/pm" in the requested datetime string. This is heuristic — the LLM does
 * the heavy lifting; this is a server-side guard rail.
 * @returns {{ valid: boolean, reason?: string }}
 */
function validateWithinHours(datetimeStr, workingHours) {
  if (!datetimeStr || !workingHours) return { valid: true };
  const m = /^(\d{1,2}):?(\d{2})?\s*-\s*(\d{1,2}):?(\d{2})?$/.exec(workingHours.trim());
  if (!m) return { valid: true }; // can't parse rule -> don't block

  const openH = parseInt(m[1], 10);
  const closeH = parseInt(m[3], 10);

  // Try to extract an hour from the requested datetime.
  let reqHour = null;
  const ampm = /(\d{1,2})\s*(am|pm)/i.exec(datetimeStr);
  if (ampm) {
    let h = parseInt(ampm[1], 10);
    const isPm = ampm[2].toLowerCase() === 'pm';
    if (isPm && h !== 12) h += 12;
    if (!isPm && h === 12) h = 0;
    reqHour = h;
  } else {
    const h24 = /(\b\d{1,2}):\d{2}\b/.exec(datetimeStr);
    if (h24) reqHour = parseInt(h24[1], 10);
  }

  if (reqHour === null) return { valid: true }; // no time detected -> allow
  if (reqHour < openH || reqHour >= closeH) {
    return {
      valid: false,
      reason: `requested ${reqHour}:00 is outside working hours ${workingHours}`,
    };
  }
  return { valid: true };
}

/**
 * Persist a confirmed booking (mock integration). Returns the saved record.
 */
async function confirmBooking(session, tenant) {
  const store = getStore();
  const record = {
    client_id: tenant.client_id,
    call_sid: session.callSid,
    name: session.booking.name,
    service: session.booking.service,
    datetime: session.booking.datetime,
    status: 'confirmed',
  };
  try {
    const saved = await store.saveBooking(record);
    logger.info('Booking confirmed', { client_id: tenant.client_id, call_sid: session.callSid });
    return saved;
  } catch (err) {
    logger.error('Failed to persist booking', { error: err.message });
    return { ...record, id: 'unsaved', status: 'pending' };
  }
}

module.exports = {
  REQUIRED_SLOTS,
  mergeBooking,
  missingSlots,
  isComplete,
  validateWithinHours,
  confirmBooking,
};
