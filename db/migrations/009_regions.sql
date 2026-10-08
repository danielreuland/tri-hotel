-- Regionale Landingpages (SEO): Region = Mittelpunkt + Radius; Hotels ordnen sich über ihre Koordinaten zu.
-- Länderseiten entstehen automatisch aus entities.country (keine Tabelle nötig).
-- Seiten mit weniger als formula.region_min_entities Einträgen bleiben noindex (keine dünnen Seiten).

CREATE TABLE regions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id    uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  slug       text NOT NULL,                  -- 'mallorca'
  name       text NOT NULL,                  -- 'Mallorca'
  name_in    text NOT NULL,                  -- 'auf Mallorca' (für Titel: „Triathlon-Hotels auf Mallorca“)
  country    char(2) NOT NULL,
  lat        numeric(9,6) NOT NULL,
  lng        numeric(9,6) NOT NULL,
  radius_km  numeric(6,1) NOT NULL,
  intro      text,                           -- redaktioneller Einleitungstext (eigener Inhalt je Seite)
  status     ranking_status NOT NULL DEFAULT 'active',
  sort_order smallint NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (site_id, slug)
);

INSERT INTO regions (site_id, slug, name, name_in, country, lat, lng, radius_km, sort_order, intro)
SELECT s.id, v.slug, v.name, v.name_in, v.country, v.lat, v.lng, v.radius, v.sort, v.intro
FROM sites s, (VALUES
 ('mallorca', 'Mallorca', 'auf Mallorca', 'ES', 39.62, 2.98, 60, 10,
  'Mallorca ist das klassische Ziel für Triathlon-Trainingslager im Frühjahr: flache Küstenstraßen im Süden und Osten, die Serra de Tramuntana für lange Anstiege und viele Hotels mit Sportlerinfrastruktur.'),
 ('lanzarote', 'Lanzarote', 'auf Lanzarote', 'ES', 29.04, -13.63, 40, 20,
  'Lanzarote bietet ganzjährig mildes Klima, windige Radstrecken über Lavafelder und Freiwasser im Atlantik – ideal für Wintertraining.'),
 ('fuerteventura', 'Fuerteventura', 'auf Fuerteventura', 'ES', 28.36, -14.05, 60, 30,
  'Fuerteventura punktet mit konstanten Temperaturen, ruhigen Straßen und Sportresorts mit 50-m-Becken.'),
 ('gran-canaria', 'Gran Canaria', 'auf Gran Canaria', 'ES', 27.95, -15.60, 40, 40,
  'Gran Canaria verbindet warme Küstenorte mit anspruchsvollen Anstiegen ins Inselinnere.'),
 ('teneriffa', 'Teneriffa', 'auf Teneriffa', 'ES', 28.29, -16.62, 50, 50,
  'Teneriffa ist bekannt für lange Anstiege bis auf über 2.000 Meter und Höhentraining am Teide.'),
 ('girona', 'Girona', 'in Girona', 'ES', 41.98, 2.82, 40, 60,
  'Girona ist ein Hotspot für Radprofis: abwechslungsreiche Straßen zwischen Pyrenäen-Vorland und Costa Brava.'),
 ('algarve', 'Algarve', 'an der Algarve', 'PT', 37.10, -8.25, 90, 70,
  'Die Algarve bietet milde Winter, ruhige Hinterlandstraßen und Atlantikküste für Freiwassertraining.'),
 ('gardasee', 'Gardasee', 'am Gardasee', 'IT', 45.65, 10.67, 35, 80,
  'Der Gardasee ist ab dem Frühjahr beliebt: Freiwasser im See, Anstiege in den Alpen-Ausläufern und kurze Anreise aus Deutschland.'),
 ('zypern', 'Zypern', 'auf Zypern', 'CY', 35.00, 33.20, 120, 90,
  'Zypern hat eine der längsten Saisons im Mittelmeer und eignet sich für Trainingslager von Februar bis November.'),
 ('kreta', 'Kreta', 'auf Kreta', 'GR', 35.24, 24.90, 130, 100,
  'Kreta verbindet warme Küsten mit gebirgigem Hinterland und ruhigen Straßen.')
) AS v(slug, name, name_in, country, lat, lng, radius, sort, intro)
WHERE s.code = 'tri-hotel';

-- Mindestanzahl je Region/Land, ab der die Seite indexiert wird
UPDATE rankings SET formula = formula || '{"region_min_entities": 2}'::jsonb WHERE NOT formula ? 'region_min_entities';
