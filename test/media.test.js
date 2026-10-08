const test = require('node:test');
const assert = require('node:assert/strict');
const media = require('../src/services/media');

test('media.imgAttrs: srcset aus den erzeugten Breiten, Höhe passend, Ausschnitt bereinigt', () => {
  const m = { id: '11111111-2222-3333-4444-555555555555', width: 3000, height: 2000, variants: [640, 1280, 1920], focal: '50% 25%' };
  const a = media.imgAttrs(m);
  assert.match(a, /src="\/bild\/11111111-2222-3333-4444-555555555555-1280\.webp"/);
  assert.match(a, /640w, \/bild\/.*-1280\.webp 1280w, \/bild\/.*-1920\.webp 1920w/);
  assert.match(a, /width="1280" height="853"/);
  assert.match(a, /object-position:50% 25%/);
  assert.match(media.imgAttrs({ ...m, variants: [800], width: 800, height: 400, focal: '"><script>' }), /src="\/bild\/.*-800\.webp".*object-position:script"/);
  assert.equal(media.imgAttrs(null), '');
});

test('media.entityImgAttrs: Objektbilder unter /media, Altbestand ohne Varianten -> leer', () => {
  const img = { id: '11111111-2222-3333-4444-555555555555', width: 1600, height: 1200, variants: [640, 1280], focal: null };
  assert.match(media.entityImgAttrs(img), /src="\/media\/11111111-2222-3333-4444-555555555555-1280\.webp"/);
  assert.equal(media.entityImgAttrs({ ...img, variants: [] }), '');
  assert.equal(media.MAX_PER_ENTITY, 8);
});
