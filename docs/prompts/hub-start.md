# Start-Prompt: Hub danielreuland.com (neue Sitzung, neues Repo)

Zum Einfügen in eine neue Claude-Code-Sitzung im leeren Ordner des neuen Repos (z. B. `~/Code/danielreuland-com`).

---

Ich bin Daniel Reuland und baue **danielreuland.com** neu als „Dach“ über meine Projekte. Kommuniziere mit mir immer auf
Deutsch. Bitte lies diesen Text vollständig, stelle danach deine Rückfragen und schlage einen Plan für Schritt 1 vor,
bevor du Code schreibst.

## Ziel
1. **Öffentlich:** persönliche Seite mit meinen Projekten (Projektkarten): triprep.de (Schweißrate und Wettkampfernährung
   für Triathleten), tri-hotel.de (neutrales Ranking von Hotels fürs Triathlon-Trainingslager), fitnessracing-hotel.de
   (Ranking für Fitness Racing/Hyrox, in Vorbereitung; hybrid-hotel.de leitet dorthin weiter). Dazu Impressum und Datenschutz.
2. **Admin unter `/admin`** (vorerst nur ich, Login mit Passwort + Sitzung; Rollen später, z. B. über Labels eines Boards):
   - Dashboard mit Kennzahlen aus den Projekten (über die interne API, siehe unten)
   - **CRM Schritt 1: Firmen und Kontakte**
3. Später (nicht jetzt bauen): Vertriebspipeline, Verträge, Rechnungen, gemeinsamer Login über alle Apps, Board mit Rollen.

## CRM Schritt 1 – fachliche Regeln (entschieden)
- Eine **Firma** hat mehrere **Kontakte**; ein Kontakt gehört zu **höchstens einer** Firma.
- Ein Kontakt kann mit einem **triprep-Nutzer** verknüpft sein.
- Eine Firma kann mit **Hotels** oder **Camp-Anbietern** in tri-hotel verknüpft sein (eine Hotelkette mit mehreren Hotels;
  jedes Hotel hängt an höchstens einer Firma).
- Vorschlag Datenmodell (bitte prüfen und verbessern):
  - `companies` (Name, Website, Adresse, Land, Notizen, Status, Zeitstempel)
  - `contacts` (company_id optional, Vor-/Nachname, Funktion, E-Mail, Telefon, Notizen, Quelle)
  - `company_links` (company_id, app = 'tri-hotel', kind = 'entity' | 'camp_provider', external_id, Anzeigename als Cache;
    UNIQUE (app, kind, external_id))
  - `contact_links` (contact_id, app = 'triprep', kind = 'user', external_id; UNIQUE)
  - `admin_users`, `audit_log` (jede Änderung mit Zeitpunkt, wer, was, alt/neu)
- Datenschutz: nur Geschäftskontakte; Verknüpfung zu triprep-Nutzern nur mit minimalen Daten, keine Trainings-/Gesundheitsdaten
  ins CRM. Lösch- und Auskunftsmöglichkeit je Kontakt mitdenken; Datenschutzerklärung entsprechend.

## Interne API
Die Apps tauschen Daten über eine versionierte interne API aus. Der Vertrag für tri-hotel steht im tri-hotel-Repo unter
`docs/internal-api.md` (GitHub `danielreuland/tri-hotel`) – bitte dort lesen und genau so umsetzen (Client-Seite):
- nur lesend in v1: Hotels und Camp-Anbieter suchen (für die Verknüpfung im CRM), Kennzahlen fürs Dashboard
- Aufruf direkt über `http://127.0.0.1:3010` (gleicher Server), HMAC-Signatur mit eigenem Geheimnis je App, Zeitstempel
- **Neutralität:** tri-hotel bekommt aus dem Hub nie einen Partner- oder Vertragsstatus; nichts beeinflusst dort Score oder
  Reihenfolge.
- Die tri-hotel-Seite der API baut eine andere Sitzung im tri-hotel-Repo. Bis sie live ist: Client gegen den Vertrag mit
  Tests (gemockte Antworten) bauen. triprep bekommt später einen eigenen Vertrag (Nutzersuche nur per exakter E-Mail).

