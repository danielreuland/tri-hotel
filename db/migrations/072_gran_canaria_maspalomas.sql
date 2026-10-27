-- Gran Canaria: Klimapunkt Maspalomas (Süden, 23 m) statt Lage der Hotels (Villa Vista Mar im Hinterland, 376 m)
-- (Entscheidung Daniel, 27.10.2026).
UPDATE regions SET climate_lat = 27.755000, climate_lng = -15.590000 WHERE slug = 'gran-canaria' AND climate_lat IS NULL;
