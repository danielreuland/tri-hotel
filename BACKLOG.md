# Backlog tri-hotel.de

Gemeinsamer Stand für beide Rechner (siehe `CLAUDE.md` → „Arbeiten auf zwei Rechnern“). Erledigtes nach unten verschieben,
Entscheidungen mit Datum festhalten. Reihenfolge = Priorität.

## In Arbeit / als Nächstes (Entwicklung)

### Offen aus „Buchen & Anfragen“
- **Tripadvisor-Note** (Bubbles, Anzahl) über die Content API – vorher Freischaltung und Bedingungen prüfen.
  Heute: nur Link „Tripadvisor ↗“ (Suchseite bzw. eigener Link je Hotel) neben Google.
- hotel.de: Such-Adresse mit {q} eintragen (Format unbekannt), damit auch Hotels ohne eigenen Link einen Preis-Link bekommen.

### 1. SEO prüfen und optimieren (Agenda 21.10.)
Search Console (erste indexierte Seiten, Fehler), Titel/Beschreibungen, interne Links, strukturierte Daten, Ladezeit,
Inhalte je Region/Land.

### 2. Konzept: Anfrage-Workflows bis zur Klärung, mit Voice-Agents (Agenda 21.10.)
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
- **Expedia (BEX DACH über Awin) aktivieren**: in Awin prüfen, ob Deeplinks erlaubt sind (Programmdetails „Deeplinking“);
  Programm-ID (awinmid) und Publisher-ID (awinaffid) in die Deeplink-Vorlage
  `https://www.awin1.com/cread.php?awinmid=…&awinaffid=…&ued={url_enc}` eintragen, aktivieren. Direktlink und Markenhinweis
  sind voreingestellt (Branch expedia-bedingungen). Ohne Deeplink-Erlaubnis: Suchlinks abschalten und je Hotel Links aus dem
  Awin-Linkgenerator eintragen. Regeln: keine Gutscheine/Rabatt-Versprechen, keine Expedia-Links in E-Mails/Offline,
  „Expedia“ nicht in Seitentitel/Meta-Tags, Social-Media-Posts mit Expedia-Bezug als Werbung kennzeichnen (Lara).
  Hotels.com = eigenes Programm.
- **hotel.de aktivieren**: Admin → Einstellungen → Partnerprogramme → Kennung bzw. Deeplink-Vorlage eintragen,
  Reihenfolge festlegen (kleinste Zahl = Hauptknopf „Preise prüfen“), Status aktiv. Expedia nutzt ohne eigenen Link je Hotel
  die Suchseite (Name + Ort) – prüfen, ob das Programm Such-Deeplinks vergütet.
- Partnerprogramme: Awin-Publisher-/Programm-ID für HolidayCheck nach Freigabe; Booking-Bewerbung, sobald Search Console
  indexierte Seiten zeigt.
- Plausible: Ziel „Hotel-Anfrage-Start“ anlegen (Klick auf „Trainingslager anfragen“).
- Hunter.io-Konto („account restricted“) prüfen.
- Ausfallüberwachung (UptimeRobot), Plausible-Ziel „Hotelvergleich“ + Eigenschaften `anbieter`/`art`, Gewerbeanmeldung vor Provisionen.
- Alte Erinnerung „Off-Site-Backup“ auf dem Firmen-Mac löschen (neue liegt auf dem privaten Mac, 04.01.2027).

## Zur Info: Server-Konfiguration (nur `.env`, nicht im Repo)
`MAIL_PROVIDER=smtp` über info@tri-hotel.de (IONOS), `MAIL_INBOUND=imap`, `NOINDEX=false`; Site-Absender `info@tri-hotel.de`.
Search Console bestätigt, Sitemap eingereicht. PM2 im Cluster-Modus (Reload ohne Ausfall). Server-Sicherung der früheren
`package-lock.json`: `/root/package-lock.server-backup.json`.

## Erledigt (Oktober 2026, Kurzfassung)
- 26.10. **Hotel-Liste im Admin**: Suche (Name, Ort, Website), Filter Land und Region, kombinierbar mit Status/Ranking.
- 26.10. **Buchen & Anfragen** auf der Hotelseite: Hauptknopf „Preise prüfen“ (erster aktiver Preis-Anbieter in Admin-Reihenfolge),
  weitere Anbieter als Textzeile, direkt beim Hotel; Handy-Leiste unten; Suchlinks für Hotels ohne eigenen Link (auto_search);
  Programme Expedia/hotel.de (inaktiv bis Kennung), Tripadvisor als Bewertungslink; Admin: Reihenfolge, Such-Adresse,
  Programme anlegen (Migration 056). **„Trainingslager anfragen“**: Hotel als Empfänger der Camp-Anfrage (allein oder
  zusätzlich zu Anbietern), Weiterleitung im Sie-Ton, kostenlos, gleicher Ablauf inkl. Nachfrage (Migration 057).
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
