-- Algarve: nur zwei Hotels an der Atlantikseite (Sagres, Aljezur); Klimapunkt Lagos als Mitte zwischen Westen und der
-- Südküste mit den meisten Trainingsorten (Entscheidung Daniel, 27.10.2026). Juli: Sagres 24 °C, Lagos 29 °C, Albufeira 32 °C.
UPDATE regions SET climate_lat = 37.100000, climate_lng = -8.670000 WHERE slug = 'algarve' AND climate_lat IS NULL;
