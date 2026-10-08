-- 1) Kategorie „Regeneration & Indoor“ aufteilen in „Regeneration“ und „Indoor-Training“.
--    Punkte bleiben gleich (Summe 106): Regeneration 7 (Physio, Sauna, Eisbad), Indoor-Training 5 (Kraftraum, Rollenraum).
-- 2) Leistungskatalog mit einheitlichen Namen je Objekttyp + Leistungen je Objekt.

-- ---------- 1) Kategorien ----------
UPDATE ranking_categories rc SET sort_order = 7
  FROM rankings r WHERE rc.ranking_id = r.id AND r.code = 'triathlon-hotel' AND rc.code = 'logistics';

UPDATE ranking_categories rc SET label = 'Regeneration'
  FROM rankings r WHERE rc.ranking_id = r.id AND r.code = 'triathlon-hotel' AND rc.code = 'recovery';

INSERT INTO ranking_categories (ranking_id, code, label, sort_order)
SELECT id, 'indoor', 'Indoor-Training', 6 FROM rankings WHERE code = 'triathlon-hotel';

UPDATE criteria c
   SET category_id = (SELECT rc.id FROM ranking_categories rc WHERE rc.ranking_id = c.ranking_id AND rc.code = 'indoor'),
       version = c.version + 1
  FROM rankings r
 WHERE c.ranking_id = r.id AND r.code = 'triathlon-hotel' AND c.code IN ('rec_gym', 'rec_indoor_bike');

-- ---------- 2) Leistungskatalog ----------
-- Gleiche Leistung = gleicher Name bei allen Objekten eines Typs. Nur der Admin legt neue Leistungen an.
-- "derive": Leistung ergibt sich aus einem Fakt im Ranking (keine doppelte Pflege), z. B.
--   {"ranking":"triathlon-hotel","criterion":"rec_sauna","values":[true]}
--   {"ranking":"triathlon-hotel","criterion":"swim_pool","values":["pool_50_hotel"]}
-- Ohne "derive" wird die Leistung je Objekt gepflegt (entity_features: Admin, Betreiber oder Auto-Prüfung).
CREATE TABLE features (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,                 -- 'hotel'
  code        text NOT NULL,
  label       text NOT NULL,                 -- einheitlicher Name, z. B. „Sauna“
  group_label text NOT NULL,                 -- Gruppe in der Liste, z. B. „Training“
  sort_order  smallint NOT NULL DEFAULT 100,
  filterable  boolean NOT NULL DEFAULT false, -- in der Suchmaske als Filter anbieten
  derive      jsonb,
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entity_type, code),
  UNIQUE (entity_type, label)
);

CREATE TABLE entity_features (
  entity_id     uuid NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  feature_id    uuid NOT NULL REFERENCES features(id) ON DELETE CASCADE,
  source        fact_source NOT NULL,
  trust_level   smallint NOT NULL CHECK (trust_level BETWEEN 1 AND 4),
  evidence_url  text,
  evidence_text text,
  checked_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (entity_id, feature_id)
);

