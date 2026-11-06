# StayAPI – Vorschlag für tri-hotel und fitnessracing-hotel

**Entscheidung Daniel, 06.11.2026: kein Einsatz.** Der Nutzen wäre im Kern nur die schnellere Zuordnung von Partnerlinks, das Risiko dafür zu hoch.

Stand 06.11.2026. Geprüft wurden Website, Dokumentation, Nutzungsbedingungen und Datenschutzerklärung.
Die API selbst ist noch nicht aufgerufen, dafür fehlt ein Konto.

## Empfehlung

**Kein Abo und keine öffentliche Anzeige von StayAPI-Daten.** Sinnvoll ist höchstens ein kostenloser Test für einen einzigen Zweck:
die interne Zuordnung unserer Hotels zu Portal-Adressen (Expedia, Tripadvisor), damit die Aufgaben „Partnerlink prüfen“ schneller
gehen. Klappt das, reicht ein einzelner Monat für 49 US-Dollar.

Der Hauptgrund: StayAPI liefert Daten aus öffentlichen Portalseiten, gibt dafür aber keine Rechte weiter. Das Risiko liegt bei uns,
und wir sind bei denselben Portalen Affiliate-Partner. Unsere eigene Regel lautet außerdem: kein Scraping von Expedia und Hotels.com.
Ob sie auch für einen Dienstleister gilt, musst du entscheiden (siehe unten).

Für fitnessracing-hotel.de lohnt es sich derzeit nicht: Die entscheidenden Angaben (Stationen, Geräte, Trainings-Gym) stehen dort
nicht, und das Ranking ist noch im Entwurf.

## Was StayAPI ist

- **Betreiber:** Botster PTE LTD, Singapur. Es gilt singapurisches Recht, Streitfälle gehen vor ein Schiedsgericht in Singapur (SIAC).
- **Angebot:** Eine REST-API und ein MCP-Server für Hotel-, Bewertungs- und Preisdaten, die laut Bedingungen bei Bedarf von Drittquellen abgefragt werden.
- **Quellen:** unter anderem Booking.com, Expedia, Hotels.com, Agoda, Trip.com, Tripadvisor, Airbnb, VRBO, Google Hotels, HolidayCheck, KAYAK und große Hotelketten.
- **Daten je Quelle unterschiedlich:** Suche und Zuordnung, Hoteldetails, Ausstattung, Fotos, Bewertungen und Noten, Preise und Verfügbarkeit.
- **Zuordnung (Meta Search):** Aus Name und Ort kommen die Adressen bei Booking.com, Expedia, Hotels.com, Agoda, Tripadvisor, KAYAK und Priceline, bei großen Ketten und die offizielle Website. **trivago, hotel.de und CHECK24 fehlen dort**, HolidayCheck hat einen eigenen Endpunkt.
- **Herkunft der Daten:** Die Website schweigt dazu. Die Bedingungen sprechen von automatischer Abfrage öffentlich zugänglicher Inhalte ohne Login und von keiner Garantie, dass die Quellen das dauerhaft erlauben. Eine offizielle Partnerschaft wird nirgends genannt.

## Preise

| Tarif | Preis je Monat | Anfragen je Monat | Anmerkung |
|---|---|---|---|
| Free | 0 US-Dollar | 50 einmalig | ohne Kreditkarte, alle Endpunkte |
| Basic | 49 US-Dollar | 1.500 | ungenutzte Anfragen werden übertragen |
| Startup | 149 US-Dollar | 10.000 oder 25.000 | die Seite nennt beide Zahlen, ist unklar |
| Scale | 450 US-Dollar | 100.000 | |

Die Startseite spricht dagegen von Abrechnung je Hotel und Preisen nur im Gespräch; vor einem Kauf ist das zu klären. Auch eine
Anfrage ohne Treffer zählt. Überschreitungspreise stehen nicht auf der Preisseite. Abos sind laut Bedingungen zum Ende des
Abrechnungszeitraums kündbar.

## Mögliche Nutzung, bewertet

