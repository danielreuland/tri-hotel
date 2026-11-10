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
      var multi = row.querySelector('[data-multi]');
      if (multi) {
        facts[row.dataset.crit] = Array.prototype.map.call(multi.querySelectorAll('[data-value]:checked'), function (b) { return b.value; });
        return;
      }
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

  // Vorschlag unverändert übernehmen: sofort speichern, Zeile als geprüft markieren
  form.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-accept-fact]');
    if (!btn) return;
    var row = btn.closest('tr[data-crit]');
    btn.disabled = true;
    fetch('/admin/meldungen/' + form.dataset.submission + '/fakten/' + row.dataset.crit + '/uebernehmen', {
      method: 'POST', headers: { Accept: 'application/json' }, credentials: 'same-origin',
    })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || 'Speichern fehlgeschlagen'); return j; }); })
      .then(function () {
        var trust = row.querySelector('[data-trust]');
        if (trust) trust.value = '2';
        row.classList.remove('state-auto');
        row.classList.add('state-ok', 'accepted');
        var badge = row.querySelector('[data-state-badge]');
        if (badge) { badge.className = 'badge good'; badge.textContent = '✓ übernommen'; }
        btn.remove();
        preview();
      })
      .catch(function (err) { btn.disabled = false; alert(err.message); });
  });

  form.addEventListener('input', function (e) {
    var row = e.target.closest('tr[data-crit]');
    if (row && e.target.matches('[data-value]')) {
      row.classList.add('changed');
      // Wert geändert: „Übernehmen“ passt nicht mehr, gespeichert wird mit „Fakten speichern“
      var accept = row.querySelector('[data-accept-fact]');
      if (accept) accept.remove();
      // Vom Admin geänderte Werte gelten als geprüft (Stufe 2), außer es ist bewusst Stufe 1 gewählt
      var trust = row.querySelector('[data-trust]');
      if (trust && trust.value !== '1') trust.value = '2';
    }
    clearTimeout(timer);
    timer = setTimeout(preview, 250);
  });

  // Nach abgelehntem Speichern: Eingaben stehen wieder im Formular – zur ersten offenen Zeile springen, Vorschau dazu rechnen
  var rejected = form.querySelector('tr[data-rejected]');
  if (rejected) {
    preview();
    setTimeout(function () { rejected.scrollIntoView({ block: 'center' }); }, 50);
  }
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
      .then(function (r) {
        // „In Arbeit“ ohne Zuständigen: der Server trägt den angemeldeten Admin ein
        var who = card.querySelector('[data-assign]');
        if (who && r && r.assignee && who.value !== r.assignee) { who.value = r.assignee; showAssignee(card, who); }
      })
      .catch(function (e) { alert(e.message); location.reload(); });
  }
  function showAssignee(card, sel) {
    var av = card.querySelector('.avatar');
    var name = sel.options[sel.selectedIndex].text;
    av.classList.toggle('none', !sel.value);
    av.textContent = sel.value ? name.split(/[\s._-]+/).filter(Boolean).slice(0, 2).map(function (p) { return p[0].toUpperCase(); }).join('') : '?';
    av.title = sel.value ? name : 'niemand zugewiesen';
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
        .then(function () { showAssignee(card, sel); })
        .catch(function (e) { alert(e.message); });
    });
  });
})();

