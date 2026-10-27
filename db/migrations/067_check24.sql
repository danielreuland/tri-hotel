-- CHECK24 Pauschalreisen (check24.net, Partner-ID 1179734, Werbemittel 18 = Textlink/Deeplink).
-- Link-Aufbau laut Linkgenerator: https://a.check24.net/misc/click.php?pid=…&aid=18&target_url=<Ziel, kodiert>,
-- Tracking-ID laut Partnerbereich als &tid= (Buchstaben, Ziffern, Bindestriche – passt zum Objekt-Slug).
-- Hotel-Nummer steht im Ziel als c24pp_hotel_id (Playitas Hotel = 18002). Die vom Generator erzeugte Adresse enthält
-- Reisedaten und Abflughäfen, die veralten; gespeichert wird deshalb nur die kurze Form mit der Hotel-Nummer
-- (getestet 27.10.2026: …/?c24pp_hotel_id=18002 öffnet das Playitas Hotel mit Standard-Abflughäfen und -Reisezeit).
-- Abgleich mit dem Linkgenerator (kurze Form eingegeben): click.php?aid=18&pid=1179734&target_url=…%3Fc24pp_hotel_id%3D18002%26pid%3D1179734
-- – der Generator hängt die Partner-ID auch ans Ziel; Vorlage und id_url bilden genau das nach, tid laut Partnerbereich am Ende.
-- Kurzlinks (c24n.de) nicht verwenden: das Ziel soll erkennbar bleiben.
INSERT INTO partner_programs (code, name, domains, label_booking, label_reviews, link_template, link_params, id_url,
                              direct_link, status, sort_order, notes)
VALUES ('check24', 'CHECK24 Pauschalreise', '{check24.net,check24.de}', 'Pauschalreise bei CHECK24', 'Bewertungen bei CHECK24',
        'https://a.check24.net/misc/click.php?aid=18&pid=1179734&target_url={url_enc}&tid={slug}', '{}',
        'https://www.check24.net/pauschalreisen-vergleich/?c24pp_hotel_id={id}&pid=1179734',
        true, 'inactive', 7,
        'CHECK24 Pauschalreisen (Flug + Hotel) über das CHECK24-Partnerprogramm der TARIF CHECK24 GmbH, Partner-ID 1179734, Werbemittel 18. '
     || '7 % der Rechnungssumme netto, nur für angetretene Reisen. Eintragen: Hotel-Nummer (c24pp_hotel_id aus der Adresse des Angebots) '
     || 'oder die ganze Adresse – gespeichert wird die kurze Form ohne Reisedaten. Tracking-ID = Objekt-Slug. Kein Markenhinweis nötig. '
     || 'Bedingungen (Vertragsstrafe 2.500 € je Verstoß): nur freigegebene Werbemittel unverändert, keine Preise ändern, kein Cashback, '
     || 'keine Logos/Namen der Reiseveranstalter aus dem Vergleich zeigen, CHECK24 nicht im Domainnamen, Newsletter nur an Double-Opt-in.')
ON CONFLICT (code) DO NOTHING;
