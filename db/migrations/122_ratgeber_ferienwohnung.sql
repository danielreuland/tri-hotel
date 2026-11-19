-- Ratgeber „Trainingslager in der Ferienwohnung“ (19.11.2026, docs/fewo-ratgeber-umsetzung.md, US2–US5).
-- Ratgeber sind redaktionelle Seiten je Site unter /ratgeber/:slug. Fließtext steht in der Vorlage
-- views/public/guides/<view>.ejs; im Admin pflegbar sind Stand-Daten, Status, Title/Meta/H1, Bad-Karten und Link-Slots.
-- Das Merkmal „Ferienwohnung“ liegt ohne Migration in entities.attributes.vacation_rental (services/rental.js).

CREATE TABLE guides (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id            uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  slug               text NOT NULL CHECK (slug ~ '^[a-z0-9-]+$'),
  view               text NOT NULL CHECK (view ~ '^[a-z0-9-]+$'),   -- Vorlage views/public/guides/<view>.ejs
  status             text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active')),
  title              text NOT NULL,              -- keine Marken von Partnern (lib/brands.js prüft beim Speichern)
  description        text NOT NULL,
  h1                 text NOT NULL,
  published_on       date,
  updated_on         date NOT NULL,              -- sichtbar „Aktualisiert: …“, dateModified
  research_on        date,                       -- „Stand der Recherche“
  list_criteria      text[] NOT NULL DEFAULT '{}', -- Kernfakten der Liste „Unterkünfte mit Ferienwohnung“ (Kriterien-Codes)
  settings           jsonb NOT NULL DEFAULT '{}',  -- u. a. box: Hinweiskasten in Liste/Regionsseiten (US5)
  content_changed_at timestamptz NOT NULL DEFAULT now(), -- lastmod der Sitemap (nur bei Inhaltsänderung)
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (site_id, slug)
);

