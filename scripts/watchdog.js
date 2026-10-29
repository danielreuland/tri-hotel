#!/usr/bin/env node
// Server-Wächter: prüft alle 5 Minuten (systemd-Timer deploy/server-watchdog.timer) Platte, Speicher, PM2-Apps,
// Websites, Zertifikate, Backup und Systemdienste und mailt bei neuen Problemen, alle 24 h als Erinnerung und wenn
// etwas behoben ist. Läuft als root auf dem Server (liest /etc/letsencrypt und die PM2-Liste von root).
// Ergänzt die externe Überwachung: fällt der ganze Server aus, kann er selbst nichts melden – dafür pingt er am
// Ende jedes Laufs WATCHDOG_HEARTBEAT_URL (Heartbeat-Monitor beim externen Dienst schlägt an, wenn der Ping ausbleibt).
//
// .env: WATCHDOG_MAIL_TO (Empfänger), optional WATCHDOG_NAME (Betreff), WATCHDOG_HEARTBEAT_URL,
//       WATCHDOG_URLS (kommagetrennt, „url|erwarteter Text“)
// Aufruf: node scripts/watchdog.js [--dry]  (--dry: nur anzeigen, nichts mailen oder speichern)
//         node scripts/watchdog.js --test-mail
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const config = require('../src/config');
const { evaluate, plan, message } = require('../src/lib/watchdog');

const STATE_FILE = process.env.WATCHDOG_STATE || '/var/lib/server-watchdog/state.json';
const DEFAULT_URLS = [
  'https://tri-hotel.de/healthz|ok',
  'https://triprep.de/',
  'https://api.triprep.de/health',
  'https://analytics.triprep.de/',
  'https://danielreuland.com/',
  'https://fitnessracing-hotel.de/',
];
const dry = process.argv.includes('--dry');

function run(cmd, args) {
  try {
    return execFileSync(cmd, args, { encoding: 'utf8', timeout: 20000, stdio: ['ignore', 'pipe', 'ignore'] });
  } catch (err) {
    return err.stdout || '';
  }
}

function disk() {
  const line = run('df', ['-P', '/']).trim().split('\n').pop() || '';
  const m = /(\d+)%/.exec(line);
  return m ? { percent: Number(m[1]) } : null;
}

function memAvailableMb() {
  const m = /MemAvailable:\s+(\d+) kB/.exec(fs.readFileSync('/proc/meminfo', 'utf8'));
  return m ? Math.round(Number(m[1]) / 1024) : null;
}

function pm2Apps() {
  try {
    const list = JSON.parse(run('pm2', ['jlist']) || '[]');
    return list.map((a) => ({ name: a.name, status: a.pm2_env && a.pm2_env.status, restarts: (a.pm2_env && a.pm2_env.restart_time) || 0 }));
  } catch {
    return null; // PM2 nicht abfragbar: nicht als „keine Apps“ werten
  }
}

async function checkUrls() {
  const list = (process.env.WATCHDOG_URLS ? process.env.WATCHDOG_URLS.split(',') : DEFAULT_URLS).map((s) => s.trim()).filter(Boolean);
  return Promise.all(list.map(async (entry) => {
    const [url, expect] = entry.split('|');
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10000), headers: { 'User-Agent': 'server-watchdog' } });
      const body = expect ? await res.text() : '';
      return { url, status: res.status, body: body.slice(0, 200), expect };
    } catch (err) {
      return { url, error: err.name === 'TimeoutError' ? 'keine Antwort in 10 s' : err.message, expect };
    }
  }));
}

function certs() {
  const dir = '/etc/letsencrypt/live';
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((n) => fs.existsSync(path.join(dir, n, 'cert.pem'))).map((name) => {
    const cert = new crypto.X509Certificate(fs.readFileSync(path.join(dir, name, 'cert.pem')));
    return { name, notAfter: new Date(cert.validTo) };
  });
}

function backup() {
  const out = run('systemctl', ['show', 'server-backup.service', '-p', 'Result', '-p', 'ExecMainExitTimestamp', '-p', 'LoadState']);
  const v = Object.fromEntries(out.trim().split('\n').map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
  if (v.LoadState !== 'loaded') return null;
  const finished = v.ExecMainExitTimestamp ? new Date(v.ExecMainExitTimestamp.replace(/^\w+ /, '')) : null;
  return { result: v.Result, finishedAt: finished && !Number.isNaN(finished.getTime()) ? finished : null };
}

function failedUnits() {
  return run('systemctl', ['list-units', '--failed', '--plain', '--no-legend']).trim().split('\n').map((l) => l.split(/\s+/)[0]).filter(Boolean);
}

function pm2LogMb() {
  const out = run('du', ['-sm', path.join(process.env.PM2_HOME || '/root/.pm2', 'logs')]);
  const n = parseInt(out, 10);
  return Number.isNaN(n) ? null : n;
}

function readState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return { problems: {}, restarts: {} };
  }
}

function writeState(state) {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

async function sendMail(subject, text) {
  const to = process.env.WATCHDOG_MAIL_TO || config.mail.adminNotify;
  if (!to || config.mail.provider !== 'smtp') {
    console.log(`[watchdog] Mail (nicht versendet, ${to ? 'kein SMTP' : 'WATCHDOG_MAIL_TO fehlt'}): ${subject}\n${text}`);
    return;
  }
  const nodemailer = require('nodemailer');
  const transport = nodemailer.createTransport({
    host: config.mail.smtp.host, port: config.mail.smtp.port, secure: config.mail.smtp.port === 465,
    auth: { user: config.mail.smtp.user, pass: config.mail.smtp.pass },
  });
  await transport.sendMail({ from: config.mail.from, to, subject, text });
}

async function main() {
  const host = process.env.WATCHDOG_NAME || `Server ${os.hostname()}`;
  if (process.argv.includes('--test-mail')) {
    await sendMail(`[${host}] Testmail Server-Wächter`, 'Der Server-Wächter kann Mails versenden.');
    console.log('[watchdog] Testmail versendet');
    return;
  }
  const state = readState();
  const apps = pm2Apps();
  const facts = {
    disk: disk(), memAvailableMb: memAvailableMb(), apps: apps || undefined, prevRestarts: state.restarts || {},
    urls: await checkUrls(), certs: certs(), backup: backup(), failedUnits: failedUnits(), pm2LogMb: pm2LogMb(),
  };
  const problems = evaluate(facts);
  const result = plan(state, problems);
  const msg = message(result, host);
  if (dry) {
    console.log(JSON.stringify({ facts: { ...facts, urls: facts.urls.map(({ body, ...u }) => u) }, problems }, null, 2));
    console.log(msg ? `${msg.subject}\n${msg.text}` : 'nichts zu melden');
    return;
  }
  if (msg) await sendMail(msg.subject, msg.text);
  writeState({ ...result.state, restarts: apps ? Object.fromEntries(apps.map((a) => [a.name, a.restarts])) : state.restarts || {}, checkedAt: new Date().toISOString() });
  if (process.env.WATCHDOG_HEARTBEAT_URL) {
    await fetch(process.env.WATCHDOG_HEARTBEAT_URL, { signal: AbortSignal.timeout(10000) }).catch((err) => console.error('[watchdog] Heartbeat:', err.message));
  }
  if (problems.length) console.log(`[watchdog] ${problems.length} Problem(e): ${problems.map((p) => p.text).join(' | ')}`);
}

main().catch((err) => {
  console.error('[watchdog]', err);
  process.exitCode = 1;
});
