# Backlog tri-hotel.de

Gemeinsamer Stand für beide Rechner (siehe `CLAUDE.md` → „Arbeiten auf zwei Rechnern“). Erledigtes nach unten verschieben,
Entscheidungen mit Datum festhalten. Reihenfolge = Priorität.

## In Arbeit / als Nächstes (Entwicklung)

### Klima: Wind und Regentage von Messstationen (03.11.2026, live – Migration 099)
Vergleich Open-Meteo gegen 11 NOAA-Stationen 2023–2024 (Gando, Fuerteventura, Lanzarote, Teneriffa Süd, Palma, Alicante,
Faro, Girona, Lübeck, Salzburg, Phuket): **Temperatur ok** (heutige Einstellung best_match im Mittel −0,8 °C, besser als
ERA5-Seamless −2,1 °C) – die heißen Sommerwerte sind die Jahre 2023–2025. **Wind im Modell zu niedrig** (Teneriffa Süd 11
statt 20 km/h, Gando 20 statt 27), **Regentage zu hoch** (+18 im Jahr). Umsetzung `src/services/stations.js`:
Wind (ISD stündlich) und Regentage (GHCN-Daily ≥ 1 mm) je Region (Station ≤ 60 km bzw. Regionsradius, ±300 m Höhe),
Regentage je Hotel (≤ 25 km, ±300 m); Modellwerte bleiben in `*_model`. Hotelseite: Zeilen Wind und Starkwindtage
(Region), Quellen je Zeile; Beschreibungstext bekommt Tiefstwert, Wind und Quellen. „Böentage“ heißen jetzt
Starkwindtage (es war schon immer das Stundenmittel ≥ 40 km/h, keine Böen).
- Nachgetragen 03.11.: 11 von 13 Regionen mit Station (ohne: Algarve, Costa Blanca), 30 von 79 Hotels mit Regenstation.
  Gran Canaria: Windstation Gando (Ostküste, sehr windig: Aug 39 km/h) gilt für die ganze Region – für Hotels um
  Maspalomas eher zu hoch; Kandidat für die Stationswahl im Admin.
- Ohne Station (Stand Trockenlauf): Regen Algarve, Costa Blanca; Wind Algarve. Costa Blanca-Wind käme aus Alzira
  (56 km, im Inland) – ggf. später Stationswahl im Admin überschreibbar machen.
- **Lizenz Open-Meteo** (Daniel klärt): kostenlose API nur nicht-kommerziell, Seiten mit Werbung gelten als kommerziell.

### Beschreibungstexte: neuer Prompt und Ablauf (03.11.2026, live – Migration 098)
Umsetzung der externen Bewertung: fester Styleguide je Ranking + bis zu 3 ausgewählte Mustertexte (statt „zuletzt
überarbeiteter Text“), Vergleich je Angabe im Ranking (selten/verbreitet/schwächer, Gesamtplatz), Quellenstufe in der
Sprache („laut Hotel“, „Gäste berichten“), Messwerte aus Karten/offenen Daten (Luftlinie, Beckenlänge) und Wassertemperatur,
Ort aus der Anschrift, „Passt gut für / weniger für“, Fakten-IDs je Satz, maschinelle Prüfung (Zahlen, verbotene Wörter,
Kurzbeschreibung ≤ 150 Zeichen mit Ort – sonst gezielter Neuversuch, Sätze ohne Grundlage) + Gegenprüfung mit Haiku,
Prüfhinweise im Reiter „Inhalte“, Veraltet-Hinweis nur bei Änderung verwendeter Angaben + nach 12 Monaten, öffentlich
„KI-gestützt erstellt, redaktionell geprüft“. `temperature` gibt es seit 21.10.2026 in der API nicht mehr.
Probelauf Monte Feliz (nicht gespeichert): ca. 7 Cent je Entwurf (Sonnet 5 + Haiku 2). Bestehende 20 Texte: Fingerabdruck
unverändert; nach den Stationsregentagen gelten 15 von 20 als veraltet (Regentage geändert) – neu erzeugen oder prüfen.
- **Daniel nach dem Deploy:** unter Admin → KI-Texte Styleguide prüfen/anpassen und 2–3 Mustertexte wählen.

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
- **trivago und hotel.de (Awin) + Anbieter untereinander mit Logos – live seit 28.10.2026:**
  Migration 081 (Logo-Spalten, trivago-Programm inaktiv, hotel.de-Notiz, Beschriftungen „Preise prüfen bei …“,
  „Pauschalreise mit Flug bei CHECK24“), Logo-Upload im Admin (SVG/PNG/WebP ≤ 300 KB, Herkunft Pflicht, SVG ohne Skripte,
  Auslieferung unter /partner-logo/ mit strenger CSP), Kasten „Buchen & Anfragen“ als gleichrangige Zeilen in Admin-Reihenfolge,
  „Direkt beim Hotel“ zuletzt; Handy-Leiste unverändert (erster Anbieter).
  Geklärt (28.10.2026): Awin-Publisher-ID 3127993, trivago-Programm-ID 105923 (aus Widget-/Bannercode). Awin bietet für trivago
  nur Banner/Widget an (beides nicht verwenden: nicht hotelbezogen, Fremdskript, Bild-Hotlinking) – stattdessen Deeplink
  `https://www.awin1.com/cread.php?awinmid=105923&awinaffid=3127993&clickref={slug}&ued={url_enc}`. Hoteladresse bei trivago:
  `https://www.trivago.de/de/lm/<name>?search=100-<Nummer>` (Playitas: 100-179546); Reisedaten `;dr-…;drs-…` und
  `#accommodation-overlay` weglassen. Getestet: Deeplink mit vollem Pfad und mit nur `https://www.trivago.de/de/srl?search=100-<Nummer>`
  landen beide beim Hotel → je Hotel reicht die Nummer (`id_url` mit `search=100-{id}`; `idOf` muss den Präfix „100-“ im
  Parameter erkennen, mit Tests). trivago-Tracking-ID: hängt Awin bei der Weiterleitung selbst an (`cip=…&cip_tc=Tri-hotel_3127993&cip_ext_id=<clickref>`),
  kein eigener Parameter nötig. Awin zählt den Klick (Test 28.10.2026). **trivago aktiv seit Migration 084** (Vorlage, `id_url`, Playitas-Link); `idOf`/`fromId`
  erkennen Präfix im Parameter (`100-`) und Reisedaten nach `;`. Offen: trivago-Nummern für die übrigen Hotels (Aufgaben
  „Partnerlink prüfen“). Logo hochgeladen 28.10.
  hotel.de: Awin-Programm-ID 16018, **aktiv seit Migration 085** (Ziel `https://www.hotel.de/de/detail?hn=<Nummer>`, getestet:
  landet beim Hotel, Klick gezählt, Awin hängt `awc` an; Nummer auch aus `hotelTeaserKey[0]` der Ergebnisliste; Logo 200×37
  aus Awin-Werbemitteln hochgeladen). Offen: hotel.de-Nummern für die übrigen Hotels (Aufgaben „Partnerlink prüfen“). Allgemein: Provisionssätze aus Awin,
  Logos aus den Werbemitteln (trivago brand toolbox, CJ, CHECK24, Awin). Logos nur im Buchungskasten, keine Partner-Logoleiste
  (trivago verbietet Logo-Nutzung für eigene Werbung ohne Zustimmung).

### Partner: FeWo-direkt – Hinweis „Oder doch lieber in eine Ferienwohnung?“ (Wunsch 03.11.2026)
- **Programm:** HomeAway FeWo-direkt über CJ, freigeschaltet 03.11.2026. Vertragspartner für alle Standorte ist Expedia, Inc.
  (Sonderklausel 20.1 angepasst, Asien-Pazifik-Gesellschaft gestrichen). Vergütung pro Lead und pro Buchung, 7 Tage Cookie,
  Werbemittel im CJ-Account, XML-Feed; API nur auf Anfrage beim Programm-Team (Kontakt in der CJ-Willkommensmail).
  Willkommenspakete (Docsend/Box-Links aus der Mail) nicht automatisch abrufen.
- **Listungseingriff:** in der Hotelliste ein Hinweiskasten „Oder doch lieber in eine Ferienwohnung?“ mit Link zu FeWo-direkt;
  zusätzlich auf den Regionsseiten, dort mit Suche nach der Region.
- **Regeln:** als „Anzeige“ kennzeichnen. Fester Platz in der Liste, der kein Hotel verdrängt und weder Score noch Reihenfolge
  beeinflusst. Text, Programm und Position je Ranking bzw. Site im Admin pflegen, nicht hart codieren. Klicks über
  `outbound_clicks` mit eigener Art/Quelle, damit das Dashboard sie dem Programm zuordnet. Keine Banner, keine Fremdskripte,
  kein Hotlinking; ein Logo nur aus den CJ-Werbemitteln hochladen (mit Herkunft).
