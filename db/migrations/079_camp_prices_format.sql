-- Camp-Anbieter: Preisangaben einheitlich (Währung, Tausenderpunkt, kein „ab … –“), Doppelzimmer-Preis zuerst (die Liste zeigt
-- den ersten Preis, die Fußnote spricht von Doppelzimmern), Fremdwährungen mit ungefährem Euro-Betrag, Tippfehler „Got To Tri“.
UPDATE camp_providers SET prices = '[
  {"label": "Triathlon Week, Doppelzimmer pro Person, 20.–27.02.", "price": "919 €", "duration": "7 Tage", "excluded": "", "included": "7 Nächte Junior Suite 5* Zafiro Palace, Halbpension+, Camp-Programm"},
  {"label": "Triathlon Week, Einzelzimmer, 20.–27.02.", "price": "1.129 €", "duration": "7 Tage", "excluded": "", "included": "7 Nächte Junior Suite 5* Zafiro Palace, Halbpension+, Camp-Programm"},
  {"label": "Triathlon Weeks, 2 Wochen Einzelzimmer", "price": "1.994 €", "duration": "14 Tage", "excluded": "", "included": "14 Nächte Junior Suite, Halbpension+, Camp-Programm"}
]'::jsonb, updated_at = now() WHERE slug = 'actreme' AND prices->0->>'price' = '1129';

UPDATE camp_providers SET prices = jsonb_set(prices, '{0,price}', '"832–1.305 €"'), updated_at = now()
 WHERE slug = 'hannes-hawaii-tours' AND prices->0->>'price' = 'ab 832–1.305 €';

UPDATE camp_providers SET prices = jsonb_set(prices, '{0,price}', '"229 €"'), updated_at = now()
 WHERE slug = 'mh-sportsacademy' AND prices->0->>'price' = '229,00 €';

UPDATE camp_providers SET prices = jsonb_set(jsonb_set(prices, '{0,price}', '"985 £ (ca. 1.150 €)"'), '{0,label}', '"Go to Tri Middle/Long Distance Camp 2027"'), updated_at = now()
 WHERE slug = 'go-to-tri' AND prices->0->>'price' = '£985';

UPDATE camp_providers SET prices = jsonb_set(jsonb_set(prices, '{0,price}', '"3.000 CHF (ca. 3.200 €)"'), '{1,price}', '"3.000 CHF (ca. 3.200 €)"'), updated_at = now()
 WHERE slug = 'roy-hinnen' AND prices->0->>'price' = 'CHF 3’000.–';
