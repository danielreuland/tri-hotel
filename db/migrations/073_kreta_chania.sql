-- Kreta: Klimapunkt Chania (Nordwestküste, 17 m) statt automatisch 396 m nahe der Inselmitte (noch keine Hotels)
-- (Entscheidung Daniel, 27.10.2026).
UPDATE regions SET climate_lat = 35.510000, climate_lng = 24.020000 WHERE slug = 'kreta' AND climate_lat IS NULL;
