-- Rad stärker gewichten als Schwimmen: Schwimmen 30 -> 27, Rad 28 -> 33 (Summe 108, wird normiert).
-- Becken 15 -> 12 (K.O. bleibt), Radrevier 0–6 -> 0–10, Geführte Touren 4 -> 5. Kriterienversion wird erhöht.

UPDATE criteria c SET
  scoring = jsonb_set(c.scoring, '{points}', '{"pool_50_hotel":12,"pool_25_hotel":8,"pool_50_within_5km":6,"pool_25_within_5km":4,"none":0}'::jsonb),
  max_points = 12, version = c.version + 1
FROM rankings r WHERE c.ranking_id = r.id AND r.code = 'triathlon-hotel' AND c.code = 'swim_pool';

UPDATE criteria c SET
  label = 'Radrevier (Verkehr, Asphalt, Höhenmeter-Mix) – Admin-Einstufung 0–10',
  scoring = c.scoring || '{"min":0,"max":10}'::jsonb,
  max_points = 10, version = c.version + 1
FROM rankings r WHERE c.ranking_id = r.id AND r.code = 'triathlon-hotel' AND c.code = 'bike_terrain';

UPDATE criteria c SET
  scoring = c.scoring || '{"points_true":5}'::jsonb,
  max_points = 5, version = c.version + 1
FROM rankings r WHERE c.ranking_id = r.id AND r.code = 'triathlon-hotel' AND c.code = 'bike_guided';

-- Bereits erfasste Radrevier-Einstufungen von 0–6 auf 0–10 umrechnen
UPDATE entity_facts f SET value = jsonb_build_object('number', round((f.value->>'number')::numeric * 10 / 6))
FROM criteria c JOIN rankings r ON r.id = c.ranking_id
WHERE f.criterion_id = c.id AND r.code = 'triathlon-hotel' AND c.code = 'bike_terrain' AND f.value ? 'number';
-- Scores werden nach der Migration neu berechnet (scripts/recompute.js)
