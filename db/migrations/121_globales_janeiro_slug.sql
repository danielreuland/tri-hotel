-- B-46: Tippfehler im Namen „Globals Janeiro“ (Hotel heißt laut globales.com „Globales Janeiro“, Can Picafort).
-- Name und Slug korrigieren; die alte Adresse /hotel/hotel-globals-janeiro-can-picafort leitet dauerhaft (301) um
-- (entity_slug_redirects, Migration 080). Auf lokalen/Test-Datenbanken ohne das Hotel passiert nichts.

DO $$
DECLARE
  e record;
BEGIN
  SELECT id, entity_type, name, slug INTO e FROM entities WHERE entity_type = 'hotel' AND slug = 'hotel-globals-janeiro-can-picafort';
  IF NOT FOUND THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM entities WHERE entity_type = e.entity_type AND slug = 'globales-janeiro-can-picafort') THEN
    RAISE EXCEPTION 'Slug globales-janeiro-can-picafort ist schon vergeben';
  END IF;

  INSERT INTO entity_slug_redirects (entity_type, old_slug, entity_id)
  VALUES (e.entity_type, e.slug, e.id)
  ON CONFLICT (entity_type, old_slug) DO UPDATE SET entity_id = EXCLUDED.entity_id;

  UPDATE entities SET name = 'Globales Janeiro', slug = 'globales-janeiro-can-picafort', updated_at = now() WHERE id = e.id;
  -- Tippfehler auch in Redaktionstext und eigenen SEO-Feldern
  UPDATE entity_texts SET summary = replace(summary, 'Globals Janeiro', 'Globales Janeiro'), body = replace(body, 'Globals Janeiro', 'Globales Janeiro')
   WHERE entity_id = e.id AND (summary LIKE '%Globals Janeiro%' OR body LIKE '%Globals Janeiro%');
  UPDATE entity_rankings SET seo_title = replace(seo_title, 'Globals Janeiro', 'Globales Janeiro'),
         seo_description = replace(seo_description, 'Globals Janeiro', 'Globales Janeiro'), seo_h1 = replace(seo_h1, 'Globals Janeiro', 'Globales Janeiro')
   WHERE entity_id = e.id;

  INSERT INTO admin_actions (entity_type, entity_id, action, diff)
  VALUES ('entity', e.id, 'rename', jsonb_build_object(
    'name', jsonb_build_object('from', e.name, 'to', 'Globales Janeiro'),
    'slug', jsonb_build_object('from', e.slug, 'to', 'globales-janeiro-can-picafort'),
    'reason', 'B-46: Tippfehler, Hotelname laut Website „Globales Janeiro“'));
END $$;
