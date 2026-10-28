const test = require('node:test');
const assert = require('node:assert/strict');
const partners = require('../src/services/partners');

const booking = { domains: ['booking.com'], link_params: { aid: '123' }, link_template: null };

test('Partnerlinks: nur https und nur erlaubte Domains', () => {
  assert.equal(partners.allowedUrl(booking, 'https://www.booking.com/hotel/es/x.html'), 'https://www.booking.com/hotel/es/x.html');
  assert.equal(partners.allowedUrl(booking, 'http://www.booking.com/hotel/es/x.html'), null);
  assert.equal(partners.allowedUrl(booking, 'https://evil-booking.com/x'), null);
  assert.equal(partners.allowedUrl(booking, 'https://booking.com.evil.net/x'), null);
  assert.equal(partners.allowedUrl({ domains: [] }, 'https://hotel-beispiel.es/buchen'), 'https://hotel-beispiel.es/buchen');
  assert.equal(partners.allowedUrl(booking, 'kein link'), null);
});

test('Partnerlinks: Kennung anhängen oder Netzwerk-Vorlage verwenden', () => {
  assert.equal(partners.buildUrl(booking, 'https://www.booking.com/hotel/es/x.html?lang=de'), 'https://www.booking.com/hotel/es/x.html?lang=de&aid=123');
  assert.equal(partners.buildUrl(booking, 'https://www.booking.com/x.html?aid=999'), 'https://www.booking.com/x.html?aid=999', 'vorhandene Kennung bleibt');
  const awin = { link_template: 'https://www.awin1.com/cread.php?awinmid=1&awinaffid=2&ued={url_enc}' };
  assert.equal(partners.buildUrl(awin, 'https://www.holidaycheck.de/hi/x/1?a=b'),
    'https://www.awin1.com/cread.php?awinmid=1&awinaffid=2&ued=https%3A%2F%2Fwww.holidaycheck.de%2Fhi%2Fx%2F1%3Fa%3Db');
  assert.equal(partners.monetized({ link_params: {} }), false);
  assert.equal(partners.monetized(booking), true);
});

test('Suchseite des Anbieters für Objekte ohne eigenen Link', () => {
  const p = { search_url: 'https://www.expedia.de/Hotel-Search?destination={q}' };
  assert.equal(partners.searchUrl(p, { name: 'Playitas Hotel', city: 'Las Playitas' }), 'https://www.expedia.de/Hotel-Search?destination=Playitas%20Hotel%20Las%20Playitas');
  assert.equal(partners.searchUrl({ search_url: 'https://x.de/suche' }, { name: 'A' }), null, 'ohne {q} kein Suchlink');
  assert.equal(partners.searchUrl({ search_url: null }, { name: 'A' }), null);
  // mit Partnerkennung wird der Suchlink wie jeder andere Link ergänzt
  const url = partners.buildUrl({ link_params: { affcid: 'X1' } }, partners.searchUrl(p, { name: 'Café & Bar', city: null }));
  assert.match(url, /destination=Caf%C3%A9(\+|%20)%26(\+|%20)Bar/);
  assert.match(url, /affcid=X1/);
});

test('Partnerlinks gruppieren: Weiterleitung über /go oder direkt (z. B. Expedia), Markenhinweis', () => {
  const awin = 'https://www.awin1.com/cread.php?awinmid=1&awinaffid=2&ued={url_enc}';
  const groups = partners.groupLinks([
    { code: 'expedia', name: 'Expedia', kind: 'booking', url: 'https://www.expedia.de/Hotel-Search?destination=X', link_template: awin, direct_link: true, trademark_notice: 'EXPEDIA ist eine Marke …', monetized: true },
    { code: 'tripadvisor', name: 'Tripadvisor', kind: 'reviews', url: 'https://www.tripadvisor.de/Search?q=X', direct_link: false, monetized: false },
  ], 'hotel-x');
  const ex = groups.find((g) => g.code === 'expedia');
  assert.match(ex.href.booking, /^https:\/\/www\.awin1\.com\/cread\.php\?awinmid=1&awinaffid=2&ued=https%3A%2F%2Fwww\.expedia\.de/);
  assert.equal(ex.count.booking, '/go/hotel-x/expedia/klick');
  assert.equal(ex.trademark_notice, 'EXPEDIA ist eine Marke …');
  const ta = groups.find((g) => g.code === 'tripadvisor');
  assert.equal(ta.href.reviews, '/go/hotel-x/tripadvisor/bewertungen');
  assert.equal(ta.count.reviews, null);
});

