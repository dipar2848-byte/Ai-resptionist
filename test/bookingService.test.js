const { test } = require('node:test');
const assert = require('node:assert');
const {
  mergeBooking,
  missingSlots,
  isComplete,
  validateWithinHours,
} = require('../lib/booking/bookingService');

test('mergeBooking accumulates and never overwrites with null', () => {
  const session = { booking: { name: 'Sam', service: null, datetime: null } };
  mergeBooking(session, { service: 'cleaning' });
  assert.deepStrictEqual(session.booking, { name: 'Sam', service: 'cleaning', datetime: null });
  // null should not clobber existing value
  mergeBooking(session, { name: null });
  assert.strictEqual(session.booking.name, 'Sam');
});

test('missingSlots and isComplete', () => {
  assert.deepStrictEqual(missingSlots({ name: 'A', service: null, datetime: null }), ['service', 'datetime']);
  assert.ok(!isComplete({ name: 'A', service: 'B', datetime: null }));
  assert.ok(isComplete({ name: 'A', service: 'B', datetime: 'tomorrow 11am' }));
});

test('validateWithinHours accepts in-range times', () => {
  assert.ok(validateWithinHours('tomorrow at 11am', '10:00-18:00').valid);
  assert.ok(validateWithinHours('14:30', '10:00-18:00').valid);
});

test('validateWithinHours rejects out-of-range times', () => {
  assert.ok(!validateWithinHours('at 9am', '10:00-18:00').valid);
  assert.ok(!validateWithinHours('8pm', '10:00-18:00').valid);
});

test('validateWithinHours is permissive when time/hours unparseable', () => {
  assert.ok(validateWithinHours('sometime next week', '10:00-18:00').valid);
  assert.ok(validateWithinHours('11am', 'all day').valid);
});
