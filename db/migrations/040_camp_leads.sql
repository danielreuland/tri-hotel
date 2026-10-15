-- Baustein B: Anfragen an Camp-Anbieter (Leads). Formular nur bei Anbietern mit Vereinbarung;
-- Weitergabe erst nach E-Mail-Bestätigung des Interessenten und Freigabe im Admin, nur an den gewählten Anbieter.
ALTER TABLE camp_providers
  ADD COLUMN lead_active     boolean NOT NULL DEFAULT false,   -- Anfrageformular anzeigen (Vereinbarung besteht)
  ADD COLUMN lead_email      text,                             -- Empfänger der weitergeleiteten Anfragen
  ADD COLUMN lead_model      text CHECK (lead_model IN ('per_lead', 'commission', 'free')),
  ADD COLUMN lead_fee        numeric(8,2),                     -- € je weitergeleiteter Anfrage
  ADD COLUMN lead_commission numeric(5,2),                     -- % vom Buchungswert
  ADD COLUMN lead_since      date,
  ADD COLUMN lead_notes      text;

CREATE TABLE camp_leads (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id           uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  provider_id       uuid NOT NULL REFERENCES camp_providers(id) ON DELETE CASCADE,
  entity_id         uuid REFERENCES entities(id) ON DELETE SET NULL,   -- Hotelwunsch aus dem Ranking
  hotel_text        text,                                              -- Hotelwunsch als Text (z. B. Hotel ohne Profil)
  name              text,
  email             text,
  phone             text,
  period_month      date,                                              -- gewünschter Monat (1. des Monats)
  period_note       text,
  persons           smallint,
  level             text,
  message           text,
  status            text NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'confirmed', 'forwarded', 'rejected')),
  verify_token_hash text,
  token_expires_at  timestamptz,
  confirmed_at      timestamptz,
  verified_by       uuid REFERENCES admin_users(id),
  forwarded_at      timestamptz,
  forwarded_by      uuid REFERENCES admin_users(id),
  rejection_reason  text,
  -- Abrechnung: Konditionen zum Zeitpunkt der Weitergabe festhalten
  billed_model      text,
  billed_fee        numeric(8,2),
  consent_text      text NOT NULL,
  ip_hash           text,
  anonymized_at     timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX camp_leads_provider_idx ON camp_leads (provider_id, status, forwarded_at);
CREATE INDEX camp_leads_token_idx ON camp_leads (verify_token_hash) WHERE verify_token_hash IS NOT NULL;
