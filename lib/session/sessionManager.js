/**
 * Per-call session state manager.
 *
 * A session is keyed by Twilio CallSid AND bound to a client_id. The storage
 * key embeds the client_id so that even if a CallSid were ever reused or
 * spoofed, a session created for clinic_a can never be read while serving
 * salon_b — preventing context leakage between tenants.
 *
 * Session shape:
 * {
 *   callSid, clientId, from, to,
 *   history: [{ role: 'user'|'assistant', content: string }],
 *   booking: { name, service, datetime },   // collected slots
 *   turnCount, noInputCount, repeatCount, lastUserText,
 *   createdAt, updatedAt
 * }
 */

const { getStore } = require('../storage');
const { env } = require('../config/env');

function sessionKey(clientId, callSid) {
  return `sess:${clientId}:${callSid}`;
}

function newSession({ callSid, clientId, from, to }) {
  const ts = new Date().toISOString();
  return {
    callSid,
    clientId,
    from: from || null,
    to: to || null,
    history: [],
    booking: { name: null, service: null, datetime: null },
    turnCount: 0,
    noInputCount: 0,
    repeatCount: 0,
    lastUserText: null,
    createdAt: ts,
    updatedAt: ts,
  };
}

async function getOrCreateSession({ callSid, clientId, from, to }) {
  const store = getStore();
  const key = sessionKey(clientId, callSid);
  let session = await store.getSession(key);

  // Guard: if a session exists but belongs to a different client, discard it.
  if (session && session.clientId !== clientId) {
    session = null;
  }
  if (!session) {
    session = newSession({ callSid, clientId, from, to });
    await store.setSession(key, session);
  }
  return session;
}

async function saveSession(session) {
  const store = getStore();
  session.updatedAt = new Date().toISOString();
  // Trim history so prompts stay small and within token limits.
  const maxMessages = env.MAX_HISTORY_TURNS * 2;
  if (session.history.length > maxMessages) {
    session.history = session.history.slice(-maxMessages);
  }
  await store.setSession(sessionKey(session.clientId, session.callSid), session);
  return session;
}

async function endSession(session) {
  const store = getStore();
  await store.deleteSession(sessionKey(session.clientId, session.callSid));
}

function appendUserTurn(session, text) {
  session.turnCount += 1;
  if (session.lastUserText && session.lastUserText.trim().toLowerCase() === text.trim().toLowerCase()) {
    session.repeatCount += 1;
  } else {
    session.repeatCount = 0;
  }
  session.lastUserText = text;
  session.noInputCount = 0;
  session.history.push({ role: 'user', content: text });
}

function appendAssistantTurn(session, text) {
  session.history.push({ role: 'assistant', content: text });
}

function recordNoInput(session) {
  session.noInputCount += 1;
}

module.exports = {
  sessionKey,
  getOrCreateSession,
  saveSession,
  endSession,
  appendUserTurn,
  appendAssistantTurn,
  recordNoInput,
};
