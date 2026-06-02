/**
 * TwiML builders. We use the official `twilio` SDK's VoiceResponse to generate
 * valid TwiML, plus helpers to choose between <Say> (Twilio/Polly) and <Play>
 * (ElevenLabs proxy) for the spoken reply.
 */

const twilio = require('twilio');
const { env } = require('../config/env');
const { isElevenLabsEnabled } = require('../tts/elevenlabs');

const VoiceResponse = twilio.twiml.VoiceResponse;

/**
 * Determine the absolute base URL for building action/callback URLs.
 * Prefers PUBLIC_BASE_URL; otherwise derives from the incoming request.
 */
function resolveBaseUrl(req) {
  if (env.PUBLIC_BASE_URL) return env.PUBLIC_BASE_URL;
  const proto = (req.headers['x-forwarded-proto'] || 'https').split(',')[0];
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}`;
}

/**
 * Append a spoken reply to a TwiML node, using ElevenLabs <Play> when enabled,
 * else Twilio <Say>.
 * @param {object} node - a VoiceResponse or Gather node
 * @param {string} text
 * @param {string} baseUrl
 */
function appendSpeech(node, text, baseUrl) {
  if (isElevenLabsEnabled()) {
    const url = `${baseUrl}/api/voice/tts?text=${encodeURIComponent(text)}`;
    node.play(url);
  } else {
    node.say({ voice: env.TWILIO_TTS_VOICE, language: env.TWILIO_SPEECH_LANGUAGE }, text);
  }
}

/**
 * Build a TwiML response that speaks `text` then gathers the caller's speech
 * and posts the result to the turn handler.
 *
 * @param {object} params { text, baseUrl, actionPath, hints, timeout }
 * @returns {string} TwiML XML
 */
function gatherSpeech({ text, baseUrl, actionPath = '/api/voice/turn', hints = '', timeout = 5 }) {
  const vr = new VoiceResponse();
  const gather = vr.gather({
    input: 'speech',
    action: `${baseUrl}${actionPath}`,
    method: 'POST',
    speechTimeout: 'auto',
    speechModel: 'phone_call',
    language: env.TWILIO_SPEECH_LANGUAGE,
    timeout,
    actionOnEmptyResult: true,
    hints: hints || undefined,
  });
  appendSpeech(gather, text, baseUrl);

  // If <Gather> finishes with no input at all, Twilio falls through to here.
  // We redirect back to the turn handler with an empty-input marker.
  vr.redirect({ method: 'POST' }, `${baseUrl}${actionPath}?noinput=1`);
  return vr.toString();
}

/**
 * Speak a final message then hang up.
 */
function sayAndHangup({ text, baseUrl }) {
  const vr = new VoiceResponse();
  appendSpeech(vr, text, baseUrl);
  vr.hangup();
  return vr.toString();
}

/**
 * Speak a message then dial a human transfer number.
 */
function sayAndDial({ text, baseUrl, dialNumber }) {
  const vr = new VoiceResponse();
  appendSpeech(vr, text, baseUrl);
  if (dialNumber) {
    vr.dial(dialNumber);
  } else {
    vr.hangup();
  }
  return vr.toString();
}

module.exports = {
  VoiceResponse,
  resolveBaseUrl,
  appendSpeech,
  gatherSpeech,
  sayAndHangup,
  sayAndDial,
};
