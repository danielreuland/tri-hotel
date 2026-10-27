# Backlog tri-hotel.de

Gemeinsamer Stand für beide Rechner (siehe `CLAUDE.md` → „Arbeiten auf zwei Rechnern“). Erledigtes nach unten verschieben,
Entscheidungen mit Datum festhalten. Reihenfolge = Priorität.

## In Arbeit / als Nächstes (Entwicklung)

### Offen aus „Buchen & Anfragen“
- **Tripadvisor-Note** (Bubbles, Anzahl) über die Content API – vorher Freischaltung und Bedingungen prüfen.
  Heute: nur Link „Tripadvisor ↗“ (Suchseite bzw. eigener Link je Hotel) neben Google.
- hotel.de: Such-Adresse mit {q} eintragen (Format unbekannt), damit auch Hotels ohne eigenen Link einen Preis-Link bekommen.

### Partner: Hotels.com, CHECK24, trivago (Stand 27.10.2026)
- **Hotels.com:** live und aktiv seit 27.10.2026 (Migration 065/066, übernimmt Hotel-IDs aus dem Expedia-Link über `id_from`).
  Bedingungen geprüft: 4 % Hotels, 7 Tage; Markenhinweis nennt Expedia, Inc.; sonst wie Expedia (siehe Notiz im Programm).
- **CHECK24:** live und aktiv seit 27.10.2026 (Migrationen 067, 069), Reihenfolge 4 = Hauptbutton, wo ein Link steht.
  Pauschalreisen auf check24.net (Provision nur dort, 7 %), Link über a.check24.net/misc/click.php (pid 1179734, aid 18,
  tid = Slug), Hotel-Nummer = c24pp_hotel_id bzw. hotelId auf urlaub.check24.de (Barceló Lanzarote Active Resort 1677933).
  Beobachtung: Beim ersten Besuch mit Cookie-Banner blieb check24.net einmal auf der allgemeinen Suche (zweiter Aufruf ok).
  Linkprüfung 27.10. (https://claude.ai/artifact/MwyM2n7v35cKkEpVtUP2BJ): 11 Hotels in DE/AT bei CHECK24 nicht buchbar (nur
  Pauschalreisen) – Links entfernt, „gibt es nicht“ vermerkt (Migration 082). Rest am 28.10. geprüft: Aktivhotel Santa Lucia
  und MR Les Rotes ebenfalls nicht buchbar (Migration 083); 22 Hotels mit funktionierendem CHECK24-Link.
- **trivago und hotel.de (Awin) + Anbieter untereinander mit Logos – Anbieter untereinander live seit 28.10.2026, trivago/hotel.de vorbereitet:**
  Migration 081 (Logo-Spalten, trivago-Programm inaktiv, hotel.de-Notiz, Beschriftungen „Preise prüfen bei …“,
  „Pauschalreise mit Flug bei CHECK24“), Logo-Upload im Admin (SVG/PNG/WebP ≤ 300 KB, Herkunft Pflicht, SVG ohne Skripte,
  Auslieferung unter /partner-logo/ mit strenger CSP), Kasten „Buchen & Anfragen“ als gleichrangige Zeilen in Admin-Reihenfolge,
  „Direkt beim Hotel“ zuletzt; Handy-Leiste unverändert (erster Anbieter).
  Offen vor dem Aktivieren: Awin-Publisher-ID und Programm-IDs (trivago, hotel.de), trivago-Tracking-ID (ist sie im Awin-Link
  enthalten?), Deeplink-Format je Hotel (trivago-Hotel-Nummer bzw. hotel.de-Hotelseite), Provisionsmodell/-sätze aus Awin,
  Logos aus den Werbemitteln (trivago brand toolbox, CJ, CHECK24, Awin). Logos nur im Buchungskasten, keine Partner-Logoleiste
  (trivago verbietet Logo-Nutzung für eigene Werbung ohne Zustimmung).

