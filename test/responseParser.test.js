const { test } = require('node:test');
const assert = require('node:assert');
const { parseAiResponse } = require('../lib/ai/responseParser');

test('parses clean JSON', () => {
  const raw = JSON.stringify({
    reply: 'Sure, what time?',
    intent: 'booking',
    needs_followup: true,
    missing_fields: ['datetime'],
    booking: { name: 'Sam', service: 'cleaning', datetime: null },
    end_call: false,
  });
  const { ok, data } = parseAiResponse(raw);
  assert.ok(ok);
  assert.strictEqual(data.intent, 'booking');
  assert.deepStrictEqual(data.missing_fields, ['datetime']);
  assert.strictEqual(data.booking.name, 'Sam');
});

test('strips code fences', () => {
  const raw = '```json\n{"reply":"Hello","intent":"faq","needs_followup":false,"missing_fields":[],"booking":{},"end_call":false}\n```';
  const { ok, data } = parseAiResponse(raw);
  assert.ok(ok);
  assert.strictEqual(data.reply, 'Hello');
});

test('extracts JSON from surrounding prose', () => {
  const raw = 'Here you go: {"reply":"Hi there","intent":"faq","needs_followup":false} thanks';
  const { ok, data } = parseAiResponse(raw);
  assert.ok(ok);
  assert.strictEqual(data.reply, 'Hi there');
});

test('normalizes invalid intent to faq', () => {
  const raw = '{"reply":"ok","intent":"weird","needs_followup":false}';
  const { data } = parseAiResponse(raw);
  assert.strictEqual(data.intent, 'faq');
});

test('filters invalid missing_fields', () => {
  const raw = '{"reply":"ok","intent":"booking","missing_fields":["name","banana"]}';
  const { data } = parseAiResponse(raw);
  assert.deepStrictEqual(data.missing_fields, ['name']);
});

test('fails on non-JSON / missing reply', () => {
  assert.strictEqual(parseAiResponse('not json at all').ok, false);
  assert.strictEqual(parseAiResponse('{"intent":"faq"}').ok, false);
});
