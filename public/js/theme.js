// Farbschema hell/dunkel. Wird im <head> ohne defer geladen, damit beim Laden nichts aufblitzt.
// Ohne gespeicherte Wahl gilt html[data-theme-default]: "light" (öffentliche Seiten) oder "system" (Admin).
// Die Wahl bleibt nur in diesem Browser (localStorage).
(function () {
  var KEY = 'th-theme';
  var root = document.documentElement;
  var media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  function stored() {
    try { return localStorage.getItem(KEY); } catch (e) { return null; }
  }
  function fallback() {
    var d = root.getAttribute('data-theme-default');
    if (d === 'light' || d === 'dark') return d;
    return media && media.matches ? 'dark' : 'light';
  }
  function current() {
    return stored() || fallback();
  }
  function apply(theme) {
    root.setAttribute('data-theme', theme);
    var btn = document.querySelector('[data-theme-toggle]');
    if (btn) {
      var label = theme === 'dark' ? 'Helles Farbschema' : 'Dunkles Farbschema';
      btn.setAttribute('aria-label', label);
      btn.setAttribute('title', label);
    }
  }

  apply(current());
  if (media && media.addEventListener) {
    media.addEventListener('change', function () { if (!stored()) apply(current()); });
  }
  document.addEventListener('DOMContentLoaded', function () {
    apply(current());
    var btn = document.querySelector('[data-theme-toggle]');
    if (!btn) return;
    btn.addEventListener('click', function () {
      var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem(KEY, next); } catch (e) { /* nur für diese Seite */ }
      apply(next);
    });
  });
})();
