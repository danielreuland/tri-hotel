// Slider im Kopfbereich der Startseite: Top-Objekte wechseln alle 5 Sekunden (data-interval).
// Hält an bei Maus oder Tastaturfokus im Slider, bei verstecktem Tab und mit „Bewegung reduzieren“ (dann nur Punkte).
// Ohne JavaScript bleibt die erste Folie stehen.
(function () {
  var root = document.querySelector('[data-hero-slider]');
  if (!root) return;
  var slides = root.querySelectorAll('[data-slide]');
  var dots = root.querySelectorAll('[data-slider-dot]');
  var pauseBtn = root.querySelector('[data-slider-pause]');
  if (slides.length < 2) return;
  var interval = Number(root.getAttribute('data-interval')) || 5000;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var current = Math.max(0, Number(root.getAttribute('data-start')) || 0);
  var timer = null;
  var hovering = false;
  var stopped = reduce; // vom Nutzer angehalten (oder reduzierte Bewegung)

  function preload(i) {
    var img = slides[i] && slides[i].querySelector('img[loading="lazy"]');
    if (img) img.loading = 'eager';
  }

  function show(i) {
    current = (i + slides.length) % slides.length;
    Array.prototype.forEach.call(slides, function (s, k) {
      var on = k === current;
      s.classList.toggle('is-active', on);
      if (on) { s.removeAttribute('aria-hidden'); s.removeAttribute('tabindex'); }
      else { s.setAttribute('aria-hidden', 'true'); s.setAttribute('tabindex', '-1'); }
    });
    Array.prototype.forEach.call(dots, function (d, k) {
      d.classList.toggle('is-active', k === current);
      if (k === current) d.setAttribute('aria-current', 'true'); else d.removeAttribute('aria-current');
    });
    preload((current + 1) % slides.length);
  }

  function running() { return !stopped && !hovering && !document.hidden; }
  function schedule() {
    clearTimeout(timer);
    if (running()) timer = setTimeout(function () { show(current + 1); schedule(); }, interval);
  }

  function setStopped(v) {
    stopped = v;
    if (pauseBtn) {
      pauseBtn.textContent = v ? '▶' : '❚❚';
      pauseBtn.setAttribute('aria-label', v ? 'Wechsel fortsetzen' : 'Wechsel anhalten');
    }
    schedule();
  }

  Array.prototype.forEach.call(dots, function (d) {
    d.addEventListener('click', function () { show(Number(d.getAttribute('data-slider-dot'))); schedule(); });
  });
  if (pauseBtn) {
    pauseBtn.hidden = false;
    pauseBtn.addEventListener('click', function () { setStopped(!stopped); });
  }
  root.addEventListener('mouseenter', function () { hovering = true; schedule(); });
  root.addEventListener('mouseleave', function () { hovering = false; schedule(); });
  root.addEventListener('focusin', function () { hovering = true; schedule(); });
  root.addEventListener('focusout', function (e) { if (!root.contains(e.relatedTarget)) { hovering = false; schedule(); } });
  document.addEventListener('visibilitychange', schedule);

  setStopped(stopped);
  preload((current + 1) % slides.length);
})();
