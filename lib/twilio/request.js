/**
 * Safe parsing + signature validation for inbound Twilio webhooks.
 *
 * Twilio posts application/x-www-form-urlencoded bodies and signs the request
 * with X-Twilio-Signature. We disable Next's body parser on these routes (see
 * route `config`) so we can read the RAW body, both for reliable parsing and
 * for correct signature validation.
 */

const twilio = require('twilio');
const { env } = require('../config/env');
const { logger } = require('../utils/logger');

/** Read the raw request body as a string. */
function readRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      // Guard against absurdly large bodies.
      if (data.length > 1e6) {
        reject(new Error('Request body too large'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

/** Parse a urlencoded body string into a plain object. */
function parseUrlEncoded(raw) {
  const params = {};
  const sp = new URLSearchParams(raw);
  for (const [k, v] of sp.entries()) params[k] = v;
  return params;
}

/**
 * Reconstruct the full external URL Twilio used (needed for signature check).
 */
function fullUrl(req) {
  if (env.PUBLIC_BASE_URL) {
    return `${env.PUBLIC_BASE_URL}${req.url}`;
  }
  const proto = (req.headers['x-forwarded-proto'] || 'https').split(',')[0];
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}${req.url}`;
}

/**
 * Parse and (optionally) validate a Twilio webhook request.
 * @returns {Promise<{ ok: boolean, params: object, reason?: string }>}
 */
async function parseTwilioRequest(req) {
  if (req.method !== 'POST') {
    return { ok: false, params: {}, reason: 'method_not_allowed' };
  }

  let raw;
  try {
    raw = await readRawBody(req);
  } catch (err) {
    return { ok: false, params: {}, reason: `body_read_error: ${err.message}` };
  }

  const params = parseUrlEncoded(raw);

  // Signature validation (security). Can be disabled for local testing.
  if (env.TWILIO_VALIDATE_SIGNATURE) {
    if (!env.TWILIO_AUTH_TOKEN) {
      logger.error('Signature validation enabled but TWILIO_AUTH_TOKEN missing');
      return { ok: false, params, reason: 'missing_auth_token' };
    }
    const signature = req.headers['x-twilio-signature'];
    const url = fullUrl(req);
    const valid = twilio.validateRequest(env.TWILIO_AUTH_TOKEN, signature, url, params);
    if (!valid) {
      logger.warn('Invalid Twilio signature', { url });
      return { ok: false, params, reason: 'invalid_signature' };
    }
  }

  return { ok: true, params };
}

module.exports = { parseTwilioRequest, readRawBody, parseUrlEncoded, fullUrl };
