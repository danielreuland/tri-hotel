# Übergabe: KI-Mails (Persona + Mustertext je Anlass)

Stand 19.10.2026: Punkte 1–5 (aimail.js, Routen, Persona-Stil, Anbindung in inquiries.js, Tests) sind umgesetzt.
Offen sind 6–9; danach nach `main` mergen, deployen (Punkt 10) und diese Datei löschen.

Ziel (mit Daniel abgestimmt): Beim Formulieren mischt die KI
**feste Regeln (Code)** + **Rolle & Stil der Persona** (`personas.style`) + **Mustertext und Pflichtpunkte des Anlasses**
(`ai_mail_templates`, Admin: Einstellungen → E-Mail-Vorlagen → KI-Mails) + konkrete Angaben + **Stilbeispiel**
(zuletzt von Hand überarbeitete, gesendete Anfrage). Ohne KI wird der ausgefüllte Mustertext wörtlich verwendet.
Anlässe jetzt: `inquiry` (Datenanfrage, KI) und `inquiry_reminder` (Erinnerung, ohne KI), je Deutsch/Englisch.

## Noch zu tun

### 6. Danach (mit Daniel abgestimmt): Bekannte Angaben und Leistungen bestätigen lassen
- Entwurf Schritt 1: zusätzlicher Block „Bekannte Angaben bestätigen lassen“ – vorausgewählt alle Fakten mit
  Vertrauensstufe 2 oder 4 sowie die vorhandenen Leistungen; abwählbar. Speichern z. B. in `inquiries.confirm_criteria_ids`
  und `inquiries.confirm_features` (Migration).
- Mail: nur ein Satz mit Anzahl („Außerdem haben wir 14 Angaben erfasst – bitte kurz prüfen“), als Pflichtpunkt/Abschnitt
  `{{#bestaetigen}}…{{/bestaetigen}}` im Mustertext; die Liste steht im Formular (150-Wörter-Grenze).
- Antwortformular `/anfrage/:token`: Abschnitt „Das wissen wir bereits“ – je Angabe Wert + stimmt / stimmt nicht
  (dann Auswahl der richtigen Option) / weiß nicht; Leistungen als Häkchenliste, optional „Bieten Sie außerdem …?“ aus dem Katalog.
- Antworten in den bestehenden Ablauf (`inquiry_answers`, Admin übernimmt); übernommen = Vertrauensstufe 1 mit Quelle/Datum.
  Für Leistungen prüfen, wie `entity_features` Herkunft speichert (ggf. Spalten für Bestätigung ergänzen).
- Knopftext im Mail-Template `views/emails/inquiry.ejs` passend zum Inhalt (nur Fotos → „Fotos hochladen“ / „Upload photos“).

### 7. Admin-Liste „Hotels“ (`/admin`, Route in `src/routes/admin.js`, View `views/admin/queue.ejs`): Suche + Filter
- Suchfeld „Name oder Ort“ (Parameter `q`): Name, Ort, Website; ohne Groß-/Kleinschreibung und Akzente
  (`unaccent` falls verfügbar, sonst `translate()`/ILIKE).
- Auswahl **Land** (`land`, ISO-Code, Anzeige als Ländername via `seo.countryName`) und **Region** (`region`, aus der
  Regionen-Verwaltung `/admin/regionen` – vorhandene Zuordnung Objekt↔Region prüfen) neben „alle Rankings“; nur
  vorkommende Werte, mit Anzahl.
- Kombinierbar mit den Status-Pillen; Pillen-Zahlen berücksichtigen Suche/Land/Region; Filter bleiben beim Wechsel erhalten.
- Leerer Treffer: „Keine Hotels gefunden“ + „Filter zurücksetzen“. GET-Formular (Lesezeichen möglich).

### 8. Verknüpfung Hotel ↔ Camp-Anbieter per Auswahl statt Schreibweise
Heute: `camp_provider_hotels (provider_id, entity_id, hotel_name, place, region, sort_order)`, gepflegt über das Textfeld
„Hotels und Orte – Name | Ort | Region“ in `views/admin/camp-form.ejs` / `routes/admin-camps.js` (Zeile ~114 ff.:
löschen + neu einfügen, `entity_id` nur bei exakt gleichem Namen). Unverknüpfte Zeilen: `services/camps.js` ~Zeile 88.
- Camp-Formular: Textfeld ersetzen durch Zeilenliste; je Zeile Auswahlfeld mit kleiner Suche über die Objekte der
  aktiven Rankings (Name + Ort, akzent- und großschreibungsunabhängig, Teiltreffer) – Wert = `entity_id`; Option
  „Hotel nicht im Ranking“ mit freien Feldern Name/Ort/Region. Zeilen hinzufügen/entfernen/sortieren. Ohne JS: normales `<select>`.
  Beim Speichern `hotel_name/place/region` bei verknüpften Zeilen aus dem Objekt übernehmen. Bestehende Zeilen-IDs möglichst
  erhalten (statt alles löschen), Audit-Log wie bisher.
