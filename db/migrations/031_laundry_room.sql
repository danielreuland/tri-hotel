-- Wäscheservice um „Waschraum zum Selbstwaschen“ ergänzen (2 Punkte, wie „nächster Tag“); Kriterium heißt jetzt
-- „Wäscheservice / Waschraum“. Dazu eine eigene Leistung, damit Waschraum und Wäscheservice getrennt sichtbar bleiben.
UPDATE criteria c SET
  label = 'Wäscheservice / Waschraum für Sportkleidung',
  scoring = jsonb_set(jsonb_set(c.scoring, '{labels,laundry_room}', '"Waschraum zum Selbstwaschen"'), '{points,laundry_room}', '2'),
  version = c.version + 1
FROM rankings r WHERE c.ranking_id = r.id AND r.code = 'triathlon-hotel' AND c.code = 'log_laundry';

INSERT INTO features (entity_type, code, label, group_label, sort_order, filterable, derive)
VALUES ('hotel', 'laundry_room', 'Waschraum (Selbstbedienung)', 'Service', 70, false,
        '{"values": ["laundry_room"], "ranking": "triathlon-hotel", "criterion": "log_laundry"}')
ON CONFLICT DO NOTHING;
