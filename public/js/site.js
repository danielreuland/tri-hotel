// Öffentliche Seiten: Monatsfilter, Zwei-Klick-Karte (Leaflet erst nach Zustimmung laden), Plausible-Ziele.
document.querySelectorAll('[data-goal]').forEach(function (el) {
  var send = function () { if (window.plausible) window.plausible(el.getAttribute('data-goal')); };
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
