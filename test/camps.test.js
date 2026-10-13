const test = require('node:test');
const assert = require('node:assert/strict');
const camps = require('../src/services/camps');

test('camps.flag: ja/nein/unbekannt, Flug „über Partner“ zählt als buchbar', () => {
  const p = { features: { beginner: true, women: false, flight: 'partner' } };
  assert.equal(camps.flag(p, 'beginner'), true);
  assert.equal(camps.flag(p, 'women'), false);
  assert.equal(camps.flag(p, 'swim'), null);
  assert.equal(camps.flag(p, 'flight'), true);
  assert.equal(camps.flag({ features: { flight: 'unknown' } }, 'flight'), null);
});

test('camps.parseFilters: nur bekannte Typen und Merkmale', () => {
  const f = camps.parseFilters({ typ: 'coach', region: 'Mallorca', merkmal: ['beginner', 'hack'] });
  assert.deepEqual(f, { model: 'coach', region: 'Mallorca', flags: ['beginner'], active: true });
  assert.equal(camps.parseFilters({ typ: 'x' }).active, false);
});

test('camps.outboundUrl: Kampagnenkennung anhängen, vorhandene nicht überschreiben, Partner-Link bevorzugen', () => {
  const u = new URL(camps.outboundUrl({ website: 'https://coach.example/camps?x=1' }, 'tri-hotel.de'));
  assert.equal(u.searchParams.get('utm_source'), 'tri-hotel.de');
  assert.equal(u.searchParams.get('x'), '1');
  assert.equal(camps.outboundUrl({ website: 'https://a.example/?utm_source=partner' }), 'https://a.example/?utm_source=partner');
  assert.match(camps.outboundUrl({ website: 'https://a.example/', partner: true, partner_url: 'https://aff.example/r?id=7' }), /^https:\/\/aff\.example\/r\?id=7/);
});
