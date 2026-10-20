-- Suchbegriffe je Kriterium (scoring.search_terms): Synonyme und andere Sprachen für die Website-Auswertung.
-- Sie stehen im KI-Auftrag („auch genannt: …“) und steuern, welche Unterseiten gelesen werden. Im Admin je Kriterium pflegbar.
UPDATE criteria c SET scoring = c.scoring || jsonb_build_object('search_terms', v.terms::jsonb)
FROM rankings r, (VALUES
('rec_ice_bath', '["Kältebad","Kaltwasserbecken","Kalttauchbecken","Tauchbecken","Eistonne","Kryotherapie","Kältekammer","Cold Plunge","Ice Bath","Cryotherapy","baño de hielo","crioterapia","bagno di ghiaccio"]')
) AS v(code, terms)
WHERE r.id = c.ranking_id AND r.code = 'triathlon-hotel' AND c.code = v.code;
