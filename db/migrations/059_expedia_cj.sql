-- Expedia DACH läuft über CJ (nicht Awin): CJ-Deeplink mit Zieladresse und sid = Objekt-Slug.
-- PID 101907930 (Website tri-hotel), AID 13904715 (Deeplink-fähiger Link aus Expedias Linkbauer; der Textlink „DE_Hotel“
-- 13852993 ignoriert die Zieladresse), Advertiser 5289015. Getestet am 26.10.2026: Zuordnung über affcid/cjevent klappt.
-- Keine automatischen Suchlinks: Expedias Textsuche löst Hotelnamen falsch auf („Playitas Hotel Las Playitas“ → Acapulco).
-- Stattdessen genauer Link der Expedia-Hotelseite je Objekt (Partnerlinks); Hilfe im Admin: Google-Suche auf expedia.de.
-- Bleibt inaktiv, bis Daniel aktiviert.
UPDATE partner_programs SET
  link_template = 'https://www.tkqlhce.com/click-101907930-13904715?url={url_enc}&sid={slug}',
  link_params = '{}',
  auto_search = NULL,
  search_url = 'https://www.google.com/search?q=site%3Aexpedia.de+{q}',
  notes = 'Expedia DACH über CJ (Advertiser 5289015, Website 101907930, Deeplink-Link 13904715). Je Hotel die Adresse der Expedia-Hotelseite (…h123456.Hotel-Information) als Preis-Link eintragen – keine Suchlinks (Expedia löst Hotelnamen falsch auf): 4 % Unterkunft, 2 % Pakete/Ferienwohnungen, 7 Tage Cookie. Kein CJ-Zählpixel (würde Besucher ohne Einwilligung melden). Keine Gutscheine, keine Expedia-Links in E-Mails/Offline, „Expedia“ nicht in Seitentiteln/Meta-Tags. Hotels.com ist ein eigenes Programm.'
 WHERE code = 'expedia';
