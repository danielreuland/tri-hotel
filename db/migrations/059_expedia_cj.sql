-- Expedia DACH läuft über CJ (nicht Awin): unverschlüsselter CJ-Deeplink mit Zieladresse und sid = Objekt-Slug.
-- PID 101907930 (Website tri-hotel), AID 13852993 (Textlink „DE_Hotel“), Advertiser 5289015.
-- Suchseite für alle Hotels ohne eigenen Link (auto_search). Bleibt inaktiv, bis Daniel den Testlink geprüft und aktiviert hat.
UPDATE partner_programs SET
  link_template = 'https://www.tkqlhce.com/click-101907930-13852993?url={url_enc}&sid={slug}',
  link_params = '{}',
  auto_search = 'booking',
  notes = 'Expedia DACH über CJ (Advertiser 5289015, Website 101907930, Textlink DE_Hotel 13852993): 4 % Unterkunft, 2 % Pakete/Ferienwohnungen, 7 Tage Cookie. Kein CJ-Zählpixel (würde Besucher ohne Einwilligung melden). Keine Gutscheine, keine Expedia-Links in E-Mails/Offline, „Expedia“ nicht in Seitentiteln/Meta-Tags. Hotels.com ist ein eigenes Programm.'
 WHERE code = 'expedia';
