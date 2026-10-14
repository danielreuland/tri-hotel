const test = require('node:test');
const assert = require('node:assert/strict');
const places = require('../src/services/places');

const at = (lat, lng) => ({ latitude: lat, longitude: lng });

test('Namensabgleich ignoriert Allerweltswörter und Akzente', () => {
  assert.deepEqual(places.tokens('Hotel Barceló Fuerteventura & Spa'), ['barcelo', 'fuerteventura', 'spa']);
  assert.equal(places.nameMatch('Playitas Hotel', 'Playitas Hotel'), 2);
  assert.equal(places.nameMatch('Playitas Hotel', 'Hotel Playitas'), 2);
  assert.equal(places.nameMatch('Playitas Hotel', 'Playitas Aparthotel'), 1);
  assert.equal(places.nameMatch('Playitas Hotel', 'Mercadona'), 0);
});

test('Eindeutiger Treffer: nah, Name passt, kein gleich guter Konkurrent', () => {
  const entity = { name: 'Playitas Hotel', lat: 28.2290, lng: -13.9850 };
  const r = places.rank(entity, [
    { id: 'apart', displayName: { text: 'Playitas Aparthotel' }, location: at(28.2291, -13.9851) },
    { id: 'hotel', displayName: { text: 'Playitas Hotel' }, location: at(28.2292, -13.9849) },
    { id: 'far', displayName: { text: 'Playitas Hotel' }, location: at(28.30, -13.90) },
  ]);
  assert.equal(r.pick.id, 'hotel', 'genaue Namensgleichheit schlägt Teilübereinstimmung');
  assert.ok(r.candidates.find((c) => c.id === 'far').distanceM > places.MAX_DISTANCE_M);
});

test('Kein Vorschlag bei Gleichstand, großer Entfernung oder fehlenden Koordinaten', () => {
  const twins = places.rank({ name: 'Hotel Jakob', lat: 47.5, lng: 12.1 }, [
    { id: 'a', displayName: { text: 'Hotel Jakob' }, location: at(47.5001, 12.1) },
    { id: 'b', displayName: { text: 'Jakob Hotel' }, location: at(47.5, 12.1001) },
  ]);
  assert.equal(twins.pick, null);
  const far = places.rank({ name: 'Hotel Jakob', lat: 47.5, lng: 12.1 }, [{ id: 'a', displayName: { text: 'Hotel Jakob' }, location: at(47.51, 12.1) }]);
  assert.equal(far.pick, null);
  const noCoords = places.rank({ name: 'Hotel Jakob', lat: null, lng: null }, [{ id: 'a', displayName: { text: 'Hotel Jakob' }, location: at(47.5, 12.1) }]);
  assert.equal(noCoords.pick, null);
  assert.equal(noCoords.candidates[0].distanceM, null);
});
