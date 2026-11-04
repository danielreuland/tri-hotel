-- Anfrage-Mail, Fußzeile (Daniel, 04.11.2026): Halbsatz zur Herkunft der Adresse entfällt, die Herkunft steht in der Datenschutzerklärung.
-- Ersetzt nur den genauen Wortlaut; eine im Admin geänderte Vorlage bleibt unberührt.
UPDATE ai_mail_templates t
SET body = replace(t.body, 'Ihr Hotel ist auf tri-hotel.de erfasst, Ihre Adresse stammt von Ihrer Website.', 'Ihr Hotel ist auf tri-hotel.de erfasst.'),
    version = t.version + 1, updated_at = now()
FROM sites s
WHERE s.id = t.site_id AND s.code = 'tri-hotel' AND t.key = 'inquiry' AND t.language = 'de'
  AND t.body LIKE '%Ihr Hotel ist auf tri-hotel.de erfasst, Ihre Adresse stammt von Ihrer Website.%';

UPDATE ai_mail_templates t
SET body = replace(t.body, 'your hotel is listed on tri-hotel.de and your address comes from your website.', 'your hotel is listed on tri-hotel.de.'),
    version = t.version + 1, updated_at = now()
FROM sites s
WHERE s.id = t.site_id AND s.code = 'tri-hotel' AND t.key = 'inquiry' AND t.language = 'en'
  AND t.body LIKE '%your hotel is listed on tri-hotel.de and your address comes from your website.%';
