# tri-hotel.de

Neutrale, filterbare Rankings. Das erste Ranking: Hotels für Triathlon-Trainingslager. Jedes Hotel bekommt einen nachvollziehbaren **TriScore** (0–100) aus geprüften Fakten und – ab Version 2 – Bewertungen von Athleten.

**Multi-Ranking von Anfang an:** Das Triathlon-Hotel-Ranking ist nur das erste Ranking. Weitere (z. B. Rad-Hotels, Hyrox-Gyms, andere Branchen) legt der Admin im Backend an – ohne Code-Änderung. Nichts im Code darf Triathlon-spezifisch hartcodiert sein (Kategorien, Kriterien, Gewichte, Labels, Scorename, Objekttyp kommen aus der DB).

Ausführliches Konzept (Score-Formel, Kriterien, Prozesse, Phase 2): https://claude.ai/code/artifact/f5918afd-7105-4996-b959-17dda9765e49 (Kopie als PDF: `docs/konzept.pdf`)

## Grundprinzipien (nicht verhandelbar)

- **Neutralität:** Partner- oder Affiliate-Status beeinflusst TriScore und Sortierung NIE.
- **Transparenz:** Jeder Faktenwert speichert Quelle, Vertrauensstufe, Fundstelle und Prüfdatum. Die Hotelseite zeigt das an.
- **Mensch prüft, Maschine bereitet vor:** In Phase 1 geht kein Hotel ohne Admin-Freigabe live. Automatisch extrahierte Werte sind Vorschläge.
- **Affiliate-Links werden als Werbung gekennzeichnet.**
- Sprache der Oberfläche: Deutsch.

## Stack

- Node.js + Express, PostgreSQL
- Server-seitiges Rendering (Template-Engine, z. B. EJS) – Hotelseiten müssen gut indexierbar sein
- Hintergrund-Jobs: pg-boss (Postgres-basiert, kein Redis)
- Mails: transaktionaler Mail-Dienst mit EU-Serverstandort (Anbieter noch offen, hinter Interface `mailer` kapseln)
- Extraktion: LLM-API mit festem JSON-Schema je Kriterium (Anbieter hinter Interface `extractor` kapseln)
- Geodaten: OpenStreetMap (Overpass / Nominatim), Klima: Open-Meteo
- Hosting: VPS mit Nginx + PM2 (wie triprep.de)

## Datenmodell in Kürze (Details: db/schema.sql)

- `rankings`: Definition eines Rankings (Code, Slug, Scorename z. B. „TriScore“, Objekttyp, Beschriftungen, optionale Subdomain, `formula` mit Gewichten 0,6/0,4, Bayes-C/-m, Mindest-Vollständigkeit, Nachprüfintervall; `labels` mit Score-Stufen; Status draft/active/archived; genau ein `is_default`).
- `ranking_categories`, `criteria`: Kategorien und Kriterien gehören zu einem Ranking. Die Summe `max_points` je Ranking ist frei (derzeit 106); der Score wird auf die erreichbaren Punkte normiert. Admin zeigt nur einen Hinweis bei Abweichung von 100.
- Score-Labels (`rankings.labels`) sind Startwerte und werden nach den ersten bewerteten Hotels angepasst.
- `entities`: bewertete Objekte (Hotel, Gym, Produkt …) mit `entity_type`. Ein Objekt kann in mehreren Rankings stehen.
- `entity_rankings`: Status, Score, Vollständigkeit, K.O.-Grund **je Ranking**.
- `entity_facts`: Faktenwerte je Objekt und Kriterium (mit Quelle, Vertrauensstufe, Fundstelle).
- `entity_images`: Bilder mit Quelle, Lizenz, Urhebervermerk, Freigabe-Nachweis, Ablaufdatum. Öffentlich nur anzeigen, wenn `approved_at` gesetzt und `valid_until` leer oder in der Zukunft.
- Scoring-Typen (`option`, `bool`, `rating`, `climate`) sind für alle Rankings gleich; neue Typen nur als Erweiterung von `services/scoring.js` mit Tests.

