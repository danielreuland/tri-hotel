// Mehrfachauswahl mit Suche: <select multiple data-combo data-placeholder="…"> wird zu Chips + Suchfeld + Trefferliste.
// Ohne JavaScript bleibt das normale Auswahlfeld. Die Auswahl steckt weiterhin im <select> (wird mit dem Formular gesendet).
// Suche ohne Groß-/Kleinschreibung und Akzente, Teiltreffer; Tastatur: ↑ ↓ Enter, Backspace entfernt den letzten Chip.
(function () {
  function norm(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  }

  function setup(select) {
    var wrap = document.createElement('div');
    wrap.className = 'combo';
    var chips = document.createElement('div');
    chips.className = 'combo-chips';
    var input = document.createElement('input');
    input.type = 'search';
    input.className = 'combo-input';
    input.placeholder = select.getAttribute('data-placeholder') || 'Suchen …';
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-expanded', 'false');
    if (select.id) input.id = select.id + '-search';
    var list = document.createElement('ul');
    list.className = 'combo-list';
    list.setAttribute('role', 'listbox');
    list.hidden = true;
    wrap.appendChild(chips);
    wrap.appendChild(input);
    wrap.appendChild(list);
    select.parentNode.insertBefore(wrap, select);
    select.hidden = true;
    // Label auf das Suchfeld umlenken
    if (select.id) {
      var label = document.querySelector('label[for="' + select.id + '"]');
      if (label) label.setAttribute('for', input.id);
    }

    var options = Array.prototype.slice.call(select.options);
    var active = -1;

    function renderChips() {
      chips.innerHTML = '';
      options.filter(function (o) { return o.selected; }).forEach(function (o) {
        var chip = document.createElement('span');
        chip.className = 'combo-chip';
        chip.textContent = o.text;
        var x = document.createElement('button');
        x.type = 'button';
        x.className = 'combo-remove';
        x.setAttribute('aria-label', o.text + ' entfernen');
        x.textContent = '×';
        x.addEventListener('click', function () {
          o.selected = false;
          renderChips();
          renderList();
          input.focus();
        });
        chip.appendChild(x);
        chips.appendChild(chip);
      });
    }

    function matches() {
      var q = norm(input.value).trim();
      return options.filter(function (o) {
        return !o.selected && !o.disabled && (!q || norm(o.text + ' ' + (o.getAttribute('data-search') || '')).indexOf(q) >= 0);
      }).slice(0, 50);
    }

    function renderList() {
      var hits = matches();
      list.innerHTML = '';
      active = Math.min(active, hits.length - 1);
      hits.forEach(function (o, i) {
        var li = document.createElement('li');
        li.setAttribute('role', 'option');
        li.className = i === active ? 'on' : '';
        li.textContent = o.text;
        var hint = o.getAttribute('data-hint');
        if (hint) {
          var small = document.createElement('small');
          small.textContent = ' ' + hint;
          li.appendChild(small);
        }
        // mousedown statt click: Auswahl vor dem blur des Suchfelds
        li.addEventListener('mousedown', function (e) {
          e.preventDefault();
          pick(o);
        });
        list.appendChild(li);
      });
      if (!hits.length) {
        var none = document.createElement('li');
        none.className = 'none';
        none.textContent = input.value ? 'Keine Treffer' : 'Alle ausgewählt';
        list.appendChild(none);
      }
    }

    function open() {
      renderList();
      list.hidden = false;
      input.setAttribute('aria-expanded', 'true');
    }

    function close() {
      list.hidden = true;
      active = -1;
      input.setAttribute('aria-expanded', 'false');
    }

    function pick(o) {
      o.selected = true;
      input.value = '';
      active = -1;
      renderChips();
      renderList();
    }

    input.addEventListener('focus', open);
    input.addEventListener('input', function () {
      active = 0;
      open();
    });
    input.addEventListener('blur', close);
    input.addEventListener('keydown', function (e) {
      var hits = matches();
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (list.hidden) open();
        active = Math.min(active + 1, hits.length - 1);
        renderList();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        active = Math.max(active - 1, 0);
        renderList();
      } else if (e.key === 'Enter') {
        // Enter wählt aus und sendet das Formular nicht ab
        if (!list.hidden && hits[active]) {
          e.preventDefault();
          pick(hits[active]);
        } else if (input.value) {
          e.preventDefault();
        }
      } else if (e.key === 'Escape') {
        close();
      } else if (e.key === 'Backspace' && !input.value) {
        var sel = options.filter(function (o) { return o.selected; });
        if (sel.length) {
          sel[sel.length - 1].selected = false;
          renderChips();
          renderList();
        }
      }
    });

    renderChips();
  }

  function init() {
    Array.prototype.forEach.call(document.querySelectorAll('select[multiple][data-combo]'), setup);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
