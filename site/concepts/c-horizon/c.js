// Maquette C « Fil noir » : HORIZON, frise éditoriale de musée.
// Ordinateur : une bande d'horizon lumineuse traverse l'écran ; le fil (encre noire) y est posé, les
// œuvres sont des perles d'encre. La frise défile horizontalement sous une aiguille rouge fixe ; au-dessus,
// le rail des années et les cartels ; en dessous, un sol-miroir porte les phases.
// Mobile (≤ 767 px) : même bande, verticale à gauche ; cartes à droite ; aiguille horizontale au milieu.
// Aucune donnée inventée : échelle de temps en ordre de sortie, rangs réguliers en ordre de l'histoire.
import { bootConcept } from '../../shared/js/shell.js';
import { createThread } from '../../shared/js/thread.js';
import { mainDate, dateToNumber, branches } from '../../shared/js/layout.js';
import { todayParis } from '../../shared/js/dates.js';
import { afficheEl } from '../../shared/js/affiche.js';

const NS = 'http://www.w3.org/2000/svg';
const KIND = { film: 'Film', series: 'Série', special: 'Épisode spécial' };
// réglages par niveau de zoom : 0 sagas, 1 phases, 2 œuvres, 3 détail
const SLOT = [30, 58, 124, 172]; // écart type entre deux œuvres d'une même année (px)
const YEAR_MIN = [64, 96, 150, 196]; // largeur minimale d'une année (px)
const GAP_W = 34; // coupure qui remplace une période sans œuvre affichée (px)
const STORY_SLOT = [32, 62, 128, 176]; // pas régulier de l'ordre de l'histoire (px)
const PLATE_W = [140, 140, 152, 168]; // largeur réservée à un cartel (px)
const RAIL_H = [56, 60, 82, 88];
const ROW_H = [64, 64, 64, 80]; // décalage vertical entre deux rangées de cartels
const LANE_DY = 34; // écart des branches d'univers sur la bande
const HALF = 70; // demi-hauteur de la bande d'horizon (140 px)
const EXHIBIT_W = 336; // largeur de la pièce exposée (21rem, N3)
const FIT_M = 56; // N0, vue d'ensemble : marge de chaque côté de la frise entière (px)
// ordinateur : une petite affiche sous chaque œuvre, dans le sol-miroir, aux niveaux Œuvres et Détail
// (agrandie au survol ou au focus) ; choix de l'utilisateur du 2026-10-19, plus de variante « au survol »
const NBSP = ' ';

function h(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined && text !== null) n.textContent = text;
  return n;
}
function deco(tag, cls, text) { const n = h(tag, cls, text); n.setAttribute('aria-hidden', 'true'); return n; }
function sv(tag, attrs) {
  const n = document.createElementNS(NS, tag);
  Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, v));
  return n;
}
const yearOf = (w) => { const d = mainDate(w); return d ? Number(d.v.slice(0, 4)) : null; };
const span = (a, b) => (a === b ? `${a}` : `${a} – ${b}`);
const plural = (n, one, many) => `${n}${NBSP}${n > 1 ? many : one}`;
function runsOf(list, key) {
  const out = [];
  list.forEach((w) => {
    const k = key(w);
    const last = out[out.length - 1];
    if (last && last.key === k) last.works.push(w);
    else out.push({ key: k, works: [w] });
  });
  return out;
}
// années couvertes : une phase repliée (mode Phases) compte pour toute sa durée
const yearsIn = (works) => works.flatMap((w) => (w.kind === 'phase' && w.years ? w.years.map(Number) : [yearOf(w)])).filter((y) => y !== null && !Number.isNaN(y));
function yearsOfRun(works) {
  const ys = yearsIn(works);
  return ys.length ? span(Math.min(...ys), Math.max(...ys)) : '';
}
const countOf = (works) => (works.length && works[0].kind === 'phase' ? plural(works.length, 'phase', 'phases') : plural(works.length, 'œuvre', 'œuvres'));


