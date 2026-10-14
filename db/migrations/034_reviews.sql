-- Nutzerbewertungen (Version 2): E-Mail-Bestätigung + Aufenthaltsmonat, Moderation im Admin, Fotos mit Freigabe.
-- Einfluss auf den Score nur, wenn rankings.formula.athlete_enabled = true (Standard: aus).

-- Bewertungs-Einstellungen je Ranking: Dimensionen (1–5 Sterne) und Faktencheck-Fragen (Kriterien-Codes)
ALTER TABLE rankings ADD COLUMN IF NOT EXISTS review_config jsonb NOT NULL DEFAULT '{}';

CREATE TABLE reviews (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id          uuid NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  ranking_id         uuid NOT NULL REFERENCES rankings(id) ON DELETE CASCADE,
  author_name        text NOT NULL,                 -- Anzeige: Vorname + Initial
  email              text,                          -- nur zur Bestätigung; wird nach Frist gelöscht
  verify_token_hash  text,
  token_expires_at   timestamptz,
  verified_at        timestamptz,
  verified_by        uuid REFERENCES admin_users(id), -- Admin hat ohne E-Mail-Bestätigung freigegeben
  stay_month         date NOT NULL,                 -- erster Tag des Aufenthaltsmonats
  camp_provider_id   uuid REFERENCES camp_providers(id) ON DELETE SET NULL,
  ratings            jsonb NOT NULL,                -- {"swim":4,"bike":5,...} 1–5
  answers            jsonb NOT NULL DEFAULT '{}',   -- {"<criterion_code>":"true"|"<option>"} Faktencheck
  title              text,
  body               text NOT NULL,
  status             text NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'pending', 'published', 'rejected')),
  rejection_reason   text,
  published_at       timestamptz,
  published_by       uuid REFERENCES admin_users(id),
  hotel_reply        text,
  hotel_reply_at     timestamptz,
  ip_hash            text,
  consent_version    text NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX reviews_entity_idx ON reviews (entity_id, ranking_id, status);

CREATE TABLE review_images (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id   uuid NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  width       integer NOT NULL,
  height      integer NOT NULL,
  variants    integer[] NOT NULL,
  approved_at timestamptz,
  approved_by uuid REFERENCES admin_users(id),
  sort_order  smallint NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE entity_rankings ADD COLUMN IF NOT EXISTS review_count integer NOT NULL DEFAULT 0;
ALTER TABLE entity_rankings ADD COLUMN IF NOT EXISTS review_avg numeric(3,2);   -- Ø Sterne aller Dimensionen (Anzeige)

UPDATE rankings SET
  formula = formula || '{"athlete_enabled": false, "min_reviews": 3}'::jsonb,
  review_config = '{
    "enabled": true,
    "dimensions": [
      {"code": "swim", "label": "Schwimmen"},
      {"code": "bike", "label": "Rad"},
      {"code": "run", "label": "Laufen"},
      {"code": "food", "label": "Verpflegung"},
      {"code": "recovery", "label": "Regeneration und Zimmer"},
      {"code": "service", "label": "Service für Sportler"},
      {"code": "value", "label": "Preis-Leistung"}
    ],
    "questions": ["swim_lanes", "bike_storage", "bike_workshop", "food_athlete_buffet", "log_laundry", "run_track"]
  }'::jsonb
WHERE code = 'triathlon-hotel';