| Einsatz | Nutzen für uns | Rechtliches Risiko | Vorschlag |
|---|---|---|---|
| Portal-Adressen intern zuordnen, Admin prüft | mittel: Expedia hat 44 Links bei 68 Live-Hotels; Tripadvisor und Booking.com haben keine; Hotels.com übernimmt die Nummer von Expedia | gering: nur Adressen und Nummern | **Kostenlos testen** |
| Offizielle Website finden | gering: unsere neue Suche findet sie schon für etwa 7 Cent je Websuche | gering | nur im selben Test mit vergleichen |
| Ausstattung als Vorschlag für Fakten | gering: allgemeine Angaben ohne Trainingsbezug, wir lesen ohnehin die Website des Hotels | mittel: Inhalt aus dem Portal als Quelle | nein |
| Note von Portalen öffentlich zeigen | hoch für Leser | hoch: keine Rechte, Risiko beim Kunden | nein, offizielle Wege prüfen |
| Live-Preise öffentlich zeigen | hoch für Klicks | hoch: Portale sind zugleich unsere Partner; Preisangaben müssen stimmen | nein, offizielle Wege prüfen |
| Bewertungstexte zeigen | gering: V2 setzt auf eigene Bewertungen | hoch: Urheberrecht und Namen der Bewerter | nein |
| Fotos | gering | hoch: Regel „keine Fotos von fremden Websites“ | nein |
| Marktanalyse oder Preisbeobachtung nur intern | offen, derzeit kein Bedarf | mittel | zurückstellen |

## Was gegen eine öffentliche Nutzung spricht

- **Keine Rechte an den Inhalten:** StayAPI lizenziert nur, was es selbst besitzt, und erteilt für Material Dritter ausdrücklich keine Lizenz. Für die Einhaltung von Gesetzen und Bedingungen Dritter ist der Kunde verantwortlich, und er stellt StayAPI von Ansprüchen frei.
- **Booking.com verbietet das Abgreifen:** Eine ältere Fassung der Booking-Bedingungen (Stand Juli 2026, über einen Drittdienst gelesen) untersagt Scraping für kommerzielle Zwecke ohne schriftliche Erlaubnis. Die aktuelle Fassung ist noch zu prüfen.
- **Partnerverträge:** Expedia, Hotels.com und FeWo-direkt laufen bei uns über CJ. Ob deren Sonderbedingungen Daten aus Drittquellen ausschließen, konnte ich öffentlich nicht klären. Die Bedingungen liegen in deinem CJ-Konto.
- **Dienst kann jederzeit enden:** StayAPI darf Konten ohne Grund und Vorankündigung sperren, gibt keine Gewähr, und die Haftung ist auf die Zahlungen von zwölf Monaten begrenzt. Eine öffentliche Funktion wäre davon abhängig.
- **Neutralität:** Noten oder Preise von Portalen dürften weder Score noch Reihenfolge berühren. Das wäre lösbar, müsste aber auf jeder Seite klar getrennt sein.
- **Datenschutz:** Bewertungsdaten enthalten Namen, dafür wären wir laut Bedingungen selbst verantwortlich. Die Datenschutzerklärung nennt keinen EU-Vertreter und keinen Serverstandort. Beim reinen Abgleich fließen nur Hotelnamen und Orte, also keine Personendaten.

## Offizielle Wege für Noten und Preise

Angaben aus öffentlichen Unterlagen, teils aus Drittquellen. Vor einer Umsetzung sind sie einzeln zu prüfen.

- **Tripadvisor:** Es gibt eine Content API mit Regeln zur Anzeige: Bewertungsgrafiken und Logos kommen direkt von Tripadvisor und dürfen nicht lokal gespeichert werden. Eine Drittquelle meldet die Ablösung durch eine neue API (Terra). Der Punkt steht schon im Backlog.
- **Booking.com:** Die Demand API setzt den Status „Managed Affiliate Partner“ voraus, also mehr als eine normale Anmeldung.
- **Expedia:** Die Rapid API wird offenbar nur nach einer Prüfung freigegeben. Am schnellsten klärst du das über die Kontaktadresse des Programm-Teams bei CJ.
- **Google:** Unser Places-Schlüssel ist vorhanden. Ob wir Noten live und mit Quellenangabe anzeigen dürfen, ist noch zu prüfen. Speichern dürften wir sie nicht.

## fitnessracing-hotel.de