test('CJ-Deeplink: Zieladresse kodiert, Objekt-Slug als sid', () => {
  const p = { link_template: 'https://www.tkqlhce.com/click-101907930-13904715?url={url_enc}&sid={slug}' };
  const target = partners.searchUrl({ search_url: 'https://www.expedia.de/Hotel-Search?destination={q}' }, { name: 'Playitas Hotel', city: 'Las Playitas' });
  assert.equal(partners.buildUrl(p, target, { slug: 'playitas-hotel-las-playitas' }),
    'https://www.tkqlhce.com/click-101907930-13904715?url=https%3A%2F%2Fwww.expedia.de%2FHotel-Search%3Fdestination%3DPlayitas%2520Hotel%2520Las%2520Playitas&sid=playitas-hotel-las-playitas');
  assert.equal(partners.buildUrl(p, target), partners.buildUrl(p, target, { slug: '' }), 'ohne Slug bleibt sid leer');
});

test('Partnerlink aus Nummer (Expedia-Hotel-ID)', () => {
  const ex = { id_url: 'https://www.expedia.de/h{id}.Hotel-Information', domains: ['expedia.de'] };
  assert.equal(partners.fromId(ex, ' 793891 '), 'https://www.expedia.de/h793891.Hotel-Information');
  assert.equal(partners.allowedUrl(ex, partners.fromId(ex, '793891')), 'https://www.expedia.de/h793891.Hotel-Information');
  assert.equal(partners.fromId(ex, 'https://www.expedia.de/x.h1.Hotel-Information'), 'https://www.expedia.de/x.h1.Hotel-Information', 'Adresse bleibt Adresse');
  assert.equal(partners.fromId({ id_url: null }, '793891'), '793891', 'ohne Vorlage keine Umwandlung');
});

test('Partner: Nummer von einem anderen Programm übernehmen (Hotels.com ← Expedia, gleiche Hotel-IDs)', () => {
  const expedia = { id_url: 'https://www.expedia.de/h{id}.Hotel-Information' };
  const hotelscom = { id_url: 'https://de.hotels.com/h{id}.Hotel-Information' };
  assert.equal(partners.idOf(expedia, 'https://www.expedia.de/h1786689.Hotel-Information'), '1786689');
  assert.equal(partners.idOf(expedia, 'https://www.expedia.de/Las-Playitas-Hotels-Playitas.h1786689.Hotel-Information?chkin=2026-11-01'), '1786689');
  assert.equal(partners.idOf(expedia, 'https://www.expedia.de/Hotel-Search?destination=Mallorca'), null);
  assert.equal(partners.idOf({ id_url: null }, 'https://www.expedia.de/h1.Hotel-Information'), null);
  assert.equal(partners.derivedUrl(hotelscom, expedia, 'https://www.expedia.de/h1786689.Hotel-Information'), 'https://de.hotels.com/h1786689.Hotel-Information');
  assert.equal(partners.derivedUrl(hotelscom, expedia, 'https://www.expedia.de/Hotel-Search'), null);
});

test('Partner: Nummer aus einem Parameter (CHECK24 c24pp_hotel_id), auch mitten in langen Adressen', () => {
  const check24 = { id_url: 'https://www.check24.net/pauschalreisen-vergleich/?c24pp_hotel_id={id}' };
  const long = 'https://www.check24.net/pauschalreisen-vergleich/?c24pp_departure_date=2026-11-05&c24pp_hotel_id=18002&c24pp_region_id=552#/suche/angebot?hotelId=18002';
  assert.equal(partners.idOf(check24, long), '18002');
  assert.equal(partners.idOf(check24, 'https://www.check24.net/pauschalreisen-vergleich/?c24pp_hotel_id=18002'), '18002');
  assert.equal(partners.idOf(check24, 'https://www.check24.net/pauschalreisen-vergleich/?x_c24pp_hotel_id=18002'), null);
  assert.equal(partners.idOf(check24, 'https://www.check24.net/pauschalreisen-vergleich/?c24pp_region_id=552'), null);
  // Adresse von urlaub.check24.de: Nummer steht als hotelId (gleiche Nummern wie c24pp_hotel_id)
  const withAlias = { ...check24, id_params: ['hotelId'] };
  const urlaub = 'https://urlaub.check24.de/suche/angebot?airport=FRA,HHN&departureDate=2027-01-20&pageArea=package&hotelId=5116&ds=h&noRedirect=1';
  assert.equal(partners.idOf(check24, urlaub), null, 'ohne id_params nicht erkannt');
  assert.equal(partners.idOf(withAlias, urlaub), '5116');
  assert.equal(partners.idOf(withAlias, 'https://www.check24.net/pauschalreisen-vergleich/?c24pp_hotel_id=18002#/suche/angebot?hotelId=18002'), '18002');
  assert.equal(partners.idOf(withAlias, 'https://urlaub.check24.de/suche/angebot?myhotelId=5116'), null);
  // Link wie aus dem CHECK24-Linkgenerator (kurze Form eingegeben), Tracking-ID am Ende
  const c24 = { id_url: 'https://www.check24.net/pauschalreisen-vergleich/?c24pp_hotel_id={id}&pid=1179734',
    link_template: 'https://a.check24.net/misc/click.php?aid=18&pid=1179734&target_url={url_enc}&tid={slug}' };
  const target = partners.fromId(c24, partners.idOf(c24, long));
  assert.equal(target, 'https://www.check24.net/pauschalreisen-vergleich/?c24pp_hotel_id=18002&pid=1179734');
  assert.equal(partners.idOf(c24, target), '18002');
  assert.equal(partners.buildUrl(c24, target, { slug: 'playitas-hotel-las-playitas' }),
    'https://a.check24.net/misc/click.php?aid=18&pid=1179734&target_url=https%3A%2F%2Fwww.check24.net%2Fpauschalreisen-vergleich%2F%3Fc24pp_hotel_id%3D18002%26pid%3D1179734&tid=playitas-hotel-las-playitas');
});

