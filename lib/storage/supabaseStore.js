/**
 * Supabase-backed StorageAdapter (optional, drop-in for memoryStore).
 *
 * This implementation intentionally uses the Supabase REST API via fetch so we
 * don't force a dependency on @supabase/supabase-js. It is only activated when
 * SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are present.
 *
 * Expected tables (SQL provided in README / db/schema.sql):
 *   sessions(key text primary key, value jsonb, expires_at timestamptz)
 *   bookings(id uuid default gen_random_uuid() primary key, client_id text,
 *            call_sid text, name text, service text, datetime text,
 *            status text, created_at timestamptz default now())
 */

const { env } = require('../config/env');
const { logger } = require('../utils/logger');

function headers() {
  return {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
  };
}

function restUrl(pathname) {
  return `${env.SUPABASE_URL.replace(/\/+$/, '')}/rest/v1/${pathname}`;
}

const supabaseStore = {
  kind: 'supabase',

  async getSession(key) {
    try {
      const url = restUrl(`sessions?key=eq.${encodeURIComponent(key)}&select=value,expires_at`);
      const res = await fetch(url, { headers: headers() });
      if (!res.ok) throw new Error(`GET sessions ${res.status}`);
      const rows = await res.json();
      if (!rows.length) return null;
      const row = rows[0];
      if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) {
        await this.deleteSession(key);
        return null;
      }
      return row.value;
    } catch (err) {
      logger.error('supabase getSession failed', { error: err.message });
      return null;
    }
  },

  async setSession(key, value, ttlMs = env.SESSION_TTL_MS) {
    try {
      const body = [{ key, value, expires_at: new Date(Date.now() + ttlMs).toISOString() }];
      const res = await fetch(restUrl('sessions'), {
        method: 'POST',
        headers: { ...headers(), Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`UPSERT sessions ${res.status}`);
      return value;
    } catch (err) {
      logger.error('supabase setSession failed', { error: err.message });
      return value; // best-effort; caller still has in-process state for the turn
    }
  },

  async deleteSession(key) {
    try {
      await fetch(restUrl(`sessions?key=eq.${encodeURIComponent(key)}`), {
        method: 'DELETE',
        headers: headers(),
      });
    } catch (err) {
      logger.error('supabase deleteSession failed', { error: err.message });
    }
  },

  async saveBooking(booking) {
    try {
      const res = await fetch(restUrl('bookings'), {
        method: 'POST',
        headers: { ...headers(), Prefer: 'return=representation' },
        body: JSON.stringify([booking]),
      });
      if (!res.ok) throw new Error(`INSERT bookings ${res.status}`);
      const rows = await res.json();
      return rows[0] || booking;
    } catch (err) {
      logger.error('supabase saveBooking failed', { error: err.message });
      return { ...booking, id: `local_${Date.now()}` };
    }
  },

  async listBookings() {
    try {
      const res = await fetch(restUrl('bookings?select=*&order=created_at.desc'), { headers: headers() });
      if (!res.ok) throw new Error(`GET bookings ${res.status}`);
      return await res.json();
    } catch (err) {
      logger.error('supabase listBookings failed', { error: err.message });
      return [];
    }
  },
};

module.exports = { supabaseStore };
