-- Redaktionstexte für Länderseiten (Paket C, B-31): Einstieg, Überblick mit Zwischenüberschriften ("## ") und eigene
-- häufige Fragen. Je Ranking, weil die Texte zum Thema des Rankings passen. Zahlen und Hotelangaben aus den geprüften Werten
-- (Stand 08.11.2026); Fragen zu Hotelzahl und Leistungen rechnet die Seite selbst aus den aktuellen Daten.
CREATE TABLE country_texts (
  ranking_id uuid NOT NULL REFERENCES rankings(id) ON DELETE CASCADE,
  country    char(2) NOT NULL,
  summary    text NOT NULL DEFAULT '',        -- ein Satz, zugleich Meta-Beschreibung (max. 160 Zeichen)
  body       text NOT NULL,                   -- Absätze durch Leerzeile, Zwischenüberschriften mit "## "
  faq        jsonb NOT NULL DEFAULT '[]',     -- [{ q, a }]
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ranking_id, country)
);

INSERT INTO country_texts (ranking_id, country, summary, body, faq)
SELECT r.id, v.country, v.summary, v.body, v.faq::jsonb
FROM rankings r, (VALUES
('DE',
 'Triathlon-Trainingslager in Deutschland: ohne Flug erreichbar, eigenes Rad im Auto, Hotels mit 50-m-Becken, Seen und Laufbahn in der Nähe.',
 $de$Ein Trainingslager muss nicht mit einem Flug beginnen. In Deutschland reist du mit dem Auto oder der Bahn an, nimmst dein eigenes Rad ohne Radkoffer mit und sparst dir den Transfer. Für ein langes Wochenende, die Pfingstferien oder einen Block vor dem Saisonhöhepunkt ist das oft die entspanntere Wahl.

Die geprüften Hotels liegen über das ganze Land verteilt: im Allgäu und im Schwarzwald mit hügeligem Radrevier, im Erzgebirge, im Sauerland, in Bayern und an den Seen im Norden.

## Wann lohnt sich Deutschland?
Für Rad und Freiwasser ist die Zeit von Mai bis September am besten. Im Frühjahr und Herbst kann es kühl und nass werden, dann zählen ein Becken im Haus und ein Laufband mit Steigung. Wer im Januar oder Februar in die Wärme will, findet im Süden Europas die passenderen Ziele.

## Schwimmen
Einige Hotels haben ein 50-m-Becken im Haus, bei anderen liegt eines im Umkreis von fünf Kilometern. Wo es keine Bahn im Hotel gibt, lohnt die Frage nach reservierten Zeiten im Hallenbad am Ort. Im Sommer kommt Freiwasser dazu: Einige Hotels liegen direkt an einem See oder haben einen See in wenigen Kilometern.

## Rad und Laufen
Am meisten Abwechslung auf dem Rad bieten das Allgäu und der Schwarzwald, mit Anstiegen und ruhigen Nebenstraßen. Im Norden ist das Gelände flach und gut für lange Grundlagenfahrten. Eine 400-m-Bahn in der Nähe haben unter anderem die Hotels in Immenstadt, Radevormwald und Ratzeburg.

## So vergleichst du
Die Liste unten ist nur nach dem TriScore sortiert. Bei jedem Hotel siehst du Becken, Radgarage, Freiwasser und Laufstrecken mit Herkunft und Prüfdatum.$de$,
 $f$[
  {"q":"Kann ich in Deutschland ein Trainingslager ohne Flug machen?","a":"Ja. Du reist mit dem Auto oder der Bahn an und nimmst dein eigenes Rad mit, ohne Radkoffer und Transfer. Das spart Kosten und Zeit, gerade bei kurzen Trainingsblöcken."},
  {"q":"Wann ist die beste Zeit für ein Trainingslager in Deutschland?","a":"Für Rad und Freiwasser von Mai bis September. Im Frühjahr und Herbst sind ein Becken im Hotel und ein Laufband mit Steigung wichtig, weil das Wetter wechselhaft ist."},
  {"q":"Wo finde ich in Deutschland ein Becken für das Schwimmtraining?","a":"Viele der geprüften Hotels haben ein Becken im Haus, einige davon 50 m lang. Bei anderen liegt ein 25- oder 50-m-Becken im Umkreis von fünf Kilometern; die Angabe steht bei jedem Hotel."}
 ]$f$),
('AT',
 'Triathlon-Trainingslager in Österreich: Hotels an Seen und Pässen, mit Becken im Haus, gut erreichbar mit Auto oder Bahn. Beste Zeit Mai bis Oktober.',
 $at$Österreich ist das Sommerziel für Triathleten aus dem Süden Deutschlands: wenige Stunden mit Auto oder Bahn, klare Seen zum Schwimmen und Alpenpässe für lange Radtage. Ein Flughafen liegt von jedem der geprüften Hotels höchstens anderthalb Stunden entfernt.

Die meisten Hotels liegen in Tirol und im Salzburger Land, dazu kommen Kärnten und die Steiermark.

## Wann lohnt sich Österreich?
Die beste Zeit ist von Mai bis Oktober. In Tirol und im Salzburger Land wird es im Hochsommer selten heiß, dafür gibt es Regentage, vor allem im Juli. Im Winter liegen die meisten Hotels im Schnee; für Training im Freien sind dann die Kanaren oder Zypern die bessere Wahl.

## Schwimmen
Fast alle geprüften Hotels haben ein 25-m-Becken im Haus, das Sportcamp Woferlgut sogar ein 50-m-Becken. Im Sommer lockt das Freiwasser: Jakob am See, Cortisen am See und das Hotel Hochschober haben einen sicheren Seezugang in höchstens einem Kilometer.

## Rad
Das Radrevier ist bergig und abwechslungsreich, mit bekannten Pässen und langen Tälern für Grundlagenfahrten. Wer flacher fahren will, findet in der Steiermark und rund um die Seen leichteres Gelände. Einige Hotels verleihen hochwertige Renn- und Zeitfahrräder.

## So vergleichst du
Die Liste unten ist nur nach dem TriScore sortiert. Klima, Radrevier und Wassertemperatur je Monat findest du auf den Seiten der Regionen Tirol und Salzburger Land.$at$,
 $f$[
  {"q":"Wann ist die beste Zeit für ein Trainingslager in Österreich?","a":"Von Mai bis Oktober. Im Hochsommer bleibt es in den Bergen angenehm kühl, im Juli gibt es allerdings die meisten Regentage."},
  {"q":"Kann ich in Österreich im See schwimmen?","a":"Ja, von Juni bis September. Einige der geprüften Hotels haben einen sicheren Seezugang in höchstens einem Kilometer, zum Beispiel Jakob am See, Cortisen am See und das Hotel Hochschober."},
  {"q":"Tirol oder Salzburger Land?","a":"Beide sind im Sommer ähnlich kühl. Tirol hat mehr Pässe, das Salzburger Land mehr ruhige Straßen. Den Direktvergleich mit Klima je Monat findest du auf der Seite Trainingsregionen."}
 ]$f$)
) AS v(country, summary, body, faq)
WHERE r.code = 'triathlon-hotel';