URLs: Das Standard-Ranking liegt auf `/` und `/hotel/:slug`; jedes weitere unter `/rankings/:ranking-slug` und `/rankings/:ranking-slug/:entity-slug`. Optional zusätzlich eine Subdomain je Ranking (`rankings.subdomain`, z. B. rad.tri-hotel.de), die per Host-Header dasselbe Ranking ausliefert.

## Vorgeschlagene Struktur

```
src/
  server.js
  routes/        public.js, submit.js, admin.js, admin-rankings.js
  services/      scoring.js, mailer.js, extractor.js, geo.js, climate.js
  jobs/          verify-expiry.js, auto-check.js, publish.js
  views/         public/, admin/, emails/
db/
  schema.sql
  seed_criteria.sql
  migrations/
```

## Version 1 (MVP) – Umfang

Öffentlich:
- `/` Startseite: Claim, TriScore kurz erklärt, Button „Hotel melden“, Liste der Live-Hotels
- `/hotel-melden` Formular (Version 1 nur für das Standard-Ranking; Formular und Pipeline sind ranking-parametrisiert, damit weitere Rankings später eigene Meldeformulare bekommen). Pflicht: Hotelname, Ort, Land, Website, E-Mail, Datenschutz-Häkchen. Optional: Poollänge, Radgarage, Hinweise, Rolle (Gast, Trainer, Hotel). Spamschutz: Honeypot + Rate-Limit pro IP
- `/bestaetigen/:token` bestätigt E-Mail (Token 72 h gültig, nur Hash in DB speichern)
- `/hotel/:slug` TriScore, Faktenblock mit Quelle je Wert, Klima je Monat, Karte, Buchungslink (als Werbung gekennzeichnet)
- `/triscore` Formel und Kriterienkatalog öffentlich
- Impressum, Datenschutz

Admin (`/admin`, Login, ein Admin):
- Warteschlange aller Meldungen, filterbar nach Status
- Detailansicht: jeder Wert mit Fundstelle, editierbar, Vertrauensstufe setzbar, Score-Vorschau live
- Aktionen: Freigeben · Ablehnen mit Begründung (löst Absage-Mail aus) · Zurückstellen mit Notiz
- Hotel selbst anlegen: gleicher Prozess ohne Bestätigungsmail (für die ersten 50 Hotels)
- **Rankings verwalten:** Ranking anlegen/bearbeiten (Name, Scorename, Objekttyp, Formel, Labels, Status), Kategorien und Kriterien pflegen (Punkteschema, K.O., Reihenfolge), Punktesumme-Prüfung, „Ranking duplizieren“ als Vorlage, Neuberechnung aller Scores nach Änderung (Kriterienversion hochzählen)
- Bilder: Upload mit Pflichtangaben Quelle/Lizenz/Urhebervermerk/Nachweis, Freigabe, Ablaufwarnung bei `valid_until`
- Aufgaben: strittige Werte, fällige Nachprüfungen (Werte älter als 18 Monate)
- Audit-Log

Reihenfolge der Umsetzung:
1. Schema + Seed → 2. Meldeformular + Bestätigungsmail → 3. Auto-Prüfung → 4. Adminbereich → 5. Hotelseite → 6. Live-Mail

## Meldeprozess (Status in `submissions.status`)

`received` → (Mail mit Link) → `verified` → `auto_check` → `admin_review` → `live`
Nebenausgänge: `expired` (nicht bestätigt nach 72 h), `duplicate` (an bestehendes Hotel angehängt, Melder bekommt dessen Link), `rejected` (K.O. oder Admin, Mail mit Begründung).

