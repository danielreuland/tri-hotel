-- Fitness-Racing-Ranking (HybridScore): Lage des Trainings-Gyms zählt (Daniel, 30.10.2026).
-- Neues Kriterium „Lage des Trainings-Gyms“: im Hotel 7 · ≤ 1 km zu Fuß 5 · ≤ 5 km (Shuttle/Rad) 3 · weiter 0.
-- Die Geräte-Kriterien gelten für das Gym im Hotel oder ein fest zugeordnetes Partner-Gym.
-- Ausgleich auf genau 100: Training Club nur noch Status (offiziell = 4, ≤ 15 km = 2), Schlitten 9 → 8, SkiErg 5/3 → 4/2,
-- Öffnungszeiten 3/1 → 2/1, freie Fläche 2 → 1, Laufrunde 0–6 → 0–5. Kriterienversion wird erhöht.
-- Noch kein Objekt im Ranking: Ausprägungen des Training Clubs werden umbenannt, ohne Werte umzurechnen.

INSERT INTO criteria (ranking_id, category_id, code, label, value_type, scoring, max_points, sort_order)
SELECT r.id, k.id, 'hy_gym_location', 'Lage des Trainings-Gyms (wo die Stationen stehen)', 'option',
       '{"type":"option",
         "points":{"in_hotel":7,"walk_1km":5,"within_5km":3,"further":0},
         "labels":{"in_hotel":"im Hotel","walk_1km":"Partner-Gym ≤ 1 km, zu Fuß","within_5km":"Partner-Gym ≤ 5 km (Shuttle oder Rad)","further":"weiter entfernt"},
         "search_terms":["Fitnessstudio im Hotel","Gym im Hotel","Hotel-Gym","Partner-Gym","Partnerstudio","Shuttle zum Gym","on-site gym","partner gym"]}'::jsonb,
       7, 5
FROM rankings r JOIN ranking_categories k ON k.ranking_id = r.id AND k.code = 'stations'
WHERE r.code = 'fitness-racing-hotel'
ON CONFLICT (ranking_id, code) DO NOTHING;

UPDATE ranking_categories k SET label = 'Stationen & Kraft (Gym im Hotel oder Partner-Gym)'
FROM rankings r WHERE r.id = k.ranking_id AND r.code = 'fitness-racing-hotel' AND k.code = 'stations';

UPDATE criteria c SET
  scoring = CASE c.code
    WHEN 'hy_sled'      THEN c.scoring || '{"points_true":8}'::jsonb
    WHEN 'hy_skierg'    THEN c.scoring || '{"points":{"two_plus":4,"one":2,"none":0}}'::jsonb
    WHEN 'hy_gym_hours' THEN c.scoring || '{"points":{"h24":2,"h14":1,"shorter":0}}'::jsonb
    WHEN 'hy_floor'     THEN c.scoring || '{"points_true":1}'::jsonb
    WHEN 'hy_run_loop'  THEN c.scoring || '{"max":5}'::jsonb
    WHEN 'hy_training_club' THEN c.scoring
      || '{"points":{"official":4,"within_15km":2,"none":0},"labels":{"official":"im Hotel oder im genutzten Partner-Gym","within_15km":"anderer Training Club ≤ 15 km","none":"keiner in der Nähe"}}'::jsonb
  END,
  max_points = CASE c.code WHEN 'hy_sled' THEN 8 WHEN 'hy_skierg' THEN 4 WHEN 'hy_gym_hours' THEN 2 WHEN 'hy_floor' THEN 1
                           WHEN 'hy_run_loop' THEN 5 WHEN 'hy_training_club' THEN 4 END,
  version = c.version + 1
FROM rankings r
WHERE r.id = c.ranking_id AND r.code = 'fitness-racing-hotel'
  AND c.code IN ('hy_sled', 'hy_skierg', 'hy_gym_hours', 'hy_floor', 'hy_run_loop', 'hy_training_club');

-- Kontrolle: Summe muss 100 bleiben
DO $$
DECLARE s int;
BEGIN
  SELECT sum(c.max_points) INTO s FROM criteria c JOIN rankings r ON r.id = c.ranking_id WHERE r.code = 'fitness-racing-hotel' AND c.active;
  IF s IS DISTINCT FROM 100 THEN RAISE EXCEPTION 'Fitness-Racing-Ranking: Punktesumme % statt 100', s; END IF;
END $$;
