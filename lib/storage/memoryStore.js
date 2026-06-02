/**
 * In-memory session store with TTL eviction.
 *
 * NOTE: Serverless functions are ephemeral and not guaranteed to share memory
 * across invocations/instances. For a single warm instance this works for a
 * full call; for guaranteed durability across cold starts/instances, configure
 * Supabase (see supabaseStore.js). The StorageAdapter interface is identical so
 * callers don't care which backend is active.
 */

const { env } = require('../config/env');

const _sessions = new Map(); // key -> { value, expiresAt }
const _bookings = []; // append-only mock booking log

function now() {
  return Date.now();
}

function evictExpired() {
  const t = now();
  for (const [k, entry] of _sessions.entries()) {
    if (entry.expiresAt <= t) _sessions.delete(k);
  }
}

const memoryStore = {
  kind: 'memory',

  async getSession(key) {
    evictExpired();
    const entry = _sessions.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= now()) {
      _sessions.delete(key);
      return null;
    }
    return entry.value;
  },

  async setSession(key, value, ttlMs = env.SESSION_TTL_MS) {
    _sessions.set(key, { value, expiresAt: now() + ttlMs });
    return value;
  },

  async deleteSession(key) {
    _sessions.delete(key);
  },

  async saveBooking(booking) {
    const record = { ...booking, id: `bk_${now()}_${Math.random().toString(36).slice(2, 8)}`, created_at: new Date().toISOString() };
    _bookings.push(record);
    return record;
  },

  async listBookings() {
    return [..._bookings];
  },
};

module.exports = { memoryStore };
