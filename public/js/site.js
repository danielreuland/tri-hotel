// Öffentliche Seiten: Monatsfilter, Zwei-Klick-Karte (Leaflet erst nach Zustimmung laden), Plausible-Ziele.
// Links und Buttons zählen beim Klick, alles andere (z. B. Überschrift einer Dankeseite) beim Aufruf.
// Zusatzangaben für Plausible: data-goal-prop-<name>="wert" (z. B. data-goal-prop-anbieter="Booking.com")
document.querySelectorAll('[data-goal]').forEach(function (el) {
  var props = {};
  for (var i = 0; i < el.attributes.length; i++) {
    var a = el.attributes[i];
    if (a.name.indexOf('data-goal-prop-') === 0) props[a.name.slice(15)] = a.value;
  }
  var send = function () {
    if (!window.plausible) return;
    if (Object.keys(props).length) window.plausible(el.getAttribute('data-goal'), { props: props });
    else window.plausible(el.getAttribute('data-goal'));
  };
  if (el.matches('a, button')) { el.addEventListener('click', send); return; }
  if (window.plausible) send(); else window.addEventListener('load', send);
});
document.querySelectorAll('select[data-autosubmit], input[data-autosubmit-check]').forEach(function (el) {
  el.addEventListener('change', function () { el.form.submit(); });
});

var mapBtn = document.getElementById('load-map');
if (mapBtn) {
  mapBtn.addEventListener('click', function () {
    var box = document.getElementById('map');
    var css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = '/static/vendor/leaflet/leaflet.css';
    document.head.appendChild(css);
    var js = document.createElement('script');
    js.src = '/static/vendor/leaflet/leaflet.js';
    js.onload = function () {
      var lat = Number(box.dataset.lat);
      var lng = Number(box.dataset.lng);
      box.innerHTML = '';
      box.classList.add('loaded');
      var map = L.map(box).setView([lat, lng], 13);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 18,
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>-Mitwirkende',
      }).addTo(map);
      L.marker([lat, lng]).addTo(map).bindPopup(box.dataset.name);
    };
    document.body.appendChild(js);
  });
}

// Fakten: alle Kategorien auf- bzw. zuklappen
document.querySelectorAll('[data-toggle-all]').forEach(function (btn) {
  var box = document.getElementById(btn.getAttribute('data-toggle-all'));
  if (!box) return;
  var items = box.querySelectorAll('details');
  var sync = function () {
    var allOpen = Array.prototype.every.call(items, function (d) { return d.open; });
    btn.textContent = btn.getAttribute(allOpen ? 'data-open-text' : 'data-closed-text');
    return allOpen;
  };
  btn.addEventListener('click', function () {
    var open = !sync();
    items.forEach(function (d) { d.open = open; });
    sync();
  });
  items.forEach(function (d) { d.addEventListener('toggle', sync); });
});

// Google-Bewertungen: Einbettung erst nach Klick (Zwei-Klick-Lösung)
document.querySelectorAll('[data-load-google]').forEach(function (btn) {
  btn.addEventListener('click', function () {
    var box = btn.closest('.g-embed');
    var frame = document.createElement('iframe');
    frame.src = box.getAttribute('data-src');
    frame.title = 'Google Maps mit Bewertungen';
    frame.loading = 'lazy';
    frame.referrerPolicy = 'strict-origin-when-cross-origin';
    frame.setAttribute('allowfullscreen', '');
    box.innerHTML = '';
    box.classList.add('loaded');
    box.appendChild(frame);
  });
});

// „hinzufügen“: Bewertung gleich mit abgeben – nicht für Betreiber; wer etwas ausfüllt, gibt eine Bewertung ab
(function () {
  var box = document.querySelector('[data-review-box]');
  if (!box) return;
  var fields = box.querySelector('[data-review-fields]');
  var note = box.querySelector('[data-owner-note]');
  var check = box.querySelector('input[name="with_review"]');
  var role = document.getElementById('role');
  function applyRole() {
    var owner = role && role.value === 'owner';
    fields.hidden = owner;
    note.hidden = !owner;
    if (owner && check) check.checked = false;
  }
  if (role) role.addEventListener('change', applyRole);
  applyRole();
  fields.addEventListener('change', function (e) {
    if (check && e.target !== check && e.target.name !== 'honest' && e.target.name !== 'photo_consent') check.checked = true;
  });
})();

// Formulare: beim Absenden Knopf sperren und Fortschritt zeigen (verhindert doppeltes Absenden)
document.querySelectorAll('form[data-sending]').forEach(function (form) {
  var btn = form.querySelector('button[type="submit"]');
  if (!btn) return;
  var label = btn.textContent;
  form.addEventListener('submit', function () {
    btn.disabled = true;
    btn.textContent = form.getAttribute('data-sending');
    form.setAttribute('aria-busy', 'true');
  });
  // Zurück-Taste (Seite aus dem Zwischenspeicher): Knopf wieder freigeben
  window.addEventListener('pageshow', function () { btn.disabled = false; btn.textContent = label; form.removeAttribute('aria-busy'); });
});
// Fehlerhinweise nach dem Absenden in den Blick rücken
(function () {
  var box = document.querySelector('[data-focus]');
  if (box) { box.scrollIntoView({ block: 'center' }); box.focus({ preventScroll: true }); }
})();

