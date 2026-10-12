// Admin: Live-Score-Vorschau beim Bearbeiten der Fakten, Autosubmit für Filter.
document.querySelectorAll('select[data-autosubmit]').forEach(function (el) {
  el.addEventListener('change', function () { el.form.submit(); });
});

// Prüfansicht: nur offene Fakten (Vorschläge, fehlende, strittige) zeigen; Wahl bleibt im Browser gespeichert
(function () {
  var box = document.getElementById('only-open');
  var form = document.getElementById('facts-form');
  if (!box || !form) return;
  var apply = function () { form.classList.toggle('only-open', box.checked); };
  try { box.checked = localStorage.getItem('onlyOpenFacts') === '1'; } catch (e) { /* ohne Speicher */ }
  apply();
  box.addEventListener('change', function () {
    apply();
    try { localStorage.setItem('onlyOpenFacts', box.checked ? '1' : '0'); } catch (e) { /* ohne Speicher */ }
  });
})();

(function () {
  var form = document.getElementById('facts-form');
  if (!form) return;
  var timer = null;

  function collect() {
    var facts = {};
    form.querySelectorAll('tr[data-crit]').forEach(function (row) {
      var input = row.querySelector('[data-value]');
      if (input) facts[row.dataset.crit] = input.value;
    });
    return facts;
  }

  function setText(id, text) {
    var el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  function preview() {
    fetch('/admin/api/score-preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ submissionId: form.dataset.submission, facts: collect() }),
    })
      .then(function (r) { return r.json(); })
      .then(function (r) {
        setText('pv-score', r.score === null ? '–' : r.score);
        setText('pv-label', r.label || '');
        setText('pv-f', r.factScore === null ? '–' : r.factScore);
        setText('pv-c', r.completeness);
        setText('pv-eligible', r.eligible ? 'im Ranking' : 'nicht im Ranking');
        var ko = document.getElementById('pv-ko');
        if (ko) {
          ko.style.display = r.ko ? '' : 'none';
          ko.querySelector('span').textContent = r.koReason || '';
        }
        (r.details || []).forEach(function (d) {
          var row = form.querySelector('tr[data-crit="' + d.id + '"]');
          if (!row) return;
          var pts = row.querySelector('[data-pts]');
          if (pts) pts.textContent = d.known ? d.points : d.invalid ? '!' : '–';
        });
      })
      .catch(function () { /* Vorschau ist optional */ });
  }

  form.addEventListener('input', function (e) {
    var row = e.target.closest('tr[data-crit]');
    if (row && e.target.matches('[data-value]')) {
      row.classList.add('changed');
      // Vom Admin geänderte Werte gelten als geprüft (Stufe 2), außer es ist bewusst Stufe 1 gewählt
      var trust = row.querySelector('[data-trust]');
      if (trust && trust.value !== '1') trust.value = '2';
    }
    clearTimeout(timer);
    timer = setTimeout(preview, 250);
  });
})();


// Aufgaben: Kanban mit Drag & Drop; Spalte und Zuständigkeit auch per Auswahlliste (ohne Maus)
(function () {
  var board = document.querySelector('.board');
  if (!board) return;
  var dragged = null;

  function post(url, body) {
    return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body), credentials: 'same-origin' })
      .then(function (r) { if (!r.ok) throw new Error('Speichern fehlgeschlagen'); return r.json(); });
  }
  function counts() {
    board.querySelectorAll('.task-col').forEach(function (col) {
      col.querySelector('.count').textContent = col.querySelectorAll('.task-card').length;
    });
  }
  function save(card) {
    var col = card.closest('.task-col');
    var status = col.getAttribute('data-status');
    var order = Array.prototype.map.call(col.querySelectorAll('.task-card'), function (c) { return c.getAttribute('data-id'); });
    var sel = card.querySelector('[data-move]');
    if (sel) sel.value = status;
    counts();
    return post('/admin/aufgaben/' + card.getAttribute('data-id') + '/verschieben', { status: status, order: order })
      .catch(function (e) { alert(e.message); location.reload(); });
  }
  function afterElement(list, y) {
    var cards = Array.prototype.filter.call(list.querySelectorAll('.task-card'), function (c) { return c !== dragged; });
    for (var i = 0; i < cards.length; i++) {
      var box = cards[i].getBoundingClientRect();
      if (y < box.top + box.height / 2) return cards[i];
    }
    return null;
  }

  board.addEventListener('dragstart', function (e) {
    var card = e.target.closest && e.target.closest('.task-card');
    if (!card) return;
    dragged = card;
    card.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', card.getAttribute('data-id'));
  });
  board.addEventListener('dragend', function () {
    if (dragged) dragged.classList.remove('dragging');
    board.querySelectorAll('.drop-target').forEach(function (l) { l.classList.remove('drop-target'); });
    dragged = null;
  });
  board.querySelectorAll('.task-list').forEach(function (list) {
    list.addEventListener('dragover', function (e) {
      if (!dragged) return;
      e.preventDefault();
      list.classList.add('drop-target');
      var after = afterElement(list, e.clientY);
      var empty = list.querySelector('.empty');
      if (after) list.insertBefore(dragged, after); else list.insertBefore(dragged, empty);
    });
    list.addEventListener('dragleave', function (e) { if (!list.contains(e.relatedTarget)) list.classList.remove('drop-target'); });
    list.addEventListener('drop', function (e) {
      e.preventDefault();
      list.classList.remove('drop-target');
      if (dragged) save(dragged);
    });
  });

  // Auswahlliste „Spalte“: Karte ans Ende der Zielspalte
  board.querySelectorAll('[data-move]').forEach(function (sel) {
    sel.addEventListener('change', function () {
      var card = sel.closest('.task-card');
      var list = board.querySelector('.task-col[data-status="' + sel.value + '"] .task-list');
      list.insertBefore(card, list.querySelector('.empty'));
      save(card);
    });
  });
  // Zuständigkeit sofort speichern
  board.querySelectorAll('[data-assign]').forEach(function (sel) {
    sel.addEventListener('change', function () {
      var card = sel.closest('.task-card');
      post('/admin/aufgaben/' + card.getAttribute('data-id') + '/zuweisen', { assignee_id: sel.value })
        .then(function () {
          var av = card.querySelector('.avatar');
          var name = sel.options[sel.selectedIndex].text;
          av.classList.toggle('none', !sel.value);
          av.textContent = sel.value ? name.split(/[\s._-]+/).filter(Boolean).slice(0, 2).map(function (p) { return p[0].toUpperCase(); }).join('') : '?';
          av.title = sel.value ? name : 'niemand zugewiesen';
        })
        .catch(function (e) { alert(e.message); });
    });
  });
})();
