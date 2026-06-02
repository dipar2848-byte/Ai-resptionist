const { test } = require('node:test');
const assert = require('node:assert');
const edge = require('../lib/ai/edgeCases');

test('isEmptyOrNoise detects empty/noise', () => {
  assert.ok(edge.isEmptyOrNoise(''));
  assert.ok(edge.isEmptyOrNoise('...'));
  assert.ok(!edge.isEmptyOrNoise('hello'));
});

test('isAngry detects frustration', () => {
  assert.ok(edge.isAngry('this is the worst service ever'));
  assert.ok(edge.isAngry("I'm so frustrated"));
  assert.ok(!edge.isAngry('I would like to book an appointment'));
});

test('isGoodbye detects call-ending phrases', () => {
  assert.ok(edge.isGoodbye('ok thanks bye'));
  assert.ok(edge.isGoodbye("that's all"));
  assert.ok(!edge.isGoodbye('I want to ask something'));
});

test('wantsHuman detects escalation', () => {
  assert.ok(edge.wantsHuman('can I speak to a real person'));
  assert.ok(edge.wantsHuman('transfer me to an agent'));
  assert.ok(!edge.wantsHuman('what are your prices'));
});
