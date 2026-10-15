// Rückfrage vor folgenreichen Formularen: <form data-confirm="Frage?"> (Inline-Handler blockiert die CSP)
document.addEventListener('submit', function (e) {
  var form = e.target.closest && e.target.closest('form[data-confirm]');
  if (form && !window.confirm(form.getAttribute('data-confirm'))) e.preventDefault();
}, true);
