// Design-Kern: Farbschema hell/dunkel. Im <head> ohne defer laden, damit beim Laden nichts aufblitzt.
// Einstellungen am <html>-Element:
//   data-theme-default   "light" | "dark" | "system" (ohne Angabe: system)
//   data-theme-key       Name, unter dem die Wahl gespeichert wird (Standard: th-theme)
//   data-theme-cookie    Cookie-Domain, z. B. ".triprep.de": Wahl gilt dann auf allen Subdomains (zusätzlich zu localStorage)
// Umschalter: ein Button mit [data-theme-toggle]. Ohne Wahl folgt die Seite der Grundeinstellung bzw. dem System.
(function () {
  var root = document.documentElement;
  var KEY = root.getAttribute('data-theme-key') || 'th-theme';
  var COOKIE = root.getAttribute('data-theme-cookie');
  var media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  function readCookie() {
    var m = document.cookie.match(new RegExp('(?:^|; )' + KEY + '=(light|dark)'));
    return m ? m[1] : null;
  }
  function stored() {
    var v = COOKIE ? readCookie() : null;
    if (v) return v;
    try { v = localStorage.getItem(KEY); } catch (e) { v = null; }
    return v === 'light' || v === 'dark' ? v : null;
  }
  function save(theme) {
    try { localStorage.setItem(KEY, theme); } catch (e) { /* nur für diese Seite */ }
    if (COOKIE) document.cookie = KEY + '=' + theme + '; domain=' + COOKIE + '; path=/; max-age=31536000; SameSite=Lax' + (location.protocol === 'https:' ? '; Secure' : '');
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
    var label = theme === 'dark' ? 'Helles Farbschema' : 'Dunkles Farbschema';
    var btns = document.querySelectorAll('[data-theme-toggle]');
    for (var i = 0; i < btns.length; i++) { btns[i].setAttribute('aria-label', label); btns[i].setAttribute('title', label); }
    try { document.dispatchEvent(new CustomEvent('themechange', { detail: theme })); } catch (e) { /* alte Browser */ }
  }

  apply(current());
  if (media && media.addEventListener) {
    media.addEventListener('change', function () { if (!stored()) apply(current()); });
  }
  // Klick auf irgendeinen Umschalter (auch nachträglich eingefügte, z. B. aus einer Menüleiste per Skript)
  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('[data-theme-toggle]');
    if (!btn) return;
    var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    save(next);
    apply(next);
  });
  document.addEventListener('DOMContentLoaded', function () { apply(current()); });
  window.TriTheme = { current: current, set: function (t) { save(t); apply(t); } };
})();
