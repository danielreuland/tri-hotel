# Backlog tri-hotel.de

Gemeinsamer Stand für beide Rechner (siehe `CLAUDE.md` → „Arbeiten auf zwei Rechnern“). Erledigtes nach unten verschieben,
Entscheidungen mit Datum festhalten. Reihenfolge = Priorität.

## In Arbeit / als Nächstes (Entwicklung)

### 1. Suche und Filter in der Hotel-Liste (`/admin`) – in Arbeit (26.10.2026)
Suchfeld „Name oder Ort“ (Name, Ort, Website; ohne Groß-/Kleinschreibung und Akzente), Auswahl Land und Region (nur
vorkommende Werte, mit Anzahl), kombinierbar mit Status-Pillen und Ranking; Pillen-Zahlen berücksichtigen die Filter;
leerer Treffer mit „Filter zurücksetzen“; GET-Parameter (Lesezeichen möglich).

### 2. Hotelseite „Buchen & Anfragen“ (Konzept 19.10.2026, bestätigt) – danach
Affiliate-Programme aktuell (26.10.): **hotel.de** und **Expedia** (Expedia Group; Hotels.com ggf. über dasselbe Programm).
Booking und HolidayCheck folgen nach Freigabe.
- **a) Direktbuchung:** Box „Buchen & Anfragen“ (Handy: schmale feste Leiste unten). Ein Hauptknopf „Preise prüfen“ →
  im Admin festgelegter Standard-Anbieter; darunter Textzeile „Auch bei: … · direkt beim Hotel“, keine Logo-Knöpfe.
  „Direkt beim Hotel“ (ohne Provision) immer dabei. Kennzeichnung „Anzeige“; Reihenfolge legt der Admin fest, nie Einfluss
  auf Score/Sortierung. Technik: `partner_programs`/`entity_links`, `/go/:slug/:program`.
- **b) „Trainingslager anfragen“ beim Hotel:** Formular (Vorname, E-Mail, Zeitraum, Gruppengröße, Bedarf, Nachricht,
  Einwilligung mit Hotelnamen) → E-Mail-Bestätigung → Admin-Prüfung → Weiterleitung an `entities.contact_email` mit Reply-To.
  Aufbauend auf `camp_leads`/`services/leads.js`. Start kostenlos für alle Hotels mit Kontaktadresse. Kein WhatsApp.
  Plausible-Ziel „Hotel-Anfrage“.
- **c) Tripadvisor:** Note, Anzahl, Link „Alle Bewertungen auf Tripadvisor“ im Abschnitt „Bewertungen anderswo“ (mit Google),
  nie im Score. Quelle Content API – vorher Bedingungen prüfen; sonst einfacher Link.

### 3. SEO prüfen und optimieren (Agenda 21.10.)
Search Console (erste indexierte Seiten, Fehler), Titel/Beschreibungen, interne Links, strukturierte Daten, Ladezeit,
Inhalte je Region/Land.

### 4. Konzept: Anfrage-Workflows bis zur Klärung, mit Voice-Agents (Agenda 21.10.)
Anfrage → Erinnerung → nächste Stufe bis zur Klärung, inkl. Anrufen per Voice-Agent. Vorab klären: Telefonkontakt zu
Unternehmen (UWG § 7 Abs. 2, mutmaßliche Einwilligung), KI-Kennzeichnung am Telefon (EU AI Act Art. 50),
Aufzeichnung/Transkript (DSGVO), Anbieter und Kosten.

## Kleinere offene Punkte
- Jährliche Nachprüfung aktiver Camp-Anbieter als Board-Aufgabe.
- Camp-Prüfung: Impressum-/Kontaktseite gezielt mitladen (wird oft nicht gefunden); Trivolution-Website liefert 404.
- Abgleichsfelder der Camp-Anbieter (Monate, Niveaus, Gruppengröße, Preis) per Camp-Prüfung vorschlagen.
- Reihenfolge verknüpfter Hotels beim Camp-Anbieter folgt der Liste (alphabetisch), nicht der Klickreihenfolge.
- Landingpage „Trainingslager für Vereine“ (später).
- Grunddaten: bei stark verschobenen Koordinaten alte automatische Umgebungswerte (Stufe 4) ggf. verwerfen statt behalten.
- Eigene KI-Mail-Mustertexte (falls angepasst) haben den Abschnitt `{{#bestaetigen}}` nicht automatisch.