## Technik (wie in meinen anderen Projekten)
- Node.js 20 + Express, server-seitiges Rendering mit EJS, PostgreSQL 16, Tests mit `node:test` (`npm test`), Migrationen in
  `db/migrations/` (nummeriert), Konfiguration nur über `.env` (Vorlage `.env.example`, keine Secrets im Repo oder Chat).
- Sicherheit: helmet mit strenger CSP, Sitzungen in Postgres (connect-pg-simple), CSRF-Schutz bzw. Same-Origin-Prüfung bei
  Formularen, Passwort-Hash (bcrypt/argon2), Rate-Limit beim Login, keine externen Skripte/Schriften/CDNs.
- Oberfläche Deutsch, schlicht und gut lesbar, Hell- und Dunkelmodus, mobil nutzbar.
- Keine Fotos fremder Websites übernehmen (Urheberrecht).

## Server (bereits vorhanden)
- VPS `root@87.106.155.249`, Ubuntu 24.04, Nginx, PM2, PostgreSQL 16 lokal (127.0.0.1:5432), Firewall nur 22/80/443.
- Belegte Ports: 3000 (triprep-api), 3010 (tri-hotel), 5678/5679 (n8n), 8000 (Plausible). **Vorschlag für den Hub: 3020**,
  nur auf 127.0.0.1. PM2-App-Name `danielreuland-com`, Code unter `/var/www/danielreuland-com`, eigene Datenbank
  `danielreuland` mit eigenem Nutzer (das tägliche Server-Backup sichert alle Datenbanken automatisch).
- danielreuland.com und www zeigen schon auf den Server, Let's-Encrypt-Zertifikat ist eingerichtet. Derzeit liefert Nginx
  (Site `/etc/nginx/sites-available/danielreuland.com`) eine **statische Platzhalterseite** aus `/var/www/danielreuland.com/html`
  (Projekte, Impressum, Datenschutz – Texte übernehmen). Beim Umstieg: Nginx auf `proxy_pass http://127.0.0.1:3020` umstellen,
  www → https://danielreuland.com beibehalten, Zugriffslogs 7 Tage (Ordner `/var/log/nginx/danielreuland.com`).
- Ein Server-Wächter (systemd-Timer aus dem tri-hotel-Repo) prüft u. a. Websites per HTTP; einen Gesundheits-Endpunkt
  `/healthz` (antwortet `ok`, prüft die DB) bitte von Anfang an einbauen.
- Impressum: Daniel Reuland, Lettow-Vorbeck-Str. 32, 67659 Kaiserslautern, E-Mail daniel@danielreuland.com.

## Arbeitsweise
- Ich arbeite auf zwei Rechnern; Abgleich nur über Git (GitHub, Repo z. B. `danielreuland/danielreuland-com`). Vor der
  Arbeit `git pull`, am Ende committen und pushen. Stand und Entscheidungen gehören in `CLAUDE.md` und `BACKLOG.md` des Repos
  (lege beide zu Beginn an, inkl. dieser Ziele und Regeln).
- **Deploy auf den Server nur, wenn ich ausdrücklich „veröffentlichen“ sage.** Vorher Tests grün.
- Commits enden mit `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Zugangsdaten, API-Schlüssel und Passwörter trage ich selbst in die Server-`.env` ein (du gibst mir den Befehl mit `read -s`).
- Andere Projekte (tri-hotel, triprep) auf dem Server nicht verändern, außer ich erlaube es ausdrücklich.

## Schritt 1 (bitte zuerst planen)
1. Repo-Grundgerüst, CLAUDE.md, BACKLOG.md, `.env.example`, Migration für das Datenmodell, Tests.
2. Öffentliche Startseite (Inhalte der Platzhalterseite übernehmen), Impressum, Datenschutz, `/healthz`.
3. Admin-Login (Konto per Skript anlegen), Firmen und Kontakte anlegen/bearbeiten/suchen, Audit-Log.
4. Verknüpfung Firma ↔ tri-hotel-Hotel/Camp-Anbieter über die interne API (sobald tri-hotel sie bereitstellt).
5. Danach Deployment-Plan (PM2, Nginx, Datenbank) – erst nach meinem „veröffentlichen“.
