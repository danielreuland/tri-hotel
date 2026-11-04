-- Anfrage-Mail, Fußzeile (Daniel, 04.11.2026): Links hinter die Wörter statt sichtbarer Adressen. Schreibweise [Wörter](URL), siehe views/emails/inquiry.ejs.
-- Ersetzt nur den genauen Wortlaut; eine im Admin geänderte Vorlage bleibt unberührt.
UPDATE ai_mail_templates t
SET body = replace(t.body,
      E'Hinweise zum Datenschutz: {{datenschutz}}\nKeine weiteren Anfragen gewünscht? {{abmelden}}',
      E'[Hinweise zum Datenschutz]({{datenschutz}})\n[Keine weiteren Anfragen gewünscht?]({{abmelden}})'),
    version = t.version + 1, updated_at = now()
FROM sites s
WHERE s.id = t.site_id AND s.code = 'tri-hotel' AND t.key = 'inquiry' AND t.language = 'de'
  AND position(E'Hinweise zum Datenschutz: {{datenschutz}}\nKeine weiteren Anfragen gewünscht? {{abmelden}}' IN t.body) > 0;

UPDATE ai_mail_templates t
SET body = replace(t.body,
      E'Privacy information: {{datenschutz}}\nNo further requests? {{abmelden}}',
      E'[Privacy information]({{datenschutz}})\n[No further requests?]({{abmelden}})'),
    version = t.version + 1, updated_at = now()
FROM sites s
WHERE s.id = t.site_id AND s.code = 'tri-hotel' AND t.key = 'inquiry' AND t.language = 'en'
  AND position(E'Privacy information: {{datenschutz}}\nNo further requests? {{abmelden}}' IN t.body) > 0;
