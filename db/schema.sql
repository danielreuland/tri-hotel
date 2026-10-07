-- tri-hotel.de – Datenbankschema Version 1 (multi-ranking-fähig)
-- PostgreSQL 14+
--
-- Grundidee: Ein Ranking (z. B. 'triathlon-hotel', später 'rad-hotel', 'hyrox-gym')
-- ist eine im Admin pflegbare Definition aus Kategorien, Kriterien, Formel und Labels.
-- Bewertete Objekte (Hotels, Gyms, Produkte ...) liegen in 'entities' und können
-- in mehreren Rankings vorkommen. Score und Status gelten je Ranking.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------- Typen ----------
CREATE TYPE ranking_status AS ENUM ('draft', 'active', 'archived');
CREATE TYPE listing_status AS ENUM ('draft', 'in_review', 'live', 'rejected');
CREATE TYPE submission_status AS ENUM (
  'received', 'verified', 'auto_check', 'admin_review',
  'live', 'rejected', 'expired', 'duplicate'
);
CREATE TYPE fact_source AS ENUM ('hotel', 'admin', 'users', 'auto');   -- 'hotel' = vom Objektbetreiber
CREATE TYPE criterion_value_type AS ENUM ('option', 'bool', 'number', 'rating');
CREATE TYPE image_source AS ENUM (
  'owner_release',   -- schriftliche Freigabe des Betreibers
  'affiliate_feed',  -- Bilder aus Partner-Feed, nach dessen Nutzungsbedingungen
  'places_api',      -- Google Places o. Ä., mit Attribution
  'user_upload',     -- Nutzerfoto (ab v2, Lizenz in den AGB)
  'own',             -- eigene Fotos
  'free_license'     -- Wikimedia/Unsplash o. Ä., nur generische Motive
);

-- ---------- Rankings (im Admin definierbar) ----------
CREATE TABLE rankings (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code            text UNIQUE NOT NULL,          -- 'triathlon-hotel'
  slug            text UNIQUE NOT NULL,          -- URL-Teil, z. B. 'triathlon-hotels'
  name            text NOT NULL,                 -- 'TriScore Triathlon-Hotels'
  score_name      text NOT NULL DEFAULT 'Score', -- 'TriScore', 'BikeScore', 'HyroxScore'
  description     text,
  entity_type     text NOT NULL,                 -- 'hotel', 'gym', 'product' ...
  entity_label_sg text NOT NULL,                 -- 'Hotel'
  entity_label_pl text NOT NULL,                 -- 'Hotels'
  subdomain       text UNIQUE,                   -- optional, z. B. 'rad' -> rad.tri-hotel.de
  is_default      boolean NOT NULL DEFAULT false,-- wird auf '/' ausgeliefert
  formula         jsonb NOT NULL DEFAULT
    '{"fact_weight":0.6,"athlete_weight":0.4,"bayes_c":5,"bayes_m":70,"min_completeness":70,"recheck_months":18}',
  labels          jsonb NOT NULL DEFAULT
    '[{"min":85,"label":"Top"},{"min":70,"label":"Sehr gut geeignet"},{"min":55,"label":"Geeignet"},{"min":0,"label":"Eingeschränkt geeignet"}]',
  status          ranking_status NOT NULL DEFAULT 'draft',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
-- genau ein Standard-Ranking
CREATE UNIQUE INDEX rankings_one_default_idx ON rankings (is_default) WHERE is_default;

CREATE TABLE ranking_categories (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ranking_id uuid NOT NULL REFERENCES rankings(id) ON DELETE CASCADE,
  code       text NOT NULL,                      -- 'swim', 'bike', ...
  label      text NOT NULL,
  sort_order smallint NOT NULL,
  UNIQUE (ranking_id, code)
);

-- ---------- Kriterienkatalog je Ranking ----------
-- Die Summe von max_points (aktive Kriterien) ist frei, der Score wird normiert;
-- der Admin zeigt nur einen Hinweis bei Abweichung von 100.
CREATE TABLE criteria (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ranking_id  uuid NOT NULL REFERENCES rankings(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES ranking_categories(id),
  code        text NOT NULL,                     -- z. B. 'swim_pool'
  label       text NOT NULL,
  value_type  criterion_value_type NOT NULL,
  scoring     jsonb NOT NULL,                    -- Punkteschema, siehe seed_criteria.sql
  max_points  smallint NOT NULL,
  is_ko       boolean NOT NULL DEFAULT false,
  sort_order  smallint NOT NULL,
  version     smallint NOT NULL DEFAULT 1,
  active      boolean NOT NULL DEFAULT true,
  UNIQUE (ranking_id, code)
);

-- ---------- Objekte (Hotels, Gyms, ...) ----------
CREATE TABLE entities (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type      text NOT NULL,                -- passt zu rankings.entity_type
  slug             text NOT NULL,
  name             text NOT NULL,
  city             text,
  country          char(2),                      -- ISO 3166-1 alpha-2
  website          text,
  lat              numeric(9,6),
  lng              numeric(9,6),
  attributes       jsonb NOT NULL DEFAULT '{}',  -- typspezifische Zusatzfelder
  booking_url      text,                         -- Phase 1: ein Affiliate-Link
  booking_provider text,                         -- z. B. 'booking', 'stay22'
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entity_type, slug)
);

-- Zugehörigkeit + Score je Ranking
CREATE TABLE entity_rankings (
  entity_id      uuid NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  ranking_id     uuid NOT NULL REFERENCES rankings(id) ON DELETE CASCADE,
  status         listing_status NOT NULL DEFAULT 'draft',
  fact_score     numeric(5,2),                   -- F, 0–100
  athlete_score  numeric(5,2),                   -- A, ab Version 2
  score          smallint,                       -- Gesamtscore 0–100
  completeness   numeric(5,2),                   -- Anteil bekannter Punktegewichte in %
  is_provisional boolean NOT NULL DEFAULT true,
  ko_reason      text,                           -- gesetzt, wenn K.O.-Regel greift
  published_at   timestamptz,
  updated_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (entity_id, ranking_id)
);
CREATE INDEX entity_rankings_rank_idx ON entity_rankings (ranking_id, score DESC) WHERE status = 'live';

-- ---------- Faktenwerte je Objekt ----------
CREATE TABLE entity_facts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id      uuid NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  criterion_id   uuid NOT NULL REFERENCES criteria(id),
  value          jsonb NOT NULL,                 -- z. B. {"option":"pool_50_hotel"} oder {"bool":true} oder {"number":6.5}
  points         numeric(5,2),                   -- berechnet von scoring.js
  source         fact_source NOT NULL,
  trust_level    smallint NOT NULL CHECK (trust_level BETWEEN 1 AND 4),  -- 1 Betreiber, 2 Admin, 3 Nutzer, 4 auto
  evidence_url   text,
  evidence_text  text,                           -- Textausschnitt als Fundstelle
  checked_at     timestamptz NOT NULL DEFAULT now(),
  disputed       boolean NOT NULL DEFAULT false,
  UNIQUE (entity_id, criterion_id)
);
CREATE INDEX entity_facts_recheck_idx ON entity_facts (checked_at);

