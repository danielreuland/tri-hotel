-- Teneriffa: Klimapunkt Costa Adeje (Südwesten, 83 m) statt automatisch Nordseite bei La Orotava – im Süden liegen die
-- Trainingshotels, sonniger und trockener (Entscheidung Daniel, 27.10.2026).
UPDATE regions SET climate_lat = 28.099000, climate_lng = -16.740000 WHERE slug = 'teneriffa' AND climate_lat IS NULL;
