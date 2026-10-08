// Klima je Monat aus Open-Meteo (Archiv der letzten drei vollen Jahre).
// avg_high_c / avg_low_c = Mittel der Tageshöchst-/-tiefstwerte, rain_days = Tage mit ≥ 1 mm Niederschlag.
const config = require('../config');

const ARCHIVE = 'https://archive-api.open-meteo.com/v1/archive';

function aggregateMonthly(daily) {
  const buckets = Array.from({ length: 12 }, () => ({ high: [], low: [], rain: 0, years: new Set() }));
  daily.time.forEach((day, i) => {
    const month = Number(day.slice(5, 7)) - 1;
    const b = buckets[month];
    if (daily.temperature_2m_max[i] !== null) b.high.push(daily.temperature_2m_max[i]);
    if (daily.temperature_2m_min[i] !== null) b.low.push(daily.temperature_2m_min[i]);
    if ((daily.precipitation_sum[i] ?? 0) >= 1) b.rain += 1;
    b.years.add(day.slice(0, 4));
  });
  const avg = (a) => (a.length ? Math.round((a.reduce((s, x) => s + x, 0) / a.length) * 10) / 10 : null);
  return buckets.map((b, i) => ({
    month: i + 1,
    avg_high_c: avg(b.high),
    avg_low_c: avg(b.low),
    rain_days: b.years.size ? Math.round((b.rain / b.years.size) * 10) / 10 : null,
  }));
}

async function monthlyClimate({ lat, lng }) {
  const lastYear = new Date().getFullYear() - 1;
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lng),
    start_date: `${lastYear - 2}-01-01`,
    end_date: `${lastYear}-12-31`,
    daily: 'temperature_2m_max,temperature_2m_min,precipitation_sum',
    timezone: 'UTC',
  });
  const res = await fetch(`${ARCHIVE}?${params}`, { headers: { 'User-Agent': config.userAgent }, signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
  const json = await res.json();
  return aggregateMonthly(json.daily);
}

module.exports = { monthlyClimate, aggregateMonthly };