test('Partner: Nummer mit festem Präfix im Parameter (trivago search=100-{id}), Reisedaten fallen weg', () => {
  const trivago = { id_url: 'https://www.trivago.de/de/srl?search=100-{id}', domains: ['trivago.de'],
    link_template: 'https://www.awin1.com/cread.php?awinmid=105923&awinaffid=3127993&clickref={slug}&ued={url_enc}' };
  const full = 'https://www.trivago.de/de/lm/playitas-hotel-sports-resort-las-playitas?search=100-179546;dr-20261117-20261122;drs-40#accommodation-overlay';
  assert.equal(partners.idOf(trivago, full), '179546');
  assert.equal(partners.idOf(trivago, 'https://www.trivago.de/de/srl?search=100-179546'), '179546');
  assert.equal(partners.idOf(trivago, 'https://www.trivago.de/de/lm/x?search=100-179546%3Bdr-20261117-20261122'), '179546', 'Semikolon kodiert');
  assert.equal(partners.idOf(trivago, 'https://www.trivago.de/de/srl?search=200-14328'), null, 'anderer Präfix (Ort statt Unterkunft)');
  assert.equal(partners.idOf(trivago, 'https://www.trivago.de/de/srl?search=100-179546x'), null);
  assert.equal(partners.fromId(trivago, '179546'), 'https://www.trivago.de/de/srl?search=100-179546');
  assert.equal(partners.fromId(trivago, ' 100-179546 '), 'https://www.trivago.de/de/srl?search=100-179546', 'Nummer mit Präfix');
  assert.equal(partners.fromId(trivago, '200-179546'), '200-179546', 'fremder Präfix bleibt Eingabe (wird dann abgelehnt)');
  const target = partners.fromId(trivago, partners.idOf(trivago, full));
  assert.equal(partners.allowedUrl(trivago, target), target);
  assert.equal(partners.buildUrl(trivago, target, { slug: 'playitas-hotel-las-playitas' }),
    'https://www.awin1.com/cread.php?awinmid=105923&awinaffid=3127993&clickref=playitas-hotel-las-playitas&ued=https%3A%2F%2Fwww.trivago.de%2Fde%2Fsrl%3Fsearch%3D100-179546');
  // Vorlagen ohne Präfix verhalten sich wie bisher
  const check24 = { id_url: 'https://www.check24.net/pauschalreisen-vergleich/?c24pp_hotel_id={id}' };
  assert.equal(partners.fromId(check24, '18002'), 'https://www.check24.net/pauschalreisen-vergleich/?c24pp_hotel_id=18002');
  assert.equal(partners.idOf(check24, 'https://www.check24.net/pauschalreisen-vergleich/?c24pp_hotel_id=18002;x'), '18002');
});

