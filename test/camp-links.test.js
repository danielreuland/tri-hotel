const test = require('node:test');
const assert = require('node:assert/strict');
const camps = require('../src/services/camps');

const entities = [
  { id: 'a', name: 'Club La Santa', city: 'Tinajo' },
  { id: 'b', name: 'Playitas Hotel', city: 'Las Playitas' },
  { id: 'c', name: 'Playitas Aparthotel', city: 'Las Playitas' },
  { id: 'd', name: 'Aktivhotel Santa Lucia', city: 'Torbole' },
];

test('suggestEntity: gleicher Name trotz „Hotel“, Akzenten und Schreibweise', () => {
  assert.equal(camps.suggestEntity({ hotel_name: 'Hotel Club La Santa' }, entities).entity.id, 'a');
  assert.equal(camps.suggestEntity({ hotel_name: 'Aktivhotel SantaLucía' }, entities).entity.id, 'd');
  assert.equal(camps.suggestEntity({ hotel_name: 'Club La Santa' }, entities).exact, true);
});

test('suggestEntity: mehrdeutig ohne Ort → kein Vorschlag, mit passendem Ort → der Treffer im Ort', () => {
  const two = [{ id: 'x', name: 'Seehotel', city: 'Kaprun' }, { id: 'y', name: 'Seehotel', city: 'Fuschl' }];
  assert.equal(camps.suggestEntity({ hotel_name: 'Seehotel' }, two), null);
  assert.equal(camps.suggestEntity({ hotel_name: 'Seehotel', place: 'Fuschl' }, two).entity.id, 'y');
});

test('suggestEntity: nichts Passendes → null', () => {
  assert.equal(camps.suggestEntity({ hotel_name: 'Hotel Bergblick', place: 'Oberstdorf' }, entities), null);
  assert.equal(camps.suggestEntity({ hotel_name: '' }, entities), null);
});