## Zu entscheiden (Daniel)
- **99 importierte Hotels (Import 22.10., 19:11) ohne Auto-Prüfung**: 124 von 125 Prüf-Jobs wurden beim Import sofort
  abgebrochen (pg-boss „cancelled“); die Meldungen stehen auf „bestätigt“ und erscheinen als „Auto-Prüfung hängt“.
  Am 26.10. entschieden: liegen lassen. Bei Bedarf in Etappen (z. B. 20) starten – Kosten ca. 0,13 $ KI + 0,03 $ Places je Hotel.
- Preis je geteilter Camp-Anfrage (A3, zurückgestellt; Vorschlag: halber Preis einer Einzelanfrage).
- `geo-refresh` für live-Objekte: würde ungeprüfte Vorschläge sofort in den Score bringen.

## Zu erledigen (Daniel)
- Robinson Club Fleesensee und Hotel BCL Podium: zurückgesetzte Anfrage-Entwürfe prüfen und neu freigeben.
- **Tauern Spa Kaprun: Anfang November erneut senden** (Empfänger-Spamfilter hatte die junge Domain abgewiesen; Adresse korrekt).
- **Expedia-IDs für die übrigen Hotels** eintragen (Expedia aktiv seit 26.10., 35 Hotels mit Link; Hotels.com übernimmt die
  Nummer automatisch). Regeln: keine Gutscheine, keine Expedia-Links in E-Mails/Offline, „Expedia“ nicht in Titeln/Meta-Tags,
  Social-Media-Posts mit Expedia-Bezug als Werbung kennzeichnen, nicht auf die Marken bieten.
- **CHECK24-Nummern je Hotel** eintragen (Suchlink im Admin beim Hotel; Hotelnamen prüfen – die erste Nummer stimmt nicht
  immer) und den Link einmal im privaten Fenster testen.
- **TradeTracker prüfen (Notiz 27.10.2026)**: Affiliate-Netzwerk (Sitz Berlin, laut eigener Angabe über 5.000 Advertiser,
  Branche „Reisen und Urlaub“). Interessant sind weniger Portale als **Hotelketten mit eigenem Partnerprogramm**, z. B. Garden Hotels
  und Insotel (Balearen), BlueBay Resorts (Spanien), Akzent Hotels (DE/Salzburg, 4 % je Buchung); dazu Metasuchen wie KAYAK/trivago
  (Programme teils nur außerhalb DE). Vorgehen: als Publisher registrieren, im Kampagnenkatalog (Land Deutschland, Reisen und Urlaub)
  nach Ketten unserer Hotels suchen (Zafiro, Viva, Grupotel, Barceló, Robinson/TUI, Playitas …), je Programm Deeplinks, Cookie-Dauer,
  Provision und Bedingungen (Marke, E-Mail, Gutscheine) prüfen. Technisch passt es ins bestehende Modell: je Kette ein Partnerprogramm
  mit Deeplink-Vorlage, Link je Hotel („direkt beim Hotel“ mit Provision, als Anzeige gekennzeichnet).
  Geprüft 27.10. (öffentliche Seiten und Aggregatoren, Stand unsicher – im Konto bestätigen):
  - **Hotels VIVA** (hotelsviva.com, 7 Hotels auf Mallorca, u. a. unser Viva Blue & Spa): Kampagne bei TradeTracker vorhanden
    (DE-Listing offen, 30 Tage Cookie, Provision nicht öffentlich; Awin-Spiegel nennt 4 %).
  - **Zafiro Hotels** (12 Hotels Mallorca/Menorca, bei uns Zafiro Tropic und Zafiro Palace Alcudia): TradeTracker DE und ES laut
    Aggregator „geschlossen“ (ES 4 %); offen u. a. Webgains ES (6 %, DE geschlossen) und Impact.com ES. Bei Zafiro nachfragen,
    über welches Netzwerk der deutsche Markt läuft.
  - Zafiro Palace Alcudia stand dreimal im Ranking – zusammengeführt mit Migration 080 (alte Adressen leiten per 301 um).
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
- 27.10. **Trainingslager-Seite (/trainingscamp) für Suchanfragen**: „Trainingslager“ in Titel, H1 und H2, eigene Abschnitte
  „Was kostet ein Triathlon-Trainingslager?“ und „Trainingslager für Vereine und Gruppen“, Links auf die Regionsseiten, drei
  neue häufige Fragen (Kosten, Buchungszeitpunkt, Trainingsstunden), eigenes OG-Bild, Sportresorts/Pauschalreiserecht/Leihrad
  korrigiert, Anbieterpreise vereinheitlicht (Migration 079), Anbieter mit kaum Angaben kompakt. Entscheidung: keine eigenen
  Artikel zu „beste Zeit“, „Kosten“, „Verein“ (Kannibalisierung) – diese Seite deckt sie ab.
