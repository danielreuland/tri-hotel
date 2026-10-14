-- Unbekannte Kriterien zählen mit dem Durchschnitt aller geprüften Hotels statt gar nicht:
-- Lücken im Profil sollen den Score weder verbessern noch verschlechtern. Danach neu berechnen (npm run recompute).
UPDATE rankings SET formula = formula || '{"unknown_policy": "average", "unknown_default_share": 0.5}'::jsonb
WHERE code = 'triathlon-hotel';
