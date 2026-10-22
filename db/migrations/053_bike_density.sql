-- Radrevier: Verkehr über die Bevölkerungsdichte (Einwohner je km² Landfläche, OSM-Orte) statt nur über den Anteil ruhiger Straßen.
-- Kalibriert am 22.10.2026 an 32 vom Admin bestätigten Hotels (20 Gebiete): mittlere Abweichung 1,7 → 1,3 Punkte (Skala 0–10).
-- Dicht besiedelte Gebiete (Gardasee 246, Costa Blanca 250 E/km²) hatten viele ruhige Straßen, aber viel Verkehr;
-- Inseln (Fuerteventura 27, Lanzarote 56) wenige Straßen, aber kaum Verkehr. Gewichte: Netz 1, Verkehr 2, Gelände 2, Routen 1.
UPDATE criteria c SET scoring = jsonb_set(c.scoring, '{auto}', (c.scoring->'auto') || '{
  "density":[50,300],
  "max":{"network":1,"traffic":2,"terrain":2,"routes":1}
}'::jsonb)
FROM rankings r
WHERE r.id = c.ranking_id AND r.code = 'triathlon-hotel' AND c.code = 'bike_terrain'
  AND c.scoring->'auto'->>'source' = 'bike_area';
