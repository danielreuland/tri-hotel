-- Zafiro Palace Alcudia stand dreimal im Ranking (alle drei verweisen auf zafirohotels.com/…/zafiro-palace-alcudia/).
-- Behalten wird der älteste Eintrag (6d882fdf, „Zafirco Palace Alcudia“, Tippfehler) unter richtigem Namen und Slug.
-- Übernommen werden die belegten bzw. mehrheitlich geprüften Werte der beiden anderen; die alten Adressen leiten um.

CREATE TABLE IF NOT EXISTS entity_slug_redirects (
  entity_type text NOT NULL,
  old_slug    text NOT NULL,
  entity_id   uuid NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (entity_type, old_slug)
);

DO $$
DECLARE
  keep uuid := '6d882fdf-403f-4fd4-bf38-4fe94240086c';
  dup_a uuid := '2ad6a737-0a53-4366-bc2d-be98ffea10fb';  -- „Zafiro Palace Alcudia“, Port d'Alcúdia
  dup_b uuid := 'd1ce1c62-cf85-4284-b65b-bb8d54d5a818';  -- „Zafiro Palace“, Mallorca (Koordinaten bei Can Picafort, falsch)
  dups uuid[] := ARRAY[dup_a, dup_b];
BEGIN
  IF NOT EXISTS (SELECT 1 FROM entities WHERE id = keep) THEN RETURN; END IF;  -- lokale/Test-Datenbank

  -- Fakten: amtliche Badestelle 0,6 km (Náyade) statt OSM-Strand 1,3 km; Wäsche am Folgetag (2 von 3 Prüfungen)
  UPDATE entity_facts k SET value = d.value, points = d.points, source = d.source, trust_level = d.trust_level,
         evidence_url = d.evidence_url, evidence_text = d.evidence_text, checked_at = d.checked_at
    FROM entity_facts d JOIN criteria c ON c.id = d.criterion_id
   WHERE d.entity_id = dup_a AND k.entity_id = keep AND k.criterion_id = d.criterion_id
     AND c.code IN ('swim_open_water', 'log_laundry');

  -- Ausstattung: Vereinigung
  INSERT INTO entity_features (entity_id, feature_id, source, trust_level, evidence_url, evidence_text, checked_at)
  SELECT keep, feature_id, source, trust_level, evidence_url, evidence_text, checked_at
    FROM entity_features WHERE entity_id = ANY(dups)
  ON CONFLICT DO NOTHING;

  -- Camp-Zuordnungen (Hannes Hawaii Tours, Actreme) auf den behaltenen Eintrag
  UPDATE camp_provider_hotels SET entity_id = keep WHERE entity_id = ANY(dups);

  -- Verweise ohne Löschweitergabe umhängen statt verlieren
  UPDATE submissions SET entity_id = keep WHERE entity_id = ANY(dups);
  UPDATE submissions SET possible_duplicate_of = keep WHERE possible_duplicate_of = ANY(dups);
  UPDATE email_log SET entity_id = keep WHERE entity_id = ANY(dups);
  UPDATE mail_messages SET entity_id = keep WHERE entity_id = ANY(dups);
  UPDATE camp_leads SET entity_id = keep WHERE entity_id = ANY(dups);
  UPDATE camp_requests SET entity_id = keep WHERE entity_id = ANY(dups);
  UPDATE llm_usage SET entity_id = keep WHERE entity_id = ANY(dups);
  UPDATE api_usage SET entity_id = keep WHERE entity_id = ANY(dups);

  -- Alte Adressen leiten um (inkl. der des behaltenen Eintrags mit Tippfehler)
  INSERT INTO entity_slug_redirects (entity_type, old_slug, entity_id)
  SELECT entity_type, slug, keep FROM entities WHERE id = ANY(dups || keep)
  ON CONFLICT (entity_type, old_slug) DO UPDATE SET entity_id = EXCLUDED.entity_id;

  INSERT INTO admin_actions (entity_type, entity_id, action, diff)
  SELECT 'entity', keep, 'merge_duplicate', jsonb_build_object('merged', jsonb_agg(jsonb_build_object('id', id, 'name', name, 'slug', slug)),
         'rename', jsonb_build_object('from', 'Zafirco Palace Alcudia', 'to', 'Zafiro Palace Alcudia'))
    FROM entities WHERE id = ANY(dups);

  DELETE FROM entities WHERE id = ANY(dups);
  UPDATE entities SET name = 'Zafiro Palace Alcudia', slug = 'zafiro-palace-alcudia', city = 'Alcúdia' WHERE id = keep;
END $$;
