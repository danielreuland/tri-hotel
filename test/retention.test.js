const test = require('node:test');
const assert = require('node:assert/strict');
const { RETENTION } = require('../src/services/retention');

test('retention: alle in der Datenschutzerklärung genannten Fristen sind gesetzt', () => {
  for (const k of ['ipHashDays', 'submitterMonths', 'emailLogMonths', 'contactMonths', 'inquiryMonths', 'consentYearsAfterEnd']) {
    assert.ok(Number.isInteger(RETENTION[k]) && RETENTION[k] > 0, k);
  }
});
