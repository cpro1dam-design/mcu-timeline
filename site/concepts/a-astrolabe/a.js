// Éphémérides — maquette A : l'astrolabe (frise circulaire).
// Un cadran gravé : les œuvres sont posées sur une spirale (layout.spiral) selon leur rang dans
// l'ordre courant, le fil noir la suit, les branches Terre-828 / Terre-10005 s'en écartent en arcs.
// Un index doré fixe en haut : le cadran tourne pour amener l'œuvre choisie sous l'index, et cette
// œuvre est l'œuvre « au centre » (teinte du ciel). Sur mobile, on ne voit que l'arc supérieur d'un
// cadran agrandi, la carte de l'œuvre courante au-dessus.
// Toutes les couches graphiques sont aria-hidden (.frise-deco) : la liste <ol> reste l'unique
// contenu interactif de la frise. Aucune donnée inventée : rangs, dates et libellés viennent de ctx.data.

import { bootConcept } from '../../shared/js/shell.js';
import { createThread } from '../../shared/js/thread.js';
import { branches, spiral, mainDate } from '../../shared/js/layout.js';
import { statusOf, todayParis } from '../../shared/js/dates.js';
import { createPreview } from '../../shared/js/preview.js';
import { afficheEl } from '../../shared/js/affiche.js';
import { sagaShort } from '../../shared/js/filter.js';

const NS = 'http://www.w3.org/2000/svg';
const TAU = Math.PI * 2;
const TOP = -Math.PI / 2;
const KIND = { film: 'Film', series: 'Série', special: 'Épisode spécial' };
// La coquille passe en vue liste automatique sous 400 px de large. Cette maquette garde le cadran
// sur téléphone en portrait (le bouton « Vue liste » reste disponible). false = comportement du socle.
const KEEP_DIAL_ON_PHONES = true;

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const ease = (k) => 1 - (1 - k) ** 3; // même courbe que le fil (thread.js)
const plural = (n, one, many) => `${n} ${n > 1 ? many : one}`;
const fx = (n) => n.toFixed(1);
function wrapPi(a) { let b = (a + Math.PI) % TAU; if (b < 0) b += TAU; return b - Math.PI; }
const ROM = [[100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
function toRoman(n) { let out = ''; let k = n; ROM.forEach(([v, r]) => { while (k >= v) { out += r; k -= v; } }); return out; }

function s(name, attrs = {}, parent = null) {
  const n = document.createElementNS(NS, name);
  Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, typeof v === 'number' ? fx(v) : v));
  if (parent) parent.append(n);
  return n;
}
// typographie française : espace insécable avant « : », fine insécable avant ; ! ?
const fr = (t) => String(t).replace(/ :/g, ' :').replace(/ ([;!?])/g, ' $1');
function h(tag, cls, text, parent) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined && text !== null) n.textContent = fr(text);
  if (parent) parent.append(n);
  return n;
}
const yearOf = (w) => { const d = mainDate(w); return d ? d.v.slice(0, 4) : null; };

bootConcept({
  concept: 'a',
  skipLevels: [1], // pas de niveau « Phases » : l'onglet Phases tient ce rôle
  decorate(li, w) { li.dataset.saga = w.saga ? w.saga.v : ''; },
  layout(ctx) { astrolabe(ctx); },
});