- **Offen (Daniel):** CJ-Linkformat und Advertiser-ID aus dem CJ-Account; Suchadresse je Region bei FeWo-direkt (Links testet
  Daniel selbst); Position in der Liste (z. B. nach Platz 5 oder am Listenende); als Partnerprogramm im Admin anlegen.

### Startseite aus Bereichen (Variante B „Kapitel“, umgesetzt 27.10.2026; Vorschläge: https://claude.ai/artifact/BqCYrcipEuyfcPRZ2w7BQ4)
Startseite = Bänder „Über tri-hotel“, Hotels, Camp-Anbieter, Regionen; Reihenfolge, Sichtbarkeit und Hervorhebung im Admin unter
Inhalte › Startseite (sites.home). Hotelliste mit Filtern liegt jetzt unter /hotels (Suchen auf „/“ leiten weiter).
- Stand 01.11.2026: Hero mit Claim und Kennzahlen-Zeile, rechts **Slider aller Hotels ab TriScore 75** (Wechsel alle 5 s,
  Reihenfolge nach Score, täglich anderer Start, Pause/Punkte, stoppt bei reduzierter Bewegung), darunter **Hotel-Finder** über die
  volle Breite (Ort/Hotel, Reisemonat, Wunschwetter, Ausstattung, wenig Regen, Live-Trefferzahl; am Handy vor dem Slider).
  Bestenliste ab Platz 1, Camp-Band mit „Camp-Angebote anfragen“. Der Finder ersetzt den geplanten Monats-Planer aus Variante C.
- Später (mit Partner-CRM): gebuchte Plätze je Bereich, immer zusätzlich und als „Anzeige“ gekennzeichnet, nie anstelle der
  neutralen Auswahl; ändert weder Score noch Reihenfolge.

### Trainingsregionen (Konzept 27.10.2026, von Daniel freigegeben)
Ziel: Regionen eigenständig auffindbar und vergleichbar machen, v. a. beim Klima; mehr Kontext je Regionsseite. Kein neuer
Gesamt-Score für Regionen (Neutralität) – nur Daten mit Quelle.
1. **Daten je Region – umgesetzt 27.10.** (siehe Erledigt): Klima je Monat am Klimapunkt der Region, Wasser vor der Küste,
   Radrevier auch für Regionen ohne Hotels. Klimapunkt ab 3 Hotels aus deren Lage, sonst Ort ≤ 400 m nahe der Mitte; fest gesetzt
   (27.10.): Zypern Limassol, Algarve Lagos, Teneriffa Costa Adeje, Gran Canaria Maspalomas, Kreta Chania.
2. **Übersicht `/trainingsregionen` – umgesetzt 27.10.** (siehe Erledigt).
3. **Regionsseiten mit Kontext – umgesetzt 27.10.**: Klima und Wasser je Monat aus den Regionsdaten (Klimapunkt), beste Reisezeit
   mit Begründung (Regel aus `formula.best_time`, Monate darüber/darunter, Regen, Sonne, Wind, Wasser), Radrevier in Zahlen
   und Sätzen (OSM), Ausstattung der Hotels je Gruppe (Schwimmen, Rad, Laufen … aus dem Leistungskatalog), Camps der Region,
   Sprungleiste. Später: Badegewässer/50-m-Becken/Bahnen der Region per eigener Abfrage (Overpass).
4. **Regionstext, Vergleich und häufige Fragen (27.10.)**: eigener Redaktionstext je Region (Einstieg oben mit Stärke und
   Kehrseite, Landschaft, Klima/Reisezeit, Wind wo prägend, Radfahren, Schwimmen, Laufen, Anreise und Radtransport, Ruhetag,
   „Für wen eignet sich …?“, 390–570 Wörter) plus „X oder Y?“ mit Link zum Direktvergleich, per Migration gepflegt (region_texts,
   ohne Admin-Bearbeitung, Entscheidung Daniel). Titel/H1 nach Suchbegriffen („Triathlon-Trainingslager auf …“, Vorlagen in den
   Landingpage-Texten). Häufige Fragen nur aus Daten (inkl. Wind) mit FAQ-Schema. Ausstattung erst ab 3 Hotels, bei 2 als
   Gemeinsamkeiten. Regionen unter `region_min_entities` (2) bleiben noindex.
   Offen: Angaben in den Texten (Transferzeiten, Anstiege, Flugzeiten) bei Gelegenheit vor Ort bzw. beim Anbieter gegenprüfen.

### 1. SEO – Bestandsaufnahme 26.10.2026 und nächste Schritte
Technik ist solide (76 Sitemap-URLs alle 200, je eine H1, Canonical, Beschreibung 70–160 Zeichen, og:image, keine doppelten
Titel, alt-Texte, HTTPS/HSTS, gzip, Ø 21 ms). Erledigt 26.10.: lange Titel gekürzt (seo.entityTitle), aggregateRating aus
Athleten-Bewertungen. Offen, nach Wirkung sortiert:
- **Redaktionstexte** (zuerst Daniel: Prompt der Hotelbeschreibung nachschärfen, dann Sammelaktion): nur 10 von 42 Live-Hotels haben einen freigegebenen Text („Unsere Einschätzung“) – eigener, einzigartiger
  Inhalt ist der größte Hebel. Vorschlag: Sammelaktion „Entwurf erzeugen“ für alle Live-Hotels ohne Text (ca. 3 Cent je Text)
  + Board-Karte „Text prüfen und freigeben“.
- **Mehr Hotels je Region**: Teneriffa, Gardasee, Algarve haben nur 1 Hotel (Regionsseite bleibt unter der Mindestzahl 2 noindex),
  Kreta/Zypern/Girona 0. Die 99 geparkten Import-Hotels würden das füllen (siehe „Zu entscheiden“).
- **Dünne Seiten**: 21 Camp-Anbieter-Profile und /region/fuerteventura haben < 300 Wörter. Umgesetzt 28.10.: Anbieter-Profile
  mit Kurzprofil unter 100 Wörtern sind noindex und nicht in der Sitemap (Admin zeigt „noindex“ und die Wortzahl; Stand 28.10.
  alle 22). Offen: Kurzprofile anreichern (Leistungen, Zielorte, Hotels, Preise ausformulieren; ggf. KI-Entwurf wie bei Hotels).
- **Search Console** (ab ca. Anfang November aussagekräftig): Indexierung, Suchanfragen, CTR je Seite auswerten → Titel/
  Beschreibungen gezielt nachschärfen, Themen für neue Seiten ableiten.
- Erledigt 28.10.: /hotels mit eigenem Titel, H1 und Beschreibung (rankings.content list_title/list_h1/list_description,
  Migration 086) statt der Startseiten-Beschreibung; Sitemap mit lastmod auch für Start, Liste, Methodik, Regionen, Länder;
  Schrägstrich am Ende per 301 (/hotels/ → /hotels). /triscore hatte bereits FAQ-Daten.
- Backlinks: erster Blogartikel mit Links von Daniel (erstellt 27.10., live seit 28.10.:
  blog.triprep.de/wann-und-wohin-ins-trainingslager, 5 folgbare Links auf /, /hotels, /trainingsregionen, /trainingscamp).
  triprep-Blog am 28.10. umgebaut (eigene, server-seitig gerenderte Seite je Artikel, Canonical auf sich selbst, BlogPosting,
  echte Links auf der Blog-Startseite, 404 für unbekannte Adressen; von außen geprüft). Sitemaps von blog.triprep.de
  und tri-hotel.de am 28.10. neu eingereicht. Indexierung des Artikels beantragt (28.10.). Optional bei triprep: nur eine H1 je Artikel
  (derzeit 3: „TriPrep Blog“, Artikeltitel, H1 im Artikeltext); Linktexte beschreibend statt Adressen, ggf. Regionsseiten verlinken.
- Kleinigkeiten: Länderseiten mit nur 1 Hotel (PT, IT, TR); lastmod der Hotels steht nach Neuberechnungen bei allen auf
  demselben Tag (entity_rankings.updated_at) – ggf. nur echte Inhaltsänderungen zählen.
- Später: Landingpage „Trainingslager für Vereine“, Ratgeberinhalte, Backlinks (Vereine, Verbände, Triathlon-Blogs).
- **Ratgeber (zurückgestellt am 01.11.2026):** Konzept mit Startseiten- und Artikel-Mockup, Themenplan (Rad im Flugzeug, Schwimmtraining,
  Packliste, Radklassiker Mallorca, Freiwasser, Regeneration) und Technik (`/ratgeber`, Markdown im Repo, Live-Bausteine aus dem Ranking):
  https://claude.ai/artifact/Jk3YwYiwTPJ8eVpYDqQAZX – erst umsetzen, wenn Daniel es freigibt.