- 27.10. **TriScore-Seite für Suchanfragen**: Titel/Beschreibung/H1, Einstieg mit den typischen Fragen, häufige Fragen mit
  FAQ-Schema (Landingpage-Texte mit Platzhaltern), Rechenbeispiel mit echtem Hotel aus der Mitte des Rankings (inkl. Beispiel mit
  Bewertungen), eigenes OG-Bild, Links zu Top-Hotels und Regionen; Radrevier-Kriterium erklärt (OSM 0–6 → Skala 0–10).
- 27.10. **Ranking speichern repariert**: Die Formel-Prüfung im Admin verlangte für jeden Schlüssel eine Zahl – die Formel des
  Triathlon-Rankings (best_time, athlete_enabled, unknown_policy) und die Vorlage für neue Rankings (review_age_weights) ließen
  sich nicht speichern. Jetzt Prüfung je Schlüssel (`scoring.validateFormula`), unbekannte Schlüssel weiter nur als Zahl.
- 27.10. **Partner Hotels.com und CHECK24** (siehe oben): Hotels.com über CJ mit Expedia-Nummern (`id_from`), Markenhinweis
  laut Bedingungen; CHECK24 Pauschalreisen mit Link wie aus dem Linkgenerator, Nummer aus Parameter (c24pp_hotel_id, hotelId),
  eingefügte Adressen werden auf die kurze Form ohne Reisedaten gebracht (gilt für alle Programme), Datenschutz ergänzt.
- 27.10. **Klimapunkt je Region** (Migration 068): Klima nicht mehr am Regionsmittelpunkt (Teneriffa lag auf 2345 m am Teide,
  Januar 9 statt 22 °C), sondern am Admin-Punkt, sonst an der Lage der Hotels (Medoid), sonst an einem Ort ≤ 400 m nahe der
  Mitte; Zypern = Limassol. Info-Tooltip „Ø max“ nennt Ort und Höhe. Neuberechnung `node scripts/region-data.js --klima`
  (Radrevier bleibt), Pause gegen 429, Wasserwerte bleiben bei Fehlern stehen.
- 27.10. **Wassertemperatur je Hotel** (Migration 063): nächste Meereszelle ≤ 20 km, nur bei Küstenlage (Höhe 0 in 3 km,
  Open-Meteo-Höhenmodell); 33 Hotels mit Wert, 29 nicht am Meer. Hinweis als Info-Tooltip.
- 27.10. **Trainingsregionen** Schritt 1+2: Daten je Region (Klima, Wind, Sonne, Wasser, Radrevier) und Übersicht
  `/trainingsregionen` mit Fotos, Zeitraum (Monat oder Jahreszeit), Sortierung nach Eignung, Monatsraster, Vergleich von 2–3
  Regionen (`/trainingsregionen/vergleich/a-vs-b`).
- 27.10. **Startseite aus Bereichen** (Variante B), Hotelliste unter `/hotels`, Regionen nach Jahreszeit („Wohin im Winter?“).
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