// Detailseite: Abschnitte als Reiter. Ohne JavaScript bleiben alle Abschnitte untereinander sichtbar.
(function () {
  var bar = document.querySelector('[data-tabs]');
  if (!bar) return;
  var panels = document.querySelectorAll('[data-tab]');
  var links = bar.querySelectorAll('[data-tab-link]');
  var keys = Array.prototype.map.call(links, function (a) { return a.getAttribute('data-tab-link'); });
  function show(key) {
    if (keys.indexOf(key) < 0) key = keys[0];
    panels.forEach(function (p) { p.classList.toggle('tab-hidden', p.getAttribute('data-tab') !== key); });
    links.forEach(function (a) {
      var on = a.getAttribute('data-tab-link') === key;
      a.classList.toggle('on', on);
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
  }
  // Anker (aus Prüfliste, Board oder Rücksprung nach dem Speichern) öffnet den passenden Reiter
  function fromHash(scroll) {
    var id = decodeURIComponent(location.hash.slice(1));
    var el = id && document.getElementById(id);
    var panel = el && el.closest('[data-tab]');
    var key = panel ? panel.getAttribute('data-tab') : keys[0];
    show(key);
    if (scroll && el) el.scrollIntoView({ block: 'start' });
  }
  links.forEach(function (a) {
    a.addEventListener('click', function (e) {
      e.preventDefault();
      show(a.getAttribute('data-tab-link'));
      history.replaceState(null, '', a.getAttribute('href'));
      bar.scrollIntoView({ block: 'nearest' });
    });
  });
  window.addEventListener('hashchange', function () { fromHash(true); });
  fromHash(true);
})();

// „alle“ markieren: Kontrollkästchen mit data-check-all schaltet alle Kästchen derselben Tabelle
document.addEventListener('change', function (e) {
  if (!e.target.matches('[data-check-all]')) return;
  var table = e.target.closest('table');
  if (!table) return;
  table.querySelectorAll('input[type="checkbox"]:not([data-check-all])').forEach(function (b) { b.checked = e.target.checked; });
});

// Bilder hochladen: mehrere Dateien per Auswahl oder Drag & Drop (Prüfansicht → Inhalte). Die Dateien landen im normalen
// Dateifeld und gehen mit dem Formular ab; die Liste zeigt, was ausgewählt ist.
document.querySelectorAll('[data-file-drop]').forEach(function (zone) {
  var input = zone.querySelector('input[type=file]');
  var list = zone.querySelector('.file-drop-list');
  var maxFiles = Number(zone.dataset.maxFiles) || 0;
  var maxMb = Number(zone.dataset.maxMb) || 45;
  var types = (input.getAttribute('accept') || '').split(',');
  var mb = function (bytes) { return (bytes / 1048576).toFixed(1).replace('.', ',') + ' MB'; };
  var render = function () {
    var files = Array.prototype.slice.call(input.files || []);
    list.innerHTML = '';
    list.hidden = !files.length;
    var total = 0;
    var problem = '';
    files.forEach(function (f) {
      total += f.size;
      var li = document.createElement('li');
      li.textContent = f.name + ' · ' + mb(f.size);
      if (f.size > 8 * 1048576) { li.className = 'bad'; problem = 'Ein Bild ist größer als 8 MB.'; }
      list.appendChild(li);
    });
    if (!problem && maxFiles && files.length > maxFiles) problem = 'Zu viele Bilder: noch ' + maxFiles + ' möglich.';
    if (!problem && total > maxMb * 1048576) problem = 'Zusammen mehr als ' + maxMb + ' MB – bitte in zwei Schritten hochladen.';
    if (files.length) {
      var sum = document.createElement('li');
      sum.className = problem ? 'bad' : 'sum';
      sum.textContent = problem || (files.length + (files.length === 1 ? ' Bild' : ' Bilder') + ' · ' + mb(total));
      list.appendChild(sum);
    }
    if (files.length) {
      var li = document.createElement('li');
      var reset = document.createElement('button');
      reset.type = 'button';
      reset.className = 'btn small secondary';
      reset.textContent = 'Auswahl leeren';
      reset.addEventListener('click', function () { input.value = ''; render(); });
      li.appendChild(reset);
      list.appendChild(li);
    }
    input.setCustomValidity(problem);
  };
  input.addEventListener('change', render);
  ['dragenter', 'dragover'].forEach(function (name) {
    zone.addEventListener(name, function (e) { e.preventDefault(); zone.classList.add('drop-target'); });
  });
  ['dragleave', 'dragend'].forEach(function (name) {
    zone.addEventListener(name, function () { zone.classList.remove('drop-target'); });
  });
  zone.addEventListener('drop', function (e) {
    e.preventDefault();
    zone.classList.remove('drop-target');
    if (!e.dataTransfer || !e.dataTransfer.files.length) return;
    var dt = new DataTransfer();
    // bereits gewählte Dateien behalten, neue dazu (nur Bildformate des Feldes, keine Doppelten)
    Array.prototype.slice.call(input.files || []).concat(Array.prototype.slice.call(e.dataTransfer.files)).forEach(function (f) {
      var known = Array.prototype.some.call(dt.files, function (x) { return x.name === f.name && x.size === f.size; });
      if (types.indexOf(f.type) >= 0 && !known) dt.items.add(f);
    });
    input.files = dt.files;
    render();
  });
});

// Bild-Upload: Lizenz und Urhebervermerk je Quelle vorbelegen (nur leere oder zuvor vorbelegte Felder), frei änderbar
document.querySelectorAll('select[data-image-defaults]').forEach(function (select) {
  var defaults = {};
  try { defaults = JSON.parse(select.dataset.imageDefaults); } catch (e) { return; }
  var form = select.form;
  var apply = function () {
    var d = defaults[select.value] || {};
    ['license', 'credit'].forEach(function (name) {
      var field = form.querySelector('[name=' + name + ']');
      if (!field || (field.value && field.value !== field.dataset.prefill)) return;
      field.value = d[name] || '';
      field.dataset.prefill = field.value;
    });
  };
  select.addEventListener('change', apply);
  apply();
});