### Hotelseite überarbeiten (Vorschläge 26.10.2026: https://claude.ai/artifact/7frxWXoET4Ftu7oJ3YJwjN)
- **A Steckbrief – umgesetzt 27.10.** (siehe Erledigt).
- **B nach Disziplinen – sobald Daniel den Prompt der Redaktionstexte überarbeitet hat.** Einschätzung, Fakten mit Quelle,
  Leistungen, Athleten-Note und passende Fotos je Kategorie zusammenführen (Reiter bzw. Sprungmarken); „Unsere Einschätzung“,
  „Leistungen auf einen Blick“ und „Fakten“ entfallen als getrennte Blöcke. Der neue Prompt sollte Texte je Kategorie liefern.
- **C Entscheidungshilfe – wenn genügend Hotelfotos mit Nutzungsrecht vorliegen** (dauert voraussichtlich). Hero-Foto mit Score,
  „Passt zu dir, wenn … / Eher nicht, wenn …“, Reisemonat wählen (Klima und Score je Monat), Mini-Vergleich mit zwei
  Alternativen, Sprungleiste. Mini-Vergleich und „Passt zu dir“ ggf. vorab einzeln.
- Offen aus „Gilt für jede Variante“: Karte als kleines Vorschaubild statt „Karte laden“-Fläche.

### Dach danielreuland.com (Idee 29.10.2026, Einschätzung im Chat)
danielreuland.com als Dach mit Links zu triprep, tri-hotel, hybrid-hotel …; eigener Admin mit Kunden-/Partnerverwaltung;
Seiten sprechen per API miteinander. Einschätzung: machbar auf dem bestehenden Server; Empfehlung eigene Hub-App mit eigener
DB, Projekte behalten ihre Daten, Austausch über versionierte interne API mit Schlüssel je App, schrittweise (Startseite →
Hub-Admin mit Kennzahlen → CRM → gemeinsamer Login). hybrid-hotel ggf. als zweite Site im tri-hotel-Code (Multi-Site/
Multi-Ranking vorhanden). Ersetzt das geplante Partner-CRM im tri-hotel-Admin.
Entscheidungen Daniel (29.10.): hybrid-hotel = eigenes Ranking (Hyrox; CrossFit ggf. später, eigenes oder gemeinsames).
Admin vorerst nur Daniel; Rollen später, z. B. über die Board-Labels. danielreuland.com = persönliche Seite mit Projekten.
CRM Schritt 1: Firmen und Kontakte (Firma hat mehrere Kontakte, Kontakt höchstens eine Firma); Kontakt ↔ triprep-Nutzer,
Firma ↔ Hotel oder Camp-Anbieter in tri-hotel. Pipeline, Verträge, Rechnungen erst Phase 2+.
Stand 29.10.: danielreuland.com live als statische Platzhalterseite (Projekte, Impressum, Datenschutz) – Server:
/var/www/danielreuland.com/html, Nginx-Site `danielreuland.com` (www und http → https://danielreuland.com), Let's-Encrypt-
Zertifikat, Logs /var/log/nginx/danielreuland.com 7 Tage (in /etc/logrotate.d/tri-hotel-nginx). Wird durch die Hub-App ersetzt.
fitnessracing-hotel.de (Fitnessracing/Hyrox) ebenso als Platzhalter „in Vorbereitung“ (noindex) live, gleicher Aufbau unter
/var/www/fitnessracing-hotel.de/html. Impressum beider Seiten: daniel@danielreuland.com.
Entscheidung 29.10.: fitnessracing-hotel.de = Hauptdomain des Fitness-Racing-/Hyrox-Rankings; hybrid-hotel.de leitet vorerst
dorthin weiter (später ggf. eigenes Thema). Erster Artikel live: https://fitnessracing-hotel.de/fitness-racing/ (statisch, Quellen
im Repo unter static-sites/, siehe README dort). Achtung Aktualität: World Triathlon nennt die Disziplin seit 28.10.2026
„Hybrid Racing“ (Feb. 2026: „Hyathlon“) – Artikel bei neuen Meldungen (Long Form Agreement, Regelwerk) nachziehen.
Geplante Unterseiten: /fitness-racing/geschichte/, /hyrox/, /hyathlon/, /world-triathlon/, /training/ (erst verlinken, wenn live).
hybrid-hotel.de (+ www) leitet seit 29.10. per 302 (vorübergehend, Domain bleibt frei für späteres Thema) auf
fitnessracing-hotel.de weiter, mit Zertifikat. Search Console fitnessracing-hotel.de: Domain-Property bestätigt (TXT), Sitemap eingereicht und Indexierung von
/fitness-racing/ beantragt (29.10.). Status direkt danach „konnte nicht abgerufen werden“, Sitemap technisch ok (200, gültiges XML);
in einigen Tagen prüfen.
**Nächste Schritte (29.10.):**
1. ~~DNS danielreuland.com, hybrid-hotel.de, fitnessracing-hotel.de~~ – erledigt 29.10.
2. **Hub-Repo** `danielreuland/danielreuland-com` in eigener Sitzung starten – Start-Prompt: `docs/prompts/hub-start.md`
   (Ziele, CRM-Regeln, Datenmodell-Vorschlag, Server/Port 3020, Arbeitsweise). Daniel legt Repo und Sitzung an.
3. **Interne API + CRM: Konzept 02.11.2026 in `docs/konzept-crm.md`** (freigegeben 02.11., E1–E6 + D5; H1–H13 im Hub-Repo).
   **A1–A9 gebaut 03.11.** (Branch `claude/interne-api-d706c8`, noch nicht deployt): Vertrag v1 final `docs/internal-api.md` +
   Fixtures `docs/internal-api/fixtures/` (auch Mocks des Hubs); `/internal/v1` entities (Suche, `ids`, Detail, metrics),
   camp-providers (dito), partner-programs, stats – nur Loopback ohne Proxy-Header, HMAC je App (`INTERNAL_API_KEYS`),
   120/min je App, Protokoll `internal_api_calls` (Migration 097, 90 Tage). Ereignisse tri-hotel → Hub (D5): Tabelle
   `hub_events` + pg-boss-Job `hub-event` mit Wiederholung (`HUB_EVENTS_URL`, `HUB_EVENTS_SECRET`, ohne Ziel nur Log);
   Auslöser heute `inquiry.sent`/`inquiry.answered`; `contact.profile`, `contact.consent`, `photos.permission` als Funktionen
   bereit (Formularfelder kommen mit Paket P2). Testaufruf: `node scripts/internal-api-call.js /internal/v1/stats`.
   **A10 erledigt 03.11. – live:** deployt (Migration 097), Nginx `location ^~ /internal { return 404; }` im tri-hotel-Block
   (Sicherung `/root/nginx-tri-hotel.bak-20261103`), Schlüssel `hub:` von Daniel auf dem Server erzeugt (nie angezeigt).
   Probe: außen 404 (auch www → 301 → 404), Server ohne Signatur 401, mit Proxy-Header 404, signiert `stats`/`entities` 200,
   Protokoll in `internal_api_calls` ok. Für den Hub: Geheimnis auf dem Server aus der tri-hotel-`.env` in die Hub-`.env`
   (`TRIHOTEL_API_SECRET`) übernehmen, ohne es anzuzeigen; `HUB_EVENTS_URL`/`HUB_EVENTS_SECRET` erst, wenn der Hub läuft.
4. **Fitness-Racing-Ranking** (fitnessracing-hotel.de): Entwurf Kriterienkatalog mit Punkten und Gewichten (Geräte der
   8 Stationen – SkiErg, Rudergerät, Sled, Wall Balls, Kettlebells, Sandsäcke –, Rig/Langhantel, Laufstrecke/-bahn,
   Hyrox-Kurse/Training Club, Camps, Klima …) → Daniel legt ihn im Admin an; danach Site fitnessracing-hotel.de in der
   App (Multi-Site), statische Seiten mit gleichen URLs übernehmen.
   Gestaltung (29.10.): Palette „Halle“ (Schwarz + Signalgelb) gewählt, Schriften wie tri-hotel lokal, Fotos Unsplash
   (Victor Freitas, Kyle Kranz) selbst ausgeliefert mit Urhebervermerk; Fuß „Unabhängiges Portal, nicht mit HYROX verbunden“.
   Keine Fotos mit HYROX-/Sponsor-Logos (zwei Kandidaten deshalb verworfen). Für die App später als Palette in src/lib/palettes.js.
   **Stand 01.11.:** Ranking `fitness-racing-hotel` (HybridScore) als **Entwurf** live (Migrationen 088–093, alle deployt:
   28 Kriterien, Summe 100, Bonus „alle Stationen trainierbar“, geteilte Werte mit Triathlon: Sauna, Kältebad, Physio, 400-m-Bahn,
   Flughafen; „Lage des Trainings-Gyms“ im Hotel 7 / ≤ 1 km 5 / ≤ 5 km 3, Geräte zählen im Hotel- oder Partner-Gym).
   Objektseite „Rankings“ (für weitere Rankings prüfen), Kandidaten-Regel, Hybrid-Camps, Partnerklicks nach Herkunftsseite (`?von=`).
   8 Hotels aus Reiseathleten-Camps als Meldungen im Ranking (ohne Auto-Prüfung, siehe „Zu erledigen“).
   Offen: Kandidaten prüfen, Ranking aktivieren, Site fitnessracing-hotel.de in der App.
