const { test } = require('node:test');
const assert = require('node:assert');
const sm = require('../lib/session/sessionManager');

test('getOrCreateSession creates isolated sessions per client (no leakage)', async () => {
  const a = await sm.getOrCreateSession({ callSid: 'CA1', clientId: 'clinic_a', to: '+919000000001' });
  sm.appendUserTurn(a, 'I want a cleaning');
  await sm.saveSession(a);

  // Same CallSid but different client must NOT see clinic_a's history.
  const b = await sm.getOrCreateSession({ callSid: 'CA1', clientId: 'salon_b', to: '+919000000002' });
  assert.strictEqual(b.history.length, 0);
  assert.strictEqual(b.clientId, 'salon_b');

  // Reloading clinic_a keeps its history.
  const a2 = await sm.getOrCreateSession({ callSid: 'CA1', clientId: 'clinic_a' });
  assert.strictEqual(a2.history.length, 1);
});

test('appendUserTurn tracks repeats', async () => {
  const s = await sm.getOrCreateSession({ callSid: 'CA2', clientId: 'clinic_a' });
  sm.appendUserTurn(s, 'hello');
  assert.strictEqual(s.repeatCount, 0);
  sm.appendUserTurn(s, 'hello');
  assert.strictEqual(s.repeatCount, 1);
  sm.appendUserTurn(s, 'something else');
  assert.strictEqual(s.repeatCount, 0);
});

test('history is trimmed to MAX_HISTORY_TURNS*2', async () => {
  const s = await sm.getOrCreateSession({ callSid: 'CA3', clientId: 'clinic_a' });
  for (let i = 0; i < 50; i++) {
    sm.appendUserTurn(s, `msg ${i}`);
    sm.appendAssistantTurn(s, `reply ${i}`);
  }
  await sm.saveSession(s);
  const reloaded = await sm.getOrCreateSession({ callSid: 'CA3', clientId: 'clinic_a' });
  assert.ok(reloaded.history.length <= 24); // default MAX_HISTORY_TURNS=12 -> 24
});
