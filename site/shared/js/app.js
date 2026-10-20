// Point d'entrée commun : amélioration progressive de la page (le contenu est déjà présent en HTML).

import { getPrefs, setPref, clearPrefs, onPrefs, reducedMotion } from './prefs.js';
import { statusOf, todayParis, formatDateFr } from './dates.js';
import { initSpoilers, isSeen } from './spoilers.js';
import { initSearch } from './search.js';
import { loadData } from './data.js';
import { createPhaseFilter, phasesFromParam, phasesToParam, describePhases } from './filter.js';
import { initToTop } from './totop.js';
import { registerOffline } from './offline.js';
import { initVusListe } from './vus-liste.js';
import { createMarks } from './marks.js';
import { afficheEl, phVars } from './affiche.js';
import { mainDate } from './layout.js';

const root = document.documentElement;
const page = root.dataset.page;
const announcer = document.getElementById('annonces');

function announce(msg) {
  if (!announcer) return;
  announcer.textContent = '';
  setTimeout(() => { announcer.textContent = msg; }, 60);
}

function applyMotion() {
  root.classList.toggle('is-reduced-motion', reducedMotion());
}

async function applyStatuses() {
  const today = todayParis();
  for (const el of document.querySelectorAll('[data-release]')) {
    const out = el.querySelector('[data-status]');
    if (!out) continue;
    const st = statusOf(el.dataset.release, el.dataset.precision, today);
    const seen = el.dataset.id ? await isSeen(el.dataset.id) : false;
    el.classList.toggle('is-upcoming', st.key !== 'released');
    el.classList.toggle('is-seen', seen);
    const parts = [];
    if (st.key !== 'released') parts.push(st.label);
    if (seen && !el.querySelector('.work__marks')) parts.push('Vu'); // liste : le bouton « Vu » le dit
    out.textContent = parts.join(' · ');
    out.hidden = parts.length === 0;
  }
}

