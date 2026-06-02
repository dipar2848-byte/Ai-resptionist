const { test } = require('node:test');
const assert = require('node:assert');
const {
  getTenantByNumber,
  getTenantById,
  numbersMatch,
  normalizeNumber,
  listTenants,
} = require('../lib/tenants/tenantStore');

test('normalizeNumber strips formatting but keeps +', () => {
  assert.strictEqual(normalizeNumber('+91 90000 00001'), '+919000000001');
  assert.strictEqual(normalizeNumber('919000000001'), '919000000001');
});

test('numbersMatch tolerates formatting and country code', () => {
  assert.ok(numbersMatch('+919000000001', '919000000001'));
  assert.ok(numbersMatch('+91 90000 00001', '+919000000001'));
  assert.ok(!numbersMatch('+919000000001', '+919000000002'));
});

test('getTenantByNumber routes to correct tenant', () => {
  const t = getTenantByNumber('+919000000001');
  assert.ok(t);
  assert.strictEqual(t.client_id, 'clinic_a');

  const t2 = getTenantByNumber('919000000002');
  assert.strictEqual(t2.client_id, 'salon_b');
});

test('getTenantByNumber returns null for unknown number', () => {
  assert.strictEqual(getTenantByNumber('+10000000000'), null);
});

test('getTenantById works and listTenants returns all', () => {
  assert.strictEqual(getTenantById('clinic_a').business_name, 'Example Dental Clinic');
  assert.ok(listTenants().length >= 2);
});
