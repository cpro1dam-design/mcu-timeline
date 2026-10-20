// « Vus et à voir » : on marque librement, d'après les affiches, les œuvres déjà vues et celles qu'on
// veut voir ; la frise peut n'afficher que les unes ou les autres.
// - état et actions (listes vus / à voir, phases, filtre) : marks.js, communs avec la page d'accueil ;
// - grande fenêtre plein écran, comme « Tous les personnages » (mêmes classes c-persos-dialog) ; son
//   en-tête reste visible pendant qu'on fait défiler les affiches : Fermer, ce que montre la frise et ce
//   que devient une affiche touchée ; flèche « Revenir en haut » dans le coin ;
// - une œuvre pas encore sortie peut être « à voir », pas « vue ».

import { getPrefs, setPref, onPrefs } from './prefs.js';
import { afficheEl } from './affiche.js';
import { createOverlay } from './overlays.js';
import { mainDate, sortWorks } from './layout.js';
import { formatDateFr } from './dates.js';
import { initToTop } from './totop.js';
import { createMarks, SEEN_FILTERS, FILTER_SHORT } from './marks.js';
import { marksTransfer } from './marks-io.js';

export { SEEN_FILTERS, seenFilter } from './marks.js';

function mk(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}
function eye() {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('class', 'm-ico m-ico--vus');
  const p = document.createElementNS(NS, 'path');
  p.setAttribute('d', 'M2.5 12s3.6-6.3 9.5-6.3 9.5 6.3 9.5 6.3-3.6 6.3-9.5 6.3S2.5 12 2.5 12z');
  const c = document.createElementNS(NS, 'circle');
  c.setAttribute('cx', '12'); c.setAttribute('cy', '12'); c.setAttribute('r', '2.8');
  svg.append(p, c);
  return svg;
}

