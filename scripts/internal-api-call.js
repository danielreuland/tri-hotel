// Signierter Testaufruf der internen API (docs/internal-api.md) – auf dem Server, für Einrichtung und Fehlersuche.
//   node scripts/internal-api-call.js /internal/v1/stats
//   node scripts/internal-api-call.js "/internal/v1/entities?q=santa&limit=3"
//   node scripts/internal-api-call.js /internal/v1/stats --app hub --base http://127.0.0.1:3010
// Schlüssel aus INTERNAL_API_KEYS (.env, erster Eintrag der App); das Geheimnis wird nie ausgegeben.
const config = require('../src/config');
const auth = require('../src/lib/internal-auth');

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

async function main() {
  const path = process.argv[2];
  if (!path || !path.startsWith('/internal/')) {
    console.error('Aufruf: node scripts/internal-api-call.js /internal/v1/<endpunkt>[?…] [--app hub] [--base http://127.0.0.1:3010]');
    process.exit(2);
  }
  const app = arg('app', 'hub');
  const base = arg('base', `http://127.0.0.1:${config.port}`).replace(/\/$/, '');
  const secrets = auth.parseKeys(config.internalApiKeys).get(app);
  if (!secrets) {
    console.error(`Kein Schlüssel für „${app}“ in INTERNAL_API_KEYS (.env). Format: ${app}:<geheimnis, mind. ${auth.MIN_SECRET_BYTES} Zeichen>`);
    process.exit(1);
  }
  const started = Date.now();
  const res = await fetch(base + path, { headers: auth.headers({ app, secret: secrets[0], method: 'GET', path }), signal: AbortSignal.timeout(10000) });
  const text = await res.text();
  console.log(`HTTP ${res.status} · ${Date.now() - started} ms · ${res.headers.get('content-type') || ''}`);
  try {
    console.log(JSON.stringify(JSON.parse(text), null, 2));
  } catch {
    console.log(text.slice(0, 2000));
  }
  process.exit(res.ok ? 0 : 1);
}

main().catch((err) => {
  console.error('Fehler:', err.message);
  process.exit(1);
});
