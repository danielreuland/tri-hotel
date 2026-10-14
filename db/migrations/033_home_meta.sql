-- Suchmaschinen-Titel und -Beschreibung der Startseite (pflegbar in rankings.content)
UPDATE rankings SET content = content || jsonb_build_object(
  'meta_title', 'Triathlon-Hotels fürs Trainingslager im Vergleich',
  'meta_description', 'Triathlon-Hotels fürs Trainingslager neutral verglichen: TriScore aus geprüften Fakten zu Pool, Radrevier, Laufen und Sportlerküche. Jeder Wert mit Quelle.'
) WHERE code = 'triathlon-hotel';