function astrolabe(ctx) {
  const root = document.documentElement;
  const tax = ctx.data.taxonomy;
  const ROMAN = ctx.ROMAN;
  const byId = new Map([...ctx.data.works, ...ctx.phaseWorks.values()].map((w) => [w.id, w])); // œuvres + phases repliées (mode Phases)
  const main = document.getElementById('contenu');
  const frise = document.getElementById('frise');
  const svg = frise.querySelector('.frise__svg');
  const ol = ctx.ol;
  const zoomBar = document.querySelector('.c-zoom');
  const listBtn = document.getElementById('btn-list');
  const today = todayParis();
  const btnOf = new Map([...ctx.items].map(([id, li]) => [id, li.querySelector('.node__btn')]));
  const isList = () => root.classList.contains('is-list-view');
  const sagaOf = (w) => tax.sagas.find((x) => x.id === (w.saga && w.saga.v)) || null;
  const uniLabel = (w) => { const u = tax.universes.find((x) => x.id === (w.universe && w.universe.v)); return u ? u.label_fr : 'Univers principal'; };
  const charSet = () => (ctx.state.mode === 'personnages' && ctx.state.character ? ctx.worksOfCharacter(ctx.state.character) : null);

  // -- cadrans de deux sagas, réunis dans le grand cadran (choix de l'utilisateur, 2026-10-20) -------
  // En Chronologie (sans filtre saga / phase), un cadran porte deux sagas, une par anneau ; toutes les
  // deux sagas, un nouveau cadran s'ajoute (trois sagas par cadran : essayé, trop chargé). Dès deux cadrans, le grand
  // cadran (« Tous les cadrans ») les réunit en petit, en orbite : celui qu'on choisit (◀ ▶, flèches)
  // vient en haut et grandit ; on le touche pour y plonger (Échap ou « Tous les cadrans » pour en
  // ressortir). Aujourd'hui (deux sagas) : un seul cadran, comme avant. Modes Phases et Personnages : un
  // seul cadran, un anneau par saga. Adresse : sans ?cadran, le grand cadran ; ?cadran=N, le Ne cadran.
  const params0 = new URLSearchParams(location.search);
  const sagaIdx = new Map(tax.sagas.map((sg, i) => [sg.id, i]));
  const sagaById = (id) => tax.sagas.find((x) => x.id === id) || null;
  const PER = 2; // sagas par cadran
  const PLATES = [];
  for (let i = 0; i < tax.sagas.length; i += PER) PLATES.push(tax.sagas.slice(i, i + PER));
  const plateOf = (w) => { const i = sagaIdx.get(w.saga && w.saga.v); return i === undefined ? -1 : Math.floor(i / PER); };
  const plateName = (i) => `Cadran ${i + 1}`;
  const plateSagas = (i) => PLATES[i].map(sagaShort).join(' · ');
  const lowSaga = (sg) => sg.label_fr.replace(/^La /, 'la ');
  const qCadran = Number(params0.get('cadran')) || 0;
  let plateNo = clamp(qCadran - 1, 0, Math.max(0, PLATES.length - 1));
  let overview = !qCadran; // grand cadran demandé (sinon le cadran plateNo)
  let platesOn = false; // un seul cadran parmi plusieurs (recalculé à chaque appel de ctx.visible())
  let ovOn = false; // le grand cadran est affiché (idem)
  const presentPlates = (list) => [...new Set(list.map(plateOf).filter((k) => k >= 0))].sort((a, b) => a - b);
  ctx.viewFilter = (list) => {
    platesOn = false; ovOn = false;
    if (PLATES.length < 2 || ctx.state.mode !== 'chronologie' || ctx.isFiltered()) return null;
    const present = presentPlates(list);
    if (present.length < 2) return null;
    if (overview) { ovOn = true; return null; }
    if (!present.includes(plateNo)) plateNo = present[0];
    platesOn = true;
    return (w) => plateOf(w) === plateNo;
  };

  // -- couches (toutes décoratives, sauf les boutons de rotation, hors de la frise) ------------
  const plate = s('svg', { class: 'astro-plate frise-deco', 'aria-hidden': 'true', focusable: 'false' });
  frise.prepend(plate);
  const rete = s('g', { class: 'astro-rete' }, svg); // tourne avec le fil (transform du <svg>)
  const thread = createThread(svg, { treatment: 'rim' });
  // liseré du fil dans la couleur de chaque phase (code couleur), sous le fil : on voit où la phase change
  const bands = s('g', { class: 'astro-threadphases' });
  svg.insertBefore(bands, svg.querySelector('.thread__main'));
  const stars = s('g', { class: 'astro-stars' }, svg);
  const index = s('svg', { class: 'astro-index frise-deco', 'aria-hidden': 'true', focusable: 'false' });
  svg.after(index);
  const deco = (cls) => { const d = h('div', `${cls} frise-deco`); d.setAttribute('aria-hidden', 'true'); frise.insertBefore(d, ol); return d; };
  const phaseLayer = deco('astro-phases');
  const hub = deco('astro-hub');
  // téléphone : l'affiche d'abord (TMDB, sinon affiche provisoire), le titre à sa droite
  const affCache = new Map(); // une affiche par œuvre, réutilisée d'un tour de cadran à l'autre
  const affiche = (w) => { let e = affCache.get(w.id); if (!e) { e = afficheEl(w); affCache.set(w.id, e); } return e; };
  const affSlot = (w, cls, parent) => {
    const sl = h('span', `astro-aff__slot astro-aff__slot--${cls}`, null, parent);
    if (w && w.kind !== 'phase') sl.append(affiche(w));
    return sl;
  };
  const cart = deco('astro-side astro-cart');
  cart.removeAttribute('aria-hidden'); // panneau Cadran lisible : il porte aussi la barre « Cadran » (boutons)

  const nav = h('div', 'astro-nav');
  nav.setAttribute('role', 'group');
  nav.setAttribute('aria-label', 'Rotation du cadran');
  const navBtn = (glyph, text, glyphFirst) => {
    const b = h('button', 'astro-nav__btn', null, nav);
    b.type = 'button';
    const g = h('span', 'astro-nav__g', glyph);
    g.setAttribute('aria-hidden', 'true');
    const t = h('span', 'astro-nav__txt', text);
    if (glyphFirst) b.append(g, t); else b.append(t, g);
    b.txt = t;
    return b;
  };
  const prevBtn = navBtn('◀', 'Œuvre précédente', true);
  prevBtn.classList.add('astro-nav__btn--prev');
  const count = h('p', 'astro-nav__count', null, nav); // rang gravé (mobile), redondant avec les annonces
  count.setAttribute('aria-hidden', 'true');
  const countN = h('span', 'astro-nav__n', null, count);
  const countO = h('span', 'astro-nav__o', null, count);
  const nextBtn = navBtn('▶', 'Œuvre suivante', false);
  nextBtn.classList.add('astro-nav__btn--next');
  frise.after(nav);

  // barre « Cadran » (Chronologie, sans filtre, dès deux cadrans) : le grand cadran, puis un bouton par
  // cadran ; au-dessus du cadran, ou dans le panneau Cadran sur grand écran
  const plateBar = h('div', 'astro-plates');
  plateBar.setAttribute('role', 'group');
  plateBar.setAttribute('aria-labelledby', 'astro-plates-l');
  const plateLab = h('span', 'astro-plates__l', 'Cadran', plateBar);
  plateLab.id = 'astro-plates-l';
  const ovBtn = h('button', 'astro-plates__b astro-plates__b--all', null, plateBar);
  ovBtn.type = 'button';
  h('span', 'astro-plates__n', 'Tous les cadrans', ovBtn);
  h('span', 'astro-plates__n astro-plates__short', 'Tous', ovBtn); // téléphone
  ovBtn.addEventListener('click', () => { if (!ovOn) openOverview(); });
  const yearsTxt = (list, sep = '–') => {
    const ys = list.map(yearOf).filter(Boolean).map(Number);
    if (!ys.length) return '';
    return Math.min(...ys) === Math.max(...ys) ? String(ys[0]) : `${Math.min(...ys)}${sep}${Math.max(...ys)}`;
  };
  const plateBtns = PLATES.map((pl, i) => {
    const b = h('button', 'astro-plates__b', null, plateBar);
    b.type = 'button';
    h('span', 'astro-plates__n', plateName(i), b);
    const ys = yearsTxt(ctx.data.works.filter((w) => plateOf(w) === i));
    if (ys) { h('span', 'visually-hidden', ', ', b); h('span', 'astro-plates__y', ys, b); }
    h('span', 'visually-hidden', ', ', b);
    h('span', 'astro-plates__s', plateSagas(i), b); // sagas du cadran : lues partout, affichées sur grand écran
    b.addEventListener('click', () => { if (ovOn || i !== plateNo) goPlate(i); });
    return b;
  });
  plateBar.hidden = true;
  const rom = (n) => ROMAN[n] || toRoman(n);
  const plateWorks = (i) => ctx.visible({ all: true }).filter((w) => plateOf(w) === i);
  // phases d'un cadran : de la première phase de sa première saga à la dernière de sa dernière saga
  const platePhases = (i) => {
    const ps = PLATES[i].flatMap((sg) => sg.phases || []);
    if (!ps.length) return '';
    return ps.length === 1 ? `Phase ${rom(ps[0])}` : `Phases ${rom(ps[0])} à ${rom(ps[ps.length - 1])}`;
  };
  // intertitre à l'arrivée dans un cadran (shell.js : showIntertitle)
  const plateSpec = (i) => ({ saga: PLATES[i].length === 1 ? PLATES[i][0].id : undefined, k: plateSagas(i), n: plateName(i),
    y: [platePhases(i), yearsTxt(plateWorks(i), ' – ')].filter(Boolean).join(' · ') });
  function setCadranUrl() {
    const u = new URL(location.href);
    if (overview) u.searchParams.delete('cadran'); else u.searchParams.set('cadran', String(plateNo + 1));
    history.replaceState(history.state, '', u);
  }
  // ouvre un cadran : depuis le grand cadran (plongée depuis son petit cadran), depuis la barre « Cadran »
  // ou au bout du cadran voisin (◀ ▶ : le cadran tourne d'un cran)
  function goPlate(i, { last = false } = {}) {
    if (!PLATES[i]) return;
    const wasOv = ovOn; const prevNo = plateNo;
    const act = document.activeElement;
    const hadFocus = !!act && (ovList.contains(act) || ol.contains(act));
    const apply = () => {
      overview = false; plateNo = i; ovPlate = i;
      setCadranUrl();
      const list = ctx.visible();
      const keep = wasOv && list.some((w) => w.id === ctx.state.focusId); // l'œuvre au centre est de ce cadran
      if (list.length && !keep) ctx.state.focusId = (last ? list[list.length - 1] : list[0]).id;
      ctx.update();
      if (hadFocus && P.has(ctx.state.focusId)) ctx.focusWork(ctx.state.focusId, { scroll: false, tint: false });
    };
    const go = ctx.sceneTransition || ((k, f) => f(false));
    if (wasOv) go('enter', apply, { from: () => ovPoint(i), title: plateSpec(i) });
    else if (prevNo !== i) go('step', apply, { dir: i > prevNo ? 1 : -1, title: plateSpec(i) });
    else apply();
    ctx.announce(`${plateName(i)} : ${PLATES[i].map(lowSaga).join(', ')} ; ${plural(plateWorks(i).length, 'œuvre', 'œuvres')}.`);
  }
  function openOverview() {
    if (ovOn) return;
    const k = plateNo;
    const act = document.activeElement;
    const fromList = !!act && ol.contains(act);
    const apply = () => {
      overview = true; ovPlate = k;
      setCadranUrl();
      ctx.update();
      if (fromList && ovItems[ovJ]) ovItems[ovJ].btn.focus({ preventScroll: true });
    };
    const go = ctx.sceneTransition || ((kind, f) => f(false));
    const n = presentPlates(ctx.visible({ all: true })).length;
    go('exit', apply, { to: () => ovPoint(k), title: { k: 'Grand cadran', n: 'Tous les cadrans', y: `${plural(n, 'cadran', 'cadrans')} · ${plural(ctx.visible({ all: true }).length, 'œuvre', 'œuvres')}` } });
    ctx.announce(`Grand cadran : ${plural(n, 'cadran', 'cadrans')}. Choisissez-en un pour l’ouvrir.`);
  }
  function adjacentPlate(dir) {
    if (!platesOn) return null;
    const present = presentPlates(ctx.visible({ all: true }));
    const n = present[present.indexOf(plateNo) + dir];
    return n === undefined ? null : n;
  }
  // renvoie true si la barre a changé de place ou de visibilité (la frise doit alors se remesurer)
  function syncPlateBar() {
    const was = [plateBar.hidden, plateBar.parentElement];
    plateBar.hidden = !(platesOn || ovOn);
    if (!plateBar.hidden) {
      const present = presentPlates(ctx.visible({ all: true }));
      plateBtns.forEach((b, i) => { b.hidden = !present.includes(i); b.setAttribute('aria-pressed', String(platesOn && i === plateNo)); });
      ovBtn.setAttribute('aria-pressed', String(ovOn));
      const host = G && G.layout === 'wide' ? cart : null;
      if (host) { if (plateBar.parentElement !== host) host.append(plateBar); } else if (plateBar.nextElementSibling !== frise) frise.before(plateBar);
    }
    return was[0] !== plateBar.hidden || was[1] !== plateBar.parentElement;
  }

  // -- grand cadran : les cadrans en orbite (dessin aria-hidden, un bouton par cadran) ---------------
  const ovSvg = s('svg', { class: 'astro-ov frise-deco', 'aria-hidden': 'true', focusable: 'false' });
  frise.insertBefore(ovSvg, ol);
  const ovHub = deco('astro-ovhub'); // le cadran choisi : au centre, au-dessus sur téléphone (redit par les boutons)
  const ovList = h('ul', 'astro-ovlist');
  ovList.setAttribute('aria-label', 'Cadrans');
  frise.insertBefore(ovList, ol);
  let O = null; // géométrie du grand cadran : { cx, cy, R, rim }
  let ovItems = []; // un par cadran présent : { k, list, g, btn, p }
  let ovJ = 0; // cadran choisi (rang dans ovItems) : ◀ ▶, flèches, focus
  let ovPlate = qCadran ? plateNo : null; // cadran à choisir au prochain affichage (null : celui de la dernière sortie)
  let ovFc = 0; let ovRot = null; let ovRaf = 0; // rang (continu) du cadran en haut, rotation de l'orbite
  function ovGeometry() {
    if (!G.mobile) return { cx: G.cx, cy: G.cy, R: G.R, rim: 28 };
    // téléphone : le grand cadran en entier, le cadran choisi décrit au-dessus
    const R = Math.round(clamp(Math.min(G.W / 2 - 30, (G.H - 280) / 2), 110, 260));
    return { cx: G.cx, cy: R + 22 + 92, R, rim: 22 };
  }
  function ovPrepare() {
    O = ovGeometry();
    if (G.mobile) G.H = Math.round(O.cy + O.R + O.rim + 96); // place des boutons ◀ ▶ sous le cadran
  }
  function ovPoint(i) {
    const it = ovItems.find((x) => x.k === i);
    return it && it.p ? { x: it.p.x, y: it.p.y } : null;
  }
  // places des petits cadrans (centre x, y et rayon r, dans la frise) : le cadran choisi en haut, grand et
  // près du centre ; les autres plus petits, sur une orbite plus large
  function ovSlots() {
    const K = ovItems.length; const { R } = O;
    const big = K <= 4 ? R * 0.4 : R * 0.34; const dBig = R * 0.5;
    const dSmall = R * 0.64;
    const small = K > 1 ? clamp(Math.min(R * 0.26, dSmall * Math.sin(Math.PI / K) - R * 0.03), R * 0.12, R * 0.26) : big;
    return ovItems.map((it, k) => {
      let u = (((k - ovFc) % K) + K) % K;
      if (u > K / 2) u -= K;
      const a = TOP + (u * TAU) / K;
      const near = clamp(1 - Math.abs(u), 0, 1);
      const d = dSmall + (dBig - dSmall) * near;
      return { x: O.cx + d * Math.cos(a), y: O.cy + d * Math.sin(a), r: small + (big - small) * near };
    });
  }
  function clearOverview() {
    O = null; ovItems = []; ovRot = null;
    cancelAnimationFrame(ovRaf); ovRaf = 0;
    ovSvg.replaceChildren(); ovList.replaceChildren(); ovHub.replaceChildren();
  }
  // anneau (couronne) centré sur l'origine, pour les petits cadrans dessinés au rayon 100
  const ringPath = (rIn, rOut) => `M${fx(rOut)},0A${fx(rOut)},${fx(rOut)} 0 1 0 ${fx(-rOut)},0A${fx(rOut)},${fx(rOut)} 0 1 0 ${fx(rOut)},0Z`
    + `M${fx(rIn)},0A${fx(rIn)},${fx(rIn)} 0 1 1 ${fx(-rIn)},0A${fx(rIn)},${fx(rIn)} 0 1 1 ${fx(rIn)},0Z`;
  function buildOverview() {
    ovSvg.replaceChildren(); ovList.replaceChildren(); ovHub.replaceChildren();
    const all = ctx.visible({ all: true });
    ovItems = presentPlates(all).map((k) => ({ k, list: all.filter((w) => plateOf(w) === k) }));
    if (!ovItems.length) return;
    if (ovPlate === null) { // d'abord, le cadran de la dernière œuvre sortie
      const out = all.filter((w) => { const li = ctx.items.get(w.id); return li && li.dataset.status === 'released'; });
      ovPlate = out.length ? plateOf(out[out.length - 1]) : ovItems[0].k;
    }
    ovJ = Math.max(0, ovItems.findIndex((it) => it.k === ovPlate));
    if (!ovRot) ovFc = ovJ;
    const { cx, cy, R, rim } = O;
    // platine : disque, limbe gradué, nom gravé en bas (pas de repère : le cadran choisi est en haut)
    const ring = (r, cls) => s('circle', { cx, cy, r, class: cls }, ovSvg);
    ring(R + rim, 'astro-disc'); ring(R + rim, 'astro-hair astro-hair--ivory'); ring(R + rim * 0.36, 'astro-hair'); ring(R - 2, 'astro-hair astro-hair--faint');
    let dT = ''; let dM = '';
    for (let q = 0; q < 120; q += 1) {
      const a = (q / 120) * TAU; const r1 = R + rim * 0.36; const len = q % 10 ? (q % 5 ? 3.5 : 6) : 9;
      const seg = `M${fx(cx + r1 * Math.cos(a))},${fx(cy + r1 * Math.sin(a))}L${fx(cx + (r1 - len) * Math.cos(a))},${fx(cy + (r1 - len) * Math.sin(a))}`;
      if (q % 10) dT += seg; else dM += seg;
    }
    s('path', { d: dT, class: 'astro-tick' }, ovSvg);
    s('path', { d: dM, class: 'astro-tick astro-tick--major' }, ovSvg);
    const defs = s('defs', {}, ovSvg);
    const er = R + rim * 0.62;
    s('path', { id: 'astro-ov-engr', d: `M${fx(cx - er)},${fx(cy)}A${fx(er)},${fx(er)} 0 0 0 ${fx(cx + er)},${fx(cy)}` }, defs);
    const engr = s('text', { class: 'astro-ov__engr' }, ovSvg);
    const tp = s('textPath', { href: '#astro-ov-engr', startOffset: '50%', 'text-anchor': 'middle' }, engr);
    tp.textContent = `Tous les cadrans · ${plural(all.length, 'œuvre', 'œuvres')}`;
    ovItems.forEach((it, j) => {
      // petit cadran, dessiné au rayon 100 puis posé et mis à l'échelle (ovPlace)
      const g = s('g', { class: 'astro-ovdial' }, ovSvg);
      s('circle', { cx: 0, cy: 0, r: 100, class: 'astro-ovdial__disc' }, g);
      const n = it.list.length;
      const geo = { cx: 0, cy: 0, r0: 24, r1: 80, turns: Math.max(1, (n * 2.5) / 60), start: TOP, laneGap: 7 };
      // un anneau teinté par saga (du centre vers le bord), si les sagas se suivent d'un bloc (ordre de sortie)
      const runs = [];
      it.list.forEach((w, i) => {
        const id = w.saga && w.saga.v; const last = runs[runs.length - 1];
        if (last && last.id === id) last.b = i; else runs.push({ id, a: i, b: i });
      });
      if (new Set(runs.map((r) => r.id)).size === runs.length) {
        const rAt = (i) => 24 + 56 * (n > 1 ? i / (n - 1) : 0);
        runs.forEach((run, k) => {
          const rIn = k ? rAt((runs[k - 1].b + run.a) / 2) : 12;
          const rOut = k < runs.length - 1 ? rAt((run.b + runs[k + 1].a) / 2) : 90;
          s('path', { d: ringPath(rIn, rOut), class: 'astro-ovdial__band', 'fill-rule': 'evenodd', 'data-saga': run.id || '' }, g);
          if (k) s('circle', { cx: 0, cy: 0, r: rIn, class: 'astro-ovdial__sep' }, g);
        });
      }
      s('circle', { cx: 0, cy: 0, r: 90, class: 'astro-ovdial__hair' }, g);
      let td = '';
      for (let q = 0; q < 60; q += 1) {
        const a = (q / 60) * TAU; const l = q % 5 ? 4 : 9;
        td += `M${fx(90 * Math.cos(a))},${fx(90 * Math.sin(a))}L${fx((90 - l) * Math.cos(a))},${fx((90 - l) * Math.sin(a))}`;
      }
      s('path', { d: td, class: 'astro-ovdial__tick' }, g);
      const pts = [];
      for (let q = 0; q <= 160; q += 1) { const p = spiral(q / 160, 0, geo); pts.push(`${fx(p.x)},${fx(p.y)}`); }
      s('path', { d: `M${pts.join('L')}`, class: 'astro-ovdial__threadrim' }, g);
      s('path', { d: `M${pts.join('L')}`, class: 'astro-ovdial__thread' }, g);
      it.list.forEach((w, i) => {
        const p = spiral(n > 1 ? i / (n - 1) : 0, ctx.laneOf(w), geo);
        const li = ctx.items.get(w.id);
        const up = !!li && li.dataset.status !== 'released';
        s('circle', { cx: p.x, cy: p.y, r: w.kind === 'film' ? 6 : 5.2, class: `astro-ovdial__dot astro-ovdial__dot--${w.kind}${up ? ' is-upcoming' : ''}`, 'data-phase': String(phaseOf(w) || '') }, g);
      });
      s('circle', { cx: 0, cy: 0, r: 100, class: 'astro-ovdial__rim' }, g);
      it.g = g;
      // bouton (le seul élément interactif) : nom du cadran, années, nombre d'œuvres ; ses sagas, lues
      const li = h('li', 'astro-ovlist__i', null, ovList);
      const b = h('button', 'astro-ovb', null, li);
      b.type = 'button';
      h('span', 'visually-hidden', 'Ouvrir : ', b);
      const lab = h('span', 'astro-ovb__lab', null, b);
      h('span', 'astro-ovb__n', plateName(it.k), lab);
      h('span', 'visually-hidden', ', ', lab);
      h('span', 'astro-ovb__y', [yearsTxt(it.list), plural(n, 'œuvre', 'œuvres')].filter(Boolean).join(' · '), lab);
      h('span', 'visually-hidden', `, ${PLATES[it.k].map((x) => x.label_fr).join(', ')}, ${platePhases(it.k)}`, b);
      b.addEventListener('click', () => goPlate(it.k));
      b.addEventListener('focus', () => { if (ovJ !== j) ovSelect(j); });
      b.addEventListener('pointerenter', () => g.classList.add('is-hover'));
      b.addEventListener('pointerleave', () => g.classList.remove('is-hover'));
      it.btn = b;
    });
  }
  // place les petits cadrans (à chaque image pendant une rotation de l'orbite)
  function ovPlace() {
    if (!O || !ovItems.length) return;
    const sl = ovSlots();
    ovItems.forEach((it, j) => {
      const p = sl[j];
      it.p = p;
      it.g.setAttribute('transform', `translate(${fx(p.x)} ${fx(p.y)}) scale(${(p.r / 100).toFixed(4)})`);
      it.g.classList.toggle('is-on', j === ovJ);
      it.btn.classList.toggle('is-on', j === ovJ);
      it.btn.style.setProperty('--ox', `${fx(p.x - p.r)}px`);
      it.btn.style.setProperty('--oy', `${fx(p.y - p.r)}px`);
      it.btn.style.setProperty('--od', `${fx(2 * p.r)}px`);
      it.btn.classList.toggle('is-small', p.r < 112);
      it.btn.classList.toggle('is-tiny', p.r < 84); // le nom seul (les années sont dans la barre « Cadran »)
    });
    // description du cadran choisi : au centre, ou au-dessus du grand cadran sur téléphone
    const K = ovItems.length;
    const hy = G.mobile ? 50 : O.cy + O.R * 0.14;
    ovHub.style.setProperty('--ovx', `${fx(O.cx)}px`);
    ovHub.style.setProperty('--ovy', `${fx(hy)}px`);
    ovHub.style.setProperty('--ovw', `${fx(G.mobile ? G.W - 32 : O.R * (K === 2 ? 0.9 : 0.7))}px`);
    ovHub.classList.toggle('is-crowded', K > 2);
  }
  function ovTick() {
    if (ovRaf) return;
    const f = (now) => {
      ovRaf = 0;
      if (!ovRot) return;
      const k = clamp((now - ovRot.t0) / ovRot.dur, 0, 1);
      ovFc = ovRot.from + (ovRot.to - ovRot.from) * ease(k);
      ovPlace();
      if (k < 1) ovRaf = requestAnimationFrame(f); else ovRot = null;
    };
    ovRaf = requestAnimationFrame(f);
  }
  function ovFillHub() {
    ovHub.replaceChildren();
    const it = ovItems[ovJ];
    if (!it) return;
    // phases · années (la période ne se coupe jamais) [· nombre d'œuvres, sur téléphone]
    const facts = (more) => {
      const pp = h('p', 'astro-ovhub__p', null, ovHub);
      const ph = platePhases(it.k); const ys = yearsTxt(it.list, ' – ');
      if (ph) pp.append(ph);
      if (ys) { if (ph) pp.append(' · '); h('span', 'astro-nw', ys, pp); }
      if (more) pp.append(` · ${more}`);
    };
    h('p', 'astro-ovhub__k', plateName(it.k), ovHub);
    h('p', 'astro-ovhub__t', plateSagas(it.k), ovHub);
    if (G.mobile) facts(plural(it.list.length, 'œuvre', 'œuvres'));
    else { facts(''); h('p', 'astro-ovhub__p', plural(it.list.length, 'œuvre', 'œuvres'), ovHub); }
    if (!G.mobile && ovItems.length <= 2) h('p', 'astro-ovhub__hint', 'Clic ou Entrée : ouvrir ce cadran', ovHub);
  }
  // choisit un cadran dans le grand cadran (◀ ▶, flèches, focus) : l'orbite tourne pour l'amener en haut
  function ovSelect(j, { animate = true, say = false, focus = false } = {}) {
    const K = ovItems.length;
    if (!K) return;
    const q = ((j % K) + K) % K;
    ovJ = q; ovPlate = ovItems[q].k;
    ovItems.forEach((it, x) => { it.btn.tabIndex = x === q ? 0 : -1; });
    if (focus) ovItems[q].btn.focus({ preventScroll: true });
    let delta = (((q - ovFc) % K) + K) % K;
    if (delta > K / 2) delta -= K;
    const to = ovFc + delta;
    if (!animate || ctx.reducedMotion() || Math.abs(delta) < 1e-3) { ovFc = to; ovRot = null; ovPlace(); } else { ovRot = { from: ovFc, to, t0: performance.now(), dur: 560 }; ovTick(); }
    ovFillHub(); updateNav(); updateCount();
    if (say) {
      const it = ovItems[q];
      ctx.announce(`${plateName(it.k)} : ${PLATES[it.k].map((x) => x.label_fr).join(', ')} ; ${[platePhases(it.k), yearsTxt(it.list, ' à ')].filter(Boolean).join(', ')}, ${plural(it.list.length, 'œuvre', 'œuvres')}. ${q + 1} sur ${K}.`);
    }
  }
  ovList.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key; let j = null;
    if (k === 'ArrowRight' || k === 'ArrowDown') j = ovJ + 1;
    else if (k === 'ArrowLeft' || k === 'ArrowUp') j = ovJ - 1;
    else if (k === 'Home') j = 0;
    else if (k === 'End') j = ovItems.length - 1;
    if (j === null) return;
    e.preventDefault();
    ovSelect(j, { focus: true });
  });

  // légende repliable : hors de la frise, car interactive
  const legend = h('details', 'astro-legend');
  h('summary', 'astro-legend__sum', 'Légende', legend);
  const legList = h('ul', 'astro-legend__list', null, legend);
  legend.append(ctx.colorKey({ title: false })); // code couleur des sagas et des phases

  // Deux colonnes autour du cadran, qui reste l'élément central (grand écran) :
  // - à gauche : panneau Cadran (ordre), cartes des phases (mode Phases), légende ;
  // - à droite : fiche du personnage (mode Personnages) et aperçu de la fiche de l'œuvre sous l'index.
  // Placées avant la frise dans le document : on lit le contexte avant la frise (et au-dessus sur mobile).
  const railL = h('div', 'astro-rail astro-rail--left');
  const railR = h('div', 'astro-rail astro-rail--right');
  frise.before(railL, railR);
  railL.append(cart);
  const phaseCards = document.querySelector('.c-phasecards');
  if (phaseCards) railL.append(phaseCards);
  railL.append(legend);
  const help = document.querySelector('.c-help');
  if (help) railL.append(help);
  const persos = document.getElementById('champ-personnage');
  if (persos) railR.append(persos);
  const persoCard = persos ? persos.querySelector('.c-perso-card') : null;
  const persoHead = persoCard ? persoCard.querySelector('.c-perso-card__head') : null;
  // mode Personnages, grand écran :
  // - cadre au-dessus du cadran : en-tête de la fiche (médaillon, nom, œuvres, alias) ;
  // - colonne de gauche : panneau Cadran (ordre) toujours en tête, recherche, puis la fiche
  //   (interprètes, phases, Archives) dans un bloc à part ; la colonne de droite garde l'aperçu.
  // Placé en tête de #contenu : le nom du personnage se lit avant les colonnes.
  // Ailleurs (tablette, téléphone), la fiche reste entière dans le bloc Personnages, sous la recherche.
  const charFrame = h('div', 'astro-charframe');
  main.prepend(charFrame);
  const isWide = () => wideMQ.matches && !mobileMQ.matches; // même règle que measure()
  function arrangeRails() {
    if (!persos || !persoCard) return;
    if (isWide()) {
      if (persos.previousElementSibling !== cart) cart.after(persos);
      if (persoCard.previousElementSibling !== persos) persos.after(persoCard);
      if (persoHead && persoHead.parentElement !== charFrame) charFrame.append(persoHead);
    } else {
      if (persos.parentElement !== railR) railR.prepend(persos);
      if (persoCard.parentElement !== persos) persos.append(persoCard);
      if (persoHead && persoHead.parentElement !== persoCard) persoCard.prepend(persoHead);
    }
    charFrame.hidden = !(isWide() && ctx.state.mode === 'personnages' && ctx.state.character && !isList());
  }
  const preview = createPreview({ taxonomy: tax, className: 'c-preview astro-preview', onOpen: (id, opener) => ctx.openArchive(id, opener) });
  railR.append(preview.el);
  // survol d'un point (grand écran, souris) : l'aperçu montre cette œuvre ; on revient ensuite à l'œuvre sous l'index
  let shownId = null;
  let hoverTimer = 0;
  ol.addEventListener('pointerover', (e) => {
    if (e.pointerType === 'touch' || !G || G.layout !== 'wide') return;
    const li = e.target.closest('.node');
    const w = li ? byId.get(li.dataset.id) : null;
    if (!w || w.kind === 'phase') return;
    clearTimeout(hoverTimer);
    if (w.id === shownId) return;
    shownId = w.id;
    preview.show(w, { label: w.id === current ? 'Aperçu de la fiche' : 'Aperçu de la fiche · au survol' });
  });
  ol.addEventListener('pointerout', (e) => {
    const to = e.relatedTarget && e.relatedTarget.closest ? e.relatedTarget.closest('.node') : null;
    if (to && ol.contains(to)) return;
    clearTimeout(hoverTimer);
    hoverTimer = setTimeout(() => {
      const w = byId.get(current);
      if (w && w.kind !== 'phase' && G && G.layout === 'wide') { if (shownId !== w.id) { shownId = w.id; preview.show(w); } } else { shownId = null; preview.hide(); }
    }, 200);
  });
  let legendInit = false;

  // consignes propres au cadran, dans l'aide commune (« Comment lire la frise ? »)
  function ringsHelp() {
    const span = (x) => (x && x.phases && x.phases.length ? ` (phases ${ROMAN[x.phases[0]]} à ${ROMAN[x.phases[x.phases.length - 1]]})` : '');
    if (tax.sagas.length < 2) return null;
    if (tax.sagas.length === 2) {
      const [a, b] = tax.sagas;
      return `En ordre de sortie et en mode Phases, l’anneau intérieur porte ${lowSaga(a)}${span(a)} et l’anneau extérieur ${lowSaga(b)}${span(b)}.`;
    }
    const rings = `un anneau par saga, du centre vers le bord : ${tax.sagas.map(lowSaga).join(', ')}`;
    if (PLATES.length < 2) return `En ordre de sortie et en mode Phases, ${rings}.`;
    return `En Chronologie, un cadran porte deux sagas, une par anneau ; au-delà, un nouveau cadran s’ajoute, et le grand cadran (« Tous les cadrans ») les réunit : choisissez-en un pour l’ouvrir, Échap pour revenir ; au bout d’un cadran, ◀ ▶ passent au suivant. En modes Phases et Personnages, un seul cadran, ${rings}.`;
  }
  let ringsLi = null;
  const helpList = document.querySelector('.c-help ul');
  if (helpList) {
    [
      'Le cadran tourne pour amener une œuvre sous le repère rouge : boutons ◀ ▶, flèches du clavier, molette au-dessus du cadran ou glisser horizontal ; + et − pour zoomer.',
      ringsHelp() ? { t: ringsHelp(), key: true, rings: true } : null,
      'Mode Phases : choisissez une phase pour y entrer ; au bout d’une phase, les boutons « Phase précédente » et « Phase suivante » mènent à la phase voisine ; Échap ou « Toutes » pour revenir à toutes les phases.',
      // anneaux, symboles : déjà dans la légende du grand écran (masqués là, utiles sur tablette et téléphone)
      { t: `Point plein : film ; point creux : série ; contour en tirets : à venir ou date à confirmer ; losange fuchsia, avec le nom de l’univers : autre univers ; cercle pointillé : place dans l’histoire à confirmer.`, key: true },
    ].filter(Boolean).forEach((x) => {
      const li = h('li', null, x.t || x, helpList);
      if (x.key) li.classList.add('c-help__key');
      if (x.rings) ringsLi = li;
    });
    const branchLi = [...helpList.children].find((li) => /branches fines/.test(li.textContent));
    if (branchLi) branchLi.classList.add('c-help__key');
    const pickLi = [...helpList.children].find((li) => /^Choisissez une œuvre/.test(li.textContent));
    if (pickLi) pickLi.textContent = 'Choisissez une œuvre pour ouvrir ses Archives ; Échap pour revenir.';
  }

  // barre d'outils mobile : le fondu de droite disparaît quand on est au bout du défilement
  const tools = document.querySelector('.c-tools');
  if (tools) {
    const endChk = () => tools.classList.toggle('is-end', tools.scrollLeft + tools.clientWidth >= tools.scrollWidth - 2);
    tools.addEventListener('scroll', endChk, { passive: true });
    window.addEventListener('resize', endChk);
    endChk();
  }

  // -- état -----------------------------------------------------------------------------------
  let G = null; // géométrie du dernier rendu
  let VIS = []; // œuvres visibles, ordre courant
  let P = new Map(); // id → { x, y (non tournés), ang, r, t, slot, i, lane, X, Y (à l'écran) }
  let runs = []; let sagaRuns = []; let labels = [];
  let current = null;
  let near = new Set();
  let phi = 0; let rot = null; let morph = null; let raf = 0; let drag = null;
  let lastChar = ctx.state.character; let lastMode = ctx.state.mode;
  let winEl = null; let ruleA = null; let ruleB = null;
  let engraved = []; // noms des sagas gravés en bas du cadran (fixes) : { r, w }

  // -- géométrie -------------------------------------------------------------------------------
  const mobileMQ = window.matchMedia('(max-width: 767px)');
  const wideMQ = window.matchMedia('(min-width: 1100px)');
  function measure(total) {
    const W = frise.clientWidth || main.clientWidth;
    const vh = window.innerHeight;
    const docTop = frise.getBoundingClientRect().top + window.scrollY;
    const zoomH = (zoomBar ? zoomBar.offsetHeight : 0) + ctx.bottomInset(); // téléphone : la barre d'onglets du bas
    let H = Math.round(vh - docTop - zoomH);
    if (mobileMQ.matches) { // même seuil que les styles (a.css)
      // tout tient au-dessus de la barre de zoom collante : carte, repère, arc, boutons ◀ ▶
      H = clamp(H, 360, 920);
      // arc régulier (au moins 46 px entre deux œuvres) et vide entre la dernière et la première
      // œuvre plus large que la fenêtre visible : l'œuvre 61 n'apparaît jamais à côté de l'œuvre 1
      let gap = 4; let R = 0;
      for (let k = 0; k < 3; k += 1) {
        R = Math.max(W * 1.2, (46 * (total + gap)) / TAU);
        const win = 2 * Math.asin(Math.min(1, (W / 2 + 22) / R));
        gap = Math.ceil(win / (TAU / (total + gap))) + 1;
      }
      R = Math.round(Math.max(W * 1.2, (46 * (total + gap)) / TAU));
      const lvl = ctx.zoom.level;
      const arc = clamp(H * 0.66, 200, 440); // l'arc remonte vers la carte : moins de vide entre les deux
      // hauteur gardée pour la carte, au-dessus du repère : l'affiche d'abord (sauf phases repliées)
      const posters = !(ctx.state.mode === 'phases' && !ctx.state.openPhase);
      const reserve = !posters ? (lvl >= 3 ? 270 : 170) : lvl < 3 ? 300 : 330;
      // sous le repère : arc, secteurs, boutons et rang gravé (masqué en N3 et sur écran très court,
      // où il figure dans la carte ou dans les annonces)
      const compact = H < 420;
      const low = H - (lvl >= 3 || compact ? 124 : 146);
      const yIdx = Math.round(Math.min(low, Math.max(H - arc + 64, 12 + reserve + 84)));
      return { W, H, vh, mobile: true, compact, layout: 'mobile', R, gap, cx: Math.round(W / 2), cy: yIdx + R, r0: R, r1: R, laneGap: 16, yIdx };
    }
    // grand écran : décidé par la fenêtre (les colonnes latérales sont positionnées par a.css au même seuil)
    const wide = wideMQ.matches;
    H = clamp(H, 560, 1000);
    if (wide) {
      // grand écran : trois colonnes 1 · 2 · 1 sur toute la largeur de la page (colonne gauche, cadran, colonne
      // droite), y compris en mode Personnages où la colonne droite est la fiche ; les deux côtés ont la même largeur.
      // Les boutons de rotation sont centrés dans les intervalles entre le cadran et les colonnes.
      const WT = main.clientWidth || W;
      const m = 24; const g = 64; // intervalle = place d'un bouton de rotation (52 px) et de son air
      const side = Math.floor((WT - 2 * m - 2 * g) / 4);
      const C = WT - 2 * m - 2 * g - 2 * side;
      // marge extérieure : couronne des rangs (R+10 → R+28), puis la moitié d'un bouton (26 px) avant l'intervalle
      const top = charFrame.hidden ? 0 : charFrame.offsetHeight + 16; // cadre du personnage au-dessus du cadran
      const R = Math.floor(Math.max(180, Math.min((H - top) / 2 - 40, C / 2 - 28 - 6 - 26 + g / 2)));
      const cy = Math.round(top + (H - top) / 2 + 8);
      return { W, H, vh, mobile: false, layout: 'wide', R, cx: Math.round(WT / 2), cy, r0: R * 0.5, r1: R - 40, laneGap: 18,
        side, navL: m + side + g / 2, navR: WT - m - side - g / 2 };
    }
    let R = Math.min(W / 2 - 44, (H - 130) / 2);
    R = Math.floor(Math.max(220, R));
    H = Math.min(H, Math.round(2 * R + 140));
    const cy = R + 48;
    return { W, H, vh, mobile: false, layout: 'tablet', R, cx: Math.round(W / 2), cy, r0: R * 0.5, r1: R - 40, laneGap: 18 };
  }

  const phaseOf = (w) => (w.phase ? w.phase.v : 0);
  function bez(pts, k) { // segment k du tracé lissé de thread.js (mêmes points de contrôle)
    const p0 = pts[k - 1] || pts[k]; const p1 = pts[k]; const p2 = pts[k + 1]; const p3 = pts[k + 2] || p2;
    return [p1, { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 }, { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 }, p2];
  }
  function half(b, second) { // de Casteljau à t = 0,5
    const m = (u, v) => ({ x: (u.x + v.x) / 2, y: (u.y + v.y) / 2 });
    const a1 = m(b[0], b[1]); const a2 = m(b[1], b[2]); const a3 = m(b[2], b[3]);
    const b1 = m(a1, a2); const b2 = m(a2, a3); const c = m(b1, b2);
    return second ? [c, b2, a3, b[3]] : [b[0], a1, b1, c];
  }
  function drawBands(pts) {
    bands.replaceChildren();
    if (pts.length < 2) return;
    let a = 0;
    for (let i = 1; i <= pts.length; i += 1) {
      const ph = (id) => phaseOf(byId.get(id) || {});
      if (i < pts.length && ph(pts[i].id) === ph(pts[a].id)) continue;
      const b = i - 1;
      const segs = [];
      if (a > 0) segs.push(half(bez(pts, a - 1), true));
      for (let k = a; k < b; k += 1) segs.push(bez(pts, k));
      if (b < pts.length - 1) segs.push(half(bez(pts, b), false));
      if (segs.length) {
        const f = (p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
        const d = `M${f(segs[0][0])}${segs.map((g) => ` C${f(g[1])} ${f(g[2])} ${f(g[3])}`).join('')}`;
        s('path', { d, class: 'astro-threadphase', 'data-phase': String(ph(pts[a].id) || '') }, bands);
      }
      a = i;
    }
  }
  function compute() {
    arrangeRails();
    const base = ctx.visible();
    VIS = base;
    // mode Phases : œuvres regroupées par secteur (une phase = un secteur), dans l'ordre courant
    if (ctx.state.mode === 'phases') {
      VIS = base.map((w, k) => ({ w, k })).sort((a, b) => (phaseOf(a.w) || 99) - (phaseOf(b.w) || 99) || a.k - b.k).map((x) => x.w);
    }
    const grouped = VIS.some((w, k) => w !== base[k]);
    const n = VIS.length;
    let changes = 0;
    VIS.forEach((w, i) => { if (i && phaseOf(w) !== phaseOf(VIS[i - 1])) changes += 1; });
    // mode Phases : un vide entre deux secteurs (les œuvres sont regroupées par phase)
    const gap = ctx.state.mode === 'phases' && changes ? Math.min(1.6, 12 / changes) : 0;
    const slot = []; let acc = 0;
    VIS.forEach((w, i) => { if (i && gap && phaseOf(w) !== phaseOf(VIS[i - 1])) acc += gap; slot.push(acc); acc += 1; });
    const total = Math.max(1, slot[n - 1] || 1);
    G = measure(total);
    G.total = total;
    G.grouped = grouped;
    // ordinateur : 2,5 tours pour 60 rangs (écart constant le long de la spirale) ; mobile : un cercle.
    // Peu d'œuvres (moins d'un tour : personnage, phase dépliée…) : réparties sur le tour sans que la
    // dernière revienne sur la première (trois œuvres : à 0°, 120° et 240°, et non en ligne verticale)
    G.turns = G.mobile ? total / (total + G.gap) : Math.max(total / (total + 1), (total * 2.5) / 60);
    G.sg = G.mobile ? 0 : (G.r1 - G.r0) / Math.max(1, G.turns); // écart entre deux spires
    G.rHub = G.mobile ? 0 : G.r0 - G.sg / 2 + 2;
    G.angOf = (sl) => TOP + (sl / total) * G.turns * TAU;
    G.rAt = (t) => G.r0 + (G.r1 - G.r0) * t;
    const geo = { cx: G.cx, cy: G.cy, r0: G.r0, r1: G.r1, turns: G.turns, start: TOP, laneGap: G.laneGap };
    G.geo = geo;
    P = new Map();
    VIS.forEach((w, i) => {
      const t = slot[i] / total;
      const lane = ctx.laneOf(w);
      const p = spiral(t, lane, geo);
      P.set(w.id, { id: w.id, w, i, t, slot: slot[i], lane, x: p.x, y: p.y, X: p.x, Y: p.y, ang: p.angle, r: Math.hypot(p.x - G.cx, p.y - G.cy) });
    });
    runs = runsOf(phaseOf);
    sagaRuns = runsOf((w) => (w.saga ? w.saga.v : ''));
  }
  function runsOf(key) {
    const out = [];
    VIS.forEach((w) => {
      const k = key(w); const p = P.get(w.id); const last = out[out.length - 1];
      if (last && last.key === k) { last.ids.push(w.id); last.b = p.slot; } else out.push({ key: k, ids: [w.id], a: p.slot, b: p.slot });
    });
    return out;
  }

  function applyVars() {
    frise.style.setProperty('height', `${G.H}px`);
    frise.dataset.layout = G.layout;
    root.classList.toggle('astro-wide', G.layout === 'wide'); // la légende s'affiche : l'aide ne la répète pas
    frise.classList.toggle('is-compact', !!G.compact);
    main.classList.toggle('astro-wide', G.layout === 'wide');
    if (G.layout === 'wide' && !legendInit) { legendInit = true; legend.open = true; } // légende visible d'emblée sur grand écran
    const px = (k, v) => main.style.setProperty(k, `${Math.round(v)}px`);
    px('--cx', G.cx); px('--cy', G.cy); px('--R', G.R); px('--fh', G.H); px('--astro-top', frise.offsetTop);
    px('--hubw', G.mobile ? 0 : G.rHub * 1.6);
    if (G.side) { px('--side', G.side); px('--nav-l', G.navL); px('--nav-r', G.navR); } // colonnes 1 · 2 · 1 (grand écran)
    px('--yidx', G.mobile ? G.yIdx : G.cy - G.R);
    svg.style.setProperty('transform-origin', `${G.cx}px ${G.cy}px`);
  }

  // -- tracés ----------------------------------------------------------------------------------
  const pt = (a, r) => [G.cx + r * Math.cos(a), G.cy + r * Math.sin(a)];
  const fp = (p) => `${fx(p[0])},${fx(p[1])}`;
  const radial = (a, r1, r2) => `M${fp(pt(a, r1))}L${fp(pt(a, r2))}`;
  const circle = (r, cls, parent) => s('circle', { cx: G.cx, cy: G.cy, r, class: cls }, parent);
  function annulus(rIn, rOut, cls, parent) {
    const { cx, cy } = G;
    const d = `M${fx(cx + rOut)},${fx(cy)}A${fx(rOut)},${fx(rOut)} 0 1 0 ${fx(cx - rOut)},${fx(cy)}A${fx(rOut)},${fx(rOut)} 0 1 0 ${fx(cx + rOut)},${fx(cy)}Z`
      + `M${fx(cx + rIn)},${fx(cy)}A${fx(rIn)},${fx(rIn)} 0 1 1 ${fx(cx - rIn)},${fx(cy)}A${fx(rIn)},${fx(rIn)} 0 1 1 ${fx(cx + rIn)},${fx(cy)}Z`;
    return s('path', { d, class: cls, 'fill-rule': 'evenodd' }, parent);
  }
  function ribbon(a0, a1, rf, half) {
    const n = Math.max(2, Math.ceil((a1 - a0) / 0.035));
    const outer = []; const inner = [];
    for (let k = 0; k <= n; k += 1) { const a = a0 + ((a1 - a0) * k) / n; const r = rf(a); outer.push(fp(pt(a, r + half))); inner.push(fp(pt(a, r - half))); }
    return `M${outer.join('L')}L${inner.reverse().join('L')}Z`;
  }
  function ticks(r, n, lens, cls, parent) {
    let d = ''; let dMajor = '';
    for (let k = 0; k < n; k += 1) {
      const a = (k / n) * TAU;
      const major = k % (n / 12) === 0;
      const len = major ? lens[2] : k % (n / 72) === 0 ? lens[1] : lens[0];
      if (major) dMajor += radial(a, r, r + len); else d += radial(a, r, r + len);
    }
    s('path', { d, class: cls }, parent);
    s('path', { d: dMajor, class: `${cls} astro-tick--major` }, parent);
  }

  // platine fixe : disque, limbe gradué (ne tourne pas)
  function buildPlate() {
    plate.replaceChildren();
    const { R } = G;
    if (G.mobile) {
      circle(R + 58, 'astro-disc', plate);
      circle(R + 56, 'astro-hair astro-hair--ivory', plate);
      circle(R + 38, 'astro-hair', plate);
      ticks(R + 38, 216, [-4, -7, -11], 'astro-tick', plate);
    } else {
      circle(R + 28, 'astro-disc', plate);
      circle(R + 28, 'astro-hair astro-hair--ivory', plate);
      circle(R + 10, 'astro-hair', plate);
      circle(R + 4, 'astro-hair astro-hair--faint', plate);
      circle(R - 10, 'astro-hair', plate);
      ticks(R - 10, 144, [4, 7, 11], 'astro-tick', plate);
    }
  }

  // araignée tournante : anneaux des sagas, graduations par œuvre, secteurs de phases
  function buildRete() {
    rete.replaceChildren();
    const { R } = G;
    let d = '';
    if (G.mobile) {
      [R - 16, R - 44, R - 72].forEach((r) => circle(r, 'astro-hair astro-hair--faint', rete));
      [R - 130, R - 230].forEach((r) => circle(r, 'astro-hair astro-hair--faint', rete));
      P.forEach((p) => { d += radial(p.ang, R + 19, R + 25); });
      s('path', { d, class: 'astro-tick astro-tick--work' }, rete);
      rankMarks(R + 19, R + 38, R + 47);
      runs.forEach((run) => {
        if (!run.key) return;
        s('path', { d: ribbon(G.angOf(run.a - 0.42), G.angOf(run.b + 0.42), () => R - 30, 2.4), class: `astro-band astro-band--${run.key % 2 ? 'a' : 'b'}`, 'data-phase': String(run.key) }, rete);
      });
      sagaRuns.forEach((run) => {
        if (!run.key) return;
        s('path', { d: ribbon(G.angOf(run.a - 0.42), G.angOf(run.b + 0.42), () => R - 58, 1.6), class: `astro-band astro-band--saga astro-band--${run.key}`, 'data-saga': String(run.key) }, rete);
      });
      return;
    }
    // un anneau par saga, du centre vers le bord, si les sagas se suivent d'un bloc dans leur ordre
    // (ordre de sortie, mode Phases) ; en ordre de l'histoire, elles s'entremêlent : les secteurs portent
    // alors la saga (N0)
    const sRuns = sagaRuns.filter((r) => r.key);
    const keys = sRuns.map((r) => r.key);
    const contiguous = keys.length >= 2 && new Set(keys).size === keys.length
      && keys.every((k, i) => !i || (sagaIdx.has(k) && sagaIdx.get(k) > sagaIdx.get(keys[i - 1])));
    G.rOut = Math.min(R - 18, G.r1 + G.sg / 2);
    G.rings = contiguous ? sRuns.map((run, k) => ({
      id: run.key,
      rIn: k ? G.rAt((sRuns[k - 1].b + run.a) / 2 / G.total) : G.rHub,
      rOut: k < sRuns.length - 1 ? G.rAt((run.b + sRuns[k + 1].a) / 2 / G.total) : G.rOut,
    })) : null;
    G.rSep = !!G.rings; // anneaux dessinés
    if (G.rings) G.rings.forEach((rg, k) => annulus(rg.rIn, rg.rOut, `astro-ring astro-ring--${k % 2 ? 'outer' : 'inner'}`, rete).setAttribute('data-saga', rg.id));
    circle(G.rHub, 'astro-hair', rete);
    circle(G.rOut, 'astro-hair astro-hair--faint', rete);
    // limite entre deux sagas : un sillon sombre et un filet clair en tirets (bien visible, demande de l'utilisateur)
    if (G.rings) G.rings.slice(1).forEach((rg) => { circle(rg.rIn, 'astro-sep-gap', rete); circle(rg.rIn, 'astro-sep', rete); });
    P.forEach((p) => { d += radial(p.ang, R - 19, R - 13); });
    s('path', { d, class: 'astro-tick astro-tick--work' }, rete);
    rankMarks(R - 19, R + 10, R + 19);
    rete.classList.toggle('no-rings', !G.rSep);
    const rf = (a) => G.rAt((a - TOP) / (G.turns * TAU)) + G.sg / 2;
    let dDiv = '';
    const seen = new Set();
    runs.forEach((run) => {
      if (!run.key) return;
      const a0 = G.angOf(run.a - 0.5); const a1 = G.angOf(run.b + 0.5);
      const w0 = byId.get(run.ids[0]);
      // même teinte pour tous les tronçons d'une phase ; un séparateur doré au début de chaque phase
      s('path', { d: ribbon(a0, a1, rf, 3.2), class: `astro-band astro-band--${run.key % 2 ? 'a' : 'b'}`, 'data-phase': String(run.key), 'data-saga': w0 && w0.saga ? w0.saga.v : '' }, rete);
      if (!seen.has(run.key)) { seen.add(run.key); dDiv += radial(a0, rf(a0) - G.sg * 0.62, rf(a0) + 5); }
    });
    s('path', { d: dDiv, class: 'astro-divider' }, rete);
  }

  // couronne des rangs : chiffres romains gravés au 1er rang puis de dix en dix (ordre courant)
  function rankMarks(r1, r2, rn) {
    let d = '';
    VIS.forEach((w, i) => {
      if (i && (i + 1) % 10) return;
      const p = P.get(w.id);
      d += radial(p.ang, r1, r2);
      const [x, y] = pt(p.ang, rn);
      const t = s('text', { x, y, class: 'astro-num', 'text-anchor': 'middle', 'dominant-baseline': 'central',
        transform: `rotate(${fx((p.ang * 180) / Math.PI + 90)} ${fx(x)} ${fx(y)})` }, rete);
      t.textContent = toRoman(i + 1);
    });
    s('path', { d, class: 'astro-tick astro-tick--ten' }, rete);
  }

  // constellation (mode Personnages) : arcs dorés entre les œuvres du personnage, dans l'ordre
  function buildStars() {
    stars.replaceChildren();
    const set = charSet();
    if (!set) return;
    const pts = VIS.filter((w) => set.has(w.id)).map((w) => P.get(w.id));
    let d = '';
    for (let k = 1; k < pts.length; k += 1) {
      const a = pts[k - 1]; const b = pts[k];
      const rr = Math.max(1, Math.hypot(b.x - a.x, b.y - a.y) * 0.78);
      d += `M${fx(a.x)},${fx(a.y)}A${fx(rr)},${fx(rr)} 0 0 1 ${fx(b.x)},${fx(b.y)}`;
    }
    if (d) s('path', { d, class: 'astro-arc' }, stars);
  }

  // index fixe : repère doré, alidade, fenêtre autour de l'œuvre courante, noms des sagas gravés
  function buildIndex() {
    index.replaceChildren();
    engraved = [];
    const { cx, cy, R } = G;
    const tip = G.mobile ? cy - R - 62 : cy - R - 30;
    s('path', { d: `M${fx(cx - 8)},${fx(tip - 14)}L${fx(cx + 8)},${fx(tip - 14)}L${fx(cx)},${fx(tip)}Z`, class: 'astro-pointer' }, index);
    ruleA = s('line', { x1: cx, y1: tip, x2: cx, y2: tip + 10, class: 'astro-rule' }, index);
    ruleB = G.mobile ? null : s('line', { x1: cx, y1: cy, x2: cx, y2: cy - G.rHub, class: 'astro-rule astro-rule--in' }, index);
    winEl = s('circle', { cx, cy: cy - R, r: 18, class: 'astro-window' }, index);
    if (G.mobile) return;
    const defs = s('defs', {}, index);
    const sagaText = (id, r, saga, cls) => {
      if (!saga) return;
      s('path', { id, d: `M${fx(cx - r)},${fx(cy)}A${fx(r)},${fx(r)} 0 0 0 ${fx(cx + r)},${fx(cy)}` }, defs);
      const t = s('text', { class: `astro-saga ${cls}`, 'data-saga': saga.id }, index);
      const tp = s('textPath', { href: `#${id}`, startOffset: '50%', 'text-anchor': 'middle' }, t);
      tp.textContent = saga.label_fr;
      let w = 0;
      try { w = t.getComputedTextLength(); } catch (err) { w = saga.label_fr.length * 9; }
      engraved.push({ r, w: w || saga.label_fr.length * 9 });
    };
    if (G.rings) {
      // en bas du cadran, dans un intervalle libre entre deux spires (au plus près du milieu de
      // chaque anneau) : les noms ne recouvrent ni le fil ni les œuvres
      const gaps = [];
      for (let k = 0; (0.5 + k) / G.turns <= 1; k += 1) {
        const b = G.rAt((0.5 + k) / G.turns);
        if (!k) gaps.push(b - G.sg / 2);
        if ((1.5 + k) / G.turns <= 1) gaps.push(b + G.sg / 2);
      }
      const pick = (lo, hi, fallback) => {
        const mid = (lo + hi) / 2;
        const ok = gaps.filter((g) => g > lo && g < hi).sort((x, y) => Math.abs(x - mid) - Math.abs(y - mid));
        return ok.length ? ok[0] + 4 : fallback;
      };
      G.rings.forEach((rg, k) => sagaText(`astro-saga-${k}`, pick(rg.rIn + 8, rg.rOut - 2, rg.rOut - 3), sagaById(rg.id), k ? 'astro-saga--outer' : 'astro-saga--inner'));
      // spires serrées (beaucoup d'œuvres, version « un anneau par saga ») : noms plus petits, tenus
      // dans l'intervalle entre deux spires
      if (G.sg < 38) index.querySelectorAll('.astro-saga').forEach((t) => t.style.setProperty('font-size', `${Math.max(8, Math.round(G.sg * 0.36))}px`));
    }
  }

  // libellés des secteurs (HTML, toujours lisibles : tangents mais jamais à l'envers)
  function buildLabels() {
    phaseLayer.replaceChildren();
    labels = [];
    const biggest = new Map();
    runs.forEach((r) => { if (!biggest.has(r.key) || biggest.get(r.key).ids.length < r.ids.length) biggest.set(r.key, r); });
    const totalOf = (k) => VIS.filter((w) => phaseOf(w) === k).length;
    const add = (run, kind) => {
      const el = h('span', `astro-ph astro-ph--${kind}`, null, phaseLayer);
      if (kind === 'phase') {
        h('span', 'astro-ph__name', `Phase ${ROMAN[run.key] || run.key}`, el);
        h('span', 'astro-ph__n', ` · ${plural(totalOf(run.key), 'œuvre', 'œuvres')}`, el);
        el.dataset.phase = String(run.key);
      } else {
        const sg = tax.sagas.find((x) => x.id === run.key);
        el.textContent = sg ? sg.label_fr : '';
      }
      labels.push({ el, kind, a0: G.angOf(run.a - 0.5), a1: G.angOf(run.b + 0.5), mid: (run.a + run.b) / 2, n: run.ids.length, shown: true, off: false });
    };
    // un seul libellé par phase (sur son plus grand tronçon), avec le total de la phase ; mode Phases,
    // phases repliées : chaque point est déjà une phase, nommée à côté de lui (pas de libellé redondant)
    const folded = VIS.some((x) => x.kind === 'phase');
    if (!folded) runs.forEach((r) => { if (r.key && biggest.get(r.key) === r) add(r, 'phase'); });
    if (G.mobile) sagaRuns.forEach((r) => { if (r.key) add(r, 'saga'); });
    else if (!G.rSep && ctx.zoom.level === 0) {
      // N0 sans anneaux (ordre de l'histoire) : le nom de chaque saga sur son plus grand tronçon
      const big = new Map();
      sagaRuns.forEach((r) => { if (r.key && (!big.has(r.key) || big.get(r.key).ids.length < r.ids.length)) big.set(r.key, r); });
      big.forEach((r) => add(r, 'saga'));
    }
    // largeur lue une fois (sans transformation) ; sur ordinateur, les positions sont rigides :
    // une étiquette qui en chevaucherait une plus importante (plus grand secteur) est masquée
    labels.forEach((l) => { l.w = l.el.offsetWidth; l.r = G.mobile ? G.R - (l.kind === 'saga' ? 58 : 30) : G.rAt(l.mid / G.total) + G.sg / 2; });
    if (G.mobile) return;
    const kept = [];
    [...labels].sort((x, y) => y.n - x.n || x.mid - y.mid).forEach((l) => {
      const a = G.angOf(l.mid);
      const hit = kept.some((k) => Math.abs(k.r - l.r) < 18
        && Math.abs(wrapPi(G.angOf(k.mid) - a)) * ((k.r + l.r) / 2) < (k.w + l.w) / 2 + 10);
      if (hit) { l.off = true; l.el.hidden = true; l.shown = false; } else kept.push(l);
    });
  }
  function placeLabels() {
    const win = G.mobile ? Math.asin(Math.min(1, (G.W / 2 - 24) / G.R)) : 0;
    labels.forEach((l) => {
      if (l.off) return;
      let a;
      if (G.mobile) {
        // sur l'arc visible seulement, au milieu de la partie visible du secteur, et seulement si
        // l'étiquette y tient entière (deux secteurs voisins ne se chevauchent donc jamais)
        const half = (l.w / 2 + 8) / l.r;
        const rel0 = wrapPi(l.a0 + phi - TOP); const rel1 = rel0 + (l.a1 - l.a0);
        let best = null;
        [0, -TAU, TAU].forEach((sh) => { const lo = Math.max(rel0 + sh, -win); const hi = Math.min(rel1 + sh, win); if (hi - lo >= 2 * half) best = (lo + hi) / 2; });
        if (best === null) { if (l.shown) { l.el.hidden = true; l.shown = false; } return; }
        a = TOP + best;
      } else {
        a = G.angOf(l.mid) + phi;
        // N2–N3 : la zone de l'index appartient aux titres des œuvres voisines
        if (near.size && Math.abs(wrapPi(a - TOP)) < 0.8) {
          if (l.shown) { l.el.hidden = true; l.shown = false; }
          return;
        }
        // pas d'étiquette sur les noms des sagas gravés en bas : elle s'efface le temps du passage
        const d = Math.abs(wrapPi(a - Math.PI / 2));
        if (engraved.some((e) => Math.abs(e.r - l.r) < 16 && d * l.r < (e.w + l.w) / 2 + 8)) {
          if (l.shown) { l.el.hidden = true; l.shown = false; }
          return;
        }
      }
      if (!l.shown) { l.el.hidden = false; l.shown = true; }
      let ra = wrapPi(a + Math.PI / 2);
      if (ra > Math.PI / 2) ra -= Math.PI; else if (ra <= -Math.PI / 2) ra += Math.PI;
      l.el.style.setProperty('--px', `${fx(G.cx + l.r * Math.cos(a))}px`);
      l.el.style.setProperty('--py', `${fx(G.cy + l.r * Math.sin(a))}px`);
      l.el.style.setProperty('--pr', `${ra.toFixed(3)}rad`);
    });
  }

  function placeIndex() {
    const p = P.get(current);
    if (!p || !winEl) return;
    const y = G.cy - p.r;
    winEl.setAttribute('cy', fx(y));
    if (ruleA) ruleA.setAttribute('y2', fx(Math.max(+ruleA.getAttribute('y1'), y - 20)));
    if (ruleB) ruleB.setAttribute('y1', fx(Math.min(G.cy - G.rHub, y + 20)));
  }

  // -- placement des œuvres (à chaque image pendant une rotation) ------------------------------
  function place(mk = 1) {
    const c = Math.cos(phi); const sn = Math.sin(phi);
    const k = morph ? ease(mk) : 1;
    const sides = { l: [], r: [] };
    P.forEach((p, id) => {
      let { x, y } = p;
      if (morph) { const o = morph.from.get(id); if (o) { x = o.x + (x - o.x) * k; y = o.y + (y - o.y) * k; } }
      const dx = x - G.cx; const dy = y - G.cy;
      const X = G.cx + dx * c - dy * sn; const Y = G.cy + dx * sn + dy * c;
      p.X = X; p.Y = Y;
      const li = ctx.items.get(id);
      li.style.setProperty('--x', `${fx(X - 22)}px`);
      li.style.setProperty('--y', `${fx(Y - 22)}px`);
      if (!G.mobile) {
        const side = id === current ? 't' : X < G.cx - 1 ? 'l' : 'r';
        if (li.dataset.side !== side) li.dataset.side = side;
        if (near.has(id) && side !== 't') sides[side].push(p);
      }
    });
    if (!G.mobile) {
      ['l', 'r'].forEach((sd) => {
        let last = -Infinity; let lastH = 0;
        sides[sd].sort((a, b) => a.Y - b.Y).forEach((p) => {
          const hh = p.lh || 20;
          const y = Math.max(p.Y, last + (lastH + hh) / 2 + 3); last = y; lastH = hh;
          ctx.items.get(p.id).style.setProperty('--ly', `${fx(y - p.Y)}px`);
        });
      });
    }
    svg.style.setProperty('transform', `rotate(${phi.toFixed(4)}rad)`);
    ctx.skyCamera(phi * 160, window.scrollY); // le ciel glisse avec la rotation du cadran (parallaxe)
    placeLabels();
    placeIndex();
  }

  function schedule() { if (!raf) raf = requestAnimationFrame(frame); }
  function frame(now) {
    raf = 0;
    let more = false; let mk = 1;
    if (rot) {
      const k = clamp((now - rot.t0) / rot.dur, 0, 1);
      phi = rot.from + (rot.to - rot.from) * ease(k);
      if (k < 1) more = true; else rot = null;
    }
    if (morph) { mk = clamp((now - morph.t0) / morph.dur, 0, 1); if (mk < 1) more = true; }
    place(mk);
    if (morph && mk >= 1) { morph = null; frise.classList.remove('is-morphing'); }
    if (more) schedule(); else if (!drag) phi = wrapPi(phi);
  }
  function rotateTo(target, animate) {
    const to = phi + wrapPi(target - phi);
    if (!animate || Math.abs(to - phi) < 1e-4) { phi = to; rot = null; schedule(); return; }
    const dist = Math.abs(to - phi);
    rot = { from: phi, to, t0: performance.now(), dur: clamp(340 + dist * 240, 340, 900) };
    schedule();
  }

  // -- œuvre sous l'index ------------------------------------------------------------------------
  function markCurrent() {
    ctx.items.forEach((li, id) => li.classList.toggle('is-current', id === current));
  }
  function updateNear() {
    const lvl = ctx.zoom.level;
    let K = 0;
    // mobile : pas d'étiquette sur l'arc, les voisines sont nommées à l'horizontale dans la carte
    if (lvl >= 2 && !G.mobile) K = lvl === 2 ? 3 : 1;
    near = new Set();
    const p = P.get(current);
    const set = charSet(); // mode Personnages : seuls les titres des œuvres allumées
    if (p) for (let k = -K; k <= K; k += 1) { const w = VIS[p.i + k]; if (w && k && (!set || set.has(w.id))) near.add(w.id); }
    // les étiquettes les plus proches de l'index passent au-dessus des points voisins (--nz)
    const rank = new Map();
    if (p) for (let k = -K; k <= K; k += 1) { const w = VIS[p.i + k]; if (w && k) rank.set(w.id, 2 + K - Math.abs(k)); }
    ctx.items.forEach((li, id) => {
      const on = near.has(id);
      li.classList.toggle('is-near', on);
      if (on) li.style.setProperty('--nz', String(rank.get(id) || 1));
      else { li.style.removeProperty('--ly'); li.style.removeProperty('--nz'); }
    });
    // hauteur des étiquettes (une ou deux lignes), lue une fois, pour les empiler sans chevauchement
    if (!G.mobile) near.forEach((id) => { const q = P.get(id); if (q) q.lh = ctx.items.get(id).querySelector('.node__title').offsetHeight || 20; });
  }
  function updateCount() {
    if (ovOn) { countN.textContent = String(ovJ + 1); countO.textContent = `sur ${ovItems.length}`; return; }
    const p = P.get(current);
    if (!p) return;
    countN.textContent = String(p.i + 1);
    countO.textContent = `sur ${VIS.length}`;
  }
  // mode Phases, phase dépliée : au bout de la phase, ◀ ▶ mènent à la phase voisine (avec sa transition)
  function adjacentPhase(dir) {
    if (ctx.state.mode !== 'phases' || !ctx.state.openPhase) return null;
    const ns = [...ctx.phaseWorks.keys()].filter((n) => !ctx.isFiltered() || ctx.state.phases.has(n)).sort((a, b) => a - b);
    const k = ns.indexOf(ctx.state.openPhase);
    return k < 0 ? null : ns[k + dir] || null;
  }
  function updateNav() {
    if (ovOn) { // grand cadran : d'un cadran à l'autre
      const K = ovItems.length;
      [[prevBtn, -1, 'Cadran précédent'], [nextBtn, 1, 'Cadran suivant']].forEach(([b, dir, t]) => {
        const ok = K > 1; // l'orbite fait le tour
        const tgt = ok ? ovItems[(((ovJ + dir) % K) + K) % K] : null;
        b.setAttribute('aria-disabled', String(!ok));
        b.txt.textContent = tgt ? `${t} : ${tgt.k + 1}` : t;
        b.classList.remove('is-phase'); b.classList.add('is-plate');
        delete b.dataset.phase;
      });
      return;
    }
    const p = P.get(current);
    if (!p) return;
    [[prevBtn, -1, 'Œuvre précédente', 'Phase précédente', 'Cadran précédent'], [nextBtn, 1, 'Œuvre suivante', 'Phase suivante', 'Cadran suivant']]
      .forEach(([b, dir, work, phase, plate]) => {
        const atEnd = dir < 0 ? p.i <= 0 : p.i >= VIS.length - 1;
        const n = atEnd ? adjacentPhase(dir) : null;
        const pl = atEnd && !n ? adjacentPlate(dir) : null;
        b.setAttribute('aria-disabled', String(atEnd && !n && pl === null));
        b.txt.textContent = n ? `${phase} : ${ROMAN[n] || n}` : pl !== null ? `${plate} : ${pl + 1}` : work;
        b.classList.toggle('is-phase', !!n);
        b.classList.toggle('is-plate', pl !== null);
        if (n) b.dataset.phase = String(n); else delete b.dataset.phase;
      });
  }
  // nom de l'anneau d'une saga (moyeu, N0) : intérieur / extérieur à deux anneaux, sinon sa place
  function ringName(id) {
    const k = G.rings ? G.rings.findIndex((rg) => rg.id === id) : -1;
    if (k < 0) return 'Saga';
    const n = G.rings.length;
    if (n === 2) return k ? 'Anneau extérieur' : 'Anneau intérieur';
    return k === 0 ? 'Anneau du centre' : k === n - 1 ? 'Anneau du bord' : `Anneau ${k + 1} sur ${n}`;
  }
  function setCurrent(id, { animate = true, rotate = true, follow = false, say = false } = {}) {
    if (!P.has(id)) return;
    current = id;
    if (ctx.state.focusId !== id) {
      ctx.state.focusId = id;
      btnOf.forEach((b, k) => { b.tabIndex = k === id ? 0 : -1; });
    }
    if (follow && ol.contains(document.activeElement)) ctx.focusWork(id, { scroll: false, tint: false });
    markCurrent(); updateNear(); updateHub(); updateNav(); updateCount();
    if (rotate) rotateTo(TOP - P.get(id).ang, animate && !ctx.reducedMotion()); else schedule();
    ctx.setCenterWork(id);
    if (say) {
      const w = byId.get(id); const y = yearOf(w);
      ctx.announce(`Sous l’index : ${w.title_fr.v}${y ? `, ${y}` : ''}. ${P.get(id).i + 1} sur ${VIS.length}.`);
    }
  }
  function step(dir, { crossPhase = false } = {}) {
    const p = P.get(current);
    const w = p && VIS[p.i + dir];
    if (!w && crossPhase && p) {
      const n = adjacentPhase(dir);
      if (n) { ctx.openPhase(n, { focusLast: dir < 0 }); return true; }
      const pl = adjacentPlate(dir);
      if (pl !== null) { goPlate(pl, { last: dir < 0 }); return true; }
    }
    if (!w) return false;
    setCurrent(w.id, { follow: true, say: !ol.contains(document.activeElement) });
    return true;
  }

  // -- moyeu (ordinateur) / carte (mobile) : l'œuvre sous l'index, selon le niveau de zoom -------
  // N3 : grande carte (dans le moyeu sur tablette, en haut de l'écran sur mobile, à gauche du
  // cadran sur grand écran : elle ne masque alors aucune œuvre de la spirale)
  function fillDetail(el, w) {
    const add = (tag, cls, text, parent = el) => h(tag, cls, text, parent);
    const p = P.get(current);
    const saga = sagaOf(w);
    const ph = w.phase ? w.phase.v : null;
    const phaseName = ph ? `Phase ${ROMAN[ph]}` : 'Phase à préciser';
    let top = el;
    if (G.mobile) { // téléphone : l'affiche d'abord, le titre à côté, les faits dessous
      const row = add('div', 'astro-aff astro-aff--cote astro-aff--n3');
      affSlot(w, 'cur', row);
      top = h('div', 'astro-aff__txt', null, row);
    }
    if (!G.mobile) add('p', 'astro-hub__k', `${p.i + 1} sur ${VIS.length}`, top); // téléphone : rang au compteur
    add('p', 'astro-hub__t', w.title_fr.v, top);
    const vo = w.title_original && w.title_original.v;
    if (vo && vo.replace(/\s/g, ' ') !== w.title_fr.v.replace(/\s/g, ' ')) {
      const v = add('p', 'astro-hub__vo', vo, top);
      if (w.title_original.lang) v.lang = w.title_original.lang;
    }
    const dl = add('dl', 'astro-hub__facts');
    const fact = (dt, dd) => { if (!dd) return; add('dt', null, dt, dl); add('dd', null, dd, dl); };
    const d = mainDate(w);
    const r = w.release || {};
    const where = d && r.fr === d ? ' (France)' : d && r.us === d ? ' (États-Unis)' : '';
    const nature = w.kind === 'series' && w.seasons && w.seasons.length ? `Série · ${plural(w.seasons.length, 'saison', 'saisons')}` : KIND[w.kind];
    fact('Sortie', d ? `${ctx.formatDateFr(d.v, d.precision)}${where}` : 'Date à confirmer');
    fact('Phase', saga ? `${phaseName} · ${saga.label_fr}` : phaseName);
    if (G.mobile) fact('Nature', [nature, uniLabel(w)].filter(Boolean).join(' · ')); // mobile : 3 lignes
    else { fact('Univers', uniLabel(w)); fact('Nature', nature); }
    const st = d ? statusOf(d.v, d.precision, today) : { key: 'tba', label: 'Date à confirmer' };
    const notes = [];
    if (st.key !== 'released') notes.push(st.label);
    if (w.story && w.story.provisional && ctx.state.order === 'story') notes.push('Place dans l’histoire à confirmer');
    if (G.mobile) { if (notes.length) add('p', 'astro-hub__note', notes.join(' · ')); } else notes.forEach((t) => add('p', 'astro-hub__note', t));
    if (!G.mobile) add('p', 'astro-hub__hint', 'Clic ou Entrée sur l’œuvre : ouvrir les Archives');
  }

  function updateHub() {
    const w = byId.get(current);
    if (!w || !G) return;
    if (ovOn) { shownId = null; preview.hide(); hub.replaceChildren(); return; } // grand cadran : ovHub
    if (G.layout === 'wide' && w.kind !== 'phase') { if (shownId !== w.id) { shownId = w.id; preview.show(w); } } else { shownId = null; preview.hide(); }
    const lvl = ctx.zoom.level;
    const p = P.get(current);
    const saga = sagaOf(w);
    const ph = w.phase ? w.phase.v : null;
    const yr = yearOf(w);
    const wideDetail = G.layout === 'wide' && lvl >= 3;
    hub.dataset.level = String(wideDetail ? 2 : lvl);
    hub.dataset.phase = ph ? String(ph) : ''; // code couleur du surtitre
    hub.replaceChildren();
    const add = (tag, cls, text, parent = hub) => h(tag, cls, text, parent);
    if (w.kind === 'phase') {
      // mode Phases : phase repliée sous l'index (années, nombre d'œuvres) ; Entrée ou clic la déplie
      add('p', 'astro-hub__k', saga ? saga.label_fr : 'Phase');
      add('p', 'astro-hub__t', w.title_fr.v);
      add('p', 'astro-hub__p', `${w.years[0] === w.years[1] ? w.years[0] : `${w.years[0]} – ${w.years[1]}`} · ${plural(w.count, 'œuvre', 'œuvres')}`);
      if (!G.mobile) add('p', 'astro-hub__hint', 'Clic ou Entrée sur la phase : la déplier');
      fitHub();
      return;
    }
    const phaseCount = ph ? VIS.filter((x) => phaseOf(x) === ph).length : 0;
    const phaseName = ph ? `Phase ${ROMAN[ph]}` : 'Phase à préciser';

    if (!G.mobile && lvl <= 1) {
      if (lvl === 0) {
        add('p', 'astro-hub__k', saga ? ringName(saga.id) : 'Saga à préciser');
        add('p', 'astro-hub__t astro-hub__t--saga', saga ? saga.label_fr : '');
        if (saga) {
          const n = VIS.filter((x) => x.saga && x.saga.v === saga.id).length;
          add('p', 'astro-hub__p', `Phases ${ROMAN[saga.phases[0]]} à ${ROMAN[saga.phases[saga.phases.length - 1]]} · ${plural(n, 'œuvre', 'œuvres')}`);
        }
      } else {
        add('p', 'astro-hub__k', saga ? saga.label_fr : '');
        add('p', 'astro-hub__t astro-hub__t--phase', phaseName);
        const ys = VIS.filter((x) => phaseOf(x) === ph).map(yearOf).filter(Boolean).map(Number);
        const span = ys.length ? (Math.min(...ys) === Math.max(...ys) ? `sorties en ${ys[0]}` : `sorties de ${Math.min(...ys)} à ${Math.max(...ys)}`) : '';
        add('p', 'astro-hub__p', [plural(phaseCount, 'œuvre', 'œuvres'), span].filter(Boolean).join(' · '));
      }
      if (G.layout !== 'wide') add('p', 'astro-hub__under', `Sous l’index : ${w.title_fr.v}`); // grand écran : l'aperçu le nomme
    } else if (G.mobile && lvl < 3) {
      // téléphone (N0–N2) : l'affiche d'abord, à gauche ; à sa droite le surtitre, le titre et l'année,
      // sans autre texte
      const kick = lvl === 0 ? (saga ? saga.label_fr : '') : lvl === 1 ? `${phaseName} · ${plural(phaseCount, 'œuvre', 'œuvres')}` : `${phaseName} · ${KIND[w.kind] || ''}`;
      const fig = add('div', 'astro-aff astro-aff--cote');
      affSlot(w, 'cur', fig);
      const txt = h('div', 'astro-aff__txt', null, fig);
      add('p', 'astro-hub__k', kick, txt);
      add('p', 'astro-hub__t', w.title_fr.v, txt);
      add('p', 'astro-hub__p', yr || 'Date à confirmer', txt);
    } else if (G.layout === 'wide') {
      // grand écran (N2–N3) : l'aperçu de droite donne titre, phase et nature ; le moyeu garde le rang et l'année
      add('p', 'astro-hub__k', `${p.i + 1} sur ${VIS.length}`);
      add('p', 'astro-hub__t astro-hub__t--yr', yr || 'Date à confirmer');
    } else if (lvl < 3) {
      // N2 (et N0–N1 sur mobile : la carte garde toujours le titre ; N3 grand écran : moyeu = titre)
      const kick = G.mobile && lvl === 0 ? (saga ? saga.label_fr : '') : G.mobile && lvl === 1 ? `${phaseName} · ${plural(phaseCount, 'œuvre', 'œuvres')}` : `${phaseName} · ${KIND[w.kind] || ''}`;
      add('p', 'astro-hub__k', kick);
      add('p', 'astro-hub__t', w.title_fr.v);
      add('p', 'astro-hub__p', yr || 'Date à confirmer');
      if (G.mobile && lvl === 2) {
        // N2 mobile : les voisines de l'index, nommées à l'horizontale
        const pv = VIS[p.i - 1]; const nx = VIS[p.i + 1];
        const around = add('p', 'astro-hub__around');
        h('span', 'astro-hub__prev', pv ? `← ${pv.title_fr.v}` : '', around);
        h('span', 'astro-hub__next', nx ? `${nx.title_fr.v} →` : '', around);
      }
    } else fillDetail(hub, w);
    fitHub();
  }
  // mobile : la carte ne recouvre jamais le repère ; si elle déborde, on la resserre, puis on
  // signale la suite (le détail complet reste dans les Archives)
  function fitHub() {
    hub.classList.remove('is-tight', 'is-clipped');
    // titre : on réduit la taille plutôt que de couper un mot (« WandaVision » sur une ligne)
    hub.querySelectorAll('.astro-hub__t').forEach((t) => {
      t.style.removeProperty('font-size');
      let fs = parseFloat(getComputedStyle(t).fontSize);
      for (let k = 0; k < 14 && t.scrollWidth > t.clientWidth + 1 && fs > 14; k += 1) {
        fs -= 1.5;
        t.style.setProperty('font-size', `${fs}px`);
      }
    });
    if (!G.mobile) return;
    if (hub.scrollHeight > hub.clientHeight + 1) {
      hub.classList.add('is-tight');
      if (hub.scrollHeight > hub.clientHeight + 1) hub.classList.add('is-clipped');
    }
  }

  // -- panneau Cadran et légende (grand écran) --------------------------------------------------
  function updateSide() {
    if (!G || G.layout !== 'wide') return;
    const story = ctx.state.order === 'story';
    const N = VIS.length;
    const prov = VIS.filter((w) => w.story && w.story.provisional).length;
    const set = charSet();
    cart.replaceChildren();
    h('p', 'astro-side__k', 'Cadran', cart);
    h('p', 'astro-side__t', story ? 'Ordre de l’histoire' : 'Ordre de sortie', cart);
    let m;
    if (ovOn) {
      const ys = yearsTxt(VIS, ' à ');
      m = `Grand cadran : ${plural(presentPlates(VIS).length, 'cadran', 'cadrans')} de deux sagas au plus, ${plural(N, 'œuvre', 'œuvres')}${ys ? `, de ${ys}` : ''}. Choisissez un cadran pour l’ouvrir.`;
    } else if (ctx.state.mode === 'phases' && !ctx.state.openPhase) m = `${plural(N, 'phase', 'phases')} : choisissez-en une pour la déplier.`;
    else if (ctx.state.mode === 'phases') m = `Phase ${ROMAN[ctx.state.openPhase] || ctx.state.openPhase} dépliée : ${plural(N, 'œuvre', 'œuvres')}. Échap pour revenir aux phases.`;
    else if (set) m = 'Les œuvres du personnage, reliées par un arc.'; // son nom et leur nombre sont sur sa fiche, à droite
    else if (story) m = `${plural(N, 'œuvre rangée', 'œuvres rangées')} selon l’histoire : un rang, pas une date.`;
    else { const ys = VIS.map(yearOf).filter(Boolean).map(Number); m = `${plural(N, 'œuvre', 'œuvres')}, de ${Math.min(...ys)} à ${Math.max(...ys)}, du centre vers le bord.`; }
    if (!ctx.state.series) m += ' Films seulement.';
    h('p', 'astro-side__p', m, cart);

    legList.replaceChildren();
    const row = (cls, text, glyph) => {
      const li = h('li', null, null, legList);
      const sw = h('span', `astro-sw astro-sw--${cls}`, glyph, li);
      sw.setAttribute('aria-hidden', 'true');
      h('span', null, text, li);
    };
    if (ovOn) { // grand cadran : chaque petit cadran porte ses sagas, un anneau teinté par saga
      row('film', 'Film'); row('series', 'Série');
      if (VIS.some((w) => ctx.items.get(w.id).dataset.status !== 'released')) row('upcoming', 'À venir ou date à confirmer');
      row('rings', 'Anneaux teintés : les sagas de chaque cadran, du centre vers le bord');
      return;
    }
    if (VIS.some((w) => w.kind === 'phase')) row('film', 'Phase repliée (clic pour déplier)');
    if (VIS.some((w) => w.kind === 'film')) row('film', 'Film');
    if (VIS.some((w) => w.kind === 'series')) row('series', 'Série');
    if (VIS.some((w) => ctx.items.get(w.id).dataset.status !== 'released')) row('upcoming', 'À venir ou date à confirmer');
    const others = [...new Set(VIS.filter((w) => ctx.laneOf(w) !== 0).map(uniLabel))];
    if (others.length) row('branch', `Autre univers : ${others.join(', ')}`);
    if (story && prov) row('prov', 'Place dans l’histoire à confirmer');
    if (set) row('arc', `Œuvres de ${ctx.charName.get(ctx.state.character)}`);
    if (G.rings) {
      const names = G.rings.map((rg) => sagaById(rg.id)).filter(Boolean).map(lowSaga);
      row('rings', names.length === 2 ? `Anneaux : ${names[0]} au centre, ${names[1]} autour` : `Anneaux, du centre vers le bord : ${names.join(', ')}`);
    }
    row('num', G.grouped ? 'Couronne : place sur le cadran, phase par phase' : 'Couronne : rang dans l’ordre choisi', 'X');
    row('index', 'Repère rouge : l’œuvre au centre');
  }

  // -- vue liste sur téléphone (contournement local, voir KEEP_DIAL_ON_PHONES) -----------------
  const phoneMQ = window.matchMedia('(max-width: 400px) and (min-height: 421px)');
  const autoMQ = window.matchMedia('(max-width: 400px), (max-height: 420px)');
  function syncListBtn(on) {
    root.classList.toggle('is-list-view', on);
    if (listBtn) { listBtn.setAttribute('aria-pressed', String(on)); listBtn.textContent = on ? 'Revenir à la frise' : 'Vue liste'; }
  }
  function enforceList() {
    if (KEEP_DIAL_ON_PHONES && phoneMQ.matches) syncListBtn(!!ctx.state.listView);
  }
  document.addEventListener('click', (e) => {
    if (!KEEP_DIAL_ON_PHONES || !phoneMQ.matches || !listBtn || !(e.target instanceof Element) || !listBtn.contains(e.target)) return;
    e.stopImmediatePropagation();
    ctx.state.listView = !ctx.state.listView;
    ctx.announce(ctx.state.listView ? 'Vue liste.' : 'Vue frise.');
    draw('list');
  }, true);
  phoneMQ.addEventListener('change', () => {
    if (!phoneMQ.matches) syncListBtn(!!ctx.state.listView || autoMQ.matches);
    draw('list');
  });

  // -- rendu complet ----------------------------------------------------------------------------
  function applyLevel(full = true) {
    frise.dataset.level = String(ctx.zoom.level);
    if (!full) return;
    if (!G.mobile) buildIndex();
    buildLabels(); updateNear(); updateHub(); updateCount(); schedule();
  }

  // ordre des <li> = ordre du cadran (lecture d'écran cohérente), sans perdre le focus
  function syncDom(list) {
    const want = list.map((w) => ctx.items.get(w.id)).filter(Boolean);
    const cur = [...ol.children].filter((li) => !li.hidden);
    if (want.length === cur.length && want.every((li, k) => cur[k] === li)) return;
    const act = document.activeElement;
    const had = !!act && ol.contains(act);
    want.forEach((li) => ol.append(li));
    if (had && document.activeElement !== act) act.focus({ preventScroll: true });
  }

  function draw(reason = 'state', transition = false) {
    enforceList();
    if (isList()) {
      cancelAnimationFrame(raf); raf = 0; rot = null; morph = null;
      frise.style.removeProperty('height');
      frise.classList.remove('is-morphing');
      frise.dataset.layout = 'list'; // aucune règle de disposition du cadran ne survit en vue liste
      root.classList.remove('astro-overview');
      clearOverview();
      syncDom(ctx.visible());
      return;
    }
    // sur mobile, la hauteur de la carte (donc la place de l'arc) dépend du niveau : rendu complet
    if (reason === 'level' && G && P.size && !G.mobile && frise.dataset.layout === G.layout) { applyLevel(); return; }
    const prev = P.size ? new Map([...P].map(([id, p]) => [id, { x: p.x, y: p.y }])) : null;
    const prevLayout = G && G.layout;
    compute();
    if (!VIS.length) return;
    if (syncPlateBar()) compute(); // barre « Cadran » apparue ou déplacée : place de la frise changée
    if (ovOn) ovPrepare();
    applyVars();
    syncDom(VIS);
    buildPlate(); buildRete(); buildIndex(); buildStars(); buildLabels(); updateSide(); syncPlateBar();
    if (ringsLi) ringsLi.textContent = fr(ringsHelp() || '');
    root.classList.toggle('astro-overview', ovOn);
    if (ovOn) buildOverview(); else clearOverview();
    // premier rendu : la coquille a rangé la liste avant que le filtre des cadrans existe
    if (platesOn) ctx.items.forEach((li, id) => { if (!P.has(id) && !li.hidden) li.hidden = true; });

    const reduced = ctx.reducedMotion();
    const animate = !!(transition && !reduced && prev && prevLayout === G.layout);
    const mainPts = VIS.filter((w) => ctx.laneOf(w) === 0).map((w) => { const p = P.get(w.id); return { id: w.id, x: p.x, y: p.y }; });
    const br = branches(VIS, tax, ctx.state.order).map((b) => {
      // mode Phases regroupé : la branche part de l'œuvre principale qui la précède sur le cadran
      const own = b.ids.map((x) => P.get(x)).sort((x, y) => x.i - y.i);
      let forkId = b.fork;
      if (G.grouped) { const f = VIS.slice(0, own[0].i).reverse().find((w) => ctx.laneOf(w) === 0); forkId = f ? f.id : null; }
      const fork = forkId ? P.get(forkId) : null;
      const pts = [];
      const last = own[own.length - 1];
      if (fork) {
        pts.push({ x: fork.x, y: fork.y });
        const m = spiral(((fork.slot + own[0].slot) / 2) / G.total, own[0].lane * 0.55, G.geo);
        pts.push({ x: m.x, y: m.y });
      }
      own.forEach((p) => pts.push({ x: p.x, y: p.y }));
      // branche ouverte : elle se prolonge un peu au-delà de sa dernière œuvre
      const tail = spiral(Math.min(1.04, (last.slot + 0.7) / G.total), last.lane * 1.15, G.geo);
      pts.push({ x: tail.x, y: tail.y });
      return { universe: b.universe, open: true, pts };
    });
    thread.set(mainPts, br, { reduced: !animate });
    drawBands(mainPts);

    // œuvre sous l'index : l'œuvre focalisée ; en mode Personnages, la première œuvre allumée
    let id = P.has(ctx.state.focusId) ? ctx.state.focusId : VIS[0].id;
    const set = charSet();
    const charJump = !!(set && (ctx.state.character !== lastChar || ctx.state.mode !== lastMode) && !set.has(id));
    if (charJump) { const first = VIS.find((w) => set.has(w.id)); if (first) id = first.id; }
    lastChar = ctx.state.character; lastMode = ctx.state.mode;

    if (animate) { morph = { from: prev, t0: performance.now(), dur: 900 }; frise.classList.add('is-morphing'); } else { morph = null; frise.classList.remove('is-morphing'); }
    applyLevel(false);
    current = null;
    setCurrent(id, { animate: animate || (charJump && !reduced) });
    if (!animate && !charJump) { cancelAnimationFrame(raf); raf = 0; place(); }
    if (ovOn) ovSelect(ovJ, { animate: false });
  }

  // -- interactions ---------------------------------------------------------------------------
  ctx.on('render', ({ reason, transition } = {}) => draw(reason, transition));
  ctx.on('focus', ({ id }) => { if (!isList() && id !== current && P.has(id)) setCurrent(id); });

  prevBtn.addEventListener('click', () => {
    if (prevBtn.getAttribute('aria-disabled') === 'true') return;
    if (ovOn) ovSelect(ovJ - 1, { say: true }); else step(-1, { crossPhase: true });
  });
  nextBtn.addEventListener('click', () => {
    if (nextBtn.getAttribute('aria-disabled') === 'true') return;
    if (ovOn) ovSelect(ovJ + 1, { say: true }); else step(1, { crossPhase: true });
  });
  // cadran d'une saga : Échap ramène au grand cadran (comme une phase dépliée ramène à toutes les phases)
  ol.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !platesOn || isList() || e.ctrlKey || e.metaKey || e.altKey) return;
    e.preventDefault(); e.stopPropagation();
    openOverview();
  });
  // retour des Archives sur une œuvre d'un autre cadran (ou depuis le grand cadran) : on ouvre son cadran
  ctx.on('archive-return', ({ id }) => {
    if (isList() || !(ovOn || platesOn)) return;
    const w = byId.get(id); const k = w ? plateOf(w) : -1;
    if (k < 0 || (platesOn && k === plateNo)) return;
    overview = false; plateNo = k; ovPlate = k;
    setCadranUrl();
    // la fermeture des Archives revient d'un pas dans l'historique (asynchrone) : l'adresse du cadran
    // est remise une fois ce retour arrivé
    window.addEventListener('popstate', setCadranUrl, { once: true });
    setTimeout(() => window.removeEventListener('popstate', setCadranUrl), 1500);
    ctx.state.focusId = id;
    ctx.update();
  });

  // transitions du mode Phases (shell.js) : point d'une phase sur le cadran, pivot du cadran, découpe ronde
  ctx.phaseStage = {
    point: (id) => { const p = P.get(id); return p && G ? { x: p.X, y: p.Y } : null; },
    pivot: () => (G ? { x: G.cx, y: G.cy } : null),
    center: () => (G ? { x: G.cx, y: G.mobile ? G.yIdx : G.cy } : null), // téléphone : le point sous l'index
    title: () => (G ? { x: G.cx, y: G.mobile ? Math.max(90, G.yIdx - 170) : G.cy } : null),
    // téléphone : seule la phase sous l'index est visible ; le cadran tourne d'abord jusqu'à la phase choisie
    prepare: (id) => new Promise((done) => {
      if (!G || !G.mobile || !P.has(id) || id === current) { done(); return; }
      setCurrent(id, { animate: true });
      setTimeout(done, rot ? rot.dur + 40 : 0);
    }),
    clip: () => (G && !G.mobile ? `circle(${G.R + 29}px at ${G.cx}px ${G.cy}px)` : 'inset(0)'),
    get turn() { return G && G.mobile ? 12 : 28; },
  };
  // la carte (aria-hidden) double le bouton de l'œuvre pour la souris et le doigt
  const openCurrent = () => { const b = btnOf.get(current); if (b) b.click(); };
  hub.addEventListener('click', () => { if (G && (G.mobile || hub.dataset.level === '3')) openCurrent(); });

  // mode Phases regroupé : les flèches suivent l'ordre du cadran (et non l'ordre de la coquille).
  // Écouteur en capture sur la liste : il passe avant celui de la coquille, sans dépendre de
  // l'ordre d'inscription ; il n'agit que si le cadran diffère de l'ordre courant.
  ol.addEventListener('keydown', (e) => {
    if (!G || !G.grouped || isList() || e.ctrlKey || e.metaKey || e.altKey) return;
    const p = P.get(current);
    if (!p) return;
    const k = e.key; let j;
    if (k === 'ArrowRight' || k === 'ArrowDown') j = p.i + 1;
    else if (k === 'ArrowLeft' || k === 'ArrowUp') j = p.i - 1;
    else if (k === 'Home') j = 0;
    else if (k === 'End') j = VIS.length - 1;
    else if (k === 'PageDown' || k === 'PageUp') {
      const dir = k === 'PageDown' ? 1 : -1; const ph = phaseOf(VIS[p.i]); let q = p.i;
      while (VIS[q + dir] && phaseOf(VIS[q + dir]) === ph) q += dir;
      j = q + dir;
    } else return;
    e.preventDefault(); e.stopPropagation();
    const w = VIS[clamp(j, 0, VIS.length - 1)];
    if (w.id !== current) ctx.focusWork(w.id, { scroll: false, tint: false });
  }, true);

  // molette au-dessus du cadran seulement (jamais avec Ctrl/Cmd : zoom du navigateur libre) ;
  // ailleurs, et sur mobile, la page défile normalement
  let wheelAcc = 0; let wheelAt = 0;
  frise.addEventListener('wheel', (e) => {
    if (e.ctrlKey || e.metaKey || isList() || !G || G.mobile || ovOn) return;
    const b = frise.getBoundingClientRect();
    if (Math.hypot(e.clientX - b.left - G.cx, e.clientY - b.top - G.cy) > G.R + 28) return;
    const d = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
    const dir = Math.sign(d);
    const p = P.get(current);
    if (!dir || !p || !VIS[p.i + dir]) { wheelAcc = 0; return; } // au bout : la page défile
    e.preventDefault();
    const now = performance.now();
    if (now - wheelAt > 280) wheelAcc = 0;
    wheelAt = now;
    wheelAcc += d;
    if (Math.abs(wheelAcc) >= 60) { wheelAcc = 0; step(dir); }
  }, { passive: false });

  // glisser horizontalement pour tourner (souris, stylet, doigt) ; les boutons restent l'alternative
  let suppressClick = false;
  frise.addEventListener('pointerdown', (e) => {
    if (isList() || !G || ovOn || e.button !== 0 || !e.isPrimary || !P.has(current)) return;
    const p = P.get(current);
    drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, phi0: phi, t0: p.t, r: Math.max(140, p.r), active: false };
  });
  frise.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x0; const dy = e.clientY - drag.y0;
    if (!drag.active) {
      if (Math.abs(dy) > 14 && Math.abs(dy) > Math.abs(dx)) { drag = null; return; }
      if (Math.abs(dx) < 9) return;
      drag.active = true; drag.x0 = e.clientX; rot = null;
      try { frise.setPointerCapture(e.pointerId); } catch (err) { /* pointeur déjà relâché */ }
      frise.classList.add('is-dragging');
      return;
    }
    phi = drag.phi0 + (e.clientX - drag.x0) / drag.r;
    const tv = clamp(drag.t0 - (phi - drag.phi0) / (G.turns * TAU), 0, 1);
    let best = current; let bd = Infinity;
    P.forEach((p, id) => { const dd = Math.abs(p.t - tv); if (dd < bd) { bd = dd; best = id; } });
    if (best !== current) setCurrent(best, { rotate: false });
    schedule();
  });
  const endDrag = (e) => {
    if (!drag || (e && e.pointerId !== drag.id)) return;
    const was = drag.active;
    drag = null;
    frise.classList.remove('is-dragging');
    if (was) {
      suppressClick = true;
      setTimeout(() => { suppressClick = false; }, 0);
      setCurrent(current, { follow: true });
    }
  };
  frise.addEventListener('pointerup', endDrag);
  frise.addEventListener('pointercancel', endDrag);
  frise.addEventListener('click', (e) => { if (suppressClick) { e.stopPropagation(); e.preventDefault(); suppressClick = false; } }, true);

  // redimensionnement (sur mobile, on ignore le va-et-vient de la barre d'adresse)
  let lastW = window.innerWidth; let lastH = window.innerHeight; let rz = 0;
  window.addEventListener('resize', () => {
    const w = window.innerWidth; const hh = window.innerHeight;
    if (w === lastW && Math.abs(hh - lastH) < 110 && G && G.mobile) return;
    lastW = w; lastH = hh;
    cancelAnimationFrame(rz);
    rz = requestAnimationFrame(() => draw('resize'));
  });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => draw('resize'));
}
