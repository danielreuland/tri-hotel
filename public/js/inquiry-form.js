// Antwortformular: alle bekannten Werte auf einmal als „stimmt“ markieren. Ohne JavaScript bleibt der Knopf verborgen.
(function () {
  var btn = document.querySelector('[data-confirm-all]');
  if (!btn) return;
  btn.hidden = false;
  btn.addEventListener('click', function () {
    Array.prototype.forEach.call(document.querySelectorAll('input[type="radio"][name^="k_"][value="ok"]'), function (el) {
      var chosen = document.querySelector('input[type="radio"][name="' + el.name + '"]:checked');
      if (!chosen) el.checked = true; // bereits gewählte Korrekturen bleiben
    });
  });
})();
