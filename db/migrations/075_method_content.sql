-- Methodik-Seite (/triscore) für Suchanfragen wie „Triathlon-Hotel Kriterien“: Titel, Beschreibung, H1, Einstieg und häufige
-- Fragen als Landingpage-Texte des Rankings (im Admin unter Rankings → Landingpage-Texte änderbar). Platzhalter {score},
-- {objekte}, {kriterien}, {bereiche}, {min_completeness}, {recheck_months} füllt die Seite aus den aktuellen Daten.
-- Vorhandene Schlüssel bleiben unverändert.
UPDATE rankings SET content = jsonb_build_object(
  'method_title', '{score}: So bewerten wir Triathlon-Hotels – {kriterien} Kriterien offen erklärt',
  'method_description', 'Woran erkennt man ein gutes Triathlon-Hotel? Der {score} prüft Becken, Radgarage, Laufstrecken und Verpflegung – offene Formel, Partner ändern nichts.',
  'method_h1', 'So bewerten wir Triathlon-Hotels: der {score}',
  'method_intro', E'Ein gutes Hotel für das Triathlon-Trainingslager braucht mehr als einen Pool und schönes Wetter: Gibt es ein 50-m-Becken oder reservierte Bahnen? Kann das Rad sicher abgestellt werden? Startet eine flache Laufrunde direkt am Hotel? Gibt es nach der langen Ausfahrt etwas Vernünftiges zu essen?\n\nGenau diese Fragen beantwortet der {score}. Er bewertet jedes Hotel nach denselben {kriterien} Kriterien aus {bereiche} und fasst sie in einer Zahl von 0 bis 100 zusammen. Formel, Gewichte und Quellen sind vollständig offen.',
  'method_faq', jsonb_build_array(
    jsonb_build_object('q', 'Was ist ein gutes Hotel für ein Triathlon-Trainingslager?',
      'a', 'Ein Hotel, das alle drei Disziplinen ohne lange Wege ermöglicht: ein trainingstaugliches Becken, idealerweise 50 m lang oder mit reservierten Bahnen, ein sicherer Platz für das Rad, ein gutes Radrevier, Laufstrecken ab dem Haus und Verpflegung, die zu hohen Trainingsumfängen passt.'),
    jsonb_build_object('q', 'Warum zählt das Wetter nicht zum {score}?',
      'a', 'Die beste Reisezeit hängt von deinem Trainingsplan ab, nicht von der Qualität des Hotels. Deshalb zeigen wir Klima und beste Reisezeit auf jeder Hotel- und Regionsseite getrennt an.'),
    jsonb_build_object('q', 'Können Hotels sich einen besseren {score} kaufen?',
      'a', 'Nein. Partner-, Affiliate- und Werbestatus haben keinen Einfluss auf den Score oder die Reihenfolge der Hotels.'),
    jsonb_build_object('q', 'Was passiert, wenn Angaben fehlen?',
      'a', 'Unbekannte Werte zählen mit dem Durchschnitt aller geprüften Hotels – fehlende Angaben bringen also weder Vor- noch Nachteile. Ins Ranking kommt ein Hotel erst, wenn mindestens {min_completeness} % der Punktegewichte belegt sind.'),
    jsonb_build_object('q', 'Wie oft werden die Werte geprüft?',
      'a', 'Werte, die älter als {recheck_months} Monate sind, prüfen wir neu. Bei jedem Wert stehen Quelle und Prüfdatum auf der Hotelseite.')
  )
) || COALESCE(content, '{}'::jsonb)
WHERE code = 'triathlon-hotel';
