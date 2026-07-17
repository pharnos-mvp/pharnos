/* Regafy home — inscriptions Dépêche RA & « me prévenir » (CSP script-src 'self'). */

'use strict';

function wireForm(formId, source) {
  const form = document.getElementById(formId);
  if (!form) return;
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const emailEl = form.querySelector('input[type="email"]');
    const msg = form.querySelector('.form-msg');
    const btn = form.querySelector('button[type="submit"]');
    const email = emailEl.value.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      msg.textContent = 'Adresse e-mail invalide.';
      msg.className = 'form-msg err';
      emailEl.focus();
      return;
    }
    btn.disabled = true;
    msg.textContent = 'Envoi en cours…';
    msg.className = 'form-msg';
    try {
      const res = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          newsletter: true,
          source,
          website: form.querySelector('.hp').value,
        }),
      });
      if (!res.ok) throw new Error(String(res.status));
      form.reset();
      btn.disabled = false;
      msg.textContent = 'Presque fini — un e-mail de confirmation vous attend. ✓';
      msg.className = 'form-msg ok';
    } catch {
      btn.disabled = false;
      msg.textContent = "L'envoi n'a pas abouti — réessayez dans un instant.";
      msg.className = 'form-msg err';
    }
  });
}

wireForm('form-depeche', 'home');
wireForm('form-outils', 'outils');
