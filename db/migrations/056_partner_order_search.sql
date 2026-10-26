-- „Buchen & Anfragen“ auf der Hotelseite:
-- sort_order: Reihenfolge der Anbieter (erster aktiver Buchungsanbieter = Hauptknopf „Preise prüfen“). Legt der Admin fest;
--   hat nie Einfluss auf Score oder Reihenfolge der Hotels.
-- auto_search: Objekte ohne eigenen Link bekommen die Suchseite des Anbieters (search_url mit {q} = Name + Ort),
--   'booking' (Preise) oder 'reviews' (Bewertungen); NULL = nur eigene Links je Objekt.
ALTER TABLE partner_programs ADD COLUMN IF NOT EXISTS sort_order smallint NOT NULL DEFAULT 100;
ALTER TABLE partner_programs ADD COLUMN IF NOT EXISTS auto_search text CHECK (auto_search IN ('booking', 'reviews'));

INSERT INTO partner_programs (code, name, domains, label_booking, label_reviews, search_url, status, sort_order, notes) VALUES
  ('expedia', 'Expedia', '{expedia.de,expedia.com,hotels.com}', 'Preise bei Expedia', 'Bewertungen bei Expedia',
   'https://www.expedia.de/Hotel-Search?destination={q}', 'inactive', 20,
   'Expedia Group Affiliate Program: Partnerkennung bzw. Deeplink-Vorlage eintragen, dann aktivieren. Hotels.com läuft über dasselbe Programm.'),
  ('hotelde', 'hotel.de', '{hotel.de}', 'Preise bei hotel.de', 'Bewertungen bei hotel.de',
   NULL, 'inactive', 30,
   'Partnerkennung bzw. Deeplink-Vorlage des Netzwerks eintragen, dann aktivieren. Für Suchlinks ohne eigenen Link: Such-Adresse mit {q} eintragen.'),
  ('tripadvisor', 'Tripadvisor', '{tripadvisor.de,tripadvisor.com}', 'Preise bei Tripadvisor', 'Bewertungen bei Tripadvisor',
   'https://www.tripadvisor.de/Search?q={q}', 'active', 90,
   'Nur Bewertungslink (ohne Provision, keine Bewertungsinhalte auf unserer Seite). Eigener Link je Objekt möglich.')
ON CONFLICT (code) DO NOTHING;
UPDATE partner_programs SET auto_search = 'reviews' WHERE code = 'tripadvisor' AND auto_search IS NULL;
UPDATE partner_programs SET sort_order = 10 WHERE code = 'booking' AND sort_order = 100;
UPDATE partner_programs SET sort_order = 40 WHERE code = 'holidaycheck' AND sort_order = 100;
