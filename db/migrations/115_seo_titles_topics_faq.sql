-- B-45 und B-32 (Keyword-Analyse 12.11.2026): eigene Titel/H1 je Objekt und Region, Themenseiten je Region, Zusatzfragen je Region.

-- Eigener Titel, eigene H1 und Beschreibung je Objekt und Ranking (leer = Vorlage des Rankings)
ALTER TABLE entity_rankings ADD COLUMN seo_title text, ADD COLUMN seo_h1 text, ADD COLUMN seo_description text;

-- Eigener Titel und eigene H1 je Region; Zusatzfragen: Wetter in bestimmten Monaten, nächstgelegene Objekte zu einer Veranstaltung
ALTER TABLE region_texts ADD COLUMN seo_title text, ADD COLUMN seo_h1 text,
  ADD COLUMN faq_months smallint[] NOT NULL DEFAULT '{}', ADD COLUMN faq_event jsonb;

-- Themenseiten einer Region: Objekte, deren Wert eines Kriteriums eine der Ausprägungen hat, nach Score sortiert
CREATE TABLE area_topics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ranking_id uuid NOT NULL REFERENCES rankings(id) ON DELETE CASCADE,
  area_type text NOT NULL DEFAULT 'region' CHECK (area_type = 'region'),
  area_slug text NOT NULL,
  slug text NOT NULL CHECK (slug ~ '^[a-z0-9-]+$'),
  title text NOT NULL,
  h1 text NOT NULL,
  description text NOT NULL,
  intro text,
  criterion_code text NOT NULL,
  options text[] NOT NULL,
  min_count smallint NOT NULL DEFAULT 5,
  sort_order smallint NOT NULL DEFAULT 100,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'draft')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ranking_id, area_type, area_slug, slug)
);

-- Objektseiten (nur die beiden aus B-45)
UPDATE entity_rankings er SET seo_title = v.title, seo_h1 = v.h1, seo_description = v.descr
FROM entities e, rankings r, (VALUES
  ('club-la-santa-tinajo', 'Club La Santa Lanzarote: Trainingsbedingungen & TriScore', 'Club La Santa: Trainingshotel auf Lanzarote', NULL),
  ('barcelo-lanzarote-active-resort-costa-teguise', 'Barceló Lanzarote Active Resort: Triathlon-Check & TriScore', 'Barceló Lanzarote Active Resort für Triathleten',
   'Barceló Lanzarote Active Resort in Costa Teguise für Triathleten: 50-m-Becken, abschließbare Radgarage, Radwerkstatt. TriScore aus geprüften Fakten.')
) AS v(slug, title, h1, descr)
WHERE e.id = er.entity_id AND e.slug = v.slug AND r.id = er.ranking_id AND r.is_default;

-- Regionsseiten
UPDATE region_texts t SET seo_title = v.title, seo_h1 = v.h1
FROM regions g, (VALUES
  ('mallorca', 'Triathlon Hotel Mallorca: Trainingshotels im Vergleich', 'Triathlon-Hotels auf Mallorca'),
  ('lanzarote', 'Sporthotel Lanzarote: Trainingshotels für Triathleten', 'Sport- und Triathlonhotels auf Lanzarote')
) AS v(slug, title, h1)
WHERE g.id = t.region_id AND g.slug = v.slug;

UPDATE region_texts t SET faq_months = '{1,2,3}'
FROM regions g WHERE g.id = t.region_id AND g.slug IN ('lanzarote', 'fuerteventura', 'gran-canaria', 'teneriffa', 'mallorca', 'zypern');

-- Start in Port d'Alcúdia, Koordinaten ungefähr (Strand am Hafen); Datum laut Planung Daniel
UPDATE region_texts t SET faq_event = jsonb_build_object(
  'q', 'Welche Hotels liegen nah am IRONMAN 70.3 Mallorca (8. Mai 2027, Alcúdia)?',
  'intro', 'Das Rennen startet in Alcúdia im Norden der Insel.',
  'lat', 39.835, 'lng', 3.130, 'limit', 5)
FROM regions g WHERE g.id = t.region_id AND g.slug = 'mallorca';

-- Themenseite Mallorca: Becken ab 25 m im Hotel oder bis 5 km
INSERT INTO area_topics (ranking_id, area_slug, slug, title, h1, description, intro, criterion_code, options, min_count)
SELECT r.id, 'mallorca', 'hotels-mit-25-m-becken',
  'Hotel mit 25-m-Becken auf Mallorca: {anzahl} Trainingshotels',
  'Hotels mit 25-m-Becken auf Mallorca',
  '{anzahl} Hotels auf Mallorca mit Becken ab 25 m im Hotel oder bis 5 km entfernt, darunter 50-m-Becken, sortiert nach {score}.',
  'Becken ab 25 m im Hotel oder höchstens 5 km entfernt, 50-m-Becken eingeschlossen. Sortiert nach {score}, Partnerschaften ändern die Reihenfolge nicht.',
  'swim_pool', ARRAY['pool_50_hotel', 'pool_25_hotel', 'pool_50_within_5km', 'pool_25_within_5km'], 5
FROM rankings r WHERE r.is_default;

-- Startseite des Standard-Rankings (Admin-Felder meta_title, hero_title)
UPDATE rankings SET content = content || jsonb_build_object(
  'meta_title', 'Triathlon-Trainingslager: Hotels im neutralen Vergleich',
  'hero_title', 'Hotels fürs Triathlon-Trainingslager')
WHERE is_default;
