-- Anbieterlogos im Kasten „Buchen & Anfragen“ (Anbieter untereinander) und Vorbereitung trivago / hotel.de (beide über Awin).
-- Logos nur aus den Werbemitteln des jeweiligen Programms; Herkunft wird beim Upload festgehalten (logo_source).

ALTER TABLE partner_programs
  ADD COLUMN IF NOT EXISTS logo_file text,          -- Dateiname unter UPLOAD_DIR/partner-logos, öffentlich unter /partner-logo/<datei>
  ADD COLUMN IF NOT EXISTS logo_source text,        -- z. B. „Awin-Werbemittel trivago, 28.10.2026“
  ADD COLUMN IF NOT EXISTS logo_updated_at timestamptz;

-- Beschriftungen so, dass neben dem Logo ein klarer Handlungstext bleibt („Preise prüfen“, „Pauschalreise mit Flug“)
UPDATE partner_programs SET label_booking = 'Preise prüfen bei Expedia' WHERE code = 'expedia' AND label_booking = 'Preise bei Expedia';
UPDATE partner_programs SET label_booking = 'Preise prüfen bei Hotels.com' WHERE code = 'hotelscom' AND label_booking = 'Preise bei Hotels.com';
UPDATE partner_programs SET label_booking = 'Pauschalreise mit Flug bei CHECK24' WHERE code = 'check24' AND label_booking = 'Pauschalreise bei CHECK24';
UPDATE partner_programs SET label_booking = 'Preise prüfen bei Booking.com' WHERE code = 'booking' AND label_booking = 'Preise bei Booking.com';

-- hotel.de: Bedingungen geprüft (Awin, Programm-AGB Stand 11.09.2024); bleibt inaktiv bis Deeplink-Vorlage und Hotel-Adressen stehen
UPDATE partner_programs SET
  label_booking = 'Preise prüfen bei hotel.de',
  direct_link = true,
  notes = 'hotel.de DE/AT über Awin (Programm-AGB 11.09.2024). Provision auf den realisierten Hotelumsatz inkl. MwSt., nur für '
       || 'abgereiste Buchungen; Auszahlung nach monatlichem Sales-Abgleich (Abreisen aus dem Vorvormonat), nur wenn das Hotel seine '
       || 'Kommission an hotel.de bezahlt hat, nicht über myHOTEL DE, keine HRS-/hotel.de-Gutscheine. Deduplizierung u. a. gegen '
       || 'Preisvergleiche und andere Netzwerke. Keine Markenbegriffe in bezahlter Suche. Vorlage: '
       || 'https://www.awin1.com/cread.php?awinmid=<Programm-ID>&awinaffid=<Publisher-ID>&clickref={slug}&ued={url_enc} – '
       || 'Deeplinks im Awin-Linkgenerator prüfen; je Hotel die Adresse der hotel.de-Hotelseite eintragen.'
WHERE code = 'hotelde';

-- trivago: neues Programm über Awin (Programm-AGB 17.10.2024), inaktiv bis Programm- und Publisher-ID eingetragen sind
INSERT INTO partner_programs (code, name, domains, label_booking, label_reviews, search_url, status, sort_order, direct_link, notes)
VALUES ('trivago', 'trivago', '{trivago.de}', 'Preise vergleichen bei trivago', 'Bewertungen bei trivago',
  'https://www.google.com/search?q=site%3Atrivago.de+{q}', 'inactive', 7, true,
  'trivago DE über Awin (Programm-AGB 17.10.2024). Pflicht: trivago-Tracking-ID in jedem Link (sonst keine Vergütung) – '
  || 'prüfen, ob der Awin-Link sie enthält oder ein eigener Parameter nötig ist. Verboten: Markenbegriffe in bezahlter Suche, '
  || 'Anzeigen/Leads im Namen von trivago, Incentive-Traffic, versteckte Frames, irreführende Links oder Weiterleitungen, '
  || 'Sub-Netzwerke. Werbemittel (auch Logo) nur zur Bewerbung von trivago-Links, nicht für eigene Werbung ohne Zustimmung; '
  || 'Markenrichtlinien in der trivago brand toolbox. Provision ohne MwSt. Vorlage: '
  || 'https://www.awin1.com/cread.php?awinmid=<Programm-ID>&awinaffid=<Publisher-ID>&clickref={slug}&ued={url_enc}')
ON CONFLICT (code) DO NOTHING;
