/**
 * Multi-tenant configuration loader + router.
 *
 * Source of truth is config/tenants.json (JSON-based client profiles).
 * In production this can be swapped for a DB-backed loader without changing
 * callers — the public API (getTenantByNumber / getTenantById) stays the same.
 *
 * Phone numbers are normalized to E.164-ish digits so that "+91 90000 00001",
 * "+919000000001" and "919000000001" all match the same tenant.
 */

const path = require('path');
const fs = require('fs');
const { logger } = require('../utils/logger');

let _cache = null;

function normalizeNumber(num) {
  if (!num) return '';
  // Keep leading + then strip everything that isn't a digit.
  const trimmed = String(num).trim();
  const hasPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/[^\d]/g, '');
  return hasPlus ? `+${digits}` : digits;
}

/** Compare two numbers ignoring formatting and an optional leading '+'. */
function numbersMatch(a, b) {
  const na = normalizeNumber(a).replace(/^\+/, '');
  const nb = normalizeNumber(b).replace(/^\+/, '');
  if (!na || !nb) return false;
  // Match on suffix to tolerate country-code presence/absence (min 8 digits).
  if (na === nb) return true;
  const minLen = Math.min(na.length, nb.length);
  if (minLen >= 8) {
    return na.slice(-minLen) === nb.slice(-minLen);
  }
  return false;
}

function validateTenant(t) {
  const errors = [];
  if (!t.client_id) errors.push('client_id missing');
  if (!t.phone_number) errors.push('phone_number missing');
  if (!t.business_name) errors.push('business_name missing');
  if (!Array.isArray(t.services)) errors.push('services must be an array');
  return errors;
}

function loadTenants() {
  if (_cache) return _cache;

  const filePath = path.join(process.cwd(), 'config', 'tenants.json');
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    logger.error('Failed to read tenants.json', { error: err.message });
    _cache = { byId: new Map(), list: [] };
    return _cache;
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    logger.error('tenants.json is not valid JSON', { error: err.message });
    _cache = { byId: new Map(), list: [] };
    return _cache;
  }

  const list = Array.isArray(parsed.clients) ? parsed.clients : [];
  const byId = new Map();

  for (const t of list) {
    const errs = validateTenant(t);
    if (errs.length) {
      logger.warn('Skipping invalid tenant config', { client_id: t.client_id, errors: errs });
      continue;
    }
    byId.set(t.client_id, t);
  }

  _cache = { byId, list: [...byId.values()] };
  logger.info('Loaded tenants', { count: _cache.list.length });
  return _cache;
}

/** Reset cache — useful in tests or after a hot config reload. */
function clearTenantCache() {
  _cache = null;
}

function getTenantById(clientId) {
  const { byId } = loadTenants();
  return byId.get(clientId) || null;
}

/**
 * Routing layer: identify the client by the Twilio "To" number (the business
 * number the caller dialed). Returns null if no tenant owns that number.
 */
function getTenantByNumber(toNumber) {
  const { list } = loadTenants();
  for (const t of list) {
    if (numbersMatch(t.phone_number, toNumber)) return t;
  }
  return null;
}

function listTenants() {
  return loadTenants().list;
}

module.exports = {
  getTenantById,
  getTenantByNumber,
  listTenants,
  clearTenantCache,
  normalizeNumber,
  numbersMatch,
};
