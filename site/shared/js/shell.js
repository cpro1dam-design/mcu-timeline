// Coquille commune des deux frises : branche à l'identique, pour Éphémérides et Fil noir, les contrôles
// partagés (modes, ordre, zoom, réglages, pause du ciel, vue liste, séries) sur le contrat DOM de
// la page de chaque frise (contrat DOM : shared/CONTRACT.md), puis laisse chaque frise dessiner sa vue d'ensemble.
//
//   const ctx = await bootConcept({ concept: 'a', treatment: 'rim', layout(ctx) {…} });
//
// La maquette reçoit `ctx` et réagit aux événements : ctx.on('render', fn) est appelé après tout
// changement de mode, d'ordre, de niveau de zoom, de personnage ou de visibilité des séries.

import { getPrefs, setPref, onPrefs, reducedMotion } from './prefs.js';
import { loadData, siteRoot } from './data.js';
import { createSky, setCssTint } from './sky.js';
import { createZoom, LEVELS } from './zoom.js';
import { createArchiveView } from './archive-view.js';
import { initSpoilers, isSeen } from './spoilers.js';
import { initVus, seenFilter } from './vus.js';
import { initVersionSwitch } from './versions.js';
import { initSearch } from './search.js';
import { formatDateFr, statusOf, todayParis } from './dates.js';
import { mainDate, sortWorks, laneOf } from './layout.js';
import { colorKey } from './colors.js';
import { createPhaseFilter, phasesFromParam, phasesToParam, describePhases, sagaShort } from './filter.js';
import { createOverlay, overlayPop } from './overlays.js';
import { createAppShell } from './appshell.js';
import { initToTop } from './totop.js';
import { registerOffline } from './offline.js';
import { createMedals } from './medal.js';

const MODES = { phases: 'Phases', chronologie: 'Chronologie', personnages: 'Personnages' };
const KIND = { film: 'Film', series: 'Série', special: 'Épisode spécial' };
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX'];

const $ = (sel, root = document) => root.querySelector(sel);