5. **Admin-Aufteilung** Hub ↔ Apps entschieden 29.10.: `docs/admin-aufteilung.md` (Grundregel + Tabelle tri-hotel,
   Serverbetrieb in `ops/` des Hub-Repos). Offen: triprep-Bestandsaufnahme – Prompt `docs/prompts/triprep-admin-inventory.md`,
   Ergebnis in die Aufteilung übernehmen.

### Ausfallüberwachung (begonnen 29.10.2026, sicherheitsrelevant)
Zwei Ebenen: **intern** Server-Wächter, **extern** ein Überwachungsdienst (fällt der Server ganz aus, kann er nichts melden).
- **Live seit 29.10.** (Timer alle 5 min, Mails an daniel@danielreuland.com, Testmail versendet): `/healthz` in tri-hotel (App + DB, `ok`/503); `scripts/watchdog.js` + `src/lib/watchdog.js`
  (Tests) als systemd-Timer alle 5 min (`deploy/server-watchdog.*`): Platte ≥ 85 %, freier RAM < 150 MB, PM2-Apps nicht online
  oder Absturzschleife (> 3 Neustarts je Lauf), Websites (tri-hotel /healthz, triprep, api.triprep /health, analytics,
  danielreuland.com, fitnessracing-hotel.de), Zertifikate < 14 Tage, Backup fehlgeschlagen/älter 30 h, fehlgeschlagene
  Systemdienste, PM2-Logs > 1 GB. Mail bei neuem Problem, Erinnerung alle 24 h, Mail „behoben“. Probelauf auf dem Server ok.
- Umzug nach `ops/` im Hub-Repo, sobald es steht (Aufteilung: `docs/admin-aufteilung.md`).
- Offen (Daniel): externes Konto anlegen – Vorschlag Better Stack (Free: 10 Monitore, 3-min-Takt, Heartbeat) → Monitore für
  tri-hotel.de/healthz (Schlüsselwort „ok“), triprep.de, api.triprep.de/health, danielreuland.com, fitnessracing-hotel.de +
  Heartbeat-URL → `WATCHDOG_HEARTBEAT_URL`. UptimeRobot nur, wenn die AGB gewerbliche Nutzung im Free-Plan erlauben.
- `pm2-logrotate` 3.0.0 eingerichtet 29.10. (gilt für alle PM2-Apps): je Log max. 50 MB, täglich um Mitternacht, 10 Dateien
  behalten, gzip, Prüfung alle 5 min; `pm2 save` ausgeführt. Testmail des Wächters angekommen (29.10.).

### Grunddaten: Website per Klick (06.11.2026, live)
`services/website-finder.js`: OpenStreetMap, dann Claude-Websuche (etwa 7 Cent je Websuche), jeder Treffer an der Seite selbst geprüft. Eindeutig = gespeichert, sonst Vorschlag mit „Übernehmen“. Knopf „Website suchen“ und „Alles suchen und übernehmen“ (Website, Google-Eintrag, Koordinaten) in den Grunddaten; läuft auch in der Auto-Prüfung. **Nicht aus Google Places:** Dort darf nur die Place ID gespeichert werden. Probe 06.11. mit 8 Hotels aus der Warteschlange: 6 eindeutig, 1 Vorschlag, 1 (Geovillage) danach als Vorschlag nachgeschärft. Betrifft 27 Meldungen im Status `basics`.

### Zustellung der Anfrage-Mails (06.11.2026)
mail-tester.com: 9/10 von `daniel@` (SPF, DKIM, DMARC bestanden, SpamAssassin 0,2, keine Blocklist); Abzug für 2 fehlerhafte Links, vermutlich der erfundene Beispiel-Link im Test. DMARC bleibt `p=none`, Berichtsadresse fehlt.
Gebaut (Migration 106): erster Aufruf des Antwortlinks im Browser (`inquiries.first_opened_at`, im Admin „Link geöffnet“; Scanner und Admin zählen nicht) und Abmeldung im Mail-Kopf (`List-Unsubscribe`, One-Click per POST).
Stand 06.11. nach Abruf von `daniel@`: 29 Hotels angeschrieben, 4 Links geöffnet (Logdateien ab 30.10.), 0 Formulare abgeschickt, 1 Mail-Antwort (Las Gaviotas), 3 Unzustellbar (Tauern Spa, Allsun Hotel Bella Paguera, Portblue Club Pollentia – bei den beiden neuen Adresse prüfen, dann neu senden). Mail von „Valamar No-Reply“ hat keinen Bezug erkannt und bleibt draußen; Valamar Diamant bekommt deshalb die Erinnerung, außer Daniel schließt die Anfrage.
Der Rückläufer-Test zeigte: Meldung kam nur in `daniel@` an, seit dem Abruf von `daniel@` erkennt der Admin sie.

### Klickzählung ohne Bots (08.11.2026)
Anlass: CHECK24 meldet 4 Aufrufe in 30 Tagen, das Dashboard mehr. Logauswertung 02.–08.11.: 65 von 68 gezählten /go/-Abrufen waren Bots
(Bot-Netze über private Anschlüsse: je Adresse ein Abruf ohne jeden Seitenaufruf; Scanner aus einem Rechenzentrum, alle Links einer
Seite in einer Sekunde). Bereinigt: diese 65 Klicks aus `outbound_clicks` entfernt (Probelauf, dann angewendet). Davor (bis 01.11.)
gibt es keine Logdateien mehr; die Zahlen vom 29.–31.10. bleiben, wie sie sind.
Neu: Klicks zählen auf unseren Seiten nur per Beacon beim Anklicken (alle Partner- und Camp-Links), der Abruf von /go/ zählt nur bei
Links von außen mit `?von=`; dazu Fetch-Metadaten, Admin zählt nicht, ein Klick je Adresse, Ziel und Tag.

### Tripadvisor-Fotos für Top-Hotels ohne eigene Fotos (Konzept von Daniel, 08.11.2026, noch nicht begonnen)
**Stand 09.11. (B-87, Phase 1 erledigt):** Terra statt Content API. Freikontingent einmalig 1.000 Einheiten je Konto, danach
0,015 $ je Einheit (Fotoabruf = 1 je Hotel, Suche = 1 je Treffer); kein Euro-Limit, nur Tageslimit im Terra-Dashboard.
Nur `location_id` speichern; Pflicht: Logo, Link zur TA-Seite, „See all photos“. **Blocker:** API Master Terms §3.4.2 (i) – TA-Inhalte
nicht „near, or in conjunction with“ Buchungsfunktionen anderer Plattformen (unsere Partnerlinks). **E-07 von Daniel grundsätzlich
freigegeben, aber erst bauen, wenn Tripadvisor schriftlich bestätigt**, dass Fotos auf `/hotel/<slug>/fotos` (ohne Buchungslinks,
noindex) neben Hotelseiten mit gekennzeichneten Partnerlinks zulässig sind. Anfrage an Tripadvisor am 09.11. verschickt (inkl. Frage nach dem
TA-Affiliate-Programm und ob dessen „Check Rates“-Links auf der Fotoseite mit §3.4.2 (i) vereinbar sind) – Antwort abwarten. Geplant: 6 $/Monat (400 Einheiten, 20/Tag, Dashboard 25),
Fotos für die 10 besten Hotels (Häkchen Daniel), `location_id` einmalig für alle Hotels ab Score 70 (26, Nearby-Suche, ≤ 78 Einheiten).
Volltext: `docs/konzept-tripadvisor-fotos.md` (endet mitten in US6 – Rest von Daniel nachreichen). Kern: Fotos live über die
Tripadvisor Content API bzw. Terra, nur auf Hotelseiten nach Klick auf „Fotos ansehen“, Budget-Wächter mit höchstens 400 Aufrufen
im Monat und rund 15 am Tag, nur `location_id` speichern, Attribution laut Display Requirements, kein Einfluss auf den Score.
Passt zum Punkt „Tripadvisor-Note“ oben (gleiche API, gleicher Schlüssel, gleiche `location_id`) – zusammen planen.
**Vor dem Start abzugleichen (Claude, 08.11., noch nicht entschieden):**
- **Regel „Kein Hotlinking“ (`CLAUDE.md`):** Tripadvisor verlangt, dass Bilder von seinen Adressen geladen werden. Das ist eine
  ausdrückliche Erlaubnis des Anbieters und kein Hotlinking im Sinne der Regel; die Regel in `CLAUDE.md` dafür präzisieren.
