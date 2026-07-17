/* Page /i/CODE — résout le code d'invitation via l'Edge `invite-info` et personnalise la page.
   Le label renvoyé est injecté en textContent UNIQUEMENT (jamais innerHTML). */
(function () {
  var API = 'https://uhsireqwzqqymgsxuvqh.supabase.co/functions/v1/invite-info';
  var CODE_RE = /^[A-Z0-9][A-Z0-9-]{2,31}$/;
  var loading = document.getElementById('inv-loading');
  var valid = document.getElementById('inv-valid');
  var invalid = document.getElementById('inv-invalid');

  function show(state) {
    loading.hidden = state !== 'loading';
    valid.hidden = state !== 'valid';
    invalid.hidden = state !== 'invalid';
  }

  /* /i/CODE (la réécriture _redirects préserve le chemin) */
  var m = window.location.pathname.match(/^\/i\/([^/]+)\/?$/);
  var code = m ? decodeURIComponent(m[1]).trim().toUpperCase() : '';
  if (!CODE_RE.test(code)) { show('invalid'); return; }

  fetch(API + '?code=' + encodeURIComponent(code))
    .then(function (res) {
      if (res.status === 404) { show('invalid'); return null; }
      if (!res.ok) throw new Error('http_' + res.status);
      return res.json();
    })
    .then(function (data) {
      if (!data) return;
      document.getElementById('inv-label').textContent = data.label;
      document.getElementById('inv-code').textContent = code;
      document.getElementById('inv-cta').href =
        'https://app.pharnos.com/?invite=' + encodeURIComponent(code);
      show('valid');
    })
    .catch(function () {
      /* Erreur technique (≠ code invalide) : on n'enterre pas l'invitation — CTA générique
         avec le code quand même transmis, l'app revalidera côté serveur. */
      document.getElementById('inv-label').textContent = 'Un expert';
      document.getElementById('inv-code').textContent = code;
      document.getElementById('inv-cta').href =
        'https://app.pharnos.com/?invite=' + encodeURIComponent(code);
      show('valid');
    });
})();