- Admin-Detailseite des Objekts: Abschnitt „Camp-Anbieter in diesem Hotel“ (bei den Stammdaten bzw. am Kriterium mit
  `link_source = 'camp_providers'`): Auswahl mit Suche über alle Camp-Anbieter, hinzufügen/entfernen → dieselbe Tabelle.
- Kleines wiederverwendbares Skript `public/js/combo.js` (Combobox mit Suchfeld, Tastatur, CSP-tauglich ohne Inline-JS).
- Aufräumen: für unverknüpfte Zeilen Vorschläge (Name normalisiert ohne Akzente/Satzzeichen/„Hotel“, „Resort“ …, plus Ort),
  im Camp-Formular und in der Camps-Übersicht „Vorschlag übernehmen“ – nie automatisch verknüpfen. Ebenso beim Anlegen
  eines neuen Objekts passende freie Zeilen vorschlagen.
- Tests für die Normalisierung/Vorschläge.

### 9. Camp-Sammelanfrage („Lass dir Camp-Angebote schicken“)
Mit Daniel abgestimmt (19.10.2026):
- Fragebogen (eine Seite): Zeitraum/Monat oder flexibel, Regionen (oder „egal, warm“), Dauer, Personen, Niveau,
  Schwerpunkt (Rad/Schwimmen/Lauf/Wettkampfvorbereitung), Betreuung (Coach/Gruppe/nur Organisation), Hotel inkl.,
  Flug inkl., Budget p. P. (optional), Freitext, Kontakt.
- Passende Anbieter nach Profil-Abgleich; **3 vorausgewählt + bis zu 2 weitere nach Wahl des Kunden (max. 5)**.
  Reihenfolge nur nach Passung, nie nach Bezahlung. Weiterleiten nur an Anbieter mit Vereinbarung (`lead_active`);
  andere passende Anbieter trotzdem zeigen mit „direkt anfragen“ (Website).
- Einwilligung nennt die gewählten Anbieter namentlich (DSGVO, kein „an alle“). Danach wie Camp-Anfragen:
  E-Mail-Bestätigung → Admin-Prüfung → Weiterleitung mit Reply-To. Technisch: Sammelanfrage (neue Tabelle) erzeugt je
  Anbieter einen `camp_leads`-Eintrag (Abrechnung, Board, Löschfristen wie bisher).
- Anbieter-Profile um Abgleichsfelder ergänzen (Monate, Niveaus, Gruppengrößen, Preisrahmen …).
- Platzierung: Camp-Übersicht, Regionsseiten, Hotelseiten („Kein passendes Camp? Lass dir Angebote schicken“);
  Plausible-Ziel „Camp-Sammelanfrage“.
- **Nachfrage nach 7 Tagen im System, nicht in n8n**: täglicher pg-boss-Job wie `inquiry-daily`, Mail-Vorlage
  „Hast du Angebote bekommen?“ (pro Anbieter ja/nein, Knopf-Links mit Token), Ergebnis intern je Anbieter
  (Reaktionsquote, nie öffentlich/in Rankings). Nur bei bestätigten + weitergeleiteten Anfragen, einmalig.
- **Offen:** Preis je geteilter Anfrage (Vorschlag: günstiger als Einzelanfrage, z. B. halber Preis) – Daniel fragen.
- Faustregel System vs. n8n: personenbezogene Daten, Einwilligungen, Abrechnung, Kundenmails, Fristen → System;
  fremde Dienste, Social (Lara), Benachrichtigungen an Daniel, Experimente → n8n per Webhook mit minimalen Daten.

### 10. Deploy
`git pull && npm run migrate && npm test && pm2 reload tri-hotel`; danach /admin/emails, /admin/emails/ki/inquiry,
/admin/sites/<id> aufrufen und einen Entwurf formulieren.

