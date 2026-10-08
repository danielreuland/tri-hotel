-- Objektbilder wie die Stimmungsbilder als WebP-Varianten speichern (statt Original bis 8 MB ausliefern).
-- variants leer = Altbestand, der als Original unter storage_path liegt.
ALTER TABLE entity_images
  ADD COLUMN width    integer,
  ADD COLUMN height   integer,
  ADD COLUMN variants integer[] NOT NULL DEFAULT '{}';
CREATE INDEX entity_images_pending_idx ON entity_images (created_at) WHERE approved_at IS NULL;
