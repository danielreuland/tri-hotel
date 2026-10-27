-- CHECK24 (nur Pauschalreisen auf check24.net): 2 weitere Hotels (Gardasee, Dénia) sind dort nicht buchbar
-- (Prüfung Daniel, 28.10.2026). Link entfernen und „gibt es nicht“ vermerken, damit keine Aufgabe danach fragt.
DO $$
DECLARE
  prog uuid := (SELECT id FROM partner_programs WHERE code = 'check24');
  slugs text[] := ARRAY['aktivhotel-santa-lucia-torbole', 'mr-les-rotes-denia'];
BEGIN
  IF prog IS NULL THEN RETURN; END IF;

  INSERT INTO admin_actions (entity_type, entity_id, action, diff)
  SELECT 'entity', l.entity_id, 'edit_partner_links',
         jsonb_build_object('program', 'check24', 'kind', 'booking', 'old', l.url, 'new', null, 'absent', true,
                            'reason', 'bei CHECK24 nur Pauschalreisen – Hotel nicht gelistet')
    FROM entity_links l JOIN entities e ON e.id = l.entity_id
   WHERE l.program_id = prog AND e.slug = ANY(slugs);

  DELETE FROM entity_links l USING entities e
   WHERE e.id = l.entity_id AND l.program_id = prog AND e.slug = ANY(slugs);

  INSERT INTO entity_link_absences (entity_id, program_id)
  SELECT id, prog FROM entities WHERE slug = ANY(slugs)
  ON CONFLICT DO NOTHING;
END $$;
