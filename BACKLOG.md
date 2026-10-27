# Backlog tri-hotel.de

Gemeinsamer Stand für beide Rechner (siehe `CLAUDE.md` → „Arbeiten auf zwei Rechnern“). Erledigtes nach unten verschieben,
Entscheidungen mit Datum festhalten. Reihenfolge = Priorität.

## In Arbeit / als Nächstes (Entwicklung)

### Offen aus „Buchen & Anfragen“
- **Tripadvisor-Note** (Bubbles, Anzahl) über die Content API – vorher Freischaltung und Bedingungen prüfen.
  Heute: nur Link „Tripadvisor ↗“ (Suchseite bzw. eigener Link je Hotel) neben Google.
- hotel.de: Such-Adresse mit {q} eintragen (Format unbekannt), damit auch Hotels ohne eigenen Link einen Preis-Link bekommen.

### Trainingsregionen (Konzept 27.10.2026, von Daniel freigegeben)
Ziel: Regionen eigenständig auffindbar und vergleichbar machen, v. a. beim Klima; mehr Kontext je Regionsseite. Kein neuer
Gesamt-Score für Regionen (Neutralität) – nur Daten mit Quelle.
1. **Daten je Region – in Arbeit (27.10.)**: Klima je Monat für den Regionsmittelpunkt direkt von Open-Meteo (Tageshöchst-/
   Tiefstwert, Regentage, Wind, Sonnenstunden, Wassertemperatur für Küstenregionen), Radrevier-Berechnung (OSM) auch für
   Regionen ohne Hotels (Kreta, Zypern, Girona). Aktualisierung jährlich bzw. per Knopf im Admin.
2. **Übersicht `/trainingsregionen` mit Menüpunkt**: alle Regionen (auch ohne Hotels), Klima als Monatsraster mit besten Monaten,
   Auswahl „Ich reise im …“ (Sortierung nach Eignung im Monat), je Region Radrevier mit 2–3 Kennzahlen, Wasser, Wind, Hotels
   und bester TriScore, Camps; Direktvergleich von 2–3 Regionen (`/trainingsregionen/vergleich/a-vs-b`).
3. **Regionsseiten mit Kontext**: Klima je Monat inkl. Wind/Wasser/Sonne, Radrevier in Worten und Zahlen (Quelle OSM),
   Schwimmen/Laufen in der Region (Badegewässer, 50-m-Becken, Bahnen – soweit aus vorhandenen Abfragen ableitbar),
   beste Reisezeit mit Begründung, Camps, Hotels; später Regionstext per KI (nach neuem Prompt).

### 1. SEO – Bestandsaufnahme 26.10.2026 und nächste Schritte
Technik ist solide (76 Sitemap-URLs alle 200, je eine H1, Canonical, Beschreibung 70–160 Zeichen, og:image, keine doppelten
Titel, alt-Texte, HTTPS/HSTS, gzip, Ø 21 ms). Erledigt 26.10.: lange Titel gekürzt (seo.entityTitle), aggregateRating aus
Athleten-Bewertungen. Offen, nach Wirkung sortiert:
- **Redaktionstexte** (zuerst Daniel: Prompt der Hotelbeschreibung nachschärfen, dann Sammelaktion): nur 10 von 42 Live-Hotels haben einen freigegebenen Text („Unsere Einschätzung“) – eigener, einzigartiger
  Inhalt ist der größte Hebel. Vorschlag: Sammelaktion „Entwurf erzeugen“ für alle Live-Hotels ohne Text (ca. 3 Cent je Text)
  + Board-Karte „Text prüfen und freigeben“.
- **Mehr Hotels je Region**: Teneriffa, Gardasee, Algarve haben nur 1 Hotel (Regionsseite bleibt unter der Mindestzahl 2 noindex),
  Kreta/Zypern/Girona 0. Die 99 geparkten Import-Hotels würden das füllen (siehe „Zu entscheiden“).
- **Dünne Seiten**: 21 Camp-Anbieter-Profile und /region/fuerteventura haben < 300 Wörter. Anbieter-Profile anreichern
  (Kurzprofil, Leistungen, Zielorte, Hotels, Preise ausformulieren; ggf. KI-Entwurf wie bei Hotels) oder bis dahin noindex.
- **Search Console** (ab ca. Anfang November aussagekräftig): Indexierung, Suchanfragen, CTR je Seite auswerten → Titel/
  Beschreibungen gezielt nachschärfen, Themen für neue Seiten ableiten.
- Kleinigkeiten: /triscore ohne strukturierte Daten (z. B. FAQ), Länderseiten mit nur 1 Hotel (PT, IT, TR).
- Später: Landingpage „Trainingslager für Vereine“, Ratgeberinhalte, Backlinks (Vereine, Verbände, Triathlon-Blogs).

### Hotelseite überarbeiten (Vorschläge 26.10.2026: https://claude.ai/artifact/7frxWXoET4Ftu7oJ3YJwjN)
- **A Steckbrief – umgesetzt 27.10.** (siehe Erledigt).
- **B nach Disziplinen – sobald Daniel den Prompt der Redaktionstexte überarbeitet hat.** Einschätzung, Fakten mit Quelle,
  Leistungen, Athleten-Note und passende Fotos je Kategorie zusammenführen (Reiter bzw. Sprungmarken); „Unsere Einschätzung“,
  „Leistungen auf einen Blick“ und „Fakten“ entfallen als getrennte Blöcke. Der neue Prompt sollte Texte je Kategorie liefern.
