// Interface "extractor": extract({ ranking, criteria, entity, pages, features })
//   -> { facts: [{ criterionId, value, evidenceUrl, evidenceText }], features: [{ featureId, evidenceUrl, evidenceText }] }
// features = Katalog-Leistungen ohne Ableitung (z. B. „Vegane Gerichte“); nur vorhandene werden gemeldet.
// Anbieter über LLM_PROVIDER: 'none' (überspringt die Extraktion) oder 'anthropic'.
//
// Regel: Kein Wert ohne Fundstelle. Jede Angabe braucht URL + wörtlichen Textausschnitt,
// der tatsächlich auf der abgerufenen Seite vorkommt – sonst wird sie verworfen.
const config = require('../config');

const MAX_PAGES = 6;
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

async function disallowedPaths(origin) {
  try {
    const res = await fetch(`${origin}/robots.txt`, { headers: { 'User-Agent': config.userAgent }, signal: AbortSignal.timeout(5000) });
    if (!res.ok) return [];
    const lines = (await res.text()).split('\n').map((l) => l.trim());
    const out = [];
    let applies = false;
    for (const line of lines) {
      const [k, ...rest] = line.split(':');
      const key = (k || '').toLowerCase();
      const val = rest.join(':').trim();
      if (key === 'user-agent') applies = val === '*';
      else if (applies && key === 'disallow' && val) out.push(val);
    }
    return out;
  } catch {
    return [];
  }
}

// Startseite + einige Unterseiten derselben Domain (kürzeste Pfade zuerst).
async function fetchSite(website) {
  const start = await fetchText(website);
  if (!start) return [];
  const origin = new URL(start.url).origin;
  const blocked = await disallowedPaths(origin);
  const allowed = (u) => !blocked.some((p) => new URL(u).pathname.startsWith(p));
  const pages = [{ url: start.url, text: htmlToText(start.html).slice(0, MAX_CHARS_PER_PAGE) }];

  const links = new Set();
  for (const m of start.html.matchAll(/href="([^"#]+)"/gi)) {
    try {
      const u = new URL(m[1], start.url);
      if (u.origin === origin && !/\.(pdf|jpe?g|png|gif|svg|webp|zip|ics)$/i.test(u.pathname) && u.toString() !== start.url) {
        u.hash = '';
        links.add(u.toString());
      }
    } catch { /* ungültiger Link */ }
  }
  const candidates = [...links].filter(allowed).sort((a, b) => a.length - b.length).slice(0, MAX_PAGES - 1);
  for (const url of candidates) {
    try {
      const page = await fetchText(url);
      if (page) pages.push({ url: page.url, text: htmlToText(page.html).slice(0, MAX_CHARS_PER_PAGE) });
    } catch { /* Seite überspringen */ }
  }
  return pages;
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

async function extractAnthropic({ ranking, criteria, entity, pages, features = [] }) {
  const { z } = require('zod');
  const { zodOutputFormat } = require('@anthropic-ai/sdk/helpers/zod');

  const extractable = criteria.filter((c) => describeCriterion(c));
  const askFeatures = features.filter((f) => !f.derive);
  if ((!extractable.length && !askFeatures.length) || !pages.length) return { facts: [], features: [] };

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
  });

  const pageBlock = pages.map((p, i) => `<page index="${i + 1}" url="${p.url}">\n${p.text}\n</page>`).join('\n\n');
  const prompt = `Du prüfst die Website von „${entity.name}“ (${entity.city || ''}) für das Ranking „${ranking.name}“.

Ermittle für die folgenden Kriterien nur Werte, die auf den Seiten ausdrücklich belegt sind:
${extractable.map(describeCriterion).join('\n')}

Gib außerdem unter "features" nur die folgenden Leistungen an, wenn die Website sie ausdrücklich anbietet:
${askFeatures.map((f) => `- ${f.code}: ${f.label}`).join('\n')}

Regeln:
- Gib ein Kriterium nur an, wenn die Website es eindeutig belegt. Im Zweifel weglassen.
- "false" nur, wenn die Website ausdrücklich sagt, dass es etwas nicht gibt.
- evidence_url: die url der Seite, auf der der Beleg steht.
- evidence_text: wörtliches Zitat von der Seite (max. 300 Zeichen), das den Wert belegt.

${pageBlock}`;

  const client = require('../lib/llm').anthropic();
  const response = await client.messages.parse(
    {
      model: 'claude-opus-5-5',
      max_tokens: 16000,
      output_config: { effort: 'medium', format: zodOutputFormat(Schema) },
      // Server-seitiger Fallback, falls ein Sicherheitsfilter die Anfrage ablehnt
      fallbacks: 'default',
      messages: [{ role: 'user', content: prompt }],
    },
    { headers: { 'anthropic-beta': 'server-side-fallback-2026-07-01' } }
  );
  if (response.stop_reason === 'refusal' || !response.parsed_output) return { facts: [], features: [] };

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
  return { facts: out, features: featureOut };
}

const providers = {
  none: async () => ({ facts: [], features: [] }),
  anthropic: extractAnthropic,
};

async function extract(args) {
  const provider = providers[config.llm.provider];
  if (!provider) throw new Error(`Unbekannter LLM_PROVIDER „${config.llm.provider}“`);
  return provider(args);
}

module.exports = { extract, fetchSite, findContactEmail, htmlToText, parseValue, describeCriterion };
