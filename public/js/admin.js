// Admin: Live-Score-Vorschau beim Bearbeiten der Fakten, Autosubmit für Filter.
document.querySelectorAll('select[data-autosubmit]').forEach(function (el) {
  el.addEventListener('change', function () { el.form.submit(); });
});

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
