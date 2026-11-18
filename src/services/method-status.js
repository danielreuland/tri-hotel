// Stand der Methode je Ranking (B-30): Version und Datum des Kriterienkatalogs, letzte Neuberechnung der Scores
// und die letzten Katalogänderungen in verständlichen Sätzen. Erfasst werden die Änderungen per Trigger
// (Migration 120, Tabelle catalog_changes); hier wird nur gelesen und formuliert.
const db = require('../db');

const FALLBACK = 'Kriterienkatalog überarbeitet.';
const MAX_NAMES = 2;

// TT.MM.JJJJ in deutscher Zeit
function dateLabel(d) {
  if (!d) return null;
  return new Date(d).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric' });
}

// JJJJ-MM-TT in deutscher Zeit (für dateModified)
function isoDate(d) {
  if (!d) return null;
  return new Date(d).toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
}

const quoted = (names) => {
  const q = names.map((n) => `„${n}“`);
  return q.length > 1 ? `${q.slice(0, -1).join(', ')} und ${q[q.length - 1]}` : q[0];
};

// Namen einer Gruppe: höchstens zwei nennen, sonst nur die Anzahl
function phrase(names, { one, many, count }) {
  if (names.length <= MAX_NAMES) return names.length === 1 ? one(quoted(names)) : many(quoted(names));
  return count(names.length);
}

const PHRASES = {
  criterion: {
    added: { one: (n) => `neues Kriterium ${n}`, many: (n) => `neue Kriterien ${n}`, count: (k) => `${k} neue Kriterien` },
    changed: { one: (n) => `Kriterium ${n} angepasst`, many: (n) => `Kriterien ${n} angepasst`, count: (k) => `${k} Kriterien angepasst` },
    removed: { one: (n) => `Kriterium ${n} entfällt`, many: (n) => `Kriterien ${n} entfallen`, count: (k) => `${k} Kriterien entfallen` },
  },
  category: {
    added: { one: (n) => `neuer Bereich ${n}`, many: (n) => `neue Bereiche ${n}`, count: (k) => `${k} neue Bereiche` },
    changed: { one: (n) => `Bereich ${n} umbenannt`, many: (n) => `Bereiche ${n} umbenannt`, count: (k) => `${k} Bereiche umbenannt` },
    removed: { one: (n) => `Bereich ${n} entfällt`, many: (n) => `Bereiche ${n} entfallen`, count: (k) => `${k} Bereiche entfallen` },
  },
};

// Ein verständlicher Satz zu einer Katalogänderung. Fester Text (public_text) geht vor; was sich nicht
// verständlich sagen lässt (unbekannte Art, zu viele Teile), wird zu „Kriterienkatalog überarbeitet.“
function publicText(change) {
  if (change && typeof change.public_text === 'string' && change.public_text.trim()) return change.public_text.trim();
  const items = Array.isArray(change && change.detail) ? change.detail : [];
  if (!items.length) return FALLBACK;
  if (items.some((i) => i.kind === 'ranking' && i.op === 'created')) return 'Erste Fassung des Kriterienkatalogs.';
  const parts = [];
  for (const kind of ['criterion', 'category']) {
    for (const op of ['added', 'changed', 'removed']) {
      const names = [...new Set(items.filter((i) => i.kind === kind && i.op === op && i.label).map((i) => String(i.label)))];
      if (names.length) parts.push(phrase(names, PHRASES[kind][op]));
    }
  }
  if (items.some((i) => i.kind === 'formula')) parts.push('Formel angepasst');
  if (items.some((i) => i.kind === 'labels')) parts.push('Score-Stufen angepasst');
  const known = items.every((i) => (PHRASES[i.kind] && PHRASES[i.kind][i.op] && i.label) || i.kind === 'formula' || i.kind === 'labels');
  if (!parts.length || !known || parts.length > 3) return FALLBACK;
  const s = parts.join(', ');
  return `${s[0].toUpperCase()}${s.slice(1)}.`;
}

// Stand-Zeile aus der Ranking-Zeile (rankings.catalog_version, catalog_changed_at, scores_computed_at)
function statusOf(ranking) {
  if (!ranking) return null;
  const changed = ranking.catalog_changed_at || null;
  return {
    version: Number(ranking.catalog_version) || 1,
    changedAt: changed,
    changedLabel: dateLabel(changed),
    changedIso: isoDate(changed),
    computedAt: ranking.scores_computed_at || null,
    computedLabel: dateLabel(ranking.scores_computed_at),
  };
}

// Strukturierte Daten der Methodik-Seite: WebPage mit dateModified = Datum der letzten Katalogänderung
function pageLd({ name, url, site, status }) {
  return {
    '@context': 'https://schema.org', '@type': 'WebPage', name, url, inLanguage: 'de',
    ...(site ? { isPartOf: { '@type': 'WebSite', url: `${site}/` } } : {}),
    ...(status && status.changedIso ? { dateModified: status.changedIso } : {}),
  };
}

// Die letzten n Katalogänderungen, neueste zuerst
async function recentChanges(rankingId, n = 5, client = db) {
  const { rows } = await client.query(
    `SELECT version, changed_at, detail, public_text FROM catalog_changes WHERE ranking_id = $1
      ORDER BY version DESC LIMIT $2`, [rankingId, n]);
  return rows.map((r) => ({ version: r.version, date: dateLabel(r.changed_at), iso: isoDate(r.changed_at), text: publicText(r) }));
}

// Nach einer vollständigen Neuberechnung aller Scores eines Rankings
async function markComputed(rankingId, client = db) {
  await client.query('UPDATE rankings SET scores_computed_at = now() WHERE id = $1', [rankingId]);
}

module.exports = { FALLBACK, dateLabel, isoDate, publicText, statusOf, pageLd, recentChanges, markComputed };
