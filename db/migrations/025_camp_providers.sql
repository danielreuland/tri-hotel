-- Camp-Anbieter (Trainingscamps) je Site: neutral gelistet, ohne Score. Partnerstatus beeinflusst die Reihenfolge nie.
CREATE TABLE camp_providers (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id      uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  slug         text NOT NULL,
  name         text NOT NULL,
  model        text NOT NULL,                  -- operator | coach | resort | community | group
  model_label  text,                           -- Feinangabe, z. B. „Coach (Ex-Profi)“
  seat         text,                           -- Sitz, z. B. „Darmstadt“
  summary      text,                           -- Kurzprofil in eigenen Worten
  website      text NOT NULL,
  destinations text[] NOT NULL DEFAULT '{}',   -- wie angegeben, z. B. {Lanzarote, Mallorca}
  regions      text[] NOT NULL DEFAULT '{}',   -- für den Filter: Kanaren, Mallorca, Alpen, Deutschland …
  features     jsonb NOT NULL DEFAULT '{}',    -- {"hotel":"yes|optional|partner|required|no","flight":…, "beginner":true, …, "max_group":"20"}
  prices       jsonb NOT NULL DEFAULT '[]',    -- [{"label","duration","price","included","excluded"}]
  as_of        date,                           -- Stand der Angaben
  source_url   text,                           -- Quelle der Angaben
  partner      boolean NOT NULL DEFAULT false, -- Vereinbarung (Lead/Provision) – nur Kennzeichnung, keine Sortierung
  partner_url  text,                           -- Partner-/Affiliate-Link (als Anzeige gekennzeichnet)
  status       text NOT NULL DEFAULT 'active' CHECK (status IN ('draft', 'active', 'archived')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (site_id, slug)
);

-- Hotels, in denen ein Anbieter Camps durchführt; entity_id gesetzt, wenn das Hotel im Ranking ist
CREATE TABLE camp_provider_hotels (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id  uuid NOT NULL REFERENCES camp_providers(id) ON DELETE CASCADE,
  entity_id    uuid REFERENCES entities(id) ON DELETE SET NULL,
  hotel_name   text NOT NULL,
  place        text,
  region       text,
  sort_order   smallint NOT NULL DEFAULT 0
);
CREATE INDEX camp_provider_hotels_entity_idx ON camp_provider_hotels (entity_id);

-- Weiterleitungen zu Anbietern: nur Zählung je Tag, keine personenbezogenen Daten
CREATE TABLE outbound_clicks (
  kind       text NOT NULL,       -- camp
  target_id  uuid NOT NULL,
  day        date NOT NULL DEFAULT current_date,
  clicks     integer NOT NULL DEFAULT 0,
  PRIMARY KEY (kind, target_id, day)
);

-- Anfragen von Anbietern („Für Camp-Anbieter“) laufen über das Kontakt-System
ALTER TABLE contact_messages
  ADD COLUMN topic       text NOT NULL DEFAULT 'kontakt',   -- kontakt | anbieter
  ADD COLUMN company     text,
  ADD COLUMN provider_id uuid REFERENCES camp_providers(id) ON DELETE SET NULL,
  ADD COLUMN request     text;                              -- korrektur | partner | aufnahme | sonstiges