test('Partner: hotel.de – Nummer aus Detailseite (hn) oder Ergebnisliste (hotelTeaserKey[0]), Reisedaten fallen weg', () => {
  const hotelde = { id_url: 'https://www.hotel.de/de/detail?hn={id}', id_params: ['hotelTeaserKey[0]'], domains: ['hotel.de'],
    link_template: 'https://www.awin1.com/cread.php?awinmid=16018&awinaffid=3127993&clickref={slug}&ued={url_enc}' };
  const detail = 'https://www.hotel.de/de/detail?hn=251368&location=%25187875&startDateDay=28&startDateMonth=10&startDateYear=2026&currency=EUR&rooms=1&numberOfAdults%5B0%5D=1';
  const list = 'https://www.hotel.de/de/list?location=%25187875&hotelTeaserKey%5B0%5D=251368&perimeter=30&orderBy=Recommendations';
  assert.equal(partners.idOf(hotelde, detail), '251368');
  assert.equal(partners.idOf(hotelde, list), '251368', 'kodierte Klammern');
  assert.equal(partners.idOf(hotelde, 'https://www.hotel.de/de/list?hotelTeaserKey[0]=251368'), '251368');
  assert.equal(partners.idOf(hotelde, 'https://www.hotel.de/de/list?hotelTeaserKey%5B1%5D=251368'), null, 'nur der erste Treffer');
  assert.equal(partners.idOf(hotelde, 'https://www.hotel.de/de/list?location=%25187875'), null, 'Ort ist keine Hotelnummer');
  assert.equal(partners.idOf(hotelde, 'https://www.hotel.de/de/list?q=%ZZ&hotelTeaserKey[0]=251368'), '251368', 'kaputte Kodierung wirft nicht');
  const target = partners.fromId(hotelde, partners.idOf(hotelde, list));
  assert.equal(target, 'https://www.hotel.de/de/detail?hn=251368');
  assert.equal(partners.buildUrl(hotelde, target, { slug: 'playitas-hotel-las-playitas' }),
    'https://www.awin1.com/cread.php?awinmid=16018&awinaffid=3127993&clickref=playitas-hotel-las-playitas&ued=https%3A%2F%2Fwww.hotel.de%2Fde%2Fdetail%3Fhn%3D251368');
});

test('Anbieterlogos: Adresse nur für eigene Upload-Dateinamen, Kurzbeschriftung neben dem Logo', () => {
  assert.equal(partners.logoUrl('trivago-1730000000000.svg'), '/partner-logo/trivago-1730000000000.svg');
  assert.equal(partners.logoUrl('../etc/passwd'), null);
  assert.equal(partners.logoUrl('x.gif'), null);
  assert.equal(partners.logoUrl(null), null);
  assert.equal(partners.shortLabel('Preise prüfen bei Expedia', 'Expedia'), 'Preise prüfen');
  assert.equal(partners.shortLabel('Pauschalreise mit Flug bei CHECK24', 'CHECK24'), 'Pauschalreise mit Flug');
  assert.equal(partners.shortLabel('Pauschalreise mit Flug bei CHECK24', 'CHECK24 Pauschalreise'), 'Pauschalreise mit Flug');
  assert.equal(partners.shortLabel('Preise bei Tripadvisor', 'Expedia'), 'Preise bei Tripadvisor', 'fremder Name bleibt stehen');
  assert.equal(partners.shortLabel('Preise vergleichen bei trivago', 'trivago'), 'Preise vergleichen');
  assert.equal(partners.shortLabel('Zum Angebot', 'trivago'), 'Zum Angebot', 'ohne Anbieternamen bleibt die Beschriftung');
  const [g] = partners.groupLinks([{ code: 'trivago', name: 'trivago', kind: 'booking', url: 'https://www.trivago.de/x',
    label_booking: 'Preise vergleichen bei trivago', logo_file: 'trivago-1.svg', direct_link: true, monetized: true }], 'hotel-x');
  assert.equal(g.logo, '/partner-logo/trivago-1.svg');
  assert.equal(g.short_booking, 'Preise vergleichen');
});

test('Logo-Upload: SVG mit aktiven Inhalten wird abgelehnt', () => {
  const { unsafeSvg } = require('../src/routes/admin-partners');
  assert.equal(unsafeSvg('<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h10v10z" fill="#08f"/></svg>'), false);
  assert.equal(unsafeSvg('<svg><script>alert(1)</script></svg>'), true);
  assert.equal(unsafeSvg('<svg onload="x()"></svg>'), true);
  assert.equal(unsafeSvg('<svg><a xlink:href="javascript:x()"></a></svg>'), true);
  assert.equal(unsafeSvg('<svg><use xlink:href="https://evil.example/x.svg#a"/></svg>'), true);
  assert.equal(unsafeSvg('<svg><use xlink:href="#a"/></svg>'), false);
});
