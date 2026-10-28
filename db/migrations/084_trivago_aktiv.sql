-- trivago (Awin) aktivieren: Deeplink über Awin, Ziel ist die trivago-Hotelseite aus der Hotelnummer (?search=100-<Nummer>).
-- Getestet 28.10.2026: Link landet beim Hotel, Awin zählt den Klick und hängt die trivago-Tracking-ID (cip, cip_tc) selbst an.
-- Je Hotel genügt die Nummer oder die kopierte trivago-Adresse (Reisedaten werden beim Speichern entfernt).
DO $$
DECLARE
  prog uuid := (SELECT id FROM partner_programs WHERE code = 'trivago');
  playitas uuid := (SELECT id FROM entities WHERE slug = 'playitas-hotel-las-playitas');
BEGIN
  IF prog IS NULL THEN RETURN; END IF;

  UPDATE partner_programs SET
    link_template = 'https://www.awin1.com/cread.php?awinmid=105923&awinaffid=3127993&clickref={slug}&ued={url_enc}',
    id_url = 'https://www.trivago.de/de/srl?search=100-{id}',
    status = 'active',
    notes = notes || ' – Aktiv seit 28.10.2026: Awin-Programm 105923, Publisher 3127993; Hotelnummer aus der trivago-Adresse '
         || '(search=100-<Nummer>), Awin-Banner/-Widget werden nicht verwendet.',
    updated_at = now()
  WHERE id = prog;

  INSERT INTO admin_actions (entity_type, entity_id, action, diff)
  VALUES ('partner_program', prog, 'edit_partner_program',
          jsonb_build_object('status', 'active', 'id_url', 'https://www.trivago.de/de/srl?search=100-{id}', 'link_template', 'awin 105923'));

  IF playitas IS NOT NULL THEN
    INSERT INTO entity_links (entity_id, program_id, kind, url)
    VALUES (playitas, prog, 'booking', 'https://www.trivago.de/de/srl?search=100-179546')
    ON CONFLICT (entity_id, program_id, kind) DO NOTHING;
    INSERT INTO admin_actions (entity_type, entity_id, action, diff)
    VALUES ('entity', playitas, 'edit_partner_links',
            jsonb_build_object('program', 'trivago', 'kind', 'booking', 'old', null,
                               'new', 'https://www.trivago.de/de/srl?search=100-179546'));
  END IF;
END $$;
