// Server-Wächter (scripts/watchdog.js): bewertet gesammelte Messwerte und entscheidet, worüber gemailt wird.
// Reine Funktionen ohne Ein-/Ausgabe, damit sie testbar sind.

const LIMITS = {
  diskPercent: 85,        // Plattenbelegung ab hier melden
  memAvailableMb: 150,    // freier Arbeitsspeicher darunter melden
  certDays: 14,           // Certbot erneuert ab 30 Tagen Restlaufzeit; unter 14 Tagen hakt die Erneuerung
  backupHours: 30,        // tägliches Backup: älter als 30 Stunden = ausgefallen
  pm2LogMb: 1024,         // PM2-Logs zusammen größer als 1 GB
  restartsPerRun: 3,      // mehr Neustarts einer App seit dem letzten Lauf = Absturzschleife (Deploy zählt 1)
  remindHours: 24,        // bestehendes Problem erneut melden
};

const DAY = 86400000;

// facts: { disk: {percent}, memAvailableMb, apps: [{name, status, restarts}], prevRestarts: {name: n},
//          urls: [{url, status, body, expect, error}], certs: [{name, notAfter}], backup: {result, finishedAt},
//          failedUnits: [name], pm2LogMb }
// → [{ key, text }] – key bleibt für dasselbe Problem gleich (für Erinnerung und „behoben“)
function evaluate(facts, now = new Date(), limits = LIMITS) {
  const out = [];
  const add = (key, text) => out.push({ key, text });

  if (facts.disk && facts.disk.percent >= limits.diskPercent) add('disk', `Platte zu ${facts.disk.percent} % belegt (Grenze ${limits.diskPercent} %)`);
  if (facts.memAvailableMb != null && facts.memAvailableMb < limits.memAvailableMb) {
    add('memory', `Nur noch ${facts.memAvailableMb} MB Arbeitsspeicher frei (Grenze ${limits.memAvailableMb} MB)`);
  }

  for (const app of facts.apps || []) {
    if (app.status !== 'online') add(`pm2:${app.name}:status`, `PM2-App „${app.name}“ ist ${app.status}`);
    const prev = facts.prevRestarts && facts.prevRestarts[app.name];
    if (prev != null && app.restarts - prev > limits.restartsPerRun) {
      add(`pm2:${app.name}:restarts`, `PM2-App „${app.name}“ startet ständig neu (${app.restarts - prev} Neustarts seit der letzten Prüfung)`);
    }
  }
  if (facts.apps && !facts.apps.length) add('pm2:none', 'PM2 meldet keine laufenden Apps');

  for (const u of facts.urls || []) {
    if (u.error) add(`url:${u.url}`, `${u.url} nicht erreichbar (${u.error})`);
    else if (u.status >= 500) add(`url:${u.url}`, `${u.url} antwortet mit Fehler ${u.status}`);
    else if (u.expect && !String(u.body || '').includes(u.expect)) add(`url:${u.url}`, `${u.url} liefert nicht „${u.expect}“ (Status ${u.status})`);
  }

  for (const c of facts.certs || []) {
    const days = Math.floor((new Date(c.notAfter) - now) / DAY);
    if (days < limits.certDays) add(`cert:${c.name}`, `Zertifikat ${c.name} läuft in ${days} Tagen ab – Erneuerung prüfen (certbot renew)`);
  }

  if (facts.backup) {
    const { result, finishedAt } = facts.backup;
    const ageH = finishedAt ? (now - new Date(finishedAt)) / 3600000 : Infinity;
    if (result && result !== 'success') add('backup', `Letztes Server-Backup fehlgeschlagen (${result})`);
    else if (ageH > limits.backupHours) add('backup', `Letztes Server-Backup ist älter als ${limits.backupHours} Stunden`);
  }

  for (const unit of facts.failedUnits || []) add(`unit:${unit}`, `Systemdienst ${unit} ist fehlgeschlagen`);

  if (facts.pm2LogMb != null && facts.pm2LogMb > limits.pm2LogMb) add('pm2logs', `PM2-Logs belegen ${facts.pm2LogMb} MB (Grenze ${limits.pm2LogMb} MB)`);

  return out;
}

// Vergleicht mit dem letzten Lauf: neue Probleme, behobene, fällige Erinnerungen und den neuen Zustand.
// state.problems = { key: { text, since, mailedAt } }
function plan(state, problems, now = new Date(), limits = LIMITS) {
  const prev = (state && state.problems) || {};
  const next = {};
  const fresh = [];
  const reminders = [];
  for (const p of problems) {
    const old = prev[p.key];
    if (!old) {
      fresh.push(p);
      next[p.key] = { text: p.text, since: now.toISOString(), mailedAt: now.toISOString() };
    } else if (now - new Date(old.mailedAt) >= limits.remindHours * 3600000) {
      reminders.push({ ...p, since: old.since });
      next[p.key] = { ...old, text: p.text, mailedAt: now.toISOString() };
    } else {
      next[p.key] = { ...old, text: p.text };
    }
  }
  const resolved = Object.entries(prev).filter(([key]) => !next[key]).map(([key, v]) => ({ key, text: v.text, since: v.since }));
  return { fresh, reminders, resolved, state: { problems: next } };
}

// Betreff und Text einer Meldung; null, wenn es nichts zu melden gibt
function message({ fresh, reminders, resolved }, host) {
  if (!fresh.length && !reminders.length && !resolved.length) return null;
  const open = fresh.length + reminders.length;
  const subject = open
    ? `[${host}] ${open === 1 ? '1 Problem' : `${open} Probleme`}${fresh.length ? '' : ' (Erinnerung)'}`
    : `[${host}] behoben`;
  const fmt = (d) => new Date(d).toLocaleString('de-DE', { timeZone: 'Europe/Berlin', dateStyle: 'short', timeStyle: 'short' });
  const lines = [];
  if (fresh.length) lines.push('Neu:', ...fresh.map((p) => `- ${p.text}`), '');
  if (reminders.length) lines.push('Besteht weiter:', ...reminders.map((p) => `- ${p.text} (seit ${fmt(p.since)})`), '');
  if (resolved.length) lines.push('Behoben:', ...resolved.map((p) => `- ${p.text} (seit ${fmt(p.since)})`), '');
  lines.push('– Server-Wächter (scripts/watchdog.js), Prüfung alle 5 Minuten');
  return { subject, text: lines.join('\n') };
}

module.exports = { LIMITS, evaluate, plan, message };
