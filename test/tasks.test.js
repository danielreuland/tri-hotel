const test = require('node:test');
const assert = require('node:assert/strict');
const tasks = require('../src/services/tasks');

test('tasks: Spalten und Labels, Fingerabdruck ändert sich mit dem Inhalt', () => {
  assert.deepEqual(Object.keys(tasks.STATUSES), ['open', 'in_progress', 'done']);
  for (const k of ['review', 'answers', 'draft', 'manual']) assert.ok(tasks.LABELS[k], k);
  const a = tasks.fingerprint([{ level: 'todo', text: '5 Vorschläge' }]);
  assert.equal(a, tasks.fingerprint([{ level: 'todo', text: '5 Vorschläge' }]));
  assert.notEqual(a, tasks.fingerprint([{ level: 'todo', text: '7 Vorschläge' }]));
});

test('Admin-Menü: je Reiter offene Vorgänge, die Summe ist die Zahl im Hauptmenü', () => {
  const { commTabCounts } = require('../src/lib/adminnav');
  const tabs = commTabCounts({ mail: 1, inquiries: 2, reviews: 0, contact: 3, leads: 0 });
  assert.deepEqual(tabs, { '/admin/postfach': 1, '/admin/anfragen': 2, '/admin/bewertungen': 0, '/admin/kontakt': 3, '/admin/camp-anfragen': 0 });
  assert.equal(Object.values(tabs).reduce((a, b) => a + b, 0), 6);
});
