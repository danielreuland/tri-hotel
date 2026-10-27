-- Hotels.com DACH über CJ (Advertiser 5275606, Website 101907930, Deeplink-Link 17140575). Hotels.com gehört zur
-- Expedia Group und nutzt dieselben Hotel-IDs: https://de.hotels.com/h{id}.Hotel-Information leitet auf die Hotelseite
-- (getestet 27.10.2026 mit Playitas Hotel, Expedia-ID 1786689 → hotels.com/ho261410). Deshalb neue Spalte id_from:
-- Programme mit id_url übernehmen die Nummer eines anderen Programms, wenn beim Objekt kein eigener Link steht.
ALTER TABLE partner_programs ADD COLUMN IF NOT EXISTS id_from text;

INSERT INTO partner_programs (code, name, domains, label_booking, label_reviews, link_template, link_params, id_url, id_from,
                              direct_link, trademark_notice, status, sort_order, notes)
VALUES ('hotelscom', 'Hotels.com', '{hotels.com}', 'Preise bei Hotels.com', 'Bewertungen bei Hotels.com',
        'https://www.jdoqocy.com/click-101907930-17140575?url={url_enc}&sid={slug}', '{}',
        'https://de.hotels.com/h{id}.Hotel-Information', 'expedia',
        true, 'Hotels.com ist eine Marke oder eingetragene Marke von Hotels.com, L.P.', 'inactive', 6,
        'Hotels.com DACH über CJ (Advertiser 5275606, Website 101907930, Deeplink-Link 17140575). Nummer kommt automatisch aus dem Expedia-Link des Hotels (gleiche Hotel-IDs); eigener Link nur bei Abweichung. Vor dem Aktivieren Programmbedingungen prüfen (Marke, Gutscheine, E-Mail-Nutzung wie bei Expedia?).')
ON CONFLICT (code) DO NOTHING;
