// Mögliche Dubletten unter Objekten finden (B-46): ähnlicher Name, nahe Koordinaten oder gleiche Website-Adresse.
// Nur Hinweise für den Admin – nichts wird automatisch zusammengeführt.
const { distanceKm } = require('./seo');

// Füllwörter, die in vielen Objektnamen vorkommen und nichts unterscheiden
const FILLER = ['hotel', 'hotels', 'resort', 'spa', 'and', 'the', 'by', 'club', 'apartments', 'apartment', 'aparthotel', 'suites', 'boutique', 'und'];

function normName(s, filler = FILLER) {
  const words = String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
  const kept = words.filter((w) => !filler.includes(w));
  return (kept.length ? kept : words).join(' ');
}

function trigrams(s) {
  const out = new Set();
  const x = `  ${s} `;
  for (let i = 0; i < x.length - 2; i++) out.add(x.slice(i, i + 3));
  return out;
}

// Ähnlichkeit zweier Namen 0–1 (Dice-Koeffizient über Buchstaben-Trigramme)
function nameSimilarity(a, b, filler) {
  const A = trigrams(normName(a, filler));
  const B = trigrams(normName(b, filler));
  if (!A.size || !B.size) return 0;
  let n = 0;
  for (const t of A) if (B.has(t)) n++;
  return (2 * n) / (A.size + B.size);
}

// Website ohne Protokoll, www, Abfrage und Schrägstrich am Ende; nur aussagekräftig mit Pfad (Hotelketten teilen die Domain)
function siteKey(url) {
  try {
    const u = new URL(String(url));
    const p = u.pathname.replace(/\/+$/, '').toLowerCase();
    return p ? `${u.hostname.replace(/^www\./, '')}${p}` : null;
  } catch { return null; }
}

// Paare mit Begründung; maxMeters und minSimilarity sind die Schwellen
function findPairs(items, { maxMeters = 300, minSimilarity = 0.6, filler } = {}) {
  const pairs = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i];
      const b = items[j];
      if (a.entity_type && b.entity_type && a.entity_type !== b.entity_type) continue;
      const hasGeo = [a.lat, a.lng, b.lat, b.lng].every((v) => v !== null && v !== undefined && v !== '');
      const meters = hasGeo ? Math.round(1000 * distanceKm({ lat: Number(a.lat), lng: Number(a.lng) }, { lat: Number(b.lat), lng: Number(b.lng) })) : null;
      const similarity = nameSimilarity(a.name, b.name, filler);
      const sameSite = Boolean(siteKey(a.website)) && siteKey(a.website) === siteKey(b.website);
      const reasons = [];
      if (meters !== null && meters < maxMeters) reasons.push(`${meters} m entfernt`);
      if (similarity >= minSimilarity) reasons.push(`Name ähnlich (${similarity.toFixed(2)})`);
      if (sameSite) reasons.push('gleiche Website-Adresse');
      if (reasons.length) pairs.push({ a, b, meters, similarity, sameSite, reasons, strong: reasons.length > 1 || sameSite });
    }
  }
  return pairs.sort((x, y) => Number(y.strong) - Number(x.strong) || y.reasons.length - x.reasons.length || (x.meters ?? 1e9) - (y.meters ?? 1e9));
}

module.exports = { FILLER, normName, nameSimilarity, siteKey, findPairs };
