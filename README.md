# tri-hotel.de

Neutrale, filterbare Rankings (erstes Ranking: Triathlon-Hotels). Konzept: `docs/konzept.pdf`, Projektregeln: `CLAUDE.md`.

## Start in Claude Code
1. Diesen Ordner als Git-Repository initialisieren: `git init && git add . && git commit -m "Projektstart"`
2. In diesem Ordner `claude` starten. CLAUDE.md wird automatisch gelesen.
3. PostgreSQL-Datenbank anlegen, dann `db/schema.sql` und `db/seed_criteria.sql` einspielen.
4. `.env.example` nach `.env` kopieren und ausfüllen.
5. Erster Auftrag an Claude Code: „Lies CLAUDE.md und docs/konzept.pdf und setze Schritt 1 und 2 der Umsetzungsreihenfolge um (Projektgerüst, Schema, Meldeformular mit Bestätigungsmail).“
