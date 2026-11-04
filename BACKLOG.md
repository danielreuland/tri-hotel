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

### Prozesstest Anfrage → CRM → Nachfassen (Stand 04.11.2026)
Live: Erinnerung mit eigenem Link (Migration 100), Ereignisse tri-hotel → Hub verbunden (`HUB_EVENTS_URL`/`HUB_EVENTS_SECRET`; Probe: ungültiges
Ereignis 400, falsches Geheimnis 401, von außen 404). **Test noch nicht gestartet:** Daniel schickt eine Testadresse außerhalb von `tri-hotel.de`, dann
nicht öffentliches Testhotel anlegen, Entwurf freigeben, Mail, CRM-Unternehmen, Formular, Mail-Antwort und Erinnerung prüfen, danach Testdaten löschen.
Bekannte Lücken: Abmeldelink fehlt; `contact.profile`/`contact.consent` werden nicht ausgelöst (P2); Mail-Antwort, Erinnerung und Unzustellbares
erzeugen keinen CRM-Vermerk; Sammelanlage im Hub vor echten Anfragen ausführen; `PRIVACY_CRM_SECTION` im Hub noch `off`.

### Hotel-Ansprache neu (Konzept 02.11.2026: https://claude.ai/artifact/EmRgGEgm2TMm9vSfkvvpqj)
Anfrage-Mail mit Daniels Vorstellung, Kurzprofil (Score, Platz, Kernfakten), Link zum Prüfen, Fotos (Upload oder Website-Fotos mit
Rechte-Erklärung), Ansprechpartner fürs Profil; Nachfassen durch Mia (KI gekennzeichnet); Übergabe ins CRM (Ereignisse an den Hub);
später Partnerbereich mit Login und Werbeprodukten (nur gekennzeichnet, ohne Einfluss auf Score/Platz).
- **D1 freigegeben (02.11.):** Vertriebsfrage nicht in der Mail, nur freiwillig im Antwortformular mit Einwilligung + Double-Opt-in.
- **Mail-Text:** Daniel bearbeitet `docs/anfrage-mail-entwurf.md`; danach Paket P1 (Vorlage) bauen.
- **D2 entschieden (04.11.):** Absender der ersten Mail ist `daniel@tri-hotel.de`, ein **eigenes Postfach** bei IONOS (kein Alias von `info@`).
  IONOS nimmt die Adresse beim SMTP-Dialog mit der `info@`-Anmeldung an (Probe ohne Versand); DKIM-Einträge `s1-ionos`/`s2-ionos` vorhanden.
  Offen: Header-Prüfung und DKIM-Signatur an einer echten Mail.
- **Antworten: Variante A entschieden (04.11.):** Weiterleitung `daniel@` → `info@` mit Kopie im Postfach (von Daniel bei IONOS einzurichten, vor P1
  testen). Der Abruf liest nur `info@`; keine Gegenrichtung `info@` → `daniel@`, sonst läuft die Mail im Kreis.
- **Absender wählbar in Admin und Hub (Wunsch Daniel 04.11., Logik später festlegen):** Bisher gibt es nur die globale Einstellung
  `MAIL_PERSONA_SENDER`, und der Hub verschickt noch gar keine Mails. Zu klären: gepflegte Liste erlaubter Absender (wer pflegt sie, wie teilen sie
  sich Admin und Hub), Standard je Anlass (z. B. erste Anfrage Daniel, Erinnerung Mia), Änderung beim Versand, KI-Kennzeichnung je Absender,
  Verbindung nur über den Vertrag `docs/internal-api.md`. Wählbar nur Adressen, die IONOS annimmt und deren Antworten im abgefragten Postfach landen.
- Offen: D3–D7 (Vorstellungstext, Website-Fotos, CRM-Konzept anpassen, Partnerbereich, Produkte/Rechtsprüfung).

### 2. Konzept: Anfrage-Workflows bis zur Klärung, mit Voice-Agents (Agenda 21.10.)
Anfrage → Erinnerung → nächste Stufe bis zur Klärung, inkl. Anrufen per Voice-Agent. Vorab klären: Telefonkontakt zu
Unternehmen (UWG § 7 Abs. 2, mutmaßliche Einwilligung), KI-Kennzeichnung am Telefon (EU AI Act Art. 50),
Aufzeichnung/Transkript (DSGVO), Anbieter und Kosten.

## Kleinere offene Punkte
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
- **Import vom 01.11. prüfen:** lief um 08:00 – 20 neue Meldungen aus dem Abgleich sports-hotels.com und 7 erneut gestartete
  Auto-Prüfungen geparkter Importe; Ergebnisse in der Warteschlange prüfen.
- **Hybrid-Camp-Anbieter freigeben** (Reiseathleten, Titan Fitness Camp Algarve, BlackBOX Tenerife, UF Bootcamp – am 01.11. neu
  geprüft; UF Bootcamp rot: allgemeine Fitness-Retreats, eher ablehnen). Für diese vier legt die Prüfung keine Hotel-Meldungen an.
- **8 Reiseathleten-Hotels** im Fitness-Racing-Ranking (Aurora Sol, Vilamar, H10 Casa del Mar, Reverence Life, Iberostar Jardín del
  Sol, Regency Torviscas, Princess Inspire, Iberostar Sábila): Auto-Prüfung im Admin starten; Websites von H10/Iberostar bestätigen,
  Vilamar ohne Website.
- **Funnel-Ziele** für fitnessracing-hotel.de und „alle zusammen“ im Dashboard eintragen (bisher nur tri-hotel.de).
- Robinson Club Fleesensee und Hotel BCL Podium: zurückgesetzte Anfrage-Entwürfe prüfen und neu freigeben.
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
