-- CHECK24 Pauschalreisen (check24.net, Partner-ID 1179734, Werbemittel 18 = Textlink/Deeplink).
-- Link-Aufbau laut Linkgenerator: https://a.check24.net/misc/click.php?pid=…&aid=18&target_url=<Ziel, kodiert>,
-- Tracking-ID laut Partnerbereich als &tid= (Buchstaben, Ziffern, Bindestriche – passt zum Objekt-Slug).
-- Hotel-Nummer steht im Ziel als c24pp_hotel_id (Playitas Hotel = 18002). Die vom Generator erzeugte Adresse enthält
-- Reisedaten und Abflughäfen, die veralten; gespeichert wird deshalb nur die kurze Form mit der Hotel-Nummer
-- (getestet 27.10.2026: …/?c24pp_hotel_id=18002 öffnet das Playitas Hotel mit Standard-Abflughäfen und -Reisezeit).
-- Kurzlinks (c24n.de) nicht verwenden: das Ziel soll erkennbar bleiben.
INSERT INTO partner_programs (code, name, domains, label_booking, label_reviews, link_template, link_params, id_url,
                              direct_link, status, sort_order, notes)
VALUES ('check24', 'CHECK24', '{check24.net,check24.de}', 'Pauschalreise bei CHECK24', 'Bewertungen bei CHECK24',
        'https://a.check24.net/misc/click.php?pid=1179734&aid=18&tid={slug}&target_url={url_enc}', '{}',
        'https://www.check24.net/pauschalreisen-vergleich/?c24pp_hotel_id={id}',
        true, 'inactive', 7,
        'CHECK24 Pauschalreisen (Flug + Hotel) über das CHECK24-Partnerprogramm, Partner-ID 1179734, Werbemittel 18. Eintragen: Hotel-Nummer (c24pp_hotel_id aus der Adresse des Angebots) oder die ganze Adresse – gespeichert wird die kurze Form ohne Reisedaten. Tracking-ID = Objekt-Slug. Vor dem Aktivieren: Programmbedingungen prüfen (Marke, E-Mail, Gutscheine), Provision eintragen.')
ON CONFLICT (code) DO NOTHING;
