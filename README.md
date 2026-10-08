# tri-hotel.de

Neutrale, filterbare Rankings (erstes Ranking: Triathlon-Hotels). Konzept: `docs/konzept.pdf`, Projektregeln: `CLAUDE.md`.

**Stand:** Entwurf von Version 1 (MVP) – alle sechs Umsetzungsschritte als erster Wurf, noch nicht auf dem Server getestet.

## Aufbau

```
src/
  server.js              Express, Helmet, Sessions, Routen
  config.js, db.js
  middleware/context.js  Ranking je Host/Subdomain, CSRF-Schutz, Admin-Login-Pflicht
  routes/
    public.js            /, /hotel/:slug, /triscore, /rankings/:slug[/...], /media/:id, Impressum, Datenschutz
    submit.js            /hotel-hinzufuegen, /bestaetigen/:token
    admin.js             /admin: Warteschlange, Detailprüfung, Freigabe, Anlegen, Bilder, Aufgaben, Log
    admin-rankings.js    /admin/rankings: Rankings, Kategorien, Kriterien
  services/
    scoring.js           gesamte Score-Logik (reine Funktionen, getestet)
    rankings.js          Laden + Neuberechnen + Live-Liste
    submissions.js       Meldeprozess und Admin-Entscheidungen
    mailer.js            Interface "mailer" (console | smtp)
    extractor.js         Interface "extractor" (none | anthropic), Website-Abruf, Fundstellen-Prüfung
    geo.js               Nominatim + Overpass, Regeln aus criteria.scoring.auto
    climate.js           Open-Meteo, Klima je Monat
  jobs/                  pg-boss: auto-check, verify-expiry (stündlich)
  views/                 EJS: public/, admin/, emails/
public/                  CSS, JS
db/                      schema.sql, seed_criteria.sql, migrations/
deploy/                  PM2- und Nginx-Konfiguration
test/                    node:test – Scoring (inkl. zweitem Ranking „Hyrox“), Geo, Klima, Extraktor
```

URLs ohne Triathlon-Annahmen: `/<objekttyp>/<slug>`, `/<objekttyp>-hinzufuegen` (alte Adresse `-melden` leitet weiter) und `/<scorename>` ergeben sich aus dem Standard-Ranking (`hotel`, `TriScore`).

## Einrichtung (auf dem VPS)

Datenbank `trihotel` mit `schema.sql` + `seed_criteria.sql` ist bereits eingespielt.

```bash
cd /var/www && git clone git@github.com:danielreuland/tri-hotel.git && cd tri-hotel
npm install
cp .env.example .env            # ausfüllen: DATABASE_URL, SESSION_SECRET, BASE_URL=https://tri-hotel.de, NODE_ENV=production
npm run migrate                 # db/migrations/*.sql
npm test
npm run create-admin -- info@triprep.de
pm2 start deploy/ecosystem.config.js && pm2 save
```

Nginx: `deploy/nginx-tri-hotel.conf` nach `/etc/nginx/sites-available/` kopieren, verlinken, `certbot --nginx -d tri-hotel.de -d www.tri-hotel.de`. Die App läuft auf Port **3010** (triprep-api belegt 3000).

## Deploy

```bash
git push
ssh root@87.106.155.249 "cd /var/www/tri-hotel && git pull && npm install --omit=dev && npm run migrate && pm2 restart tri-hotel"
```

## Leistungen und Suche

- **Leistungskatalog** (`/admin/leistungen`): einheitliche Namen je Objekttyp (z. B. „Sauna“ bei allen Hotels gleich). Leistungen mit Ableitung ergeben sich aus einem Fakt im Ranking (`features.derive`), die übrigen pflegt der Admin je Hotel oder die Auto-Prüfung schlägt sie mit Fundstelle vor.
- **Hotelseite**: „Leistungen auf einen Blick“ als gruppierte Stichpunktliste.
- **Suche** auf der Startseite: Hotel oder Ort, Land, Reisemonat, Mindest-Score und Leistungen (`features.filterable`). Die Reihenfolge bleibt immer nach Score.

## Sites, virtuelle Mitarbeiter, Einwilligungen

- **Sites** (`/admin/sites`): Mandanten mit eigener Marke, Domain, Farben, Absender und Impressum (z. B. tri-hotel.de, hybrid-hotel.de). Rankings gehören zu einer Site; die Site wird über den Host erkannt, lokal gilt die Standard-Site.
- **Virtuelle Mitarbeiter** je Site: Mia (Datenprüfung), Lara (Social Media), Ben (Kooperationen). Agenten-Mails sind mit Namen signiert und tragen immer den Hinweis, dass sie von der KI-Assistenz verfasst wurden (EU AI Act Art. 50). Aktionen stehen unter dem Namen im Log.
- **Einwilligungen** je Hotel und Site: Fotos auf dem Profil, Fotos in Social Media, Kontakt zu Kooperationen – mit Wortlaut-Version, Zeitpunkt, Quelle und Widerruf. Grundlage für spätere n8n-Abläufe: ohne gültige Einwilligung keine Aktion (`inquiries.hasConsent`).

## Anfragen an Betreiber

In der Prüfansicht startet „Anfrage ans Hotel“ einen Agenten (`services/inquiry-agent.js`), der eine sachliche Anfrage zu unklaren Werten – und auf Wunsch Fotos mit Nutzungserlaubnis – an die Kontakt-E-Mail des Betreibers schickt. Der Betreiber antwortet über `/anfrage/:token`; Antworten und Fotos werden erst nach Bestätigung im Admin übernommen (Werte als Vertrauensstufe 1, Fotos über die normale Bildfreigabe). Erinnerung nach 7 Tagen, Ablauf nach 30 Tagen. Ohne `LLM_PROVIDER` nutzt der Agent eine feste Vorlage (Fragen dann nur mit den deutschen Bezeichnungen).
Konfiguration: `MAIL_REPLY_TO` (Antworten per Mail), `ADMIN_NOTIFY_EMAIL` (Hinweis bei eingehender Antwort).

## Offen vor dem Livegang

- Mail-Anbieter (EU) wählen → `MAIL_PROVIDER=smtp` + SMTP-Zugang
- LLM-Anbieter festlegen → `LLM_PROVIDER=anthropic` + `LLM_API_KEY` (sonst läuft die Auto-Prüfung ohne Website-Extraktion)
- Impressum und Datenschutz vervollständigen und rechtlich prüfen lassen
- Anfragen an Betreiber, Einwilligungstexte (`src/lib/consents.js`) und KI-Kennzeichnung rechtlich prüfen lassen
- Absender-Adressen der virtuellen Mitarbeiter (mia@, lara@, ben@) beim Mail-Anbieter einrichten
- DNS für tri-hotel.de auf den VPS zeigen lassen
