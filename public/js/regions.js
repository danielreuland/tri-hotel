// Trainingsregionen: Filter sofort anwenden, beim Vergleich höchstens drei Regionen auswählbar
(function () {
  var filter = document.querySelector('.region-filter');
  if (filter) {
    filter.querySelectorAll('select').forEach(function (s) { s.addEventListener('change', function () { filter.submit(); }); });
  }
  var boxes = Array.prototype.slice.call(document.querySelectorAll('input[data-compare]'));
  function update() {
    var n = boxes.filter(function (b) { return b.checked; }).length;
    boxes.forEach(function (b) { b.disabled = !b.checked && n >= 3; });
  }
  boxes.forEach(function (b) { b.addEventListener('change', update); });
  update();
})();