- **Stand:** Das Ranking ist im Entwurf, mit einem Live-Hotel und einem weiteren Eintrag.
- **Was fehlt:** Es zählen Stationen, Geräte und die Lage des Trainings-Gyms. Portale liefern dazu höchstens allgemeine Angaben wie „Fitnessraum“; der Umfang hängt stark vom Hotel ab.
- **Möglicher späterer Nutzen:** Eine erste Kandidatenliste über Hotelsuche und Ausstattung. Die Fakten kämen weiter von Hotels und Gyms. Das lässt sich entscheiden, sobald das Ranking aktiviert wird.

## Vorschlag für den Test

1. **Vorab:** Du klärst die offenen Punkte unten. Ohne deine Zustimmung passiert nichts.
2. **Konto:** Du legst das kostenlose Konto an und trägst den Schlüssel selbst verdeckt in die Server-`.env` ein. Ich gebe dir den Befehl dafür.
3. **Testlauf mit den 50 kostenlosen Anfragen:** Ich rufe nur Meta Search auf: 25 Hotels, deren Expedia-Link wir schon kennen, als Gegenprobe, und 25 ohne Link. Dabei fällt die offizielle Website als Vergleich mit an. Es wird nichts öffentlich angezeigt und nichts automatisch gespeichert.
4. **Auswertung:** Ich melde dir Trefferquote und Fehler. Die Links testest du selbst, da wir Affiliate-Links nicht automatisch anklicken.
5. **Erfolgsmaßstab:** Mindestens 90 % richtige Zuordnung bei der Gegenprobe und spürbar weniger Handarbeit bei den Aufgaben „Partnerlink prüfen“.
6. **Nur bei Erfolg:** Einen Monat Basic für 49 US-Dollar, Vorschläge für alle Hotels ins Admin holen, du bestätigst sie, dann kündigen. Einmalige Kosten also etwa 49 US-Dollar plus eine kleine Erweiterung im Admin.

## Deine Entscheidungen

- [ ] Gilt „kein Scraping von Expedia und Hotels.com“ auch für Daten, die ein Dienstleister wie StayAPI beschafft? Falls ja, entfällt Expedia aus dem Test und der Nutzen sinkt deutlich. Dann würde ich StayAPI ganz lassen.
- [ ] Erlauben die CJ-Bedingungen von Expedia, Hotels.com und FeWo-direkt das? Bitte dort nachsehen oder beim Programm-Team nachfragen.
- [ ] Kostenlosen Test machen: ja oder nein?
- [ ] Unabhängig davon: Sollen wir offizielle Wege für Noten und Preise prüfen, zuerst Tripadvisor und Google?

## Grenzen dieser Prüfung

- Datenqualität und Trefferquote sind ungetestet.
- Unabhängige Erfahrungsberichte zu StayAPI habe ich nicht gefunden. Fast alle Angaben stammen vom Anbieter.
- Dies ist keine Rechtsberatung. Vor einer öffentlichen Nutzung gehört das in die rechtliche Prüfung.

## Quellen

- [StayAPI Startseite](https://stayapi.com), [Entwicklerseite mit Preisen](https://stayapi.com/developers), [Dokumentation](https://stayapi.com/docs), [Meta Search](https://stayapi.com/docs/endpoints/meta-search), [Booking-Ausstattung](https://stayapi.com/docs/endpoints/booking/hotel-facilities)
- [Nutzungsbedingungen, Stand 07.09.2026](https://stayapi.com/terms), [Datenschutzerklärung](https://stayapi.com/privacy), [Blogartikel zu Bewertungen](https://stayapi.com/blog/hotel-reviews-api)
- [Booking-Klausel bei ConductAtlas (Drittdienst)](https://conductatlas.com/platform/bookingcom/bookingcom-terms-and-conditions/provision/CA-P-076745/previous-terms-intellectual-property-copying-requires-written-permission/), [Booking Demand API: Voraussetzungen](https://developers.booking.com/demand/docs/getting-started/prerequisites)
- [Tripadvisor: Anzeigeregeln](https://tripadvisor-content-api.readme.io/reference/display-requirements), [Tripadvisor: API Master Terms](https://docs.terra.tripadvisor.com/docs/api-master-terms), [Expedia Rapid: Überblick eines Drittanbieters](https://www.zentrumhub.com/blog/expedia-hotel-api-integration-guide/)
- Eigene Zahlen: Admin-Datenbank tri-hotel, 06.11.2026
