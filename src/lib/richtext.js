// Einfache Formatierung in Redaktionstexten (Beschreibung eines Objekts, Regions- und Ländertexte), zusätzlich zu
// „## “ (Zwischenüberschrift) und „- “ (Aufzählung), die describer.parseBody in Blöcke zerlegt:
//   [Linktext](https://ziel.example/seite)  oder  [Linktext](/interne/seite)   → Link
//   **wichtig**                                                               → fett
// Alles andere bleibt Text und wird als Text ausgegeben (kein HTML aus dem Eingabefeld).

const LINK = /\[([^\]\n]{1,200})\]\(([^)\s]{1,500})\)/;
const BOLD = /\*\*([^*\n]{1,300})\*\*/;

const escapeHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// Erlaubt sind https-Adressen und interne Pfade („/hotel/…“, nicht „//…“). Ergebnis: { href, internal } oder null
function target(url, siteHost = null) {
  const u = String(url || '').trim();
  if (/^\/(?!\/)/.test(u)) return { href: u, internal: true };
  let parsed;
  try {
    parsed = new URL(u);
  } catch (err) {
    return null;
  }
  if (parsed.protocol !== 'https:') return null;
  const host = parsed.hostname.replace(/^www\./, '');
  return { href: parsed.toString(), internal: Boolean(siteHost) && host === String(siteHost).replace(/^www\./, ''), host };
}

// Text → Teile: [{ type: 'text', text } | { type: 'bold', text } | { type: 'link', text, href, internal, host }]
function tokens(text, { siteHost = null } = {}) {
  const out = [];
  let rest = String(text === undefined || text === null ? '' : text);
  while (rest) {
    const l = LINK.exec(rest);
    const b = BOLD.exec(rest);
    const first = [l, b].filter(Boolean).sort((x, y) => x.index - y.index)[0];
    if (!first) {
      out.push({ type: 'text', text: rest });
      break;
    }
    if (first.index) out.push({ type: 'text', text: rest.slice(0, first.index) });
    if (first === l) {
      const t = target(l[2], siteHost);
      // ungültiges Ziel: als Text stehen lassen, damit der Fehler im Admin auffällt
      out.push(t ? { type: 'link', text: l[1], ...t } : { type: 'text', text: l[0] });
    } else {
      out.push({ type: 'bold', text: b[1] });
    }
    rest = rest.slice(first.index + first[0].length);
  }
  return out;
}

// Sicheres HTML für die Ausgabe in Vorlagen (<%- … %>): fremde Links öffnen in einem neuen Tab mit nofollow
function toHtml(text, opts = {}) {
  return tokens(text, opts).map((t) => {
    if (t.type === 'bold') return `<strong>${escapeHtml(t.text)}</strong>`;
    if (t.type === 'link') {
      return t.internal
        ? `<a href="${escapeHtml(t.href)}">${escapeHtml(t.text)}</a>`
        : `<a href="${escapeHtml(t.href)}" rel="nofollow noopener" target="_blank">${escapeHtml(t.text)}</a>`;
    }
    return escapeHtml(t.text);
  }).join('');
}

// Reiner Text ohne Formatierung (für Prüfungen, Wortzahl, Beschreibungen): Linktext statt Link, kein „**“
function plain(text) {
  return tokens(text).map((t) => t.text).join('');
}

// Alle Links eines Textes (für Prüfungen im Admin): [{ text, href, internal, host }] und ungültige Ziele
function links(text, opts = {}) {
  const valid = tokens(text, opts).filter((t) => t.type === 'link');
  const invalid = [];
  const re = new RegExp(LINK.source, 'g');
  let m;
  while ((m = re.exec(String(text || '')))) if (!target(m[2], opts.siteHost)) invalid.push(m[2]);
  return { valid, invalid };
}

module.exports = { tokens, toHtml, plain, links, target, escapeHtml };
