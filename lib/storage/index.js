/**
 * Storage selector. Picks the Supabase adapter when configured, otherwise the
 * in-memory adapter. Both implement the same StorageAdapter interface:
 *
 *   getSession(key) -> value | null
 *   setSession(key, value, ttlMs?) -> value
 *   deleteSession(key) -> void
 *   saveBooking(booking) -> savedBooking
 *   listBookings() -> booking[]
 */

const { env } = require('../config/env');
const { memoryStore } = require('./memoryStore');
const { supabaseStore } = require('./supabaseStore');
const { logger } = require('../utils/logger');

let _store = null;

function getStore() {
  if (_store) return _store;
  if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
    _store = supabaseStore;
    logger.info('Using Supabase storage adapter');
  } else {
    _store = memoryStore;
    logger.info('Using in-memory storage adapter');
  }
  return _store;
}

module.exports = { getStore };