-- ---------- Bilder und Bildrechte ----------
-- Öffentlich angezeigt wird ein Bild nur, wenn approved_at gesetzt ist und
-- valid_until leer oder in der Zukunft liegt. Ohne Bild: Platzhalter/Karte.
CREATE TABLE entity_images (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id     uuid NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  storage_path  text NOT NULL,                   -- eigene Kopie/Variante, kein Hotlinking
  source        image_source NOT NULL,
  license       text,                            -- z. B. 'CC BY 4.0', 'Freigabe Hotel', 'Partner-Feed'
  credit        text,                            -- anzuzeigender Urhebervermerk
  source_url    text,                            -- Fundstelle / Lizenzseite
  release_proof text,                            -- Verweis auf Freigabe (Datei/Mail), intern
  valid_until   date,                            -- Ablauf der Nutzungsrechte
  is_primary    boolean NOT NULL DEFAULT false,
  sort_order    smallint NOT NULL DEFAULT 0,
  approved_by   uuid,                            -- admin_users.id
  approved_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX entity_images_entity_idx ON entity_images (entity_id, sort_order);
CREATE INDEX entity_images_expiry_idx ON entity_images (valid_until) WHERE valid_until IS NOT NULL;

-- ---------- Klima je Monat (optional je Objekt) ----------
CREATE TABLE climate_monthly (
  entity_id  uuid NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  month      smallint NOT NULL CHECK (month BETWEEN 1 AND 12),
  avg_high_c numeric(4,1),
  avg_low_c  numeric(4,1),
  rain_days  numeric(4,1),
  PRIMARY KEY (entity_id, month)
);

-- ---------- Meldungen ----------
CREATE TABLE submissions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ranking_id          uuid NOT NULL REFERENCES rankings(id),
  entity_id           uuid REFERENCES entities(id),  -- gesetzt nach Dublettenprüfung / Anlage
  entity_name         text NOT NULL,
  city                text NOT NULL,
  country             char(2) NOT NULL,
  website             text NOT NULL,
  hints               jsonb NOT NULL DEFAULT '{}',   -- optionale Angaben des Melders, z. B. {"pool":"...","bike_garage":"..."}
  notes               text,
  submitter_email     text,                          -- NULL bei Admin-Anlage
  submitter_role      text,                          -- 'guest' | 'coach' | 'owner' | 'other'
  created_by_admin    boolean NOT NULL DEFAULT false,
  verify_token_hash   text,                          -- nur Hash speichern
  token_expires_at    timestamptz,
  verified_at         timestamptz,
  status              submission_status NOT NULL DEFAULT 'received',
  rejection_reason    text,
  admin_note          text,
  pipeline_log        jsonb NOT NULL DEFAULT '[]',   -- Schritte der Auto-Prüfung
  ip_hash             text,                          -- für Rate-Limit, kein Klartext
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX submissions_status_idx ON submissions (status);
CREATE INDEX submissions_token_idx ON submissions (verify_token_hash);

-- ---------- Admin ----------
CREATE TABLE admin_users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text UNIQUE NOT NULL,
  password_hash text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE admin_actions (
  id          bigserial PRIMARY KEY,
  admin_id    uuid REFERENCES admin_users(id),
  entity_type text NOT NULL,                    -- 'entity' | 'submission' | 'fact' | 'ranking' | 'criterion' | 'image'
  entity_id   uuid NOT NULL,
  action      text NOT NULL,                    -- 'approve' | 'reject' | 'edit_fact' | 'edit_criterion' | ...
  diff        jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ---------- Mail-Protokoll ----------
CREATE TABLE email_log (
  id            bigserial PRIMARY KEY,
  submission_id uuid REFERENCES submissions(id),
  recipient     text NOT NULL,
  template      text NOT NULL,                  -- 'verify' | 'rejected' | 'live'
  status        text NOT NULL,                  -- 'sent' | 'failed'
  provider_id   text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Version 2 (noch nicht anlegen): reviews, review_scores (je Ranking, mit ranking_id)
-- Phase 2 (noch nicht anlegen): booking_links, partner_contacts, partner_activities, link_clicks, commissions
