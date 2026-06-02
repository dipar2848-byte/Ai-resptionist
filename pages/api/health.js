/**
 * GET /api/health
 *
 * Lightweight health/readiness probe. Reports config warnings (without leaking
 * secret values) and which adapters are active. Useful for uptime monitors and
 * for verifying a fresh deployment before pointing Twilio at it.
 */

const { env, getConfigWarnings } = require('../../lib/config/env');
const { listTenants } = require('../../lib/tenants/tenantStore');

export default function handler(req, res) {
  const tenants = listTenants();
  res.status(200).json({
    status: 'ok',
    time: new Date().toISOString(),
    storage: env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY ? 'supabase' : 'memory',
    tts: env.TTS_PROVIDER,
    llm_model: env.LLM_MODEL,
    llm_configured: !!env.LLM_API_KEY,
    signature_validation: env.TWILIO_VALIDATE_SIGNATURE,
    tenant_count: tenants.length,
    tenants: tenants.map((t) => ({
      client_id: t.client_id,
      business_name: t.business_name,
      phone_number: t.phone_number,
    })),
    warnings: getConfigWarnings(),
  });
}
