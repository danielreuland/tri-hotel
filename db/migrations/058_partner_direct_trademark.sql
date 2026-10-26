-- Expedia-Bedingungen (BEX DACH über Awin, Juni 2022):
-- direct_link: Link auf der Seite zeigt direkt auf die Partner-Adresse (keine eigene Weiterleitung, die das Ziel verschleiert –
--   Expedia 8.1: Programmlinks nicht verändern/verkürzen); gezählt wird per Beacon beim Klick.
-- trademark_notice: Markenhinweis, der unter dem Kasten erscheint, wenn der Anbieter verlinkt ist (Expedia Trademark Usage Guidelines).
ALTER TABLE partner_programs ADD COLUMN IF NOT EXISTS direct_link boolean NOT NULL DEFAULT false;
ALTER TABLE partner_programs ADD COLUMN IF NOT EXISTS trademark_notice text;

UPDATE partner_programs SET
  domains = '{expedia.de,expedia.at,expedia.ch}',
  direct_link = true,
  trademark_notice = 'EXPEDIA ist eine Marke oder eingetragene Marke von Expedia, Inc.',
  notes = 'BEX DACH über Awin: 4 % Unterkunft, 2 % Pakete/Ferienwohnungen, 7 Tage Cookie. Deeplink-Vorlage: https://www.awin1.com/cread.php?awinmid=<Programm-ID>&awinaffid=<Publisher-ID>&ued={url_enc}. Hotels.com ist ein eigenes Programm. Keine Gutscheine, keine Expedia-Links in E-Mails/Offline, Expedia nicht in Meta-Tags.'
 WHERE code = 'expedia';