export async function bootConcept(options = {}) {
  const params = new URLSearchParams(location.search);
  const announcer = $('#annonces');
  const announce = (msg) => {
    if (!announcer) return;
    announcer.textContent = '';
    setTimeout(() => { announcer.textContent = msg; }, 80);
  };

  // Les personnages (characters.json, le plus gros fichier) ne retardent pas le premier affichage : ils
  // sont chargés d'emblée seulement si la page s'ouvre en mode Personnages ou sur une fiche, sinon juste
  // après le premier rendu, ou dès qu'on en a besoin (mode Personnages, fiche, recherche).
  const needChars = params.get('mode') === 'personnages' || params.has('oeuvre');
  let data;
  try {
    const names = ['works.json', 'taxonomy.json', 'status.json'].concat(needChars ? ['characters.json'] : []);
    const [w, t, s, c] = await Promise.all(names.map(loadData));
    data = { works: w.works, characters: c || null, taxonomy: t, status: s };
  } catch (e) {
    document.documentElement.classList.remove('is-loading');
    const box = $('#erreur-donnees');
    if (box) {
      box.hidden = false;
      box.textContent = location.protocol === 'file:'
        ? 'Ouvrez ce site via le serveur local (py -3 tools/serve.py) : les données ne se chargent pas en file://.'
        : 'Les données n’ont pas pu être chargées. Réessayez plus tard, ou consultez la liste des œuvres.';
    }
    throw e;
  }

  // données arrivées : le squelette de chargement laisse la place à la frise
  document.documentElement.classList.add('is-loaded');
  document.documentElement.classList.remove('is-loading');
  const friseBusy = $('#frise');
  if (friseBusy) friseBusy.removeAttribute('aria-busy');

  const listeners = new Map();
  const emit = (ev, payload) => (listeners.get(ev) || []).forEach((fn) => fn(payload));
  let app = null; // interface appli sur téléphone (appshell.js), créée après la maquette
  const root = document.documentElement;
  root.dataset.concept = options.concept || '';

  // -- état ----------------------------------------------------------------------------
  const prefs = getPrefs();
  const state = {
    mode: MODES[params.get('mode')] ? params.get('mode') : 'chronologie',
    orderPref: params.get('order') === 'story' || (params.get('order') !== 'release' && prefs.ordre === 'story') ? 'story' : 'release',
    // ordre suivi par la frise : en mode Phases, toujours l'ordre de sortie (le choix Sortie | Histoire y
    // est masqué, demande de l'utilisateur) ; le choix reste gardé pour les autres modes
    get order() { return this.mode === 'phases' ? 'release' : this.orderPref; },
    set order(v) { this.orderPref = v; },
    series: prefs.seriesVisibles !== false,
    character: params.get('personnage') || null,
    focusId: null,
    listView: params.get('view') === 'list',
    phases: phasesFromParam(params.get('phases'), data.taxonomy), // filtre saga / phase (toutes = aucun filtre)
    openPhase: data.taxonomy.phases.some((p) => String(p.n) === params.get('phase')) ? Number(params.get('phase')) : null, // mode Phases
  };
  const allPhases = data.taxonomy.phases.map((p) => p.n);
  const filtering = () => !allPhases.every((n) => state.phases.has(n));
  // le filtre saga / phase vaut pour les modes Chronologie et Personnages ; en mode Phases, les cartes de
  // phase en tiennent lieu (le filtre est masqué et ne s'applique pas)
  const filterOn = () => state.mode !== 'phases' && filtering();

  // -- ciel -------------------------------------------------------------------------------
  const canvas = $('#sky');
  const sky = canvas ? createSky(canvas, { reducedMotion: reducedMotion(), seed: options.seed }) : null;
  // parallaxe : le ciel glisse un peu quand la page ou la frise défilent (jamais tout seul, rien en
  // mouvement réduit) ; une maquette peut aussi le déplacer (rotation du cadran) avec ctx.skyCamera.
  let camX = 0;
  let camY = 0;
  function skyCamera(x = camX, y = camY) {
    camX = x; camY = y;
    if (sky) sky.setCamera({ x: -camX / 120, y: camY / 120 });
  }
  window.addEventListener('scroll', () => skyCamera(camX, window.scrollY), { passive: true });
  document.addEventListener('scroll', (e) => {
    if (e.target && e.target.id === 'frise') skyCamera(e.target.scrollLeft, window.scrollY);
  }, { passive: true, capture: true });
  const byId = new Map(data.works.map((w) => [w.id, w]));
  let tintTimer = 0;
  function tintFor(id, immediate = false) {
    const w = byId.get(id);
    if (!w || !w.palette) return;
    clearTimeout(tintTimer);
    const apply = () => { if (sky) sky.setTint(w.palette, { duration: reducedMotion() ? 200 : 1000 }); else setCssTint(w.palette); };
    if (immediate) apply(); else tintTimer = setTimeout(apply, 150);
  }

  // -- liste des œuvres (source de vérité, un seul arrêt de tabulation) --------------------
  const ol = $('#oeuvres');
  const items = new Map();
  const today = todayParis();
  data.works.forEach((w) => {
    const d = mainDate(w);
    const st = d ? statusOf(d.v, d.precision, today) : { key: 'tba', label: 'Date à confirmer' };
    const li = document.createElement('li');
    li.className = 'node';
    li.dataset.id = w.id;
    li.dataset.kind = w.kind;
    li.dataset.phase = w.phase ? w.phase.v : '';
    li.dataset.saga = w.saga ? w.saga.v : '';
    li.dataset.universe = w.universe ? w.universe.v : 'earth-616';
    const uni = w.universe ? data.taxonomy.universes.find((u) => u.id === w.universe.v && !u.main) : null;
    if (uni) li.dataset.alt = 'true'; // autre univers (Terre-828…) : signalé à part dans les deux frises
    li.dataset.status = st.key;
    if (w.story && w.story.provisional) li.dataset.provisional = 'true';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'node__btn';
    btn.tabIndex = -1;
    const title = document.createElement('span');
    title.className = 'node__title';
    title.textContent = w.title_fr ? w.title_fr.v : w.id;
    const meta = document.createElement('span');
    meta.className = 'node__meta';
    meta.textContent = [d ? d.v.slice(0, 4) : null, w.phase ? `Phase ${w.phase.v}` : 'Phase à préciser', KIND[w.kind]].filter(Boolean).join(' · ');
    const extra = document.createElement('span');
    extra.className = 'visually-hidden';
    extra.textContent = [st.key !== 'released' ? st.label : null, w.story && w.story.provisional ? 'place dans l’histoire à confirmer' : null,
      uni ? `autre univers : ${uni.label_fr}` : null]
      .filter(Boolean).map((x) => `, ${x}`).join('');
    btn.append(title, meta, extra);
    li.append(btn);
    if (uni) { // étiquette toujours visible (décorative : le nom accessible le dit déjà)
      const tag = document.createElement('span');
      tag.className = 'node__uni';
      tag.setAttribute('aria-hidden', 'true');
      tag.textContent = uni.label_fr;
      li.append(tag);
    }
    items.set(w.id, li);
  });

  // -- mode Phases : une « étoile » par phase (pseudo-œuvre au même format), dépliée d'un clic --------
  const phaseWorks = new Map();
  data.taxonomy.phases.forEach((p) => {
    const members = sortWorks(data.works.filter((w) => w.phase && w.phase.v === p.n), 'release');
    if (!members.length) return;
    const first = mainDate(members[0]);
    const last = mainDate(members[members.length - 1]);
    const years = [first, last].map((d) => (d ? d.v.slice(0, 4) : '?'));
    const pw = {
      id: `phase-${p.n}`, slug: `phase-${p.n}`, kind: 'phase', isPhase: true, n: p.n, roman: p.roman,
      count: members.length, years, members: members.map((w) => w.id),
      title_fr: { v: `Phase ${p.roman}` }, title_original: null,
      release: { fr: null, us: null, first: first ? { v: first.v, precision: first.precision } : null },
      phase: { v: p.n }, saga: { v: p.saga }, universe: { v: 'earth-616' },
      story: { v: p.n }, order_release: { v: p.n },
      palette: members[0].palette, seasons: [], tagline: null, poster: null, directors: [], has_plot: false, frwiki: null,
    };
    phaseWorks.set(p.n, pw);
    byId.set(pw.id, pw);
    const st0 = first ? statusOf(first.v, first.precision, today) : { key: 'tba' };
    const li = document.createElement('li');
    li.className = 'node node--phase';
    li.dataset.id = pw.id;
    li.dataset.kind = 'phase';
    li.dataset.phase = String(p.n);
    li.dataset.saga = p.saga;
    li.dataset.universe = 'earth-616';
    li.dataset.status = st0.key;
    li.hidden = true;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'node__btn';
    btn.tabIndex = -1;
    const title = document.createElement('span');
    title.className = 'node__title';
    title.textContent = pw.title_fr.v;
    const meta = document.createElement('span');
    meta.className = 'node__meta';
    meta.textContent = `${years[0] === years[1] ? years[0] : `${years[0]} – ${years[1]}`} · ${pw.count} œuvres`;
    const extra = document.createElement('span');
    extra.className = 'visually-hidden';
    extra.textContent = ', déplier la phase';
    btn.append(title, meta, extra);
    li.append(btn);
    items.set(pw.id, li);
  });

  // filtre propre à une frise (ctx.viewFilter(liste) → prédicat ou null ; ex. Éphémérides : deux sagas
  // par cadran), appliqué en dernier ; visible({ all: true }) l'ignore
  function visible({ all = false } = {}) {
    if (state.mode === 'phases' && !state.openPhase) {
      return [...phaseWorks.values()];
    }
    let sel = data.works.filter((w) => (state.series || w.kind === 'film')
      && (!filterOn() || (w.phase && state.phases.has(w.phase.v))));
    if (state.mode === 'phases') sel = sel.filter((w) => w.phase && w.phase.v === state.openPhase);
    if (state.mode === 'personnages' && state.character && charsReady) {
      const set = worksOfCharacter(state.character);
      sel = sel.filter((w) => set.has(w.id));
    }
    // « Vus et à voir » : œuvres vues, pas encore vues ou à voir (jamais une frise vide)
    const seenSel = seenFilter(sel, data.works);
    if (seenSel.length) sel = seenSel;
    const keep = !all && ctx.viewFilter ? ctx.viewFilter(sel) : null; // prédicat, ou null (pas de filtre)
    if (keep) { const v = sel.filter(keep); if (v.length) sel = v; }
    return sortWorks(sel, state.order);
  }

  function renderList() {
    const list = visible();
    const ids = new Set(list.map((w) => w.id));
    items.forEach((li, id) => { li.hidden = !ids.has(id); });
    list.forEach((w) => ol.append(items.get(w.id)));
    if (!state.focusId || !ids.has(state.focusId)) state.focusId = list.length ? list[0].id : null;
    items.forEach((li, id) => { li.querySelector('.node__btn').tabIndex = id === state.focusId ? 0 : -1; });
    // mode Personnages : la frise ne garde que ses œuvres, toutes mises en évidence
    const on = state.mode === 'personnages' && !!state.character;
    items.forEach((li, id) => {
      li.classList.toggle('is-highlighted', on && ids.has(id));
      li.classList.remove('is-dimmed');
    });
  }

  // -- personnages : galerie, fiche du personnage, frise de ses seules œuvres ---------------------
  // Les caméos (niveau « caméo ou non crédité ») sont des surprises : ils ne comptent qu'avec le
  // réglage « Tout afficher », comme dans les Archives.
  // Index remplis sur place quand les personnages arrivent (mêmes objets pour ctx et les maquettes).
  const worksMain = new Map();
  const worksAll = new Map();
  const actorsOf = new Map();
  const charName = new Map();
  const charAka = new Map(); // alias Wikidata
  const recurring = [];
  let charsReady = false;
  let charsPromise = null;
  const addTo = (m, k, v) => { if (!m.has(k)) m.set(k, new Set()); m.get(k).add(v); };
  const showCameos = () => !!getPrefs().toutAfficher;
  function worksOfCharacter(id) { return (showCameos() ? worksAll : worksMain).get(id) || new Set(); }
  function indexCharacters(chars) {
    const actorName = new Map(chars.actors.map((a) => [a.id, a.name ? a.name.v : null]));
    chars.appearances.forEach((a) => {
      if (!a.character || !byId.has(a.work)) return;
      const cameo = !!(a.level && a.level.v === 'cameo');
      addTo(worksAll, a.character, a.work);
      if (cameo) return;
      addTo(worksMain, a.character, a.work);
      const n = actorName.get(a.actor);
      if (n) {
        if (!actorsOf.has(a.character)) actorsOf.set(a.character, new Map());
        const m = actorsOf.get(a.character);
        m.set(n, (m.get(n) || 0) + 1);
      }
    });
    chars.characters.forEach((c) => {
      charName.set(c.id, c.name ? c.name.v : c.id);
      charAka.set(c.id, (c.aliases && c.aliases.v) || []);
    });
    recurring.push(...[...worksMain.entries()].filter(([id, s]) => s.size >= 2 && charName.get(id))
      .map(([id, s]) => ({ id, name: charName.get(id), aka: charAka.get(id) || [], count: s.size,
        actors: [...(actorsOf.get(id) || new Map()).entries()].sort((x, y) => y[1] - x[1]).map(([n]) => n) })) // interprètes, hors caméos
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'fr')));
    if ((!state.character || !worksAll.has(state.character)) && recurring.length) {
      // par défaut : le personnage le plus souvent en tête de distribution (ordre Wikidata)
      const lead = new Map();
      const seenWork = new Set();
      chars.appearances.forEach((a) => {
        if (!a.character || seenWork.has(a.work) || !byId.has(a.work)) return;
        seenWork.add(a.work);
        lead.set(a.character, (lead.get(a.character) || 0) + 1);
      });
      const best = [...lead.entries()].sort((x, y) => y[1] - x[1])[0];
      state.character = best && worksOfCharacter(best[0]).size >= 3 ? best[0] : recurring[0].id;
    }
    charsReady = true;
  }
  if (data.characters) indexCharacters(data.characters);
  let fillGallery = () => {}; // galerie des personnages, remplie quand ils arrivent
  // une seule requête, partagée ; l'appelant redessine ce qui en dépend
  function ensureChars() {
    if (!charsPromise) {
      charsPromise = (data.characters ? Promise.resolve(data.characters) : loadData('characters.json'))
        .then((c) => {
          if (!charsReady) { data.characters = c; indexCharacters(c); }
          fillGallery();
          return c;
        })
        .catch((e) => { charsPromise = null; throw e; });
    }
    return charsPromise;
  }

  const mk = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; };
  // médaillon d'un personnage (medal.js) : ses initiales, dans un anneau aux couleurs des phases où il
  // apparaît (œuvres hors caméos). Décoratif : nom et phases sont écrits à côté.
  const medalOf = createMedals(data.taxonomy);
  function medal(id) {
    const phs = [...(worksMain.get(id) || [])].map((w) => byId.get(w)).filter((w) => w && w.phase).map((w) => w.phase.v);
    return medalOf(charName.get(id) || id, phs);
  }
  const persoBox = $('#champ-personnage');
  let renderPersos = () => {};
  let cardOpen = false; // fiche du personnage dépliée (téléphone)
  if (persoBox) {
    const title = persoBox.querySelector('.c-persos__title') || mk('h2', 'c-persos__title', 'Personnages');
    const finder = mk('div', 'c-persos__finder');
    const lbl = mk('label', 'c-persos__label', 'Changer de personnage');
    lbl.htmlFor = 'persos-filtre';
    const input = mk('input', 'c-persos__input');
    input.id = 'persos-filtre';
    input.type = 'search';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.placeholder = 'Personnage ou acteur…';
    finder.append(lbl, input);
    const listEl = mk('ul', 'c-persos__list');
    listEl.id = 'persos-liste';
    listEl.setAttribute('aria-label', 'Personnages présents dans au moins deux œuvres');
    const more = mk('button', 'button c-persos__more');
    more.type = 'button';
    more.setAttribute('aria-controls', 'persos-liste');
    const card = mk('article', 'c-perso-card');
    card.setAttribute('aria-labelledby', 'perso-nom');
    card.setAttribute('aria-live', 'polite');
    // la recherche d'abord, ses suggestions (ou la liste complète, sur demande) juste dessous, puis la fiche
    title.classList.add('visually-hidden');
    const none = mk('p', 'c-persos__none', 'Aucun personnage ne correspond.');
    none.hidden = true;
    persoBox.replaceChildren(title, finder, none, listEl, more, card);
    const SUGGEST = 12;
    const btns = new Map();
    const norm = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const subOf = new Map(); // ligne sous le nom : alias et nombre d'œuvres, ou l'interprète trouvé
    const subText = (c) => [c.aka[0], `${c.count} œuvres`].filter(Boolean).join(' · ');
    // le personnage correspond-il ? par son nom ou un alias, sinon par un interprète (rendu visible)
    const matchOf = (c, q) => {
      if (!q) return { ok: true, actor: null };
      if (norm([c.name, ...c.aka].join(' ')).includes(q)) return { ok: true, actor: null };
      const actor = c.actors.find((n) => norm(n).includes(q));
      return { ok: !!actor, actor: actor || null };
    };
    const showSub = (span, c, actor) => { span.textContent = actor ? `Joué par ${actor} · ${c.count} œuvres` : subText(c); };
    function fillList() {
      recurring.forEach((c) => {
        const li = mk('li');
        const b = mk('button', 'c-persos__btn');
        b.type = 'button';
        b.dataset.id = c.id;
        const sub = mk('span', 'c-persos__n', subText(c));
        subOf.set(c.id, sub);
        b.append(medal(c.id), mk('span', 'c-persos__name', c.name), sub);
        b.addEventListener('click', () => { input.value = ''; selectCharacter(c.id); });
        li.append(b);
        listEl.append(li);
        btns.set(c.id, li);
      });
    }
    function filterList() {
      const q = norm(input.value.trim());
      let shown = 0;
      recurring.forEach((c) => {
        const m = matchOf(c, q);
        const vis = !!q && m.ok && shown < SUGGEST; // suggestions (nom, alias ou interprète)
        btns.get(c.id).hidden = !vis;
        if (vis) { shown += 1; showSub(subOf.get(c.id), c, m.actor); }
      });
      listEl.hidden = !shown;
      none.hidden = !(q && !shown) || !charsReady;
      more.hidden = !!q || !recurring.length;
      // sur téléphone, le bouton devient « Changer » à côté du nom (un seul libellé visible = nom accessible)
      more.replaceChildren(mk('span', 'c-persos__more-l', `Voir tous les personnages (${recurring.length})`), mk('span', 'c-persos__more-s', 'Changer'));
      return shown;
    }
    input.addEventListener('input', () => {
      if (!charsReady) { ensureChars().then(() => input.dispatchEvent(new Event('input'))).catch(() => {}); return; }
      const n = filterList();
      if (input.value.trim()) announce(n ? `${n} ${n > 1 ? 'personnages proposés' : 'personnage proposé'}.` : 'Aucun personnage ne correspond.');
    });
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      const first = recurring.find((c) => !btns.get(c.id).hidden);
      if (first) { e.preventDefault(); input.value = ''; selectCharacter(first.id); }
    });
    // liste complète : grande fenêtre en plein écran, translucide (la frise reste devinée derrière)
    more.setAttribute('aria-haspopup', 'dialog');
    more.removeAttribute('aria-controls');
    const dlg = mk('dialog', 'c-persos-dialog');
    dlg.setAttribute('aria-labelledby', 'persos-dlg-titre');
    const dIn = mk('div', 'c-persos-dialog__in');
    const dHead = mk('div', 'c-persos-dialog__head');
    const dTitle = mk('h2', 'c-persos-dialog__title', 'Tous les personnages');
    dTitle.id = 'persos-dlg-titre';
    const dCount = mk('p', 'c-persos-dialog__count');
    const dClose = mk('button', 'button c-persos-dialog__close', 'Fermer');
    dClose.type = 'button';
    dHead.append(dTitle, dCount, dClose);
    const dFind = mk('div', 'c-persos-dialog__find');
    const dLbl = mk('label', 'c-persos__label', 'Filtrer par personnage ou acteur');
    dLbl.htmlFor = 'persos-dlg-filtre';
    const dInput = mk('input', 'c-persos__input');
    dInput.id = 'persos-dlg-filtre';
    dInput.type = 'search';
    dInput.autocomplete = 'off';
    dInput.spellcheck = false;
    dInput.placeholder = 'Personnage ou acteur…';
    dFind.append(dLbl, dInput);
    const dList = mk('ul', 'c-persos-dialog__list');
    dList.setAttribute('aria-label', 'Personnages présents dans au moins deux œuvres, du plus présent au moins présent');
    const dBtns = new Map();
    const dSubOf = new Map();
    function fillDialog() {
      recurring.forEach((c) => {
        const li = mk('li');
        const b = mk('button', 'c-persos__btn');
        b.type = 'button';
        const sub = mk('span', 'c-persos__n', subText(c));
        dSubOf.set(c.id, sub);
        b.append(medal(c.id), mk('span', 'c-persos__name', c.name), sub);
        b.addEventListener('click', () => { persosOv.close().then(() => { input.value = ''; selectCharacter(c.id); more.focus(); }); });
        li.append(b);
        dList.append(li);
        dBtns.set(c.id, li);
      });
    }
    fillGallery = () => { if (!btns.size && recurring.length) { fillList(); fillDialog(); } };
    fillGallery();
    const dNone = mk('p', 'c-persos__none', 'Aucun personnage ne correspond.');
    dNone.hidden = true;
    dIn.append(dHead, dFind, dList, dNone);
    dlg.append(dIn);
    document.body.append(dlg);
    initToTop(dlg, { host: dlg, focus: () => dTitle });
    function filterDialog() {
      const q = norm(dInput.value.trim());
      let n = 0;
      recurring.forEach((c) => { const m = matchOf(c, q); dBtns.get(c.id).hidden = !m.ok; if (m.ok) { n += 1; showSub(dSubOf.get(c.id), c, m.actor); } });
      dNone.hidden = !!n;
      dCount.textContent = q ? `${n} sur ${recurring.length}` : `${recurring.length} personnages`;
      return n;
    }
    dInput.addEventListener('input', () => { const n = filterDialog(); announce(n ? `${n} ${n > 1 ? 'personnages' : 'personnage'}.` : 'Aucun personnage ne correspond.'); });
    const persosOv = createOverlay(dlg, { closeOnBackdrop: false, onClose: () => { document.documentElement.classList.remove('has-persos-dialog'); } });
    dClose.addEventListener('click', () => { persosOv.close().then(() => more.focus()); });
    more.addEventListener('click', () => {
      dInput.value = '';
      filterDialog();
      dBtns.forEach((li, id) => li.firstChild.setAttribute('aria-pressed', String(id === state.character)));
      document.documentElement.classList.add('has-persos-dialog');
      persosOv.show();
      dInput.focus();
    });
    // en-tête de la fiche (médaillon, nom, œuvres, alias) : un bloc qui reste le même d'un rendu à
    // l'autre. Il se fond dans la fiche (display: contents), mais une maquette peut l'en sortir
    // (Éphémérides grand écran : cadre au-dessus du cadran ; la fiche garde le reste, à gauche).
    const head = mk('div', 'c-perso-card__head');
    renderPersos = () => {
      btns.forEach((li, id) => li.firstChild.setAttribute('aria-pressed', String(id === state.character)));
      filterList();
      const id = state.character;
      head.replaceChildren();
      if (head.parentElement === card || !head.parentElement) card.replaceChildren(head); else card.replaceChildren();
      if (!charsReady) { // personnages pas encore arrivés (le mode Personnages les demande)
        card.hidden = false;
        head.hidden = true;
        card.append(mk('p', 'c-perso-card__wait', 'Chargement des personnages…'));
        return;
      }
      card.hidden = !id;
      head.hidden = !id;
      if (!id) return;
      const works = sortWorks(data.works.filter((w) => worksOfCharacter(id).has(w.id)), 'release');
      const hiddenCameos = (worksAll.get(id) || new Set()).size - (worksMain.get(id) || new Set()).size;
      const actors = [...(actorsOf.get(id) || new Map()).entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n);
      head.append(mk('p', 'c-perso-card__k', 'Personnage'));
      const h = mk('h3', 'c-perso-card__name');
      h.append(medal(id), mk('span', 'c-perso-card__nm', charName.get(id)));
      h.id = 'perso-nom';
      head.append(h);
      const aka = charAka.get(id) || [];
      // sur téléphone, seuls le nom et le nombre d'œuvres restent visibles ; « Fiche » déplie le reste
      const detail = mk('div', 'c-perso-card__more');
      detail.id = 'perso-detail';
      const toggle = mk('button', 'c-perso-card__toggle', 'Fiche');
      toggle.type = 'button';
      toggle.setAttribute('aria-controls', detail.id);
      toggle.setAttribute('aria-expanded', String(cardOpen));
      card.classList.toggle('is-open', cardOpen);
      toggle.addEventListener('click', () => { cardOpen = !cardOpen; toggle.setAttribute('aria-expanded', String(cardOpen)); card.classList.toggle('is-open', cardOpen); });
      if (aka.length) detail.append(mk('p', 'c-perso-card__aka', `Aussi appelé : ${aka.slice(0, 3).join(', ')}`));
      if (actors.length) detail.append(mk('p', 'c-perso-card__actor', `Interprété par ${actors.slice(0, 3).join(', ')}`));
      if (works.length) {
        const y0 = (mainDate(works[0]) || { v: '?' }).v.slice(0, 4);
        const y1 = (mainDate(works[works.length - 1]) || { v: '?' }).v.slice(0, 4);
        const t = (w) => (w.title_fr ? w.title_fr.v : w.id);
        head.append(mk('p', 'c-perso-card__span', `${works.length} ${works.length > 1 ? 'œuvres' : 'œuvre'} · ${y0 === y1 ? y0 : `${y0} → ${y1}`}`));
        // alias en double dans l'en-tête : affiché seulement quand l'en-tête est sorti de la fiche
        if (aka.length) head.append(mk('p', 'c-perso-card__aka c-perso-card__aka--head', `Aussi appelé : ${aka.slice(0, 3).join(', ')}`));
        card.append(toggle, detail);
        detail.append(mk('p', 'c-perso-card__range', works.length > 1 ? `De ${t(works[0])} à ${t(works[works.length - 1])}` : t(works[0])));
        const phs = [...new Set(works.map((w) => (w.phase ? w.phase.v : null)).filter(Boolean))].sort((a, b) => a - b);
        const ul = mk('ul', 'c-perso-card__phases');
        ul.setAttribute('aria-label', 'Phases');
        phs.forEach((n) => {
          const li = mk('li');
          li.dataset.phase = String(n);
          const sw = mk('span', 'color-key__sw');
          sw.setAttribute('aria-hidden', 'true');
          li.append(sw, document.createTextNode(`Phase ${ROMAN[n] || n}`));
          ul.append(li);
        });
        detail.append(ul);
        const open = mk('button', 'button c-perso-card__open', 'Ouvrir ses Archives');
        open.type = 'button';
        open.addEventListener('click', () => archive.open(works[0].id, { group: 'perso', opener: open, character: id }));
        detail.append(open);
      } else card.append(detail);
      if (hiddenCameos > 0 && !showCameos()) {
        detail.append(mk('p', 'c-perso-card__note', `${hiddenCameos} caméo${hiddenCameos > 1 ? 's' : ''} masqué${hiddenCameos > 1 ? 's' : ''} : réglage « Tout afficher » pour ${hiddenCameos > 1 ? 'les' : 'le'} voir.`));
      }
    };
  }
  function selectCharacter(id, { switchMode = false } = {}) {
    if (!charsReady) { ensureChars().then(() => selectCharacter(id, { switchMode })).catch(() => {}); return; }
    if (!charName.has(id)) return;
    state.character = id;
    const u = new URL(location.href);
    u.searchParams.set('personnage', id);
    if (switchMode && state.mode !== 'personnages') {
      state.mode = 'personnages';
      u.searchParams.set('mode', 'personnages');
      history.pushState({}, '', u);
    } else history.replaceState(history.state, '', u);
    update(true);
    const n = visible().length;
    announce(`${charName.get(id)} : ${n} ${n > 1 ? 'œuvres' : 'œuvre'} sur la frise.`);
  }

  // -- cartes de phase (mode Phases) : sauter directement à une phase -----------------------------
  const phaseNav = mk('nav', 'c-phasecards');
  phaseNav.setAttribute('aria-label', 'Aller à une phase');
  phaseNav.hidden = true;
  const phaseList = mk('ul', 'c-phasecards__list');
  phaseNav.append(phaseList);
  const cardAll = mk('button', 'c-phasecard c-phasecard--all');
  cardAll.type = 'button';
  cardAll.append(mk('span', 'c-phasecard__n', 'Toutes'), mk('span', 'c-phasecard__y', 'les phases'));
  cardAll.addEventListener('click', () => openPhase(null));
  const liAll = mk('li');
  liAll.append(cardAll);
  phaseList.append(liAll);
  const phaseCards = new Map();
  phaseWorks.forEach((pw) => {
    const li = mk('li');
    const b = mk('button', 'c-phasecard');
    b.type = 'button';
    b.dataset.phase = String(pw.n);
    b.dataset.saga = pw.saga.v;
    const num = mk('span', 'c-phasecard__n');
    num.append(mk('span', 'visually-hidden', 'Phase '), document.createTextNode(pw.roman)); // nom accessible = texte visible
    // années complètes (ordinateur) ou courtes, « 2008–12 » (téléphone : une seule des deux est affichée)
    const [y0, y1] = pw.years;
    const short = y0 === y1 ? y0 : `${y0}–${y1.slice(0, 2) === y0.slice(0, 2) ? y1.slice(2) : y1}`;
    b.append(num,
      mk('span', 'c-phasecard__y', y0 === y1 ? y0 : `${y0} – ${y1}`),
      mk('span', 'c-phasecard__ys', short),
      mk('span', 'c-phasecard__c', `${pw.count} œuvres`));
    b.addEventListener('click', () => openPhase(state.openPhase === pw.n ? null : pw.n));
    li.append(b);
    phaseList.append(li);
    phaseCards.set(pw.n, li);
  });
  const friseEl = $('#frise');
  if (friseEl) friseEl.before(phaseNav);
  function syncPhaseCards() {
    phaseNav.hidden = state.mode !== 'phases';
    cardAll.setAttribute('aria-pressed', String(!state.openPhase));
    phaseCards.forEach((li, n) => {
      li.hidden = false;
      li.firstChild.setAttribute('aria-pressed', String(state.openPhase === n));
    });
  }
  // -- passage d'une phase à l'autre (mode Phases) ----------------------------------------------
  // On plonge dans la phase choisie, on en ressort vers toutes les phases, on glisse d'une phase à
  // la voisine : View Transitions (l'image de l'ancienne frise s'anime vers la nouvelle, déjà en
  // place). Style retenu : la plongée (on entre par le point de la phase, on en ressort vers lui ; d'une
  // phase à la voisine, le cadran tourne ou la frise glisse). Sans l'API, en vue liste ou avec
  // « Réduire les animations » : changement direct, comme avant.
  // La maquette peut décrire sa scène (ctx.phaseStage) : point d'une phase, centre, découpe, intertitre.
  const VT_DUR = { enter: 650, exit: 600, step: 600 };
  let intertitle = null;
  let vtToken = 0;
  function stageBox() { const fr = $('#frise'); return fr ? fr.getBoundingClientRect() : null; }
  function stagePoint(id, box) {
    const st = ctx.phaseStage;
    const p = st && st.point ? st.point(id) : null;
    if (p) return p;
    const li = items.get(id);
    if (!li || li.hidden) return null;
    const r = li.getBoundingClientRect();
    return { x: r.left + r.width / 2 - box.left, y: r.top + r.height / 2 - box.top };
  }
  // un point hors de la partie visible de la scène ne sert pas d'origine : on prend son centre
  function inStage(p, box) {
    if (!p) return null;
    const y = p.y + box.top;
    return p.x >= 0 && p.x <= box.width && y >= Math.max(box.top, 0) && y <= Math.min(box.bottom, window.innerHeight) ? p : null;
  }
  function stageCenter(box) {
    const st = ctx.phaseStage;
    const c = st && st.center ? st.center() : null;
    if (c) return c;
    // partie visible de la frise (elle peut dépasser l'écran)
    const top = Math.max(box.top, 0); const bottom = Math.min(box.bottom, window.innerHeight);
    return { x: box.width / 2, y: (top + bottom) / 2 - box.top };
  }
  function phaseTitle(n) {
    const pw = phaseWorks.get(n);
    if (!pw) return null;
    const saga = data.taxonomy.sagas.find((x) => x.id === pw.saga.v);
    const [y0, y1] = pw.years;
    return { phase: n, k: saga ? saga.label_fr : '', n: `Phase ${pw.roman}`, y: `${y0 === y1 ? y0 : `${y0} – ${y1}`} · ${pw.count} œuvres` };
  }
  function sagaTitle(set) {
    const sg = data.taxonomy.sagas.find((x) => x.phases.length === set.size && x.phases.every((n) => set.has(n)));
    const pws = sg ? sg.phases.map((n) => phaseWorks.get(n)).filter(Boolean) : [];
    if (!pws.length) return null;
    const a = pws[0]; const b = pws[pws.length - 1];
    return { saga: sg.id, k: 'Saga', n: sagaShort(sg), y: `Phases ${a.roman} à ${b.roman} · ${a.years[0]} – ${b.years[1]}` };
  }
  function showIntertitle(spec) {
    const box = stageBox();
    if (!spec || !box) return;
    if (!intertitle) {
      intertitle = mk('div', 'c-intertitle');
      intertitle.setAttribute('aria-hidden', 'true'); // la phase est déjà annoncée (région polite)
      document.body.append(intertitle);
      intertitle.addEventListener('animationend', () => intertitle.classList.remove('is-on'));
    }
    if (spec.phase) intertitle.dataset.phase = String(spec.phase); else delete intertitle.dataset.phase;
    if (spec.saga) intertitle.dataset.saga = spec.saga; else delete intertitle.dataset.saga;
    intertitle.replaceChildren(mk('span', 'c-intertitle__k', spec.k), mk('span', 'c-intertitle__n', spec.n), mk('span', 'c-intertitle__y', spec.y));
    const st = ctx.phaseStage;
    const at = (st && st.title && st.title()) || stageCenter(box);
    intertitle.style.left = `${Math.round(box.left + at.x)}px`;
    intertitle.style.top = `${Math.round(box.top + at.y)}px`;
    intertitle.classList.remove('is-on');
    void intertitle.offsetWidth; // relance l'animation
    intertitle.classList.add('is-on');
  }
  // opts (filtre de la barre du haut) : kind imposé, points d'origine avant (before) ou après (after)
  // le changement, intertitre (title)
  function phaseTransition(prev, next, apply, opts = {}) {
    const fr = $('#frise');
    const token = ++vtToken;
    // une fenêtre modale ouverte (Réglages, Archives) passerait sous l'animation : changement direct
    if (!fr || !document.startViewTransition || reducedMotion() || root.classList.contains('is-list-view')
      || document.querySelector('dialog[open]') || (prev === next && !opts.kind)) { apply(false); return; }
    const kind = opts.kind || (!prev ? 'enter' : !next ? 'exit' : 'step');
    const o = {
      kind, prev, next, title: opts.title || null,
      before: opts.before || (kind === 'enter' && next ? [`phase-${next}`] : null),
      after: opts.after || (kind === 'exit' && prev ? [`phase-${prev}`] : null),
    };
    const st = ctx.phaseStage || {};
    // la maquette peut d'abord amener la phase choisie sous les yeux (A sur téléphone : le cadran tourne)
    const ready = kind === 'enter' && next && st.prepare ? st.prepare(`phase-${next}`) : null;
    if (ready && ready.then) ready.then(() => { if (token === vtToken) runTransition(fr, st, o, apply); });
    else runTransition(fr, st, o, apply);
  }
  // même plongée pour une maquette (ctx.sceneTransition) : kind enter | exit | step ; from() / to() :
  // point d'origine dans la frise, avant ou après le changement ; title : intertitre ; dir : sens (step)
  function sceneTransition(kind, apply, opts = {}) {
    const fr = $('#frise');
    ++vtToken;
    if (!fr || !document.startViewTransition || reducedMotion() || root.classList.contains('is-list-view')
      || document.querySelector('dialog[open]')) { apply(false); return; }
    const dir = opts.dir < 0 ? -1 : 1;
    runTransition(fr, ctx.phaseStage || {}, { kind, prev: kind === 'step' ? 2 : null, next: kind === 'step' ? 2 + dir : null,
      title: opts.title || null, from: opts.from || null, to: opts.to || null }, apply);
  }
  function meanPoint(ids, box) {
    const ps = (ids || []).map((id) => inStage(stagePoint(id, box), box)).filter(Boolean);
    return ps.length ? { x: ps.reduce((a, p) => a + p.x, 0) / ps.length, y: ps.reduce((a, p) => a + p.y, 0) / ps.length } : null;
  }
  function runTransition(fr, st, o, apply) {
    const { kind, prev, next } = o;
    const set = (k, v) => root.style.setProperty(k, v);
    const origin = (p) => { if (p) { set('--vt-ox', `${Math.round(p.x)}px`); set('--vt-oy', `${Math.round(p.y)}px`); } };
    let box = stageBox();
    const c = stageCenter(box);
    origin(c);
    if (kind === 'enter') origin(o.from ? o.from() : meanPoint(o.before, box));
    const dir = kind === 'step' && next < prev ? -1 : 1;
    set('--vt-dir', String(dir));
    set('--vt-turn', `${dir * (st.turn || 28)}deg`);
    set('--vt-dur', `${VT_DUR[kind]}ms`);
    set('--vt-clip', (st.clip && st.clip()) || 'inset(0)');
    if (kind === 'step' && st.turn) origin(st.pivot ? st.pivot() : c); // le cadran tourne autour de son centre
    root.dataset.vt = kind;
    root.dataset.vtMove = st.turn ? 'turn' : 'slide';
    fr.style.viewTransitionName = 'frise';
    const t = document.startViewTransition(() => {
      apply(true);
      if (kind === 'exit') { box = stageBox(); origin(o.to ? o.to() : meanPoint(o.after, box)); } // on ressort par le point de la phase (ou de la saga) quittée
    });
    t.finished.finally(() => {
      fr.style.viewTransitionName = '';
      delete root.dataset.vt;
      if (next && state.openPhase === next) showIntertitle(phaseTitle(next));
      else if (o.title) showIntertitle(o.title);
    });
  }

  function openPhase(n, { focusFirst = false, focusLast = false } = {}) {
    const prev = state.openPhase;
    const next = n || null;
    phaseTransition(prev, next, (animated) => {
      state.openPhase = next;
      const u = new URL(location.href);
      if (state.openPhase) u.searchParams.set('phase', String(state.openPhase)); else u.searchParams.delete('phase');
      history.replaceState(history.state, '', u);
      if (focusLast && next) { const l = visible(); if (l.length) state.focusId = l[l.length - 1].id; } // « Phase précédente » : on arrive sur sa dernière œuvre
      if (!next && prev) state.focusId = `phase-${prev}`; // retour à toutes les phases : la phase quittée reste au centre
      update(!animated); // pendant une View Transition, la frise se pose directement (pas de fondu interne)
      const list = visible();
      const pw = state.openPhase ? phaseWorks.get(state.openPhase) : null;
      announce(pw ? `Phase ${pw.roman} dépliée : ${list.length} œuvres. Échap pour revenir aux phases.` : 'Toutes les phases.');
      if (focusFirst && list.length) focusWork(pw ? list[0].id : (prev ? `phase-${prev}` : list[0].id));
    });
  }

  // -- modes, ordre, séries, vue liste -------------------------------------------------------
  const modeLinks = [...document.querySelectorAll('[data-mode]')];
  function syncMode() {
    root.dataset.mode = state.mode;
    modeLinks.forEach((a) => { if (a.dataset.mode === state.mode) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    const field = $('#champ-personnage');
    if (field) field.hidden = state.mode !== 'personnages';
  }
  modeLinks.forEach((a) => a.addEventListener('click', (e) => {
    e.preventDefault();
    if (state.mode === a.dataset.mode) return;
    state.mode = a.dataset.mode;
    const u = new URL(location.href);
    u.searchParams.set('mode', state.mode);
    history.pushState({}, '', u);
    announce(`Mode ${MODES[state.mode]}.`);
    update(true);
  }));
  window.addEventListener('popstate', () => {
    if (overlayPop()) return; // fermeture d'un panneau (Réglages, recherche, liste) : l'état reste
    const q = new URLSearchParams(location.search);
    const m = q.get('mode');
    const ph = phasesFromParam(q.get('phases'), data.taxonomy);
    const phChanged = ph.size !== state.phases.size || [...ph].some((n) => !state.phases.has(n));
    if (phChanged) { state.phases = ph; phaseFilter.set(ph); }
    if ((MODES[m] && m !== state.mode) || phChanged) { if (MODES[m]) state.mode = m; update(true); }
  });

  // -- filtre par saga et par phase (adresse partageable : ?phases=4,5,6) ---------------------
  const phaseFilter = createPhaseFilter(data.taxonomy, {
    selected: state.phases,
    onChange(set) {
      const prevSet = state.phases;
      const prevOpen = state.openPhase;
      // mode Phases : une seule phase choisie = on entre dans cette phase ; en élargissant le filtre
      // depuis une phase seule, on en ressort vers les phases de la saga
      const phases = state.mode === 'phases';
      const nextOpen = !phases ? prevOpen : set.size === 1 ? [...set][0]
        : prevOpen && set.has(prevOpen) && prevSet.size > 1 ? prevOpen : null;
      const apply = (animated) => {
        state.phases = set;
        const u = new URL(location.href);
        const v = phasesToParam(set, data.taxonomy);
        if (v) u.searchParams.set('phases', v); else u.searchParams.delete('phases');
        if (phases) {
          state.openPhase = nextOpen;
          if (nextOpen) u.searchParams.set('phase', String(nextOpen)); else u.searchParams.delete('phase');
          if (!nextOpen && prevOpen && set.has(prevOpen)) state.focusId = `phase-${prevOpen}`;
        }
        history.replaceState(history.state, '', u);
        update(!animated);
        const n = visible().length;
        const unit = phases && !nextOpen ? ['phase', 'phases'] : ['œuvre', 'œuvres'];
        announce(`Filtre : ${describePhases(set, data.taxonomy)}. ${n} ${n > 1 ? unit[1] : unit[0]} affichée${n > 1 ? 's' : ''}.`);
      };
      if (!phases) { apply(false); return; }
      if (nextOpen !== prevOpen) { phaseTransition(prevOpen, nextOpen, apply); return; }
      if (nextOpen) { apply(false); return; } // la phase dépliée reste la même : rien ne bouge sur la frise
      // toutes les phases → une saga : on zoome vers ses phases ; une saga → toutes : on en ressort
      const ids = (x) => [...x].map((k) => `phase-${k}`);
      if (set.size < prevSet.size) phaseTransition(null, null, apply, { kind: 'enter', before: ids(set), title: sagaTitle(set) });
      else phaseTransition(null, null, apply, { kind: 'exit', after: ids(prevSet) });
    },
  });
  const orderGroup = $('.c-tools [data-order]') ? $('.c-tools [data-order]').closest('.segmented') : null;
  if (orderGroup) orderGroup.classList.add('c-order'); // masqué en mode Phases (concept.css)
  if (orderGroup) orderGroup.after(phaseFilter.el); else { const tools = $('.c-tools'); if (tools) tools.prepend(phaseFilter.el); }

  const orderBtns = [...document.querySelectorAll('[data-order]')];
  function syncOrder() { orderBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.order === state.order))); root.dataset.order = state.order; }
  orderBtns.forEach((b) => b.addEventListener('click', () => {
    if (state.orderPref === b.dataset.order) return;
    state.order = b.dataset.order;
    setPref('ordre', state.orderPref);
    announce(state.order === 'story' ? 'Ordre de l’histoire : le fil a été réorganisé.' : 'Ordre de sortie : le fil a été réorganisé.');
    update(true);
  }));

  const seriesBox = $('#opt-series');
  if (seriesBox) {
    seriesBox.checked = state.series;
    seriesBox.addEventListener('change', () => {
      state.series = seriesBox.checked;
      setPref('seriesVisibles', state.series);
      announce(state.series ? 'Séries affichées.' : 'Séries masquées : films seulement.');
      update(true);
    });
  }

  const listBtn = $('#btn-list');
  // « Vue liste » rangée dans les Réglages : la barre d'en-tête tient sur une ligne (le lien d'évitement
  // « Aller à la liste des œuvres » reste le premier élément de la page)
  const settingsBody = $('.c-tools .c-settings__body');
  if (listBtn && settingsBody) { listBtn.classList.add('c-settings__list'); settingsBody.prepend(listBtn); }
  const autoList = window.matchMedia('(max-width: 400px), (max-height: 420px)');
  function syncList() {
    const on = state.listView || autoList.matches;
    root.classList.toggle('is-list-view', on);
    if (listBtn) {
      listBtn.setAttribute('aria-pressed', String(on));
      listBtn.textContent = on ? 'Revenir à la frise' : 'Vue liste';
    }
  }
  if (listBtn) listBtn.addEventListener('click', () => {
    state.listView = !(state.listView || autoList.matches);
    announce(state.listView ? 'Vue liste.' : 'Vue frise.');
    syncList();
    emit('render', { reason: 'list' });
  });
  autoList.addEventListener('change', () => { syncList(); emit('render', { reason: 'list' }); });

  // -- réglages (spoilers, progression, animations) -------------------------------------------
  const vu = $('#vu-jusqua');
  if (vu) {
    const released = sortWorks(data.works.filter((w) => { const d = mainDate(w); return d && statusOf(d.v, d.precision, today).key === 'released'; }), 'release');
    const groups = new Map();
    released.forEach((w) => { const k = w.phase ? `Phase ${w.phase.v}` : 'Phase à préciser'; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(w); });
    groups.forEach((ws, label) => {
      const og = document.createElement('optgroup');
      og.label = label;
      ws.forEach((w) => { const o = document.createElement('option'); o.value = w.id; o.textContent = w.title_fr.v; og.append(o); });
      vu.append(og);
    });
    vu.value = getPrefs().vuJusqua || '';
    vu.addEventListener('change', () => { setPref('vuJusqua', vu.value || null); announce(vu.value ? 'Point de visionnage enregistré.' : 'Point de visionnage effacé.'); });
    onPrefs((p, name) => { if (name === 'vuJusqua' || name === '*') vu.value = p.vuJusqua || ''; }); // l'écran « Vus et à voir » peut l'effacer
  }
  const all = $('#tout-afficher');
  if (all) { all.checked = !!getPrefs().toutAfficher; all.addEventListener('change', () => setPref('toutAfficher', all.checked)); }
  const motion = $('#reduire-animations');
  if (motion) { motion.checked = reducedMotion(); motion.addEventListener('change', () => setPref('reduireAnimations', motion.checked)); }
  const counts = $('#compteurs');
  async function renderCounts() {
    if (!counts) return;
    let fs = 0; let fv = 0; let ss = 0; let sv = 0;
    for (const w of data.works) {
      const d = mainDate(w);
      if (!d || statusOf(d.v, d.precision, today).key !== 'released') continue;
      const seen = await isSeen(w.id);
      if (w.kind === 'film') { fs += 1; if (seen) fv += 1; } else { ss += 1; if (seen) sv += 1; }
    }
    counts.textContent = `Films vus : ${fv} / ${fs} · Séries vues : ${sv} / ${ss}`;
    const wl = new Set(getPrefs().aVoir || []);
    for (const [id, li] of items) {
      const seen = await isSeen(id);
      li.classList.toggle('is-seen', seen);
      li.classList.toggle('is-watch', wl.has(id));
      // œuvre vue : titre en vert, sans coche ; l'état est écrit pour les lecteurs d'écran
      const btn = li.querySelector('.node__btn');
      let mark = btn && btn.querySelector('.node__mark');
      if (btn && !mark) { mark = document.createElement('span'); mark.className = 'visually-hidden node__mark'; btn.append(mark); }
      if (mark) mark.textContent = seen ? ', vue' : wl.has(id) ? ', à voir' : '';
    }
  }
  onPrefs((p, name) => {
    root.classList.toggle('is-reduced-motion', reducedMotion());
    if (sky) sky.setReducedMotion(reducedMotion());
    // marques et filtre « Vus et à voir » : l'écran rafraîchit lui-même la frise (onChange ci-dessous)
    const marks = ['vus', 'aVoir', 'filtreVu'].includes(name);
    const seenChanged = (name === 'vuJusqua' || name === '*') && (p.filtreVu || 'tous') !== 'tous';
    if ((state.mode === 'personnages' && !marks) || seenChanged) update();
    renderCounts();
  });
  root.classList.toggle('is-reduced-motion', reducedMotion());

  // -- zoom -------------------------------------------------------------------------------------
  const frise = $('#frise');
  const zoom = createZoom({
    root: frise,
    // ?level= l'emporte ; sinon le niveau d'arrivée propre à la maquette (initialLevel), sinon les œuvres (N2)
    initial: Number.isInteger(Number(params.get('level'))) && params.get('level') !== null ? Number(params.get('level'))
      : typeof options.initialLevel === 'function' ? options.initialLevel() : (Number.isInteger(options.initialLevel) ? options.initialLevel : 2),
    skip: options.skipLevels || [], // niveaux absents de la maquette (le niveau Phases : le mode Phases le remplace)
    labels: options.levelLabels || {},
    announce,
    onLevel: () => emit('render', { reason: 'level' }),
  });
  zoom.attachButtons({ zoomIn: $('#zoom-in'), zoomOut: $('#zoom-out'), reset: $('#zoom-reset'), label: $('#zoom-level') });
  if (frise) { zoom.attachKeys(frise); zoom.attachPinch(frise); }

  // -- navigation clavier dans la liste (roving tabindex) ---------------------------------------
  function focusWork(id, { scroll = true, tint = true } = {}) {
    const li = items.get(id);
    if (!li || li.hidden) return;
    state.focusId = id;
    items.forEach((x, k) => { x.querySelector('.node__btn').tabIndex = k === id ? 0 : -1; });
    const btn = li.querySelector('.node__btn');
    btn.focus({ preventScroll: !scroll });
    if (tint) tintFor(id);
    emit('focus', { id });
  }
  ol.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Escape' && state.mode === 'phases' && state.openPhase) { e.preventDefault(); openPhase(null, { focusFirst: true }); return; }
    const list = visible();
    const i = list.findIndex((w) => w.id === state.focusId);
    if (i < 0) return;
    let j = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') j = Math.min(list.length - 1, i + 1);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') j = Math.max(0, i - 1);
    else if (e.key === 'Home') j = 0;
    else if (e.key === 'End') j = list.length - 1;
    else if (e.key === 'PageDown' || e.key === 'PageUp') {
      const dir = e.key === 'PageDown' ? 1 : -1;
      const p = list[i].phase ? list[i].phase.v : 0;
      let k = i;
      while (list[k + dir] && (list[k + dir].phase ? list[k + dir].phase.v : 0) === p) k += dir;
      j = Math.max(0, Math.min(list.length - 1, k + dir));
    }
    if (j !== null) { e.preventDefault(); focusWork(list[j].id); }
  });
  ol.addEventListener('focusin', (e) => {
    const li = e.target.closest('.node');
    if (li && li.dataset.id !== state.focusId) { state.focusId = li.dataset.id; tintFor(li.dataset.id); emit('focus', { id: li.dataset.id }); }
  });

  // -- vue Archives ---------------------------------------------------------------------------
  // créée à la première ouverture, une fois les personnages arrivés (distribution, onglet Personnage)
  let archiveView = null;
  const archive = {
    open(id, opts) {
      if (archiveView) { archiveView.open(id, opts); return; }
      ensureChars().then(() => {
        if (!archiveView) {
          archiveView = createArchiveView({
            works: data.works, characters: data.characters, taxonomy: data.taxonomy,
            onWorkChange: (w) => tintFor(w.id, true),
            // ordre de la vue Archives = ordre de la frise (même bouton, même préférence, frise remise en ordre dessous)
            getOrder: () => state.orderPref, // les Archives gardent le choix Sortie | Histoire, même ouvertes en mode Phases
            setOrder: (o) => { const b = orderBtns.find((x) => x.dataset.order === o); if (b) b.click(); },
            onClose: (wid) => {
              emit('archive-return', { id: wid }); // la maquette peut d'abord remettre l'œuvre en vue (Éphémérides : son cadran)
              if (items.has(wid) && !items.get(wid).hidden) { focusWork(wid); emit('archive-close', { id: wid }); }
            },
          });
        }
        archiveView.open(id, opts);
      }).catch(() => announce('Les personnages n’ont pas pu être chargés : réessayez.'));
    },
    close() { if (archiveView) archiveView.close(); },
    isOpen: () => !!(archiveView && archiveView.isOpen()),
    current: () => (archiveView ? archiveView.current() : null),
    get element() { return archiveView ? archiveView.element : null; },
  };
  ol.addEventListener('click', (e) => {
    const btn = e.target.closest('.node__btn');
    if (!btn) return;
    const node = btn.closest('.node');
    const id = node.dataset.id;
    if (node.dataset.kind === 'phase') { openPhase(Number(node.dataset.phase), { focusFirst: true }); return; }
    focusWork(id, { scroll: false });
    const group = state.mode === 'personnages' ? 'perso' : 'chrono';
    archive.open(id, { group, opener: btn, character: state.character });
  });
  initSpoilers(document);
  // téléphone : la recherche plein écran se ferme d'abord (son retour d'historique), puis l'action suit
  const settle = () => (app ? app.settle() : Promise.resolve());
  document.querySelectorAll('[data-search]').forEach((c) => initSearch(c, {
    onWork: (id) => settle().then(() => archive.open(id, { group: 'chrono', opener: (app && app.opener()) || c.querySelector('input') })),
    onCharacter: (id) => settle().then(() => selectCharacter(id, { switchMode: true })),
  }));

  // -- mise à jour ------------------------------------------------------------------------------
  function update(transition = false) {
    // mode Personnages avant l'arrivée des personnages : la frise reste entière, puis se resserre
    if (state.mode === 'personnages' && !charsReady) ensureChars().then(() => update()).catch(() => announce('Les personnages n’ont pas pu être chargés.'));
    if (state.openPhase && filterOn() && !state.phases.has(state.openPhase)) {
      state.openPhase = null; // la phase dépliée n'est plus dans le filtre
      const u = new URL(location.href);
      u.searchParams.delete('phase');
      history.replaceState(history.state, '', u);
    }
    syncMode(); syncOrder();
    renderList();
    syncPhaseCards();
    renderPersos();
    emit('render', { reason: 'state', transition });
  }

  const ctx = {
    data, state, items, ol, sky, zoom, archive, announce, LEVELS, ROMAN,
    on(ev, fn) { if (!listeners.has(ev)) listeners.set(ev, []); listeners.get(ev).push(fn); return ctx; },
    visible, worksOfCharacter, charName, recurring, focusWork, tintFor, update,
    viewFilter: null, // filtre propre à la frise (voir visible())
    laneOf: (w) => laneOf(w, data.taxonomy),
    reducedMotion, formatDateFr, mainDate,
    colorKey: (opts) => colorKey(data.taxonomy, opts), // légende du code couleur (sagas, phases)
    isFiltered: filterOn, // filtre saga / phase actif (state.phases ; jamais en mode Phases)
    phaseWorks, openPhase, selectCharacter, skyCamera, // mode Phases (pseudo-œuvres kind:'phase'), personnages, parallaxe
    sceneTransition, // plongée entre deux vues d'une maquette (voir phaseTransition)
    // la maquette signale l'œuvre au centre de l'écran (défilement / panoramique) → teinte du ciel
    setCenterWork(id) { if (id && id !== ctx._center) { ctx._center = id; tintFor(id); } },
    // interface appli (téléphone) : hauteur de la barre d'onglets du bas, que la frise ne doit pas couvrir
    bottomInset: () => (app ? app.bottomInset() : 0),
    isApp: () => !!(app && app.active()),
    openArchive(id, opener) { if (String(id).startsWith('phase-')) { openPhase(Number(String(id).slice(6)), { focusFirst: true }); return; } archive.open(id, { group: 'chrono', opener }); },
  };

  const help = document.querySelector('.c-help');
  if (help && options.helpColorKey !== false) help.append(colorKey(data.taxonomy, { title: false }));
  if (options.decorate) items.forEach((li, id) => options.decorate(li, byId.get(id), ctx)); // habillage propre
  // « Vus et à voir » : boutons d'entrée (barre d'outils, barre du haut sur téléphone) et grande fenêtre
  initVus({ works: data.works, taxonomy: data.taxonomy, announce, onChange: () => { update(); renderCounts(); } });
  {
    const vnav = initVersionSwitch(options.concept); // Éphémérides ⇄ Fil noir, en tête de Réglages
    // apparences pas encore choisies : réunies sur une page (comparer.html), un lien sous les vignettes
    if (vnav) {
      const cmp = mk('p', 'c-compare');
      const a = mk('a', null, 'Versions à comparer');
      a.href = `${siteRoot()}comparer.html`;
      cmp.append(a, ' : les apparences pas encore choisies, côte à côte.');
      vnav.after(cmp);
    }
    initSettingsPanel();
    // flèche « Revenir en haut » : au-dessus de la barre d'onglets sur téléphone
    initToTop(window, { avoid: ['.c-modes'] });
    registerOffline(); // consultation hors connexion (sw.js)
  }
  syncList();
  update();
  renderCounts();
  if (options.layout) options.layout(ctx);
  app = createAppShell(ctx); // après la maquette (elle place ses colonnes), avant le premier rendu
  ctx.app = app;
  emit('render', { reason: 'init' });
  if (state.focusId) tintFor(state.focusId, true);
  const deep = params.get('oeuvre');
  if (deep) {
    const w = data.works.find((x) => x.slug === deep);
    if (w) archive.open(w.id, { group: params.get('groupe') === 'perso' ? 'perso' : 'chrono' });
  }
  // personnages en arrière-plan, une fois la page chargée (le mode Personnages et les fiches s'ouvrent ensuite sans attendre)
  if (!charsReady) {
    const later = () => (window.requestIdleCallback ? requestIdleCallback(() => ensureChars().catch(() => {}), { timeout: 4000 })
      : setTimeout(() => ensureChars().catch(() => {}), 1500));
    if (document.readyState === 'complete') later(); else window.addEventListener('load', later, { once: true });
  }
  if (params.get('debug') === '1') window.__app = ctx;
  return ctx;
}

