// Fotoseite: Tripadvisor-Fotos erst nach Klick laden (ein Abruf je Anzeige). Die Bildadressen kommen von unserem Server,
// die Bilder selbst lädt der Browser direkt von Tripadvisor. Inhalte von Tripadvisor werden nirgends gespeichert.
(function () {
  var box = document.getElementById('ta-photos');
  if (!box) return;
  var btn = document.getElementById('ta-load');
  var consent = document.getElementById('ta-consent');
  var gallery = document.getElementById('ta-gallery');
  var empty = document.getElementById('ta-empty');
  var started = false;

  function fail() {
    consent.hidden = true;
    gallery.hidden = true;
    empty.hidden = false;
  }

  function show(data) {
    if (!data || !data.available || !data.photos || !data.photos.length) return fail();
    gallery.setAttribute('data-n', String(Math.min(data.photos.length, 5)));
    data.photos.forEach(function (p) {
      var fig = document.createElement('figure');
      var link = document.createElement('a');
      link.href = box.getAttribute('data-page');
      link.target = '_blank';
      link.rel = 'noopener';
      var img = document.createElement('img');
      img.src = p.url;
      img.loading = 'lazy';
      img.alt = p.caption || ('Foto von ' + box.getAttribute('data-name') + ' bei Tripadvisor');
      if (p.width && p.height) { img.width = p.width; img.height = p.height; }
      link.appendChild(img);
      fig.appendChild(link);
      var cap = document.createElement('figcaption');
      var who = p.source === 'Management' ? 'Foto des Betreibers' : (p.username ? 'Foto: ' + p.username : 'Foto eines Gastes');
      cap.textContent = [p.caption, who + ' · Tripadvisor'].filter(Boolean).join(' – ');
      fig.appendChild(cap);
      gallery.appendChild(fig);
    });
    consent.hidden = true;
    gallery.hidden = false;
  }

  function load() {
    if (started) return;
    started = true;
    btn.disabled = true;
    btn.textContent = 'Fotos werden geladen …';
    fetch(box.getAttribute('data-url'), { method: 'POST', headers: { Accept: 'application/json' }, credentials: 'same-origin' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(show)
      .catch(fail);
  }

  btn.addEventListener('click', load);
  // Kam der Besucher über den Knopf „Fotos ansehen (Tripadvisor)“ der Objektseite, gilt jener Klick: gleich laden
  try {
    if (window.sessionStorage.getItem('ta-go') === box.getAttribute('data-key')) {
      window.sessionStorage.removeItem('ta-go');
      load();
    }
  } catch (e) { /* kein Speicher verfügbar: Knopf bleibt */ }
})();
