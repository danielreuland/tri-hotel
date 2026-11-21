// Partner-Button-Test: Aufrufe der Rangliste und Klicks auf Hotelseiten je Tag, Ranking, Liste und Variante (Nenner),
// Auswertung für den Admin („Partner-Button-Test“). Nur Anzahlen, keine personenbezogenen Daten.
// Neutralität: Score-Berechnung und Sortierung lesen diese Tabelle nie.
const db = require('../db');
const pb = require('../lib/partner-button');

async function countEvent({ rankingId, list, variant, event, position = 0 }) {
  await db.query(
    `INSERT INTO ranking_list_stats (day, ranking_id, list, variant, event, position, count)
     VALUES ((now() AT TIME ZONE 'Europe/Berlin')::date, $1, $2, $3, $4, $5, 1)
     ON CONFLICT (day, ranking_id, list, variant, event, position) DO UPDATE SET count = ranking_list_stats.count + 1`,
    [rankingId, list, variant, event, event === 'detail' ? position : 0]);
}

// Zeitraum aus dem Filter: von/bis als YYYY-MM-DD, Standard letzte 28 Tage
function period(q = {}) {
  const iso = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : null);
  const today = pb.berlinDay();
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 27);
  let from = iso(q.von) || d.toISOString().slice(0, 10);
  let to = iso(q.bis) || today;
  if (from > to) [from, to] = [to, from];
  return { from, to };
}

const per100 = (n, views) => (views ? Math.round((n / views) * 1000) / 10 : null);

// Auswertung: alles je Variante (A, B, on). rankingId = Ranking der Liste.
async function report(rankingId, { from, to }) {
  const p = [rankingId, from, to];
  const [events, ranked, byBucket, byProgram, allSources, days] = await Promise.all([
    db.many(
      `SELECT variant, event, sum(count)::int AS n FROM ranking_list_stats
        WHERE ranking_id = $1 AND day BETWEEN $2 AND $3 GROUP BY variant, event`, p),
    // Partnerklicks aus der Rangliste (Button), nur Klicks auf Objekte dieses Rankings
    db.many(
      `SELECT c.variant, sum(c.clicks)::int AS n FROM outbound_clicks c
        WHERE c.placement IN ('ranking', 'region') AND c.variant <> '' AND c.day BETWEEN $2 AND $3
          AND c.kind IN ('entity_link', 'partner_search') AND ${inRanking('c')}
        GROUP BY c.variant`, p),
    db.many(
      `SELECT c.variant, c.position, sum(c.clicks)::int AS n FROM outbound_clicks c
        WHERE c.placement IN ('ranking', 'region') AND c.variant <> '' AND c.day BETWEEN $2 AND $3
          AND c.kind IN ('entity_link', 'partner_search') AND ${inRanking('c')}
        GROUP BY c.variant, c.position`, p),
    db.many(
      `SELECT c.variant, pr.name AS program, sum(c.clicks)::int AS n FROM outbound_clicks c
         JOIN partner_programs pr ON pr.id = CASE WHEN c.kind = 'partner_search' THEN c.target_id
                                                  ELSE (SELECT program_id FROM entity_links WHERE id = c.target_id) END
        WHERE c.placement IN ('ranking', 'region') AND c.variant <> '' AND c.day BETWEEN $2 AND $3
          AND c.kind IN ('entity_link', 'partner_search') AND ${inRanking('c')}
        GROUP BY c.variant, pr.name ORDER BY n DESC`, p),
    // Partnerklicks aller Quellen (Hotelseite, Rangliste, Vergleich …) je Tag – Variante ergibt sich aus dem Tag
    db.many(
      `SELECT c.day::text AS day, sum(c.clicks)::int AS n FROM outbound_clicks c
        WHERE c.kind IN ('entity_link', 'partner_search') AND c.day BETWEEN $1::date AND $2::date GROUP BY c.day`, [from, to]),
    // Tage, an denen der Test lief (Aufrufe mit Variante A/B gezählt)
    db.many(
      `SELECT DISTINCT day::text AS day, variant FROM ranking_list_stats
        WHERE ranking_id = $1 AND day BETWEEN $2 AND $3 AND event = 'view'`, p),
  ]);
  const V = ['A', 'B', 'on'];
  const out = {};
  for (const v of V) {
    const views = sumWhere(events, (r) => r.variant === v && r.event === 'view');
    const detail = sumWhere(events, (r) => r.variant === v && r.event === 'detail');
    const partner = sumWhere(ranked, (r) => r.variant === v);
    const testDays = days.filter((d) => d.variant === v).map((d) => d.day);
    const allClicks = sumWhere(allSources, (r) => testDays.includes(r.day));
    const buckets = { '1–3': 0, '4–10': 0, '11+': 0, unbekannt: 0 };
    for (const r of byBucket.filter((x) => x.variant === v)) buckets[pb.positionBucket(r.position)] += r.n;
    out[v] = {
      views, detail, partner, days: testDays.length, allClicks,
      partnerPer100: per100(partner, views), detailPer100: per100(detail, views),
      allPerDay: testDays.length ? Math.round((allClicks / testDays.length) * 10) / 10 : null,
      buckets, programs: byProgram.filter((r) => r.variant === v),
    };
  }
  return out;
}

// Klick gehört zu einem Objekt dieses Rankings (über den Link bzw. das Programm der Suchseite ohne Objektbezug: zählt mit)
const inRanking = (c) => `(${c}.kind = 'partner_search' OR EXISTS (SELECT 1 FROM entity_links l JOIN entity_rankings er ON er.entity_id = l.entity_id
  WHERE l.id = ${c}.target_id AND er.ranking_id = $1))`;
const sumWhere = (rows, fn) => rows.filter(fn).reduce((s, r) => s + r.n, 0);

module.exports = { countEvent, period, report, per100 };
