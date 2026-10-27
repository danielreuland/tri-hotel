-- Redaktionstexte der Regionsseiten (Stand 27.10.2026). Zahlen zu Klima und Wasser gerundet aus region_climate_monthly
-- (Open-Meteo, Mittel der letzten drei Jahre); die Seite zeigt die genauen Werte in der Tabelle. Bestehende Texte werden
-- überschrieben – Änderungen an den Texten nur über neue Migrationen.
INSERT INTO region_texts (region_id, summary, body, compare_slug, compare_text, updated_at)
SELECT r.id, v.summary, v.body, v.compare_slug, v.compare_text, now()
  FROM regions r JOIN (VALUES

('mallorca',
$s$Mallorca: Tramuntana-Pässe, flache Ebenen und die Bucht von Alcúdia – das klassische Ziel fürs Triathlon-Trainingslager im Frühjahr und Herbst.$s$,
$b$Mallorca ist das klassische Ziel fürs Triathlon-Trainingslager im Frühjahr: flache Grundlagenrunden in der Ebene, lange Anstiege in der Serra de Tramuntana und geschützte Buchten fürs Freiwasser – dazu so viele Trainingshotels, Radverleihe und Camps wie kaum anderswo in Europa.

Die Kehrseite: Von März bis Mai teilst du dir die Straßen mit Tausenden Radfahrern, und das Meer ist im Frühjahr mit 15 bis 17 °C noch kühl. Wer Einsamkeit sucht, kommt besser im Herbst.

## Landschaft und Charakter

Mallorca ist zweigeteilt: Im Nordwesten zieht sich die Serra de Tramuntana über die ganze Insel, ein Kalksteingebirge mit dem Puig Major (1.445 m) als höchstem Gipfel und seit 2011 Weltkulturerbe der UNESCO. Davor liegt Es Pla, die weite Ebene im Inselinneren mit Mandel- und Olivenhainen, kleinen Dörfern und schmalen Landstraßen. Im Norden öffnen sich die Buchten von Pollença und Alcúdia, im Osten wechseln felsige Küstenabschnitte mit kleinen Calas. Kaum eine Region bietet auf so kurzer Distanz so viel Abwechslung – und eine so eingespielte Infrastruktur für Ausdauersportler.

## Klima und beste Reisezeit

Die Hauptsaison für Trainingslager sind März bis Mai und September bis November. Im März liegen die Tageshöchstwerte um 18 °C, im April um 20 °C, im Mai um 23 °C; im Oktober sind es noch rund 25 °C. Juli und August sind mit gut 30 °C zum Trainieren zu heiß. Im Frühjahr gibt es immer wieder Regentage und im Gebirge kann es deutlich kühler und windiger sein als an der Küste – eine Windweste gehört ins Gepäck.

## Radfahren

Der Ruf der Insel kommt vom Rad. Die Ebene eignet sich für Grundlagenkilometer auf ruhigen Nebenstraßen, die Tramuntana für lange Anstiege: zum Kloster Lluc, über den Coll de Sóller oder hinunter nach Sa Calobra, dessen Serpentinenstraße mit dem „Krawattenknoten“ als Rückweg zur Pflichtübung gehört. Die Straße zum Cap de Formentor ist landschaftlich spektakulär, im Frühjahr aber stark befahren. Kürzere Anstiege wie der Puig de Randa mit seinem Kloster liegen mitten in der Ebene. Rennradverleih und Werkstätten gibt es in allen größeren Orten.

## Schwimmen

Für das Freiwasser bieten sich die flachen, geschützten Buchten im Norden an, etwa vor Playa de Muro und Port d'Alcúdia. Das Meer ist im Frühjahr mit 15 bis 17 °C noch kühl, ein Neoprenanzug ist bis in den Mai Pflicht. Ab Juni steigt die Temperatur über 20 °C. Viele Trainingshotels haben 25-m-Becken, einige reservieren Bahnen für Sportler; öffentliche 50-m-Becken sind rar.

## Laufen

Flache Strecken findest du an den langen Strandpromenaden zwischen Port d'Alcúdia und Can Picafort sowie an der Playa de Palma. Abseits des Asphalts bietet der Naturpark S'Albufera ebene Wege, für Bergläufe lockt die Tramuntana mit gut ausgeschilderten Wanderwegen.

## Anreise und Radtransport

Ziel ist der Flughafen Palma, aus Deutschland etwa zwei bis zweieinhalb Stunden. Der Transfer an die Nordostküste um Alcúdia dauert rund eine Stunde, an die Playa de Palma wenige Minuten. Wer kein eigenes Rad mitnehmen will, findet ein großes Angebot an Leihrädern; das eigene Rad meldest du frühzeitig als Sportgepäck bei der Airline an.

## Ruhetag

Palma lohnt mit der Kathedrale La Seu und der Altstadt einen halben Tag. Mit dem historischen Zug geht es von Palma nach Sóller, in die Dörfer Valldemossa und Deià fährst du am besten mit dem Bus. An der Ostküste locken die Tropfsteinhöhlen Coves del Drac.

## Für wen eignet sich Mallorca?

Mallorca passt zu fast jedem Trainingsniveau: Einsteiger finden flache Runden und eine dichte Infrastruktur, ambitionierte Athleten die langen Anstiege der Tramuntana. Ideal ist die Insel für den Saisonaufbau im März und April. Wer Ruhe auf der Straße sucht, sollte die Wochen um Ostern meiden, wenn besonders viele Radgruppen unterwegs sind.$b$, 'costa-blanca', $c$Beide Ziele bieten ein ähnliches Frühjahrsklima und Berge nah am Meer. Mallorca hat mehr Trainingshotels und mit der Tramuntana die bekannteren Pässe, die Costa Blanca ruhigere Straßen im Hinterland und ist als Festlandziel auch mit dem Auto erreichbar.$c$),

('lanzarote',
$s$Lanzarote: Lavafelder, Wind und ganzjährig milde 20 bis 28 °C – Winter-Trainingslager auf der Insel, die durch den Ironman bekannt wurde.$s$,
$b$Lanzarote ist die Insel für Wintertraining unter Wettkampfbedingungen: Tageshöchstwerte um 20 °C auch im Januar, kaum Regen, Meerwasser zwischen 19 und 23 °C und mit dem Club La Santa ein Sportresort mit mehreren 50-m-Becken.

Die Kehrseite ist der Wind. Der Passat weht fast täglich, im Sommer am stärksten – wer an seiner Leistung im Gegenwind arbeiten will, ist hier richtig, wer lange Pässe sucht, eher nicht.

## Landschaft und Charakter

Lanzarote ist die östlichste der Kanarischen Inseln und von Vulkanen geprägt: schwarze Lavafelder, rote Kraterkegel, kaum Bäume. Im Südwesten liegt der Nationalpark Timanfaya mit den Feuerbergen, im Norden das grünere Tal von Haría und das Famara-Massiv mit seinen steilen Klippen. Die Insel ist flacher als ihre westlichen Nachbarn, dafür fast immer windig. Bekannt wurde sie bei Triathleten durch den Ironman Lanzarote, einen der härtesten Langdistanz-Wettkämpfe überhaupt.

## Klima und beste Reisezeit

Lanzarote ist ein Ganzjahresziel. Selbst im Januar und Februar liegen die Tageshöchstwerte um 20 °C, im Frühjahr um 22 bis 23 °C, im August um 28 °C. Regen ist selten, meist nur ein bis drei Regentage im Monat. Die eigentliche Herausforderung ist der Passatwind aus Nordost: Er weht fast täglich und ist im Sommer am stärksten. Für das Wintertraining von November bis April ist die Insel deshalb besonders beliebt.

## Wind

Der Passat weht fast täglich aus Nordost, im Mittel mit 15 bis 26 km/h, am stärksten im Juli und August, am ruhigsten im Herbst. Die offenen Lavaebenen bieten kaum Windschutz. Plane deine Runden so, dass du gegen Ende Rückenwind hast, und nutze den Wind bewusst für Kraftausdauer – genau dafür kommen viele Langdistanz-Athleten hierher.

## Radfahren

Die Straßen sind gut ausgebaut und außerhalb der Touristenorte ruhig. Klassische Anstiege führen von Haría zum Mirador del Río im Norden, über den Pass bei Femés im Süden oder zur Ermita de las Nieves auf dem Famara-Massiv. Lange Anstiege wie auf Teneriffa oder Gran Canaria gibt es nicht, dafür wird jede Runde durch den Wind zur Kraftausdauer-Einheit. Wer sich auf ein windiges Rennen vorbereitet, findet hier ideale Bedingungen.

## Schwimmen

Das Wasser ist ganzjährig zwischen 19 und 23 °C warm; im Winter ist ein Neoprenanzug angenehm. Ruhige Buchten findest du etwa bei Costa Teguise und an der Playa Grande in Puerto del Carmen, wo auch der Ironman startet. Für Beckentraining ist das Sportresort Club La Santa an der Nordwestküste mit mehreren 50-m-Becken eine Ausnahme auf den Kanaren.

## Laufen

Die Strandpromenaden von Puerto del Carmen und Costa Teguise sind flach und lang. Auf den Lavapisten im Hinterland läufst du über weichen Vulkangrus – gut für die Gelenke, aber im Wind anstrengend.

## Anreise und Radtransport

Der Flughafen Arrecife liegt zentral; kaum ein Ort ist weiter als eine halbe Stunde entfernt. Aus Deutschland dauert der Flug etwa vier bis viereinhalb Stunden. Leihräder gibt es in allen größeren Orten, das eigene Rad meldest du bei der Airline als Sportgepäck an.

## Ruhetag

Die Feuerberge im Nationalpark Timanfaya, die Lavahöhlen Jameos del Agua und Cueva de los Verdes sowie der Aussichtspunkt Mirador del Río zeigen die Insel von ihrer eindrucksvollsten Seite – viele dieser Orte hat der Künstler César Manrique gestaltet. Im Weinbaugebiet La Geria wachsen die Reben in schwarzen Lavamulden.

## Für wen eignet sich Lanzarote?

Lanzarote ist ideal für Wintertraining im Warmen und für alle, die an ihrer Kraft im Wind arbeiten wollen. Lange Bergpässe fehlen, dafür sind Wege kurz und das Wetter verlässlich. Weniger geeignet ist die Insel, wenn du lange Anstiege oder windstille Ausfahrten suchst.$b$, 'fuerteventura', $c$Beide Inseln sind warm, trocken und windig. Lanzarote ist kompakter und bietet mit dem Club La Santa mehrere 50-m-Becken, Fuerteventura ist weitläufiger und auf den Straßen noch ruhiger.$c$),

('fuerteventura',
$s$Fuerteventura: ruhige Straßen, Dünen und Atlantik bei 20 bis 30 °C – entspanntes Wintertraining auf der zweitgrößten Kanareninsel.$s$,
$b$Fuerteventura ist die Insel für alle, die im Winter unter warmen Bedingungen schwimmen, Rad fahren und laufen wollen: Tageshöchstwerte um 21 bis 24 °C auch im Januar, kaum Regen und Meerwasser, das nie unter 19 °C fällt. Herzstück für Triathleten ist das Sportresort in Las Playitas an der Ostküste mit 50-m-Becken.

Die Kehrseite: Der Passatwind weht fast immer, im Sommer am stärksten. Wer auf dem Rad im Gegenwind arbeiten will, ist hier richtig – wer ruhige Kaffeefahrten sucht, wird auf Mallorca glücklicher.

## Landschaft und Charakter

Fuerteventura ist die älteste der Kanarischen Inseln und wirkt wie eine Halbwüste: sanfte, kahle Berge in Ocker und Braun, weite Ebenen und kilometerlange helle Strände. Im Norden liegen die Wanderdünen von Corralejo, im Süden die Halbinsel Jandía. Die Insel ist dünn besiedelt, außerhalb der Ferienorte begegnest du auf der Straße oft mehr Ziegen als Autos.

## Klima und beste Reisezeit

Die Temperaturen sind das ganze Jahr ausgeglichen: Im Januar um 22 °C, im Frühjahr 23 bis 25 °C, im August um 30 °C. Regen fällt selten. Wie auf Lanzarote weht häufig ein kräftiger Passatwind, am stärksten im Sommer. Für Trainingslager sind die Monate von Oktober bis Mai am angenehmsten.

## Wind

Der Passat weht auf Fuerteventura fast täglich aus Nordost, im Mittel mit 13 bis 23 km/h – am schwächsten im Herbst und Winter, am stärksten im Juli. Auf den offenen Straßen ohne Bäume spürst du jede Böe. Plane Runden so, dass du auf dem Rückweg Rückenwind hast, und fahre lange Einheiten am Vormittag, bevor der Wind auffrischt. Ein Aero-Laufradsatz mit hohen Felgen ist hier eher Last als Vorteil.

## Radfahren

Die Straßen sind breit, gut asphaltiert und wenig befahren – ideal für lange Grundlageneinheiten. Anstiege sind mäßig lang, aber zahlreich: Rund um Pájara und die alte Hauptstadt Betancuria führen kurvige Straßen über die Bergrücken, Aussichtspunkte wie der Morro Velosa belohnen die Mühe. Im Süden verlaufen die Straßen flacher entlang der Küste. Der Wind macht auch kurze Runden fordernd.

## Schwimmen

Das Meer ist mit 19 bis 23 °C ganzjährig gut zu beschwimmen. Viele Strände liegen offen zum Atlantik und haben Wellen und Strömung; geschützte Abschnitte und Hafenbecken wie in Las Playitas eignen sich besser fürs Freiwasser. Das Sportresort in Las Playitas bietet zusätzlich ein 50-m-Becken – eine der wenigen Möglichkeiten für Langbahntraining auf den Kanaren. Das Playitas Hotel und das Playitas Aparthotel in unserer Liste gehören zur selben Anlage und teilen sich die Sportanlagen.

## Laufen

Entlang der Küste gibt es flache Promenaden und Pisten, im Hinterland ruhige Nebenstraßen und Feldwege. Schatten ist selten: Lauf früh am Morgen oder am Abend und nimm genug zu trinken mit.

## Anreise und Radtransport

Der Flughafen liegt bei Puerto del Rosario an der Ostküste; nach Las Playitas fährst du etwa eine halbe Stunde, in den Süden nach Jandía rund eine Stunde. Der Flug aus Deutschland dauert etwa viereinhalb Stunden. Leihräder gibt es vor allem in den Sportresorts und größeren Ferienorten.

## Ruhetag

Betancuria mit seiner Kirche und den historischen Häusern zeigt die Geschichte der Insel. Im Norden lohnen die Dünen von Corralejo und eine Bootsfahrt zur kleinen Isla de Lobos, an der Westküste die Höhlen von Ajuy.

## Für wen eignet sich Fuerteventura?

Fuerteventura passt zu allen, die im Winter in Ruhe viele Kilometer sammeln wollen – ohne volle Straßen und mit verlässlichem Wetter. Für lange Bergpässe bist du auf Gran Canaria oder Teneriffa besser aufgehoben, für ein Trainingslager mit 50-m-Becken ist Las Playitas eine bekannte Adresse.$b$, 'lanzarote', $c$Die Nachbarinseln ähneln sich bei Klima und Wind. Lanzarote hat die bekanntere Triathlon-Geschichte durch den Ironman und mehr kurze, knackige Anstiege, Fuerteventura weitere Wege, ruhigere Straßen und längere Strände.$c$),

('gran-canaria',
$s$Gran Canaria: warme Südküste, Anstiege bis fast 2.000 m und Wasser um 20 bis 24 °C – Wintertraining für alle, die Berge suchen.$s$,
$b$Gran Canaria verbindet warme Küstenorte im Süden mit Anstiegen bis fast auf 2.000 m im Inselinneren. Im Winter liegen die Tageshöchstwerte an der Küste um 23 °C, das Meer hat das ganze Jahr über 20 °C.

Die Kehrseite: Flache Strecken sind rar, fast jede Ausfahrt führt bergauf. Für reines Grundlagentraining gibt es geeignetere Inseln.

## Landschaft und Charakter

Gran Canaria wird oft als „Kontinent im Kleinen“ beschrieben. Die runde Insel steigt von der Küste bis zum Pico de las Nieves auf fast 2.000 m an, das Wahrzeichen Roque Nublo ragt als Felsnadel aus der Mitte. Der Norden ist grüner und häufiger bewölkt, der Süden um Maspalomas trocken und sonnig, mit den bekannten Dünen am Meer. Tief eingeschnittene Schluchten, die Barrancos, führen vom Zentrum strahlenförmig zur Küste.

## Klima und beste Reisezeit

Im Süden liegen die Tageshöchstwerte im Winter bei 23 °C und im Frühjahr bei 24 bis 25 °C. Im Juli und August wird es mit über 30 °C heiß. Regen ist selten, am ehesten im März und November. Beachte: In den Bergen ist es deutlich kühler, auf über 1.500 m kann es im Winter auch einmal nur wenige Grad haben – Armlinge und Windjacke gehören in die Trikottasche.

## Radfahren

Die Insel ist ein Ziel für Kletterer. Klassische Anstiege führen von Maspalomas durch das Tal von Fataga nach San Bartolomé de Tirajana und weiter hinauf Richtung Pico de las Nieves, oder aus Mogán über die Bergstraßen ins Inselinnere. Steigungen von 10 % und mehr sind keine Seltenheit, Abfahrten lang und kurvig. Flache Runden gibt es kaum, an der Südküste allenfalls kurze Abschnitte.

## Schwimmen

Das Meer ist mit 20 bis 24 °C das ganze Jahr angenehm. Geschützte Badestrände findest du an der Südküste, etwa in Arguineguín, Puerto de Mogán oder an der Playa del Inglés. Mehrere Hotels haben große Pools; ein öffentliches 50-m-Becken gibt es in der Hauptstadt Las Palmas.

## Laufen

Die Küstenpromenade zwischen Meloneras und Playa del Inglés ist flach und gut zum Laufen. Wer Höhenmeter sammeln möchte, findet im Inselinneren gut markierte Wanderwege, etwa rund um den Roque Nublo.

## Anreise und Radtransport

Der Flughafen liegt an der Ostküste zwischen Las Palmas und dem Süden; nach Maspalomas fährst du etwa eine halbe Stunde. Der Flug aus Deutschland dauert rund viereinhalb Stunden. Radverleihe gibt es vor allem im Süden.

## Ruhetag

Die Altstadt Vegueta in Las Palmas und der Stadtstrand Las Canteras sind einen Ausflug wert. Puerto de Mogán mit seinen Kanälen ist ein ruhiger Gegenpol zum Trubel im Süden, die Dünen von Maspalomas stehen unter Naturschutz und lassen sich auf markierten Wegen erkunden.

## Für wen eignet sich Gran Canaria?

Gran Canaria ist ideal für Athleten, die im Winter Wärme und lange Anstiege verbinden wollen, etwa zur Vorbereitung auf bergige Rennen. Für reines Grundlagentraining in der Ebene sind Lanzarote, Fuerteventura oder Mallorca besser geeignet.$b$, 'teneriffa', $c$Beide Inseln bieten lange Anstiege und warme Küsten. Teneriffa geht mit dem Teide noch höher hinauf und eignet sich für Höhentraining, Gran Canaria ist kompakter und hat im Süden die verlässlichere Sonne.$c$),

('teneriffa',
$s$Teneriffa: Höhentraining am Teide, Anstiege bis auf über 2.000 m und Wasser um 21 bis 25 °C – Wintertraining auf der größten Kanareninsel.$s$,
$b$Teneriffa ist das Ziel für Höhenmeter und Höhentraining: Von der sonnigen Südküste führen Anstiege von über 2.000 Höhenmetern am Stück bis in den Nationalpark am Teide. An der Küste liegen die Tageshöchstwerte im Winter um 21 bis 22 °C, das Meer hat 20 bis 25 °C.

Die Kehrseite: Flache Strecken gibt es kaum, und oben am Berg kann es im Winter empfindlich kalt werden.

## Landschaft und Charakter

Teneriffa ist die größte der Kanarischen Inseln und wird vom Teide beherrscht, mit 3.715 m der höchste Berg Spaniens. Der Nationalpark rund um den Vulkan ist UNESCO-Weltnaturerbe; auf über 2.000 m liegt die Hochebene Las Cañadas mit bizarren Lavaformationen. Der Norden ist feucht und grün, der Süden trocken und sonnig. Im Nordwesten fällt das Teno-Gebirge steil zum Meer ab, im Nordosten liegt das Anaga-Gebirge mit Lorbeerwäldern.

## Klima und beste Reisezeit

An der Südküste um Costa Adeje liegen die Tageshöchstwerte im Winter bei 21 bis 22 °C, im Frühjahr bei 23 bis 24 °C, im August bei 30 °C. Regen ist selten. In der Höhe ist es dagegen deutlich kühler: Auf dem Teide-Plateau kann es im Winter Frost geben, und gelegentlich sind die Straßen nach Schneefall gesperrt. Für Trainingslager sind die Monate von Oktober bis Mai am beliebtesten.

## Radfahren

Teneriffa ist bekannt für einige der längsten Anstiege Europas. Von Costa Adeje führt die Straße über Vilaflor, eines der höchstgelegenen Dörfer Spaniens, hinauf in den Nationalpark – über 2.000 Höhenmeter am Stück. Auch von La Orotava im Norden und von Arafo im Osten erreichst du die Cañadas. Viele Profis nutzen das Plateau für Höhentrainingslager. Flache Strecken sind rar; plane für jede Ausfahrt Höhenmeter ein.

## Schwimmen

Das Meer ist mit 21 bis 25 °C das ganze Jahr warm. Ruhige Badebuchten findest du in Costa Adeje und Los Cristianos, an der Nordküste ist das Wasser oft rauer. Für Beckentraining stehen Hotelpools und öffentliche Bäder in den größeren Orten zur Verfügung.

## Laufen

Die Küstenpromenade von Costa Adeje bis Los Cristianos ist lang und flach. In den Bergen gibt es zahlreiche Wanderwege – und wer will, läuft in der Höhe des Nationalparks.

## Anreise und Radtransport

Der Südflughafen liegt nur rund 20 Minuten von Costa Adeje entfernt, der Nordflughafen bei La Laguna dient vor allem Inselflügen. Der Flug aus Deutschland dauert etwa viereinhalb Stunden. Radverleihe gibt es in den Ferienorten im Süden.

## Ruhetag

Mit der Seilbahn kommst du fast bis zum Teide-Gipfel. Das Bergdorf Masca, die Altstadt von La Laguna (UNESCO-Welterbe) und der Hafenort Garachico zeigen die ruhigere Seite der Insel. Von Los Cristianos starten Bootstouren zu den Grindwalen vor der Küste.

## Für wen eignet sich Teneriffa?

Teneriffa ist das Ziel für ambitionierte Athleten, die lange Anstiege oder Höhentraining suchen. Mit Wärme an der Küste und kühler Höhe am Berg kannst du beides verbinden. Für flache Grundlagenkilometer sind die Nachbarinseln besser geeignet.$b$, 'gran-canaria', $c$Beide Inseln sind Ziele für Kletterer. Teneriffa bietet mit dem Nationalpark am Teide die längsten Anstiege und Höhentraining, Gran Canaria kürzere Wege zwischen Küste und Bergen.$c$),

('girona',
$s$Girona: Wahlheimat vieler Radprofis, Anstiege im Pyrenäen-Vorland, Costa Brava und ein See fürs Freiwasser – Trainingslager im Frühjahr und Herbst.$s$,
$b$Girona ist die Wahlheimat vieler Radprofis: ruhige Nebenstraßen, Anstiege im Vorland der Pyrenäen, die Küstenstraßen der Costa Brava und mit dem See von Banyoles ein Revier fürs Freiwasser. Die besten Monate sind März bis Juni sowie September und Oktober.

Die Kehrseite: Im Winter ist es mit Höchstwerten um 14 °C zu kühl für ein Trainingslager, und das Meer erreicht erst ab Juni 20 °C.

## Landschaft und Charakter

Girona liegt in Katalonien, rund eine Stunde nördlich von Barcelona. Die Stadt mit ihrer mittelalterlichen Altstadt und den bunten Häusern am Fluss Onyar ist Wahlheimat vieler Radprofis. Im Umland wechseln sanfte Hügel, Wälder und Felder mit den Vorbergen der Pyrenäen; im Osten liegt die Felsküste der Costa Brava, im Nordwesten die Vulkanlandschaft der Garrotxa um Olot.

## Klima und beste Reisezeit

Girona hat ein mediterranes Klima mit kühlen Wintern: Im Januar liegen die Tageshöchstwerte um 14 °C, im März um 17 °C, im Mai um 23 °C. Juli und August sind mit über 30 °C heiß. Die besten Monate fürs Training sind März bis Juni und September bis Oktober. Im Frühjahr musst du mit einzelnen Regentagen rechnen.

## Radfahren

Die Region gehört zu den abwechslungsreichsten Radrevieren Europas: ruhige Nebenstraßen, Anstiege jeder Länge und eine gute Fahrradkultur. Bekannte Ziele sind der Anstieg nach Rocacorba, der Aufstieg zum Santuari dels Àngels oder die Küstenstraße zwischen Sant Feliu de Guíxols und Tossa de Mar mit ihren vielen Kurven. Wer längere Touren plant, fährt in die Garrotxa oder bis in die Pyrenäen.

## Schwimmen

Nördlich von Girona liegt der See von Banyoles, auf dem regelmäßig Ruder- und Schwimmwettkämpfe stattfinden – ideal fürs Freiwassertraining. Das Mittelmeer an der Costa Brava ist ab Juni über 20 °C warm, im Frühjahr mit 14 bis 15 °C aber nur mit Neoprenanzug angenehm. In der Stadt gibt es mehrere öffentliche Schwimmbäder.

## Laufen

Die Vía Verde, eine ehemalige Bahntrasse, führt von Girona flach bis an die Küste nach Sant Feliu de Guíxols – gut zum Laufen und für lockere Radrunden. In der Stadt bietet der Park La Devesa schattige Wege, und die Stadtmauer über der Altstadt ist eine kurze, aussichtsreiche Runde.

## Anreise und Radtransport

Der Flughafen Girona–Costa Brava liegt nur etwa eine Viertelstunde von der Stadt entfernt; über Barcelona fährst du rund eine Stunde mit Mietwagen oder Schnellzug. Der Flug aus Deutschland dauert etwa zwei Stunden. Radverleihe mit hochwertigen Rennrädern gibt es in Girona reichlich.

## Ruhetag

Die Altstadt mit Kathedrale, jüdischem Viertel und Stadtmauer lohnt einen Spaziergang. Ausflüge führen ins mittelalterliche Besalú mit seiner Brücke, zum Dalí-Museum in Figueres oder ins Küstendorf Cadaqués.

## Für wen eignet sich Girona?

Girona ist ideal für Radfahrer und Triathleten, die Abwechslung und gute Straßen schätzen und ein Stadtleben einem Ferienort vorziehen. Für Wintertraining in der Wärme sind die Kanaren besser geeignet; im Frühjahr und Herbst spielt Girona seine Stärken aus.$b$, 'mallorca', $c$Girona bietet Stadtleben, abwechslungsreichere Straßen und kurze Wege in die Pyrenäen, Mallorca mehr Trainingshotels, flache Grundlagenrunden und wärmeres Wetter im März.$c$),

('costa-blanca',
$s$Costa Blanca: milde Winter, Anstiege wie der Coll de Rates und Küstenstraßen um Calpe und Dénia – Winterquartier vieler Radprofis.$s$,
$b$Die Costa Blanca ist das Winterquartier vieler Radprofis: milde Temperaturen um 16 bis 19 °C von Januar bis März, ruhige Straßen im Hinterland von Calpe und Dénia und Anstiege wie der Coll de Rates. Die Anreise nach Alicante ist kurz.

Die Kehrseite: Das Mittelmeer ist im Frühjahr mit 15 bis 17 °C kühl, und der Herbst bringt gelegentlich starke Regenfälle.

## Landschaft und Charakter

Die Costa Blanca erstreckt sich entlang der Provinz Alicante im Südosten Spaniens. Zwischen Dénia und Benidorm reichen Berge bis ans Meer: Der Felsen Penyal d'Ifac bei Calpe ist das Wahrzeichen der Küste, der Montgó überragt Dénia. Im Hinterland liegen stille Täler mit Orangen- und Mandelplantagen, kleine Dörfer und kurvige Bergstraßen. Viele Radprofi-Teams verbringen hier ihre Wintertrainingslager.

## Klima und beste Reisezeit

Die Winter sind mild: Im Januar und Februar liegen die Tageshöchstwerte um 16 °C, im März um 19 °C, im April um 22 °C. Im Juli und August wird es mit über 30 °C heiß. Die besten Monate fürs Training sind Februar bis Mai und Oktober bis November. Regen fällt vor allem im Herbst, dann manchmal kräftig.

## Radfahren

Das Hinterland zwischen Calpe, Dénia und Alcoy ist ein Paradebeispiel für ein Trainingsrevier mit vielen ruhigen Straßen. Der bekannteste Anstieg ist der Coll de Rates bei Parcent mit gleichmäßiger Steigung und weitem Blick bis zum Meer. Weitere Klassiker sind die Täler Vall d'Ebo und Vall de Laguar sowie die Bergstraßen Richtung Guadalest. Wer längere Anstiege sucht, fährt weiter ins Landesinnere.

## Schwimmen

Das Mittelmeer ist im Frühjahr mit 15 bis 17 °C kühl, ab Juni über 20 °C. Im Süden von Dénia bieten die Felsbuchten von Les Rotes klares Wasser, rund um Calpe und Altea gibt es geschützte Strände. Für das Beckentraining stehen Hotelpools und Sportzentren mit 25- und 50-m-Becken zur Verfügung.

## Laufen

Die Strandpromenaden von Dénia, Calpe und Benidorm sind flach und lang. Der Naturpark Montgó bei Dénia bietet Trails mit Ausblick, und um den Penyal d'Ifac führt ein Wanderweg.

## Anreise und Radtransport

Der Flughafen Alicante liegt etwa eine Stunde von Calpe und eineinhalb Stunden von Dénia entfernt, alternativ fliegst du nach Valencia. Der Flug aus Deutschland dauert etwa zweieinhalb Stunden. Radverleihe und Werkstätten gibt es in allen größeren Küstenorten.

## Ruhetag

Das Bergdorf Guadalest mit seiner Burg, die Altstadt von Altea und die Burg von Dénia sind lohnende Ziele. Bei Callosa d'en Sarrià liegen die Wasserfälle Fonts de l'Algar, und der Aufstieg auf den Penyal d'Ifac belohnt mit einem weiten Blick über die Küste.

## Für wen eignet sich die Costa Blanca?

Die Costa Blanca ist ideal für Athleten, die im Winter und Frühjahr viele Radkilometer mit abwechslungsreichen Anstiegen sammeln wollen und eine kurze Anreise schätzen. Für warmes Freiwasser im Winter sind die Kanaren besser geeignet.$b$, 'mallorca', $c$Beide Ziele bieten ein ähnliches Frühjahrsklima und Berge nah am Meer. Die Costa Blanca hat ruhigere Straßen im Hinterland und ist auch mit dem Auto erreichbar, Mallorca mehr Trainingshotels und die bekannteren Pässe.$c$),

('algarve',
$s$Algarve: milde Winter, Atlantikküste und die Serra de Monchique – Trainingslager im Süden Portugals von Herbst bis Frühjahr.$s$,
$b$Die Algarve im Süden Portugals bietet milde Winter um 17 bis 18 °C, ruhige Straßen im Hinterland und den Anstieg auf den Fóia in der Serra de Monchique. Für Trainingslager sind Februar bis Mai und Oktober bis November am angenehmsten.

Die Kehrseite: Der Atlantik bleibt mit 16 bis 19 °C das ganze Jahr kühl, und im Winter regnet es häufiger als an der spanischen Mittelmeerküste.

## Landschaft und Charakter

Die Algarve ist die südlichste Region Portugals. An der Südküste wechseln goldene Felsklippen, Grotten und Sandbuchten, an der Westküste – der Costa Vicentina – fällt das Land wild und unverbaut zum Atlantik ab. Im Hinterland steigt die Serra de Monchique mit dem Fóia (902 m), dem höchsten Punkt der Algarve, an. Östlich von Faro wird die Landschaft flacher, mit Lagunen und Salinen im Naturpark Ria Formosa.

## Klima und beste Reisezeit

Die Winter sind mild: Im Januar und Februar liegen die Tageshöchstwerte um 17 bis 18 °C, im April um 22 °C, im Mai um 24 °C. Im Sommer wird es bis 30 °C warm, am Atlantik weht oft eine frische Brise. Von Oktober bis März gibt es mehr Regentage, im Sommer kaum Regen. Für Trainingslager sind Februar bis Mai und Oktober bis November am angenehmsten.

## Radfahren

Das Hinterland bietet ruhige Nebenstraßen durch Korkeichenwälder und hügelige Landschaft. Der klassische Anstieg führt von der Küste über Monchique hinauf zum Fóia. Entlang der Küste verlaufen flachere Strecken, die Hauptstraße N125 solltest du wegen des Verkehrs meiden. An der Westküste machen Wind und Hügel auch kurze Runden fordernd.

## Schwimmen

Der Atlantik ist hier kühler als das Mittelmeer: Das Wasser hat das ganze Jahr nur etwa 16 bis 19 °C, ein Neoprenanzug ist fast immer nötig. Ruhigere Buchten findest du an der Südküste um Lagos und Portimão; an der Westküste sorgen Wellen und Strömung für anspruchsvolle Bedingungen. Für das Beckentraining gibt es in größeren Orten öffentliche Bäder und Hotels mit Sportbecken.

## Laufen

Die Rota Vicentina führt als Küstenpfad entlang der Klippen der Westküste – landschaftlich eindrucksvoll, aber sandig und anspruchsvoll. Flacher läufst du auf den Strandpromenaden von Lagos und Portimão oder auf Feldwegen im Hinterland.

## Anreise und Radtransport

Der Flughafen Faro liegt etwa eine Stunde von Lagos und gut eine Stunde von Sagres entfernt. Der Flug aus Deutschland dauert etwa drei Stunden. Ein Mietwagen ist praktisch, weil die Orte weit auseinanderliegen; Radverleihe gibt es in den größeren Küstenorten.

## Ruhetag

Bei Lagos führen Bootstouren und Kajakausflüge zu den Felsformationen der Ponta da Piedade, bei Benagil liegt die bekannte Meereshöhle. Der Leuchtturm am Cabo de São Vicente markiert die Südwestspitze Europas, und die Burg von Silves erinnert an die maurische Vergangenheit der Region.

## Für wen eignet sich die Algarve?

Die Algarve passt zu Athleten, die im Winter und Frühjahr ruhige Straßen und milde Temperaturen suchen und auf warmes Meerwasser verzichten können. Wer viel im Freiwasser trainieren möchte, braucht einen guten Neoprenanzug.$b$, 'mallorca', $c$Die Algarve ist ruhiger und im Winter etwas wärmer, dafür ist der Atlantik kühl. Mallorca bietet mehr Trainingshotels, die bekannteren Anstiege und ab Juni wärmeres Meerwasser.$c$),

('gardasee',
$s$Gardasee: Freiwasser im See, Anstiege am Monte Baldo und kurze Anreise aus Deutschland – Trainingslager von April bis Oktober.$s$,
$b$Der Gardasee verbindet Freiwasser direkt vor der Haustür mit Anstiegen am Monte Baldo und in den Bergen über Riva – und das mit kurzer Anreise aus Süddeutschland. Die beste Zeit ist von April bis Juni und im September und Oktober.

Die Kehrseite: Im Winter ist es mit Höchstwerten um 9 °C zu kalt, und im Frühjahr ist das Seewasser nur mit Neoprenanzug angenehm.

## Landschaft und Charakter

Der Gardasee ist der größte See Italiens und liegt zwischen der Lombardei, Venetien und dem Trentino. Im Norden um Riva und Torbole ist er schmal und von steilen Bergen eingerahmt, im Süden um Sirmione und Desenzano öffnet er sich in eine flache Hügellandschaft. Am Ostufer erhebt sich der über 2.000 m hohe Monte Baldo. Am Nordufer sorgen regelmäßige Winde für beste Bedingungen für Windsurfer und Segler.

## Klima und beste Reisezeit

Die Winter sind kühl: Im Januar liegen die Tageshöchstwerte um 9 °C. Ab April wird es mit 18 °C und im Mai mit 21 °C angenehm, im Juli und August erreichst du bis 29 °C. Die besten Monate fürs Training sind April bis Juni und September bis Oktober. Im späten Frühjahr und Sommer sind Gewitter am Nachmittag häufig – plane lange Ausfahrten am Vormittag.

## Radfahren

Rund um den See findest du Anstiege für jeden Geschmack: Die Straßen auf den Monte Baldo gehören zu den härtesten der Region, der Passo del Tremalzo und die Straße zum Lago di Ledro führen in die Berge über Riva. Ins Trentino Richtung Arco und Rovereto gibt es auch flachere Talstrecken. Die Uferstraße Gardesana ist landschaftlich schön, aber eng, tunnelreich und im Sommer stark befahren.

## Schwimmen

Der See ist das große Plus der Region: Freiwassertraining direkt vor der Haustür, mit vielen Badestellen und Uferbereichen. Im April und Mai ist das Wasser noch frisch und nur mit Neoprenanzug angenehm, im Hochsommer erreicht es angenehme Badetemperaturen. Im Norden kann der Wind am Nachmittag Wellen aufbauen – schwimm deshalb am besten früh am Tag.

## Laufen

Zwischen Riva und Torbole und entlang der Sarca Richtung Arco führen flache Wege am Wasser. Wer Höhenmeter sucht, findet auf dem Monte Brione und in den Bergen um den See zahlreiche Trails.

## Anreise und Radtransport

Aus Süddeutschland ist der Gardasee mit dem Auto über den Brenner in etwa fünf Stunden erreichbar – das eigene Rad fährt einfach mit. Mit der Bahn kommst du bis Rovereto, der nächste Flughafen ist Verona, etwa eine Stunde vom Nordufer entfernt.

## Ruhetag

Die Burg von Arco, die Altstadt von Malcesine mit der Seilbahn auf den Monte Baldo, der Wasserfall von Varone und die Halbinsel Sirmione mit der Skaligerburg sind lohnende Ziele. Eine Schifffahrt verbindet viele Orte am See.

## Für wen eignet sich der Gardasee?

Der Gardasee ist ideal für Athleten, die Freiwasser, Berge und eine kurze Anreise kombinieren wollen – vor allem im Frühjahr und Herbst. Für Wintertraining ist es zu kühl; dann sind die Kanaren die bessere Wahl.$b$, 'tirol', $c$Beide Ziele sind mit dem Auto schnell erreichbar. Der Gardasee ist im Frühjahr und Herbst wärmer und bietet Freiwasser direkt vor der Haustür, Tirol ist im Hochsommer angenehm kühler und hat die längeren Alpenpässe.$c$),

('zypern',
$s$Zypern: lange Saison von Februar bis November, Anstiege im Troodos-Gebirge und warmes Meer – Trainingslager im östlichen Mittelmeer.$s$,
$b$Zypern hat eine der längsten Saisons im Mittelmeer: Schon im Februar und März liegen die Höchstwerte an der Südküste bei 17 bis 21 °C, das Meer hat nie weniger als 18 °C. Im Troodos-Gebirge warten Anstiege auf über 1.500 m.

Die Kehrseite: Im Sommer wird es mit über 30 °C sehr heiß, und der Linksverkehr erfordert auf dem Rad Umgewöhnung.

## Landschaft und Charakter

Zypern ist die drittgrößte Insel im Mittelmeer. Im Südwesten erhebt sich das Troodos-Gebirge mit dem Olympos (1.952 m), dessen Hänge mit Pinienwäldern und Weinbergen bedeckt sind. An der Küste liegen die Städte Limassol, Paphos und Larnaka, im Osten die Badeorte Ayia Napa und Protaras. Zwischen Troodos und dem Nordgebirge erstreckt sich die trockene Mesaoria-Ebene.

## Klima und beste Reisezeit

Zypern hat eine der längsten Saisons im Mittelmeer. An der Südküste um Limassol liegen die Tageshöchstwerte im Januar und Februar um 17 bis 18 °C, im März um 21 °C, im April um 23 °C. Im Sommer wird es mit über 30 °C sehr heiß. Die besten Monate fürs Training sind Februar bis Mai und Oktober bis November. Regen fällt fast nur im Winter.

## Radfahren

Das Troodos-Gebirge bietet lange Anstiege: Von Limassol aus führt die Straße über Platres hinauf in die Bergdörfer, auf über 1.500 m. Im Hinterland von Paphos warten ruhige Straßen durch Weinberge und Dörfer. Beachte: In Zypern herrscht Linksverkehr – das erfordert gerade an Kreuzungen und in Kreisverkehren Aufmerksamkeit.

## Schwimmen

Das Meer ist warm: Im Winter um 18 bis 19 °C, ab Mai über 20 °C, im Sommer bis 29 °C. Ruhige Buchten findest du an der Südküste und um Protaras im Osten. Damit gehört Zypern zu den wenigen Zielen in Europa, an denen du schon im Frühjahr ohne Neoprenanzug schwimmen kannst – im März ist er aber noch angenehm.

## Laufen

Die Strandpromenade in Limassol ist mehrere Kilometer lang und flach. In den Wäldern des Troodos-Gebirges gibt es markierte Wanderwege, auf denen es im Sommer angenehm kühler ist als an der Küste.

## Anreise und Radtransport

Zypern hat zwei internationale Flughäfen: Larnaka und Paphos. Von Larnaka nach Limassol fährst du etwa 45 Minuten. Der Flug aus Deutschland dauert rund vier Stunden. Bezahlt wird im Süden der Insel mit Euro.

## Ruhetag

Die Ausgrabungsstätte von Kourion über der Küste, die Mosaiken von Paphos (UNESCO-Welterbe) und der Felsen der Aphrodite gehören zu den bekanntesten Zielen. Im Troodos-Gebirge stehen bemalte Kirchen, die ebenfalls zum Welterbe zählen.

## Für wen eignet sich Zypern?

Zypern ist ideal für Athleten, die früh im Jahr Wärme und warmes Meerwasser suchen und dafür eine etwas längere Anreise in Kauf nehmen. Mit Bergen im Troodos und ruhigen Küstenstraßen bietet die Insel Abwechslung. Geprüfte Hotels gibt es hier bei uns noch nicht – Vorschläge sind willkommen.$b$, 'kreta', $c$Zypern ist im Winter und Frühjahr wärmer und trockener und eignet sich deshalb früher im Jahr. Kreta hat die höheren Gebirge und eine kürzere Anreise, ist im Winter aber wechselhafter.$c$),

('kreta',
$s$Kreta: Gebirge über 2.400 m, ruhige Straßen und warmes Meer – Trainingslager auf der größten griechischen Insel im Frühjahr und Herbst.$s$,
$b$Kreta ist gebirgiger, als viele denken: Lange Anstiege führen auf Hochebenen wie Lasithi und Omalos, das Hinterland ist ruhig, und das Meer ist ab Juni über 20 °C warm. Die besten Monate fürs Training sind März bis Mai und Oktober bis November.

Die Kehrseite: Im Winter ist das Wetter wechselhaft und oft windig – für verlässliche Wärme im Januar sind die Kanaren die bessere Wahl.

## Landschaft und Charakter

Kreta ist die größte Insel Griechenlands und überraschend gebirgig. Drei Gebirgszüge prägen die Insel: die Weißen Berge im Westen, das Psiloritis-Massiv mit dem höchsten Gipfel (2.456 m) in der Mitte und das Dikti-Gebirge mit der Lasithi-Hochebene im Osten. Die Nordküste mit Chania, Rethymno und Heraklion ist dicht besiedelt, die Südküste am Libyschen Meer wild und ruhig. Tiefe Schluchten wie die Samaria-Schlucht durchziehen das Land.

## Klima und beste Reisezeit

An der Nordküste um Chania liegen die Tageshöchstwerte im Winter um 15 bis 18 °C, im April um 20 °C, im Mai um 23 °C. Im Juli und August wird es mit über 30 °C heiß. Die besten Monate fürs Training sind März bis Mai und Oktober bis November. Im Winter regnet es häufiger, ab Mai kaum noch. Kreta ist außerdem oft windig.

## Radfahren

Die Insel bietet viele ruhige Straßen und Anstiege jeder Länge. Von der Nordküste führen lange Straßen auf die Lasithi-Hochebene oder von Chania auf die Omalos-Hochebene am Rand der Weißen Berge. Rund um das Psiloritis-Massiv warten Bergdörfer wie Anogia. Die Hauptstraße entlang der Nordküste ist stark befahren; die schöneren Strecken liegen im Hinterland.

## Schwimmen

Das Meer ist im Frühjahr mit 17 bis 18 °C noch frisch, ab Juni über 20 °C und im Spätsommer bis 27 °C warm. Geschützte Buchten findest du an beiden Küsten; die Nordküste kann bei Wind rau sein, die Südküste ist oft ruhiger.

## Laufen

Entlang der Strände und Hafenpromenaden um Chania und Rethymno gibt es flache Strecken. Im Hinterland führen Wanderwege durch Schluchten und Olivenhaine, oft mit wenig Schatten.

## Anreise und Radtransport

Kreta hat zwei große Flughäfen: Heraklion und Chania. Der Flug aus Deutschland dauert etwa drei bis dreieinhalb Stunden. Wegen der großen Entfernungen auf der Insel lohnt es sich, den Flughafen passend zum Trainingsort zu wählen.

## Ruhetag

Der minoische Palast von Knossos bei Heraklion, die venezianische Hafenpromenade von Chania und die Festungsinsel Spinalonga zählen zu den bekanntesten Zielen. Die Samaria-Schlucht ist in der Regel von Mai bis Oktober zum Wandern geöffnet.

## Für wen eignet sich Kreta?

Kreta passt zu Athleten, die im Frühjahr oder Herbst ruhige Straßen, Berge und warmes Meer verbinden wollen. Für Wintertraining in verlässlicher Wärme ist die Insel zu wechselhaft. Geprüfte Hotels gibt es hier bei uns noch nicht – Vorschläge sind willkommen.$b$, 'zypern', $c$Kreta bietet die höheren Gebirge und eine kürzere Anreise, Zypern ist im Winter und Frühjahr wärmer und trockener. Für ein Trainingslager im Februar oder März ist Zypern deshalb meist die verlässlichere Wahl.$c$),

('tirol',
$s$Tirol: Alpenpässe wie Kühtai und Timmelsjoch, Badeseen und Höhenlage – Sommer-Trainingslager mit kurzer Anreise aus Deutschland.$s$,
$b$Tirol ist ein Sommerziel mit Höhenlage: Alpenpässe wie Kühtai und Timmelsjoch, ruhige Talwege entlang von Inn und Ziller und Badeseen fürs Freiwasser. Von Juni bis August liegen die Höchstwerte in den Tälern um 24 bis 25 °C.

Die Kehrseite: Außerhalb des Sommers ist es zu kühl, und Nachmittagsgewitter verkürzen im Hochsommer manche Ausfahrt.

## Landschaft und Charakter

Tirol liegt im Herzen der Ostalpen. Das Inntal teilt das Land, von ihm zweigen Täler wie das Zillertal, das Ötztal und das Brixental ab. Die Gipfel reichen über 3.000 m, die Täler liegen meist zwischen 500 und 1.000 m. Zwischen Kitzbüheler Alpen, Karwendel und Zillertaler Alpen findest du grüne Almen, klare Bergseen und zahlreiche Pässe.

## Klima und beste Reisezeit

Tirol ist ein Sommerziel. In den Tälern liegen die Tageshöchstwerte im Mai um 18 °C, von Juni bis August um 24 bis 25 °C, im September um 21 °C. Im Winter ist es zum Radtraining zu kalt. Im Sommer sind Gewitter am Nachmittag häufig, in der Höhe kann es auch im Juli empfindlich kühl werden. Die besten Monate sind Juni bis September.

## Radfahren

Tirol bietet einige der bekanntesten Alpenpässe: das Kühtai auf gut 2.000 m, das Timmelsjoch an der Grenze zu Südtirol oder den Gerlospass zwischen Zillertal und Salzburger Land. Das Kitzbüheler Horn gehört zu den steilsten Anstiegen der Region. Für Grundlageneinheiten eignet sich der Inntal-Radweg entlang des Flusses. Der Ötztaler Radmarathon zeigt, welche Umfänge hier möglich sind.

## Schwimmen

Für das Freiwasser bieten sich Badeseen an: der Achensee, Tirols größter See, mit klarem, aber kühlem Wasser, der Schwarzsee bei Kitzbühel als wärmerer Moorsee, sowie Walchsee und Reintalersee. Im Juni ist das Wasser noch frisch, im Juli und August angenehm. Viele Orte haben Frei- und Hallenbäder.

## Laufen

Talwege entlang von Inn und Ziller bieten flache Strecken, die Berge zahlreiche Trails – ideal, um im Training Höhenmeter zu sammeln. Die Höhenlage der Täler bringt zusätzlich einen leichten Trainingsreiz.

## Anreise und Radtransport

Aus Süddeutschland erreichst du Tirol mit Auto oder Bahn in wenigen Stunden, das eigene Rad fährt einfach mit. Die Flughäfen Innsbruck und München liegen nahe, von München ins Inntal brauchst du etwa eineinhalb bis zwei Stunden.

## Ruhetag

Innsbruck mit dem Goldenen Dachl und der Altstadt, die Swarovski Kristallwelten in Wattens und die Zillertalbahn sind beliebte Ausflugsziele. Mit den Bergbahnen kommst du bequem auf die Gipfel.

## Für wen eignet sich Tirol?

Tirol ist ideal für Sommer-Trainingslager mit vielen Höhenmetern, kühleren Temperaturen als im Süden und kurzer Anreise. Für Frühjahr und Herbst sind die Mittelmeerziele besser geeignet.$b$, 'salzburger-land', $c$Die Nachbarregionen sind beide Sommerziele mit Alpenpässen und Badeseen. Tirol bietet mehr hohe Pässe wie Kühtai und Timmelsjoch, das Salzburger Land die Großglockner-Hochalpenstraße und die wärmeren, klaren Seen im Salzkammergut.$c$),

('salzburger-land',
$s$Salzburger Land: Badeseen im Salzkammergut, die Großglockner-Hochalpenstraße und Zeller See – Sommer-Trainingslager von Juni bis September.$s$,
$b$Das Salzburger Land verbindet klare Badeseen wie den Fuschlsee und den Zeller See mit der Großglockner-Hochalpenstraße, einem der großen Alpenanstiege. Von Juni bis September liegen die Höchstwerte in den Tälern um 22 bis 25 °C.

Die Kehrseite: Die Saison ist kurz – außerhalb des Sommers ist es für Rad und Freiwasser zu kalt.

## Landschaft und Charakter

Das Salzburger Land reicht vom Salzkammergut mit seinen klaren Seen bis zu den Hohen Tauern mit dem Nationalpark und den höchsten Gipfeln Österreichs. Im Pinzgau um Zell am See und Kaprun liegen Seen und Gletscher nah beieinander, im Norden um Fuschl, Wolfgangsee und die Stadt Salzburg ist die Landschaft sanfter. Dazwischen liegen Almen, Täler und Pässe.

## Klima und beste Reisezeit

Das Salzburger Land ist ein Sommerziel. In den Tälern liegen die Tageshöchstwerte im Mai um 18 °C, von Juni bis August um 24 bis 25 °C, im September um 22 °C. Im Winter ist es zum Radtraining zu kalt. Nachmittagsgewitter sind im Sommer häufig, und auf den Pässen kann es auch im Juli kühl sein. Die besten Monate sind Juni bis September.

## Radfahren

Der Höhepunkt ist die Großglockner-Hochalpenstraße, die von Bruck und Fusch über das Hochtor auf über 2.500 m führt – einer der großen Alpenanstiege. Weitere Klassiker sind der Gerlospass, die Postalm und der Gaisberg bei Salzburg. Im Salzkammergut verbinden ruhigere Straßen die Seen, rund um den Zeller See gibt es flachere Runden.

## Schwimmen

Die Seen sind das große Plus der Region: Der Fuschlsee hat außergewöhnlich klares Wasser, Wolfgangsee und Zeller See bieten lange Uferabschnitte fürs Freiwasser. Im Juni ist das Wasser noch frisch, im Juli und August angenehm warm. Viele Orte haben Strandbäder mit abgegrenzten Schwimmbereichen.

## Laufen

Rund um die Seen führen flache Uferwege, etwa am Fuschlsee und am Zeller See. In den Bergen gibt es zahlreiche Trails, auf denen du Höhenmeter sammeln kannst.

## Anreise und Radtransport

Aus Süddeutschland erreichst du das Salzburger Land mit Auto oder Bahn schnell, das eigene Rad fährt einfach mit. Der Flughafen Salzburg liegt nah an Fuschl und am Wolfgangsee; nach Zell am See fährst du etwa eineinhalb Stunden, mit dem Zug geht es direkt dorthin.

## Ruhetag

Die Altstadt von Salzburg mit der Festung Hohensalzburg gehört zum UNESCO-Welterbe. Die Krimmler Wasserfälle sind mit 380 m die höchsten Österreichs, die Liechtensteinklamm bei St. Johann ist eine eindrucksvolle Schlucht, und eine Schifffahrt auf dem Wolfgangsee bietet Entspannung nach harten Tagen.

## Für wen eignet sich das Salzburger Land?

Das Salzburger Land passt zu Athleten, die im Sommer Freiwasser in klaren Seen und lange Alpenanstiege verbinden wollen – mit kurzer Anreise und angenehmen Temperaturen. Für Frühjahr und Herbst sind die Mittelmeerziele besser geeignet.$b$, 'tirol', $c$Beide sind Sommerziele mit Alpenpässen und Badeseen. Das Salzburger Land punktet mit der Großglockner-Hochalpenstraße und den klaren Seen im Salzkammergut, Tirol mit mehr hohen Pässen wie Kühtai und Timmelsjoch.$c$)

) AS v(slug, summary, body, compare_slug, compare_text) ON v.slug = r.slug
ON CONFLICT (region_id) DO UPDATE SET summary = EXCLUDED.summary, body = EXCLUDED.body, compare_slug = EXCLUDED.compare_slug,
  compare_text = EXCLUDED.compare_text, updated_at = now();
