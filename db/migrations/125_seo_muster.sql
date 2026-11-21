-- B-45 (Runde 2, 21.11.2026): Title/H1/Beschreibung als Muster je Seitentyp, je Seite im Admin überschreibbar.
-- Grundlage: Keyword-Analyse B-18 und Search Console B-17. URLs, Canonicals, Score und Reihenfolge bleiben unverändert.

-- Eigene Texte je Regions- und Länderseite eines Rankings (leer = Muster aus rankings.content). Ersetzt region_texts.seo_title/seo_h1,
-- damit auch Länder und Regionen ohne Redaktionstext einen Override bekommen können.
CREATE TABLE page_seo (
  ranking_id  uuid NOT NULL REFERENCES rankings(id) ON DELETE CASCADE,
  page_type   text NOT NULL CHECK (page_type IN ('region', 'land')),
  slug        text NOT NULL CHECK (slug ~ '^[a-z0-9-]+$'),
  title       text,
  h1          text,
  description text,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ranking_id, page_type, slug)
);

-- Muster des Triathlon-Rankings (Texte gehören in die DB, nicht in den Code)
UPDATE rankings
   SET content = COALESCE(content, '{}'::jsonb) || jsonb_build_object(
         'meta_title', 'Triathlon-Trainingslager: Hotels im Vergleich',
         'hero_title', 'Hotels für dein Triathlon-Trainingslager',
         'hero_text', 'Freie Bahnen um 7 Uhr, eine abschließbare Radgarage, eine ruhige Laufrunde ab der Tür: Der TriScore bewertet Sporthotels nach dem, was im Trainingslager zählt. Jeder Wert mit Herkunft und Prüfdatum.',
         'area_title', 'Triathlon-Hotels {name} im {score}-Vergleich',
         'area_h1', 'Triathlon-Hotels {in}',
         'country_title', 'Triathlon-Hotels {in}',
         'country_h1', 'Triathlon-Hotels {in}',
         -- erste Fassung, die in 60 Zeichen passt, gewinnt; lange Namen bekommen eine kürzere
         'entity_title', jsonb_build_array(
           '{name}: Training, Becken und {scorename}',
           '{name}: Training, Becken, {scorename}',
           '{name}: Training und {scorename}',
           '{name} im {scorename}-Check'),
         'entity_h1', '{name} – Trainingsbedingungen im Check'),
       updated_at = now()
 WHERE code = 'triathlon-hotel';

-- Bisherige Overrides: Lanzarote bekommt den Title aus B-45, H1 nach Muster; Mallorca wieder ganz nach Muster
INSERT INTO page_seo (ranking_id, page_type, slug, title)
SELECT r.id, 'region', 'lanzarote', 'Triathlon- und Sporthotels Lanzarote im Vergleich'
  FROM rankings r WHERE r.code = 'triathlon-hotel';
ALTER TABLE region_texts DROP COLUMN seo_title, DROP COLUMN seo_h1;

-- Hotelseiten: Overrides aus Migration 115 entfernen, damit das Muster greift
UPDATE entity_rankings er SET seo_title = NULL, seo_h1 = NULL, seo_description = NULL
  FROM entities e WHERE e.id = er.entity_id AND e.slug IN ('club-la-santa-tinajo', 'barcelo-lanzarote-active-resort-costa-teguise');

-- Name mit Akzent (bisher nur im Override richtig geschrieben)
UPDATE entities SET name = 'Barceló Lanzarote Active Resort', updated_at = now()
 WHERE slug = 'barcelo-lanzarote-active-resort-costa-teguise' AND name = 'Barcelo Lanzarote Active Resort';