- **Datenschutz:** Beim Laden der Bilder geht die IP-Adresse des Besuchers an Tripadvisor – wie bei den Google-Bewertungen erst
  nach Klick laden (US4 sieht das bevorzugt vor) und in der Datenschutzerklärung nennen; Content-Security-Policy für die Bilddomain.
- **Zugang und Kosten:** Freischaltung, kostenloses Kontingent und Zukunft der Content API (Ablösung durch Terra laut Drittquelle)
  in der aktuellen Tripadvisor-Doku prüfen; erst dann `TRIPADVISOR_KEY` vom Daniel in die Server-`.env`.
- **Bot-Schutz:** Für den Budget-Wächter dieselben Regeln wie bei der Klickzählung nutzen (Bot-Netze geben sich als Browser aus,
  siehe „Klickzählung ohne Bots“); Aufruf nur per Klick verhindert Verbrauch durch Bots am zuverlässigsten.
- **Auswahl:** „Top-Hotels nach TriScore“ bevorzugt Hotels wegen ihres Scores bei der Darstellung – mit der Neutralität vereinbar,
  da der Score selbst die Grundlage ist und nichts gekauft wird; Regel und Hinweis trotzdem festhalten.

### Partnerbereich (Konzept von Daniel, 06.11.2026, noch nicht begonnen)
Volltext: `docs/konzept-partnerbereich.md`. Gemeinsamer Partnerbereich für beide Portale in drei Phasen: (1) Seite „Für Partner“ mit Anfrageformular ohne Login, (2) Stripe und Affiliate-Codes, (3) Partner-Portal mit Login. Hauptprodukt: Bundle aus Premium-Profil, Badge-Paket und Kurzbericht für ca. 449 € im Jahr.
Nächste Schritte laut Konzept: Katalog und Preise festlegen, Partnerseite umsetzen, Muster-PDF eines Berichts, erste Partner ansprechen, Datenmodell anlegen.
**Vor dem Start abzugleichen (Claude, 06.11., noch nicht entschieden):**
- **Ablageort:** Laut `CLAUDE.md` und `docs/admin-aufteilung.md` gehören Partner-CRM, „Partner werden“ und Abrechnung in den Hub, das Konzept nennt eine gemeinsame Codebasis der Portale. Klären, was in tri-hotel bleibt (öffentliche Seite, Anzeige) und was in den Hub geht (Partner, Bestellungen); Datenaustausch nur über `docs/internal-api.md`.
- **Neutralität:** „Hervorgehobene Darstellung“ und Premium nie in Liste oder Reihenfolge des Rankings; Regel und Kennzeichnung je Produkt festlegen. Analysebericht und Gespräch dürfen keinen Einfluss auf Score oder Faktenprüfung haben.
- **Badge ab 20 Bewertungen:** Bewertungen sind noch im Aufbau; erst prüfen, wie viele Hotels die Schwelle erreichen, sonst ist das Bundle lange nicht lieferbar.
- **Affiliate:** Zwei Modelle stehen im Konzept (Portal verdient oder Partner verdient); Cookie-Tracking braucht Einwilligung. Bezahlte Links auf Partnerseiten mit Blick auf die Google-Richtlinien (`rel="sponsored"`) prüfen.
- **Rechtliches:** Einwilligung der Hotels für Werbemails bleibt offen (siehe Hotel-Ansprache: Kooperations-Einwilligung ohne Double-Opt-in); die Anfrage-Mail bleibt frei von Vertrieb (D1).

### StayAPI: kein Einsatz (Entscheidung Daniel 06.11.2026)
Geprüft in `docs/vorschlag-stayapi.md`. Daten stammen aus automatischer Abfrage öffentlicher Portalseiten, ohne Rechte an den Inhalten; nutzbar wäre im Kern nur die Zuordnung für Partnerlinks, das Risiko ist dafür zu hoch. Noten und Live-Preise nur über offizielle Wege (Tripadvisor steht oben im Backlog).

### Prozesstest Anfrage → CRM → Nachfassen (Stand 04.11.2026)
Live: Erinnerung mit eigenem Link (Migration 100), Ereignisse tri-hotel → Hub verbunden (`HUB_EVENTS_URL`/`HUB_EVENTS_SECRET`; Probe: ungültiges
Ereignis 400, falsches Geheimnis 401, von außen 404).
**Test gelaufen (04.11.) mit nicht öffentlichem Testhotel, Testdaten danach gelöscht:** Mail mit DKIM, SPF und DMARC bestanden, Formular mit echtem Link, Abmeldung, Foto,
Einwilligungen, `inquiry.answered`, `contact.profile`, `contact.consent` und Unternehmen im Hub. Antwort an `daniel@` laut Daniel angekommen.
Am 05.11. per Skript auf dem Server am Testhotel geprüft: Becken mit mehreren Angaben korrigiert und übernommen, entfernter Haken als Korrektur übernommen (Leistung aus dem Profil entfernt).
**Zweiter Test (06.11.), von Daniel als erfolgreich bestätigt, Testdaten gelöscht:** erste Mail und Erinnerung kamen an, `inquiry.sent` über den Job der App, Unternehmen im Hub entsteht (auch 19 echte Anfragen). Erinnerung danach mit Daniels neuem Text (DE, EN von ihm freigegeben; Rolle von Mia in eigener Zeile) eingespielt und an ihn verschickt. Erste echte Erinnerungen ab 12.11., 08:00 Uhr (19 Hotels).
Bekannte Lücken: Mail-Antwort, Erinnerung und Unzustellbares erzeugen keinen CRM-Vermerk; `PRIVACY_CRM_SECTION` im Hub noch `off`.
**Keine Sammelanlage (Entscheidung Daniel 04.11.):** Unternehmen entstehen im Hub immer durch den Versand der Anfrage-Mail (`inquiry.sent`). Sie haben dann nur den Namen und die Verknüpfung
zum tri-hotel-Objekt, keine Website und kein Land. Die 9 bereits versendeten Anfragen haben noch kein Unternehmen, bis ein weiteres Ereignis kommt.

### Hotel-Ansprache neu (Konzept 02.11.2026: https://claude.ai/artifact/EmRgGEgm2TMm9vSfkvvpqj)
Anfrage-Mail mit Daniels Vorstellung, Kurzprofil (Score, Platz, Kernfakten), Link zum Prüfen, Fotos (Upload oder Website-Fotos mit
Rechte-Erklärung), Ansprechpartner fürs Profil; Nachfassen durch Mia (KI gekennzeichnet); Übergabe ins CRM (Ereignisse an den Hub);
später Partnerbereich mit Login und Werbeprodukten (nur gekennzeichnet, ohne Einfluss auf Score/Platz).
- **D1 freigegeben (02.11.), geändert 04.11.:** Vertriebsfrage nicht in der Mail, nur freiwillig im Antwortformular mit Einwilligung. Daniel hat am 04.11. entschieden: **kein Double-Opt-in**, die Einwilligung geht direkt an den Hub (`verification: personal_link`, Name Pflicht, Adresse = angeschriebene Adresse). Der Nachweis nennt das offen; schwächer als Double-Opt-in.
- **Rechtlich prüfen lassen: Kooperations-Einwilligung ohne Double-Opt-in** (vor der ersten Werbemail an solche Kontakte; der Versand der Anfragen hängt nicht daran).
  - *Ablauf heute:* Das Hotel bekommt eine persönliche Anfrage-Mail an die öffentliche Kontaktadresse. Im Formular hinter dem persönlichen Link setzt es freiwillig das nicht vorausgewählte Häkchen
    „Ich möchte von tri-hotel.de per E-Mail über Kooperationsmöglichkeiten informiert werden …“ (Wortlaut in `src/lib/consents.js`, Version `2026-10b`) und nennt einen Namen. Beim Absenden geht sofort `contact.consent` an den Hub, ohne Bestätigungsmail.
  - *Was gespeichert wird:* Der Kontakt im Hub bekommt `email_consent = granted`, Rechtsgrundlage Art. 6 Abs. 1 lit. a DSGVO, der Lead steigt auf „Interesse bekundet“, und er gilt als werblich anschreibbar. Der Nachweis enthält „kein Double-Opt-in“, Wortlaut, Version, Zeitpunkte und Ereignis-ID.
  - *Fragen:* (1) Reicht das Häkchen über den persönlichen Link als Nachweis nach § 7 Abs. 2 UWG und Art. 7 Abs. 1 DSGVO, auch gegenüber Unternehmen? (2) Risiko bei weitergeleitetem Link oder Sammelpostfach: Wer willigt ein, wenn Name und Postfach nicht zur selben Person gehören? (3) Trägt die Einwilligung für eine Sammeladresse wie `info@`? (4) Reicht der Wortlaut für den Zweck, und passen die Absätze „Kooperationen“ in der Datenschutzerklärung sowie der CRM-Abschnitt im Hub?
  - *Dazu klären:* Gilt schon die Anfrage-Mail selbst als unaufgeforderte Werbung nach § 7 UWG (Eintrag kostenlos, Einladung Fotos und Angaben zu ergänzen, Bitte um Ansprechperson)? Sie ist als redaktionelle Faktenprüfung gedacht und geht an öffentliche Kontaktadressen; bis zum 05.11. sind 22 Anfragen versendet.
  - *Falls nicht ausreichend:* Bestätigungsmail nachrüsten. Vertrag und Hub können `doubleOptIn` bereits verarbeiten, in tri-hotel fehlen nur Mail und Bestätigungslink.
