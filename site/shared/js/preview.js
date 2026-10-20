// Aperçu de la fiche d'une œuvre (Archives en miniature), pour l'œuvre choisie sur la frise.
// Mêmes sources que la fiche : affiche TMDB ou affiche typographique, titres, dates, réalisation,
// accroche TMDB ou, à défaut, début de l'introduction Wikipédia (jamais l'intrigue : pas de spoiler).
// Tout est écrit avec textContent ; le bouton ouvre la fiche complète (vue Archives), l'affiche aussi
// (raccourci à la souris ou au doigt ; au clavier, le bouton « Ouvrir la fiche complète » suffit).

import { loadData, siteRoot } from './data.js';
import { formatDateFr, statusOf, todayParis } from './dates.js';

const KIND = { film: 'Film', series: 'Série', special: 'Épisode spécial' };
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX'];

function mk(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

function excerpt(text, max = 130) { // court : l'affiche, en grand, prend la place
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), max - 30))}…`;
}

export function createPreview({ taxonomy, onOpen, className = 'c-preview' } = {}) {
  const el = mk('section', className);
  el.setAttribute('aria-labelledby', 'apercu-titre');
  el.hidden = true;
  let textsPromise = null;
  let current = null;
  const today = todayParis();

  async function show(w, { label = 'Aperçu de la fiche' } = {}) {
    if (!w || w.kind === 'phase') { hide(); return; }
    current = w.id;
    el.hidden = false;
    el.dataset.phase = w.phase ? String(w.phase.v) : '';
    el.dataset.saga = w.saga ? w.saga.v : '';
    el.replaceChildren();
    el.append(mk('p', 'c-preview__k', label));
    const top = mk('div', 'c-preview__top');
    let pic;
    if (w.poster && w.poster.w342) {
      pic = mk('img', 'c-preview__poster');
      pic.src = `${siteRoot()}${w.poster.w342}`;
      pic.alt = '';
      pic.width = 342; pic.height = 513;
      pic.loading = 'lazy';
    } else {
      pic = mk('div', 'c-preview__poster c-preview__poster--ph');
      pic.setAttribute('aria-hidden', 'true');
      pic.append(mk('span', 'c-preview__roman', w.phase ? ROMAN[w.phase.v] || '' : ''), mk('span', 'c-preview__ptitle', w.title_fr ? w.title_fr.v : ''));
    }
    pic.classList.add('is-link');
    pic.title = `Ouvrir la fiche de « ${w.title_fr ? w.title_fr.v : w.id} »`;
    top.append(pic);
    const head = mk('div', 'c-preview__head');
    const kind = w.kind === 'series' && w.seasons && w.seasons.length ? `Série · ${w.seasons.length} saison${w.seasons.length > 1 ? 's' : ''}` : KIND[w.kind] || 'Œuvre';
    head.append(mk('p', 'c-preview__kind', [kind, w.phase ? `Phase ${ROMAN[w.phase.v] || w.phase.v}` : null].filter(Boolean).join(' · ')));
    const h = mk('h2', 'c-preview__title', w.title_fr ? w.title_fr.v : w.id);
    h.id = 'apercu-titre';
    head.append(h);
    const vo = w.title_original && w.title_original.v;
    if (vo && w.title_fr && vo !== w.title_fr.v) {
      const p = mk('p', 'c-preview__vo', vo);
      if (w.title_original.lang) p.lang = w.title_original.lang;
      head.append(p);
    }
    top.append(head);
    el.append(top);

    const dl = mk('dl', 'c-preview__facts');
    const fact = (dt, dd) => { if (!dd) return; dl.append(mk('dt', null, dt), mk('dd', null, dd)); };
    const r = w.release || {};
    // sorties France et États-Unis sur une même ligne ; la phase est déjà dans la ligne du type (« Film · Phase I »)
    if (r.fr && r.us) fact('Sortie en France / aux États-Unis', `${formatDateFr(r.fr.v, r.fr.precision)} / ${formatDateFr(r.us.v, r.us.precision)}`);
    else if (r.fr) fact('Sortie en France', formatDateFr(r.fr.v, r.fr.precision));
    else if (r.us) fact('Sortie aux États-Unis', formatDateFr(r.us.v, r.us.precision));
    else fact('Sortie', r.first ? formatDateFr(r.first.v, r.first.precision) : 'Date à confirmer');
    if (w.directors && w.directors.length) fact(w.directors.length > 1 ? 'Réalisation' : 'Réalisation', w.directors.map((d) => d.v).join(', '));
    el.append(dl);
    const d = r.fr || r.us || r.first;
    const st = d ? statusOf(d.v, d.precision, today) : { key: 'tba', label: 'Date à confirmer' };
    if (st.key !== 'released') el.append(mk('p', 'c-preview__status', st.label));

    const accroche = mk('div', 'c-preview__text');
    el.append(accroche);
    const open = mk('button', 'button c-preview__open', 'Ouvrir la fiche complète');
    open.type = 'button';
    open.addEventListener('click', () => { if (onOpen) onOpen(w.id, open); });
    pic.addEventListener('click', () => { if (onOpen) onOpen(w.id, open); }); // au retour, le focus va au bouton
    el.append(open);

    // accroche : TMDB si disponible, sinon début de l'introduction Wikipédia (sources citées)
    if (w.tagline && w.tagline.v) {
      accroche.append(mk('p', null, excerpt(w.tagline.v)), mk('p', 'c-preview__src', 'Accroche : TMDB'));
      return;
    }
    if (!textsPromise) textsPromise = loadData('texts.json').catch(() => null);
    const texts = await textsPromise;
    if (current !== w.id) return; // l'œuvre a changé entre-temps
    const t = texts && texts.texts && texts.texts[w.id];
    if (t && t.presentation) {
      accroche.append(mk('p', null, excerpt(t.presentation)), mk('p', 'c-preview__src', 'Présentation : Wikipédia (CC BY-SA 4.0)'));
    }
  }

  function hide() { current = null; el.hidden = true; el.replaceChildren(); }

  return { el, show, hide };
}
