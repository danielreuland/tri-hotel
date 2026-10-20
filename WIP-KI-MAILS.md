# Übergabe: KI-Mails (Persona + Mustertext je Anlass)

Stand 19.10.2026: Punkte 1–5 (aimail.js, Routen, Persona-Stil, Anbindung in inquiries.js, Tests) sind umgesetzt.
Offen sind 6–9; danach nach `main` mergen, deployen (Punkt 10) und diese Datei löschen.

Ziel (mit Daniel abgestimmt): Beim Formulieren mischt die KI
**feste Regeln (Code)** + **Rolle & Stil der Persona** (`personas.style`) + **Mustertext und Pflichtpunkte des Anlasses**
(`ai_mail_templates`, Admin: Einstellungen → E-Mail-Vorlagen → KI-Mails) + konkrete Angaben + **Stilbeispiel**
(zuletzt von Hand überarbeitete, gesendete Anfrage). Ohne KI wird der ausgefüllte Mustertext wörtlich verwendet.
Anlässe jetzt: `inquiry` (Datenanfrage, KI) und `inquiry_reminder` (Erinnerung, ohne KI), je Deutsch/Englisch.

## Noch zu tun

### 6. Bekannte Angaben und Leistungen bestätigen lassen – umgesetzt (19.10.2026)
Migration 043 (inquiries.confirm_criteria_ids/confirm_feature_ids/offer_feature_ids/confirmations, inquiry_answers.kind/previous,
inquiry_feature_answers). Entwurf Schritt 1: Block „Bekannte Angaben bestätigen lassen“ (views/admin/_confirm-block.ejs);
Mail: Abschnitt {{#bestaetigen}} mit {{anzahl}}; Formular: „Das wissen wir bereits“ (stimmt / stimmt nicht + Auswahl / weiß nicht,
Leistungen nur mit „Liste geprüft“, „Bieten Sie außerdem …?“); Admin: Antworten einzeln oder „Alle Bestätigungen übernehmen“;
Knopftext je Inhalt (Fragen beantworten / Angaben prüfen / Fotos hochladen). Tests: test/inquiry-confirm.test.js.
Nach dem Deploy prüfen: Entwurf mit Bestätigungen formulieren (DE + EN), Antwortformular, Übernahme.
Hinweis: Eigene KI-Mail-Mustertexte (falls schon angepasst) bekommen den Abschnitt {{#bestaetigen}} nicht automatisch.

### 7. Admin-Liste „Hotels“ (`/admin`, Route in `src/routes/admin.js`, View `views/admin/queue.ejs`): Suche + Filter
- Suchfeld „Name oder Ort“ (Parameter `q`): Name, Ort, Website; ohne Groß-/Kleinschreibung und Akzente
  (`unaccent` falls verfügbar, sonst `translate()`/ILIKE).
- Auswahl **Land** (`land`, ISO-Code, Anzeige als Ländername via `seo.countryName`) und **Region** (`region`, aus der
  Regionen-Verwaltung `/admin/regionen` – vorhandene Zuordnung Objekt↔Region prüfen) neben „alle Rankings“; nur
  vorkommende Werte, mit Anzahl.
- Kombinierbar mit den Status-Pillen; Pillen-Zahlen berücksichtigen Suche/Land/Region; Filter bleiben beim Wechsel erhalten.
- Leerer Treffer: „Keine Hotels gefunden“ + „Filter zurücksetzen“. GET-Formular (Lesezeichen möglich).

### 8. Verknüpfung Hotel ↔ Camp-Anbieter per Auswahl – umgesetzt (19.10.2026)
Camp-Formular: „Hotels im Ranking“ als Mehrfachauswahl mit Suche (public/js/combo.js, ohne JS normales Auswahlfeld),
„Weitere Hotels (nicht im Ranking)“ als freie Zeilen; Vorschläge für freie Zeilen zum Anhaken (nie automatisch).
Objektseite (Admin, Stammdaten): Karte „Camp-Anbieter in diesem …“ mit derselben Auswahl. Zeilen-IDs bleiben erhalten
(camps.saveProviderHotels / setEntityProviders), Audit-Log. Tests: test/camp-links.test.js.
Offen (klein): Reihenfolge der verknüpften Hotels folgt der Liste (alphabetisch), nicht der Klickreihenfolge.

### 8b. Camp-Anbieter automatisch qualifizieren – umgesetzt (20.10.2026, mit Daniel abgestimmt)
- Nur der Admin legt an (/admin/camps/neu: Name + Website), kein öffentliches Formular. Status draft (in Prüfung) → active | rejected.
- Job „camp-check“ (services/camp-check.js): Website lesen (extractor.fetchSite, externe Links je Seite), KI-Auswertung mit
  festem Schema und wörtlicher Fundstelle (Thema aus sites.camp_topic, Impressum, Kontakt, Typ, Sitz, Kurzprofil, Zielorte,
  Merkmale, Preise, Termine, Hotels). Regeln mit Ampel: Pflicht = Website, Thema, Impressum, Kontakt; Termine fehlen → gelb
  (kein Ausschluss); Preise/Zielorte nur Hinweis. „Nicht gefunden“ = gelb, nur Gegenbelege = rot.
- Hotels: gleicher Name → verknüpft (vorausgewählt), ähnlich → Vorschlag, unbekannt → Hotel-Meldung (Website vom Anbieter-Link,
  sonst OpenStreetMap, sonst ohne); nach Freigabe/Dublette automatisch verknüpft (submissions.linkCampHotels).
- Admin: Prüfbericht oben im Anbieter-Formular, Freigeben/Ablehnen/Erneut prüfen, Ampel in der Liste, Board-Karte „Camp-Anbieter prüfen“.
- Migration 045, Tests test/camp-check.test.js. Offen: jährliche Nachprüfung aktiver Anbieter als Board-Aufgabe.

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

### 10. Hotelseite „Buchen & Anfragen“ (Konzept vom 19.10.2026, von Daniel bestätigt)
Reihenfolge: a) Direktbuchung → b) Hotel-Anfrage → c) Tripadvisor.
- **a) Direktbuchung neu anordnen** (bestehende Technik `partner_programs`/`entity_links`, `/go/:slug/:program`):
  Box „Buchen & Anfragen“ rechts (Handy: schmale feste Leiste unten mit „Preise prüfen“ + „Anfragen“).
  Ein Hauptknopf „Preise prüfen“ → im Admin festgelegter Standard-Anbieter (voraussichtlich Booking);
  darunter schlichte Textzeile „Auch bei: Expedia · Hotels.com · HolidayCheck · direkt beim Hotel“ – keine Logo-Knöpfe.
  „Direkt beim Hotel“ (ohne Provision) immer dabei. Kennzeichnung „Anzeige“ bleibt; Reihenfolge der Anbieter legt
  der Admin fest, nie Einfluss auf Score/Sortierung. Expedia + Hotels.com = ein Programm (Expedia Group).