// -- page d'accueil : prochaine sortie (dates sourcées, recalculée chaque jour, heure de Paris) --------
function renderNextRelease(works) {
  const box = document.getElementById('prochaine-sortie');
  if (!box) return;
  const today = todayParis();
  const nxt = works.filter((w) => {
    const d = mainDate(w);
    return d && statusOf(d.v, d.precision, today).key !== 'released';
  }).sort((a, b) => a.order_release.v - b.order_release.v);
  box.hidden = !nxt.length;
  if (!nxt.length) return;
  const mk = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; };
  const link = (w) => { const a = mk('a', null, w.title_fr ? w.title_fr.v : w.id); a.href = `oeuvres/${w.slug}/index.html`; return a; };
  const when = (w) => {
    const d = mainDate(w);
    const where = w.release.fr ? ' en France' : (w.release.us ? ' aux États-Unis' : '');
    return `${d.precision === 'day' ? 'le ' : 'en '}${formatDateFr(d.v, d.precision)}${where}`;
  };
  // compte à rebours en jours (seulement si le jour est connu)
  const countdown = (w) => {
    const d = mainDate(w);
    if (d.precision !== 'day') return '';
    const days = Math.round((Date.parse(`${d.v}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
    if (days <= 0) return '';
    return days === 1 ? ' · demain' : ` · dans ${days} jours`;
  };
  const w = nxt[0];
  const t = mk('p', 'next-release__t');
  t.append(link(w));
  const d = mk('p', 'next-release__d', when(w));
  d.append(mk('span', 'next-release__in', countdown(w)));
  const kids = [afficheEl(w, { cls: 'next-release__poster' }),
    box.querySelector('h2') || Object.assign(mk('h2', 'next-release__k', 'Prochaine sortie'), { id: 'h-prochaine' }), t, d];
  if (nxt[1]) {
    const then = mk('p', 'next-release__then', 'Ensuite : ');
    then.append(link(nxt[1]), document.createTextNode(`, ${when(nxt[1])}`));
    kids.push(then);
  }
  box.replaceChildren(...kids);
}

// -- page d'accueil : liste des œuvres ------------------------------------------------
async function initIndex() {
  loadData('works.json').then((d) => renderNextRelease(d.works)).catch(() => {});
  document.querySelectorAll('.c-affiche--ph[data-ph-id]').forEach((el) => phVars(el, el.dataset.phId));
  const byPhase = document.getElementById('vue-phases');
  const storySection = document.getElementById('vue-histoire');
  const storyList = document.getElementById('liste-histoire');
  const items = [...document.querySelectorAll('#vue-phases li.work')];
  const homes = new Map(items.map((li) => [li, { parent: li.parentElement }]));
  const buttons = [...document.querySelectorAll('[data-order]')];

  // deux filtres combinés : saga / phase (après chargement de taxonomy.json) et « Vus et à voir »
  let phaseOk = () => true;
  let marksAllowed = () => null;
  function refilter() {
    const allowed = marksAllowed();
    items.forEach((li) => { li.hidden = !phaseOk(li) || (!!allowed && !allowed.has(li.dataset.id)); });
    byPhase.querySelectorAll('section.phase').forEach((sec) => { sec.hidden = !sec.querySelector('li.work:not([hidden])'); });
    byPhase.querySelectorAll('section.saga').forEach((sec) => { sec.hidden = !sec.querySelector('section.phase:not([hidden])'); });
    return items.filter((li) => !li.hidden).length;
  }
  function setOrder(order, silent) {
    buttons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.order === order)));
    if (order === 'story') {
      [...items].sort((a, b) => Number(a.dataset.orderStory) - Number(b.dataset.orderStory))
        .forEach((li) => storyList.append(li));
      byPhase.hidden = true;
      storySection.hidden = false;
    } else {
      items.sort((a, b) => Number(a.dataset.orderRelease) - Number(b.dataset.orderRelease))
        .forEach((li) => homes.get(li).parent.append(li));
      byPhase.hidden = false;
      storySection.hidden = true;
    }
    // ordre de l'histoire : pas d'intertitre de phase, les titres d'œuvres descendent d'un niveau (h2 > h3)
    items.forEach((li) => {
      const h = li.querySelector('.work__title');
      if (h) { if (order === 'story') h.setAttribute('aria-level', '3'); else h.removeAttribute('aria-level'); }
    });
    refilter();
    if (!silent) {
      setPref('ordre', order);
      announce(order === 'story' ? 'Œuvres affichées dans l’ordre de l’histoire.' : 'Œuvres affichées par phase, dans l’ordre de sortie.');
    }
  }
  buttons.forEach((b) => b.addEventListener('click', () => setOrder(b.dataset.order)));
  setOrder(getPrefs().ordre === 'story' ? 'story' : 'release', true);

  // filtre par saga et par phase (?phases=4,5,6 : adresse partageable) ; sans JS, la liste reste complète
  try {
    const taxonomy = await loadData('taxonomy.json');
    const allPh = taxonomy.phases.map((p) => p.n);
    let phases = phasesFromParam(new URLSearchParams(location.search).get('phases'), taxonomy);
    phaseOk = (li) => allPh.every((n) => phases.has(n)) || phases.has(Number(li.dataset.phase));
    const filter = createPhaseFilter(taxonomy, {
      selected: phases,
      onChange(set) {
        phases = set;
        const u = new URL(location.href);
        const v = phasesToParam(set, taxonomy);
        if (v) u.searchParams.set('phases', v); else u.searchParams.delete('phases');
        history.replaceState(history.state, '', u);
        const n = refilter();
        announce(`Filtre : ${describePhases(set, taxonomy)}. ${n} ${n > 1 ? 'œuvres' : 'œuvre'} affichée${n > 1 ? 's' : ''}.`);
      },
    });
    const anchor = document.querySelector('.toolbar .segmented');
    if (anchor) anchor.after(filter.el);
    refilter();
  } catch (e) { /* données indisponibles : liste complète, sans filtre */ }

  // réglages
  const select = document.getElementById('vu-jusqua');
  const all = document.getElementById('tout-afficher');
  const motion = document.getElementById('reduire-animations');
  const counts = document.getElementById('compteurs');
  try {
    const data = await loadData('works.json');
    const today = todayParis();
    const released = data.works.filter((w) => {
      const d = w.release.fr || w.release.us || w.release.first;
      return d && statusOf(d.v, d.precision, today).key === 'released';
    }).sort((a, b) => a.order_release.v - b.order_release.v);
    const groups = new Map();
    released.forEach((w) => {
      const key = w.phase ? `Phase ${w.phase.v}` : 'Phase à préciser';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(w);
    });
    groups.forEach((list, label) => {
      const og = document.createElement('optgroup');
      og.label = label;
      list.forEach((w) => {
        const o = document.createElement('option');
        o.value = w.id;
        o.textContent = w.title_fr ? w.title_fr.v : w.id;
        og.append(o);
      });
      select.append(og);
    });
    // « Vus et à voir » dans la liste : panneau, boutons sur chaque œuvre et par phase (vus-liste.js)
    const vus = initVusListe({ works: data.works, items, announce, onFilter: () => refilter() });
    marksAllowed = vus.allowed;
    refilter();
    applyStatuses();
    const renderCounts = async () => {
      let fs = 0; let ss = 0; let fv = 0; let sv = 0;
      for (const w of released) {
        const seen = await isSeen(w.id);
        if (w.kind === 'film') { fs += 1; if (seen) fv += 1; } else { ss += 1; if (seen) sv += 1; }
      }
      counts.textContent = `Films vus : ${fv} / ${fs} · Séries vues : ${sv} / ${ss}`;
    };
    const sync = () => {
      const p = getPrefs();
      select.value = p.vuJusqua || '';
      all.checked = !!p.toutAfficher;
      motion.checked = reducedMotion();
      renderCounts();
    };
    sync();
    onPrefs(sync);
  } catch (e) {
    counts.textContent = 'Réglages indisponibles : les données n’ont pas pu être chargées.';
  }
  select.addEventListener('change', () => {
    setPref('vuJusqua', select.value || null);
    announce(select.value ? 'Point de visionnage enregistré.' : 'Point de visionnage effacé.');
  });
  all.addEventListener('change', () => setPref('toutAfficher', all.checked));
  motion.addEventListener('change', () => setPref('reduireAnimations', motion.checked));

  // ?personnage=Q… : met en évidence les œuvres où le personnage apparaît
  const pid = new URLSearchParams(location.search).get('personnage');
  if (pid) {
    try {
      const s = await loadData('search.json');
      const c = s.characters.find((x) => x.id === pid);
      if (c) {
        const set = new Set(c.works);
        items.forEach((li) => li.classList.toggle('is-match', set.has(li.dataset.id)));
        items.forEach((li) => li.classList.toggle('is-dimmed', !set.has(li.dataset.id)));
        const note = document.createElement('p');
        note.className = 'notice';
        note.textContent = `${c.name} : ${set.size} œuvres mises en évidence.`;
        document.querySelector('.toolbar').after(note);
        announce(note.textContent);
      }
    } catch (e) { /* recherche indisponible */ }
  }
}

// -- fiche d'une œuvre -------------------------------------------------------------------
function initWork() {
  const fiche = document.querySelector('.fiche');
  if (!fiche) return;
  const actions = document.createElement('p');
  actions.className = 'fiche__actions';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'button';
  const sync = () => {
    const mine = getPrefs().vuJusqua === fiche.dataset.id;
    btn.textContent = mine ? 'Effacer mon point de visionnage' : 'J’ai vu jusqu’ici';
    btn.setAttribute('aria-pressed', String(mine));
  };
  btn.addEventListener('click', () => {
    const mine = getPrefs().vuJusqua === fiche.dataset.id;
    setPref('vuJusqua', mine ? null : fiche.dataset.id);
  });
  sync();
  onPrefs(sync);
  actions.append(btn);
  const dl = fiche.querySelector('.facts');
  if (dl) dl.after(actions);
  initWorkMarks(fiche, actions);
}

// « Vu » / « À voir » sur la fiche (mêmes marques que la liste et les frises, marks.js)
async function initWorkMarks(fiche, actions) {
  let works;
  try { ({ works } = await loadData('works.json')); } catch (e) { return; }
  const marks = createMarks(works);
  const w = marks.byId.get(fiche.dataset.id);
  if (!w) return;
  const grp = document.createElement('span');
  grp.className = 'work__marks fiche__marks';
  grp.setAttribute('role', 'group');
  grp.setAttribute('aria-label', 'Marquer cette œuvre');
  const mkBtn = (cls, text) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `mark-btn ${cls}`;
    b.textContent = text;
    return b;
  };
  const bVu = marks.released(w) ? mkBtn('mark-btn--vu', 'Vu') : null; // pas encore sortie : « À voir » seul
  const bAv = mkBtn('mark-btn--avoir', 'À voir');
  const sync = () => {
    const isV = marks.seen().has(w.id);
    const isW = marks.watch().has(w.id);
    if (bVu) bVu.setAttribute('aria-pressed', String(isV));
    bAv.setAttribute('aria-pressed', String(isW));
    fiche.classList.toggle('is-watch', isW && !isV);
  };
  [[bVu, 'vu'], [bAv, 'avoir']].forEach(([b, kind]) => {
    if (!b) return;
    b.addEventListener('click', () => { announce(marks.toggle(w, kind).msg); });
    grp.append(b);
  });
  actions.prepend(grp);
  sync();
  onPrefs(sync);
}

function initPrivacy() {
  const btn = document.querySelector('[data-clear-prefs]');
  const out = document.querySelector('[data-clear-status]');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    clearPrefs();
    // copie hors connexion : caches du site et service worker
    try {
      if (window.caches) await Promise.all((await caches.keys()).filter((k) => k.startsWith('frise-mcu-')).map((k) => caches.delete(k)));
      if (navigator.serviceWorker) await Promise.all((await navigator.serviceWorker.getRegistrations()).map((r) => r.unregister()));
    } catch (e) { /* stockage indisponible */ }
    if (out) out.textContent = 'Vos réglages et la copie hors connexion ont été effacés de cet appareil (la copie se reconstitue si vous revenez sur le site).';
  });
}

applyMotion();
onPrefs(() => { applyMotion(); applyStatuses(); });
applyStatuses();
initSpoilers(document);
document.querySelectorAll('[data-search]').forEach((c) => initSearch(c));
if (page === 'index') initIndex();
if (page === 'oeuvre') initWork();
if (page === 'page-confidentialite') initPrivacy();
if (page === 'comparer') import('./comparer.js').then((m) => m.initCompare()).catch(() => {});
initToTop(window); // flèche « Revenir en haut »
registerOffline(); // consultation hors connexion (sw.js)
export { announce, formatDateFr };
