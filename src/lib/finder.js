// Hotel-Finder: Reisemonat, Wunschwetter und Lockerungsvorschläge. Reine Funktionen ohne DB.
// Das Wetter ist kein Teil des Scores – es filtert nur die Liste; die Reihenfolge bleibt der Score (Neutralität).

// Wunschwetter nach Ø-Tageshöchstwert im gewählten Monat (climate_monthly.avg_high_c)
const WEATHER = {
  warm: { label: 'warm', hint: '24–30 °C', min: 24, max: 30 },
  mild: { label: 'mild', hint: '18–24 °C', min: 18, max: 24 },
  kuehl: { label: 'kühl', hint: '12–18 °C', min: 12, max: 18 },
};
// „wenig Regen“: weniger als so viele Regentage im Monat
const LOW_RAIN_DAYS = 5;

// Monat und Wetter aus der URL. Wetter und Regen gelten nur mit Monat.
function parseTrip(query) {
  const m = Number(query.monat);
  const month = Number.isInteger(m) && m >= 1 && m <= 12 ? m : null;
  const weather = month && WEATHER[query.wetter] ? String(query.wetter) : null;
  const lowRain = Boolean(month) && ['1', 'on', 'true'].includes(String(query.regen || ''));
  return { month, weather, lowRain };
}

// Klima eines Objekts im Monat passt zum Wunsch? Ohne Klimadaten für den Monat: nein (unbekannt zählt nicht als passend)
function weatherMatches(climateRows, month, weather, lowRain) {
  const row = (climateRows || []).find((c) => Number(c.month) === month);
  if (!row) return false;
  if (weather) {
    const t = Number(row.avg_high_c);
    const band = WEATHER[weather];
    if (row.avg_high_c === null || row.avg_high_c === undefined || !(t >= band.min && t <= band.max)) return false;
  }
  if (lowRain) {
    const r = Number(row.rain_days);
    if (row.rain_days === null || row.rain_days === undefined || !(r < LOW_RAIN_DAYS)) return false;
  }
  return true;
}

// Monat filtern: mit Wetterwunsch nach dem Klima dieses Monats, sonst nach der „besten Reisezeit“ (e.bestMonths, Formel des Rankings)
function filterTrip(list, trip) {
  if (!trip.month) return list;
  if (trip.weather || trip.lowRain) return list.filter((e) => weatherMatches(e.climate, trip.month, trip.weather, trip.lowRain));
  return list.filter((e) => (e.bestMonths || []).includes(trip.month));
}

// URL-Parameter einer Suche (für Links und Lockerungen)
function toQuery(search, trip) {
  const p = new URLSearchParams();
  if (search.q) p.set('q', search.q);
  if (search.country) p.set('land', search.country);
  if (trip.month) p.set('monat', String(trip.month));
  if (trip.weather) p.set('wetter', trip.weather);
  if (trip.lowRain) p.set('regen', '1');
  if (search.minScore) p.set('min', String(search.minScore));
  for (const f of search.features || []) p.append('l', f);
  return p.toString();
}

// Varianten mit je einem gelockerten Filter: [{ label, search, trip }]. featureLabel(code) liefert die Bezeichnung.
function relaxations(search, trip, { featureLabel = (c) => c, monthName = (m) => String(m) } = {}) {
  const out = [];
  for (const f of search.features || []) {
    out.push({ label: `ohne „${featureLabel(f)}“`, search: { ...search, features: search.features.filter((x) => x !== f) }, trip });
  }
  if (trip.weather) out.push({ label: `Wetter egal (nur gute Reisezeit im ${monthName(trip.month)})`, search, trip: { ...trip, weather: null, lowRain: false } });
  if (trip.lowRain && trip.weather) out.push({ label: 'auch mit mehr Regen', search, trip: { ...trip, lowRain: false } });
  if (trip.month) out.push({ label: 'jeder Reisemonat', search, trip: { month: null, weather: null, lowRain: false } });
  if (search.country) out.push({ label: 'alle Länder', search: { ...search, country: null }, trip });
  if (search.minScore) out.push({ label: 'jeder Score', search: { ...search, minScore: null }, trip });
  if (search.q) out.push({ label: `ohne Suchtext „${search.q}“`, search: { ...search, q: '' }, trip });
  return out;
}

module.exports = { WEATHER, LOW_RAIN_DAYS, parseTrip, weatherMatches, filterTrip, toQuery, relaxations };
