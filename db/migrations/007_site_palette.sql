-- Farbpaletten je Site (siehe src/lib/palettes.js). Bisheriges Akzent-Format wird ersetzt.
-- tri-hotel.de startet mit „Pool & Sonne“; Umstellung im Admin unter Sites › Farben.
UPDATE sites SET theme = '{"preset":"pool","light":{},"dark":{}}'::jsonb, updated_at = now() WHERE code = 'tri-hotel';
