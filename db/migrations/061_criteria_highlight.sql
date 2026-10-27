-- Hotelseite Variante A (Steckbrief): Kriterien, deren Wert oben als Kernfakt erscheint – je Ranking im Admin einstellbar.
-- highlight_order: Reihenfolge im Steckbrief (NULL = nicht zeigen); highlight_label: Kurzname vor dem Wert (optional).
ALTER TABLE criteria ADD COLUMN IF NOT EXISTS highlight_order smallint;
ALTER TABLE criteria ADD COLUMN IF NOT EXISTS highlight_label text;

-- Startwerte für das Triathlon-Ranking (im Admin unter Rankings → Kriterium änderbar)
UPDATE criteria c SET highlight_order = v.o, highlight_label = v.l
  FROM (VALUES ('swim_pool', 1, NULL), ('bike_terrain', 2, 'Radrevier'), ('bike_storage', 3, 'Radgarage'), ('log_airport', 4, 'Flughafen')) AS v(code, o, l),
       rankings r
 WHERE c.ranking_id = r.id AND r.code = 'triathlon-hotel' AND c.code = v.code AND c.highlight_order IS NULL;