- **C Entscheidungshilfe – wenn genügend Hotelfotos mit Nutzungsrecht vorliegen** (dauert voraussichtlich). Hero-Foto mit Score,
  „Passt zu dir, wenn … / Eher nicht, wenn …“, Reisemonat wählen (Klima und Score je Monat), Mini-Vergleich mit zwei
  Alternativen, Sprungleiste. Mini-Vergleich und „Passt zu dir“ ggf. vorab einzeln.
- Offen aus „Gilt für jede Variante“: Karte als kleines Vorschaubild statt „Karte laden“-Fläche.

### 2. Konzept: Anfrage-Workflows bis zur Klärung, mit Voice-Agents (Agenda 21.10.)
Anfrage → Erinnerung → nächste Stufe bis zur Klärung, inkl. Anrufen per Voice-Agent. Vorab klären: Telefonkontakt zu
Unternehmen (UWG § 7 Abs. 2, mutmaßliche Einwilligung), KI-Kennzeichnung am Telefon (EU AI Act Art. 50),
Aufzeichnung/Transkript (DSGVO), Anbieter und Kosten.

## Kleinere offene Punkte
- Admin → Rankings bearbeiten: Die Formel-Prüfung verlangt nur Zahlen, `best_time` ist aber ein Objekt – Speichern des
  Rankings scheitert vermutlich mit „best_time muss eine Zahl sein“ (prüfen und Objekte für bekannte Schlüssel zulassen).
- Jährliche Nachprüfung aktiver Camp-Anbieter als Board-Aufgabe.
- Camp-Prüfung: Impressum-/Kontaktseite gezielt mitladen (wird oft nicht gefunden); Trivolution-Website liefert 404.
- Abgleichsfelder der Camp-Anbieter (Monate, Niveaus, Gruppengröße, Preis) per Camp-Prüfung vorschlagen.
- Reihenfolge verknüpfter Hotels beim Camp-Anbieter folgt der Liste (alphabetisch), nicht der Klickreihenfolge.
- Landingpage „Trainingslager für Vereine“ (später).
- Grunddaten: bei stark verschobenen Koordinaten alte automatische Umgebungswerte (Stufe 4) ggf. verwerfen statt behalten.
- Eigene KI-Mail-Mustertexte (falls angepasst) haben den Abschnitt `{{#bestaetigen}}` nicht automatisch.

## Zu entscheiden (Daniel)
- **99 importierte Hotels (Import 22.10., 19:11) ohne Auto-Prüfung**: 124 von 125 Prüf-Jobs wurden beim Import sofort
  abgebrochen (pg-boss „cancelled“); die Meldungen stehen auf „bestätigt“ und erscheinen als „Auto-Prüfung hängt“.
  Am 26.10. entschieden: liegen lassen. Bei Bedarf in Etappen (z. B. 20) starten – Kosten ca. 0,13 $ KI + 0,03 $ Places je Hotel.
- Preis je geteilter Camp-Anfrage (A3, zurückgestellt; Vorschlag: halber Preis einer Einzelanfrage).
- `geo-refresh` für live-Objekte: würde ungeprüfte Vorschläge sofort in den Score bringen.
- triprep: Branch `pwa-nutrition` (Commit 16adf7a, PWA + Nutrition Logs, ändert server.js) übernehmen oder verwerfen.

## Zu erledigen (Daniel)
- Robinson Club Fleesensee und Hotel BCL Podium: zurückgesetzte Anfrage-Entwürfe prüfen und neu freigeben.
- **Tauern Spa Kaprun: Anfang November erneut senden** (Empfänger-Spamfilter hatte die junge Domain abgewiesen; Adresse korrekt).
- **Expedia scharf schalten** (technisch fertig, 26.10.): je Hotel unter Stammdaten → Partnerlinks → Expedia die
  Expedia-Hotel-ID (z. B. 793891) oder die Adresse der Hotelseite eintragen; dann Partnerprogramme → Expedia aktiv,
  Reihenfolge setzen (z. B. 5 = Hauptknopf). Einmal testen: „Preise prüfen“ → Adresse enthält
  affcid=…cj.101907930.13904715.<hotel> und die richtige Hotelseite (Kurzform h{id}.Hotel-Information prüfen).
  Regeln: keine Gutscheine, keine Expedia-Links in E-Mails/Offline, „Expedia“ nicht in Titeln/Meta-Tags,
  Social-Media-Posts mit Expedia-Bezug als Werbung kennzeichnen (Lara).
- **hotel.de (über Awin) – später**: Programm hat keine Deeplinks; nur Startseiten-Links wären auf Hotelseiten irreführend,
  daher bis auf Weiteres inaktiv. Wieder aufgreifen, wenn Deeplinks oder ein Such-Link möglich sind.
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
- 27.10. **Hotelseite Variante A**: Steckbrief oben (Score, Punkte je Kategorie, Kernfakten aus Kriterien mit
  „im Steckbrief zeigen“ – Admin → Rankings → Kriterium, Migration 061 – plus beste Reisezeit; Herleitung zum Aufklappen),
  Buchen & Anfragen daneben (am Handy nur die Leiste), Fotos als Streifen, Kopfzeile am Handy mit Menü-Knopf.
- 26.10. Board-Aufgabe „Partnerlink prüfen / generieren“ je Live-Hotel ohne Preis-Link eines aktiven Programms mit Provision;
  Provisions- und Markenhinweis klein am Seitenende.
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
