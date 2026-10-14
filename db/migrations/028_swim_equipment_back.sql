-- Rücknahme von 027: Schwimm-Trainingsmaterial zählt wieder im Ranking (Schwimmen 25 -> 27, Summe 103 -> 105),
-- die Leistung wird wieder aus dem Fakt abgeleitet. Die in 027 übernommenen direkten Einträge werden entfernt
-- (vor 027 gab es für diese Leistung keine direkt gepflegten Einträge).
UPDATE criteria c SET active = true, version = c.version + 1
FROM rankings r WHERE c.ranking_id = r.id AND r.code = 'triathlon-hotel' AND c.code = 'swim_equipment';

UPDATE features SET derive = '{"values": [true], "ranking": "triathlon-hotel", "criterion": "swim_equipment"}'::jsonb
WHERE code = 'swim_equipment';

DELETE FROM entity_features ef USING features f WHERE f.id = ef.feature_id AND f.code = 'swim_equipment';
-- Scores danach neu berechnen (npm run recompute)
