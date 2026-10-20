// Vue « Archives » plein écran, commune aux deux frises (inspirée des sous-pages du menu Archives
// de Genshin Impact) : on y parcourt les œuvres d'un groupe (phase, chronologie, personnage).
// - <dialog> modal, titre visible en focus initial, Échap rend le focus à l'œuvre d'origine ;
// - historique : pushState à l'ouverture, replaceState d'une œuvre à l'autre, popstate ferme ;
// - deux dispositions : Codex (liste + scène) et Journal (scène + rangée de cartes) ;
// - textes tiers insérés uniquement via textContent ; spoilers absents du DOM avant révélation.

import { getPrefs, setPref, onPrefs } from './prefs.js';
import { loadData, siteRoot } from './data.js';
import { formatDateFr, statusOf, todayParis } from './dates.js';
import { isSeen, refreshSpoilers } from './spoilers.js';
import { mainDate, sortWorks } from './layout.js';
import { overlayPop } from './overlays.js';
import { initToTop } from './totop.js';
import { createMedals } from './medal.js';
import { createMarks } from './marks.js';

// téléphone : même seuil que l'interface appli (appshell.js, app.css)
const PHONE_MQ = '(max-width: 767px), (max-width: 1099px) and (max-height: 520px)';

const KIND = { film: 'Film', series: 'Série', special: 'Épisode spécial' };
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX'];
const LEVELS = [
  ['principal', 'Rôles principaux'], ['secondaire', 'Rôles secondaires'],
  ['cameo', 'Caméos et rôles non crédités'], [null, 'Distribution (niveau non renseigné)'],
];

