// Hotel-Finder auf der Startseite: Trefferzahl live (gleiche Filter wie die Liste), Wetter erst mit Reisemonat.
// Ohne JavaScript funktioniert das Formular normal (GET auf die Liste).
(function () {
  var form = document.querySelector('form[data-finder]');
  if (!form) return;
  var btn = form.querySelector('[data-finder-submit]');
  var live = form.querySelector('[data-finder-live]');
  var weather = form.querySelector('[data-needs-month]');
  var hint = form.querySelector('[data-month-hint]');
  var noun = form.getAttribute('data-noun') || '';
  var nounSg = form.getAttribute('data-noun-sg') || noun;
  var timer = null;
  var seq = 0;

  function params() {
    var p = new URLSearchParams();
    new FormData(form).forEach(function (v, k) { if (v !== '') p.append(k, v); });
    return p;
  }

  function syncWeather() {
    var month = form.querySelector('input[name="monat"]:checked');
    var on = Boolean(month && month.value);
    if (weather) weather.disabled = !on;
    if (hint) hint.hidden = on;
  }

  function update() {
    var mine = ++seq;
    fetch(form.getAttribute('data-count-url') + '?' + params().toString(), { headers: { Accept: 'application/json' }, credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (mine !== seq) return;
        btn.textContent = d.count ? d.count + ' ' + (d.count === 1 ? nounSg : noun) + ' anzeigen' : 'Keine Treffer – trotzdem ansehen';
        live.textContent = d.count
          ? d.count + ' von ' + d.total + ' ' + noun + ' im Ranking passen' + (d.incomplete ? ' (dazu ' + d.incomplete + ' mit noch unvollständigem Profil)' : '') + '.'
          : 'Nichts passt zu allen Wünschen. In der Liste zeigen wir dir, welcher Filter wie viele ' + noun + ' zurückbringt.';
      })
      .catch(function () { /* Zählen ist optional */ });
  }

  form.addEventListener('change', function () {
    syncWeather();
    clearTimeout(timer);
    timer = setTimeout(update, 150);
  });

  // Leere Angaben nicht mitschicken (saubere Adresse der Liste)
  form.addEventListener('submit', function () {
    Array.prototype.forEach.call(form.elements, function (el) {
      if (el.name && (el.value === '' || (el.type === 'radio' && el.checked && el.value === ''))) el.disabled = true;
    });
  });

  // Zurück-Navigation: deaktivierte Felder wieder freigeben
  window.addEventListener('pageshow', function () {
    Array.prototype.forEach.call(form.elements, function (el) { if (el.name) el.disabled = false; });
    syncWeather();
  });

  syncWeather();
})();
