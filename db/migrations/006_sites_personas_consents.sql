-- Mandantenfähigkeit (Sites), virtuelle Mitarbeiter (KI-Personas) und Einwilligungen.
--
-- Site = eigene Marke mit Domain, Absender, Farben und Pflichtangaben (z. B. tri-hotel.de, später hybrid-hotel.de).
-- Rankings gehören zu einer Site; Objekte (Hotels) können auf mehreren Sites/Rankings stehen.

CREATE TABLE sites (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code           text UNIQUE NOT NULL,                 -- 'tri-hotel'
  name           text NOT NULL,                        -- 'tri-hotel.de' (Marke in Texten, Titel, Mails)
  logo_text      text NOT NULL,                        -- 'TRI-HOTEL' (erster Bindestrich wird in Akzentfarbe gesetzt)
  primary_domain text UNIQUE NOT NULL,                 -- 'tri-hotel.de'
  domains        text[] NOT NULL DEFAULT '{}',         -- weitere Hostnamen, z. B. 'www.tri-hotel.de'
  theme          jsonb NOT NULL DEFAULT '{}',          -- {"accent":"#0dcfbd","accent_strong_light":"#08796f","accent_strong_dark":"#0dcfbd","accent_ink":"#04211e"}
  mail_from      text NOT NULL,                        -- Absender für Systemmails
  mail_reply_to  text,                                 -- Antwortadresse (Betreiber antworten per Mail)
  legal          jsonb NOT NULL DEFAULT '{}',          -- Impressum: {"owner","address","email","responsible"}
  is_default     boolean NOT NULL DEFAULT false,       -- Fallback für unbekannte Hosts (z. B. localhost)
  status         ranking_status NOT NULL DEFAULT 'draft',
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX sites_one_default_idx ON sites (is_default) WHERE is_default;

INSERT INTO sites (code, name, logo_text, primary_domain, domains, theme, mail_from, mail_reply_to, legal, is_default, status)
VALUES ('tri-hotel', 'tri-hotel.de', 'TRI-HOTEL', 'tri-hotel.de', '{www.tri-hotel.de}',
        '{"accent":"#0dcfbd","accent_strong_light":"#08796f","accent_strong_dark":"#0dcfbd","accent_ink":"#04211e"}',
        'hallo@tri-hotel.de', 'info@tri-hotel.de', '{"email":"hallo@tri-hotel.de"}', true, 'active');

-- Rankings hängen an einer Site; das Standard-Ranking gilt je Site
ALTER TABLE rankings ADD COLUMN site_id uuid REFERENCES sites(id);
UPDATE rankings SET site_id = (SELECT id FROM sites WHERE code = 'tri-hotel');
ALTER TABLE rankings ALTER COLUMN site_id SET NOT NULL;
DROP INDEX IF EXISTS rankings_one_default_idx;
CREATE UNIQUE INDEX rankings_one_default_per_site_idx ON rankings (site_id) WHERE is_default;
-- Subdomain nur innerhalb einer Site eindeutig
ALTER TABLE rankings DROP CONSTRAINT IF EXISTS rankings_subdomain_key;
CREATE UNIQUE INDEX rankings_site_subdomain_idx ON rankings (site_id, subdomain) WHERE subdomain IS NOT NULL;

-- ---------- Virtuelle Mitarbeiter (KI-Assistenz, immer offen als KI gekennzeichnet) ----------
CREATE TABLE personas (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id    uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  name       text NOT NULL,                            -- 'Mia'
  role       text NOT NULL,                            -- 'data_inquiry' | 'social' | 'partnerships'
  title      text NOT NULL,                            -- 'Digitale Assistenz Datenprüfung'
  email      text,                                     -- eigener Absender, z. B. mia@tri-hotel.de (sonst mail_from der Site)
  active     boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (site_id, role)
);

INSERT INTO personas (site_id, name, role, title, email)
SELECT s.id, v.name, v.role, v.title, v.email
FROM sites s, (VALUES
  ('Mia',  'data_inquiry', 'Digitale Assistenz Datenprüfung', 'mia@tri-hotel.de'),
  ('Lara', 'social',       'Digitale Assistenz Social Media', 'lara@tri-hotel.de'),
  ('Ben',  'partnerships', 'Digitale Assistenz Kooperationen', 'ben@tri-hotel.de')
) AS v(name, role, title, email)
WHERE s.code = 'tri-hotel';

ALTER TABLE inquiries ADD COLUMN persona_id uuid REFERENCES personas(id);
ALTER TABLE admin_actions ADD COLUMN persona_id uuid REFERENCES personas(id);  -- Aktion eines Agenten statt eines Admins

-- ---------- Einwilligungen des Betreibers ----------
-- Grundlage für automatisierte Abläufe (n8n): ohne passende, nicht widerrufene Einwilligung keine Aktion.
CREATE TABLE consents (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id     uuid NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  site_id       uuid NOT NULL REFERENCES sites(id),
  type          text NOT NULL,                         -- 'photos_profile' | 'photos_social' | 'partner_contact'
  granted_at    timestamptz NOT NULL DEFAULT now(),
  source        text NOT NULL,                         -- 'inquiry' (Formular) | 'admin' (z. B. telefonisch, schriftlich)
  inquiry_id    uuid REFERENCES inquiries(id),
  contact_email text,
  contact_name  text,
  text_version  text NOT NULL,                         -- Version des Wortlauts
  text          text NOT NULL,                         -- Wortlaut, dem zugestimmt wurde
  note          text,
  withdrawn_at  timestamptz,
  withdrawn_by  uuid REFERENCES admin_users(id),
  created_by    uuid REFERENCES admin_users(id)
);
CREATE INDEX consents_entity_idx ON consents (entity_id, type);
CREATE UNIQUE INDEX consents_one_active_idx ON consents (entity_id, site_id, type) WHERE withdrawn_at IS NULL;
