-- tri-hotel.de – Seed: Ranking 'triathlon-hotel', Kategorien und Kriterienkatalog, Version 1
-- Summe max_points = 106 (der Score wird auf die erreichbaren Punkte normiert, die Summe ist daher unkritisch)
-- Schwimmen 30 · Rad 28 · Laufen 12 · Verpflegung 11 · Regeneration & Indoor 12 · Logistik & Klima 13
-- Score-Labels (rankings.labels) werden nach den ersten bewerteten Hotels angepasst.
--
-- scoring-Formate (ausgewertet in services/scoring.js, für alle Rankings gleich):
--   {"type":"option","points":{"<option>":<punkte>, ...},"ko":["<option>"]}
--   {"type":"bool","points_true":<punkte>}
--   {"type":"rating","min":0,"max":<punkte>}            -- Admin-Einstufung
--   {"type":"climate","metric":"avg_high_c"|"rain_days","bands":[{"min":..,"max":..,"points":..}]}  -- aus climate_monthly (Ø Tageshöchstwert °C bzw. Regentage)
-- Neue Rankings (Rad, Hyrox ...) legt der Admin im Backend an; dieser Seed ist nur das erste.

INSERT INTO rankings (code, slug, name, score_name, description, entity_type, entity_label_sg, entity_label_pl, is_default, status)
VALUES ('triathlon-hotel', 'triathlon-hotels', 'Triathlon-Hotels', 'TriScore',
        'Hotels für Triathlon-Trainingslager, bewertet nach geprüften Fakten.',
        'hotel', 'Hotel', 'Hotels', true, 'active');

INSERT INTO ranking_categories (ranking_id, code, label, sort_order)
SELECT r.id, v.code, v.label, v.sort_order
FROM rankings r,
     (VALUES ('swim','Schwimmen',1),('bike','Rad',2),('run','Laufen',3),
             ('food','Verpflegung',4),('recovery','Regeneration & Indoor',5),
             ('logistics','Logistik & Klima',6)) AS v(code, label, sort_order)
WHERE r.code = 'triathlon-hotel';

