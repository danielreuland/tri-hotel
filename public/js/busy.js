// Längere Aktionen (z. B. KI formuliert): <form data-busy="Text"> sperrt den Absende-Knopf und zeigt den Text an.
// Läuft nach confirm.js (Rückfrage abgebrochen = kein Sperren).
document.addEventListener('submit', function (e) {
  var form = e.target.closest && e.target.closest('form[data-busy]');
  if (!form || e.defaultPrevented) return;
  var btn = e.submitter || form.querySelector('button[type=submit], button:not([type])');
  // nur der Hauptknopf (nicht z. B. „verwerfen“ mit formaction)
  if (!btn || btn.hasAttribute('formaction')) return;
  setTimeout(function () {
    btn.disabled = true;
    btn.textContent = form.getAttribute('data-busy');
  }, 0);
});

// Rückmeldungen (Toasts): schließen per ×, Erfolgsmeldungen verschwinden nach 7 Sekunden; Fehler bleiben stehen
(function () {
  var wrap = document.querySelector('[data-toasts]');
  if (!wrap) return;
  wrap.addEventListener('click', function (e) {
    var x = e.target.closest('.toast-x');
    if (x) x.closest('.toast').remove();
  });
  wrap.querySelectorAll('.toast.ok').forEach(function (t) {
    setTimeout(function () { t.classList.add('fade'); setTimeout(function () { t.remove(); }, 400); }, 7000);
  });
})();
