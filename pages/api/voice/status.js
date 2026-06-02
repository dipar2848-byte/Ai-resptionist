/**
 * POST /api/voice/status
 *
 * Optional Twilio status callback (configure under the number's "Call status
 * changes" callback). Used to clean up session state when a call completes,
 * and to log call lifecycle events.
 */

const { parseTwilioRequest } = require('../../../lib/twilio/request');
const { getTenantByNumber } = require('../../../lib/tenants/tenantStore');
const { getOrCreateSession, endSession } = require('../../../lib/session/sessionManager');
const { logger } = require('../../../lib/utils/logger');

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  const { ok, params, reason } = await parseTwilioRequest(req);
  if (!ok) {
    logger.warn('Rejected status webhook', { reason });
    return res.status(reason === 'invalid_signature' ? 403 : 400).end();
  }

  const { CallSid, To, CallStatus } = params;
  const log = logger.child({ call_sid: CallSid, status: CallStatus });
  log.info('Call status update');

  // Clean up finished calls to free session memory.
  const terminal = ['completed', 'failed', 'busy', 'no-answer', 'canceled'];
  if (terminal.includes(CallStatus)) {
    const tenant = getTenantByNumber(To);
    if (tenant) {
      try {
        const session = await getOrCreateSession({ callSid: CallSid, clientId: tenant.client_id, to: To });
        await endSession(session);
      } catch (err) {
        log.warn('Session cleanup failed', { error: err.message });
      }
    }
  }

  return res.status(204).end();
}