bootConcept({
  concept: 'c',
  // à l'arrivée : vue d'ensemble (N0, toute la frise) sur ordinateur et tablette ; œuvres sur téléphone
  initialLevel: () => (window.matchMedia('(max-width: 767px)').matches ? 2 : 0),
  skipLevels: [1], // pas de niveau « Phases » : l'onglet Phases tient ce rôle
  levelLabels: { 0: { label: 'Vue d’ensemble', spoken: 'Vue d’ensemble' } },

  // Habillage du <li> : un cartel (le texte reste dans le bouton, dans le même ordre) et une perle.
  decorate(li, w, ctx) {
    const btn = li.querySelector('.node__btn');
    const title = btn.querySelector('.node__title');
    const meta = btn.querySelector('.node__meta');
    const extra = btn.querySelector('.visually-hidden');
    const tax = ctx.data.taxonomy;
    const d = mainDate(w);
    const saga = w.saga ? tax.sagas.find((s) => s.id === w.saga.v) : null;
    const uni = w.universe && w.universe.v !== 'earth-616' ? tax.universes.find((u) => u.id === w.universe.v) : null;
    const plate = h('span', 'c-plate');
    if (w.kind === 'phase') {
      // mode Phases : une phase repliée = un cartel (années, saga, nombre d'œuvres), dépliée d'un clic
      const yrs = w.years[0] === w.years[1] ? w.years[0] : `${w.years[0]} – ${w.years[1]}`;
      plate.append(deco('span', 'c-kicker', saga ? saga.label_fr : 'Phase'), title, deco('span', 'c-date', yrs),
        deco('span', 'c-phase', `${w.count} œuvres · cliquer pour déplier`), meta, extra);
      btn.replaceChildren(plate, deco('span', 'c-bead'));
      li.classList.add('c-node-phase');
      // frise verticale (téléphone) : la saga en tête de ses phases
      const hs0 = deco('span', 'c-hd c-hd-saga');
      hs0.append(h('span', 'c-hs-t', saga ? saga.label_fr : ''), h('span', 'c-hs-y'));
      li.prepend(hs0);
      return;
    }
    plate.append(
      deco('span', 'c-kicker', KIND[w.kind]),
      title,
      deco('span', 'c-date', d ? ctx.formatDateFr(d.v, d.precision) : 'Date à confirmer'),
    );
    if (w.title_original && w.title_original.v && w.title_original.v !== w.title_fr.v) plate.append(deco('span', 'c-vo', w.title_original.v));
    const ph = deco('span', 'c-phase', [w.phase ? `Phase ${w.phase.v}` : 'Phase à préciser', saga ? saga.label_fr : null].filter(Boolean).join(' · '));
    ph.dataset.k = KIND[w.kind]; // repris par la pièce exposée (N3), où le surtitre est masqué
    plate.append(ph);
    if (w.story) plate.append(deco('span', 'c-rank', w.story.provisional ? 'Place dans l’histoire à confirmer' : `Rang ${w.story.v} dans l’ordre de l’histoire`));
    if (w.story && w.story.provisional) plate.append(deco('span', 'c-prov', 'place à confirmer'));
    if (uni) plate.append(deco('span', 'c-univ', `Autre univers · ${uni.label_fr.replace(/-/g, String.fromCharCode(0x2011))}`)); // trait d'union insécable : « Terre-10005 » jamais coupé
    if (li.dataset.status === 'upcoming' || li.dataset.status === 'tba') plate.append(deco('span', 'c-status', li.dataset.status === 'tba' ? 'date à confirmer' : 'à venir'));
    plate.append(meta, extra);
    // téléphone (frise verticale) : l'affiche d'abord, en vignette à gauche du cartel (TMDB, sinon affiche
    // provisoire) ; décorative (alt vide ou aria-hidden) : le nom accessible du bouton reste le cartel
    btn.replaceChildren(afficheEl(w, { cls: 'c-thumb' }), plate, deco('span', 'c-bead'));
    // en-têtes de la frise verticale (mobile) : saga, phase, année ; affichés selon le rendu
    const hs = deco('span', 'c-hd c-hd-saga');
    hs.append(h('span', 'c-hs-t', saga ? saga.label_fr : ''), h('span', 'c-hs-y'));
    const hp = deco('span', 'c-hd c-hd-phase');
    hp.append(h('span', 'c-hp-k', 'Phase'), h('span', 'c-hp-n', w.phase ? (ctx.ROMAN[w.phase.v] || String(w.phase.v)) : '?'), h('span', 'c-hp-y'));
    const hy = deco('span', 'c-hd c-hd-year', d ? d.v.slice(0, 4) : '');
    li.prepend(hs, hp, hy);
    li.dataset.lane = String(ctx.laneOf(w));
  },

  layout(ctx) {
    const root = document.documentElement;
    const main = document.getElementById('contenu');
    const frise = document.getElementById('frise');
    const svg = frise.querySelector('.frise__svg');
    const wall = frise.querySelector('.c-wall');
    const floor = frise.querySelector('.c-floor');
    const introM = frise.querySelector('.c-intro-m');
    const header = document.querySelector('.c-header');
    const zoomBar = document.querySelector('.c-zoom');
    const legend = { a: main.querySelector('.c-legend__a'), b: main.querySelector('.c-legend__b'), c: main.querySelector('.c-legend__c') };
    const prevBtn = main.querySelector('.c-chev--prev');
    const nextBtn = main.querySelector('.c-chev--next');
    const tax = ctx.data.taxonomy;
    const byId = new Map([...ctx.data.works, ...ctx.phaseWorks.values()].map((w) => [w.id, w])); // œuvres + phases repliées (mode Phases)
    const mqV = window.matchMedia('(max-width: 767px)');
    const mqAutoList = window.matchMedia('(max-width: 400px), (max-height: 420px)'); // même seuil que la coquille
    const today = todayParis();

    const thread = createThread(svg, { treatment: 'ink' });
    const gTicks = sv('g', { class: 'c-ticks' });
    const gTrame = sv('g', { class: 'c-trame' });
    svg.prepend(gTicks, gTrame);

    let G = null; // géométrie du dernier rendu horizontal
    let V = []; // positions mises en cache (frise verticale) : [{id, y}]
    let VF = { top: 0, bottom: 0, vh: window.innerHeight };
    let centerId = null;
    let activeEls = []; // éléments décoratifs « actifs » (année, phase) pour l'œuvre centrale
    let runIndex = new Map(); // id → index de la course de phase
    let runEls = []; // index de course → éléments (travées, libellés du sol, en-têtes mobiles)
    let yearEls = new Map();
    let animTimer = 0;
    let pendingAnchor = null; // zoom à la molette ou au clic : {id, sx} = œuvre gardée à l'abscisse sx de l'écran

    const isList = () => root.classList.contains('is-list-view');
    const vertical = () => mqV.matches;
    // la frise verticale sert de liste sur petit écran (vue liste automatique) ; la vue liste
    // demandée explicitement entre 401 et 767 px reste la liste commune
    const useVertical = () => vertical() && (!isList() || mqAutoList.matches);
    const isH = () => root.classList.contains('c-h');
    const isV = () => root.classList.contains('c-vertical');
    const behavior = () => (ctx.reducedMotion() ? 'auto' : 'smooth');

    // -- outils communs -----------------------------------------------------------------------
    function phaseRuns(list) { return runsOf(list, (w) => (w.phase ? w.phase.v : 0)); }
    function sagaRuns(list) { return runsOf(list, (w) => (w.saga ? w.saga.v : '')); }
    function sagaLabel(id) { const s = tax.sagas.find((x) => x.id === id); return s ? s.label_fr : 'Saga à préciser'; }
    function trameSet() {
      return ctx.state.mode === 'personnages' && ctx.state.character ? ctx.worksOfCharacter(ctx.state.character) : null;
    }
    function updateLegend(list) {
      const story = ctx.state.order === 'story';
      const ys = yearsIn(list);
      legend.a.textContent = story ? 'ordre de l’histoire' : 'ordre de sortie';
      legend.b.textContent = (story
        ? 'rangs à intervalles réguliers, sans échelle de temps'
        : `échelle du temps · ${ys.length ? `${Math.min(...ys)} → ${Math.max(...ys)}` : ''}`)
        + (ctx.zoom.level === 0 && isH() ? ' · vue d’ensemble : molette ou clic pour zoomer' : '');
      const set = trameSet();
      // le nombre d'œuvres du personnage est sur sa fiche : la légende ne nomme que la trame
      legend.c.textContent = set ? `Trame${NBSP}: ${ctx.charName.get(ctx.state.character)}` : '';
    }

    // N3 : la pièce exposée doit tenir entre le rail et la bande ; si elle déborde, on retire d'abord le
    // titre original, puis l'univers et le statut. Une seule mesure par œuvre et par rendu (mise en cache).
    let fitCache = new Map();
    function fitExhibit(li, id) {
      if (fitCache.has(id)) { const f = fitCache.get(id); li.classList.toggle('c-fit-1', f >= 1); li.classList.toggle('c-fit-2', f >= 2); return; }
      li.classList.remove('c-fit-1', 'c-fit-2');
      requestAnimationFrame(() => {
        if (!G || !li.classList.contains('is-exhibit')) return;
        const plate = li.querySelector('.c-plate');
        let f = 0;
        while (f < 2 && plate.offsetHeight > G.room) { f += 1; li.classList.add(`c-fit-${f}`); }
        fitCache.set(id, f);
      });
    }

    // N3 : les cartels voisins que la pièce exposée recouvrirait s'effacent (le nom accessible reste)
    let veiled = [];
    function veil(id) {
      veiled.forEach((li) => li.classList.remove('is-veiled'));
      veiled = [];
      if (!id || ctx.zoom.level !== 3 || !isH() || !G || !G.xs.has(id)) return;
      fitExhibit(ctx.items.get(id), id);
      const cx = G.xs.get(id);
      const reach = EXHIBIT_W / 2 + PLATE_W[3] / 2 + 6;
      G.sorted.forEach(({ id: k, x }) => {
        if (k !== id && Math.abs(x - cx) < reach) { const li = ctx.items.get(k); li.classList.add('is-veiled'); veiled.push(li); }
      });
    }

    function setCenter(id, { force = false } = {}) {
      if (!id || (id === centerId && !force)) return;
      const old = centerId && ctx.items.get(centerId);
      if (old) old.classList.remove('is-center', 'is-exhibit', 'c-fit-1', 'c-fit-2');
      centerId = id;
      const li = ctx.items.get(id);
      if (li) {
        li.classList.add('is-center');
        if (ctx.zoom.level === 3 && isH()) li.classList.add('is-exhibit');
      }
      veil(id);
      ctx.setCenterWork(id);
      activeEls.forEach((e) => e.classList.remove('is-active'));
      activeEls = [];
      const w = byId.get(id);
      const y = w && yearOf(w);
      if (yearEls.has(y)) activeEls.push(yearEls.get(y));
      const ri = runIndex.get(id);
      if (ri !== undefined && runEls[ri]) activeEls.push(...runEls[ri]);
      activeEls.forEach((e) => e.classList.add('is-active'));
      syncChevrons();
    }

    function syncChevrons() {
      const list = ctx.visible();
      const i = list.findIndex((w) => w.id === centerId);
      prevBtn.setAttribute('aria-disabled', String(i <= 0));
      nextBtn.setAttribute('aria-disabled', String(i < 0 || i >= list.length - 1));
    }

    // =========================================================================================
    // Frise horizontale (ordinateur, tablette)
    // =========================================================================================
    function measure() {
      const field = document.getElementById('champ-personnage');
      // la fiche du personnage ne prend de hauteur que si elle est empilée (mobile, tablette) ; sur grand écran, elle est posée dans la frise
      const fh = field && !field.hidden && getComputedStyle(field).position !== 'absolute' ? field.offsetHeight : 0;
      const avail = window.innerHeight - header.offsetHeight - zoomBar.offsetHeight - fh;
      const H = Math.max(460, Math.round(avail));
      frise.style.setProperty('--c-h', `${H}px`);
      const vw = frise.clientWidth;
      return { H, vw, half: Math.round(vw / 2) };
    }

    // échelle de temps : chaque année a sa largeur (selon le nombre d'œuvres), linéaire à l'intérieur
    function timeScale(list, lvl, x0, xs) {
      const dated = list.filter((w) => mainDate(w));
      if (!dated.length) return null;
      const yrs = dated.map(yearOf);
      const y0 = Math.min(...yrs); const y1 = Math.max(...yrs);
      const count = new Map();
      yrs.forEach((y) => count.set(y, (count.get(y) || 0) + 1));
      const start = new Map();
      const gaps = []; // périodes sans œuvre affichée : resserrées en une coupure (aucune année inventée ni étirée)
      let x = x0;
      for (let y = y0; y <= y1 + 1; y += 1) {
        start.set(y, x);
        const n = count.get(y) || 0;
        if (n || y > y1) { x += Math.max(YEAR_MIN[lvl], n * SLOT[lvl] + SLOT[lvl] * 0.5); continue; }
        const g = gaps[gaps.length - 1];
        if (g && g.to === y - 1) { g.to = y; } else { gaps.push({ from: y, to: y, x }); x += GAP_W; }
      }
      const xAt = (iso, precision = 'day') => {
        const y = Number(iso.slice(0, 4));
        if (!start.has(y) || !start.has(y + 1)) return null;
        const n = dateToNumber({ v: iso, precision });
        const a = Date.UTC(y, 0, 1) / 86400000; const b = Date.UTC(y + 1, 0, 1) / 86400000;
        return start.get(y) + ((n - a) / (b - a)) * (start.get(y + 1) - start.get(y));
      };
      const gap = SLOT[lvl] * 0.62;
      for (let y = y0; y <= y1; y += 1) {
        const ws = dated.filter((w) => yearOf(w) === y).map((w) => ({ id: w.id, x: xAt(mainDate(w).v, mainDate(w).precision) }))
          .sort((p, q) => p.x - q.x);
        if (!ws.length) continue;
        const lo = start.get(y) + SLOT[lvl] * 0.25; const hi = start.get(y + 1) - SLOT[lvl] * 0.25;
        for (let i = 0; i < ws.length; i += 1) ws[i].x = Math.max(ws[i].x, lo, i ? ws[i - 1].x + gap : -Infinity);
        for (let i = ws.length - 1; i >= 0; i -= 1) ws[i].x = Math.min(ws[i].x, hi, i < ws.length - 1 ? ws[i + 1].x - gap : Infinity);
        ws.forEach((p) => xs.set(p.id, p.x));
      }
      let tail = start.get(y1 + 1);
      list.filter((w) => !mainDate(w)).forEach((w) => { tail += SLOT[lvl]; xs.set(w.id, tail); });
      return { y0, y1, start, count, gaps, xAt, end: Math.max(tail, start.get(y1 + 1)) };
    }

    function drawHorizontal({ animate = false } = {}) {
      const list = ctx.visible();
      const lvl = ctx.zoom.level;
      const story = ctx.state.order === 'story';
      const { H, vw, half } = measure();
      const railTop = 14; const railH = RAIL_H[lvl]; const railBot = railTop + railH;
      const rowH = ROW_H[lvl];
      // la bande se place sous la pile des cartels (3 rangées) ; sur un écran haut (tablette en portrait),
      // le surplus va au sol-miroir plutôt qu'à un vide sous le rail
      // (rangée 2 : bandTop − 12 − 2 × rowH − hauteur d'un cartel ≈ 62 px ; la pièce exposée du N3 tient aussi)
      const by = Math.min(Math.round(H - Math.max(190, H * 0.4)), railBot + 3 * rowH + 52 + HALF);
      const bandTop = by - HALF; const floorTop = by + HALF;
      const floorH = H - floorTop;
      const maxRows = Math.max(1, Math.min(3, Math.floor((bandTop - railBot - 24) / rowH)));
      let step = (story ? STORY_SLOT : SLOT)[lvl];
      let gapW = GAP_W; let rankW = STORY_SLOT[lvl] * 5;

      // positions le long de l'axe
      const xs = new Map();
      let years = null;
      if (story) list.forEach((w, i) => xs.set(w.id, half + i * STORY_SLOT[lvl]));
      else years = timeScale(list, lvl, half, xs);
      // N0 = vue d'ensemble : la frise entière tient dans la largeur de l'écran (même échelle, mise à
      // l'échelle d'un bloc ; aucun défilement, ni aiguille ni chevrons)
      const fit = lvl === 0 && list.length > 0;
      root.classList.toggle('c-fit', fit);
      if (fit) {
        const xv = [...xs.values()];
        const a0 = years ? years.start.get(years.y0) : Math.min(...xv) - step * 0.5;
        const a1 = years ? years.end : Math.max(...xv) + step * 0.5;
        const kx = (vw - 2 * FIT_M) / Math.max(1, a1 - a0);
        const map = (x) => FIT_M + (x - a0) * kx;
        xs.forEach((x, id) => xs.set(id, map(x)));
        if (years) {
          years.start.forEach((x, y) => years.start.set(y, map(x)));
          years.gaps.forEach((g) => { g.x = map(g.x); });
          years.end = map(years.end);
          // years.xAt lit years.start, déjà mis à l'échelle ci-dessus : ne pas l'y remettre une seconde fois
          // (le repère « aujourd'hui » partait vers 2008)
        }
        step *= kx; gapW *= kx; rankW *= kx;
      }
      const sorted = list.map((w) => ({ id: w.id, x: xs.get(w.id) })).sort((p, q) => p.x - q.x);
      const lastX = sorted.length ? sorted[sorted.length - 1].x : half;
      const W = fit ? vw : Math.ceil(Math.max(lastX + half, years ? years.end + 60 : 0, vw));
      const ys = new Map(list.map((w) => [w.id, by + Math.max(-1, Math.min(1, ctx.laneOf(w))) * LANE_DY]));

      // rangées des cartels (N2, N3) : la plus basse libre
      const rows = new Map();
      if (lvl >= 2) {
        const right = Array(maxRows).fill(-Infinity);
        const pw = PLATE_W[lvl];
        sorted.forEach(({ id, x }) => {
          let r = right.findIndex((rr) => x - pw / 2 >= rr + 10);
          if (r < 0) r = right.indexOf(Math.min(...right));
          right[r] = x + pw / 2;
          rows.set(id, r);
        });
      }

      // œuvre d'ancrage : celle qui est sous l'aiguille reste sous l'aiguille
      let anchor = centerId && xs.has(centerId) ? centerId : null;
      if (!anchor && G && centerId && G.xs.has(centerId)) {
        const ox = G.xs.get(centerId);
        let best = Infinity;
        list.forEach((w) => { if (G.xs.has(w.id)) { const dd = Math.abs(G.xs.get(w.id) - ox); if (dd < best) { best = dd; anchor = w.id; } } });
      }
      if (!anchor && list.length) anchor = (list.find((w) => w.id === ctx.state.focusId) || list[0]).id;
      // zoom à la molette (l'œuvre sous le pointeur y reste) ou au clic (la partie choisie vient sous l'aiguille)
      const pend = pendingAnchor && xs.has(pendingAnchor.id) ? pendingAnchor : null;
      pendingAnchor = null;
      const clampS = (v) => Math.max(0, Math.min(W - vw, v));
      const newScroll = fit ? 0 : pend ? clampS(xs.get(pend.id) - pend.sx) : anchor ? clampS(xs.get(anchor) - half) : 0;

      // dimensions et repères communs (CSS)
      frise.style.setProperty('--c-w', `${W}px`);
      frise.style.setProperty('--c-by', `${by}px`);
      frise.style.setProperty('--c-rt', `${railTop}px`);
      frise.style.setProperty('--c-rh', `${railH}px`);
      frise.style.setProperty('--c-ft', `${floorTop}px`);
      frise.style.setProperty('--c-fh', `${floorH}px`); // hauteur du sol-miroir (affiches)
      frise.style.setProperty('--c-pt', `${railBot + 14}px`);
      frise.style.setProperty('--c-ph', `${Math.max(60, bandTop - 14 - (railBot + 14))}px`);
      main.style.setProperty('--c-top', `${frise.offsetTop}px`);
      main.style.setProperty('--c-fw', `${frise.clientWidth}px`); // largeur de la frise (aiguille, chevrons), moins que la page en mode Personnages
      main.style.setProperty('--c-h', `${H}px`);
      main.style.setProperty('--c-by', `${by}px`);
      main.style.setProperty('--c-rt', `${railTop}px`);
      main.style.setProperty('--c-rh', `${railH}px`);
      svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
      svg.setAttribute('width', String(W));
      svg.setAttribute('height', String(H));

      // fil : principal (univers 616) et branches
      const pts = new Map(list.map((w) => [w.id, { x: xs.get(w.id), y: ys.get(w.id) }]));
      const mainPts = sorted.filter(({ id }) => ctx.laneOf(byId.get(id)) === 0).map(({ id }) => ({ id, ...pts.get(id) }));
      const uniTags = []; // étiquettes d'univers au bout des branches (N1 à N3)
      const br = branches(list, tax, ctx.state.order).map((b) => {
        const own = b.ids.map((id) => pts.get(id)).filter(Boolean);
        const fork = b.fork ? pts.get(b.fork) : null;
        const o0 = own[0]; const oN = own[own.length - 1];
        const seq = [];
        if (fork && o0) {
          const dx = o0.x - fork.x;
          seq.push({ x: fork.x, y: by }, { x: fork.x + dx * 0.42, y: by + (o0.y - by) * 0.12 }, { x: o0.x - dx * 0.2, y: o0.y });
        }
        seq.push(...own);
        if (oN) {
          seq.push({ x: oN.x + step * 0.7, y: oN.y });
          if (lvl >= 1 && b.label) {
            const tag = h('span', `c-uni c-uni--${b.lane < 0 ? 'up' : 'down'}`, b.label);
            tag.style.setProperty('left', `${Math.round(oN.x + step * 0.7 + 6)}px`);
            tag.style.setProperty('top', `${Math.round(oN.y)}px`);
            uniTags.push(tag);
          }
        }
        return { universe: b.universe, open: true, pts: seq };
      });

      // placement des <li> (avec une réorganisation ancrée sur l'aiguille)
      const reduced = ctx.reducedMotion();
      const doAnim = animate && !reduced && G && G.order !== undefined;
      const place = (li, x, y) => {
        li.style.setProperty('--x', `${(x - 22).toFixed(1)}px`);
        li.style.setProperty('--y', `${(y - 22).toFixed(1)}px`);
      };
      clearTimeout(animTimer);
      frise.classList.remove('c-anim');
      if (doAnim) {
        const delta = newScroll - frise.scrollLeft;
        list.forEach((w) => {
          const o = G.pts.get(w.id);
          if (o) place(ctx.items.get(w.id), o.x + delta, o.y);
        });
        const shift = (p) => ({ ...p, x: p.x + delta });
        thread.set(G.main.map(shift), G.br.map((b) => ({ ...b, pts: b.pts.map(shift) })), { reduced: true });
      }
      list.forEach((w) => {
        const li = ctx.items.get(w.id);
        const y = ys.get(w.id);
        const r = rows.get(w.id) || 0;
        li.style.setProperty('--lift', `${Math.round(y - bandTop + 12 + r * rowH)}px`);
        li.style.setProperty('--lift0', `${Math.round(y - bandTop + 12)}px`);
        li.style.setProperty('--stem', `${8 + r * rowH}px`);
        li.style.setProperty('--drop', `${Math.round(floorTop - y)}px`);
        li.dataset.row = String(r);
        if (!doAnim) place(li, xs.get(w.id), y);
      });
      sorted.forEach(({ id, x }, i) => {
        const dl = i ? x - sorted[i - 1].x : Infinity; const dr = i < sorted.length - 1 ? sorted[i + 1].x - x : Infinity;
        ctx.items.get(id).style.setProperty('--pw', `${Math.round(Math.max(40, Math.min(104, Math.min(dl, dr) - 10)))}px`);
      });
      frise.scrollLeft = newScroll;
      if (doAnim) {
        void frise.offsetWidth; // fige les positions de départ avant la transition
        frise.classList.add('c-anim');
        list.forEach((w) => place(ctx.items.get(w.id), xs.get(w.id), ys.get(w.id)));
        thread.set(mainPts, br, { duration: 900 });
        animTimer = setTimeout(() => frise.classList.remove('c-anim'), 950);
      } else {
        thread.set(mainPts, br, { reduced: true });
      }

      // graduations (SVG décoratif)
      gTicks.replaceChildren();
      const tick = (x, a, b, cls) => gTicks.append(sv('line', { x1: x.toFixed(1), x2: x.toFixed(1), y1: a, y2: b, class: cls }));
      if (years) {
        for (let y = years.y0; y <= years.y1 + 1; y += 1) {
          const x = years.start.get(y);
          const empty = y <= years.y1 && !years.count.get(y);
          const afterGap = y > years.y0 && !years.count.get(y - 1);
          if (empty && !(y > years.y0 && years.count.get(y - 1))) continue; // dans une coupure : pas de graduation
          if (!empty || afterGap) { tick(x, railBot, bandTop - 6, 'c-grid'); tick(x, by - 10, by + 10, 'c-tick'); }
          if (empty) { tick(x, railBot, bandTop - 6, 'c-grid'); tick(x, by - 10, by + 10, 'c-tick'); continue; }
          if (y <= years.y1) tick((x + years.start.get(y + 1)) / 2, by - 4, by + 4, 'c-tick c-tick--minor');
        }
      } else {
        list.forEach((w, i) => {
          if (i % 5 !== 0 && i !== list.length - 1) return;
          const x = xs.get(w.id);
          tick(x, railBot, bandTop - 6, 'c-grid');
          tick(x, by - 8, by + 8, 'c-tick');
        });
      }

      // mur (rail des années, travées) et sol (phases, aujourd'hui)
      const wallKids = []; const floorKids = [];
      yearEls = new Map(); runIndex = new Map(); runEls = [];
      if (years) {
        // libellé collant : l'année reste lisible ; années étroites (vue d'ensemble) : « ’08 », et quand
        // même cela ne tient pas, une année sur deux ou trois. Largeurs d'après la taille des années au
        // niveau (Antonio grasse : « 2017 » ≈ 2,42 em, « ’17 » ≈ 1,5 em), retrait de 10 px, 8 px entre deux libellés
        const yfs = [24, 34, 54, 62][lvl] || 54;
        const fullW = yfs * 2.42 + 14; const shortW = yfs * 1.5 + 14;
        let lastEnd = -Infinity;
        for (let y = years.y0; y <= years.y1; y += 1) {
          if (!years.count.get(y)) continue;
          const s = h('span', 'c-yr');
          const x = years.start.get(y);
          const wy = years.start.get(y + 1) - x;
          const free = x + 10 >= lastEnd + 8;
          const label = !free ? '' : wy >= fullW ? String(y) : `’${String(y).slice(2)}`;
          if (label) lastEnd = x + (label.length === 4 ? fullW : shortW) - 4;
          if (label && wy < shortW) s.classList.add('is-spill'); // le libellé déborde sur les années voisines, laissées sans libellé
          const t = h('span', 'c-yr__t', label);
          s.append(t);
          s.style.setProperty('left', `${years.start.get(y)}px`);
          s.style.setProperty('width', `${years.start.get(y + 1) - years.start.get(y)}px`);
          yearEls.set(y, s);
          wallKids.push(s);
        }
        years.gaps.forEach((g) => {
          const s = h('span', 'c-yr c-yr--gap', '⋯');
          s.style.setProperty('left', `${g.x}px`);
          s.style.setProperty('width', `${gapW}px`);
          wallKids.push(s);
        });
      } else {
        list.forEach((w, i) => {
          if (i % 5 !== 0) return;
          const s = h('span', 'c-yr c-yr--rank');
          s.append(h('span', 'c-yr__t', String(w.story.v)));
          s.style.setProperty('left', `${xs.get(w.id)}px`);
          s.style.setProperty('width', `${rankW}px`);
          wallKids.push(s);
        });
      }
      // introduction (dans la marge de gauche) : seulement si la place le permet
      if (half >= 380 && list.length && !fit) {
        const ysAll = list.map(yearOf).filter((y) => y !== null);
        const intro = h('div', 'c-intro');
        const room = bandTop - railBot - 44;
        intro.append( // le nom du site est déjà dans l'en-tête
          h('span', 'c-intro__s', story ? `${(list.some((x) => x.kind === 'phase') ? plural(list.length, 'phase', 'phases') : plural(list.length, 'œuvre', 'œuvres'))}, dans l’ordre de l’histoire` : `${(list.some((x) => x.kind === 'phase') ? plural(list.length, 'phase', 'phases') : plural(list.length, 'œuvre', 'œuvres'))}, de ${Math.min(...ysAll)} à ${Math.max(...ysAll)}`),
        );
        if (room >= 120) intro.append(h('span', 'c-intro__h', 'Molette : zoomer. Glisser, Maj + molette ou ‹ › : faire défiler sous l’aiguille rouge. Choisissez une perle pour ouvrir ses archives.'));
        // aligné sur la position de départ (première œuvre sous l'aiguille)
        intro.style.setProperty('left', `${Math.round(56 + Math.max(0, sorted[0].x - half))}px`);
        intro.style.setProperty('width', `${Math.min(440, half - 56 - EXHIBIT_W / 2 - 24)}px`); // libre à côté de la pièce exposée
        intro.style.setProperty('top', `${railBot + 22}px`);
        intro.style.setProperty('max-height', `${bandTop - railBot - 44}px`);
        wallKids.push(intro);
      }
      // travées : sagas (N0), phases (N1), phases en filigrane (mode Phases, N2-N3)
      const pRuns = phaseRuns(list);
      // bornes d'une travée : une demi-case de part et d'autre, sans dépasser le milieu de l'écart avec la
      // course voisine (deux œuvres d'une même année peuvent être plus proches qu'une case)
      const boundsOf = (runs) => runs.map((run, i) => {
        const a = xs.get(run.works[0].id); const z = xs.get(run.works[run.works.length - 1].id);
        const prev = runs[i - 1]; const next = runs[i + 1];
        const x0 = prev ? Math.max(a - step * 0.5, (xs.get(prev.works[prev.works.length - 1].id) + a) / 2) : a - step * 0.5;
        const x1 = next ? Math.min(z + step * 0.5, (z + xs.get(next.works[0].id)) / 2) : z + step * 0.5;
        return [x0, x1];
      });
      const pBounds = boundsOf(pRuns);
      const panelFor = ([x0, x1], kind, idx) => {
        const p = h('div', `c-pn c-pn--${kind}`);
        p.style.setProperty('left', `${x0 + 3}px`);
        p.style.setProperty('width', `${Math.max(20, x1 - x0 - 6)}px`);
        if (idx !== undefined) (runEls[idx] = runEls[idx] || []).push(p);
        return { p, wpx: x1 - x0 - 6 };
      };
      if (lvl === 0) {
        const sRuns = sagaRuns(list);
        const sBounds = boundsOf(sRuns);
        sRuns.forEach((run, si) => {
          const { p, wpx } = panelFor(sBounds[si], 'saga');
          p.dataset.saga = run.key || ''; // code couleur
          const s = tax.sagas.find((x) => x.id === run.key);
          p.append(h('span', 'c-pn__k', 'Saga'), h('span', 'c-pn__t', sagaLabel(run.key)));
          // titre à la mesure de sa travée : son plus long mot tient dans la largeur (Antonio, ≈ 0,5 em
          // par lettre), au plus trois lignes dans la hauteur du mur
          const word = Math.max(...sagaLabel(run.key).split(/\s+/).map((x) => x.length), 4);
          const wallH = Math.max(80, bandTop - railBot - 28);
          let tsz = Math.max(12, Math.min(57.6, (wpx - 28) / (word * 0.52), (wallH - 90) / 2.9));
          // travée trop étroite pour un titre lisible (saga qui commence, frise de plusieurs sagas) :
          // titre vertical, lu de bas en haut comme un dos de livre, à la mesure de la hauteur du mur
          if ((wpx - 28) / (word * 0.52) < 16 && wpx < 90) {
            tsz = Math.max(11, Math.min(wpx - 14, (wallH - 40) / (sagaLabel(run.key).length * 0.55), 40));
            p.classList.add('is-vertical');
          }
          p.style.setProperty('--pn-t', `${Math.round(tsz)}px`);
          if (wpx > 150) {
            const folded = run.works[0].kind === 'phase';
            const onePhase = ctx.state.mode === 'phases' && ctx.state.openPhase; // une seule phase dépliée : ni « phases 1 à 3 »
            // personnage présent dans une seule saga : son nombre d'œuvres et ses années sont sur sa fiche
            const solo = ctx.state.mode === 'personnages' && sRuns.length === 1;
            if (!solo) p.append(h('span', 'c-pn__y', story ? countOf(run.works) : yearsOfRun(run.works)));
            p.append(h('span', 'c-pn__c', [story || solo ? null : countOf(run.works), s && !folded && !onePhase ? `phases ${s.phases[0]} à ${s.phases[s.phases.length - 1]}` : null].filter(Boolean).join(' · ')));
          } else p.classList.add('is-narrow');
          wallKids.push(p);
        });
      }
      pRuns.forEach((run, idx) => {
        run.works.forEach((w) => runIndex.set(w.id, idx));
        if (lvl === 1 || (lvl >= 2 && ctx.state.mode === 'phases')) {
          const { p, wpx } = panelFor(pBounds[idx], lvl === 1 ? 'phase' : 'faint', idx);
          p.dataset.phase = run.key ? String(run.key) : '';
          if (lvl === 1) {
            const ph = Math.max(60, bandTop - 14 - (railBot + 14));
            const size = Math.max(40, Math.min(ph * 0.62, wpx * 0.9, 168));
            p.style.setProperty('--n', `${Math.round(size)}px`);
            if (wpx > 110) p.append(h('span', 'c-pn__k', 'Phase'));
            p.append(h('span', 'c-pn__n', run.key ? String(run.key) : '?'));
            if (wpx > 110) p.append(h('span', 'c-pn__y', story ? plural(run.works.length, 'œuvre', 'œuvres') : yearsOfRun(run.works)));
            if (wpx <= 110) p.classList.add('is-narrow');
          }
          wallKids.push(p);
        }
        // libellé de phase sur le sol-miroir
        const x0 = xs.get(run.works[0].id) - Math.min(step * 0.5, 40);
        const next = pRuns[idx + 1];
        const x1 = next ? xs.get(next.works[0].id) - Math.min(step * 0.5, 40) : W - 20;
        const f = h('div', 'c-ph');
        f.dataset.phase = run.key ? String(run.key) : '';
        f.style.setProperty('left', `${x0}px`);
        f.style.setProperty('width', `${Math.max(24, x1 - x0 - 8)}px`);
        if (x1 - x0 < (fit ? 140 : 92)) f.classList.add('is-narrow'); // vue d'ensemble : années trop longues pour la place
        const fin = h('span', 'c-ph__in'); // bloc collant : le libellé suit la phase à l'écran
        fin.append(h('span', 'c-ph__k', 'Phase'), h('span', 'c-ph__n', run.key ? String(run.key) : '?'),
          h('span', 'c-ph__y', story ? plural(run.works.length, 'œuvre', 'œuvres') : yearsOfRun(run.works)));
        f.append(fin);
        (runEls[idx] = runEls[idx] || []).push(f);
        floorKids.push(f);
      });
      // marge de gauche trop étroite (tablette) mais sol haut : introduction compacte posée sur le sol
      if (half < 380 && floorH >= 250 && list.length && !trameSet()) {
        const ysAll = list.map(yearOf).filter((y) => y !== null);
        const intro = h('div', 'c-intro c-intro--floor');
        intro.append(
          h('span', 'c-intro__s', story ? `${(list.some((x) => x.kind === 'phase') ? plural(list.length, 'phase', 'phases') : plural(list.length, 'œuvre', 'œuvres'))}, dans l’ordre de l’histoire` : `${(list.some((x) => x.kind === 'phase') ? plural(list.length, 'phase', 'phases') : plural(list.length, 'œuvre', 'œuvres'))}, de ${Math.min(...ysAll)} à ${Math.max(...ysAll)}`),
        );
        intro.style.setProperty('left', `${Math.round(24 + Math.max(0, sorted[0].x - half))}px`);
        intro.style.setProperty('top', `${floorH >= 280 ? 128 : 108}px`);
        intro.style.setProperty('max-width', `${vw - 48}px`);
        floorKids.push(intro);
      }
      floor.classList.toggle('is-tall', floorH >= 280);
      if (years && today.slice(0, 4) >= String(years.y0) && today.slice(0, 4) <= String(years.y1)) {
        const tx = years.xAt(today);
        if (tx !== null) {
          const t = h('div', 'c-today', 'aujourd’hui');
          t.style.setProperty('left', `${tx}px`);
          floorKids.push(t);
        }
      }
      wall.replaceChildren(...wallKids, ...uniTags);
      floor.replaceChildren(...floorKids);

      // trame d'un personnage : arcs sous l'horizon entre ses œuvres successives
      gTrame.replaceChildren();
      const set = trameSet();
      if (set) {
        const ids = sorted.filter(({ id }) => set.has(id));
        const maxD = H - floorTop - 34 + HALF;
        for (let i = 0; i < ids.length - 1; i += 1) {
          const a = pts.get(ids[i].id); const b = pts.get(ids[i + 1].id);
          const d = Math.min(maxD, 30 + (b.x - a.x) * 0.16);
          gTrame.append(sv('path', { d: `M${a.x.toFixed(1)},${a.y} C${a.x.toFixed(1)},${(by + d).toFixed(1)} ${b.x.toFixed(1)},${(by + d).toFixed(1)} ${b.x.toFixed(1)},${b.y}`, class: 'c-arc' }));
        }
        ids.forEach(({ id }) => { const p = pts.get(id); gTrame.append(sv('circle', { cx: p.x.toFixed(1), cy: p.y, r: 9, class: 'c-arc-ring' })); });
      }
      thread.highlight(!!set);
      updateLegend(list);

      fitCache = new Map();
      G = {
        xs, pts, main: mainPts, br, sorted, half, W, vw, order: ctx.state.order, lvl,
        room: bandTop - 12 - (railBot + 8), // hauteur disponible pour la pièce exposée
        floorDoc: frise.getBoundingClientRect().top + window.scrollY + floorTop, // haut du sol (page)
      };
      centerId = null; // force la mise à jour des classes
      list.forEach((w) => ctx.items.get(w.id).classList.remove('is-center', 'is-exhibit', 'c-fit-1', 'c-fit-2'));
      setCenter((pend && (pend.center || nearestX(newScroll + half))) || anchor || nearestX(newScroll + half), { force: true });
    }

    function nearestX(cx) {
      if (!G || !G.sorted.length) return null;
      const a = G.sorted;
      let lo = 0; let hi = a.length - 1;
      while (hi - lo > 1) { const m = (lo + hi) >> 1; if (a[m].x < cx) lo = m; else hi = m; }
      return Math.abs(a[lo].x - cx) <= Math.abs(a[hi].x - cx) ? a[lo].id : a[hi].id;
    }

    function centerOnX(id, smooth = true) {
      if (!G || !G.xs.has(id)) return;
      const left = Math.max(0, Math.min(G.W - G.vw, G.xs.get(id) - G.half));
      frise.scrollTo({ left, behavior: smooth ? behavior() : 'auto' });
    }

    // les événements de défilement sont déjà cadencés à l'image ; recherche dichotomique sur des
    // positions mises en cache (aucune lecture de mise en page pendant le défilement)
    frise.addEventListener('scroll', () => {
      if (isH() && G) setCenter(nearestX(frise.scrollLeft + G.half));
    }, { passive: true });

    // zoom d'un niveau, en gardant une œuvre à un endroit de l'écran : sous le pointeur (molette) ou
    // sous l'aiguille (clic sur une partie de la frise, `center`)
    function zoomAt(level, { clientX, id = null, center = false } = {}) {
      if (!G) return;
      const sx = clientX - frise.getBoundingClientRect().left;
      const target = id || nearestX(frise.scrollLeft + sx);
      pendingAnchor = target ? { id: target, sx: center ? G.half : sx, center: center ? target : null } : null;
      ctx.zoom.set(level);
      if (center && target && byId.get(target)) {
        const w = byId.get(target);
        ctx.announce(`${ctx.zoom.spoken} : ${w.title_fr.v} sous l’aiguille.`);
      }
    }

    // molette verticale au-dessus de la frise → zoom (vers le haut : zoomer ; vers le bas : dézoomer),
    // l'œuvre sous le pointeur reste sous le pointeur. Jamais avec Ctrl/Cmd (zoom du navigateur libre) ;
    // Maj + molette et le glissement horizontal du pavé tactile font défiler la frise. Au bout des niveaux,
    // la page défile.
    let wheelAcc = 0; let wheelLock = 0;
    frise.addEventListener('wheel', (e) => {
      if (e.ctrlKey || e.metaKey || e.shiftKey || !isH() || !G) return;
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      const now = performance.now();
      if (now < wheelLock) { e.preventDefault(); return; } // un cran = un niveau
      const dir = e.deltaY < 0 ? 1 : -1;
      const lvl = ctx.zoom.level;
      if ((dir > 0 && lvl >= ctx.zoom.max) || (dir < 0 && lvl <= ctx.zoom.min)) { wheelAcc = 0; return; }
      e.preventDefault();
      wheelAcc += e.deltaY * (e.deltaMode === 1 ? 40 : (e.deltaMode === 2 ? 400 : 1));
      if (Math.abs(wheelAcc) < 50) return; // pavé tactile : petits pas cumulés
      wheelAcc = 0;
      wheelLock = now + 420;
      zoomAt(ctx.zoom.neighbor(dir), { clientX: e.clientX });
    }, { passive: false });

    // glisser à la souris pour faire défiler (le clic reste un clic tant qu'on ne bouge pas)
    let drag = null;
    let swallowClick = false;
    frise.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse' || e.button !== 0 || !isH()) return;
      drag = { x: e.clientX, left: frise.scrollLeft, moved: false };
    });
    window.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x;
      if (!drag.moved && Math.abs(dx) > 5) { drag.moved = true; frise.classList.add('is-dragging'); }
      if (drag.moved) frise.scrollLeft = drag.left - dx;
    });
    window.addEventListener('pointerup', () => {
      if (drag && drag.moved) { swallowClick = true; setTimeout(() => { swallowClick = false; }, 0); }
      frise.classList.remove('is-dragging');
      drag = null;
    });
    frise.addEventListener('click', (e) => { if (swallowClick) { e.stopPropagation(); e.preventDefault(); swallowClick = false; } }, true);
    // vue d'ensemble : un clic sur la frise zoome sur la partie choisie, qui vient sous l'aiguille ; sur une
    // perle, la vue des œuvres s'ouvre centrée sur elle (Entrée au clavier fait de même). Aux niveaux Œuvres
    // et Détail, la perle ouvre les Archives (inchangé).
    frise.addEventListener('click', (e) => {
      if (e.defaultPrevented || !isH() || !G || ctx.zoom.level !== ctx.zoom.min) return;
      if (e.target.closest('a, input, select, textarea, summary')) return;
      const btn = e.target.closest('.node__btn');
      const node = btn && btn.closest('.node');
      if (node && node.dataset.kind === 'phase') return; // mode Phases : la phase se déplie (coquille)
      if (node) {
        e.preventDefault(); e.stopPropagation();
        zoomAt(ctx.zoom.neighbor(1), { clientX: e.clientX, id: node.dataset.id, center: true });
        return;
      }
      if (!e.target.closest('.c-wall, .c-floor, .frise__svg, .oeuvres') && e.target !== frise) return;
      zoomAt(ctx.zoom.neighbor(1), { clientX: e.clientX, center: true });
    }, true);
    // Échap : masque l'affiche ouverte au survol (WCAG 1.4.13), jusqu'au prochain mouvement du pointeur
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && isH()) frise.classList.add('no-pop'); });
    frise.addEventListener('pointermove', () => frise.classList.remove('no-pop'), { passive: true });
    frise.addEventListener('focusin', () => frise.classList.remove('no-pop'));

    // chevrons ‹ › : œuvre précédente / suivante dans l'ordre courant
    function stepWork(dir) {
      const list = ctx.visible();
      const i = list.findIndex((w) => w.id === centerId);
      const j = Math.max(0, Math.min(list.length - 1, (i < 0 ? 0 : i) + dir));
      const w = list[j];
      if (!w || w.id === centerId) return;
      centerOnX(w.id);
      setCenter(w.id);
      const d = mainDate(w);
      ctx.announce(`${w.title_fr.v}${d ? `, ${d.v.slice(0, 4)}` : ''}, sous l’aiguille.`);
    }
    prevBtn.addEventListener('click', () => { if (prevBtn.getAttribute('aria-disabled') !== 'true') stepWork(-1); });
    nextBtn.addEventListener('click', () => { if (nextBtn.getAttribute('aria-disabled') !== 'true') stepWork(1); });

    // =========================================================================================
    // Frise verticale (mobile)
    // =========================================================================================
    function drawVertical() {
      const list = ctx.visible();
      const story = ctx.state.order === 'story';
      frise.style.removeProperty('--c-h');
      const pRuns = phaseRuns(list);
      const sRuns = sagaRuns(list);
      const pStart = new Map(); const sStart = new Map();
      runIndex = new Map(); runEls = []; yearEls = new Map();
      pRuns.forEach((r, idx) => { pStart.set(r.works[0].id, { r, idx }); r.works.forEach((w) => runIndex.set(w.id, idx)); });
      sRuns.forEach((r) => sStart.set(r.works[0].id, r));
      let prevY = null;
      list.forEach((w, i) => {
        const li = ctx.items.get(w.id);
        li.classList.remove('is-center', 'is-exhibit');
        li.classList.toggle('c-first', i === 0);
        li.classList.toggle('c-last', i === list.length - 1);
        const y = yearOf(w);
        li.classList.toggle('c-ys', !story && y !== prevY);
        prevY = y;
        const ps = pStart.get(w.id);
        li.classList.toggle('c-ps', !!ps);
        if (ps) {
          const hy = li.querySelector('.c-hp-y'); // une phase repliée (mode Phases) n'a pas d'en-tête de phase
          if (hy) hy.textContent = story ? plural(ps.r.works.length, 'œuvre', 'œuvres') : yearsOfRun(ps.r.works);
          const hd = li.querySelector('.c-hd-phase');
          runEls[ps.idx] = hd ? [hd] : [];
        }
        const ss = sStart.get(w.id);
        li.classList.toggle('c-ss', !!ss);
        const sy = ss && li.querySelector('.c-hs-y');
        if (sy) {
          const folded = ss.works[0].kind === 'phase'; // phases repliées : leurs années et leur nombre
          const n = folded ? plural(ss.works.length, 'phase', 'phases') : plural(ss.works.length, 'œuvre', 'œuvres');
          const ys = folded ? ss.works.flatMap((x) => x.years.map(Number)).filter(Boolean) : null;
          const yrs = folded ? (ys.length ? span(Math.min(...ys), Math.max(...ys)) : '') : yearsOfRun(ss.works);
          // phase dépliée : ses années sont déjà dans l'en-tête de phase, juste dessous ; personnage présent
          // dans une seule saga : son nombre d'œuvres et ses années sont sur sa fiche
          sy.textContent = ctx.state.mode === 'personnages' && sStart.size === 1 ? ''
            : (story && !folded) || (ctx.state.mode === 'phases' && ctx.state.openPhase) ? n : `${yrs} · ${n}`;
        }
      });
      // trame du personnage : une fine ligne à droite de la bande relie ses œuvres
      const set = trameSet();
      const idx = set ? list.map((w, i) => (set.has(w.id) ? i : -1)).filter((i) => i >= 0) : [];
      list.forEach((w, i) => {
        const li = ctx.items.get(w.id);
        const on = idx.length > 1 && i >= idx[0] && i <= idx[idx.length - 1];
        li.classList.toggle('c-tr', on);
        li.classList.toggle('c-tr-a', on && i === idx[0]);
        li.classList.toggle('c-tr-z', on && i === idx[idx.length - 1]);
      });
      // introduction et légende de l'ordre
      // une phase compte pour toute sa durée (sinon la dernière phase s'arrêterait à son année de début)
      const ys = list.flatMap((w) => (w.kind === 'phase' && w.years ? w.years.map(Number) : [yearOf(w)])).filter((y) => y !== null && !Number.isNaN(y));
      const k = h('span', 'c-im-k', story ? 'ordre de l’histoire' : 'ordre de sortie');
      const s = h('span', 'c-im-s', story ? `${(list.some((x) => x.kind === 'phase') ? plural(list.length, 'phase', 'phases') : plural(list.length, 'œuvre', 'œuvres'))} · rangs réguliers, sans échelle de temps` : `${(list.some((x) => x.kind === 'phase') ? plural(list.length, 'phase', 'phases') : plural(list.length, 'œuvre', 'œuvres'))} · ${ys.length ? `${Math.min(...ys)} → ${Math.max(...ys)}` : ''}`);
      const kids = [h('span', 'c-im-t', 'Fil noir'), k, s];
      if (set) kids.push(h('span', 'c-im-c', `Trame${NBSP}: ${ctx.charName.get(ctx.state.character)} · ${plural(idx.length, 'œuvre', 'œuvres')}`));
      kids.push(h('span', 'c-im-h', 'Faites défiler : l’aiguille rouge désigne l’œuvre au centre de l’écran.'));
      introM.replaceChildren(...kids);
      G = null;
      centerId = null;
      cacheVertical(); // une seule lecture de mise en page par rendu
    }

    function cacheVertical() {
      if (!isV()) return;
      const sy = window.scrollY;
      const list = ctx.visible();
      V = list.map((w) => {
        const li = ctx.items.get(w.id);
        const btn = li.querySelector('.node__btn');
        const r = btn.getBoundingClientRect();
        const lr = li.getBoundingClientRect();
        li.style.setProperty('--bead-y', `${Math.round(r.top - lr.top + 22)}px`);
        return { id: w.id, y: r.top + sy + Math.min(22, r.height / 2) };
      });
      // marge sous la frise : juste assez pour amener la dernière œuvre sous l'aiguille (milieu de l'écran)
      if (V.length) {
        const vh = window.innerHeight;
        const pad = parseFloat(getComputedStyle(frise).paddingBottom) || 0;
        const missing = (V[V.length - 1].y - vh / 2 + 12) - (document.documentElement.scrollHeight - vh);
        frise.style.setProperty('padding-bottom', `${Math.round(Math.max(32, pad + missing))}px`);
      }
      const fr = frise.getBoundingClientRect();
      VF = { top: fr.top + sy, bottom: fr.bottom + sy, vh: window.innerHeight };
      updateVertical(true);
    }

    function updateVertical(force = false) {
      if (!V.length) return;
      const mid = window.scrollY + VF.vh / 2;
      root.classList.toggle('c-needle-on', mid > V[0].y - 90 && mid < V[V.length - 1].y + 90);
      let lo = 0; let hi = V.length - 1;
      while (hi - lo > 1) { const m = (lo + hi) >> 1; if (V[m].y < mid) lo = m; else hi = m; }
      const id = Math.abs(V[lo].y - mid) <= Math.abs(V[hi].y - mid) ? V[lo].id : V[hi].id;
      setCenter(id, { force });
    }

    window.addEventListener('scroll', () => { if (isV()) updateVertical(); }, { passive: true });

    function centerOnY(id, smooth = true) {
      const v = V.find((p) => p.id === id);
      if (!v) return;
      window.scrollTo({ top: Math.max(0, v.y - VF.vh / 2), behavior: smooth ? behavior() : 'auto' });
    }

    // =========================================================================================
    // rendu
    // =========================================================================================
    // mode Personnages : à l'arrivée sur une trame, l'aiguille rejoint l'œuvre du personnage la plus proche
    let lastTrame = '';
    function trameJump() {
      const set = trameSet();
      const key = set ? ctx.state.character : '';
      const changed = key !== lastTrame;
      lastTrame = key;
      if (!set || !changed || (centerId && set.has(centerId))) return null;
      const list = ctx.visible();
      const i0 = Math.max(0, list.findIndex((w) => w.id === centerId));
      let best = null; let bd = Infinity;
      list.forEach((w, i) => { if (set.has(w.id) && Math.abs(i - i0) < bd) { bd = Math.abs(i - i0); best = w.id; } });
      return best;
    }

    function draw({ reason, transition } = {}) {
      const jump = trameJump();
      if (useVertical()) {
        root.classList.add('c-vertical');
        root.classList.remove('c-h', 'c-fit');
        drawVertical();
        if (jump && reason === 'state') centerOnY(jump, false); // jamais au chargement : la page reste en haut
        return;
      }
      if (jump) centerId = jump;
      root.classList.remove('c-vertical', 'c-needle-on');
      frise.style.removeProperty('padding-bottom'); // marge de fin de la frise verticale
      if (isList()) {
        root.classList.remove('c-h', 'c-fit');
        frise.style.removeProperty('--c-h');
        wall.replaceChildren(); floor.replaceChildren();
        G = null;
        return;
      }
      root.classList.add('c-h');
      const lvlChanged = G && G.lvl !== ctx.zoom.level;
      drawHorizontal({ animate: !!transition && reason === 'state' });
      if (lvlChanged || reason === 'list') {
        frise.classList.remove('is-rezoom');
        void frise.offsetWidth;
        frise.classList.add('is-rezoom');
      }
    }

    ctx.on('render', draw);
    ctx.on('focus', ({ id }) => {
      if (isV()) centerOnY(id);
      else if (isH()) { centerOnX(id); setCenter(id); }
    });

    let resizeRaf = 0;
    window.addEventListener('resize', () => {
      cancelAnimationFrame(resizeRaf);
      resizeRaf = requestAnimationFrame(() => {
        const v = useVertical();
        if (v !== isV()) { draw({ reason: 'resize' }); return; }
        if (v) { VF.vh = window.innerHeight; cacheVertical(); } else if (isH()) draw({ reason: 'resize' });
      });
    });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => draw({ reason: 'fonts' }));
    // frise verticale : toute variation de hauteur (police, en-tête, contenu) recalcule les positions en
    // cache ; rien n'est lu pendant le défilement
    if ('ResizeObserver' in window) {
      let roRaf = 0;
      const ro = new ResizeObserver(() => {
        if (!isV()) return;
        cancelAnimationFrame(roRaf);
        roRaf = requestAnimationFrame(cacheVertical);
      });
      ro.observe(document.getElementById('oeuvres'));
      ro.observe(header);
    }
  },
});
