-- Klicks auf Partnerlinks und zu Camp-Anbietern bis einschließlich 28.10.2026 waren Testklicks (Linkprüfung, Awin-/CJ-/
-- CHECK24-Tests, Prüfung der Anbieter-Links): zurücksetzen. Je Programm bzw. Anbieter ein Eintrag im Audit-Log mit der Zahl
-- der entfernten Klicks.
INSERT INTO admin_actions (entity_type, entity_id, action, diff)
SELECT 'partner_program', p.id, 'reset_partner_clicks',
       jsonb_build_object('until', '2026-10-28', 'clicks', sum(c.clicks), 'reason', 'Testklicks')
  FROM outbound_clicks c JOIN entity_links l ON l.id = c.target_id JOIN partner_programs p ON p.id = l.program_id
 WHERE c.kind = 'entity_link' AND c.day <= '2026-10-28'
 GROUP BY p.id
UNION ALL
-- Klicks auf inzwischen gelöschte Links (z. B. CHECK24-Links aus Migration 082/083): Eintrag je früherem Link
SELECT 'entity_link', c.target_id, 'reset_partner_clicks',
       jsonb_build_object('until', '2026-10-28', 'clicks', sum(c.clicks), 'note', 'Link gelöscht', 'reason', 'Testklicks')
  FROM outbound_clicks c
 WHERE c.kind = 'entity_link' AND c.day <= '2026-10-28' AND NOT EXISTS (SELECT 1 FROM entity_links l WHERE l.id = c.target_id)
 GROUP BY c.target_id
UNION ALL
SELECT 'partner_program', c.target_id, 'reset_partner_clicks',
       jsonb_build_object('until', '2026-10-28', 'clicks', sum(c.clicks), 'kind', 'partner_search', 'reason', 'Testklicks')
  FROM outbound_clicks c
 WHERE c.kind = 'partner_search' AND c.day <= '2026-10-28'
 GROUP BY c.target_id
UNION ALL
SELECT 'camp_provider', c.target_id, 'reset_camp_clicks',
       jsonb_build_object('until', '2026-10-28', 'clicks', sum(c.clicks), 'reason', 'Testklicks')
  FROM outbound_clicks c
 WHERE c.kind = 'camp' AND c.day <= '2026-10-28'
 GROUP BY c.target_id;

DELETE FROM outbound_clicks WHERE kind IN ('entity_link', 'partner_search', 'camp') AND day <= '2026-10-28';
