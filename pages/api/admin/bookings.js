/**
 * GET /api/admin/bookings
 *
 * Returns recorded (mock) bookings. Protected by a simple bearer token via the
 * ADMIN_TOKEN env var. If ADMIN_TOKEN is unset, the endpoint is disabled.
 */

const { getStore } = require('../../../lib/storage');

export default async function handler(req, res) {
  const adminToken = process.env.ADMIN_TOKEN;
  if (!adminToken) {
    return res.status(404).json({ error: 'admin_disabled' });
  }
  const auth = req.headers.authorization || '';
  if (auth !== `Bearer ${adminToken}`) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  try {
    const store = getStore();
    const bookings = await store.listBookings();
    return res.status(200).json({ count: bookings.length, bookings });
  } catch (err) {
    return res.status(500).json({ error: 'failed_to_list', detail: err.message });
  }
}