// Réglages sur ordinateur (fenêtre sous le bouton) : un en-tête toujours visible avec « Fermer », une
// hauteur limitée à l'écran (le contenu défile dessous), Échap et un clic en dehors la ferment. Sur
// téléphone, le contenu passe dans le panneau du bas, qui a son propre en-tête (celui-ci y est masqué).
function initSettingsPanel() {
  const det = document.querySelector('.c-tools .c-settings');
  const body = det && det.querySelector('.c-settings__body');
  const summary = det && det.querySelector('summary');
  if (!det || !body || !summary) return;
  const mk = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; };
  const head = mk('div', 'c-settings__head');
  const close = mk('button', 'c-settings__close');
  close.type = 'button';
  close.setAttribute('aria-label', 'Fermer les réglages');
  close.title = 'Fermer les réglages';
  const x = mk('span', null, '✕');
  x.setAttribute('aria-hidden', 'true');
  close.append(x);
  head.append(mk('p', 'c-settings__h', 'Réglages'), close);
  body.prepend(head);
  const inPanel = () => body.parentElement === det;
  const shut = (refocus) => { det.open = false; if (refocus) summary.focus(); };
  close.addEventListener('click', () => shut(true));
  det.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && det.open && inPanel()) { e.preventDefault(); e.stopPropagation(); shut(true); }
  });
  document.addEventListener('pointerdown', (e) => { if (det.open && inPanel() && !det.contains(e.target)) shut(false); });
  const fit = () => {
    if (!det.open || !inPanel()) { body.style.removeProperty('max-height'); return; }
    const r = body.getBoundingClientRect();
    body.style.setProperty('max-height', `${Math.max(180, Math.floor(window.innerHeight - r.top - 12))}px`);
  };
  det.addEventListener('toggle', () => { fit(); if (det.open) body.scrollTop = 0; });
  window.addEventListener('resize', fit);
}