function shortText(t, max = 360) {
  const s = String(t || '').replace(/\s+/g, ' ').trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), max - 40))}…`;
}

function el(tag, attrs = {}, ...children) {
  const n = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (v === null || v === undefined || v === false) return;
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? '' : v);
  });
  children.flat().forEach((c) => { if (c !== null && c !== undefined && c !== false) n.append(c); });
  return n;
}

const v = (o) => (o ? o.v : null);
const CAST_MAX = 12; // cases affichées par niveau de rôle ; les suivantes à la demande

// getOrder / setOrder : ordre de la frise (Sortie | Histoire), partagé avec la coquille ; par défaut, la préférence.
export function createArchiveView({
  works, characters, taxonomy, onWorkChange = () => {}, onClose = () => {},
  getOrder = () => (getPrefs().ordre === 'story' ? 'story' : 'release'), setOrder = (o) => setPref('ordre', o),
}) {
  const byId = new Map(works.map((w) => [w.id, w]));
  const actorsBy = new Map(characters.actors.map((a) => [a.id, a]));
  const charsBy = new Map(characters.characters.map((c) => [c.id, c]));
  const appsByWork = new Map();
  const worksByChar = new Map();
  const phasesByChar = new Map(); // phases des œuvres où le personnage apparaît (hors caméos) : médaillon
  characters.appearances.forEach((a) => {
    if (!byId.has(a.work)) return;
    if (!appsByWork.has(a.work)) appsByWork.set(a.work, []);
    appsByWork.get(a.work).push(a);
    if (a.character) {
      if (!worksByChar.has(a.character)) worksByChar.set(a.character, new Set());
      worksByChar.get(a.character).add(a.work);
      const wk = byId.get(a.work);
      if (wk.phase && !(a.level && a.level.v === 'cameo')) {
        if (!phasesByChar.has(a.character)) phasesByChar.set(a.character, new Set());
        phasesByChar.get(a.character).add(wk.phase.v);
      }
    }
  });
  const medal = createMedals(taxonomy);
  const recurring = [...worksByChar.entries()].filter(([, s]) => s.size >= 2)
    .map(([id, s]) => ({ id, name: v(charsBy.get(id) && charsBy.get(id).name), count: s.size }))
    .filter((c) => c.name).sort((a, b) => a.name.localeCompare(b.name, 'fr'));

  // groupes : Chronologie (toutes les œuvres) et Personnage ; la phase de l'œuvre est écrite sur sa fiche
  const GROUPS = ['chrono', 'perso'];
  let state = { id: null, group: 'chrono', character: null, opener: null, open: false };
  let textsPromise = null;

  // -- structure -----------------------------------------------------------------------
  const live = el('p', { class: 'visually-hidden', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' });
  const crumb = el('ol');
  const tabs = GROUPS.map((g) => el('button', {
    type: 'button', role: 'tab', id: `arch-tab-${g}`, 'aria-controls': 'arch-panel', 'aria-selected': 'false', tabindex: '-1',
    text: { chrono: 'Chronologie', perso: 'Personnage' }[g],
    onclick: () => setGroup(g),
  }));
  const tablist = el('div', { role: 'tablist', 'aria-label': 'Parcourir les œuvres par', class: 'archives__tabs' }, tabs);
  tablist.addEventListener('keydown', (e) => {
    const i = tabs.indexOf(document.activeElement);
    if (i < 0) return;
    let j = null;
    if (e.key === 'ArrowRight') j = (i + 1) % tabs.length;
    else if (e.key === 'ArrowLeft') j = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') j = 0;
    else if (e.key === 'End') j = tabs.length - 1;
    if (j !== null) { e.preventDefault(); tabs[j].focus(); setGroup(GROUPS[j]); }
  });
  const counter = el('p', { class: 'archives__count' });
  const layoutBtns = ['codex', 'journal'].map((l) => el('button', {
    type: 'button', 'aria-pressed': 'false', 'data-layout': l, text: l === 'codex' ? 'Codex' : 'Journal',
    onclick: () => { setPref('disposition', l); applyLayout(); },
  }));
  const layoutGroup = el('div', { role: 'group', 'aria-label': 'Disposition', class: 'archives__layout segmented' }, layoutBtns);
  const closeBtn = el('button', { type: 'button', class: 'archives__close', 'aria-label': 'Retour à la frise', onclick: () => close() },
    el('span', { class: 'archives__close-x', 'aria-hidden': 'true', text: '✕' }), el('span', { class: 'archives__close-back', 'aria-hidden': 'true', text: '‹' }),
    el('span', { class: 'archives__close-label', text: 'Retour' }));

  const groupTitle = el('h2', { id: 'arch-group-title', class: 'archives__group-title' });
  const list = el('ol', { class: 'archives__list', 'aria-labelledby': 'arch-group-title' });
  const persoField = el('div', { class: 'archives__perso', hidden: true },
    el('label', { for: 'arch-perso', text: 'Personnage' }),
    el('select', { id: 'arch-perso' }, recurring.map((c) => el('option', { value: c.id, text: `${c.name} (${c.count} œuvres)` }))));
  const persoSelect = persoField.querySelector('select');
  // nouveau personnage : la liste, puis la fiche (position dans le groupe, précédente / suivante) sont refaites
  persoSelect.addEventListener('change', () => { state.character = persoSelect.value; renderGroup(true); renderStage(); });
  // Journal : la liste devient un carrousel d'affiches (catalogue de streaming) ; sous lui, l'œuvre au
  // centre : titre et court synopsis ; les détails suivent plus bas (défilement vertical)
  const rail = el('div', { class: 'archives__rail' }, list);
  const caption = el('div', { class: 'archives__caption' });
  // Chronologie : ordre de sortie ou de l'histoire (le même que celui de la frise)
  const orderBtns = [['release', 'Sortie'], ['story', 'Histoire']].map(([o, label]) => el('button', {
    type: 'button', 'aria-pressed': 'false', 'data-order': o, text: label,
    onclick: () => {
      if (getOrder() === o) return;
      setOrder(o);
      renderGroup(true);
      renderStage();
      if (state.open) history.replaceState({ archives: true }, '', url(state.id));
      live.textContent = '';
      setTimeout(() => { live.textContent = o === 'story' ? 'Ordre de l’histoire.' : 'Ordre de sortie.'; }, 60);
    },
  }));
  const orderField = el('div', { class: 'archives__order', hidden: true },
    el('div', { role: 'group', 'aria-label': 'Ordre', class: 'segmented' }, orderBtns));
  const panel = el('section', { id: 'arch-panel', role: 'tabpanel', class: 'archives__group', 'aria-labelledby': 'arch-tab-chrono' },
    persoField, orderField, groupTitle, rail, caption);

  const prevBtn = el('button', { type: 'button', class: 'archives__nav archives__nav--prev', onclick: () => step(-1) }, el('span', { 'aria-hidden': 'true', text: '‹' }));
  const nextBtn = el('button', { type: 'button', class: 'archives__nav archives__nav--next', onclick: () => step(1) }, el('span', { 'aria-hidden': 'true', text: '›' }));
  const visual = el('div', { class: 'archives__visual' });
  const text = el('div', { class: 'archives__text' });
  const stage = el('article', { class: 'archives__stage', 'aria-labelledby': 'archives-titre' }, prevBtn, visual, text, nextBtn);

  // téléphone : barre du bas (œuvre précédente, position dans le groupe, œuvre suivante), à portée du pouce
  const dockPos = el('p', { class: 'archives__pos', 'aria-hidden': 'true' });
  const dock = el('div', { class: 'archives__dock' }, dockPos);
  const phone = window.matchMedia(PHONE_MQ);
  // Journal sur ordinateur : les flèches ‹ › sont sur les bords du carrousel ; quand on lit la fiche plus
  // bas, le carrousel sort de l'écran : une petite barre flottante (‹, position, ›) prend le relais
  const floatPrev = el('button', { type: 'button', class: 'archives__nav archives__fnav', onclick: () => step(-1) }, el('span', { 'aria-hidden': 'true', text: '‹' }));
  const floatNext = el('button', { type: 'button', class: 'archives__nav archives__fnav', onclick: () => step(1) }, el('span', { 'aria-hidden': 'true', text: '›' }));
  const floatPos = el('p', { class: 'archives__pos archives__fpos', 'aria-hidden': 'true' });
  const float = el('div', { class: 'archives__float' }, floatPrev, floatPos, floatNext);

  const root = siteRoot();
  const foot = el('footer', { class: 'archives__foot' },
    el('a', { href: `${root}pages/mentions-legales.html`, text: 'Mentions légales' }),
    el('a', { href: `${root}pages/confidentialite.html`, text: 'Confidentialité' }),
    el('a', { href: `${root}pages/accessibilite.html`, text: 'Accessibilité : non conforme' }),
    el('a', { href: `${root}pages/sources.html`, text: 'Sources et licences' }));

  const barEnd = el('div', { class: 'archives__bar-end' }, counter, layoutGroup, closeBtn);
  const bar = el('header', { class: 'archives__bar' },
    el('nav', { 'aria-label': 'Fil d’Ariane', class: 'archives__crumb' }, crumb),
    tablist, barEnd);
  const bodyEl = el('div', { class: 'archives__body' }, panel, stage, float);
  const dialog = el('dialog', { class: 'archives', id: 'archives', 'aria-labelledby': 'archives-titre' },
    el('div', { class: 'archives__inner' },
      bar,
      bodyEl,
      dock, foot, live));
  document.body.append(dialog);
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([e]) => {
      const on = !e.isIntersecting || e.intersectionRatio < 0.35;
      // barre masquée alors qu'elle avait le focus : il passe sur la flèche du carrousel (ou l'œuvre affichée)
      if (!on && float.contains(document.activeElement)) {
        const alt = document.activeElement === floatPrev ? prevBtn : nextBtn;
        (alt.disabled ? list.querySelector('[aria-current="true"]') || stage : alt).focus({ preventScroll: true });
      }
      float.classList.toggle('is-on', on);
    }, { root: bodyEl, threshold: [0, 0.35] }).observe(list);
  }
  // flèche « Revenir en haut » : la fenêtre défile (Journal, téléphone) ou seulement la fiche (Codex)
  const titleEl = () => dialog.querySelector('#archives-titre');
  const tops = [bodyEl, stage].map((sc) => initToTop(sc, { host: dialog, focus: titleEl, avoid: [dock, foot] }));
  // changement de disposition ou de fiche : la zone qui défile change sans évènement « scroll »
  const syncTops = () => tops.forEach((t) => t && t.update());

  // -- rendu -----------------------------------------------------------------------------
  function groupWorks() {
    if (state.group === 'chrono') return sortWorks(works, getOrder());
    const set = worksByChar.get(state.character) || new Set([state.id]);
    return sortWorks(works.filter((x) => set.has(x.id)), getOrder());
  }

  function groupLabel() {
    if (state.group === 'chrono') return 'Toutes les œuvres'; // l'ordre est sur les boutons Sortie | Histoire
    const c = charsBy.get(state.character);
    return `Œuvres avec ${c ? v(c.name) : 'ce personnage'}`;
  }

  function defaultCharacter(id) {
    const apps = (appsByWork.get(id) || []).filter((a) => a.character && worksByChar.get(a.character) && worksByChar.get(a.character).size >= 2);
    return apps.length ? apps[0].character : (recurring[0] && recurring[0].id);
  }

  function renderGroup(keepFocus) {
    const items = groupWorks();
    groupTitle.textContent = groupLabel();
    persoField.hidden = state.group !== 'perso';
    orderField.hidden = state.group !== 'chrono';
    orderBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.order === getOrder())));
    panel.dataset.group = state.group; // téléphone : le groupe Personnage se resserre (archive.css)
    if (state.group === 'perso') persoSelect.value = state.character || '';
    tabs.forEach((t) => {
      const on = t.id === `arch-tab-${state.group}`;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
    });
    panel.setAttribute('aria-labelledby', `arch-tab-${state.group}`);
    list.replaceChildren(...items.map((w) => {
      const d = mainDate(w);
      const btn = el('button', {
        type: 'button', class: 'archives__item', 'data-id': w.id, tabindex: w.id === state.id ? '0' : '-1',
        'data-phase': w.phase ? String(w.phase.v) : '', 'data-saga': w.saga ? w.saga.v : '',
        'aria-current': w.id === state.id ? 'true' : null, onclick: () => setWork(w.id, true),
      },
      el('span', { class: 'archives__thumb', 'aria-hidden': 'true' }, poster(w, true)),
      el('span', { class: 'archives__ribbon', 'aria-hidden': 'true', text: w.phase ? ROMAN[w.phase.v] : '–' }),
      el('span', { class: 'archives__item-title', text: v(w.title_fr) || v(w.title_original) || w.id }),
      el('span', { class: 'archives__item-meta', text: [KIND[w.kind], d ? d.v.slice(0, 4) : null].filter(Boolean).join(' · ') }),
      el('span', { class: 'archives__item-date', text: d ? formatDateFr(d.v, d.precision) : 'Date à confirmer' }),
      el('span', { class: 'visually-hidden', text: w.phase ? `, phase ${w.phase.v}` : '' }));
      return el('li', {}, btn);
    }));
    if (!items.some((w) => w.id === state.id) && items.length) setWork(items[0].id, false);
    const cur = list.querySelector('[aria-current="true"]');
    if (isJournal()) centerCurrent(false);
    else if (cur) cur.scrollIntoView({ block: 'nearest', inline: 'center' });
    if (keepFocus && cur && list.contains(document.activeElement)) cur.focus({ preventScroll: true });
    fitJournal();
  }

  // téléphone, Journal : le titre de l'œuvre doit rester visible au-dessus de la barre du bas ; si besoin,
  // l'affiche se réduit (jamais sous 7rem de large). La place d'un titre sur deux lignes est toujours
  // réservée : les affiches gardent la même taille d'une œuvre à l'autre (sinon le carrousel se décale
  // pendant son défilement). reset = false : on ne fait que réduire (titre de trois lignes, rare).
  function fitJournal(reset = true) {
    const li = list.querySelector('li');
    const w0 = li ? li.getBoundingClientRect().width : 0;
    // cartes d'une autre taille : le carrousel est recentré sur l'œuvre affichée
    const recenter = () => { if (li && Math.abs(li.getBoundingClientRect().width - w0) > 0.5) centerCurrent(false); };
    if (reset) panel.style.removeProperty('--card-w');
    if (!state.open || !isJournal() || !phone.matches) { panel.style.removeProperty('--card-w'); recenter(); return; }
    const t = caption.querySelector('h2');
    const body = panel.parentElement;
    if (!t || !body || !li || !dialog.open || !body.clientHeight) return; // fenêtre pas encore affichée : rien à mesurer
    const tr = t.getBoundingClientRect();
    const lh = parseFloat(getComputedStyle(t).lineHeight) || tr.height;
    const over = tr.top + Math.max(tr.height, 2 * lh) - body.getBoundingClientRect().top + body.scrollTop - (body.clientHeight - 8);
    if (over > 0) {
      const min = 7 * parseFloat(getComputedStyle(document.documentElement).fontSize);
      panel.style.setProperty('--card-w', `${Math.max(min, li.getBoundingClientRect().width - over / 1.5)}px`);
    }
    recenter();
  }

  // -- carrousel (Journal) : l'affiche au centre est l'œuvre affichée ; on fait défiler au doigt, à la
  // molette, aux flèches ‹ › ou au clavier ; le défilement manuel choisit l'œuvre la plus centrée
  const isJournal = () => dialog.dataset.layout === 'journal';
  let ignoreScrollUntil = 0;
  let scrollTimer = 0;
  // seul un défilement fait par l'utilisateur (doigt, souris, molette) choisit une œuvre ; un recentrage
  // provoqué (‹ ›, Codex → Journal, redimensionnement) n'en choisit jamais, même s'il est interrompu
  let userAt = -Infinity;
  let centeredAt = 0;
  let settleTimer = 0;
  ['pointerdown', 'touchstart', 'wheel'].forEach((ev) => list.addEventListener(ev, () => { userAt = performance.now(); }, { passive: true }));
  const centerLeft = (li) => li.offsetLeft - (list.clientWidth - li.offsetWidth) / 2;
  function centerCurrent(smooth) {
    const cur = list.querySelector('[aria-current="true"]');
    if (!cur || !isJournal()) return;
    const li = cur.parentElement;
    centeredAt = performance.now();
    ignoreScrollUntil = centeredAt + (smooth ? 700 : 120);
    const reduce = document.documentElement.classList.contains('is-reduced-motion') || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    list.scrollTo({ left: centerLeft(li), behavior: smooth && !reduce ? 'smooth' : 'auto' });
    // animation interrompue ou suspendue : l'affiche est posée au centre, sans animation
    clearTimeout(settleTimer);
    settleTimer = setTimeout(() => {
      const c = list.querySelector('[aria-current="true"]');
      if (!c || !isJournal() || userAt > centeredAt) return;
      const left = centerLeft(c.parentElement);
      if (Math.abs(list.scrollLeft - left) > 4) { ignoreScrollUntil = performance.now() + 120; list.scrollTo({ left, behavior: 'auto' }); }
    }, smooth ? 1000 : 200);
  }
  // Codex : l'œuvre affichée reste visible dans la liste (colonne qui défile sur ordinateur, rangée sur
  // téléphone), sans faire défiler la page
  function revealInList() {
    const cur = list.querySelector('[aria-current="true"]');
    if (!cur) return;
    const horizontal = phone.matches;
    const box = horizontal ? list : panel;
    const b = box.getBoundingClientRect(); const r = cur.getBoundingClientRect();
    if (horizontal) {
      if (r.left < b.left) box.scrollLeft -= b.left - r.left + 12;
      else if (r.right > b.right) box.scrollLeft += r.right - b.right + 12;
    } else if (r.top < b.top) box.scrollTop -= b.top - r.top + 12;
    else if (r.bottom > b.bottom) box.scrollTop += r.bottom - b.bottom + 12;
  }
  list.addEventListener('scroll', () => {
    if (!isJournal() || performance.now() < ignoreScrollUntil) return;
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => {
      // défilement provoqué (recentrage, redimensionnement) : il ne choisit pas d'œuvre
      if (performance.now() < ignoreScrollUntil || userAt < centeredAt) return;
      const mid = list.scrollLeft + list.clientWidth / 2;
      let best = null; let bestD = Infinity;
      list.querySelectorAll('li').forEach((li) => { const dd = Math.abs(li.offsetLeft + li.offsetWidth / 2 - mid); if (dd < bestD) { bestD = dd; best = li; } });
      const b = best && best.querySelector('.archives__item');
      if (b && b.dataset.id !== state.id) setWork(b.dataset.id, true, { fromScroll: true });
    }, 140);
  }, { passive: true });

  list.addEventListener('keydown', (e) => {
    const btns = [...list.querySelectorAll('.archives__item')];
    const i = btns.indexOf(document.activeElement);
    if (i < 0) return;
    const horizontal = dialog.dataset.layout === 'journal';
    const nextKey = horizontal ? 'ArrowRight' : 'ArrowDown';
    const prevKey = horizontal ? 'ArrowLeft' : 'ArrowUp';
    let j = null;
    if (e.key === nextKey) j = Math.min(btns.length - 1, i + 1);
    else if (e.key === prevKey) j = Math.max(0, i - 1);
    else if (e.key === 'Home') j = 0;
    else if (e.key === 'End') j = btns.length - 1;
    if (j !== null) {
      e.preventDefault();
      btns.forEach((b, k) => { b.tabIndex = k === j ? 0 : -1; });
      btns[j].focus({ preventScroll: horizontal });
      if (horizontal) setWork(btns[j].dataset.id, true); // carrousel : l'affiche choisie vient au centre
    }
  });

  function poster(w, decorative, { title = true } = {}) {
    if (w.poster && w.poster.w342) {
      return el('img', { class: 'archives__poster', src: `${root}${w.poster.w342}`, width: '342', height: '513',
        alt: decorative ? '' : `Affiche de « ${v(w.title_fr)} »`, loading: 'lazy' });
    }
    return el('div', { class: 'archives__poster archives__poster--ph', 'aria-hidden': 'true' },
      el('span', { class: 'archives__ph-roman', text: w.phase ? ROMAN[w.phase.v] : '' }),
      title ? el('span', { class: 'archives__ph-title', text: v(w.title_fr) || '' }) : null);
  }

  async function renderStage() {
    const w = byId.get(state.id);
    const items = groupWorks();
    const idx = items.findIndex((x) => x.id === w.id);
    const prev = items[idx - 1]; const next = items[idx + 1];
    prevBtn.disabled = !prev; nextBtn.disabled = !next;
    const groupName = state.group === 'chrono' ? 'Chronologie' : v((charsBy.get(state.character) || {}).name) || 'Personnage';
    dockPos.replaceChildren(el('span', { class: 'archives__pos-g', text: groupName }),
      el('span', { class: 'archives__pos-n', text: `${idx + 1} / ${items.length}` }));
    prevBtn.setAttribute('aria-label', prev ? `Œuvre précédente : ${v(prev.title_fr)}` : 'Pas d’œuvre précédente');
    nextBtn.setAttribute('aria-label', next ? `Œuvre suivante : ${v(next.title_fr)}` : 'Pas d’œuvre suivante');
    floatPrev.disabled = !prev; floatNext.disabled = !next;
    floatPrev.setAttribute('aria-label', prevBtn.getAttribute('aria-label'));
    floatNext.setAttribute('aria-label', nextBtn.getAttribute('aria-label'));
    floatPos.replaceChildren(...[...dockPos.childNodes].map((n) => n.cloneNode(true)));

    // fil d'Ariane
    crumb.replaceChildren(
      el('li', { text: 'Archives' }),
      el('li', { text: groupName }),
      el('li', { 'aria-current': 'page', text: v(w.title_fr) || w.id }));

    // visuel + reflet (sol-miroir)
    visual.replaceChildren(poster(w, false, { title: false }), el('div', { class: 'archives__mirror', 'aria-hidden': 'true' }, poster(w, true, { title: false })));

    const d = mainDate(w);
    const st = d ? statusOf(d.v, d.precision, todayParis()) : { key: 'tba', label: 'Date à confirmer' };
    const facts = el('dl', { class: 'archives__facts' });
    const addFact = (k, val) => { if (val) facts.append(el('div', {}, el('dt', { text: k }), el('dd', { text: val }))); };
    const r = w.release || {};
    addFact('Sortie en France', r.fr ? formatDateFr(r.fr.v, r.fr.precision) : null);
    addFact('Sortie aux États-Unis', r.us ? formatDateFr(r.us.v, r.us.precision) : null);
    if (!r.fr && !r.us && r.first) addFact('Première sortie', formatDateFr(r.first.v, r.first.precision));
    if (w.universe && w.universe.v !== 'earth-616') {
      const u = taxonomy.universes.find((x) => x.id === w.universe.v);
      addFact('Univers', u ? u.label_fr : w.universe.v);
    }
    addFact('Réalisation', (w.directors || []).map((x) => x.v).join(', '));
    if (w.seasons && w.seasons.length) addFact('Saisons', w.seasons.map((s) => `${s.n} (phase ${s.phase})`).join(', '));
    if (w.story && w.story.provisional) addFact('Ordre de l’histoire', 'Place à confirmer (provisoire)');

    const title = el('h2', { id: 'archives-titre', tabindex: '-1', text: v(w.title_fr) || w.id });
    const vo = v(w.title_original) && v(w.title_original) !== v(w.title_fr)
      ? el('p', { class: 'archives__vo', lang: (w.title_original.lang || 'en'), text: v(w.title_original) }) : null;
    const status = st.key !== 'released' ? el('p', { class: 'archives__status', text: st.label }) : null;
    const markBox = workMarks(w);

    // accroche (TMDB) ou présentation (Wikipédia)
    const accroche = el('section', { class: 'archives__section' }, el('h3', {}, el('span', { 'aria-hidden': 'true', text: '◆ ' }), 'Accroche'));
    if (w.tagline) {
      accroche.append(el('p', { text: w.tagline.v }), el('p', { class: 'credit', text: 'Accroche : TMDB.' }));
    } else {
      accroche.append(el('p', { class: 'muted', text: 'Chargement…' }));
    }
    const intrigue = el('section', { class: 'archives__section' }, el('h3', {}, el('span', { 'aria-hidden': 'true', text: '◆ ' }), 'Intrigue'));
    const apps = el('section', { class: 'archives__section' }, el('h3', {}, el('span', { 'aria-hidden': 'true', text: '◆ ' }), 'Apparitions'));
    renderApps(w, apps);
    const links = el('section', { class: 'archives__section' }, el('h3', {}, el('span', { 'aria-hidden': 'true', text: '◆ ' }), 'Liens avec…'));
    renderLinks(w, links); // sans attendre : le titre et le synopsis s’affichent tout de suite
    const sources = el('section', { class: 'archives__section archives__sources' },
      el('h3', {}, el('span', { 'aria-hidden': 'true', text: '◆ ' }), 'Sources'),
      el('p', {}, 'Fiche complète et sources détaillées : ', el('a', { href: `${root}oeuvres/${w.slug}/`, text: `fiche de « ${v(w.title_fr)} »` }), '.'),
      el('p', { class: 'credit', text: `Données : Wikidata (${w.id}, CC0)${w.frwiki ? ` ; textes : Wikipédia, « ${w.frwiki.title} », CC BY-SA 4.0` : ''}${w.tagline ? ' ; accroche : TMDB' : ''}.` }));

    stage.dataset.phase = w.phase ? String(w.phase.v) : ''; // code couleur (data/couleurs.css)
    stage.dataset.saga = w.saga ? w.saga.v : '';
    caption.dataset.phase = stage.dataset.phase;
    const kind = el('p', { class: 'archives__kind', text: [KIND[w.kind], w.phase ? `Phase ${ROMAN[w.phase.v] || w.phase.v}` : 'Phase à préciser'].filter(Boolean).join(' · ') });
    if (isJournal()) {
      // synopsis court sous l'affiche, comme sur une plateforme de streaming ; « Détails » descend vers la fiche
      const more = el('button', { type: 'button', class: 'button archives__more', text: 'Détails, distribution et sources', onclick: () => {
        const reduce = document.documentElement.classList.contains('is-reduced-motion');
        stage.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
        const h = stage.querySelector('h3');
        if (h) { h.tabIndex = -1; h.focus({ preventScroll: true }); }
      } });
      caption.replaceChildren(...[kind, title, vo, status, markBox, accroche, more].filter(Boolean));
      accroche.classList.add('archives__synopsis');
      text.replaceChildren(...[facts, intrigue, apps, links, sources].filter(Boolean));
      fitJournal(false);
    } else {
      caption.replaceChildren();
      text.replaceChildren(...[kind, title, vo, status, markBox, facts, accroche, intrigue, apps, links, sources].filter(Boolean));
    }

    // textes Wikipédia chargés à la demande
    if (!textsPromise) textsPromise = loadData('texts.json').catch(() => null);
    const texts = await textsPromise;
    if (state.id !== w.id) return; // l'utilisateur a changé d'œuvre entre-temps
    const t = texts && texts.texts[w.id];
    if (!w.tagline) {
      const p = accroche.querySelector('.muted');
      if (t && t.presentation && t.presentation.length) {
        const paras = isJournal() ? [shortText(t.presentation[0])] : t.presentation;
        p.replaceWith(...paras.map((x) => el('p', { text: x })),
          el('p', { class: 'credit', text: 'Présentation : introduction de l’article Wikipédia, CC BY-SA 4.0. L’accroche TMDB n’est pas encore activée.' }));
      } else p.textContent = 'Accroche indisponible.';
    }
    if (t && t.plot && t.plot.length) {
      const tpl = document.createElement('template');
      tpl.className = 'spoiler__content';
      t.plot.forEach((x) => tpl.content.append(el('p', { text: x })));
      tpl.content.append(el('p', { class: 'credit', text: `Section « ${t.plot_section || 'Synopsis'} » de l’article Wikipédia, CC BY-SA 4.0, extrait modifié.` }));
      intrigue.append(el('div', { class: 'spoiler', 'data-spoiler': 'plot', 'data-work': w.id },
        el('button', { type: 'button', class: 'spoiler__reveal button', 'aria-expanded': 'false', text: 'Révéler l’intrigue complète (contient des spoilers)' }), tpl));
    } else {
      intrigue.append(el('p', { class: 'muted', text: 'Intrigue non disponible dans la source.' }));
    }
    refreshSpoilers(dialog);
  }

  // « Vu » / « À voir » de l'œuvre affichée : mêmes marques que la liste, la fenêtre « Vus » et les pages
  // d'œuvre (marks.js) ; une œuvre pas encore sortie n'a que « À voir »
  const marks = createMarks(works);
  let syncMarks = null;
  function workMarks(w) {
    const grp = el('div', { class: 'work__marks archives__marks', role: 'group', 'aria-label': 'Marquer cette œuvre' });
    const mk = (cls, text, kind) => el('button', { type: 'button', class: `mark-btn ${cls}`, text, onclick: () => {
      const r = marks.toggle(w, kind);
      live.textContent = '';
      setTimeout(() => { live.textContent = r.msg; }, 60);
    } });
    const bVu = marks.released(w) ? mk('mark-btn--vu', 'Vu', 'vu') : null;
    const bAv = mk('mark-btn--avoir', 'À voir', 'avoir');
    grp.append(...[bVu, bAv].filter(Boolean));
    syncMarks = () => {
      if (bVu) bVu.setAttribute('aria-pressed', String(marks.seen().has(w.id)));
      bAv.setAttribute('aria-pressed', String(marks.watch().has(w.id)));
    };
    syncMarks();
    return grp;
  }

  // Apparitions : une case par rôle (monogramme du personnage, rôle tel que crédité, interprète) plutôt
  // qu'une liste de texte ; au-delà de CAST_MAX rôles d'un même niveau, les suivants à la demande
  function castTile(a) {
    const actor = actorsBy.get(a.actor);
    const ch = charsBy.get(a.character);
    const role = v(a.role) || v(ch && ch.name) || 'rôle';
    const who = actor ? v(actor.name) : '';
    const li = el('li', { class: 'cast', title: who ? `${role} : ${who}` : role },
      medal(v(ch && ch.name) || role, [...(phasesByChar.get(a.character) || [])]),
      el('span', { class: 'cast__role', text: role }));
    if (who) li.append(el('span', { class: 'visually-hidden', text: ', joué par ' }), el('span', { class: 'cast__actor', text: who }));
    return li;
  }
  function renderApps(w, box) {
    const list0 = appsByWork.get(w.id) || [];
    const withRole = list0.filter((a) => a.character);
    if (!withRole.length) { box.append(el('p', { class: 'muted', text: 'Distribution non renseignée dans les sources.' })); return; }
    LEVELS.forEach(([lvl, label]) => {
      const items = withRole.filter((a) => ((a.level && a.level.v) || null) === lvl);
      if (!items.length) return;
      const ulId = `arch-cast-${lvl || 'autres'}`;
      const ul = el('ul', { class: 'archives__cast', id: ulId }, items.map(castTile));
      const block = [el('h4', { text: label }), ul];
      const extra = lvl === 'cameo' ? [] : [...ul.children].slice(CAST_MAX);
      if (extra.length) {
        extra.forEach((li) => { li.hidden = true; });
        const more = `Afficher ${extra.length > 1 ? `les ${extra.length} autres rôles` : 'l’autre rôle'}`;
        const btn = el('button', { type: 'button', class: 'button archives__castmore', 'aria-expanded': 'false', 'aria-controls': ulId, text: more });
        btn.addEventListener('click', () => {
          const open = btn.getAttribute('aria-expanded') !== 'true';
          extra.forEach((li) => { li.hidden = !open; });
          btn.setAttribute('aria-expanded', String(open));
          btn.textContent = open ? 'Réduire la liste' : more;
          if (!open) btn.focus({ preventScroll: false });
        });
        block.push(btn);
      }
      if (lvl === 'cameo') {
        const tpl = document.createElement('template');
        tpl.className = 'spoiler__content';
        block.forEach((b) => tpl.content.append(b));
        box.append(el('div', { class: 'spoiler', 'data-spoiler': 'cameo', 'data-work': w.id },
          el('button', { type: 'button', class: 'spoiler__reveal button', 'aria-expanded': 'false', text: 'Afficher les caméos (révèle des surprises)' }), tpl));
      } else box.append(...block);
    });
    box.append(el('p', { class: 'credit', text: 'Rôles : Wikidata. Niveaux selon la page Méthode.' }));
  }

  async function renderLinks(w, box) {
    const mine = new Set((appsByWork.get(w.id) || []).map((a) => a.character).filter(Boolean));
    const scores = new Map();
    mine.forEach((c) => (worksByChar.get(c) || new Set()).forEach((id) => {
      if (id !== w.id) scores.set(id, (scores.get(id) || 0) + 1);
    }));
    const { vuJusqua, toutAfficher } = getPrefs();
    const candidates = [];
    for (const [id, n] of [...scores.entries()].sort((a, b) => b[1] - a[1])) {
      if (vuJusqua && !toutAfficher && !(await isSeen(id))) continue; // pas de spoiler sur la suite
      candidates.push([id, n]);
      if (candidates.length >= 6) break;
    }
    if (!candidates.length) { box.append(el('p', { class: 'muted', text: vuJusqua && !toutAfficher ? 'Aucun lien parmi les œuvres déjà vues.' : 'Aucun personnage commun renseigné.' })); return; }
    box.append(el('ul', { class: 'archives__links' }, candidates.map(([id, n]) => {
      const o = byId.get(id);
      return el('li', {}, el('button', { type: 'button', class: 'linklike', onclick: () => { if (!groupWorks().some((x) => x.id === id)) state.group = 'chrono'; setWork(id, true); renderGroup(false); } },
        `${v(o.title_fr)}`), el('span', { class: 'muted', text: ` · ${n} personnage${n > 1 ? 's' : ''} en commun` }));
    })));
  }

  async function renderCounter() {
    const today = todayParis();
    const released = works.filter((w) => { const d = mainDate(w); return d && statusOf(d.v, d.precision, today).key === 'released'; });
    let seen = 0;
    for (const w of released) if (await isSeen(w.id)) seen += 1;
    counter.textContent = `Vus : ${seen} / ${released.length}`;
  }

  function applyLayout() {
    const l = getPrefs().disposition === 'journal' ? 'journal' : 'codex';
    const changed = dialog.dataset.layout !== l;
    dialog.dataset.layout = l;
    layoutBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.layout === l)));
    if (phone.matches) { dock.prepend(prevBtn); dock.append(nextBtn); bar.prepend(closeBtn); }
    else {
      barEnd.append(closeBtn);
      if (l === 'journal') { rail.prepend(prevBtn); rail.append(nextBtn); } else { stage.prepend(prevBtn); stage.append(nextBtn); }
    }
    if (changed && state.open && state.id) { renderStage(); requestAnimationFrame(() => centerCurrent(false)); }
    else fitJournal();
    syncTops();
  }

  function url(id) {
    const u = new URL(location.href);
    u.searchParams.set('oeuvre', byId.get(id).slug);
    u.searchParams.set('groupe', state.group);
    return u;
  }

  async function setWork(id, announceIt, { fromScroll = false } = {}) {
    if (!byId.has(id)) return;
    // autre œuvre : sa fiche s'affiche depuis le début (pas à la hauteur où l'on lisait la précédente)
    if (id !== state.id) toTop();
    state.id = id;
    if (state.group === 'perso' && !(worksByChar.get(state.character) || new Set()).has(id)) {
      state.character = defaultCharacter(id);
      renderGroup(false);
    }
    list.querySelectorAll('.archives__item').forEach((b) => {
      const on = b.dataset.id === id;
      if (on) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
      b.tabIndex = on ? 0 : -1;
    });
    if (!fromScroll) centerCurrent(true);
    if (!isJournal()) revealInList();
    const w = byId.get(id);
    document.title = `${v(w.title_fr)} · Archives`;
    if (state.open && !pendingBack) history.replaceState({ archives: true }, '', url(id));
    else if (state.open && pendingBack) deferredPush = url(id);
    onWorkChange(w);
    await renderStage();
    syncTops();
    if (announceIt) {
      const items = groupWorks();
      const d = mainDate(w);
      live.textContent = '';
      setTimeout(() => { live.textContent = `${v(w.title_fr)}${d ? `, ${d.v.slice(0, 4)}` : ''}, ${items.findIndex((x) => x.id === id) + 1} sur ${items.length}.`; }, 60);
    }
  }

  function toTop() { bodyEl.scrollTop = 0; stage.scrollTop = 0; }

  function step(dir) {
    const items = groupWorks();
    const i = items.findIndex((x) => x.id === state.id);
    const t = items[i + dir];
    if (t) setWork(t.id, true);
  }

  function setGroup(g) {
    state.group = g;
    if (g === 'perso' && !state.character) state.character = defaultCharacter(state.id);
    renderGroup(false);
    renderStage();
    if (state.open) history.replaceState({ archives: true }, '', url(state.id));
  }

  // ←/→ seulement quand le focus est sur la scène, la liste ou les cartes (jamais onglets/select)
  dialog.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (!(stage.contains(e.target) || e.target === dialog)) return;
    if (e.target.matches('input, select, textarea')) return;
    if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
    if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
  });
  dialog.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
  dialog.addEventListener('close', () => { if (state.open) close(); });
  // Historique : la fermeture par l'interface appelle history.back(), asynchrone. Si la vue est
  // rouverte avant la fin de ce retour, l'entrée est poussée seulement après (pendingBack).
  let pendingBack = false;
  let deferredPush = null;
  window.addEventListener('popstate', () => {
    if (overlayPop()) return; // fermeture d'un panneau (Réglages, recherche) : rien à faire ici
    if (pendingBack) {
      pendingBack = false;
      if (deferredPush && state.open) history.pushState({ archives: true }, '', deferredPush);
      deferredPush = null;
      return;
    }
    if (state.open) close(true);
  });
  onPrefs(() => {
    if (!state.open) return;
    applyLayout();
    renderCounter();
    if (syncMarks) syncMarks(); // les spoilers suivent d'eux-mêmes (spoilers.js écoute aussi les réglages)
  });
  phone.addEventListener('change', () => applyLayout());
  let fitTimer = 0;
  // redimensionnement (rotation du téléphone…) : les cartes changent de taille ; le carrousel est recentré
  // sur l'œuvre affichée, sans que son défilement en choisisse une autre
  window.addEventListener('resize', () => {
    if (!state.open) return;
    ignoreScrollUntil = performance.now() + 500;
    clearTimeout(fitTimer);
    fitTimer = setTimeout(() => { fitJournal(); centerCurrent(false); }, 120);
  });

  const docTitle = document.title;

  function open(id, { group = 'chrono', opener = null, character = null } = {}) {
    if (!byId.has(id)) return;
    if (!GROUPS.includes(group)) group = 'chrono'; // ancien groupe « phase » (adresses partagées)
    let ch = character || state.character;
    if (group === 'perso' && (!ch || !(worksByChar.get(ch) || new Set()).has(id))) ch = defaultCharacter(id);
    state = { ...state, id, group, opener: opener || document.activeElement, character: ch, open: true };
    // adresse de retour sans l'œuvre : ouverte par un lien direct (?oeuvre=…), la fiche une fois fermée
    // ne doit pas se rouvrir au rechargement ni dans l'autre frise
    const back = new URL(location.href);
    back.searchParams.delete('oeuvre');
    back.searchParams.delete('groupe');
    state.returnUrl = back.href;
    if (back.href !== location.href && !(history.state && history.state.archives) && !pendingBack) history.replaceState(history.state, '', back);
    applyLayout();
    renderGroup(false);
    if (!dialog.open) dialog.showModal();
    toTop(); // nouvelle ouverture : en haut de la fiche
    fitJournal(); // mesures possibles seulement une fois la fenêtre affichée
    if (pendingBack) deferredPush = url(id); else history.pushState({ archives: true }, '', url(id));
    renderCounter();
    setWork(id, false).then(() => {
      const t = dialog.querySelector('#archives-titre');
      if (t) t.focus();
    });
    document.documentElement.classList.add('has-archives');
  }

  function close(fromHistory = false) {
    if (!state.open) return;
    state.open = false;
    if (dialog.open) dialog.close();
    document.documentElement.classList.remove('has-archives');
    document.title = docTitle;
    if (!fromHistory) {
      if (history.state && history.state.archives) { pendingBack = true; history.back(); }
      else history.replaceState(null, '', state.returnUrl || location.pathname);
    }
    onClose(state.id);
    const target = state.opener && document.contains(state.opener) ? state.opener : null;
    if (target) target.focus();
  }

  return { open, close, element: dialog, isOpen: () => state.open, current: () => state.id };
}