- **Vorlage entschieden (04.11.):** „Dauert keine 5 Minuten“ bleibt im Text. Bekannte Angaben und erfasste Leistungen sind im Formular eingeklappt, ein entfernter Haken zählt als Korrektur, ein stehender nicht als Bestätigung.
- **P1 gebaut (04.11., Migration 101–104):** Daniels Text als feste Vorlage DE/EN (`docs/anfrage-mail-entwurf.md`), Absender-Persona `founder` (`daniel@tri-hotel.de`,
  `personas.own_sender`, `is_ai`), Kurzprofil aus Score/Platz/Leistungen, Knopf „Jetzt Angaben ergänzen und Fotos hochladen“, Abmeldelink (`entities.inquiry_opt_out_at`,
  `/anfrage/:token/abmelden`), Feld „E-Mail für Rückfragen“ im Formular → Ereignis `contact.profile` ans CRM. Erinnerung kommt weiter von Mia mit KI-Hinweis.
  Das Formular zeigt alle erfragbaren Angaben zum Prüfen (`fullCheckSelection`). Header und DKIM an echter Mail geprüft (bestanden), Weiterleitung `daniel@` → `info@` eingerichtet.
  Englische Fassung von Daniel freigegeben (04.11.).
  Zweite Fassung von Daniel (05.11., Migration 105, Englisch freizugeben): ohne Score, Platz, Hotelseite und Mia. Herkunft der Adresse nur bei `contact_email_source = website`. 13 Anfragen gingen am 04./05.11. noch mit der ersten Fassung raus.
  **Abmeldelink = keine weiteren E-Mails (05.11.):** Sperre zentral in `mailer.send` (nach Betrieb oder Adresse, Status `blocked` im Versandprotokoll). Ausgenommen: Antworten auf Mails des Betriebs und von ihm selbst ausgelöste Mails. Weiterleitungen von Camp-Anfragen an ihn schlagen fehl und bleiben offen. Kooperations-Einwilligung endet, Hub bekommt `mail.opt_out` (Sperrvermerk).
  Mehrfachauswahl (`scoring.multi`, Becken) im Formular mit Häkchen, gespeichert wie im Admin (05.11.). Texte der Entwürfe entstehen bewusst erst beim Klick auf „Entwurf erstellen“, damit Score und Platz aktuell sind und keine KI-Kosten auf Vorrat anfallen (etwa 6 Cent je Entwurf).
  Robinson Club Fleesensee und Tauern Spa Zell am See-Kaprun sind auf die neue Vorlage umgestellt (Entwürfe, alter Text im Audit-Log). Alle 48 Entwürfe laufen unter Daniel. BCL Podium wurde schon am 26.10. versendet.
- **D2 entschieden (04.11.):** Absender der ersten Mail ist `daniel@tri-hotel.de`, ein **eigenes Postfach** bei IONOS (kein Alias von `info@`).
  IONOS nimmt die Adresse beim SMTP-Dialog mit der `info@`-Anmeldung an; DKIM-Signatur `s1-ionos` an echter Mail bestätigt (04.11.).
- **Antworten: Variante A (04.11.) hat nicht funktioniert:** Über die Weiterleitung `daniel@` → `info@` kam seit dem 04.11. nichts mehr im Admin an; Hotel-Antworten und Rückläufer lagen nur in `daniel@` (06.11. entdeckt). **Ersatz:** Der Abruf liest `daniel@` zusätzlich nur lesend (`IMAP_EXTRA_USER`, `IMAP_EXTRA_PASS`, 14 Tage), übernimmt nur Mails mit Bezug zu uns, verschiebt nichts. Keine Gegenrichtung `info@` → `daniel@`, sonst läuft die Mail im Kreis.
- **Keine Hinweis-Mail bei Antworten (04.11.):** `ADMIN_NOTIFY_EMAIL` bleibt leer. `info@` wird abgerufen, ein Hinweis dorthin wäre eine doppelte Aufgabe. Antworten erscheinen als Karten „Betreiber-Antwort“ und „Betreiber-Nachricht“.
- **Absender wählbar in Admin und Hub (Wunsch Daniel 04.11., Logik später festlegen):** Bisher gibt es nur die globale Einstellung
  `MAIL_PERSONA_SENDER`, und der Hub verschickt noch gar keine Mails. Zu klären: gepflegte Liste erlaubter Absender (wer pflegt sie, wie teilen sie
  sich Admin und Hub), Standard je Anlass (z. B. erste Anfrage Daniel, Erinnerung Mia), Änderung beim Versand, KI-Kennzeichnung je Absender,
  Verbindung nur über den Vertrag `docs/internal-api.md`. Wählbar nur Adressen, die IONOS annimmt und deren Antworten im abgefragten Postfach landen.
- Offen: D3–D7 (Vorstellungstext, Website-Fotos, CRM-Konzept anpassen, Partnerbereich, Produkte/Rechtsprüfung).

### 2. Konzept: Anfrage-Workflows bis zur Klärung, mit Voice-Agents (Agenda 21.10.)
Anfrage → Erinnerung → nächste Stufe bis zur Klärung, inkl. Anrufen per Voice-Agent. Vorab klären: Telefonkontakt zu
Unternehmen (UWG § 7 Abs. 2, mutmaßliche Einwilligung), KI-Kennzeichnung am Telefon (EU AI Act Art. 50),
Aufzeichnung/Transkript (DSGVO), Anbieter und Kosten.

### Seitenprüfung vom 06.11.2026: offene Pakete
Externe Prüfung gegen Live-Seite, Code und Datenbank validiert. Paket A (Fehler) ist gebaut. Reihenfolge: B, C, D.
**Nicht übernehmen:** Zählung 68 Hotels gegenüber den Regionen (rund 20 Hotels liegen außerhalb definierter Regionen), Hinweis zur Formel (steht schon auf `/triscore`), Alt-Texte „Symbolbild … – Hotel XY“ (deutet ein Foto des Hotels an), Umrechnung der Camp-Preise (nur je ein Preis in CHF und £).

**Paket B: Vertrauen**
- **Entscheidung offen, Quellen-Versprechen:** „Jeder Wert mit Quelle“ steht auf der Seite, aber nur 658 von 1.871 Werten (35 %) haben eine verlinkte Fundstelle (Stand 06.11.). Vorschlag: Satz ändern in „Jeder Wert mit Prüfstufe, Fundstelle wo vorhanden“ und Fundstellen schrittweise nachtragen. Betrifft auch Meta-Descriptions der Hotelseiten und die Startseite.
- Seite „Über tri-hotel“: **live seit 09.11. (B-30)**, siehe Kleinere offene Punkte. Offen aus diesem Punkt: Stand-Datum auf `/triscore`.

**Paket C: SEO-Inhalte**
- **B-31 (Plan 08.11., Daniel):** 1–3 live seit 08.11. (Abnahme an Stichproben geprüft). Punkt 4 **zurückgestellt (09.11., Daniel):** Hotel-Texte erst einzeln im Admin erzeugen, um Styleguide und Mustertexte zu schärfen; danach Sammellauf für die übrigen.
  1. Vergleichsseiten: Admin → Regionen → „Vergleichsseiten“: alle Paare mit/ohne Text, Schalter „indexieren“ je Paar mit Text (`region_pair_settings`, Migration 113); ohne Text immer noindex.
  2. Länderseiten DE/AT: Redaktionstext + 3 eigene Fragen (`country_texts`, Migration 112), dazu berechnete Fragen (Hotelzahl, Leistungen) als FAQPage. Länder mit 1 Hotel sind über die Mindestzahl schon noindex (B-37).
  3. Camp-FAQ `/trainingscamp`: + Pauschalreise/Einzelbuchung, Preisbestandteile, Absage/Versicherung (11 Fragen).
  4. Hotel-Texte: 39 Live-Hotels ohne Text (Stand 08.11.: 70 live, 24 freigegeben, 7 Entwürfe), ca. 0,04 $ je Text. Import-Prüfung der 99 geparkten Hotels: tatsächlich ca. 0,32 $ KI je Hotel (max. 0,85 $) + Places, zusammen ca. 35–40 $.
