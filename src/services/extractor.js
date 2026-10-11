// Interface "extractor": extract({ ranking, criteria, entity, pages, features })
//   -> { facts: [{ criterionId, value, evidenceUrl, evidenceText }], features: [{ featureId, evidenceUrl, evidenceText }] }
// features = Katalog-Leistungen ohne Ableitung (z. B. „Vegane Gerichte“); nur vorhandene werden gemeldet.
// Anbieter über LLM_PROVIDER: 'none' (überspringt die Extraktion) oder 'anthropic'.
//
// Regel: Kein Wert ohne Fundstelle. Jede Angabe braucht URL + wörtlichen Textausschnitt,
// der tatsächlich auf der abgerufenen Seite vorkommt – sonst wird sie verworfen.
const config = require('../config');
const sitedata = require('./sitedata');

const MAX_PAGES = 10;

// Seitenauswahl: gängige Begriffe für Ausstattungsseiten (DE/EN/ES/IT/PT), ergänzt um Wörter aus Kriterien und Leistungen
const PAGE_HINTS = [
  'sport', 'fitness', 'gym', 'pool', 'piscina', 'schwimm', 'swim', 'bike', 'rad', 'cycl', 'bici', 'spa', 'wellness', 'sauna',
  'massage', 'physio', 'restaurant', 'gastronom', 'buffet', 'kulinar', 'food', 'servic', 'ausstatt', 'einricht', 'facilit',
  'instalac', 'equip', 'leistung', 'angebot', 'aktivit', 'activit', 'training', 'lauf', 'running', 'camp', 'triathlon',
];
const PAGE_SKIP = /cookie|datenschutz|privacy|privacidad|impressum-?agb|agb|terms|condiciones|blog|magazin|news|presse|press|jobs?|karriere|career|empleo|gutschein|voucher|login|account|warenkorb|cart/i;
const PAGE_CONTACT = /kontakt|contact|contacto|impressum|imprint|aviso-legal|legal-notice/i;
const MAX_CHARS_PER_PAGE = 20000;

// ---------- Website abrufen ----------

function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(p|div|li|h\d|tr|section)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': config.userAgent, Accept: 'text/html' },
    redirect: 'follow',
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok || !(res.headers.get('content-type') || '').includes('text/html')) return null;
  const html = (await res.text()).slice(0, 1_500_000);
  return { url: res.url, html };
}

// robots.txt: gesperrte Pfade für alle Bots und angegebene Sitemaps
async function robotsInfo(origin) {
  const info = { disallow: [], sitemaps: [] };
  try {
    const res = await fetch(`${origin}/robots.txt`, { headers: { 'User-Agent': config.userAgent }, signal: AbortSignal.timeout(5000) });
    if (!res.ok) return info;
    const lines = (await res.text()).split('\n').map((l) => l.trim());
    let applies = false;
    for (const line of lines) {
      const [k, ...rest] = line.split(':');
      const key = (k || '').toLowerCase();
      const val = rest.join(':').trim();
      if (key === 'user-agent') applies = val === '*';
      else if (applies && key === 'disallow' && val) info.disallow.push(val);
      else if (key === 'sitemap' && /^https?:\/\//i.test(val)) info.sitemaps.push(val);
    }
  } catch { /* ohne robots.txt */ }
  return info;
}

// <loc>-Einträge einer Sitemap (oder eines Sitemap-Index)
function parseSitemap(xml) {
  const locs = [...String(xml).matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1].replace(/&amp;/g, '&'));
  return { isIndex: /<sitemapindex[\s>]/i.test(xml), locs };
}

async function fetchXml(url) {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': config.userAgent }, signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    return (await res.text()).slice(0, 2_000_000);
  } catch {
    return null;
  }
}

// URLs aus der Sitemap; bei einem Index die Teil-Sitemaps der Sprache/des Pfads der Startseite zuerst
async function sitemapUrls(origin, declared, startPath) {
  const first = declared.length ? declared : [`${origin}/sitemap.xml`, `${origin}/sitemap_index.xml`];
  const urls = new Set();
  for (const sm of first.slice(0, 3)) {
    const xml = await fetchXml(sm);
    if (!xml) continue;
    const parsed = parseSitemap(xml);
    if (!parsed.isIndex) {
      parsed.locs.forEach((u) => urls.add(u));
    } else {
      const lang = startPath.split('/').filter(Boolean)[0] || '';
      const children = parsed.locs
        .sort((a, b) => Number(lang && b.includes(`/${lang}`)) - Number(lang && a.includes(`/${lang}`)))
        .filter((u) => !/image|video|post|blog|news|product|attachment/i.test(u))
        .slice(0, 4);
      for (const c of children) {
        const cx = await fetchXml(c);
        if (cx) parseSitemap(cx).locs.forEach((u) => urls.add(u));
      }
    }
    if (urls.size) break;
  }
  return [...urls].slice(0, 2000);
}

