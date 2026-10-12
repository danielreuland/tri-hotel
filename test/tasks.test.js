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