- **Vergleichsseiten, entschieden 08.11. (Daniel):** Regionsvergleiche mit Redaktionstext (`region_compare_texts`, beliebig viele je Region, Migration 110) werden indexiert und stehen in der Sitemap, alle anderen `noindex, follow`. Kommt ein Text dazu, wird die Seite automatisch indexierbar. Stand: 14 Paare (6 neue in Migration 111). `a-vs-b` und `b-vs-a` leiten auf die alphabetische Reihenfolge um, Top-Hotels sind verlinkt. Offen: Fazit „Für wen passt was?“, Links zu weiteren Paaren.
- Länderseiten mit Text und FAQ ausbauen, zuerst Deutschland (rund 635 Wörter ohne FAQ, Mallorca rund 2.300) und Österreich.
- Hotel-Texte: 24 veröffentlicht, 8 Entwürfe prüfen und freigeben, für die übrigen 36 Hotels erzeugen (KI-Budget). Passt zum Titel „… im Check“.
- Camp-Seite: FAQ um Stornierung und Versicherung ergänzen, Abschluss am Seitenende zur Anfrage statt nur zum Hotel-Ranking.

**Paket D: Conversion (nach Klärung der Gewerbeanmeldung, siehe „Gewerbeanmeldung vor Provisionen“)**
- Dezenter Link „Preise prüfen“ auf Hotelkarten in Liste und Regionsseiten, als Anzeige gekennzeichnet, ohne Einfluss auf die Reihenfolge. 50 von 68 Hotels haben Partnerlinks; die übrigen 18 ohne Link, das darf optisch nicht wie eine Bewertung wirken.
- Knopf „Anfragen“ auf den Camp-Karten. Formulierung „Anbieter zahlen nicht für ihre Aufnahme; Partnerschaften sind als Anzeige gekennzeichnet“ klarer fassen. Einheitliche Preisangabe „pro Woche“ prüfen.

## Kleinere offene Punkte
- **Über-Seite, SEO-Feinschliff (live seit 10.11., an der Live-Seite geprüft):** Titel auf 57 Zeichen gekürzt, Gründer in den strukturierten Daten mit Rolle und Porträt, „Stand“ sichtbar und als `dateModified` (`ueber.json` → `updated`, bei Textänderungen von Hand hochsetzen). `sameAs`: LinkedIn, Instagram und Strava eingetragen; seit 10.11. auch sichtbar als „Daniel auf LinkedIn · Instagram · Strava“ unter dem Abschnitt „Wer hinter tri-hotel.de steht“ (live, geprüft).
- **Faktenmaske: abgelehnte Eingaben bleiben stehen (B-88, live seit 10.11.; im Admin noch nicht von Hand geprüft – Daniel: einen Wert ohne Beleg speichern, Zeile muss rot stehen bleiben).** Ursache: „Fakten speichern“ ist ein Formular-Post mit Weiterleitung; die Seite lud danach den Stand aus der Datenbank, abgelehnte Zeilen (Beleg fehlt, ungültiger Wert) waren damit weg. Jetzt liegen abgelehnte Zeilen für einen Seitenaufruf in der Sitzung (`src/lib/fact-draft.js`) und stehen rot markiert mit Hinweis wieder im Formular; die Seite springt zur ersten offenen Zeile. Gültige Zeilen wurden und werden im selben Durchgang gespeichert. Tests `test/fact-draft.test.js`.
  - **„nein“ braucht keinen Beleg (Daniel, 09.11.):** `evidence.needed` – bei Ja/Nein-Kriterien mit Wert „nein“ und bei Auswahlwerten mit 0 Punkten (z. B. „keine“; Mehrfachauswahl: alle gewählten 0 Punkte) entfällt die Beleg-Pflicht und der Hinweis „Beleg fehlt“.
  - Offen (Daniel): Knopf „alle offenen Zeilen als Einschätzung der Redaktion kennzeichnen“?
- **Seite „Über tri-hotel“ (B-30, Text aus B-12, M1 Saisonstart): live seit 09.11.** (Commit bbdebc9; live geprüft: Seite, Fußzeile, Hinweis auf `/triscore`, Sitemap, Bilder, AboutPage). `/ueber-tri-hotel` = `/ueber-<site-code>`; Inhalt je Site unter `views/sites/<code>/ueber.ejs` + `ueber.json` (Titel, Beschreibung, E-Mail, Gründer), Logik in `services/about.js`, Tests `test/about.test.js`. Link in Fußzeile, Hinweis am Ende von `/triscore`, Sitemap, AboutPage-Daten.
  - **Text zum TriScore an die Methodik angepasst (09.11., von Daniel freigegeben):** Satz „Ohne Becken … gibt es keinen TriScore“ entfällt (kein K.O. seit Migration 054). Klima steht nicht mehr bei den Fakten, sondern als eigener Absatz „beste Reisezeit“ (fließt seit Migration 029 nicht ein). Bewertungen in drei Zuständen zur Laufzeit: `formula.athlete_enabled` an → „Fakten und Bewertungen“; Bewertungen möglich, zählen aber nicht (jetziger Stand laut Migration 034) → „Zusätzlich zum TriScore helfen dir die Bewertungen …“; `review_config.enabled` aus → kein Absatz. Punkt „Du warst im Trainingslager?“ mit Link auf `/hotels` (Formular gibt es nur je Hotel), sobald Bewertungen möglich sind.
  - **Fotos (09.11.):** Zwei Bildstellen im Abschnitt „Wer hinter tri-hotel.de steht“: Porträt klein neben dem Text (`public/sites/tri-hotel/ueber-portrait.jpg`, 724 × 724, Studioporträt im dunklen Pullover) und Aktionsbild darunter (`ueber-action.jpg`, 1086 × 724, Rad im Wettkampf). Größere Originale gibt es nicht, deshalb kein Bild über die volle Breite. Beide Dateien liegen im Repo und werden **ohne Urhebervermerk** angezeigt (Entscheidung Daniel 09.11., `ueber.json` → `no_credit: true` je Bild; Abweichung von der Regel „Urhebervermerk immer anzeigen“, gilt nur für diese beiden eigenen Bilder). Ein Vermerk lässt sich jederzeit über `photo.credit` bzw. `action.credit` nachtragen. Gewerbliche Nutzung beider Bilder von Daniel am 09.11. im Chat bestätigt (kein Schriftstück abgelegt). Die Sportograf-Bilder (Logo) sind nicht verwendet: laut AGB § 10 nur private Nutzung, gewerblich nur mit gesonderter Vereinbarung.
- **Dashboard: Besucher und Besuche** (Wunsch Daniel 02.11.): neben Seitenaufrufen auch Unique Visitors und Total Visits anzeigen – in den Kennzahlen und im Funnel (Plausible-Metriken `visitors`, `visits`), je Zeitraum und Seite.
- Jährliche Nachprüfung aktiver Camp-Anbieter als Board-Aufgabe.
- Camp-Prüfung: Impressum-/Kontaktseite gezielt mitladen (wird oft nicht gefunden); Trivolution-Website liefert 404.
- Abgleichsfelder der Camp-Anbieter (Monate, Niveaus, Gruppengröße, Preis) per Camp-Prüfung vorschlagen.
- Reihenfolge verknüpfter Hotels beim Camp-Anbieter folgt der Liste (alphabetisch), nicht der Klickreihenfolge.
- Landingpage „Trainingslager für Vereine“ (später).
- Grunddaten: bei stark verschobenen Koordinaten alte automatische Umgebungswerte (Stufe 4) ggf. verwerfen statt behalten.
- Eigene KI-Mail-Mustertexte (falls angepasst) haben den Abschnitt `{{#bestaetigen}}` nicht automatisch.

## Zu entscheiden (Daniel)
- **KI-Budget:** Oktober war am 29.10. aufgebraucht (20,08 von 20 $); seit 01.11. neues Monatsbudget (`LLM_MONTHLY_BUDGET_USD`, 20 $).
  Oktober-Verbrauch: Extraktion 14,09 $, Camp-Prüfung 3,56 $, Vergleich 1,00 $, Anfragen 0,81 $, Texte 0,63 $. Budget bei Bedarf erhöhen.
- **99 importierte Hotels (Import 22.10., 19:11) ohne Auto-Prüfung**: 124 von 125 Prüf-Jobs wurden beim Import sofort
  abgebrochen (pg-boss „cancelled“); die Meldungen stehen auf „bestätigt“ und erscheinen als „Auto-Prüfung hängt“.
  Am 26.10. entschieden: liegen lassen. Bei Bedarf in Etappen (z. B. 20) starten – Kosten ca. 0,13 $ KI + 0,03 $ Places je Hotel.
- Preis je geteilter Camp-Anfrage (A3, zurückgestellt; Vorschlag: halber Preis einer Einzelanfrage).
- `geo-refresh` für live-Objekte: würde ungeprüfte Vorschläge sofort in den Score bringen.

