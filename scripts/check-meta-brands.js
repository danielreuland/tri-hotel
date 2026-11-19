// Prüft fertige Seiten auf Partnermarken (FeWo-direkt, Vrbo, Expedia) und Werbewörter in <title>, meta description,
// og:*, twitter:* und JSON-LD der Seite (Programmbedingungen Expedia/CJ Ziff. 5.1.7, 6.5, 5.7).
// Seiten: Ratgeber, Regionen, Länder und die Liste aus der Sitemap der Site.
// Aufruf: node scripts/check-meta-brands.js https://tri-hotel.de   (Exit-Code 1 bei Fund)
const { headViolations } = require('../src/lib/brands');

async function main() {
  const base = String(process.argv[2] || 'http://localhost:3010').replace(/\/$/, '');
  const xml = await (await fetch(`${base}/sitemap.xml`)).text();
  const host = new URL(base).origin;
  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].replace(/^https?:\/\/[^/]+/, host))
    .filter((u) => /\/(ratgeber|region|land)\/|\/hotels$|\/rankings\/[^/]+$|\/$/.test(u));
  let bad = 0;
  for (const u of urls) {
    const html = await (await fetch(u)).text();
    const v = headViolations(html);
    if (v.length) {
      bad += 1;
      console.log(`✗ ${u}`);
      for (const x of v) console.log(`    ${x.where}: ${x.problems.join(', ')} – „${x.text.slice(0, 120)}“`);
    }
  }
  console.log(`${urls.length} Seiten geprüft, ${bad} mit Fund.`);
  process.exitCode = bad ? 1 : 0;
}

main().catch((err) => { console.error(err.message); process.exitCode = 2; });
