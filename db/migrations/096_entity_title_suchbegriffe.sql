-- Titel der Hotelseiten nach echten Suchbegriffen statt „Name (Ort) – TriScore 90“ (Suchanfragen wie
-- „[Hotel] Trainingslager“, „[Hotel] Erfahrungen Triathlon“). Ort = Trainingsregion (z. B. Lanzarote statt Tinajo).
-- Mehrere Fassungen: die erste, die in 60 Zeichen passt, gewinnt (lange Hotelnamen bekommen eine kürzere, statt abgeschnitten zu werden).
UPDATE rankings
   SET content = COALESCE(content, '{}'::jsonb) || jsonb_build_object('entity_title', jsonb_build_array(
         '{name} {ort}: Triathlon-Trainingslager im Check',
         '{name} {ort}: Triathlon-Trainingslager',
         '{name}: Triathlon-Trainingslager',
         '{name}: Triathlon-Camp')),
       updated_at = now()
 WHERE code = 'triathlon-hotel';
