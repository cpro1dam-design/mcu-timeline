// Page d'accueil (liste des œuvres) : « Vus et à voir » géré directement dans la liste.
// - panneau sous la barre d'outils : compteur et ce que montre la liste (Toutes | Vues | Pas encore vues |
//   À voir, même réglage que les frises) ;
// - sur chaque œuvre : boutons « Vu » et « À voir » (une œuvre pas encore sortie : « À voir » seul) ;
// - en tête de chaque phase : « Tout vu », « Tout à voir » (un second appui retire les marques) ;
// - une œuvre vue est en surbrillance verte (plus de coche devant le titre), une œuvre à voir cerclée
//   d'ivoire.
// État et actions : marks.js, communs avec les frises (ce qui est marqué ici l'est aussi là-bas).

import { getPrefs, onPrefs } from './prefs.js';
import { createMarks, SEEN_FILTERS } from './marks.js';
import { siteRoot } from './data.js';
import { marksTransfer, takeLinkMarks } from './marks-io.js';

function mk(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}
function button(cls, text) {
  const b = mk('button', cls, text);
  b.type = 'button';
  b.setAttribute('aria-pressed', 'false');
  return b;
}

export function initVusListe({ works, items, announce = () => {}, onFilter = () => {} }) {
  const marks = createMarks(works);
  const { byId } = marks;

  // -- panneau --------------------------------------------------------------------------------
  const panel = mk('section', 'vus-panel');
  panel.setAttribute('aria-labelledby', 'vus-liste-t');
  const head = mk('div', 'vus-panel__head');
  const title = mk('h2', 'vus-panel__t', 'Vus et à voir');
  title.id = 'vus-liste-t';
  title.tabIndex = -1;
  const count = mk('p', 'vus-panel__n');
  head.append(title, count);
  const row = mk('div', 'vus-panel__row');
  const lab = mk('span', 'vus-panel__l', 'Afficher');
  lab.id = 'vus-liste-show';
  const chips = mk('div', 'vus-panel__chips');
  chips.setAttribute('role', 'group');
  chips.setAttribute('aria-labelledby', 'vus-liste-show');
  const chipBtns = SEEN_FILTERS.map(([key, label]) => {
    const b = button('vus-chip');
    b.dataset.filter = key;
    b.append(mk('span', null, label), mk('span', 'vus-chip__n'));
    b.addEventListener('click', () => {
      if (b.getAttribute('aria-disabled') === 'true') return;
      const msg = marks.setFilter(key);
      if (msg) { sync(); announce(msg); }
    });
    chips.append(b);
    return b;
  });
  row.append(lab, chips);
  const hint = mk('p', 'vus-panel__hint', 'Marquez chaque œuvre avec « Vu » ou « À voir », ou toute une phase avec « Tout vu » et « Tout à voir ». Les marques restent sur cet appareil et servent aussi dans les deux frises.');
  const io = marksTransfer({ works, announce, onChange: () => sync() });
  panel.append(head, row, hint, io.element);
  const toolbar = document.querySelector('.toolbar');
  if (toolbar) toolbar.after(panel);

  // -- réglages : lien vers la page des versions à comparer -------------------------------------
  const settings = document.querySelector('.settings__body');
  if (settings) {
    const cmp = mk('p', 'c-compare');
    const a = mk('a', null, 'Versions à comparer');
    a.href = `${siteRoot()}comparer.html`;
    cmp.append(a, ' : les apparences pas encore choisies, côte à côte.');
    const counts = settings.querySelector('#compteurs');
    if (counts) counts.before(cmp); else settings.append(cmp);
  }

  // -- boutons de chaque œuvre ------------------------------------------------------------------
  const cards = [];
  items.forEach((li) => {
    const w = byId.get(li.dataset.id);
    const card = li.querySelector('.work__card');
    if (!w || !card) return;
    const t = w.title_fr ? w.title_fr.v : w.id;
    const grp = mk('div', 'work__marks');
    grp.setAttribute('role', 'group');
    grp.setAttribute('aria-label', `Marquer « ${t} »`);
    const bVu = marks.released(w) ? button('mark-btn mark-btn--vu', 'Vu') : null;
    const bAv = button('mark-btn mark-btn--avoir', 'À voir');
    [[bVu, 'vu'], [bAv, 'avoir']].forEach(([b, kind]) => {
      if (!b) return;
      b.addEventListener('click', () => {
        const r = marks.toggle(w, kind);
        if (r.ok) sync();
        announce(r.msg);
        if (li.hidden) refocus(li); // la liste filtrée ne montre plus l'œuvre : le focus passe à la suivante
      });
      grp.append(b);
    });
    card.append(grp);
    cards.push({ li, w, bVu, bAv });
  });
  function refocus(li) {
    const visible = items.filter((x) => !x.hidden && x.parentElement);
    const after = visible.find((x) => li.compareDocumentPosition(x) & Node.DOCUMENT_POSITION_FOLLOWING);
    const target = (after || visible[visible.length - 1] || null);
    const btn = target && target.querySelector('.mark-btn');
    (btn || title).focus();
  }

  // -- « Tout vu » / « Tout à voir » en tête de chaque phase --------------------------------------
  const bulks = [];
  document.querySelectorAll('#vue-phases section.phase').forEach((sec) => {
    const h = sec.querySelector(':scope > h3');
    if (!h) return;
    const k = sec.dataset.phase;
    const ws = items.filter((li) => li.dataset.phase === k).map((li) => byId.get(li.dataset.id)).filter(Boolean);
    if (!ws.length) return;
    const phName = `Phase ${k}`;
    const wrap = mk('div', 'phase__head');
    h.before(wrap);
    const bulk = mk('div', 'phase__bulk');
    [['vu', 'Tout vu'], ['avoir', 'Tout à voir']].forEach(([kind, label]) => {
      const b = button('mark-btn mark-btn--bulk');
      b.append(label, mk('span', 'visually-hidden', ` (phase ${k})`));
      b.addEventListener('click', () => {
        if (b.getAttribute('aria-disabled') === 'true') return;
        const msg = marks.markPhase(ws, kind, phName);
        if (msg) { sync(); announce(msg); }
      });
      bulk.append(b);
      bulks.push({ b, kind, ws });
    });
    wrap.append(h, bulk);
  });

  // -- affichage ---------------------------------------------------------------------------------
  function allowed() { // œuvres que le filtre laisse voir (null : toutes)
    const f = getPrefs().filtreVu;
    if (!f || f === 'tous') return null;
    if (f === 'avoir') return marks.watch();
    const s = marks.seen();
    return new Set(works.filter((w) => (f === 'vus' ? s.has(w.id) : !s.has(w.id))).map((w) => w.id));
  }
  function sync() {
    const s = marks.seen(); const wl = marks.watch(); const n = marks.counts();
    const f = getPrefs().filtreVu || 'tous';
    count.textContent = `${n.vus} ${n.vus > 1 ? 'vues' : 'vue'} · ${n.avoir} à voir · ${works.length} œuvres`;
    chipBtns.forEach((b) => {
      const key = b.dataset.filter;
      b.setAttribute('aria-pressed', String(key === f));
      b.setAttribute('aria-disabled', String(!n[key] && key !== f));
      b.querySelector('.vus-chip__n').textContent = String(n[key]);
    });
    cards.forEach(({ li, w, bVu, bAv }) => {
      const isV = s.has(w.id); const isW = wl.has(w.id);
      li.classList.toggle('is-seen', isV);
      li.classList.toggle('is-watch', isW && !isV);
      if (bVu) bVu.setAttribute('aria-pressed', String(isV));
      bAv.setAttribute('aria-pressed', String(isW));
    });
    bulks.forEach(({ b, kind, ws }) => {
      const st = marks.phaseState(ws, kind, s, wl);
      b.setAttribute('aria-pressed', String(st.all));
      b.setAttribute('aria-disabled', String(!st.possible));
    });
    onFilter();
  }
  let queued = false;
  onPrefs(() => { if (queued) return; queued = true; queueMicrotask(() => { queued = false; sync(); }); });
  sync();
  // lien de marques ouvert sur cet appareil (envoyé depuis un autre) : proposer l'import, au chargement
  // ou quand le lien est collé dans un onglet où la liste est déjà ouverte (seul le # change)
  const takeLink = () => {
    const incoming = takeLinkMarks();
    if (incoming) { panel.scrollIntoView({ block: 'start' }); io.offer(incoming, 'Lien reçu'); }
  };
  takeLink();
  window.addEventListener('hashchange', takeLink);
  return { allowed, sync };
}