-- Karten eines Ratgebers (z. B. Reiseziel mit Schwimmbad). Öffentlich nur mit status 'active' und ohne „[PRÜFEN“ im Text.
CREATE TABLE guide_cards (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guide_id     uuid NOT NULL REFERENCES guides(id) ON DELETE CASCADE,
  section      text NOT NULL DEFAULT 'baeder' CHECK (section ~ '^[a-z0-9-]+$'),
  sort_order   integer NOT NULL DEFAULT 100,
  title        text NOT NULL,
  body         text NOT NULL,                   -- Redaktionstext (lib/richtext: Absätze, „- “, [Text](https://…), **fett**)
  checked_on   date,                            -- Stand der Prüfung (sichtbar)
  link_slot    text,                            -- Schlüssel in partner_slots (optional, nur bei verifiziertem Bad)
  region_slug  text,                            -- interner Link zur Regionsseite, wenn es sie gibt
  entity_slugs text[] NOT NULL DEFAULT '{}',    -- interne Links zu Objektseiten (nur live)
  status       text NOT NULL DEFAULT 'hidden' CHECK (status IN ('active', 'hidden')),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX guide_cards_guide_idx ON guide_cards (guide_id, section, sort_order);

-- Link-Slots für Partnerlinks auf redaktionellen Seiten (Ratgeber, Hinweiskasten). Entweder Zieladresse beim Anbieter
-- (wird über partner_programs.link_template gebaut, {sid} = Ort des Links) oder fester Netzwerk-Link (unverändert im href).
-- Ohne aktiven Slot und ohne aktives Programm entfällt der Satz mit dem Link (keine Platzhalter).
CREATE TABLE partner_slots (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id     uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  key         text NOT NULL CHECK (key ~ '^[a-z0-9-]+$'),
  label       text NOT NULL,                    -- Zweck (nur Admin)
  program_id  uuid REFERENCES partner_programs(id) ON DELETE SET NULL,
  target_url  text,
  fixed_href  text,
  anchor      text NOT NULL,
  active      boolean NOT NULL DEFAULT false,
  sort_order  integer NOT NULL DEFAULT 100,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (site_id, key)
);

-- FeWo-direkt über CJ (Vertragspartner Expedia, Inc.). Deeplinks über den Generator „Deep Link AID“: Ziel codiert in url=,
-- Sub-ID in sid=. Links direkt im href (kein /go/-Redirect, Ziff. 8.1/8.2), gezählt per Beacon. Status inactive – Daniel aktiviert.
INSERT INTO partner_programs (code, name, domains, label_booking, label_reviews, link_template, link_params, direct_link,
                              trademark_notice, status, sort_order, notes)
VALUES ('fewo-direkt', 'FeWo-direkt', '{fewo-direkt.de,www.fewo-direkt.de}', 'Ferienwohnungen bei FeWo-direkt', 'Bewertungen bei FeWo-direkt',
        'https://www.jdoqocy.com/jt82gv30v2IKJKSJQSMJIKJSOJSLJ?sid={sid}&url={url_enc}', '{}', true,
        'VRBO ist eine Marke oder eingetragene Marke von Expedia, Inc.', 'inactive', 50,
        'FeWo-direkt über CJ (Expedia, Inc., Policies Fassung 14.06.2022). Nur Textlinks auf redaktionellen Seiten (Inhalte → Ratgeber, Link-Slots), nicht an Hotels. '
        || 'Kein /go/-Redirect, kein CJ-Pixel, keine Banner. Marken nicht in Title/Meta/OG. Keine Links in E-Mails/PDF bis Ziff. 5.1.22 geklärt. '
        || 'Offen: Ziff. 14.3 Special T&Cs, Provisionssatz, Markenhinweis für „FeWo-direkt“.')
ON CONFLICT (code) DO NOTHING;

-- Ratgeber auf tri-hotel.de (falls die Site existiert); Hinweiskasten: Kanaren → Kanaren-Link, Mallorca → Alcúdia-Link, sonst allgemein
INSERT INTO guides (site_id, slug, view, status, title, description, h1, published_on, updated_on, research_on, list_criteria, settings)
SELECT s.id, 'trainingslager-ferienwohnung', 'trainingslager-ferienwohnung', 'active',
       'Trainingslager selbst organisieren: Ferienwohnung-Guide 2027',
       'Trainingslager in der Ferienwohnung planen: FeWo-Checkliste (Radraum, Waschmaschine), 50-m-Becken je Region mit Quellen, Kosten & Packliste für Triathleten.',
       'Trainingslager selbst organisieren: So klappt dein Camp in der Ferienwohnung',
       '2026-11-19', '2026-11-19', '2026-11-10', '{swim_pool,bike_storage}',
       jsonb_build_object('box', jsonb_build_object(
         'active', true, 'after', 5,
         'heading', 'Oder doch lieber in eine Ferienwohnung?',
         'text', 'Für Gruppen und Selbstversorger kann eine Ferienwohnung passen. Wichtig: erst das Schwimmbad klären, dann die Wohnung buchen.',
         'guide_label', 'Ratgeber: Trainingslager in der Ferienwohnung',
         'default_slot', 'allgemein',
         'regions', jsonb_build_object('gran-canaria', 'kanaren', 'lanzarote', 'kanaren', 'fuerteventura', 'kanaren', 'teneriffa', 'kanaren', 'mallorca', 'alcudia')))
  FROM sites s WHERE s.code = 'tri-hotel'
ON CONFLICT (site_id, slug) DO NOTHING;

-- Link-Slots: drei feste CJ-Links (von Daniel erzeugt, ohne Pixel) aktiv; Deeplink-Slots ohne Ziel inaktiv, bis Daniel die
-- fewo-direkt.de-Adresse einträgt (Ort + Filter, ohne Reisedaten und utm_…)
INSERT INTO partner_slots (site_id, key, label, program_id, target_url, fixed_href, anchor, active, sort_order)
SELECT s.id, v.key, v.label, p.id, NULL, v.href, v.anchor, v.href IS NOT NULL, v.sort_order
  FROM sites s CROSS JOIN partner_programs p
  CROSS JOIN (VALUES
    ('allgemein', 'Allgemein (Startseite FeWo-direkt) – Ratgeber „Unterkunft finden“ und Hinweiskasten', 'https://www.dpbolvw.net/eh102hz74z6MONOWNUWQNMONTWUTRU', 'Ferienwohnungen auf FeWo-direkt suchen', 10),
    ('kanaren', 'Kanaren-Übersicht – Hinweiskasten Kanaren, Karte Gran Canaria', 'https://www.anrdoezrs.net/mb116nmvsmu9BABJAHJDA9BDFHDJDB', 'Ferienwohnungen auf den Kanaren ansehen', 20),
    ('alcudia', 'Alcúdia – Hinweiskasten Mallorca, Karte Mallorca Nord', 'https://www.tkqlhce.com/al102ox52x4KMLMULSUOLKMOPOTMRT', 'Ferienwohnungen in Alcúdia ansehen', 30),
    ('gruppen', 'Ratgeber Vergleich: Ferienhäuser für Gruppen (≥ 3 Schlafzimmer, Waschmaschine, Parkplatz)', NULL, 'Gruppen-Ferienhäuser mit Waschmaschine auf FeWo-direkt ansehen', 40),
    ('waschmaschine', 'Ratgeber FeWo-Check: Suche mit Waschmaschine + Parkplatz + ≥ 3 Schlafzimmer', NULL, 'Unterkünfte mit Waschmaschine und Parkplatz finden', 50),
    ('mallorca-preise', 'Ratgeber Kosten: Gruppenunterkünfte Mallorca (4–6 Personen, ohne Datum)', NULL, 'Aktuelle Preise für Gruppenunterkünfte auf Mallorca prüfen', 60),
    ('vereinsgruppen', 'Ratgeber Verein: Fincas mit ≥ 5 Schlafzimmern auf Mallorca', NULL, 'Fincas für Vereinsgruppen auf FeWo-direkt ansehen', 70),
    ('palma', 'Karte Palma', NULL, 'Ferienwohnungen in Palma ansehen', 80),
    ('pollenca', 'Karte Mallorca Nord: Port de Pollença', NULL, 'Unterkünfte in Port de Pollença prüfen', 90),
    ('colonia-sant-jordi', 'Karte Mallorca Süd', NULL, 'Unterkünfte in Colònia de Sant Jordi', 100),
    ('girona', 'Karte Girona', NULL, 'Ferienwohnungen in Girona ansehen', 110),
    ('costa-teguise', 'Karte Lanzarote (erst nach Klärung des Badzugangs)', NULL, 'Ferienwohnungen in Costa Teguise', 120),
    ('calp', 'Karte Costa Blanca', NULL, 'Ferienwohnungen in Calpe ansehen', 130),
    ('riva', 'Karte Gardasee', NULL, 'Ferienwohnungen in Riva del Garda', 140)
  ) AS v(key, label, href, anchor, sort_order)
 WHERE s.code = 'tri-hotel' AND p.code = 'fewo-direkt'
ON CONFLICT (site_id, key) DO NOTHING;

-- Bad-Karten aus der Vorlage (Stand der Recherche 10.11.2026). Nur Lanzarote ist ohne offene Prüfpunkte und aktiv;
-- die übrigen stehen mit „[PRÜFEN …]“ ausgeblendet bereit und lassen sich erst nach Entfernen der Marker aktivieren.
INSERT INTO guide_cards (guide_id, section, sort_order, title, body, checked_on, link_slot, region_slug, entity_slugs, status)
SELECT g.id, 'baeder', v.sort_order, v.title, v.body, '2026-11-10', v.slot, v.region, v.entities, v.status
  FROM guides g JOIN sites s ON s.id = g.site_id
  CROSS JOIN (VALUES
    (10, 'Palma / Mallorca Südwest',
     E'**Bad Son Hugo (Palma):** städtisch, 50 m. Die exakte Länge ist offiziell bestätigt ([Myrtha Pools](https://myrthapools.com/ap-en/magazine/son-hugo-the-myrtha-pool-measures-exactly-50-metres/); [SwimSwam](https://swimswam.com/confirmado-la-piscina-de-son-hugo-mide-50-metros/)). Betreiber ist IME Palma. 2017 war das Bad wegen eines Risses geschlossen ([Ultima Hora](https://www.ultimahora.es/deportes/otros-deportes/2017/10/24/301929/son-hugo-queda-piscina-hasta-los-tecnicos-determinen-la-gravedad-de-la-fisura.html)), später wurde es nach einer Sanierung wiedereröffnet ([mallorcadiario](https://www.mallorcadiario.com/las-piscinas-municipales-de-son-hugo-reabren-sus-puertas-el-proximo-26-de-julio)).\n\n[PRÜFEN: Einzeleintritt, freie Bahnzeiten, Status 2026, Jahr der Wiedereröffnung]\n\n**Freiwasser:** Portals Nous, Bendinat, Playa de Palma.\n\n**Unterkunft:** In der Nähe von Son Hugo im Norden der Stadt wohnen, wenn 50 m wichtig sind. Der Preis dafür ist mehr Stadtverkehr bei jeder Radausfahrt (Einschätzung).',
     'palma', 'mallorca', '{}'::text[], 'hidden'),
    (20, 'Mallorca Nord (Alcúdia / Port de Pollença)',
     E'**Lage:** Der Norden liegt unterhalb der Tramuntana, hat Unterkünfte für jedes Budget und direkten Zugang nach Sa Calobra. Laufen: in der Albufereta, rund 5 km südlich von Port d''Alcúdia, mit über 12 km meist befestigten Wegen, und auf den Promenaden ([220 Triathlon via Magzter](https://www.magzter.com/stories/sports/220-Triathlon/WHERE-TO-TRAIN-IN-MALLORCA)).\n\n**Bäder:** städtische 25-m-Hallenbäder in Pollença, Port de Pollença und Alcúdia ([220 Triathlon via Magzter](https://www.magzter.com/stories/sports/220-Triathlon/WHERE-TO-TRAIN-IN-MALLORCA)). [PRÜFEN: Ist die 25-m-Angabe aktuell? Preise und Bahnzeiten]\n\n**Freiwasser:** die geschützte Bucht von Alcúdia.\n\n**Fazit:** ein 25-m-Ziel. Für 50 m geht es nach Palma.',
     'alcudia', 'mallorca', '{}'::text[], 'hidden'),
    (30, 'Mallorca Süd (Colònia de Sant Jordi)',
     E'**Best Centre:** wird von Triathleten genutzt. Öffnung laut Bericht am 18. Februar, also nicht ganzjährig ([Mallorca Magazin, 18.02.2026](https://www.mallorcamagazin.com/nachrichten/gesellschaft/2026/02/18/148397/profi-johann-ackermann-verrat-warum-mallorca-das-schwimm-mekka-fur-ironmen-und-champions-ist.html)).\n\n[PRÜFEN: Länge, Gästezugang, Preis, Saisonzeiten]',
     'colonia-sant-jordi', 'mallorca', '{}'::text[], 'hidden'),
    (40, 'Girona (Katalonien)',
     E'**GEiEG Sant Ponç:** 50 × 21 m mit 8 Bahnen, auf 27 °C beheizt, Salzwasser-Chlorung. Das Dach lässt sich öffnen und ist im Sommer offen. Dazu kommt ein 25-m-Becken mit 6 Bahnen. Adresse: Carrer de l''Esport 16. Ein **privater Club** mit Angeboten für Camps ([Costa Brava Training Camps](https://trainingcamps.costabrava.org/en/facility/piscina-olimpica-geig/); [Girona Turisme](https://www.girona.cat/turisme/eng/dte_natacio.php)).\n\n[PRÜFEN: Können Einzelgäste Tagestickets kaufen? Anfrage an comercial@geieg.cat]\n\n**Städtische 25-m-Bäder:** Palau und Santa Eugènia ([Girona Turisme](https://www.girona.cat/turisme/eng/dte_natacio.php); [Swimmers Guide Palau](https://www.swimmersguide.com/locations/18821)), außerdem ein Hallenbad im Nachbarort Salt ([Swimmers Guide Salt](https://www.swimmersguide.com/locations/17986)).\n\n**Lage:** Girona gilt als „Multisport-Paradies“ für Triathleten ([Triathlete.com](https://www.triathlete.com/culture/girona-spain-is-a-multisport-paradise/)). Wohnen in der Altstadt oder nahe Sant Ponç (Einschätzung).',
     'girona', 'girona', '{}'::text[], 'hidden'),
    (50, 'Lanzarote',
     E'**Club La Santa:** drei 50-m-Becken, ganzjährig auf etwa 26 bis 27 °C beheizt ([Club La Santa](https://www.clublasanta.co.uk/activity/triathlon/)). Für Externe gibt es **keine Tages- oder Monatspässe**, nur Jahrespässe für 600 € (ohne Gym) oder 1.200 € (mit Gym), Stand Preisblatt 2025 ([Club La Santa, Preisblatt 2025](https://clublasanta.com/app/webroot/uploads/pages/practical/annual-pass/precios-e-info-uk_2025.pdf)). Für ein Camp in der Ferienwohnung kommt das Bad damit praktisch nicht in Frage.\n\n**Fazit:** Wer auf Lanzarote 50 m schwimmen will, wohnt besser im Resort.',
     NULL, 'lanzarote', '{club-la-santa-tinajo}'::text[], 'active'),
    (60, 'Fuerteventura',
     E'**Playitas Resort (Las Playitas):** 50-m-Freibad mit 8 Bahnen, ganzjährig 25 bis 26 °C. Der Strand nebenan dient zum Freiwassertraining ([Playitas Swimming](https://playitas.net/en/sport/swimming); [Playitas Open Water](https://playitas.net/en/sport/open-water-swimming)).\n\n[PRÜFEN: Zugang für Nicht-Gäste; Bäder in Corralejo und Puerto del Rosario]',
     NULL, 'fuerteventura', '{playitas-hotel-las-playitas}'::text[], 'hidden'),
    (70, 'Gran Canaria (Süden)',
     E'**Piscina „Ernesto Hernández“, San Fernando de Maspalomas:** städtisches Freibad ([Swimmers Guide](https://www.swimmersguide.com/locations/17550)).\n\n[PRÜFEN: Alle Daten stammen von 2020 – Länge, Preis, Öffnungszeiten, Heizung]',
     'kanaren', 'gran-canaria', '{}'::text[], 'hidden'),
    (80, 'Costa Blanca (Calpe/Calp)',
     E'**Städtisches Hallenbad Calp:** Es schloss im Dezember 2023 und öffnete am 6. Mai 2024 wieder, seitdem betreibt die Gemeinde es selbst ([Alicante Plaza, 06.05.2024](https://alicanteplaza.es/calp-reabre-la-piscina-cubierta-y-la-gestionara-directamente-desde-el-ayuntamiento)).\n\n[PRÜFEN: Länge, Status 2026, Gebührenordnung]',
     'calp', 'costa-blanca', '{}'::text[], 'hidden'),
    (90, 'Gardasee (Riva del Garda)',
     E'**Piscina Comunale Enrico Meroni:** Hallenbad, 25 × 12,5 m mit 6 Bahnen, für alle offen. Adresse: Piazza Maria Contini 5, etwa 1 km vom Zentrum ([Visit Trentino](https://www.visittrentino.info/en/guide/what-to-do/swimming-and-spa/swimming-pool-in-riva-del-garda_md_713)). Der Betreiber wechselte zu APM ([L''Adige](https://www.ladige.it/territori/riva-arco/piscina-meroni-da-settembre-ad-apm-vcx5arng)).\n\n[PRÜFEN: neues Einlassverfahren unter APM, Preise]',
     'riva', 'gardasee', '{}'::text[], 'hidden')
  ) AS v(sort_order, title, body, slot, region, entities, status)
 WHERE s.code = 'tri-hotel' AND g.slug = 'trainingslager-ferienwohnung'
   AND NOT EXISTS (SELECT 1 FROM guide_cards c WHERE c.guide_id = g.id);
