const test = require('node:test');
const assert = require('node:assert/strict');
const req = require('../src/services/camp-requests');

const now = new Date('2026-10-20T10:00:00Z');
const regions = [{ slug: 'mallorca', name: 'Mallorca' }, { slug: 'lanzarote', name: 'Lanzarote' }];
const base = { kind: 'private', period_month: '2027-03', persons: '4', rooms_double: '2' };

test('validateWishes: Zimmer müssen für alle reichen, Gruppe braucht einen Namen', () => {
  assert.deepEqual(req.validateWishes(base, { regions, now }).errors, []);
  assert.match(req.validateWishes({ ...base, rooms_double: '1' }, { regions, now }).errors.join(), /Zimmer reichen nicht/);
  assert.deepEqual(req.validateWishes({ ...base, rooms_double: '' }, { regions, now }).errors, [], 'ohne Zimmerangabe kein Fehler');
  assert.match(req.validateWishes({ ...base, kind: 'group' }, { regions, now }).errors.join(), /Vereins/);
  const g = req.validateWishes({ ...base, kind: 'group', club_name: 'Tri Club Nord', invoice_to_club: 'on', exclusive: 'own' }, { regions, now });
  assert.deepEqual(g.errors, []);
  assert.equal(g.wishes.invoice_to_club, true);
  assert.equal(req.validateWishes({ ...base, club_name: 'X' }, { regions, now }).wishes.club_name, null, 'Vereinsfelder nur bei Gruppe');
});

test('validateWishes: ungültige Werte fallen weg (Region, Fokus, Budget)', () => {
  const w = req.validateWishes({ ...base, destination: 'mond', focus: ['swim', 'hack'], budget_pp: '1.200 €' }, { regions, now }).wishes;
  assert.equal(w.destination, null);
  assert.deepEqual(w.focus, ['swim']);
  assert.equal(w.budget_pp, 1200, 'Punkt als Tausendertrenner');
  assert.equal(req.validateWishes({ ...base, budget_pp: '1200' }, { regions, now }).wishes.budget_pp, 1200);
});

const P = (id, name, extra = {}) => ({ id, name, status: 'active', contact_email: `${id}@x.de`, regions: [], destinations: [], features: {}, model: 'coach', ...extra });

test('rankProviders: nur nach Passung, Partnerstatus egal; Ziel schließt andere Regionen aus; ohne Adresse nicht wählbar', () => {
  const providers = [
    P('a', 'Alpha', { regions: ['Mallorca'], lead_active: true, lead_email: 'a@x.de' }),
    P('b', 'Beta', { regions: ['Mallorca'], match_months: [3], features: { swim: true } }),
    P('c', 'Gamma', { regions: ['Lanzarote'] }),
    P('d', 'Delta', { regions: ['Mallorca'], contact_email: null }),
  ];
  const w = req.validateWishes({ ...base, destination: 'mallorca', focus: ['swim'] }, { regions, now }).wishes;
  const ranked = req.rankProviders(providers, w, { regionName: 'Mallorca', monthNo: 3 });
  assert.deepEqual(ranked.map((p) => p.id), ['b', 'a'], 'Beta passt besser (Monat + Schwimmen), obwohl Alpha Partner ist');
  assert.ok(ranked[0].match.reasons.includes('Termin im Wunschmonat'));
});

test('scoreProvider: Hotel der Anfrage zählt stark, Gruppengröße und Vereinscamps werden berücksichtigt', () => {
  const w = req.validateWishes({ ...base, kind: 'group', club_name: 'TC', persons: '20', exclusive: 'own' }, { regions, now }).wishes;
  const inHotel = req.scoreProvider(P('h', 'H', { exclusive_groups: true }), w, { hotelProviderIds: ['h'] });
  const tooSmall = req.scoreProvider(P('s', 'S', { group_max: 12, exclusive_groups: false }), w, {});
  assert.ok(inHotel.score > tooSmall.score);
  assert.ok(inHotel.reasons.includes('Camps in diesem Hotel'));
  assert.ok(tooSmall.score < 0);
});

test('validateSelection: höchstens 5, nur angebotene Anbieter, Einwilligung und E-Mail Pflicht', () => {
  const ranked = ['1', '2', '3', '4', '5', '6'].map((id) => P(id, `A${id}`));
  const ok = req.validateSelection({ providers: ['1', '2', 'x'], name: 'Anna', email: 'anna@example.com', consent: 'on' }, ranked);
  assert.deepEqual(ok.errors, []);
  assert.deepEqual(ok.ids, ['1', '2']);
  assert.match(req.validateSelection({ providers: ['1', '2', '3', '4', '5', '6'], name: 'Anna', email: 'anna@example.com', consent: 'on' }, ranked).errors.join(), /höchstens 5/);
  assert.equal(req.validateSelection({ providers: ['1'], name: 'Anna', email: 'kaputt' }, ranked).errors.length, 2);
});

test('consentText nennt jeden Empfänger; detailLines beschreibt Zimmer und Gruppe', () => {
  assert.match(req.consentText(['Alpha', 'Beta']), /Alpha, Beta/);
  const lines = req.detailLines({ kind: 'group', club_name: 'TC Nord', contact_role: 'Trainer', rooms_double: 2, rooms_single: 1, focus: ['bike'], support: 'coach',
    hotel_wanted: 'yes', flight_wanted: 'any', budget_pp: 1400, level_range: 'Einsteiger bis LD', own_coaches: true, exclusive: 'own', invoice_to_club: true, duration_days: 8 });
  assert.ok(lines.includes('Zimmer: 2 Doppelzimmer, 1 Einzelzimmer'));
  assert.ok(lines.some((l) => l.startsWith('Gruppe/Verein: TC Nord')));
  assert.ok(lines.includes('Rechnung an den Verein'));
  assert.ok(!lines.some((l) => l.startsWith('Flug')), '„egal“ wird nicht aufgeführt');
});
