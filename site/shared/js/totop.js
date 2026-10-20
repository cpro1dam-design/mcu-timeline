// Flèche « Revenir en haut » : un bouton rond dans le coin bas droit, qui apparaît une fois qu'on a fait
// défiler d'environ un écran. Sur la page elle-même et dans les grandes fenêtres qui défilent (Vus et à
// voir, Tous les personnages, Archives) : le bouton est alors placé dans la fenêtre (<dialog>, au premier
// plan, dans le piège à focus).
// - téléphone : au-dessus des barres collées en bas de l'écran (onglets, barre du bas des Archives) ;
// - un anneau rouge autour de la flèche dit où l'on en est dans la page (version retenue par
//   l'utilisateur le 2026-10-19, face à la flèche seule) ;
// - clavier : le focus remonte aussi (titre de la page ou de la fenêtre) au lieu de rester sur un
//   bouton qui disparaît ;
// - animations réduites : saut immédiat au lieu d'un défilement doux.
//
//   initToTop(window);                                         // la page
//   initToTop(dialog, { host: dialog, focus: () => titre });   // une fenêtre qui défile

import { reducedMotion } from './prefs.js';

const NS = 'http://www.w3.org/2000/svg';

function svgEl(tag, attrs) {
  const e = document.createElementNS(NS, tag);
  Object.entries(attrs).forEach(([k, val]) => e.setAttribute(k, String(val)));
  return e;
}

export function initToTop(scroller, { host = document.body, focus = null, avoid = [] } = {}) {
  if (!scroller || !host) return null;
  const win = scroller === window;
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'to-top to-top--anneau';
  b.setAttribute('aria-label', 'Revenir en haut');
  b.title = 'Revenir en haut';
  const svg = svgEl('svg', { viewBox: '0 0 48 48', 'aria-hidden': 'true', focusable: 'false', class: 'to-top__svg' });
  const ring = svgEl('circle', { class: 'to-top__ring', cx: 24, cy: 24, r: 22, pathLength: 100 });
  svg.append(svgEl('circle', { class: 'to-top__track', cx: 24, cy: 24, r: 22 }), ring,
    svgEl('path', { class: 'to-top__arrow', d: 'M24 32.5V16.5M17 23.5l7-7 7 7' }));
  b.append(svg);
  host.append(b);

  const pos = () => (win ? window.scrollY || document.documentElement.scrollTop : scroller.scrollTop);
  const viewH = () => (win ? window.innerHeight : scroller.clientHeight);
  const fullH = () => (win ? document.documentElement.scrollHeight : scroller.scrollHeight);
  const avoidEls = () => avoid.map((a) => (typeof a === 'string' ? document.querySelector(a) : a)).filter(Boolean);
  let raf = 0;
  function update() {
    raf = 0;
    const top = pos();
    const h = viewH();
    const on = top > Math.max(240, h * 0.75);
    b.classList.toggle('is-on', on);
    if (!on) return;
    const max = fullH() - h;
    ring.style.setProperty('stroke-dashoffset', String(Math.round(100 - Math.min(1, max > 0 ? top / max : 1) * 100)));
    // au-dessus des barres collées en bas de l'écran (onglets du téléphone, barre du bas des Archives)
    const vh = window.innerHeight;
    let lift = 0;
    avoidEls().forEach((el) => {
      if (!el.getClientRects().length) return;
      const r = el.getBoundingClientRect();
      if (r.height && r.bottom >= vh - 2 && r.top < vh) lift = Math.max(lift, vh - r.top);
    });
    if (lift) b.style.setProperty('--to-top-b', `${Math.round(lift + 12)}px`); else b.style.removeProperty('--to-top-b');
  }
  const queue = () => { if (!raf) raf = requestAnimationFrame(update); };
  (win ? window : scroller).addEventListener('scroll', queue, { passive: true });
  window.addEventListener('resize', queue);
  b.addEventListener('click', (e) => {
    (win ? window : scroller).scrollTo({ top: 0, behavior: reducedMotion() ? 'auto' : 'smooth' });
    // clavier (Entrée, Espace : detail = 0) : le focus remonte avec la page ; souris, doigt : il quitte
    // simplement le bouton, qui va disparaître
    if (e.detail === 0) {
      const t = (focus && focus())
        || (win ? document.querySelector('main h1') || document.querySelector('h1') || document.querySelector('main') : null);
      if (t) {
        if (!t.matches('a[href], button, input, select, textarea, [tabindex]')) t.tabIndex = -1;
        t.focus({ preventScroll: true });
      }
    } else b.blur();
  });
  queue();
  return { update: queue, element: b };
}