INSERT INTO criteria (ranking_id, category_id, code, label, value_type, scoring, max_points, is_ko, sort_order)
SELECT r.id, c.id, v.code, v.label, v.value_type::criterion_value_type, v.scoring::jsonb, v.max_points, v.is_ko, v.sort_order
FROM rankings r
JOIN (VALUES
('swim_pool', 'swim', 'Becken', 'option',
 '{"type":"option","points":{"pool_50_hotel":15,"pool_25_hotel":10,"pool_50_within_5km":8,"pool_25_within_5km":5,"none":0},"ko":["none"]}',
 15, true, 10),
('swim_lanes', 'swim', 'Reservierte Sportler-Bahnen / Leinen zu Randzeiten', 'option',
 '{"type":"option","points":{"reserved_guaranteed":6,"on_request":3,"none":0}}',
 6, false, 20),
('swim_heated', 'swim', 'Beheizt, ganzjährig ≥ 25 °C', 'bool',
 '{"type":"bool","points_true":3}', 3, false, 30),
('swim_open_water', 'swim', 'Freiwasser', 'option',
 '{"type":"option","points":{"within_1km":4,"within_5km":2,"none":0}}', 4, false, 40),
('swim_equipment', 'swim', 'Trainingsmaterial (Bretter, Pullbuoys, Pace-Uhr)', 'bool',
 '{"type":"bool","points_true":2}', 2, false, 50),

-- Rad (25)
('bike_storage', 'bike', 'Radgarage', 'option',
 '{"type":"option","points":{"lockable_cctv":6,"lockable":4,"room_only":4,"none":0}}', 6, false, 110),
('bike_workshop', 'bike', 'Werkstatt / Werkzeug', 'bool',
 '{"type":"bool","points_true":3}', 3, false, 120),
('bike_wash', 'bike', 'Waschplatz', 'bool',
 '{"type":"bool","points_true":2}', 2, false, 130),
('bike_rental', 'bike', 'Radverleih', 'option',
 '{"type":"option","points":{"premium_in_hotel":5,"within_2km":3,"none":0}}', 5, false, 140),
('bike_guided', 'bike', 'Geführte Touren nach Leistungsgruppen', 'bool',
 '{"type":"bool","points_true":4}', 4, false, 150),
('bike_gpx', 'bike', 'GPX-Routen bereitgestellt', 'bool',
 '{"type":"bool","points_true":2}', 2, false, 160),
('bike_terrain', 'bike', 'Radrevier (Verkehr, Asphalt, Höhenmeter-Mix) – Admin-Einstufung 0–6', 'rating',
 '{"type":"rating","min":0,"max":6}', 6, false, 170),

-- Laufen (12)
('run_track', 'run', '400-m-Bahn ≤ 5 km', 'bool',
 '{"type":"bool","points_true":3}', 3, false, 210),
('run_flat_loop', 'run', 'Flache Runde ab Hotel, ≥ 5 km, verkehrsarm', 'bool',
 '{"type":"bool","points_true":3}', 3, false, 220),
('run_trails', 'run', 'Trails / Höhenmeter ≤ 2 km', 'bool',
 '{"type":"bool","points_true":3}', 3, false, 230),
('run_treadmill', 'run', 'Laufband im Gym', 'option',
 '{"type":"option","points":{"incline":3,"basic":2,"none":0}}', 3, false, 240),

-- Verpflegung (12)
('food_post_training', 'food', 'Snack nach dem Training / Lunchpaket', 'bool',
 '{"type":"bool","points_true":3}', 3, false, 320),
('food_athlete_buffet', 'food', 'Sportlerbuffet (Kohlenhydrate, Proteine)', 'bool',
 '{"type":"bool","points_true":3}', 3, false, 330),
('food_flexible', 'food', 'Flexible oder späte Essenszeiten', 'bool',
 '{"type":"bool","points_true":2}', 2, false, 340),
('food_healthy', 'food', 'Healthy-Food-Angebot', 'bool',
 '{"type":"bool","points_true":3}', 3, false, 350),

-- Regeneration & Indoor (10)
('rec_physio', 'recovery', 'Physio / Sportmassage im Haus', 'bool',
 '{"type":"bool","points_true":3}', 3, false, 410),
('rec_sauna', 'recovery', 'Sauna / Spa', 'bool',
 '{"type":"bool","points_true":2}', 2, false, 420),
('rec_gym', 'recovery', 'Kraftraum', 'bool',
 '{"type":"bool","points_true":3}', 3, false, 430),
('rec_indoor_bike', 'recovery', 'Indoor-Bike- oder Rollenraum', 'bool',
 '{"type":"bool","points_true":2}', 2, false, 440),
('rec_ice_bath', 'recovery', 'Eisbad', 'bool',
 '{"type":"bool","points_true":2}', 2, false, 450),

-- Logistik & Klima (11)
('log_airport', 'logistics', 'Flughafen mit Radkoffer-Transfer', 'option',
 '{"type":"option","points":{"within_60min":3,"within_90min":1,"longer":0}}', 3, false, 510),
('log_laundry', 'logistics', 'Wäscheservice Sportkleidung', 'option',
 '{"type":"option","points":{"same_day":3,"next_day":2,"drying_room_only":1,"none":0}}', 3, false, 520),
('log_climate', 'logistics', 'Klima im Reisemonat (Ø Tageshöchstwert)', 'number',
 '{"type":"climate","metric":"avg_high_c","bands":[{"min":15,"max":30,"points":4},{"min":12,"max":14.9,"points":2},{"min":30.1,"max":34,"points":2}]}',
 4, false, 530),
('log_rain', 'logistics', 'Regentage im Reisemonat < 5', 'number',
 '{"type":"climate","metric":"rain_days","bands":[{"min":0,"max":4.9,"points":1}]}', 1, false, 535),
('log_camps', 'logistics', 'Camps / Coaching buchbar', 'bool',
 '{"type":"bool","points_true":2}', 2, false, 540)
) AS v(code, category, label, value_type, scoring, max_points, is_ko, sort_order) ON true
JOIN ranking_categories c ON c.ranking_id = r.id AND c.code = v.category
WHERE r.code = 'triathlon-hotel';

-- Kontrolle: Summe je Ranking (aktuell 106)
-- SELECT r.code, sum(c.max_points) FROM criteria c JOIN rankings r ON r.id=c.ranking_id WHERE c.active GROUP BY r.code;
