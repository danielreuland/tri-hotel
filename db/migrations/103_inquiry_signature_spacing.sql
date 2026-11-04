-- Anfrage-Mail (Daniel, 04.11.2026): Leerzeile vor dem Hinweis auf Mia.
-- Ersetzt nur den genauen Wortlaut; eine im Admin geänderte Vorlage bleibt unberührt.
UPDATE ai_mail_templates t
SET body = replace(t.body, E'Gründer tri-hotel.de\nBei Rückfragen hilft', E'Gründer tri-hotel.de\n\nBei Rückfragen hilft'),
    version = t.version + 1, updated_at = now()
FROM sites s
WHERE s.id = t.site_id AND s.code = 'tri-hotel' AND t.key = 'inquiry' AND t.language = 'de'
  AND position(E'Gründer tri-hotel.de\nBei Rückfragen hilft' IN t.body) > 0;

UPDATE ai_mail_templates t
SET body = replace(t.body, E'Founder of tri-hotel.de\nIf you have questions', E'Founder of tri-hotel.de\n\nIf you have questions'),
    version = t.version + 1, updated_at = now()
FROM sites s
WHERE s.id = t.site_id AND s.code = 'tri-hotel' AND t.key = 'inquiry' AND t.language = 'en'
  AND position(E'Founder of tri-hotel.de\nIf you have questions' IN t.body) > 0;
