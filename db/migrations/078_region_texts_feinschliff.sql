-- Regionsseiten, Feinschliff nach SEO-Feedback (27.10.2026):
-- 1. Redaktioneller Abschnitt „Klima und beste Reisezeit“ heißt „Wetter fürs Training“ (sonst doppelt mit dem Datenabschnitt).
-- 2. Text und Datenbox („beste Reisezeit laut Klimadaten“ = nur Temperatur) verbunden: klimatisch fast ganzjährig, ideal …
-- 3. Fragen zu Leistungen („Welches Hotel hat ein 50-m-Becken?“) und zum Vergleich mit der Nachbarregion als Vorlagen.
-- 4. Fuerteventura: Meta-Beschreibung mit Suchbegriffen.
UPDATE region_texts SET body = replace(body, '## Klima und beste Reisezeit', '## Wetter fürs Training'), updated_at = now();

UPDATE region_texts t SET body = replace(t.body, v.old, v.new), updated_at = now()
  FROM regions r, (VALUES
  ('mallorca', 'Die Hauptsaison für Trainingslager sind März bis Mai und September bis November.',
               'Klimatisch kannst du außer im Hochsommer fast das ganze Jahr trainieren; die Hauptsaison für Trainingslager sind März bis Mai und September bis November.'),
  ('fuerteventura', 'Für Trainingslager sind die Monate von Oktober bis Mai am angenehmsten.',
               'Klimatisch ist Training ganzjährig möglich, für Trainingslager ideal sind Oktober bis Mai – im Sommer wird es heißer und windiger.'),
  ('gran-canaria', 'Im Juli und August wird es mit über 30 °C heiß.',
               'Im Juli und August wird es mit über 30 °C heiß – klimatisch ist Training also fast ganzjährig möglich, ideal sind Oktober bis Mai.'),
  ('teneriffa', 'Für Trainingslager sind die Monate von Oktober bis Mai am beliebtesten.',
               'Klimatisch ist Training an der Küste fast ganzjährig möglich, für Trainingslager ideal sind Oktober bis Mai.'),
  ('costa-blanca', 'Die besten Monate fürs Training sind Februar bis Mai und Oktober bis November.',
               'Klimatisch geht Training außer im Hochsommer fast das ganze Jahr; ideal sind Februar bis Mai und Oktober bis November.'),
  ('algarve', 'Von Oktober bis März gibt es mehr Regentage, im Sommer kaum Regen. Für Trainingslager sind Februar bis Mai und Oktober bis November am angenehmsten.',
               'Von Oktober bis März gibt es mehr Regentage, im Sommer kaum Regen. Klimatisch geht Training außer im Hochsommer fast das ganze Jahr, am angenehmsten sind Februar bis Mai und Oktober bis November.')
  ) AS v(slug, old, new)
 WHERE r.id = t.region_id AND r.slug = v.slug;

UPDATE region_texts t SET summary = 'Trainingslager auf Fuerteventura: Sportresort mit 50-m-Becken, Wind & Radrevier, Wassertemperatur 19–23 °C. Hotels geprüft und nach TriScore sortiert.'
  FROM regions r WHERE r.id = t.region_id AND r.slug = 'fuerteventura';

UPDATE rankings SET content = jsonb_build_object(
  'area_faq_features', jsonb_build_array(jsonb_build_object('feature', 'pool_50', 'q', 'Welches Hotel {in} hat ein 50-m-Becken?')),
  'area_faq_compare', '{name} oder {andere} fürs Trainingslager?'
) || COALESCE(content, '{}'::jsonb)
WHERE code = 'triathlon-hotel';
