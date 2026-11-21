-- Partner-Button in der Rangliste (Test A/B, 21.11.2026). Rückgängig: db/migrations/down/124_partner_button_test.sql
-- Schalter liegt in app_settings (key 'partner_button', {"mode": "off" | "test" | "on"}), Standard „aus“.
-- Neutralität: Diese Tabellen und Spalten liest weder die Score-Berechnung noch die Sortierung.

-- Klicks zusätzlich nach Platzierung (ranking, region, hotelseite, ratgeber), Rangplatz, Variante und Liste zählen.
-- Weiterhin nur Anzahl je Tag, keine personenbezogenen Daten. '' bzw. 0 = nicht erfasst (alle bisherigen Zähler).
-- („source“ ist schon belegt: Herkunftsseite, z. B. tri-hotel.de)
ALTER TABLE outbound_clicks
  ADD COLUMN placement text     NOT NULL DEFAULT '',
  ADD COLUMN position  smallint NOT NULL DEFAULT 0,
  ADD COLUMN variant   text     NOT NULL DEFAULT '',
  ADD COLUMN list      text     NOT NULL DEFAULT '';
ALTER TABLE outbound_clicks DROP CONSTRAINT outbound_clicks_pkey;
ALTER TABLE outbound_clicks ADD PRIMARY KEY (kind, target_id, day, source, placement, position, variant, list);

-- Aufrufe der Rangliste und Klicks auf Hotelseiten je Tag, Ranking, Liste und Variante (Nenner des Tests)
CREATE TABLE ranking_list_stats (
  day        date     NOT NULL,
  ranking_id uuid     NOT NULL REFERENCES rankings(id) ON DELETE CASCADE,
  list       text     NOT NULL,                 -- gesamt | <regions-slug> | land-<länder-slug>
  variant    text     NOT NULL,                 -- A | B | on
  event      text     NOT NULL CHECK (event IN ('view', 'detail')),
  position   smallint NOT NULL DEFAULT 0,       -- nur bei detail: Rangplatz in der angezeigten Liste
  count      integer  NOT NULL DEFAULT 0,
  PRIMARY KEY (day, ranking_id, list, variant, event, position)
);
