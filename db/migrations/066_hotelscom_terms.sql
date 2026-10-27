-- Hotels.com-Bedingungen (CJ, Hotels.com DE AU CH): Markenhinweis laut Trademark Usage Guidelines (Appendix 2)
-- nennt Expedia, Inc. als Inhaber. Nur ändern, wenn der Text noch der Startwert aus 065 ist.
UPDATE partner_programs SET
  trademark_notice = 'HOTELS.COM ist eine Marke oder eingetragene Marke von Expedia, Inc.'
 WHERE code = 'hotelscom' AND trademark_notice = 'Hotels.com ist eine Marke oder eingetragene Marke von Hotels.com, L.P.';

UPDATE partner_programs SET
  notes = 'CJ, Hotels.com DE AU CH: 4 % Hotels, 2 % Ferienwohnungen, 1,5 % Mietwagen (ohne Gutschein), 7 Tage Referral-Zeitraum. '
       || 'Gleiche Bedingungen wie Expedia: Programmlinks nicht verändern/verkürzen, keine Gutscheine außer aus dem Programm, '
       || 'keine Marken in Meta-Tags, kein Bieten auf Marken, keine automatisierten Klicks/Scraping, Social Media mit Werbekennzeichnung.'
 WHERE code = 'hotelscom';
