-- Schwimm-Trainingsmaterial (Bretter, Pullbuoys, Pace-Uhr) zählt nicht mehr im Ranking (Schwimmen 27 -> 25, Summe 105 -> 103).
-- Das Kriterium wird deaktiviert (Werte bleiben gespeichert); die Leistung „Schwimm-Trainingsmaterial“ bleibt sichtbar
-- und wird künftig direkt gepflegt statt aus dem Fakt abgeleitet.

-- 1. Bisher abgeleitete Leistung als direkt gepflegte Leistung übernehmen (Quelle und Vertrauensstufe des Fakts)
INSERT INTO entity_features (entity_id, feature_id, source, trust_level, evidence_url, evidence_text, checked_at)
SELECT f.entity_id, ft.id, f.source, f.trust_level, f.evidence_url, f.evidence_text, f.checked_at
  FROM entity_facts f
  JOIN criteria c ON c.id = f.criterion_id
  JOIN rankings r ON r.id = c.ranking_id AND r.code = 'triathlon-hotel'
  JOIN features ft ON ft.code = 'swim_equipment' AND ft.entity_type = r.entity_type
 WHERE c.code = 'swim_equipment' AND f.value = '{"bool": true}'::jsonb
ON CONFLICT (entity_id, feature_id) DO NOTHING;

UPDATE features SET derive = NULL WHERE code = 'swim_equipment';

-- 2. Kriterium aus dem Score nehmen
UPDATE criteria c SET active = false, version = c.version + 1
FROM rankings r WHERE c.ranking_id = r.id AND r.code = 'triathlon-hotel' AND c.code = 'swim_equipment';
-- Scores danach neu berechnen (npm run recompute)
