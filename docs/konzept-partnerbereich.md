# Konzept: Partnerbereich für tri-hotel.de und fitnessracing-hotel.de

Von Daniel am 06.11.2026 in den Backlog gegeben. Wortlaut unverändert; Stand der Prüfung und Abgleich mit bisherigen Entscheidungen: `BACKLOG.md`, Abschnitt „Partnerbereich“.

## 1. Ziel und Ausgangslage

Für beide Portale soll ein gemeinsamer Partnerbereich entstehen, über den Hotels und Camp-Anbieter Leistungen buchen, eigene Affiliate-Links erhalten und später ihr Profil selbst verwalten können. Der Aufbau erfolgt stufenweise: Zu Beginn ohne Login als reine Angebots- und Anfrageseite, später als vollwertiges Partner-Portal mit Login.

Grundsatz: Die Rankings beider Portale bleiben neutral. Bezahlte Leistungen beeinflussen niemals den Score, sondern nur Sichtbarkeit, Darstellung und Zusatzservices. Das wird im Partnerbereich transparent kommuniziert.

## 2. Zielgruppen

- Hotels (Triathlon- bzw. Fitness-Racing-geeignete Unterkünfte)
- Camp-Anbieter (Trainingscamp-Veranstalter, Reiseanbieter, Coaches)
- Perspektivisch: Ausrüster/Marken und Event-Veranstalter

Ein Partner kann auf einem oder beiden Portalen gelistet sein. Das Partnerkonto ist portalübergreifend.

## 3. Leistungsangebot (Produktkatalog)

### 3.1 Basisprofil (kostenlos)

- Eintrag im Ranking, sofern Kriterien erfüllt
- Grunddaten: Name, Ort, Kontakt, Bilder, Ausstattung
- Hotel-Badge erst ab 20 Bewertungen

### 3.2 Spezialbericht / Analysebericht (kaufbar)

- Individueller Bericht zum eigenen Haus bzw. Camp: Score-Aufschlüsselung, Stärken und Schwächen nach Kriterien, Vergleich mit Wettbewerbern in der Region, Bewertungsauswertung, konkrete Verbesserungsvorschläge
- Varianten: Kurzreport und ausführlicher Report, optional jährliches Update
- Lieferung als PDF, später zusätzlich im Login-Bereich abrufbar

### 3.3 Eigener Affiliate-Link für Hotels

- Partner erhält einen individuellen Tracking-Link bzw. Code
- Zweck: Partner verlinkt sein Ranking-Profil oder Badge auf der eigenen Website; Buchungen bzw. Anfragen über das Portal werden zugeordnet
- Provisionsmodell (je nach Ausgestaltung): Portal erhält Provision pro Buchung/Lead oder Partner erhält Vergütung für vermittelte Nutzer

### 3.4 Eigener Affiliate-Link für Camp-Anbieter

- Analog zu Hotels, aber mit Camp-spezifischen Parametern (Camp-Termin, Teilnehmerzahl)
- Möglichkeit, Camps mit Partnerhotels zu verknüpfen

### 3.5 Weitere kaufbare Angebote (Ideen)

- Premium-Profil: mehr Bilder, Video, Angebotsbox, hervorgehobene Darstellung (klar als "Premium" gekennzeichnet)
- Badge-Paket: offizielles Siegel als Grafik für Website und Print
- Featured Placement: Platzierung in Ratgeberartikeln oder Regionsseiten als gekennzeichnete Anzeige
- Newsletter-Feature: Vorstellung im Newsletter
- Camp-Termin-Listing: Camp-Termine im Kalender veröffentlichen
- Lead-Paket: Weiterleitung qualifizierter Gruppenanfragen (Vereine, Teams)
- Content-Paket: professioneller Profiltext oder Interview-Artikel

### 3.6 Produktkatalog und Einstiegspreise

Die Preise sind Einstiegspreise und werden am Markt getestet.

| Produkt | Inhalt | Preis |
|---|---|---|
| Basisprofil | Eintrag im Ranking, Grunddaten | kostenlos |
| Premium-Profil | Mehr Bilder, Video, Angebotsbox, hervorgehobene Darstellung | ca. 290 € / Jahr |
| Kurzbericht | Score-Analyse, Regionsvergleich | ca. 149 € einmalig |
| Ausführlicher Bericht | Vollanalyse, Verbesserungsplan, Gespräch | ca. 449 € einmalig |
| Badge-Paket | Siegel für Website und Print, erst ab 20 Bewertungen | 99 € / Jahr |
| Camp-Termin-Listing | Camp-Termine im Kalender | 49 € pro Camp oder 199 € / Jahr Flatrate |
| Affiliate Hotels und Camps | Eigener Tracking-Link bzw. Code | kostenlos; Portal erhält 5–8 % Provision oder 15–25 € pro Lead |
| Featured Placement | Gekennzeichnete Anzeige in Ratgeber oder Regionsseite | ca. 150 € / Monat |
| Newsletter-Feature | Vorstellung im Newsletter | ca. 120 € pro Ausgabe |
| Bundle (Hauptprodukt) | Premium-Profil, Badge-Paket und Kurzbericht | ca. 449 € / Jahr |

## 4. Ausbaustufen

### Phase 1: Partnerseite ohne Login (MVP)

