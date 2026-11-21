-- Rückgängig zu 125_seo_muster.sql (von Hand einspielen: psql "$DATABASE_URL" -f db/migrations/down/125_seo_muster.sql)
-- Stellt die Spalten und Overrides aus Migration 115 wieder her; die Ranking-Texte (content) bleiben auf dem neuen Stand.
BEGIN;
ALTER TABLE region_texts ADD COLUMN seo_title text, ADD COLUMN seo_h1 text;
UPDATE region_texts t SET seo_title = v.title, seo_h1 = v.h1
FROM regions g, (VALUES
  ('mallorca', 'Triathlon Hotel Mallorca: Trainingshotels im Vergleich', 'Triathlon-Hotels auf Mallorca'),
  ('lanzarote', 'Sporthotel Lanzarote: Trainingshotels für Triathleten', 'Sport- und Triathlonhotels auf Lanzarote')
) AS v(slug, title, h1)
WHERE g.id = t.region_id AND g.slug = v.slug;
DROP TABLE page_seo;
UPDATE entity_rankings er SET seo_title = v.title, seo_h1 = v.h1, seo_description = v.descr
FROM entities e, rankings r, (VALUES
  ('club-la-santa-tinajo', 'Club La Santa Lanzarote: Trainingsbedingungen & TriScore', 'Club La Santa: Trainingshotel auf Lanzarote', NULL),
  ('barcelo-lanzarote-active-resort-costa-teguise', 'Barceló Lanzarote Active Resort: Triathlon-Check & TriScore', 'Barceló Lanzarote Active Resort für Triathleten',
   'Barceló Lanzarote Active Resort in Costa Teguise für Triathleten: 50-m-Becken, abschließbare Radgarage, Radwerkstatt. TriScore aus geprüften Fakten.')
) AS v(slug, title, h1, descr)
WHERE e.id = er.entity_id AND e.slug = v.slug AND r.id = er.ranking_id AND r.is_default;
DELETE FROM schema_migrations WHERE name = '125_seo_muster.sql';
COMMIT;
