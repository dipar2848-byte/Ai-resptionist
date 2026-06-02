/**
 * Optional ElevenLabs TTS integration.
 *
 * Strategy for serverless + Twilio: we expose a streaming proxy endpoint
 * (/api/voice/tts) that Twilio fetches via <Play>. That endpoint calls this
 * module to synthesize MP3 audio on demand. This avoids needing object storage
 * while still allowing premium voices.
 *
 * If ElevenLabs is not configured or fails, callers should fall back to
 * Twilio <Say>.
 */

const { env } = require('../config/env');
const { logger } = require('../utils/logger');

function isElevenLabsEnabled() {
  return env.TTS_PROVIDER === 'elevenlabs' && !!env.ELEVENLABS_API_KEY;
}

/**
 * Synthesize speech to an MP3 Buffer.
 * @param {string} text
 * @param {object} opts { voiceId, modelId }
 * @returns {Promise<Buffer>}
 */
async function synthesizeSpeech(text, opts = {}) {
  if (!env.ELEVENLABS_API_KEY) {
    throw new Error('ELEVENLABS_API_KEY not configured');
  }
  const voiceId = opts.voiceId || env.ELEVENLABS_VOICE_ID;
  const modelId = opts.modelId || env.ELEVENLABS_MODEL_ID;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': env.ELEVENLABS_API_KEY,
          'Content-Type': 'application/json',
          Accept: 'audio/mpeg',
        },
        body: JSON.stringify({
          text,
          model_id: modelId,
          voice_settings: { stability: 0.5, similarity_boost: 0.75 },
        }),
        signal: controller.signal,
      }
    );

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`ElevenLabs HTTP ${res.status}: ${errText.slice(0, 200)}`);
    }
    const arrayBuf = await res.arrayBuffer();
    return Buffer.from(arrayBuf);
  } catch (err) {
    logger.error('ElevenLabs synthesis failed', { error: err.message });
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { isElevenLabsEnabled, synthesizeSpeech };
