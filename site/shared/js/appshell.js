// Interface « appli » sur téléphone (maquettes A et C, attribut data-app sur <html>).
// Sur petit écran, l'essentiel seulement reste à l'écran :
//   - en haut, une barre d'une ligne : le nom du site et le bouton « Réglages » ;
//   - sous elle, une ligne de contexte propre au mode (Chronologie : ordre et filtre ; Phases : puces
//     des phases ; Personnages : le personnage choisi) ;
//   - en bas, la barre d'onglets (Phases, Chronologie, Personnages, Rechercher), toujours à portée du pouce.
// Tout le reste (ordre, filtre, niveau de détail, réglages, aide, mentions) est rangé dans un panneau qui
// monte du bas ; la recherche s'ouvre en plein écran. Les éléments existants sont déplacés tels quels
// (leurs écouteurs restent), puis remis à leur place sur grand écran : un seul jeu de commandes.

import { createOverlay } from './overlays.js';
import { sagaShort } from './filter.js';

// même seuil que app.css (téléphone en portrait, ou en paysage peu haut)
export const APP_MQ = '(max-width: 767px), (max-width: 1099px) and (max-height: 520px)';

function mk(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

export function createAppShell(ctx) {
  const root = document.documentElement;
  if (!root.hasAttribute('data-app')) return null;
  const $ = (s) => document.querySelector(s);
  const mq = window.matchMedia(APP_MQ);
  const tax = ctx.data.taxonomy;
  const nav = $('.c-modes');
  const reduce = () => ctx.reducedMotion();

  // -- panneau « Réglages » (bas de l'écran) -------------------------------------------------
  const sheet = mk('dialog', 'm-sheet');
  sheet.setAttribute('aria-labelledby', 'm-sheet-titre');
  const sIn = mk('div', 'm-sheet__in');
  const sHead = mk('div', 'm-sheet__head');
  const grip = mk('span', 'm-sheet__grip');
  grip.setAttribute('aria-hidden', 'true');
  const sTitle = mk('h2', 'm-sheet__title', 'Affichage et réglages');
  sTitle.id = 'm-sheet-titre';
  sTitle.tabIndex = -1;
  const sClose = mk('button', 'm-sheet__close');
  sClose.type = 'button';
  sClose.setAttribute('aria-label', 'Fermer les réglages');
  sClose.append(icon('close'));
  sHead.append(grip, sTitle, sClose);
  const sBody = mk('div', 'm-sheet__body');
  const section = (key, title) => {
    const s = mk('section', 'm-sheet__sec');
    s.dataset.sec = key;
    if (title) {
      const h = mk('h3', 'm-sheet__h', title);
      h.id = `m-sec-${key}`;
      s.setAttribute('aria-labelledby', h.id);
      s.append(h);
    }
    sBody.append(s);
    return s;
  };
  const secOrder = section('order', 'Ordre');
  const secFilter = section('filter', 'Sagas et phases');
  const secZoom = section('zoom', 'Niveau de détail');
  const secSettings = section('settings', 'Réglages');
  const secHelp = section('help', null);
  const secAbout = section('about', 'À propos');
  sIn.append(sHead, sBody);
  sheet.append(sIn);
  document.body.append(sheet);
  const sheetBtn = $('#btn-reglages');
  let sheetOpener = null;
  const sheetOv = createOverlay(sheet, {
    onClose: () => { root.classList.remove('has-sheet'); const t = sheetOpener || sheetBtn; if (t && document.contains(t)) t.focus({ preventScroll: true }); },
  });
  // Réglages : sans ce que montre déjà la ligne de contexte (ordre et filtre en Chronologie, cartes de phase
  // en mode Phases) ; la puce « Filtre » ouvre le même panneau réduit au filtre
  function openSheet(focusSec = null, opener = sheetBtn) {
    sheetOpener = opener;
    const only = focusSec === secFilter ? 'filter' : '';
    sheet.dataset.only = only;
    sTitle.textContent = only ? 'Sagas et phases' : 'Affichage et réglages';
    root.classList.add('has-sheet');
    sheetOv.show();
    sBody.scrollTop = 0;
    if (focusSec) {
      focusSec.scrollIntoView({ block: 'start' });
      const b = focusSec.querySelector('[aria-pressed="true"], button, select, input');
      if (b) { b.focus({ preventScroll: true }); return; }
    }
    sTitle.focus({ preventScroll: true });
  }
  sClose.addEventListener('click', () => sheetOv.close());
  if (sheetBtn) sheetBtn.addEventListener('click', () => openSheet());

  // -- recherche plein écran ------------------------------------------------------------------
  const searchDlg = mk('dialog', 'm-search');
  searchDlg.setAttribute('aria-label', 'Rechercher');
  const qIn = mk('div', 'm-search__in');
  const qBar = mk('div', 'm-search__bar');
  const qBack = mk('button', 'm-search__back');
  qBack.type = 'button';
  qBack.setAttribute('aria-label', 'Fermer la recherche');
  qBack.append(icon('back'));
  qBar.append(qBack);
  const qHint = mk('p', 'm-search__hint', 'Titre français ou original, personnage, alias ou acteur : les résultats sont rangés en films, séries et personnages.');
  qIn.append(qBar, qHint);
  searchDlg.append(qIn);
  document.body.append(searchDlg);
  const searchBtn = $('#btn-recherche');
  const searchBox = $('.c-search');
  const searchOv = createOverlay(searchDlg, {
    closeOnBackdrop: false,
    onClose: () => { root.classList.remove('has-search'); if (searchBtn && !pendingAction) searchBtn.focus({ preventScroll: true }); },
  });
  let pendingAction = false;
  qBack.addEventListener('click', () => searchOv.close());
  if (searchBtn) searchBtn.addEventListener('click', () => {
    root.classList.add('has-search');
    searchOv.show();
    const input = searchBox && searchBox.querySelector('input');
    if (input) { input.value = ''; input.dispatchEvent(new Event('input')); input.focus(); }
  });

  // -- ligne de contexte du mode Chronologie : ordre (Sortie | Histoire) et filtre ---------------
  const context = mk('div', 'm-context');
  const order = mk('div', 'segmented m-order');
  order.setAttribute('role', 'group');
  order.setAttribute('aria-label', 'Ordre');
  const origOrder = [...document.querySelectorAll('.c-tools [data-order]')];
  const proxies = origOrder.map((o) => {
    const b = mk('button', null, o.textContent);
    b.type = 'button';
    b.dataset.proxyOrder = o.dataset.order;
    b.addEventListener('click', () => o.click()); // la coquille garde la main (préférence, annonce, rendu)
    order.append(b);
    return b;
  });
  const chip = mk('button', 'm-chip');
  chip.type = 'button';
  chip.setAttribute('aria-haspopup', 'dialog');
  const chipK = mk('span', 'm-chip__k', 'Filtre');
  const chipV = mk('span', 'm-chip__v');
  chip.append(icon('filter'), chipK, chipV);
  chip.addEventListener('click', () => openSheet(secFilter, chip));
  context.append(order, chip);
  const main = $('#contenu');
  const anchor = $('#erreur-donnees');
  if (anchor) anchor.after(context); else if (main) main.prepend(context);

  function filterLabel() {
    if (!ctx.isFiltered()) return 'Toutes';
    const set = ctx.state.phases;
    const sg = tax.sagas.find((s) => s.phases.length === set.size && s.phases.every((n) => set.has(n)));
    if (sg) return sagaShort(sg);
    const ph = tax.phases.filter((p) => set.has(p.n));
    return ph.length === 1 ? `Phase ${ph[0].roman}` : `Phases ${ph.map((p) => p.roman).join(', ')}`;
  }
  function sync() {
    proxies.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.proxyOrder === ctx.state.order)));
    chipV.textContent = filterLabel();
    chip.classList.toggle('is-on', ctx.isFiltered());
    sheet.dataset.mode = ctx.state.mode;
    // pastille sur « Réglages » : un réglage qu'il contient change ce que montre la frise (en Chronologie,
    // le filtre a sa propre puce)
    if (sheetBtn) sheetBtn.classList.toggle('has-dot', (ctx.isFiltered() && ctx.state.mode !== 'chronologie') || !ctx.state.series);
  }
  ctx.on('render', sync);

  // -- portails : éléments existants rangés dans les panneaux sur téléphone ----------------------
  const moves = [];
  const plan = (node, target) => { if (node && target) moves.push({ node, target, home: null }); };
  plan($('.c-tools .segmented'), secOrder);
  plan($('.c-sagafilter'), secFilter);
  plan($('.c-zoom'), secZoom);
  plan($('.c-settings__body'), secSettings);
  plan($('.c-help'), secHelp);
  plan($('.c-footer'), secAbout);
  plan(searchBox, qBar);
  function apply(on) {
    moves.forEach((m) => {
      if (on && !m.home) { m.home = document.createComment('app'); m.node.before(m.home); m.target.append(m.node); }
      else if (!on && m.home) { m.home.replaceWith(m.node); m.home = null; }
    });
  }

  // -- barre d'onglets : icônes ; toucher un onglet ramène en haut (comme dans une appli) ----------
  if (nav) {
    nav.querySelectorAll('[data-mode]').forEach((a) => {
      a.addEventListener('click', () => {
        if (!mq.matches) return;
        window.scrollTo({ top: 0, behavior: reduce() ? 'auto' : 'smooth' });
      });
    });
  }

  function switchMode() {
    const on = mq.matches;
    root.classList.toggle('is-app', on);
    if (!on) { if (sheetOv.isOpen()) sheetOv.close(); if (searchOv.isOpen()) searchOv.close(); }
    apply(on);
    sync();
  }
  mq.addEventListener('change', switchMode); // la maquette redessine sur l'évènement resize qui l'accompagne
  switchMode();

  return {
    active: () => mq.matches,
    // hauteur de la barre d'onglets (la frise s'arrête au-dessus)
    bottomInset: () => (mq.matches && nav ? Math.ceil(nav.getBoundingClientRect().height) : 0),
    // ferme les panneaux ouverts (recherche, réglages) avant une autre action (Archives, personnage)
    settle() {
      const ps = [];
      if (searchOv.isOpen()) { pendingAction = true; ps.push(searchOv.close().then(() => { pendingAction = false; })); }
      if (sheetOv.isOpen()) ps.push(sheetOv.close());
      return Promise.all(ps);
    },
    opener: () => (mq.matches ? searchBtn : null),
    openSheet,
  };
}

// pictogrammes (décoratifs : le texte voisin ou aria-label porte le nom)
const PATHS = {
  close: 'M6 6l12 12M18 6L6 18',
  back: 'M15 5l-7 7 7 7',
  filter: 'M4 6h16M7 12h10M10 18h4',
};
export function icon(name) {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('class', `m-ico m-ico--${name}`);
  const p = document.createElementNS(NS, 'path');
  p.setAttribute('d', PATHS[name] || '');
  svg.append(p);
  return svg;
}
