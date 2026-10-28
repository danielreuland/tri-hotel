const test = require('node:test');
const assert = require('node:assert/strict');
const dashboard = require('../src/services/dashboard');

test('dashboard.daySeries: lückenlose Tage bis heute, fehlende mit 0', () => {
  const rows = [{ day: '2026-10-26', partner: 3, camp: null }, { day: new Date('2026-10-28T00:00:00Z'), partner: '2', camp: 5 }];
  const s = dashboard.daySeries(rows, 4, new Date('2026-10-28T15:00:00Z'), ['partner', 'camp']);
  assert.deepEqual(s, [
    { day: '2026-10-25', partner: 0, camp: 0 },
    { day: '2026-10-26', partner: 3, camp: 0 },
    { day: '2026-10-27', partner: 0, camp: 0 },
    { day: '2026-10-28', partner: 2, camp: 5 },
  ]);
});

test('dashboard.coverage: fehlende Links und Anteil (übernommene Nummern zählen mit)', () => {
  const c = dashboard.coverage({ links: 20, derived: 10, absent: 5 }, 40);
  assert.equal(c.missing, 5);
  assert.equal(c.share, 75);
  assert.equal(dashboard.coverage({ links: 0, derived: 0, absent: 0 }, 0).share, 0);
  assert.equal(dashboard.coverage({ links: 30, derived: 0, absent: 15 }, 40).missing, 0);
});
