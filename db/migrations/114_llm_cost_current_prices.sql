-- Kosten der KI-Aufrufe mit den richtigen Listenpreisen neu berechnen (11.11.2026): Die App rechnete Sonnet 5.5 mit 3/15 $
-- und Opus 5.5 mit 5/25 $ je 1 Mio. Tokens (Preise älterer Modelle), richtig sind 2/10 $ und 4/20 $. Dadurch stand der
-- Budget-Wächter bei 20,05 $, während die Claude Console rund 14 $ zeigte. Gebühren der Websuche bleiben erhalten
-- (alte Token-Kosten abziehen, neue addieren); Cache-Tokens gab es bisher nicht.
UPDATE llm_usage SET cost_usd = GREATEST(round((cost_usd - (input_tokens * 3 + output_tokens * 15) / 1e6
                                                 + (input_tokens * 2 + output_tokens * 10) / 1e6)::numeric, 4), 0)
 WHERE model = 'claude-sonnet-5-5' AND cache_read_tokens = 0 AND cache_write_tokens = 0;

UPDATE llm_usage SET cost_usd = GREATEST(round((cost_usd - (input_tokens * 5 + output_tokens * 25) / 1e6
                                                 + (input_tokens * 4 + output_tokens * 20) / 1e6)::numeric, 4), 0)
 WHERE model = 'claude-opus-5-5' AND cache_read_tokens = 0 AND cache_write_tokens = 0;
