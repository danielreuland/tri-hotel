-- Beispielbilder je Region für Objektseiten ohne eigene Fotos (zusätzlich zum Titelbild der Region, zusammen höchstens 5).
ALTER TABLE site_media ADD COLUMN example_region_id uuid REFERENCES regions(id) ON DELETE SET NULL;
CREATE INDEX site_media_example_region_idx ON site_media (example_region_id) WHERE example_region_id IS NOT NULL;