- **b) „Trainingslager anfragen“ beim Hotel**: Formular (Vorname, E-Mail, Zeitraum, Gruppengröße, Bedarf z. B.
  Bahnzeiten/Radgarage, Nachricht, Einwilligung mit Hotelnamen) → E-Mail-Bestätigung → Admin-Prüfung → Weiterleitung an
  `entities.contact_email` mit Reply-To. Aufbauend auf `camp_leads`/`services/leads.js` (verallgemeinern: Ziel Hotel oder
  Camp-Anbieter). Start kostenlos für alle Hotels mit Kontaktadresse; später Baustein für Premium-Partner. Kein WhatsApp.
  Plausible-Ziel „Hotel-Anfrage“.
- **c) Tripadvisor**: nur Note (Bubbles), Anzahl und Link „Alle Bewertungen auf Tripadvisor“ im Abschnitt
  „Bewertungen anderswo“ (zusammen mit Google), getrennt von eigenen Athleten-Bewertungen, nie im Score.
  Quelle: Tripadvisor Content API – vorher aktuelle Bedingungen prüfen (Freischaltung, Logo-/Darstellungsvorgaben,
  Zwischenspeicherung). Ohne API: einfacher (ggf. Partner-)Link.

### 11. Offene Punkte aus dem 19.10.2026 (Stand: am 19.10. abends durchgegangen)
Erledigt:
- Robinson Club Fleesensee und Hotel BCL Podium (beide nur ins Log „versendet“) per SQL auf **Entwurf** zurückgesetzt
  (Text behalten, Hinweis im Feld `error`, Eintrag `reset_inquiry_to_draft` in admin_actions) → **Daniel: prüfen und neu freigeben.**
  Die übrigen Mails mit `provider_id = 'console'` gingen nur an eigene Adressen/Tests – nichts zu tun.
- Vorschläge ohne Knopf: keine Meldung mehr im Status „eingegangen“ – nichts zu tun.
- PM2 im Cluster-Modus (1 Instanz), `pm2 reload` getestet: 60/60 Anfragen ohne Fehler während des Reloads.
- ufw-Regel 5678 war bereits entfernt (nur 22/80/443); n8n lauscht auf 127.0.0.1.
- Erinnerung Off-Site-Backup 04.01.2027 auf dem neuen Mac angelegt (geplante Aufgabe „offsite-backup-erinnerung“).
  → Daniel: alte Erinnerung auf dem Firmen-Mac löschen.

Offen:
- **Tauern Spa Kaprun**: Adresse office@tauernspakaprun.com ist richtig (steht so auf der Website). Abgelehnt hat der
  Spamfilter des Empfängers (Cisco IronPort, `550 5.7.1` – Absender abgewiesen), vermutlich wegen der jungen Domain;
  SPF, DKIM (s1/s2-ionos) und DMARC sind korrekt. Entwurf liegen lassen, **Anfang November erneut senden**.
- **Partnerprogramme** (Daniel): nach Freigabe Awin-Publisher-ID + Programm-ID für HolidayCheck eintragen
  (Partnerprogramme → „HolidayCheck“); Booking-Bewerbung, sobald Search Console erste indexierte Seiten zeigt;
  Expedia Group bewerben.
- **Daniel**: Ausfallüberwachung (UptimeRobot), Plausible-Ziel „Hotelvergleich“ + Eigenschaften `anbieter`/`art`,
  Gewerbeanmeldung vor Provisionen.
- **triprep**: Branch `pwa-nutrition` (Commit 16adf7a, PWA + Nutrition Logs, ändert server.js) nur gesichert –
  vor Übernahme mit Daniel prüfen.

Zur Info – Server-Konfiguration (nur `.env`, nicht im Repo): `MAIL_PROVIDER=smtp` über info@tri-hotel.de (IONOS),
`MAIL_INBOUND=imap`, `NOINDEX=false`; Site-Absender `info@tri-hotel.de`. Search Console bestätigt, Sitemap eingereicht.

### 12. Deploy
`git pull && npm run migrate && npm test && pm2 reload tri-hotel`; danach /admin/emails, /admin/emails/ki/inquiry,
/admin/sites/<id> aufrufen und einen Entwurf formulieren.

