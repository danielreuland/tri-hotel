const test = require('node:test');
const assert = require('node:assert/strict');
const { RETENTION } = require('../src/services/retention');

test('retention: alle in der Datenschutzerklärung genannten Fristen sind gesetzt', () => {
  for (const k of ['ipHashDays', 'submitterMonths', 'emailLogMonths', 'contactMonths', 'inquiryMonths', 'consentYearsAfterEnd']) {
    assert.ok(Number.isInteger(RETENTION[k]) && RETENTION[k] > 0, k);
  }
});

test('reviews.stayMonth: nur Monate der letzten drei Jahre, nicht in der Zukunft', () => {
  const reviews = require('../src/services/reviews');
  const now = new Date(Date.UTC(2026, 9, 15));
  assert.equal(reviews.stayMonth('2026-03', now).toISOString().slice(0, 10), '2026-03-01');
  assert.equal(reviews.stayMonth('2026-11', now), null, 'Zukunft');
  assert.equal(reviews.stayMonth('2023-09', now), null, 'älter als drei Jahre');
  assert.equal(reviews.stayMonth('2023-10', now).toISOString().slice(0, 10), '2023-10-01');
  assert.equal(reviews.stayMonth('kaputt', now), null);
});
