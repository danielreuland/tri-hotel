-- Kraftraum: statt Ja/Nein vier Ausstattungsstufen. Höchstwert bleibt 3 Punkte (Kategoriegewicht unverändert).
-- Die Beschreibungen in "labels" nutzt auch die Website-Extraktion als Entscheidungshilfe.
UPDATE criteria c
   SET label = 'Kraftraum (Ausstattung)',
       value_type = 'option',
       scoring = '{
         "type": "option",
         "points": {"athletic": 3, "standard": 2, "basic": 1, "none": 0},
         "labels": {
           "athletic": "Athletik-Ausstattung: Rack/Langhantel, Kurzhanteln bis mind. 30 kg, Kettlebells, freie Fläche",
           "standard": "Fitnessraum mit Geräten und Kurzhanteln, ohne Freihantelstation",
           "basic": "kleiner Fitnessraum, nur einzelne Geräte oder leichte Gewichte",
           "none": "kein Kraftraum"
         }
       }'::jsonb,
       max_points = 3,
       version = c.version + 1
  FROM rankings r
 WHERE r.code = 'triathlon-hotel' AND c.ranking_id = r.id AND c.code = 'rec_gym';

-- Vorhandene Ja/Nein-Werte übernehmen: "nein" -> kein Kraftraum.
-- "ja" lässt keine Stufe erkennen -> vorerst "Standard", als strittig markiert, damit der Admin nachprüft.
UPDATE entity_facts f
   SET value = CASE WHEN (f.value->>'bool')::boolean THEN '{"option":"standard"}'::jsonb ELSE '{"option":"none"}'::jsonb END,
       disputed = (f.value->>'bool')::boolean
  FROM criteria c JOIN rankings r ON r.id = c.ranking_id
 WHERE f.criterion_id = c.id AND r.code = 'triathlon-hotel' AND c.code = 'rec_gym' AND f.value ? 'bool';
