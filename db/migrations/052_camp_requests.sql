-- Sammelanfrage „Lass dir Camp-Angebote schicken“ (Einzelpersonen/Freunde mit mehreren Zimmern oder Gruppe/Verein).
-- Der Kunde wählt bis zu 5 Anbieter (3 vorgeschlagen + 2 optional, sortiert nur nach Passung); jeder Empfänger steht namentlich
-- in der Einwilligung. Je Anbieter entsteht ein camp_leads-Eintrag (Weitergabe, Abrechnung, Löschfristen wie bei Einzelanfragen).
-- Weitergabe auch an Anbieter ohne Vereinbarung (an deren Kontaktadresse) – als Einstieg für Partnergespräche.

CREATE TABLE camp_requests (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id           uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  kind              text NOT NULL DEFAULT 'private' CHECK (kind IN ('private', 'group')),
  -- Wünsche
  period_month      date,
  period_note       text,
  duration_days     smallint,
  destination       text,                       -- Region (slug), 'warm' (egal, Hauptsache warm) oder NULL (offen)
  level             text,
  focus             text[] NOT NULL DEFAULT '{}', -- bike | swim | run | race
  support           text,                       -- coach | group | orga
  hotel_wanted      text,                       -- yes | no | any
  flight_wanted     text,                       -- yes | no | any
  budget_pp         numeric(8,2),
  persons           smallint,
  rooms_single      smallint NOT NULL DEFAULT 0,
  rooms_double      smallint NOT NULL DEFAULT 0,
  entity_id         uuid REFERENCES entities(id) ON DELETE SET NULL,   -- Anfrage von einer Hotelseite
  message           text,
  -- Gruppe / Verein (organisatorisch)
  club_name         text,
  contact_role      text,
  level_range       text,
  own_coaches       boolean,
  exclusive         text,                       -- own | open | any
  invoice_to_club   boolean,
  -- Kontakt
  name              text,
  email             text,
  phone             text,
  -- Ablauf
  suggested_ids     uuid[] NOT NULL DEFAULT '{}',  -- vom System vorgeschlagen (Reihenfolge = Passung)
  provider_ids      uuid[] NOT NULL DEFAULT '{}',  -- vom Kunden gewählt
  status            text NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'confirmed', 'forwarded', 'rejected')),
  verify_token_hash text,
  token_expires_at  timestamptz,
  confirmed_at      timestamptz,
  consent_text      text NOT NULL,
  ip_hash           text,
  anonymized_at     timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX camp_requests_token_idx ON camp_requests (verify_token_hash) WHERE verify_token_hash IS NOT NULL;

ALTER TABLE camp_leads ADD COLUMN IF NOT EXISTS request_id uuid REFERENCES camp_requests(id) ON DELETE CASCADE;
ALTER TABLE camp_leads ADD COLUMN IF NOT EXISTS recipient text;          -- Adresse bei der Weitergabe (Vereinbarung oder Kontakt)
ALTER TABLE camp_leads ADD COLUMN IF NOT EXISTS partner_at_forward boolean; -- bestand bei der Weitergabe eine Vereinbarung?
-- Nachfrage beim Anbieter (nur zum Ergebnis; Partnerschaft spricht Ben getrennt an)
ALTER TABLE camp_leads ADD COLUMN IF NOT EXISTS followup_sent_at timestamptz;
ALTER TABLE camp_leads ADD COLUMN IF NOT EXISTS followup_token_hash text;
ALTER TABLE camp_leads ADD COLUMN IF NOT EXISTS outcome text CHECK (outcome IN ('offer_sent', 'no_offer', 'not_relevant'));
ALTER TABLE camp_leads ADD COLUMN IF NOT EXISTS outcome_at timestamptz;
ALTER TABLE camp_leads ADD COLUMN IF NOT EXISTS call_done_at timestamptz;  -- Anruf-Aufgabe erledigt
CREATE INDEX IF NOT EXISTS camp_leads_followup_idx ON camp_leads (followup_token_hash) WHERE followup_token_hash IS NOT NULL;

-- Abgleichsfelder der Anbieter (leer = keine Einschränkung)
ALTER TABLE camp_providers ADD COLUMN IF NOT EXISTS match_months smallint[] NOT NULL DEFAULT '{}';  -- 1–12
ALTER TABLE camp_providers ADD COLUMN IF NOT EXISTS match_levels text[] NOT NULL DEFAULT '{}';     -- beginner | intermediate | ambitious
ALTER TABLE camp_providers ADD COLUMN IF NOT EXISTS group_min smallint;
ALTER TABLE camp_providers ADD COLUMN IF NOT EXISTS group_max smallint;
ALTER TABLE camp_providers ADD COLUMN IF NOT EXISTS exclusive_groups boolean;   -- bietet eigene Gruppen-/Vereinscamps an
ALTER TABLE camp_providers ADD COLUMN IF NOT EXISTS price_min numeric(8,2);     -- € je Person (Camp, grob)
ALTER TABLE camp_providers ADD COLUMN IF NOT EXISTS price_max numeric(8,2);
