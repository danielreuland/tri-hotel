-- Weitere Parameternamen, in denen die Hotel-Nummer eines Anbieters steht. CHECK24: Adressen von urlaub.check24.de
-- (Verbraucherseite) tragen die Nummer als hotelId – dieselbe wie c24pp_hotel_id auf check24.net (Playitas 18002 in beiden).
-- Provision gibt es nur für Buchungen über check24.net (Bedingungen § 7.8.1); deshalb Ziel nur noch check24.net,
-- Adressen von check24.de werden über die Nummer umgeschrieben.
ALTER TABLE partner_programs ADD COLUMN IF NOT EXISTS id_params text[] NOT NULL DEFAULT '{}';

UPDATE partner_programs SET id_params = '{hotelId}', domains = '{check24.net}',
       search_url = COALESCE(search_url, 'https://www.google.com/search?q=site%3Aurlaub.check24.de+{q}')
 WHERE code = 'check24';

-- Bereits eingetragene Links von check24.de mit Nummer auf die kurze check24.net-Form bringen (Reisedaten entfallen)
UPDATE entity_links l
   SET url = replace(p.id_url, '{id}', substring(l.url from '[?&#]hotelId=(\d{3,12})')), updated_at = now()
  FROM partner_programs p
 WHERE p.id = l.program_id AND p.code = 'check24' AND l.url !~ 'c24pp_hotel_id=' AND l.url ~ '[?&#]hotelId=\d{3,12}';