## Zu entscheiden (Daniel)
- Preis je geteilter Camp-Anfrage (A3, zurückgestellt; Vorschlag: halber Preis einer Einzelanfrage).
- `geo-refresh` für live-Objekte: würde ungeprüfte Vorschläge sofort in den Score bringen.
- triprep: Branch `pwa-nutrition` (Commit 16adf7a, PWA + Nutrition Logs, ändert server.js) übernehmen oder verwerfen.

## Zu erledigen (Daniel)
- Robinson Club Fleesensee und Hotel BCL Podium: zurückgesetzte Anfrage-Entwürfe prüfen und neu freigeben.
- **Tauern Spa Kaprun: Anfang November erneut senden** (Empfänger-Spamfilter hatte die junge Domain abgewiesen; Adresse korrekt).
- Partnerprogramme: Awin-Publisher-/Programm-ID für HolidayCheck nach Freigabe; Booking-Bewerbung, sobald Search Console
  indexierte Seiten zeigt; Zugangsdaten/Linkformat hotel.de und Expedia für die Einrichtung bereithalten.
- Hunter.io-Konto („account restricted“) prüfen.
- Ausfallüberwachung (UptimeRobot), Plausible-Ziel „Hotelvergleich“ + Eigenschaften `anbieter`/`art`, Gewerbeanmeldung vor Provisionen.
- Alte Erinnerung „Off-Site-Backup“ auf dem Firmen-Mac löschen (neue liegt auf dem privaten Mac, 04.01.2027).

## Zur Info: Server-Konfiguration (nur `.env`, nicht im Repo)
`MAIL_PROVIDER=smtp` über info@tri-hotel.de (IONOS), `MAIL_INBOUND=imap`, `NOINDEX=false`; Site-Absender `info@tri-hotel.de`.
Search Console bestätigt, Sitemap eingereicht. PM2 im Cluster-Modus (Reload ohne Ausfall). Server-Sicherung der früheren
`package-lock.json`: `/root/package-lock.server-backup.json`.

## Erledigt (Oktober 2026, Kurzfassung)
- 26.10. **Grunddaten vor der Auto-Prüfung**: Website, Google-Eintrag (Place ID automatisch bei eindeutigem Treffer),
  Koordinaten aus offenen Quellen mit Google-Abgleich; Status „wartet auf Grunddaten“, Vorschlag mit Karte, automatische
  Fortsetzung, `geo-followup` nach Koordinaten-Änderung (services/basics.js, Migration 055). Google-Koordinaten werden
  wegen der Nutzungsbedingungen nie gespeichert.
- 26.10. Hotelseite: Camp-Anbieter und Anfrage-Knöpfe gleich groß.
- 22.10. Becken ohne K.O., Mehrfachauswahl; Radrevier kalibriert; Hotel-Import aus Liste.
- 21.10. Camp-Sammelanfrage (3 + 2 Anbieter, Nachfrage nach 7 Tagen); Radrevier je Gebiet; Camp-Anbieter-Kontakt.
- 20.10. Camp-Anbieter automatisch qualifizieren; Hotelqualifizierung (PDF, Badegewässer, Höhendaten); Kontaktadresse über OSM/Hunter.
- 19.10. KI-Mails (Persona-Stil + Mustertext je Anlass); bekannte Angaben und Leistungen bestätigen lassen; Hotel ↔ Camp-Anbieter
  per Auswahl; Postfach (IMAP, Zuordnung, Board); Anfragen in zwei Schritten; Fix Bestätigungsmail; NOINDEX aus, Search Console.
