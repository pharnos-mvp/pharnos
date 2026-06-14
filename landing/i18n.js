// Bascule FR/EN de la landing — sans dépendance. Le texte des deux langues vit dans les
// attributs data-fr / data-en ; on échange textContent. Langue persistée dans localStorage.
;(function () {
  var KEY = 'pharnos.landing.lang'
  var supported = ['fr', 'en']

  function pick() {
    try {
      var saved = localStorage.getItem(KEY)
      if (saved && supported.indexOf(saved) !== -1) return saved
    } catch (_) {}
    var nav = (navigator.language || 'fr').slice(0, 2).toLowerCase()
    return nav === 'en' ? 'en' : 'fr'
  }

  function apply(lang) {
    var nodes = document.querySelectorAll('[data-fr][data-en]')
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i]
      var val = el.getAttribute('data-' + lang)
      if (val != null) el.textContent = val
    }
    document.documentElement.lang = lang
    var toggle = document.getElementById('lang-toggle')
    if (toggle) {
      var on = toggle.querySelector('.lang-on')
      var off = toggle.querySelector('.lang-off')
      // L'étiquette "active" (fond plein) montre la langue COURANTE.
      if (lang === 'fr') {
        if (on) on.textContent = 'FR'
        if (off) off.textContent = 'EN'
      } else {
        if (on) on.textContent = 'EN'
        if (off) off.textContent = 'FR'
      }
      toggle.setAttribute('aria-label', lang === 'fr' ? 'Switch to English' : 'Passer en français')
    }
  }

  function save(lang) {
    try {
      localStorage.setItem(KEY, lang)
    } catch (_) {}
  }

  var current = pick()
  apply(current)

  var toggle = document.getElementById('lang-toggle')
  if (toggle) {
    toggle.addEventListener('click', function () {
      current = current === 'fr' ? 'en' : 'fr'
      apply(current)
      save(current)
    })
  }

  var year = document.getElementById('year')
  if (year) year.textContent = String(new Date().getFullYear())
})()
