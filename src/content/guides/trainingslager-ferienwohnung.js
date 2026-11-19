// Inhalte des Ratgebers „Trainingslager in der Ferienwohnung“, die Vorlage und JSON-LD gemeinsam nutzen (FAQ).
// Quelle: docs/ratgeber-trainingslager-ferienwohnung-vorlage.md (Stand der Recherche 10.11.2026). Nur Antworten ohne [PRÜFEN]:
// Frage 4 der Vorlage („Wo kann ich auf Mallorca 50 Meter schwimmen?“) fehlt, bis Son Hugo (Status 2026) und die
// 25-m-Bäder im Norden geprüft sind. Antworten in lib/richtext-Schreibweise; im FAQPage-Schema steht der reine Text.

const SRC = {
  wahoo: 'https://www.wahoofitness.com/blog/?p=6324',
  trainingpeaks: 'https://trainingpeaks.com/blog/how-to-build-a-successful-diy-training-camp',
  t220: 'https://www.220triathlon.com/training/long-distance/triathlon-training-camp-tips',
  rennrad: 'https://www.radsport-rennrad.de/training/trainingslager-triathlon-tipps-training/',
  cls: 'https://clublasanta.com/app/webroot/uploads/pages/practical/annual-pass/precios-e-info-uk_2025.pdf',
  velomotion: 'https://velomotion.net/2026/06/fahrradtransport-im-flieger/',
  huerzeler: 'https://www.huerzeler.com/application/files/8617/7064/4295/Preise_Leistungen_und_Informationen_Balearen_Radreise_2026.pdf',
  mm: 'https://www.mallorcamagazin.com/nachrichten/gesellschaft/2026/02/18/148397/profi-johann-ackermann-verrat-warum-mallorca-das-schwimm-mekka-fur-ironmen-und-champions-ist.html',
  bettbike: 'https://www.idm-suedtirol.com/fileadmin/user_upload/content/Tourismus/Bett_Bike/Ferienwohnungen/ferienwohnungen_kriterien_checklist_DE.pdf',
};

const faq = [
  { q: 'Wie lange sollte ein selbst organisiertes Trainingslager dauern?',
    a: `Typisch sind etwa 7 Tage. 3-Tage-Camps funktionieren auch, brauchen aber einen strafferen Plan ([Wahoo](${SRC.wahoo})). Eine bewährte Struktur sind zwei 3-Tage-Blöcke mit einem Ruhetag dazwischen ([TrainingPeaks](${SRC.trainingpeaks})).` },
  { q: 'Wann ist der beste Zeitpunkt für ein Trainingslager?',
    a: `Entweder vor der Saison für die Grundlagenausdauer oder 4 bis 6 Wochen vor dem Hauptwettkampf ([Wahoo](${SRC.wahoo}); [TrainingPeaks](${SRC.trainingpeaks})).` },
  { q: 'Ferienwohnung oder Hotel – was ist besser fürs Trainingslager?',
    a: `Die Ferienwohnung bietet Flexibilität, Privatsphäre, Kontrolle über die Ernährung und in Gruppen oft geringere Kosten. Hotels und Camps bieten Bad, Radgarage, Coaching und weniger Aufwand. Ein Camp hilft außerdem bei der Disziplin ([220 Triathlon](${SRC.t220})).` },
  { q: 'Kann ich als Gast einer Ferienwohnung im Club La Santa schwimmen?',
    a: `Praktisch nein. Externe bekommen keine Tages- oder Monatspässe, nur Jahrespässe ab 600 € (Stand 2025) ([Club La Santa](${SRC.cls})).` },
  { q: 'Rad mitnehmen oder vor Ort mieten?',
    a: `Die Radgebühr der Airlines liegt online bei etwa 45 bis 90 € pro Strecke, Stand Juni 2026 ([Velomotion](${SRC.velomotion})). Ein hochwertiges Leihrad zur Balearen-Radreise von Hürzeler kostet 164 bis 225 € ([Hürzeler, 2026](${SRC.huerzeler})). Für kurze Camps ist das Leihrad oft entspannter, für lange Camps oder das Zeitfahrrad eher das eigene Rad.` },
  { q: 'Brauche ich auf Mallorca einen Neoprenanzug zum Freiwasserschwimmen?',
    a: `Von etwa November bis April/Mai ja, denn unter 20 °C wird ein Schwimm-Neo empfohlen. Eine Schwimmboje macht dich für Boote sichtbar ([Mallorca Magazin](${SRC.mm})).` },
  { q: 'Worauf muss ich bei der Ferienwohnung als Triathlet achten?',
    a: `Auf einen abschließbaren Radraum innen, eine Trockenmöglichkeit oder Waschmaschine, eine gut ausgestattete Küche, die Nähe zum Bad und zu den Routen sowie WLAN. Als Maßstab dienen die Bett+Bike-Kriterien für Ferienwohnungen ([IDM Südtirol / Bett+Bike](${SRC.bettbike})).` },
  { q: 'Wie ernähre ich mich im Trainingslager richtig?',
    a: `Mindestens 3 vollwertige Mahlzeiten mit Kohlenhydraten, Protein und Gemüse, keine Diät ([RennRad](${SRC.rennrad})). Auf dem Rad etwa alle 20 Minuten essen ([220 Triathlon](${SRC.t220})).` },
  { q: 'Wie viel mehr sollte ich im Trainingslager trainieren?',
    a: `Eine allgemeingültige Stundenzahl gibt es nicht. TrainingPeaks orientiert sich am Durchschnitt der letzten 4 Wochen ([TrainingPeaks](${SRC.trainingpeaks})). Ein Sprung von 8 bis 10 auf 25 bis 30 Stunden pro Woche kann wochenlange Müdigkeit kosten ([220 Triathlon](${SRC.t220})).` },
];

module.exports = { faq };