// Bewertet einen Link: Unterseiten des Hotels selbst und Ausstattungsseiten zuerst, Rechtliches/Blog nie.
function scoreLink(url, text, startPath, hints) {
  const path = decodeURIComponent(url.pathname).toLowerCase();
  const hay = `${path} ${String(text || '').toLowerCase()}`;
  if (PAGE_SKIP.test(path)) return -100;
  let score = 0;
  if (startPath.length > 1 && path.startsWith(startPath) && path !== startPath) score += 6;
  for (const h of hints) if (hay.includes(h)) score += 3;
  if (PAGE_CONTACT.test(hay)) score += 2;
  score -= path.split('/').filter(Boolean).length * 0.1; // bei Gleichstand kürzere Pfade
  return score;
}

// Wörter aus Kriterien und Leistungen (Datenbank) als zusätzliche Hinweise für die Seitenauswahl
function hintsFrom(labels) {
  const words = new Set(PAGE_HINTS);
  for (const l of labels || []) {
    for (const w of String(l).toLowerCase().split(/[^a-zäöüß]+/)) if (w.length >= 5) words.add(w.slice(0, 7));
  }
  return [...words];
}

function pageOf(fetched) {
  return { url: fetched.url, text: htmlToText(fetched.html).slice(0, MAX_CHARS_PER_PAGE), data: sitedata.fromHtml(fetched.html) };
}

