-- Camp-Anbieter: freie Hotel-Zeilen entfernen, die dasselbe Hotel meinen wie eine verknüpfte Zeile desselben Anbieters
-- (z. B. Jorge Sports: „Allsun Hotel Bella Paguera“ als freie Zeile und als Verknüpfung, live doppelt angezeigt).
-- Entstanden im Anbieter-Formular: Objekt in der Auswahl gewählt, freie Zeile im Textfeld stehen gelassen.
-- Gleich = gleicher Name ohne Groß-/Kleinschreibung, Leer- und Satzzeichen (Name der Zeile oder des Objekts).
-- Fundstelle und Hotel-Meldung der freien Zeile gehen auf die verknüpfte Zeile über, falls dort leer.

CREATE TEMP TABLE camp_hotel_dups ON COMMIT DROP AS
SELECT DISTINCT ON (f.id) f.id AS free_id, l.id AS linked_id, f.evidence_url, f.evidence_text, f.submission_id
  FROM camp_provider_hotels f
  JOIN camp_provider_hotels l ON l.provider_id = f.provider_id AND l.entity_id IS NOT NULL AND l.id <> f.id
  LEFT JOIN entities e ON e.id = l.entity_id
 WHERE f.entity_id IS NULL
   AND regexp_replace(lower(f.hotel_name), '[^[:alnum:]]', '', 'g') IN (
         regexp_replace(lower(l.hotel_name), '[^[:alnum:]]', '', 'g'),
         regexp_replace(lower(COALESCE(e.name, '')), '[^[:alnum:]]', '', 'g'))
 ORDER BY f.id, l.sort_order;

UPDATE camp_provider_hotels l
   SET evidence_url = COALESCE(l.evidence_url, d.evidence_url),
       evidence_text = CASE WHEN l.evidence_url IS NULL THEN COALESCE(l.evidence_text, d.evidence_text) ELSE l.evidence_text END,
       submission_id = COALESCE(l.submission_id, d.submission_id)
  FROM camp_hotel_dups d
 WHERE l.id = d.linked_id;

DELETE FROM camp_provider_hotels WHERE id IN (SELECT free_id FROM camp_hotel_dups);
