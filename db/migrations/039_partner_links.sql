-- Partnerlinks (Affiliate): Programme (Booking.com, HolidayCheck, Direktbuchung …) und Links je Objekt.
-- Neutralität: Partnerlinks beeinflussen weder Score noch Reihenfolge; Anzeige immer gekennzeichnet.
CREATE TABLE partner_programs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code          text NOT NULL UNIQUE,                 -- 'booking', 'holidaycheck', 'hotel'
  name          text NOT NULL,                        -- Anzeigename, z. B. „Booking.com“
  domains       text[] NOT NULL DEFAULT '{}',          -- erlaubte Ziel-Domains (leer = beliebige https-Adresse)
  link_params   jsonb NOT NULL DEFAULT '{}',           -- an die Zieladresse angehängte Parameter, z. B. {"aid": "123456"}
  link_template text,                                  -- alternativ Netzwerk-Deeplink, z. B. https://www.awin1.com/cread.php?awinmid=1&awinaffid=2&ued={url_enc}
  label_booking text NOT NULL DEFAULT 'Preise ansehen',
  label_reviews text NOT NULL DEFAULT 'Bewertungen ansehen',
  search_url    text,                                  -- Hilfe im Admin: Suche nach dem Objekt beim Anbieter ({q})
  notes         text,
  status        text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE entity_links (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id   uuid NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  program_id  uuid NOT NULL REFERENCES partner_programs(id) ON DELETE CASCADE,
  kind        text NOT NULL CHECK (kind IN ('booking', 'reviews')),
  url         text NOT NULL,
  created_by  uuid REFERENCES admin_users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entity_id, program_id, kind)
);
CREATE INDEX entity_links_entity_idx ON entity_links (entity_id);

INSERT INTO partner_programs (code, name, domains, label_booking, label_reviews, search_url, status, notes) VALUES
  ('booking', 'Booking.com', '{booking.com}', 'Preise bei Booking.com', 'Bewertungen bei Booking.com',
   'https://www.booking.com/searchresults.de.html?ss={q}', 'active', 'Partnerkennung (aid) nach Zulassung im Booking.com-Partnerprogramm eintragen.'),
  ('holidaycheck', 'HolidayCheck', '{holidaycheck.de,holidaycheck.com}', 'Angebote bei HolidayCheck', 'Bewertungen bei HolidayCheck',
   'https://www.google.com/search?q=site%3Aholidaycheck.de+{q}', 'active', 'Deeplink-Vorlage des Netzwerks (z. B. Awin) nach Zulassung eintragen.'),
  ('hotel', 'Direkt beim Hotel', '{}', 'Direkt beim Hotel buchen', 'Bewertungen beim Hotel',
   NULL, 'inactive', 'Nur mit Provisionsvereinbarung bzw. Partnerprogramm des Hotels aktivieren.');

-- Bisheriger einzelner Buchungslink: als Booking.com-Link übernehmen, wenn er dorthin zeigt
INSERT INTO entity_links (entity_id, program_id, kind, url)
SELECT e.id, p.id, 'booking', e.booking_url FROM entities e JOIN partner_programs p ON p.code = 'booking'
 WHERE e.booking_url ILIKE '%booking.com%';
