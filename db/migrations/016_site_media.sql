-- Medienbibliothek je Site: Stimmungsbilder für allgemeine Bereiche (Startseite, Regionen, Abschluss-Band).
-- Nur generische Motive mit dokumentierter Lizenz; nie als Foto eines bestimmten Objekts verwenden.
-- Urhebervermerk wird immer angezeigt. Bilder liegen lokal (WebP-Varianten), kein Hotlinking.
CREATE TABLE site_media (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id      uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  slot         text,                                   -- home_hero | cta_band | method | submit (NULL = nur Bibliothek)
  region_id    uuid REFERENCES regions(id) ON DELETE SET NULL,
  alt          text NOT NULL,                          -- Bildbeschreibung (Barrierefreiheit)
  provider     text NOT NULL,                          -- Unsplash, Pexels, eigenes Foto …
  license      text NOT NULL,                          -- z. B. „Unsplash License“
  credit       text NOT NULL,                          -- Urhebervermerk, z. B. „Foto: Jane Doe / Unsplash“
  source_url   text,                                   -- Seite des Fotos beim Anbieter (Nachweis)
  focal        text NOT NULL DEFAULT '50% 50%',        -- Bildausschnitt (object-position)
  width        integer NOT NULL,
  height       integer NOT NULL,
  variants     integer[] NOT NULL,                     -- erzeugte Breiten, z. B. {640,1280,1920}
  created_by   uuid REFERENCES admin_users(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  CHECK (slot IS NULL OR region_id IS NULL)
);
-- Je Site höchstens ein Bild pro Platz und pro Region
CREATE UNIQUE INDEX site_media_slot_uq ON site_media (site_id, slot) WHERE slot IS NOT NULL;
CREATE UNIQUE INDEX site_media_region_uq ON site_media (site_id, region_id) WHERE region_id IS NOT NULL;