- Öffentliche Seite "Für Partner" auf beiden Portalen
- Darstellung aller Angebote mit Beschreibung und Preisen bzw. "Preis auf Anfrage"
- Anfrage- bzw. Bestellformular pro Angebot (Name, Unternehmen, Portal, gewünschtes Produkt, Nachricht)
- Formular sendet E-Mail an Daniel und speichert Anfrage in einer einfachen Tabelle/Datenbank
- Abwicklung (Rechnung, Bericht, Affiliate-Link) erfolgt manuell
- Optional: direkte Bezahlung einfacher Produkte über Stripe Payment Links

### Phase 2: Halbautomatisierung

- Stripe Checkout für Standardprodukte (Bericht, Badge-Paket)
- Automatische Generierung eines Affiliate-Codes nach Freischaltung
- Einfaches Admin-Board zur Verwaltung von Anfragen, Partnern und Bestellungen (kann ins bestehende Admin-Board von danielreuland.com integriert werden)
- Profil-Änderungsanfragen per Formular, Freigabe durch Admin

### Phase 3: Partner-Portal mit Login

- Registrierung und Login (E-Mail + Passwort oder Magic Link)
- Claim-Prozess: Partner beansprucht bestehenden Eintrag, Verifizierung per E-Mail an Hoteldomain oder manuelle Prüfung
- Dashboard mit Kennzahlen: Profilaufrufe, Klicks, Affiliate-Conversions, Bewertungen
- Profilverwaltung: Texte, Bilder, Ausstattung, Kontakt, Camp-Termine; Änderungen gehen in eine Freigabe-Warteschlange
- Shop: Produkte direkt buchen, Rechnungen herunterladen, gekaufte Berichte abrufen
- Affiliate-Bereich: Links/Codes, Statistiken, Auszahlungen bzw. Abrechnungen
- Mehrere Nutzer pro Partner (z. B. Hotelleitung und Marketing)

## 5. Funktionale Anforderungen für die Entwicklung

### 5.1 Datenmodell (Kernentitäten)

- Partner: id, Typ (Hotel, Camp-Anbieter, Marke), Firmenname, Kontakt, Rechnungsdaten, Status (Interessent, aktiv, inaktiv)
- Listing: id, partner_id, Portal (tri-hotel, fitnessracing-hotel), Verweis auf bestehenden Hotel/Camp-Eintrag, claimed (ja/nein)
- User: id, partner_id, E-Mail, Rolle (Owner, Editor), Login-Daten (ab Phase 3)
- Produkt: id, Name, Portal(e), Partnertyp, Preis, Laufzeit, Typ (einmalig, Abo)
- Bestellung/Anfrage: id, partner_id, produkt_id, Status (angefragt, bezahlt, in Arbeit, geliefert), Datum
- Affiliate: id, partner_id, Code, Ziel-URL, Provisionsmodell
- Tracking-Event: affiliate_id, Typ (Klick, Lead, Buchung), Zeitstempel, Referrer
- Änderungsantrag: listing_id, Feld, alter/neuer Wert, Status (offen, freigegeben, abgelehnt)

### 5.2 Rollen

- Admin (Daniel): alles verwalten, Freigaben, Produkte pflegen
- Partner-Owner: Profil, Nutzer, Bestellungen, Affiliate
- Partner-Editor: nur Profilpflege

### 5.3 Wichtige Regeln

- Bezahlte Leistungen haben keinen Einfluss auf Score und Ranking
- Anzeigen und Premium-Darstellungen werden sichtbar gekennzeichnet
- Profiländerungen werden vor Veröffentlichung geprüft
- Bewertungen können vom Partner nicht gelöscht, nur kommentiert werden (Antwortfunktion, Phase 3)

### 5.4 Technische Leitplanken

- Eine gemeinsame Codebasis bzw. ein gemeinsames Backend für beide Portale, mandantenfähig über das Feld "Portal"
- Design im gemeinsamen CI, jeweils mit Portal-Branding
- Zahlungen über Stripe (Checkout, Rechnungen, später Abos)
- Affiliate-Tracking über eigene Redirect-URLs mit Code-Parameter und Cookie, DSGVO-konform mit Consent
- Auth z. B. über Supabase Auth, Auth.js oder vergleichbar
- E-Mail-Benachrichtigungen für neue Anfragen, Bestellungen und Freigaben

## 6. Rechtliches und Organisatorisches

- AGB für Partnerleistungen und Affiliate-Programm
- Datenschutzerklärung erweitern (Tracking, Partnerkonten)
- Kennzeichnungspflicht für Werbung beachten
- Auftragsverarbeitung prüfen (Stripe, Hosting, Auth-Dienst)
- Steuerliche Behandlung der Einnahmen klären

## 7. Offene Entscheidungen

- Preise der einzelnen Produkte
- Provisionsmodell für Affiliates: Portal verdient am Partner oder Partner verdient am Portal
- Abo-Modell (jährliches Premium) oder Einzelkäufe
- Verifizierungsprozess beim Claim
- Zeitpunkt für Phase 3 (z. B. ab einer bestimmten Partnerzahl)

## 8. Nächste Schritte

1. Produktkatalog und Preise festlegen
2. Partnerseite mit Anfrageformular auf beiden Portalen umsetzen (Phase 1)
3. Beispielbericht als Muster-PDF erstellen
4. Erste Partner gezielt ansprechen und Feedback einholen
5. Datenmodell technisch anlegen, damit Phase 2 und 3 ohne Umbau folgen können
