const test = require('node:test');
const assert = require('node:assert/strict');
const places = require('../src/services/places');

const at = (lat, lng) => ({ latitude: lat, longitude: lng });

test('Namensabgleich ignoriert Allerweltswörter und Akzente', () => {
  assert.deepEqual(places.tokens('Hotel Barceló Fuerteventura & Spa'), ['barcelo', 'fuerteventura', 'spa']);
  assert.equal(places.nameMatch('Playitas Hotel', 'Playitas Hotel'), 2);
  assert.equal(places.nameMatch('Playitas Hotel', 'Hotel Playitas'), 2);
  assert.equal(places.nameMatch('Playitas Hotel', 'Playitas Aparthotel'), 1);
  assert.equal(places.nameMatch('Aktivhotel Santa Lucia', 'AktivHotel SantaLucia'), 2, 'zusammengeschrieben');
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

test('Ohne eigene Koordinaten: eindeutig nur bei Land, Ort/PLZ und bestem Namen', () => {
  const cand = (id, name, address, country = 'ES', loc = at(28.2, -13.9)) => ({ id, displayName: { text: name }, formattedAddress: address, location: loc, addressComponents: [{ types: ['country'], shortText: country }] });
  const entity = { name: 'Playitas Hotel', city: 'Las Playitas', country: 'ES', lat: null, lng: null };
  const one = places.rank(entity, [cand('h', 'Playitas Hotel', 'Calle X 1, 35629 Las Playitas, Spanien'), cand('a', 'Playitas Aparthotel', 'Calle Y, 35629 Las Playitas, Spanien')]);
  assert.equal(places.pickWithoutCoords(entity, one.candidates).id, 'h', 'gleicher Name schlägt Teilübereinstimmung');
  assert.deepEqual(one.candidates[0].location, { lat: 28.2, lng: -13.9 });
  const otherCountry = places.rank(entity, [cand('p', 'Playitas Hotel', 'Rua 1, Lagos, Portugal', 'PT')]);
  assert.equal(places.pickWithoutCoords(entity, otherCountry.candidates), null, 'falsches Land');
  const otherTown = places.rank(entity, [cand('t', 'Playitas Hotel', 'Calle 2, 35600 Puerto del Rosario, Spanien')]);
  assert.equal(places.pickWithoutCoords(entity, otherTown.candidates), null, 'Ort passt nicht');
  assert.equal(places.pickWithoutCoords(entity, otherTown.candidates, { postalCode: '35600' }).id, 't', 'Postleitzahl der Website-Anschrift passt');
  const twins = places.rank(entity, [cand('a', 'Playitas Hotel', 'Calle 1, Las Playitas'), cand('b', 'Hotel Playitas', 'Calle 3, Las Playitas')]);
  assert.equal(places.pickWithoutCoords(entity, twins.candidates), null, 'Gleichstand');
  const partialAlone = places.rank(entity, [cand('a', 'Playitas Aparthotel', 'Calle Y, Las Playitas')]);
  assert.equal(places.pickWithoutCoords(entity, partialAlone.candidates).id, 'a', 'Teilübereinstimmung als einziger Treffer');
});
