// Admin, Grunddaten: Karte mit Koordinaten-Vorschlägen (nummerierte Punkte) und Klick zum Setzen der genauen Lage.
// <div data-geo-pick data-candidates="[[lat,lng],…]" data-current="[lat,lng]" data-center="[lat,lng]">
// + <form data-geo-click> mit hidden lat/lng; Leaflet wird nur bei Bedarf geladen (CSP: nur eigene Skripte).
(function () {
  var box = document.querySelector('[data-geo-pick]');
  if (!box) return;
  var form = document.querySelector('[data-geo-click]');
  var parse = function (v) { try { return v ? JSON.parse(v) : null; } catch (e) { return null; } };
  var candidates = parse(box.getAttribute('data-candidates')) || [];
  var current = parse(box.getAttribute('data-current'));
  var center = parse(box.getAttribute('data-center'));

  var css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = '/static/vendor/leaflet/leaflet.css';
  document.head.appendChild(css);
  var js = document.createElement('script');
  js.src = '/static/vendor/leaflet/leaflet.js';
  js.onload = function () {
    box.innerHTML = '';
    var start = current || candidates[0] || center || [47, 10];
    var zoom = current || candidates.length ? 16 : center ? 13 : 4;
    var map = L.map(box).setView(start, zoom);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>-Mitwirkende',
    }).addTo(map);
    var bounds = [];
    if (current) {
      L.circleMarker(current, { radius: 8, color: '#15803d', weight: 3, fillOpacity: 0.3 }).addTo(map).bindTooltip('gespeichert');
      bounds.push(current);
    }
    candidates.forEach(function (c, i) {
      L.marker(c, { icon: L.divIcon({ className: 'geo-num', html: String(i + 1), iconSize: [24, 24] }) }).addTo(map).bindTooltip('Vorschlag ' + (i + 1));
      bounds.push(c);
    });
    if (bounds.length > 1) map.fitBounds(bounds, { padding: [30, 30], maxZoom: 17 });

    var picked = null;
    map.on('click', function (ev) {
      var p = [Number(ev.latlng.lat.toFixed(6)), Number(ev.latlng.lng.toFixed(6))];
      if (picked) picked.setLatLng(p);
      else picked = L.marker(p, { draggable: true }).addTo(map);
      setForm(p);
      picked.on('dragend', function () {
        var ll = picked.getLatLng();
        setForm([Number(ll.lat.toFixed(6)), Number(ll.lng.toFixed(6))]);
      });
    });
    function setForm(p) {
      if (!form) return;
      form.querySelector('[name=lat]').value = p[0];
      form.querySelector('[name=lng]').value = p[1];
      form.querySelector('button').disabled = false;
      var hint = form.querySelector('[data-geo-hint]');
      if (hint) hint.textContent = 'Gesetzt: ' + p[0] + ', ' + p[1] + ' (Punkt lässt sich verschieben)';
    }
  };
  document.body.appendChild(js);
})();