Auto-Prüfung:
1. Hotelwebseite abrufen, Kriterien per LLM extrahieren – jede Angabe mit Fundstelle (URL + Textausschnitt). Kein Wert ohne Fundstelle.
2. Geodaten: Koordinaten, Flughafen-Distanz, nächstes 25/50-m-Becken, 400-m-Bahn, Strand.
3. Klimadaten je Monat.
4. K.O.-Regel + Vollständigkeit prüfen, vorläufigen Score berechnen.
5. Hotelseite als Entwurf, Meldung in Admin-Warteschlange.

Mails: (1) Danke + Bestätigungslink, (2) Absage mit Begründung, (3) „Deine Hotelseite ist online“ mit Link.

## Scoring (Kurzfassung – Details im Konzept)

- `TriScore = round(0.6 * F + 0.4 * A)`; in Version 1 ohne Bewertungen gilt `TriScore = round(F)` und der Score ist als **vorläufig** markiert.
- **F (Fakten-Score):** Punkte aus `criteria` des jeweiligen Rankings (Summe derzeit 106, Score wird normiert), normiert auf die maximal erreichbaren Punkte der *bekannten* Kriterien.
- **Vollständigkeit:** Ins Ranking nur, wenn ≥ 70 % der Punktegewichte bekannt sind; sonst „Profil unvollständig“.
- **K.O.:** Kein Becken ≥ 25 m im Umkreis von 5 km → kein Score, Meldung wird abgelehnt.
- **Klima:** Punkte abhängig vom Reisemonat; ohne Monat zählt der beste Monat.
- **A (Athleten-Score, ab Version 2):** Bayes-Mittel `A = (C*m + Σ w_i*r_i) / (C + Σ w_i)`, C = 5, m = Plattformmittel (Start 70), Gewicht nach Alter (1,0 / 0,7 / 0,4 / 0).
- Labels: 85–100 Top-Trainingshotel · 70–84 Sehr gut geeignet · 55–69 Geeignet · < 55 Eingeschränkt geeignet.

Vertrauensstufen in `entity_facts.trust_level`: 1 = vom Hotel bestätigt, 2 = Admin geprüft, 3 = von Nutzern bestätigt, 4 = automatisch ermittelt.

Die Werte 0,6/0,4, C, m und Mindest-Vollständigkeit stammen aus `rankings.formula`, nicht aus dem Code. Scoring-Logik gehört ausschließlich in `services/scoring.js` und braucht Unit-Tests für jede Regel (auch mit einem zweiten Test-Ranking, z. B. Hyrox, damit nichts Triathlon-spezifisch wird).

## Später (nicht in Version 1 bauen)

- Version 2: Bewertungen (7 Dimensionen, Faktencheck-Fragen), Vergleich von bis zu 3 Hotels (`/vergleich/a-vs-b-vs-c`, nur innerhalb eines Rankings)
- Phase 2: Partner-CRM im Admin (Priorität), danach `/partner-werden`, mehrere Buchungslinks je Hotel, Klick-Tracking `/go/:hotel/:anbieter`, Provisionsabrechnung

## Konventionen

- Keine Secrets im Repo; Konfiguration über `.env` (siehe `.env.example`).
- Datenbankänderungen nur über Migrationen in `db/migrations/`.
- Jede Admin-Änderung an Fakten oder Status schreibt einen Eintrag in `admin_actions`.
- Keine Fotos von fremden Websites übernehmen (Urheberrecht). Version 1: Hotelseiten ohne Hotelfoto (Karte/Platzhalter). Bilder nur mit dokumentierter Berechtigung in `entity_images` (Hotel-Freigabe, Partner-Feed nach dessen Bedingungen, Places mit Attribution, eigene Fotos, freie Lizenzen nur für generische Motive). Kein Hotlinking, Urhebervermerk immer anzeigen.
- Keine Triathlon-Annahmen im Code: Kategorien, Kriterien, Formel, Labels, Beschriftungen immer aus `rankings`/`criteria` lesen.
