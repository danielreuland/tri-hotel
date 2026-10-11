const test = require('node:test');
const assert = require('node:assert/strict');
const inquiries = require('../src/services/inquiries');

test('inquiries.draftCriteria: unbekannt vor strittig vor Vorschlag, je nach Punkten, höchstens 8', () => {
  const opt = (id, pts) => ({ id, label: id, max_points: pts, scoring: { type: 'option', points: { a: pts, none: 0 } } });
  const criteria = [opt('auto', 12), opt('unk-small', 2), opt('unk-big', 6), opt('disp', 3), opt('ok', 10), { id: 'rate', max_points: 10, scoring: { type: 'rating', min: 0, max: 10 } }];
  const facts = [
    { criterion_id: 'auto', trust_level: 4, disputed: false },
    { criterion_id: 'disp', trust_level: 2, disputed: true },
    { criterion_id: 'ok', trust_level: 2, disputed: false },
  ];
  assert.deepEqual(inquiries.draftCriteria(criteria, facts).map((c) => c.id), ['unk-big', 'unk-small', 'disp', 'auto']);
  const many = Array.from({ length: 12 }, (_, i) => opt(`c${i}`, i));
  assert.equal(inquiries.draftCriteria(many, []).length, 8);
});
