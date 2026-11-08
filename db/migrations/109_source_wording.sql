-- Ehrliche Formulierung des Quellen-Versprechens (08.11.2026): Nicht jeder Wert hat eine Fundstelle, manche sind
-- ausdrücklich Einschätzung der Redaktion (Migration 108). Statt „mit Quelle“ heißt es jetzt „Herkunft“ bzw. „woher sie stammt“.
-- replace() lässt im Admin geänderte Texte unberührt, wenn die alte Formulierung nicht mehr vorkommt.

UPDATE rankings SET content = jsonb_set(content, '{hero_text}',
  to_jsonb(replace(content->>'hero_text', 'Jeder Wert mit Quelle und Prüfdatum.', 'Jeder Wert mit Herkunft und Prüfdatum.')))
WHERE content ? 'hero_text';

UPDATE rankings SET content = jsonb_set(content, '{meta_description}',
  to_jsonb(replace(content->>'meta_description', 'Jeder Wert mit Quelle.', 'Herkunft jedes Werts öffentlich.')))
WHERE content ? 'meta_description';

-- method_faq ist eine Liste aus {q, a}
UPDATE rankings SET content = jsonb_set(content, '{method_faq}', (
  SELECT jsonb_agg(CASE WHEN item ? 'a'
    THEN jsonb_set(item, '{a}', to_jsonb(replace(item->>'a',
      'Bei jedem Wert stehen Quelle und Prüfdatum auf der Hotelseite.',
      'Auf der Hotelseite steht bei jedem Wert, woher er stammt und wann wir ihn geprüft haben.')))
    ELSE item END ORDER BY ord)
  FROM jsonb_array_elements(content->'method_faq') WITH ORDINALITY AS t(item, ord)))
WHERE jsonb_typeof(content->'method_faq') = 'array';

UPDATE ai_mail_templates SET body = replace(body,
  'Jedes Hotel erhält bei uns einen TriScore aus geprüften Fakten, jede Angabe ist mit Quelle belegt.',
  'Jedes Hotel erhält bei uns einen TriScore aus geprüften Fakten, bei jeder Angabe steht, woher sie stammt.')
WHERE key = 'inquiry' AND language = 'de';

UPDATE ai_mail_templates SET body = replace(body,
  'Every hotel receives a TriScore based on verified facts, and every detail is backed by a source.',
  'Every hotel receives a TriScore based on verified facts, and every detail shows where it comes from.')
WHERE key = 'inquiry' AND language = 'en';

UPDATE rankings SET content = jsonb_set(content, '{method_intro}',
  to_jsonb(replace(content->>'method_intro', 'Formel, Gewichte und Quellen sind vollständig offen.', 'Formel, Gewichte und die Herkunft jedes Werts sind vollständig offen.')))
WHERE content ? 'method_intro';