export function initVus({ works, taxonomy, announce = () => {}, onChange = () => {} }) {
  const marks = createMarks(works); // état et actions (marks.js)
  const { released, seen, watch, counts } = marks;
  const ordered = sortWorks(works, 'release');

  // -- boutons d'entrée : barre d'outils (ordinateur) et barre du haut (téléphone) -----------------
  // ordinateur : bouton œil « Vus et à voir » toujours présent dans la barre d'outils, juste avant Réglages ;
  // quand la frise est filtrée, une pastille rouge le dit (« à voir »). Téléphone : bouton « Vus » dans la
  // barre du haut (la barre d'outils y est masquée).
  const entries = [];
  const tools = document.querySelector('.c-tools');
  if (tools) {
    const b = mk('button', 'button c-vus-btn');
    b.type = 'button';
    // « Vus » seul quand l'en-tête tient sur une ligne et que la place manque (« et à voir » reste lu)
    const t = mk('span', 'c-vus-btn__t', 'Vus');
    t.append(mk('span', 'c-vus-btn__x', ' et à voir'));
    b.append(eye(), t, mk('span', 'c-vus-btn__f'));
    const settings = tools.querySelector('.c-settings');
    if (settings) settings.before(b); else tools.append(b);
    entries.push(b);
  }
  const reg = document.getElementById('btn-reglages');
  if (reg) {
    const b = mk('button', 'c-appbtn c-appbtn--vus');
    b.type = 'button';
    b.append(eye(), mk('span', 'c-appbtn__t', 'Vus'), mk('span', 'visually-hidden c-vus-btn__f'));
    reg.before(b);
    entries.push(b);
  }
  entries.forEach((b) => { b.setAttribute('aria-haspopup', 'dialog'); b.addEventListener('click', () => open(b)); });

  // -- fenêtre --------------------------------------------------------------------------------
  const dlg = mk('dialog', 'c-persos-dialog c-vus-dialog');
  dlg.setAttribute('aria-labelledby', 'vus-titre');
  const inner = mk('div', 'c-persos-dialog__in');
  const head = mk('div', 'c-persos-dialog__head');
  const title = mk('h2', 'c-persos-dialog__title', 'Vus et à voir');
  title.id = 'vus-titre';
  title.tabIndex = -1;
  const count = mk('p', 'c-persos-dialog__count');
  const closeBtn = mk('button', 'button c-persos-dialog__close', 'Fermer');
  closeBtn.type = 'button';
  head.append(title, count, closeBtn);

  // afficher sur la frise
  const show = mk('section', 'c-vus__sec');
  show.setAttribute('aria-labelledby', 'vus-show-h');
  const showH = mk('h3', 'c-vus__h', 'Afficher sur la frise');
  showH.id = 'vus-show-h';
  const showGrp = mk('div', 'c-vus__chips');
  showGrp.setAttribute('role', 'group');
  showGrp.setAttribute('aria-labelledby', 'vus-show-h');
  const showBtns = SEEN_FILTERS.map(([key, label]) => {
    const b = mk('button', 'c-vus__chip');
    b.type = 'button';
    b.dataset.filter = key;
    b.append(mk('span', 'c-vus__chip-l', label), mk('span', 'c-vus__chip-n'));
    b.addEventListener('click', () => {
      if (b.getAttribute('aria-disabled') === 'true') return;
      setPref('filtreVu', key);
      sync();
      onChange('filter');
      const n = counts()[key];
      announce(key === 'tous' ? 'La frise montre toutes les œuvres.' : `La frise montre les œuvres ${FILTER_SHORT[key]} : ${n}.`);
    });
    showGrp.append(b);
    return b;
  });
  show.append(showH, showGrp);

  // marquer d'après les affiches
  const mark = mk('section', 'c-vus__sec c-vus__sec--mark');
  mark.setAttribute('aria-labelledby', 'vus-mark-h');
  const markH = mk('h3', 'c-vus__h', 'Marquer comme');
  markH.id = 'vus-mark-h';
  const markRow = mk('div', 'c-vus__markrow');
  const modeGrp = mk('div', 'segmented c-vus__mode');
  modeGrp.setAttribute('role', 'group');
  modeGrp.setAttribute('aria-label', 'Une affiche touchée devient');
  let mode = 'vu';
  const modeBtns = [['vu', '✓ Vue'], ['avoir', '★ À voir']].map(([key, label]) => {
    const b = mk('button', null, label);
    b.type = 'button';
    b.dataset.mode = key;
    b.addEventListener('click', () => { mode = key; sync(); announce(key === 'vu' ? 'Toucher une affiche la marque comme vue.' : 'Toucher une affiche la marque à voir.'); });
    modeGrp.append(b);
    return b;
  });
  const hint = mk('p', 'c-vus__hint');
  markRow.append(modeGrp);
  mark.append(markH, markRow);
  // bloc collant en haut de la fenêtre ; l'explication défile avec les affiches
  const top = mk('div', 'c-vus__top');
  const ctl = mk('div', 'c-vus__ctl');
  ctl.append(show, mark);
  top.append(head, ctl);

  // affiches, par phase, dans l'ordre de sortie
  const grids = mk('div', 'c-vus__phases');
  const items = new Map();
  const groups = new Map();
  const phaseCtl = []; // boutons « Tout vu » / « Tout à voir » de chaque phase
  ordered.forEach((w) => { const k = w.phase ? w.phase.v : 0; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(w); });
  groups.forEach((ws, k) => {
    const ph = taxonomy.phases.find((p) => p.n === k);
    const sec = mk('section', 'c-vus__phase');
    const hId = `vus-ph-${k}`;
    sec.setAttribute('aria-labelledby', hId);
    sec.dataset.phase = k ? String(k) : '';
    const phName = ph ? `Phase ${ph.roman}` : 'Phase à préciser';
    const h = mk('h3', 'c-vus__ph', phName);
    h.id = hId;
    // toute la phase d'un geste ; bouton enfoncé = toute la phase déjà marquée (le toucher retire la marque)
    const bulk = mk('div', 'c-vus__bulk');
    const bulkBtn = (kind, label) => {
      const b = mk('button', 'c-vus__chip c-vus__bulkbtn');
      b.type = 'button';
      b.append(mk('span', null, label), mk('span', 'visually-hidden', ` (${phName.replace(/^Phase/, 'phase')})`));
      b.addEventListener('click', () => markPhase(ws, kind, phName));
      bulk.append(b);
      phaseCtl.push({ b, kind, ws });
      return b;
    };
    bulkBtn('vu', '✓ Tout vu');
    bulkBtn('avoir', '★ Tout à voir');
    const phHead = mk('div', 'c-vus__phhead');
    phHead.append(h, bulk);
    const ul = mk('ul', 'c-vus__grid');
    ws.forEach((w) => {
      const d = mainDate(w);
      const li = mk('li');
      const b = mk('button', 'c-vus__item');
      b.type = 'button';
      b.dataset.id = w.id;
      b.dataset.phase = w.phase ? String(w.phase.v) : '';
      const badge = mk('span', 'c-vus__badge');
      badge.setAttribute('aria-hidden', 'true');
      const state = mk('span', 'visually-hidden');
      b.append(afficheEl(w, { cls: 'c-vus__poster' }), badge, mk('span', 'c-vus__t', w.title_fr.v),
        mk('span', 'c-vus__d', released(w) ? (d ? formatDateFr(d.v, d.precision) : '') : (d ? `À venir · ${formatDateFr(d.v, d.precision)}` : 'Date à confirmer')), state);
      b.addEventListener('click', () => toggle(w, b));
      li.append(b);
      ul.append(li);
      items.set(w.id, { b, badge, state, w });
    });
    sec.append(phHead, ul);
    grids.append(sec);
  });

  // sauvegarde ou transfert des marques (fichier, lien) : replié, sous l'explication
  const io = marksTransfer({ works, announce, onChange: () => { sync(); onChange('marks'); } });
  inner.append(top, hint, io.element, grids);
  dlg.append(inner);
  document.body.append(dlg);
  initToTop(dlg, { host: dlg, focus: () => title });
  let opener = null;
  const ov = createOverlay(dlg, {
    closeOnBackdrop: false,
    onClose: () => { document.documentElement.classList.remove('has-vus-dialog'); if (opener && document.contains(opener)) opener.focus({ preventScroll: true }); },
  });
  closeBtn.addEventListener('click', () => ov.close());

  function toggle(w, b) {
    const r = marks.toggle(w, mode);
    if (r.ok) { sync(); onChange('marks'); }
    announce(r.msg);
    if (r.ok) b.focus({ preventScroll: true });
  }
  function markPhase(ws, kind, phName) {
    const msg = marks.markPhase(ws, kind, phName);
    if (!msg) return;
    sync();
    onChange('marks');
    announce(msg);
  }

  function sync() {
    const s = seen(); const wl = watch(); const n = counts();
    phaseCtl.forEach(({ b, kind, ws }) => {
      const st = marks.phaseState(ws, kind, s, wl);
      b.setAttribute('aria-pressed', String(st.all));
      b.setAttribute('aria-disabled', String(!st.possible));
    });
    const f = getPrefs().filtreVu || 'tous';
    count.textContent = `${n.vus} ${n.vus > 1 ? 'vues' : 'vue'} · ${n.avoir} à voir · ${works.length} œuvres`;
    showBtns.forEach((b) => {
      const k = b.dataset.filter;
      b.setAttribute('aria-pressed', String(k === f));
      b.setAttribute('aria-disabled', String(!n[k] && k !== f));
      b.querySelector('.c-vus__chip-n').textContent = String(n[k]);
    });
    modeBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
    hint.textContent = mode === 'vu'
      ? 'Touchez les affiches des œuvres que vous avez vues ; touchez de nouveau pour retirer la marque.'
      : 'Touchez les affiches des œuvres que vous voulez voir ; touchez de nouveau pour retirer la marque.';
    items.forEach(({ b, badge, state, w }) => {
      const isV = s.has(w.id); const isW = wl.has(w.id); const out = !released(w);
      b.classList.toggle('is-vu', isV);
      b.classList.toggle('is-avoir', isW);
      b.setAttribute('aria-pressed', String(mode === 'vu' ? isV : isW));
      b.setAttribute('aria-disabled', String(mode === 'vu' && out));
      badge.textContent = isV ? 'Vue' : isW ? '★ À voir' : '';
      state.textContent = [isV ? ', vue' : '', isW ? ', à voir' : '', out ? ', pas encore sortie' : ''].join('');
    });
    // boutons d'entrée : le filtre en cours est écrit dans une pastille (ordinateur) ou signalé par un
    // point (téléphone) ; les lecteurs d'écran entendent « frise : œuvres à voir »
    entries.forEach((b) => {
      const on = f !== 'tous';
      b.classList.toggle('is-on', on);
      const fl = b.querySelector('.c-vus-btn__f');
      if (b.classList.contains('c-appbtn')) {
        b.classList.toggle('has-dot', on);
        // téléphone : nom complet pour les lecteurs d'écran (l'étiquette visible dit « Vus »)
        if (fl) fl.textContent = on ? ` et à voir, frise : œuvres ${FILTER_SHORT[f]}` : ' et à voir';
        return;
      }
      if (fl) {
        fl.replaceChildren();
        if (on) fl.append(mk('span', 'visually-hidden', ', frise : œuvres '), document.createTextNode(FILTER_SHORT[f]));
      }
    });
  }

  function open(from) {
    opener = from;
    sync();
    document.documentElement.classList.add('has-vus-dialog');
    ov.show();
    inner.scrollTop = 0;
    dlg.scrollTop = 0;
    // téléphone : les choix d'affichage défilent de côté ; celui en cours est ramené en vue
    const cur = showGrp.querySelector('[aria-pressed="true"]');
    if (cur) showGrp.scrollLeft = Math.max(0, cur.offsetLeft - showGrp.offsetLeft - 16);
    title.focus({ preventScroll: true });
  }

  onPrefs((p, name) => { if (name === 'vuJusqua' || name === '*') sync(); });
  sync();
  return { sync, open };
}
