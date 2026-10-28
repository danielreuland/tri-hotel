-- hotel.de (Awin) aktivieren: Deeplink über Awin, Ziel ist die Detailseite des Hotels (detail?hn=<Nummer>).
-- Getestet 28.10.2026: Link landet beim Hotel, Awin zählt den Klick und hängt seine Kennung (awc, utm_*) selbst an.
-- Je Hotel genügt die Nummer, die Detail-Adresse oder die Adresse der Ergebnisliste (hotelTeaserKey[0]); Reisedaten fallen weg.
DO $$
DECLARE
  prog uuid := (SELECT id FROM partner_programs WHERE code = 'hotelde');
  playitas uuid := (SELECT id FROM entities WHERE slug = 'playitas-hotel-las-playitas');
BEGIN
  IF prog IS NULL THEN RETURN; END IF;

  UPDATE partner_programs SET
    link_template = 'https://www.awin1.com/cread.php?awinmid=16018&awinaffid=3127993&clickref={slug}&ued={url_enc}',
    id_url = 'https://www.hotel.de/de/detail?hn={id}',
    id_params = '{hotelTeaserKey[0]}',
    search_url = COALESCE(search_url, 'https://www.google.com/search?q=site%3Ahotel.de+{q}'),
    status = 'active',
    notes = notes || ' – Aktiv seit 28.10.2026: Awin-Programm 16018, Publisher 3127993; Hotelnummer aus detail?hn=<Nummer> '
         || '(oder hotelTeaserKey[0] aus der Ergebnisliste).',
    updated_at = now()
  WHERE id = prog;

  INSERT INTO admin_actions (entity_type, entity_id, action, diff)
  VALUES ('partner_program', prog, 'edit_partner_program',
          jsonb_build_object('status', 'active', 'id_url', 'https://www.hotel.de/de/detail?hn={id}', 'link_template', 'awin 16018'));

  IF playitas IS NOT NULL THEN
    INSERT INTO entity_links (entity_id, program_id, kind, url)
    VALUES (playitas, prog, 'booking', 'https://www.hotel.de/de/detail?hn=251368')
    ON CONFLICT (entity_id, program_id, kind) DO NOTHING;
    INSERT INTO admin_actions (entity_type, entity_id, action, diff)
    VALUES ('entity', playitas, 'edit_partner_links',
            jsonb_build_object('program', 'hotelde', 'kind', 'booking', 'old', null,
                               'new', 'https://www.hotel.de/de/detail?hn=251368'));
  END IF;
END $$;
