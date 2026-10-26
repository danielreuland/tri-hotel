const test = require('node:test');
const assert = require('node:assert/strict');
const basics = require('../src/services/basics');

test('Grunddaten: fehlende Website, Google-Eintrag und Koordinaten', () => {
  const full = { website: 'https://x.de', lat: 1, lng: 2, attributes: { google_place_id: 'ChIJxxxxxxxxxx' } };
  assert.deepEqual(basics.missing(full, { placesEnabled: true }), []);
  assert.deepEqual(basics.missing({ website: null, lat: null, lng: null, attributes: {} }, { placesEnabled: true }), ['website', 'place', 'coords']);
  assert.deepEqual(basics.missing({ website: null, lat: 1, lng: 2, attributes: { no_website: true, no_google_place: true } }, { placesEnabled: true }), [], '„gibt es nicht“ zählt als erledigt');
  assert.deepEqual(basics.missing({ website: 'https://x.de', lat: 1, lng: 2, attributes: {} }, { placesEnabled: false }), [], 'ohne Places-Schlüssel kein Google-Eintrag nötig');
  assert.equal(basics.describe(['place', 'coords']), 'Google-Eintrag, Koordinaten');
});

test('Grunddaten: Koordinaten-Treffer speichern oder als Vorschlag vorlegen', () => {
  const hit = (confidence, lat = 28.2290, lng = -13.9850) => ({ lat, lng, confidence, source: 'x' });
  const near = { lat: 28.2291, lng: -13.9851 };
  const far = { lat: 28.2400, lng: -13.9850 };
  assert.equal(basics.judge(hit('medium'), near).save, true, 'Namenssuche, aber vom Google-Eintrag bestätigt');
  const off = basics.judge(hit('high'), far);
  assert.equal(off.save, false, 'Abweichung vom Google-Eintrag');
  assert.ok(off.googleDistanceM > basics.CONFIRM_M);
  assert.equal(basics.judge(hit('high'), null).save, true, 'Website-Koordinaten/genaue Anschrift ohne Google');
  assert.equal(basics.judge(hit('medium'), null).save, false, 'nur Namenssuche ohne Bestätigung');
  assert.match(basics.judge(hit('low'), null).reason, /Postleitzahl/);
  assert.equal(basics.judge({ lat: null, lng: null }, near).save, false, 'nichts gefunden');
});
