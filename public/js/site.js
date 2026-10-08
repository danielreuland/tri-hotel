// Öffentliche Seiten: Monatsfilter und Zwei-Klick-Karte (Leaflet erst nach Zustimmung laden).
document.querySelectorAll('select[data-autosubmit]').forEach(function (el) {
  el.addEventListener('change', function () { el.form.submit(); });
});

var mapBtn = document.getElementById('load-map');
if (mapBtn) {
  mapBtn.addEventListener('click', function () {
    var box = document.getElementById('map');
    var css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(css);
    var js = document.createElement('script');
    js.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
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