## Zu erledigen (Daniel)
- **KI-Schlüssel läuft am ca. 08.12.2026 ab** (am 08.11. mit 30 Tagen Laufzeit neu angelegt, der alte lief am 07.11. ab und legte Auto-Prüfung, Texte und KI-Mails still). Vorher neuen Schlüssel ohne Ablauf anlegen und setzen.
- **Import vom 01.11. prüfen:** lief um 08:00 – 20 neue Meldungen aus dem Abgleich sports-hotels.com und 7 erneut gestartete
  Auto-Prüfungen geparkter Importe; Ergebnisse in der Warteschlange prüfen.
- **Hybrid-Camp-Anbieter freigeben** (Reiseathleten, Titan Fitness Camp Algarve, BlackBOX Tenerife, UF Bootcamp – am 01.11. neu
  geprüft; UF Bootcamp rot: allgemeine Fitness-Retreats, eher ablehnen). Für diese vier legt die Prüfung keine Hotel-Meldungen an.
- **8 Reiseathleten-Hotels** im Fitness-Racing-Ranking (Aurora Sol, Vilamar, H10 Casa del Mar, Reverence Life, Iberostar Jardín del
  Sol, Regency Torviscas, Princess Inspire, Iberostar Sábila): Auto-Prüfung im Admin starten; Websites von H10/Iberostar bestätigen,
  Vilamar ohne Website.
- **Funnel-Ziele** für fitnessracing-hotel.de und „alle zusammen“ im Dashboard eintragen (bisher nur tri-hotel.de).
- **Tauern Spa Kaprun: Anfang November erneut senden** (Empfänger-Spamfilter hatte die junge Domain abgewiesen; Adresse korrekt).
- **Expedia-IDs für die übrigen Hotels** eintragen (Expedia aktiv seit 26.10., 35 Hotels mit Link; Hotels.com übernimmt die
  Nummer automatisch). Regeln: keine Gutscheine, keine Expedia-Links in E-Mails/Offline, „Expedia“ nicht in Titeln/Meta-Tags,
  Social-Media-Posts mit Expedia-Bezug als Werbung kennzeichnen, nicht auf die Marken bieten.
- **CHECK24-Nummern je Hotel** eintragen (Suchlink im Admin beim Hotel; Hotelnamen prüfen – die erste Nummer stimmt nicht
  immer) und den Link einmal im privaten Fenster testen.
- **Sovrn Commerce (Notiz 02.11.2026, Konto in Prüfung):** Sammelnetzwerk, Links **ohne Skript** möglich:
  `https://sovrn.co?key=<API Key>&u={url_enc}&cuid={slug}` als Deeplink-Vorlage (kein Code nötig). Nach Freischaltung:
  Daniel gibt den **API Key** (öffentlich, steht in jedem Link; commerce.sovrn.com → Sites). **Secret Key** nur selbst in die
  Server-`.env` (Berichte), nie in Chat/Repo. Dann Link-Check-API (`GET https://api.viglink.com/api/link/?out=…&key=…&format=json&geo=de`,
  liefert `affiliatable` und `eepc`, kein Klick) über die Websites aller Live-Hotels → Liste, wo Sovrn Provision bringt.
  Nur dort Sovrn-Link als eigener Buchungslink („Anzeige“); offizielle Website im Faktenblock bleibt neutral.
  Die von Sovrn angebotene **ads.txt** gehört zur Banner-Werbung – nicht einbauen (Tracking/Einwilligung, fremde Werbung neben
  dem Score); nur falls Sovrn sie für die Freischaltung zwingend verlangt (reine Textdatei, kein Skript).
- **Travelpayouts/Tripadvisor – erledigt (02.11.2026):** Tripadvisor-Hotelprogramm ist seit 01.06.2026 eingestellt (nur noch
  „Experiences“ = Touren/Aktivitäten) → Tripadvisor bleibt neutraler Bewertungs-Suchlink ohne Provision. Drive (Skript) nicht
  einbauen; laut Support einziger Besitznachweis. Konto geht auch unbestätigt („Manual installation“, Prüfung zweimal ausführen,
  dann „ohne Skript weiter“): Deeplinks manuell möglich, manche Programme verlangen aber Bestätigung. Nur bei Bedarf
  (z. B. Aktivitäten/Mietwagen) wieder aufgreifen.
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
- **trivago- und hotel.de-Nummern je Hotel** eintragen (Aufgaben „Partnerlink prüfen“, Google-Suchlink im Admin beim Hotel;
  trivago mit oder ohne „100-“, hotel.de aus detail?hn= oder der Ergebnisliste).
- Partnerprogramme: Awin-Publisher-/Programm-ID für HolidayCheck nach Freigabe; Booking-Bewerbung, sobald Search Console
  indexierte Seiten zeigt.
- Plausible: Ziel „Hotel-Anfrage-Start“ anlegen (Klick auf „Trainingslager anfragen“).
- Hunter.io-Konto („account restricted“) prüfen.
- Plausible-Ziel „Hotelvergleich“ + Eigenschaften `anbieter`/`art`, Gewerbeanmeldung vor Provisionen.
- Alte Erinnerung „Off-Site-Backup“ auf dem Firmen-Mac löschen (neue liegt auf dem privaten Mac, 04.01.2027).

## Zur Info: Server-Konfiguration (nur `.env`, nicht im Repo)
Google-Anmeldung (Stand 04.11.2026): tri-hotel und Hub danielreuland.com teilen einen OAuth-Client und dasselbe Secret; beide
Weiterleitungs-URIs stehen in der Console. Wer das Secret wechselt, muss es in beiden `.env` ändern und beide Apps neu starten.
`MAIL_PROVIDER=smtp` über info@tri-hotel.de (IONOS), `MAIL_INBOUND=imap`, `NOINDEX=false`; Site-Absender `info@tri-hotel.de`.
Search Console bestätigt, Sitemap eingereicht. PM2 im Cluster-Modus (Reload ohne Ausfall). Server-Sicherung der früheren
`package-lock.json`: `/root/package-lock.server-backup.json`.

## Erledigt (Oktober 2026, Kurzfassung)
- 01.11. **Startseite**: kompakter Hotel-Finder (Reisemonat, Wunschwetter warm/mild/kühl nach Ø-Tageshöchstwert, wenig Regen,
  Ausstattung, Live-Trefferzahl über `/finder/treffer`; `src/lib/finder.js`), Lockerungsvorschläge in der Liste bei < 3 Treffern,
  Slider der Top-Hotels ab TriScore 75, Bestenliste ab Platz 1, Camp-Anfrage im Camp-Band; Platz in der Liste = Gesamtranking.
- 01.11. **Hotelsuche findet Regionen und Länder** („Mallorca“ → alle 12 Hotels im Umkreis der Region).
- 06.11. **Morgenbericht per Mail** (`services/daily-report.js`, Job `daily-report`, von Hand `scripts/daily-report.js`): Vortag nach Berliner
  Zeit je Seite aus `funnel_domains`. `DAILY_REPORT_TO` leer = aus, `DAILY_REPORT_CRON` Standard 7 Uhr; abgerufene Adressen (info@) werden
  abgelehnt. „Klicks auf Hotels“ = Aufrufe der Objektseiten (Plausible); bei fitnessracing-hotel.de die Aufrufe auf tri-hotel.de mit dieser
  Herkunft. Antworten von Betreibern: Formular + Mails mit Bezug zu Anfrage oder Objekt, zweite Seite über `funnel_domains.ranking_id` (Migration 107).
- 01.11. **Dashboard-Funnel** mit Monatszielen (Seitenaufrufe → Hotelseiten → Partner-Klicks, → Camp-Seiten → Camp-Anfragen),
  Zeiträume gestern/7/30 Tage/Monat, je Seite (tri-hotel.de, fitnessracing-hotel.de, alle zusammen; Migrationen 094/095).
- 01.11. **Hybrid-Camps**: Site-Thema um Hybrid/Fitness Racing erweitert, Hotel-Meldungen je Anbieter abschaltbar (Migration 092),
  4 Anbieter aus Reiseathleten angelegt, Neuprüfung am 01.11. per Timer; Skripte `create-camp-providers.js`, `import-hotels.js --ranking --ohne-pruefung`.
- 30.10. **Partnerklicks nach Herkunftsseite** (`outbound_clicks.source`, `?von=` an den Links von fitnessracing-hotel.de, Migration 090).
- 30.10. **Fitness-Racing-Ranking** als Entwurf (siehe oben), Bonus-Typ und geteilte Werte (Migrationen 088/089/093).
- 01.11. Ratgeber-Konzept erstellt und zurückgestellt (siehe SEO).
- 28./29.10.: Admin-Dashboard als Startseite (/admin) mit Seitenaufrufen aus Plausible (`PLAUSIBLE_API_KEY` in der Server-`.env`),
  Partnerlink-Abdeckung und Klicks; Hotelliste unter Inhalte (/admin/objekte); Partnerlinks in den Hoteldetails klappbar;
  Test-Klicks bis 28.10. zurückgesetzt (Migration 087: 41 Partner-, 78 Camp-Klicks).
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
