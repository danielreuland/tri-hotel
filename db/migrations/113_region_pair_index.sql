-- Admin-Schalter je Regionspaar (E-02, 08.11.2026): Vergleichsseiten mit Redaktionstext werden indexiert, außer der Admin
-- schaltet sie ab. Ohne Text immer noindex (der Schalter wirkt dann nicht). pair = Slugs alphabetisch, „a-vs-b“.
CREATE TABLE region_pair_settings (
  site_id    uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  pair       text NOT NULL,
  indexable  boolean NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (site_id, pair)
);
