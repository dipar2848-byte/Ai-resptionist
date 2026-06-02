/**
 * GET /api/voice/tts?text=...
 *
 * ElevenLabs TTS proxy. Twilio fetches this URL via <Play> when
 * TTS_PROVIDER=elevenlabs. Streams back MP3 audio synthesized from `text`.
 *
 * Falls back to a 502 if synthesis fails — but note: the TwiML layer only
 * routes to <Play> when ElevenLabs is enabled, and uses <Say> otherwise, so
 * this endpoint is only hit in the enabled path.
 */

const { isElevenLabsEnabled, synthesizeSpeech } = require('../../../lib/tts/elevenlabs');
const { logger } = require('../../../lib/utils/logger');

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'method_not_allowed' });
  }
  if (!isElevenLabsEnabled()) {
    return res.status(404).json({ error: 'tts_disabled' });
  }

  const text = (req.query.text || '').toString().slice(0, 1000);
  if (!text.trim()) {
    return res.status(400).json({ error: 'missing_text' });
  }

  try {
    const audio = await synthesizeSpeech(text);
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', audio.length);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.status(200).send(audio);
  } catch (err) {
    logger.error('TTS proxy failed', { error: err.message });
    return res.status(502).json({ error: 'tts_failed' });
  }
}
