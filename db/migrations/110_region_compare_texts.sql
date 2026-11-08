-- Mehrere Vergleichstexte je Region (bisher genau einer in region_texts.compare_slug/compare_text). Ein Text gilt für das
-- Paar beider Regionen: Er steht auf beiden Regionsseiten und auf der Vergleichsseite, die damit indexiert wird.
CREATE TABLE region_compare_texts (
  region_id    uuid NOT NULL REFERENCES regions(id) ON DELETE CASCADE,
  compare_slug text NOT NULL,                 -- Slug der anderen Region
  text         text NOT NULL CHECK (text <> ''),  -- 2–3 Sätze zum Vergleich
  sort_order   int NOT NULL DEFAULT 0,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (region_id, compare_slug)
);

INSERT INTO region_compare_texts (region_id, compare_slug, text, updated_at)
SELECT region_id, compare_slug, compare_text, updated_at FROM region_texts
 WHERE compare_slug IS NOT NULL AND COALESCE(compare_text, '') <> '';

ALTER TABLE region_texts DROP COLUMN compare_slug, DROP COLUMN compare_text;
