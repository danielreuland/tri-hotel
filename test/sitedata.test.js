const test = require('node:test');
const assert = require('node:assert/strict');
const sitedata = require('../src/services/sitedata');
const geo = require('../src/services/geo');
const extractor = require('../src/services/extractor');

test('sitedata: JSON-LD Hotel mit Anschrift, Koordinaten, E-Mail, Ausstattung (auch in @graph)', () => {
  const html = `<script type="application/ld+json">{"@context":"https://schema.org","@graph":[
    {"@type":"Organization","name":"Kette"},
    {"@type":"Hotel","name":"Hotel Mar","email":"mailto:Info@mar.example","geo":{"@type":"GeoCoordinates","latitude":"39.84","longitude":3.12},
     "address":{"@type":"PostalAddress","streetAddress":"Carrer 1","postalCode":"07400","addressLocality":"Alcúdia","addressCountry":"ES"},
     "amenityFeature":[{"name":"Pool","value":true},{"name":"Sauna","value":false}]}]}</script>`;
  const d = sitedata.fromHtml(html);
  assert.deepEqual(d.geo[0], { lat: 39.84, lng: 3.12, kind: 'Strukturdaten' });
  assert.equal(d.addresses[0].street, 'Carrer 1');
  assert.equal(d.addresses[0].country, 'ES');
  assert.deepEqual(d.emails, ['info@mar.example']);
  assert.deepEqual(d.amenities, ['Pool']);
});

test('sitedata: Kartenlinks, eingebettete Karte, Geo-Metatag; ungültiges JSON stört nicht', () => {
  const html = `<script type="application/ld+json">{kaputt</script>
    <a href="https://www.google.com/maps/place/Hotel/@28.2294926,-13.9886535,17z">Karte</a>
    <iframe src="https://www.google.com/maps/embed?pb=!1m18!2d13.3025009!3d47.7965744!2m3"></iframe>
    <a href="https://maps.google.de/maps?q=47.1%2C11.2&amp;z=3">x</a>
    <meta name="geo.position" content="40.5;-3.7">`;
  const d = sitedata.fromHtml(html);
  const kinds = d.geo.map((g) => `${g.kind}:${g.lat},${g.lng}`);
  assert.ok(kinds.includes('Geo-Metatag:40.5,-3.7'));
  assert.ok(kinds.includes('Kartenlink:28.2294926,-13.9886535'));
  assert.ok(kinds.includes('eingebettete Karte:47.7965744,13.3025009'));
  assert.ok(kinds.includes('Kartenlink:47.1,11.2'));
  assert.equal(sitedata.validLatLng(0, 0), null);
});

test('sitedata.merge: Fundstelle je Angabe, doppelte Koordinaten nur einmal', () => {
  const m = sitedata.merge([
    { url: 'https://a/kontakt', data: { geo: [{ lat: 1.23456, lng: 2.34567, kind: 'Kartenlink' }], addresses: [], emails: ['x@a.de'], amenities: [] } },
    { url: 'https://a/', data: { geo: [{ lat: 1.23457, lng: 2.34567, kind: 'Kartenlink' }], addresses: [{ street: 'S 1', city: 'C' }], emails: ['x@a.de'], amenities: [] } },
  ]);
  assert.equal(m.geo.length, 1);
  assert.equal(m.geo[0].url, 'https://a/kontakt');
  assert.equal(m.addresses[0].url, 'https://a/');
  assert.equal(m.emails.length, 1);
});

test('geo.coreName: Gattungsbegriffe und Sterne entfernen', () => {
  assert.equal(geo.coreName('Playitas Aparthotel ****'), 'Playitas');
  assert.equal(geo.coreName('Hotel BCL Podium'), 'BCL Podium');
  assert.equal(geo.coreName('Das hohe Salve'), 'hohe Salve');
});

test('extractor.parseSitemap: URL-Liste und Index erkennen', () => {
  const plain = extractor.parseSitemap('<urlset><url><loc> https://h.example/de/spa/ </loc></url><url><loc>https://h.example/a?x=1&amp;y=2</loc></url></urlset>');
  assert.deepEqual(plain, { isIndex: false, locs: ['https://h.example/de/spa/', 'https://h.example/a?x=1&y=2'] });
  assert.equal(extractor.parseSitemap('<sitemapindex><sitemap><loc>https://h.example/s1.xml</loc></sitemap></sitemapindex>').isIndex, true);
});