// Startseite + passende Unterseiten derselben Domain (Links der Startseite und Sitemap).
// pages.more = weitere, noch nicht abgerufene Kandidaten für einen zweiten Durchgang.
async function fetchSite(website, { labels = [] } = {}) {
  const start = await fetchText(website);
  if (!start) return Object.assign([], { more: [], origin: null });
  const origin = new URL(start.url).origin;
  const startPath = new URL(start.url).pathname.toLowerCase().replace(/\/?$/, '/');
  const robots = await robotsInfo(origin);
  const allowed = (u) => !robots.disallow.some((p) => new URL(u).pathname.startsWith(p));
  const pages = [pageOf(start)];
  const hints = hintsFrom(labels);

  const links = new Map(); // url -> { score, text }
  const consider = (href, text) => {
    try {
      const u = new URL(href, start.url);
      u.hash = '';
      if (u.origin !== origin || /\.(pdf|jpe?g|png|gif|svg|webp|zip|ics|xml)$/i.test(u.pathname) || u.toString() === start.url) return;
      const key = u.toString();
      const score = scoreLink(u, text, startPath, hints);
      if (!links.has(key) || links.get(key).score < score) links.set(key, { score, text });
    } catch { /* ungültiger Link */ }
  };
  for (const m of start.html.matchAll(/<a\b[^>]*href="([^"#]+)"[^>]*>([\s\S]*?)<\/a>/gi)) consider(m[1], htmlToText(m[2]).slice(0, 120));
  // Sitemap: findet Ausstattungsseiten, die nicht von der Startseite verlinkt sind (Link-Text unbekannt)
  for (const u of await sitemapUrls(origin, robots.sitemaps, startPath)) consider(u, '');

  const ranked = [...links.entries()].filter(([u, l]) => l.score > -50 && allowed(u)).sort((a, b) => b[1].score - a[1].score);
  const take = ranked.slice(0, MAX_PAGES - 1).map(([u]) => u);
  for (const url of take) {
    try {
      const page = await fetchText(url);
      if (page && !pages.some((p) => p.url === page.url)) pages.push(pageOf(page));
    } catch { /* Seite überspringen */ }
  }
  return Object.assign(pages, { more: ranked.slice(MAX_PAGES - 1, 60).map(([url, l]) => ({ url, text: l.text })), origin, startPath });
}

// Zweiter Durchgang: weitere Seiten passend zu den noch fehlenden Angaben abrufen
async function fetchMore(pages, labels, max = 6) {
  const hints = hintsFrom(labels).filter((h) => !PAGE_HINTS.includes(h)).concat(PAGE_HINTS);
  const startPath = pages.startPath || '/';
  const ranked = (pages.more || [])
    .map((c) => ({ ...c, score: scoreLink(new URL(c.url), c.text, startPath, hints) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, max);
  const out = [];
  for (const c of ranked) {
    try {
      const page = await fetchText(c.url);
      if (page && !pages.some((p) => p.url === page.url) && !out.some((p) => p.url === page.url)) out.push(pageOf(page));
    } catch { /* Seite überspringen */ }
  }
  return out;
}

// ---------- Kontakt-E-Mail ----------

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const IGNORE_EMAIL = /^(noreply|no-reply|donotreply|privacy|datenschutz|dsb|webmaster|jobs|career|karriere|bewerbung|press|presse)@/i;

// Sucht eine Kontaktadresse auf den abgerufenen Seiten; bevorzugt die Domain der Website.
// Ergebnis: { email, evidenceUrl } oder null
function findContactEmail(pages, website) {
  let host = '';
  try {
    host = new URL(website).hostname.replace(/^www\./, '').toLowerCase();
  } catch { /* ohne Domainabgleich */ }
  const found = [];
  for (const p of pages) {
    for (const m of p.text.match(EMAIL_RE) || []) {
      const email = m.toLowerCase().replace(/\.$/, '');
      if (IGNORE_EMAIL.test(email) || /\.(png|jpe?g|gif|webp|svg)$/.test(email)) continue;
      if (!found.some((f) => f.email === email)) found.push({ email, evidenceUrl: p.url });
    }
  }
  const sameDomain = (e) => host && (e.email.endsWith(`@${host}`) || e.email.endsWith(`.${host}`));
  const preferred = /^(info|reservation|reservations|reservierung|booking|reception|rezeption|hotel|contact|kontakt)@/;
  return (
    found.find((e) => sameDomain(e) && preferred.test(e.email)) ||
    found.find(sameDomain) ||
    found.find((e) => preferred.test(e.email)) ||
    found[0] ||
    null
  );
}

// ---------- Prompt und Antwort ----------

function describeCriterion(c) {
  const s = c.scoring || {};
  switch (s.type) {
    case 'option': {
      const opts = Object.keys(s.points || {}).map((k) => `"${k}"${s.labels && s.labels[k] ? ` (${s.labels[k]})` : ''}`);
      return `- ${c.code}: ${c.label}. Wert ist genau eine dieser Optionen: ${opts.join(', ')}`;
    }
    case 'bool':
      return `- ${c.code}: ${c.label}. Wert "true" oder "false"`;
    case 'bands':
      return `- ${c.code}: ${c.label}. Wert ist eine Zahl${s.unit ? ` in ${s.unit}` : ''}`;
    default:
      return null; // rating = Admin-Einstufung, climate = Klimadaten
  }
}

function parseValue(c, raw) {
  const s = c.scoring || {};
  const v = String(raw).trim();
  if (s.type === 'option') return s.points && v in s.points ? { option: v } : null;
  if (s.type === 'bool') return v === 'true' ? { bool: true } : v === 'false' ? { bool: false } : null;
  if (s.type === 'bands') {
    const n = Number(v.replace(',', '.'));
    return Number.isFinite(n) ? { number: n } : null;
  }
  return null;
}

const normalizeWs = (t) => t.replace(/\s+/g, ' ').toLowerCase();

async function extractAnthropic({ ranking, criteria, entity, pages, features = [], model }) {
  const { z } = require('zod');
  const { zodOutputFormat } = require('@anthropic-ai/sdk/helpers/zod');

  const extractable = criteria.filter((c) => describeCriterion(c));
  const askFeatures = features.filter((f) => !f.derive);
  if ((!extractable.length && !askFeatures.length) || !pages.length) return { facts: [], features: [], address: null, usage: null };

  const Schema = z.object({
    facts: z.array(
      z.object({
        criterion_code: extractable.length ? z.enum(extractable.map((c) => c.code)) : z.string(),
        value: z.string(),
        evidence_url: z.string(),
        evidence_text: z.string(),
      })
    ),
    features: z.array(
      z.object({
        feature_code: askFeatures.length ? z.enum(askFeatures.map((f) => f.code)) : z.string(),
        evidence_url: z.string(),
        evidence_text: z.string(),
      })
    ),
    // Postanschrift des Objekts (für die Koordinatensuche); null, wenn nicht eindeutig angegeben
    address: z.object({
      street: z.string(),
      postal_code: z.string(),
      city: z.string(),
      evidence_url: z.string(),
      evidence_text: z.string(),
    }).nullable(),
  });

  const pageBlock = pages.map((p, i) => `<page index="${i + 1}" url="${p.url}">\n${p.text}\n</page>`).join('\n\n');
  const prompt = `Du prüfst die Website von „${entity.name}“ (${entity.city || ''}) für das Ranking „${ranking.name}“.

Ermittle für die folgenden Kriterien nur Werte, die auf den Seiten ausdrücklich belegt sind:
${extractable.map(describeCriterion).join('\n')}

Gib außerdem unter "features" nur die folgenden Leistungen an, wenn die Website sie ausdrücklich anbietet:
${askFeatures.map((f) => `- ${f.code}: ${f.label}`).join('\n')}

Gib unter "address" die Postanschrift von „${entity.name}“ an (Straße mit Hausnummer, Postleitzahl, Ort), wenn sie auf den Seiten steht – nicht die einer Hotelkette, eines Büros oder eines anderen Hauses. Sonst null.

Regeln:
- Gib ein Kriterium nur an, wenn die Website es eindeutig belegt. Im Zweifel weglassen.
- "false" nur, wenn die Website ausdrücklich sagt, dass es etwas nicht gibt.
- evidence_url: die url der Seite, auf der der Beleg steht.
- evidence_text: wörtliches Zitat von der Seite (max. 300 Zeichen), das den Wert belegt.

${pageBlock}`;

  const llm = require('../lib/llm');
  await llm.assertBudget();
  const response = await llm.anthropic().messages.parse(
    {
      model: model || llm.modelFor('extract'),
      max_tokens: 16000,
      output_config: { effort: 'medium', format: zodOutputFormat(Schema) },
      // Server-seitiger Fallback, falls ein Sicherheitsfilter die Anfrage ablehnt
      fallbacks: 'default',
      messages: [{ role: 'user', content: prompt }],
    },
    { headers: { 'anthropic-beta': 'server-side-fallback-2026-07-01' } }
  );
  // Bei Server-Fallback antwortet ggf. ein anderes Modell – gezählt wird das tatsächliche
  const usage = { model: response.model, raw: response.usage };
  if (response.stop_reason === 'refusal' || !response.parsed_output) return { facts: [], features: [], address: null, usage };

  const pageText = new Map(pages.map((p) => [p.url, normalizeWs(p.text)]));
  const out = [];
  for (const f of response.parsed_output.facts) {
    const c = extractable.find((x) => x.code === f.criterion_code);
    const value = c && parseValue(c, f.value);
    const quote = normalizeWs(f.evidence_text || '');
    const source = pageText.get(f.evidence_url);
    // Kein Wert ohne überprüfbare Fundstelle
    if (!value || !quote || !source || !source.includes(quote)) continue;
    if (out.some((o) => o.criterionId === c.id)) continue;
    out.push({ criterionId: c.id, value, evidenceUrl: f.evidence_url, evidenceText: f.evidence_text.slice(0, 500) });
  }
  // Leistungen ebenfalls nur mit überprüfbarer Fundstelle
  const featureOut = [];
  for (const f of response.parsed_output.features || []) {
    const feat = askFeatures.find((x) => x.code === f.feature_code);
    const quote = normalizeWs(f.evidence_text || '');
    const source = pageText.get(f.evidence_url);
    if (!feat || !quote || !source || !source.includes(quote) || featureOut.some((o) => o.featureId === feat.id)) continue;
    featureOut.push({ featureId: feat.id, evidenceUrl: f.evidence_url, evidenceText: f.evidence_text.slice(0, 500) });
  }
  // Anschrift nur mit überprüfbarer Fundstelle
  let address = null;
  const a = response.parsed_output.address;
  if (a && a.street && a.city) {
    const quote = normalizeWs(a.evidence_text || '');
    const source = pageText.get(a.evidence_url);
    if (quote && source && source.includes(quote)) {
      address = { street: a.street.trim().slice(0, 200), postal_code: a.postal_code.trim().slice(0, 20) || null, city: a.city.trim().slice(0, 120), url: a.evidence_url };
    }
  }
  return { facts: out, features: featureOut, address, usage };
}

const providers = {
  none: async () => ({ facts: [], features: [], address: null, usage: null }),
  anthropic: extractAnthropic,
};

async function extract(args) {
  const provider = providers[config.llm.provider];
  if (!provider) throw new Error(`Unbekannter LLM_PROVIDER „${config.llm.provider}“`);
  return provider(args);
}

module.exports = { extract, fetchSite, fetchMore, findContactEmail, htmlToText, parseValue, describeCriterion, scoreLink, hintsFrom, parseSitemap };
