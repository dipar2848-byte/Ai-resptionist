/**
 * Centralized, validated access to environment variables.
 * Never read process.env directly elsewhere — import from here so we have
 * one place for defaults, type coercion, and missing-var diagnostics.
 */

function str(name, fallback = undefined) {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  return v;
}

function int(name, fallback) {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? fallback : n;
}

function bool(name, fallback) {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase());
}

const env = {
  // Deployment
  PUBLIC_BASE_URL: (str('PUBLIC_BASE_URL', '') || '').replace(/\/+$/, ''),

  // LLM
  LLM_API_KEY: str('LLM_API_KEY'),
  LLM_BASE_URL: str('LLM_BASE_URL', 'https://api.openai.com/v1').replace(/\/+$/, ''),
  LLM_MODEL: str('LLM_MODEL', 'gpt-4o-mini'),
  LLM_TIMEOUT_MS: int('LLM_TIMEOUT_MS', 8000),

  // Twilio
  TWILIO_AUTH_TOKEN: str('TWILIO_AUTH_TOKEN'),
  TWILIO_VALIDATE_SIGNATURE: bool('TWILIO_VALIDATE_SIGNATURE', true),
  TWILIO_SPEECH_LANGUAGE: str('TWILIO_SPEECH_LANGUAGE', 'en-US'),
  TWILIO_TTS_VOICE: str('TWILIO_TTS_VOICE', 'Polly.Joanna'),

  // TTS
  TTS_PROVIDER: str('TTS_PROVIDER', 'twilio').toLowerCase(),
  ELEVENLABS_API_KEY: str('ELEVENLABS_API_KEY'),
  ELEVENLABS_VOICE_ID: str('ELEVENLABS_VOICE_ID', '21m00Tcm4TlvDq8ikWAM'),
  ELEVENLABS_MODEL_ID: str('ELEVENLABS_MODEL_ID', 'eleven_turbo_v2_5'),

  // Supabase
  SUPABASE_URL: str('SUPABASE_URL'),
  SUPABASE_SERVICE_ROLE_KEY: str('SUPABASE_SERVICE_ROLE_KEY'),

  // Session
  SESSION_TTL_MS: int('SESSION_TTL_MS', 30 * 60 * 1000),
  MAX_HISTORY_TURNS: int('MAX_HISTORY_TURNS', 12),

  // Runtime flags
  NODE_ENV: str('NODE_ENV', 'development'),
};

/**
 * Returns a list of human-readable warnings about missing config so we can
 * log them at boot without crashing the serverless function.
 */
function getConfigWarnings() {
  const warnings = [];
  if (!env.LLM_API_KEY) warnings.push('LLM_API_KEY is not set — AI replies will use fallback responses.');
  if (env.TWILIO_VALIDATE_SIGNATURE && !env.TWILIO_AUTH_TOKEN) {
    warnings.push('TWILIO_VALIDATE_SIGNATURE is on but TWILIO_AUTH_TOKEN is missing — requests will be rejected.');
  }
  if (!env.PUBLIC_BASE_URL) {
    warnings.push('PUBLIC_BASE_URL is not set — falling back to request host for webhook URLs.');
  }
  if (env.TTS_PROVIDER === 'elevenlabs' && !env.ELEVENLABS_API_KEY) {
    warnings.push('TTS_PROVIDER=elevenlabs but ELEVENLABS_API_KEY is missing — will fall back to Twilio <Say>.');
  }
  return warnings;
}

module.exports = { env, getConfigWarnings };