// Direktvergleich: Auswahl in der Liste (bis zu 3), Auswahl bleibt beim Filtern erhalten (sessionStorage)
(function () {
  var list = document.querySelector('[data-compare-list]');
  var again = document.querySelector('[data-compare-again]');
  var base = list ? list.getAttribute('data-compare-base') : (again && again.getAttribute('data-compare-base')) || '';
  var KEY = 'compare:' + base;
  function load() { try { return JSON.parse(sessionStorage.getItem(KEY)) || { active: false, picks: [] }; } catch (e) { return { active: false, picks: [] }; } }
  function save(s) { try { sessionStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* ohne Speicher */ } }

  // Vergleichsseite: „Andere vergleichen“ startet die Auswahl mit den aktuellen Objekten
  if (again) {
    again.addEventListener('click', function () {
      var picks = JSON.parse(again.getAttribute('data-compare-picks') || '[]');
      save({ active: true, picks: picks });
    });
  }
  if (!list) return;

  var MAX = Number(list.getAttribute('data-compare-max')) || 3;
  var toggle = document.querySelector('[data-compare-toggle]');
  var bar = document.querySelector('[data-compare-bar]');
  var status = bar && bar.querySelector('[data-compare-status]');
  var go = bar && bar.querySelector('[data-compare-go]');
  var cancel = bar && bar.querySelector('[data-compare-cancel]');
  var boxes = list.querySelectorAll('[data-compare-pick]');
  var state = load();
  if (!toggle || !bar) return;
  toggle.hidden = false;

  function render() {
    var on = state.active;
    toggle.setAttribute('aria-pressed', on ? 'true' : 'false');
    toggle.classList.toggle('on', on);
    document.body.classList.toggle('compare-mode', on);
    bar.hidden = !on;
    list.querySelectorAll('.compare-pick').forEach(function (l) { l.hidden = !on; });
    var slugs = state.picks.map(function (p) { return p.slug; });
    boxes.forEach(function (b) {
      b.checked = slugs.indexOf(b.value) >= 0;
      b.disabled = !b.checked && slugs.length >= MAX;
    });
    var n = state.picks.length;
    status.textContent = n
      ? state.picks.map(function (p) { return p.name; }).join(', ') + ' (' + n + ' von ' + MAX + ')'
      : 'Wähle bis zu ' + MAX + ' aus der Liste';
    var ready = n >= 2;
    go.setAttribute('aria-disabled', ready ? 'false' : 'true');
    go.classList.toggle('disabled', !ready);
    go.href = ready ? base + '/vergleich/' + slugs.join('-vs-') : '#';
  }

  toggle.addEventListener('click', function () {
    state.active = !state.active;
    if (!state.active) state.picks = [];
    save(state); render();
    if (state.active) list.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  cancel.addEventListener('click', function () { state = { active: false, picks: [] }; save(state); render(); });
  boxes.forEach(function (b) {
    b.addEventListener('change', function () {
      state.picks = state.picks.filter(function (p) { return p.slug !== b.value; });
      if (b.checked && state.picks.length < MAX) state.picks.push({ slug: b.value, name: b.getAttribute('data-name') });
      save(state); render();
    });
  });
  go.addEventListener('click', function (e) {
    if (go.getAttribute('aria-disabled') === 'true') { e.preventDefault(); return; }
    save({ active: false, picks: [] });
  });
  render();
})();

// Vergleichsseite: „Nur Unterschiede“ ohne Neuladen (Links funktionieren auch ohne JavaScript)
(function () {
  var table = document.querySelector('[data-compare-table]');
  if (!table) return;
  document.querySelectorAll('[data-diff-toggle]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      e.preventDefault();
      var only = a.getAttribute('data-diff-toggle') === 'unterschiede';
      table.classList.toggle('only-diff', only);
      document.querySelectorAll('[data-diff-toggle]').forEach(function (x) { x.classList.toggle('on', x === a); });
      try { history.replaceState(null, '', only ? '?nur=unterschiede' : location.pathname); } catch (err) { /* egal */ }
    });
  });
})();

// Partner-Direktlinks: Klick zählen, ohne die Weiterleitung zu verändern (keine eigene Zwischenadresse)
document.addEventListener('click', function (e) {
  var a = e.target.closest && e.target.closest('a[data-count]');
  if (!a || !navigator.sendBeacon) return;
  try { navigator.sendBeacon(a.getAttribute('data-count')); } catch (err) { /* Zählung ist optional */ }
}, true);

// Handy: Menü in der Kopfzeile auf- und zuklappen (ohne JavaScript bleibt die Navigation sichtbar)
(function () {
  var header = document.querySelector('.site-header');
  var btn = header && header.querySelector('.nav-toggle');
  if (!btn) return;
  btn.hidden = false;
  header.classList.add('has-toggle');
  btn.addEventListener('click', function () {
    var open = header.classList.toggle('nav-open');
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
})();

// Info-Hinweise: Blase am „i“ ausrichten (oberhalb, sonst unterhalb) und im Bildschirm halten; beim Scrollen mitführen
(function () {
  function place(tip) {
    var box = tip.querySelector('.info-tip-text');
    if (!box) return;
    var r = tip.getBoundingClientRect();
    var w = box.offsetWidth;
    var h = box.offsetHeight;
    var left = Math.min(Math.max(16, r.left + r.width / 2 - w / 2), window.innerWidth - w - 16);
    var top = r.top - h - 8;
    if (top < 8) top = r.bottom + 8;
    box.style.left = Math.round(left) + 'px';
    box.style.top = Math.round(top) + 'px';
  }
  function onEnter(e) {
    var tip = e.target.closest && e.target.closest('.info-tip');
    if (tip) requestAnimationFrame(function () { place(tip); });
  }
  document.addEventListener('mouseover', onEnter);
  document.addEventListener('focusin', onEnter);
  window.addEventListener('scroll', function () {
    var a = document.activeElement;
    if (a && a.classList && a.classList.contains('info-tip')) place(a);
  }, { passive: true });
})();
