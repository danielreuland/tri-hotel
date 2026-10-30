-- Klicks auf Partner- und Anbieterlinks zusätzlich nach Herkunftsseite zählen (z. B. tri-hotel.de, fitnessracing-hotel.de).
-- Weiterhin nur Anzahl je Tag, keine personenbezogenen Daten. Ältere Zähler haben keine Herkunft ('' = nicht erfasst).
ALTER TABLE outbound_clicks ADD COLUMN source text NOT NULL DEFAULT '';
ALTER TABLE outbound_clicks DROP CONSTRAINT outbound_clicks_pkey;
ALTER TABLE outbound_clicks ADD PRIMARY KEY (kind, target_id, day, source);
