// Marken von Partnerprogrammen, die nicht in Meta-Angaben stehen dürfen (Expedia/CJ-Programmbedingungen Ziff. 5.1.7, 6.5):
// <title>, meta description, og:*, twitter:*, JSON-LD name/headline/description der Seite. Im Fließtext und Ankertext erlaubt.
// Dazu Wörter, die in Title/Meta nur bei echten Aktionen stehen dürfen (Ziff. 5.7).

const BRANDS = /fewo[\s-]?direkt|vrbo|expedia/i;
const PROMO = /gutschein|\bdeals?\b|rabatt/i;

// Treffer in einem Meta-Text: Liste der Funde (leer = in Ordnung)
function metaProblems(text) {
  const t = String(text || '');
  const out = [];
  const b = BRANDS.exec(t);
  if (b) out.push(`Marke „${b[0]}“`);
  const p = PROMO.exec(t);
  if (p) out.push(`Werbewort „${p[0]}“`);
  return out;
}

const decode = (s) => String(s).replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

// Meta-Angaben aus fertigem HTML lesen: [{ where, text }]
function metaTexts(html) {
  const head = String(html || '').split(/<\/head>/i)[0];
  const out = [];
  const title = /<title>([\s\S]*?)<\/title>/i.exec(head);
  if (title) out.push({ where: 'title', text: decode(title[1]) });
  const metaRe = /<meta\s+([^>]*?)>/gi;
  let m;
  while ((m = metaRe.exec(head))) {
    const attrs = m[1];
    const key = /(?:name|property)="([^"]+)"/i.exec(attrs);
    const content = /content="([^"]*)"/i.exec(attrs);
    if (!key || !content) continue;
    const k = key[1].toLowerCase();
    if (k === 'description' || k === 'keywords' || k.startsWith('og:') || k.startsWith('twitter:')) out.push({ where: k, text: decode(content[1]) });
  }
  // JSON-LD: nur Angaben der Seite selbst (name, headline, description) – nicht verlinkte Objekte oder FAQ-Antworten
  const ldRe = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi;
  while ((m = ldRe.exec(head))) {
    let data;
    try { data = JSON.parse(m[1]); } catch { continue; }
    for (const node of Array.isArray(data) ? data : [data]) {
      if (!node || typeof node !== 'object' || !['Article', 'WebPage', 'CollectionPage', 'BlogPosting'].includes(node['@type'])) continue;
      for (const f of ['name', 'headline', 'description']) if (node[f]) out.push({ where: `ld:${node['@type']}.${f}`, text: String(node[f]) });
    }
  }
  return out;
}

// Verstöße einer fertigen Seite: [{ where, text, problems }]
function headViolations(html) {
  return metaTexts(html).map((m) => ({ ...m, problems: metaProblems(m.text) })).filter((m) => m.problems.length);
}

module.exports = { BRANDS, PROMO, metaProblems, metaTexts, headViolations };
