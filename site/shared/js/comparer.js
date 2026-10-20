// Page « Comparer les versions » (comparer.html, générée par tools/build_site.py) : pour chaque apparence
// pas encore décidée, ses versions côte à côte. « Choisir cette version » enregistre le réglage (prefs.js) :
// il s'applique tout de suite, dans tout le site, sur cet appareil. Sans JavaScript, la page reste lisible
// mais les boutons restent masqués (le choix ne pourrait pas être gardé).

import { getPrefs, setPref, onPrefs } from './prefs.js';

export function initCompare() {
  const live = document.querySelector('[data-cmp-live]');
  document.querySelectorAll('.cmp[data-pref]').forEach((sec) => {
    const pref = sec.dataset.pref;
    const opts = [...sec.querySelectorAll('.cmp__opt[data-value]')];
    if (!opts.length) return;
    const sync = () => {
      const cur = getPrefs()[pref];
      const val = opts.some((o) => o.dataset.value === cur) ? cur : opts[0].dataset.value;
      opts.forEach((o) => {
        const on = o.dataset.value === val;
        o.classList.toggle('is-chosen', on);
        const b = o.querySelector('.cmp__pick');
        if (b) b.setAttribute('aria-pressed', String(on));
        const badge = o.querySelector('.cmp__badge');
        if (badge) badge.hidden = !on;
      });
    };
    opts.forEach((o) => {
      const b = o.querySelector('.cmp__pick');
      if (!b) return;
      b.hidden = false;
      b.addEventListener('click', () => {
        setPref(pref, o.dataset.value);
        if (!live) return;
        live.textContent = '';
        setTimeout(() => { live.textContent = `Choix enregistré : ${o.dataset.label}.`; }, 60);
      });
    });
    sync();
    onPrefs(sync);
  });
}
