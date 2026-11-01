// Hotel-Finder im Hero der Startseite: Trefferzahl live (gleiche Filter wie die Liste), Wetter und Regen erst mit Reisemonat,
// Zahl der gewählten Ausstattung am Aufklapper. Ohne JavaScript funktioniert das Formular normal (GET auf die Liste).
(function () {
  var form = document.querySelector('form[data-finder]');
  if (!form) return;
  var btn = form.querySelector('[data-finder-submit]');
  var live = form.querySelector('[data-finder-live]');
  var n = form.querySelector('[data-finder-n]');
  var more = form.querySelector('.hf-more');
  var noun = form.getAttribute('data-noun') || '';
  var nounSg = form.getAttribute('data-noun-sg') || noun;
  var intro = live ? live.textContent : '';
  var timer = null;
  var seq = 0;

  function params() {
    var p = new URLSearchParams();
    new FormData(form).forEach(function (v, k) { if (v !== '') p.append(k, v); });
    return p;
  }

  function sync() {
    var month = form.elements.monat && form.elements.monat.value;
    ['wetter', 'regen'].forEach(function (name) {
      var el = form.elements[name];
      if (el) el.disabled = !month;
    });
    if (n) {
      var k = form.querySelectorAll('input[name="l"]:checked').length;
      n.textContent = k ? String(k) : '';
    }
  }

  function update() {
    var mine = ++seq;
    var p = params();
    fetch(form.getAttribute('data-count-url') + '?' + p.toString(), { headers: { Accept: 'application/json' }, credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (mine !== seq) return;
        btn.textContent = d.count ? d.count + ' ' + (d.count === 1 ? nounSg : noun) + ' anzeigen' : 'Keine Treffer – Liste ansehen';
        if (!live) return;
        if (![...p.keys()].length) live.textContent = intro;
        else live.textContent = d.count
          ? d.count + ' von ' + d.total + ' ' + noun + ' passen' + (d.incomplete ? ' (dazu ' + d.incomplete + ' mit unvollständigem Profil)' : '') + '.'
          : 'Nichts passt zu allen Wünschen – die Liste zeigt dir, welcher Filter wie viele ' + noun + ' zurückbringt.';
      })
      .catch(function () { /* Zählen ist optional */ });
  }

  function changed() {
    sync();
    clearTimeout(timer);
    timer = setTimeout(update, 200);
  }
  form.addEventListener('change', changed);
  form.addEventListener('input', function (e) { if (e.target.name === 'q') changed(); });

  // Ausstattung schließen bei Klick außerhalb oder Escape
  document.addEventListener('click', function (e) { if (more && more.open && !more.contains(e.target)) more.open = false; });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && more && more.open) { more.open = false; more.querySelector('summary').focus(); } });

  // Leere Angaben nicht mitschicken (saubere Adresse der Liste)
  form.addEventListener('submit', function () {
    Array.prototype.forEach.call(form.elements, function (el) { if (el.name && el.value === '') el.disabled = true; });
  });
  // Zurück-Navigation: Felder wieder freigeben
  window.addEventListener('pageshow', function () {
    Array.prototype.forEach.call(form.elements, function (el) { if (el.name) el.disabled = false; });
    sync();
  });

  sync();
})();
