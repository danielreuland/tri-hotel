// Mail-Quelle IMAP (z. B. IONOS: imap.ionos.de:993). Interface jeder Quelle:
//   run(handler) – ruft handler(rohe Mail als Buffer) für jede neue Mail auf; liefert der handler true,
//   gilt die Mail als verarbeitet und wird in der Quelle weggeräumt (hier: Ordner „Verarbeitet“).
// Eine spätere Gmail-Quelle (Google Workspace) implementiert dasselbe run() mit Labels statt Ordnern.
const { ImapFlow } = require('imapflow');
const config = require('../../config');

const MAX_PER_RUN = 50;

async function run(handler) {
  const c = config.mail.inbound.imap;
  if (!c.host || !c.user || !c.pass) throw new Error('IMAP ist nicht konfiguriert (IMAP_HOST, Zugang wie SMTP).');
  const client = new ImapFlow({ host: c.host, port: c.port, secure: c.port === 993, auth: { user: c.user, pass: c.pass }, logger: false });
  await client.connect();
  try {
    // Zielordner einmalig anlegen (Fehler „existiert bereits“ ignorieren)
    try { await client.mailboxCreate(c.doneFolder); } catch { /* vorhanden */ }
    const lock = await client.getMailboxLock(c.folder);
    try {
      const uids = (await client.search({ all: true }, { uid: true })) || [];
      for (const uid of uids.slice(0, MAX_PER_RUN)) {
        const msg = await client.fetchOne(String(uid), { source: true }, { uid: true });
        if (!msg || !msg.source) continue;
        if (await handler(msg.source)) await client.messageMove(String(uid), c.doneFolder, { uid: true });
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => {});
  }
}

module.exports = { run };