INSERT INTO features (entity_type, code, label, group_label, sort_order, filterable, derive) VALUES
-- Schwimmen
('hotel', 'pool_50',          '50-m-Becken im Hotel',            'Schwimmen', 10, true,  '{"ranking":"triathlon-hotel","criterion":"swim_pool","values":["pool_50_hotel"]}'),
('hotel', 'pool_25',          '25-m-Becken im Hotel',            'Schwimmen', 11, true,  '{"ranking":"triathlon-hotel","criterion":"swim_pool","values":["pool_25_hotel"]}'),
('hotel', 'lanes_reserved',   'Reservierte Sportlerbahnen',      'Schwimmen', 12, true,  '{"ranking":"triathlon-hotel","criterion":"swim_lanes","values":["reserved_guaranteed"]}'),
('hotel', 'pool_heated',      'Beheizter Pool',                  'Schwimmen', 13, false, '{"ranking":"triathlon-hotel","criterion":"swim_heated","values":[true]}'),
('hotel', 'open_water',       'Freiwasser in der Nähe',          'Schwimmen', 14, true,  '{"ranking":"triathlon-hotel","criterion":"swim_open_water","values":["within_1km","within_5km"]}'),
('hotel', 'swim_equipment',   'Schwimm-Trainingsmaterial',       'Schwimmen', 15, false, '{"ranking":"triathlon-hotel","criterion":"swim_equipment","values":[true]}'),
-- Rad
('hotel', 'bike_storage',     'Abschließbare Radgarage',         'Rad', 20, true,  '{"ranking":"triathlon-hotel","criterion":"bike_storage","values":["lockable_cctv","lockable"]}'),
('hotel', 'bike_workshop',    'Radwerkstatt',                    'Rad', 21, false, '{"ranking":"triathlon-hotel","criterion":"bike_workshop","values":[true]}'),
('hotel', 'bike_wash',        'Rad-Waschplatz',                  'Rad', 22, false, '{"ranking":"triathlon-hotel","criterion":"bike_wash","values":[true]}'),
('hotel', 'bike_rental',      'Rennradverleih',                  'Rad', 23, true,  '{"ranking":"triathlon-hotel","criterion":"bike_rental","values":["premium_in_hotel","within_2km"]}'),
('hotel', 'bike_guided',      'Geführte Radtouren',              'Rad', 24, true,  '{"ranking":"triathlon-hotel","criterion":"bike_guided","values":[true]}'),
('hotel', 'bike_gpx',         'GPX-Routen',                      'Rad', 25, false, '{"ranking":"triathlon-hotel","criterion":"bike_gpx","values":[true]}'),
('hotel', 'ebike_charging',   'E-Bike-Ladestation',              'Rad', 26, false, NULL),
-- Laufen
('hotel', 'track',            '400-m-Bahn in der Nähe',          'Laufen', 30, true,  '{"ranking":"triathlon-hotel","criterion":"run_track","values":[true]}'),
('hotel', 'flat_loop',        'Flache Laufrunde ab Hotel',       'Laufen', 31, false, '{"ranking":"triathlon-hotel","criterion":"run_flat_loop","values":[true]}'),
('hotel', 'trails',           'Trails in der Nähe',              'Laufen', 32, false, '{"ranking":"triathlon-hotel","criterion":"run_trails","values":[true]}'),
('hotel', 'treadmill',        'Laufband',                        'Laufen', 33, false, '{"ranking":"triathlon-hotel","criterion":"run_treadmill","values":["incline","basic"]}'),
-- Indoor-Training
('hotel', 'gym_athletic',     'Kraftraum mit Freihantelbereich', 'Indoor-Training', 40, true,  '{"ranking":"triathlon-hotel","criterion":"rec_gym","values":["athletic"]}'),
('hotel', 'gym',              'Fitnessraum',                     'Indoor-Training', 41, false, '{"ranking":"triathlon-hotel","criterion":"rec_gym","values":["standard","basic"]}'),
('hotel', 'indoor_bike',      'Indoor-Bike- oder Rollenraum',    'Indoor-Training', 42, false, '{"ranking":"triathlon-hotel","criterion":"rec_indoor_bike","values":[true]}'),
-- Regeneration
('hotel', 'physio',           'Physiotherapie / Sportmassage',   'Regeneration', 50, true,  '{"ranking":"triathlon-hotel","criterion":"rec_physio","values":[true]}'),
('hotel', 'sauna',            'Sauna',                           'Regeneration', 51, true,  '{"ranking":"triathlon-hotel","criterion":"rec_sauna","values":[true]}'),
('hotel', 'ice_bath',         'Eisbad',                          'Regeneration', 52, false, '{"ranking":"triathlon-hotel","criterion":"rec_ice_bath","values":[true]}'),
-- Verpflegung
('hotel', 'athlete_buffet',   'Sportlerbuffet',                  'Verpflegung', 60, true,  '{"ranking":"triathlon-hotel","criterion":"food_athlete_buffet","values":[true]}'),
('hotel', 'lunch_pack',       'Snack / Lunchpaket nach dem Training', 'Verpflegung', 61, false, '{"ranking":"triathlon-hotel","criterion":"food_post_training","values":[true]}'),
('hotel', 'flexible_meals',   'Flexible Essenszeiten',           'Verpflegung', 62, false, '{"ranking":"triathlon-hotel","criterion":"food_flexible","values":[true]}'),
('hotel', 'healthy_food',     'Healthy Food',                    'Verpflegung', 63, false, '{"ranking":"triathlon-hotel","criterion":"food_healthy","values":[true]}'),
('hotel', 'vegan',            'Vegane Gerichte',                 'Verpflegung', 64, true,  NULL),
('hotel', 'gluten_free',      'Glutenfreie Gerichte',            'Verpflegung', 65, false, NULL),
-- Service
('hotel', 'laundry',          'Wäscheservice für Sportkleidung', 'Service', 70, false, '{"ranking":"triathlon-hotel","criterion":"log_laundry","values":["same_day","next_day"]}'),
('hotel', 'camps',            'Trainingscamps buchbar',          'Service', 71, true,  '{"ranking":"triathlon-hotel","criterion":"log_camps","values":[true]}'),
('hotel', 'airport_transfer', 'Flughafentransfer',               'Service', 72, false, NULL),
('hotel', 'parking',          'Parkplatz',                       'Service', 73, false, NULL),
('hotel', 'family',           'Kinderbetreuung',                 'Service', 74, false, NULL),
('hotel', 'dogs',             'Hunde erlaubt',                   'Service', 75, false, NULL),
('hotel', 'accessible',       'Barrierefrei',                    'Service', 76, false, NULL);
