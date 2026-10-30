-- Kandidaten je Ranking: Werte aus anderen Rankings, die auf Eignung hindeuten. Der Admin sieht unter
-- „Rankings → Kandidaten“ passende Objekte und lässt sie gesammelt für das Ranking prüfen (eigene Meldung je Ranking).
-- Regel: {"min":n,"any":[{"ranking":"code","criterion":"code","values":[…],"label":"Text"}]} – mindestens n Treffer.
ALTER TABLE rankings ADD COLUMN IF NOT EXISTS candidate_rule jsonb;

-- Fitness Racing: Hotels aus dem Triathlon-Ranking mit Kraftraum, Laufband mit Steigung und Erholung
UPDATE rankings SET candidate_rule = '{"min":2,"any":[
  {"ranking":"triathlon-hotel","criterion":"rec_gym","values":["athletic"],"label":"Kraftraum mit Athletik-Ausstattung"},
  {"ranking":"triathlon-hotel","criterion":"rec_gym","values":["standard"],"label":"Fitnessraum mit Geräten"},
  {"ranking":"triathlon-hotel","criterion":"run_treadmill","values":["incline"],"label":"Laufband mit Steigung"},
  {"ranking":"triathlon-hotel","criterion":"rec_physio","values":[true],"label":"Physio / Massage"},
  {"ranking":"triathlon-hotel","criterion":"rec_ice_bath","values":[true],"label":"Eisbad"},
  {"ranking":"triathlon-hotel","criterion":"rec_sauna","values":[true],"label":"Sauna"}
]}'::jsonb
WHERE code = 'fitness-racing-hotel';
