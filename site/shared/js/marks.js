// « Vus et à voir » : état et actions communs à la grande fenêtre des frises (vus.js) et à la page
// d'accueil (vus-liste.js).
// - deux listes de QID gardées sur l'appareil (prefs.js : vus, aVoir) ; « J'ai vu jusqu'à… » reste un
//   raccourci, converti en liste à la première marque posée ;
// - une œuvre pas encore sortie peut être « à voir », pas « vue » ;
// - filtre (prefs.js : filtreVu) commun aux frises et à la liste ; jamais de liste vide : un filtre qui ne
//   montre plus rien revient à « toutes ».

import { getPrefs, setPref } from './prefs.js';
import { seenIds } from './spoilers.js';
import { mainDate } from './layout.js';
import { statusOf, todayParis } from './dates.js';

export const SEEN_FILTERS = [
  ['tous', 'Toutes'], ['vus', 'Vues'], ['pasvus', 'Pas encore vues'], ['avoir', 'À voir'],
];
export const FILTER_SHORT = { vus: 'vues', pasvus: 'pas encore vues', avoir: 'à voir' };

const asSet = (x) => new Set(Array.isArray(x) ? x : []);

// filtre : liste réduite aux œuvres vues, pas encore vues ou à voir (tout si « tous »)
export function seenFilter(list, allWorks) {
  const f = getPrefs().filtreVu;
  if (!f || f === 'tous') return list;
  if (f === 'avoir') { const w = asSet(getPrefs().aVoir); return list.filter((x) => w.has(x.id)); }
  const seen = seenIds(allWorks);
  return list.filter((x) => (f === 'vus' ? seen.has(x.id) : !seen.has(x.id)));
}

export function createMarks(works) {
  const today = todayParis();
  const byId = new Map(works.map((w) => [w.id, w]));
  const released = (w) => { const d = mainDate(w); return !!d && statusOf(d.v, d.precision, today).key === 'released'; };
  const watch = () => asSet(getPrefs().aVoir);
  const seen = () => seenIds(works);
  // « J'ai vu jusqu'à… » devient une liste dès qu'on marque une œuvre (on peut alors en retirer une)
  function seenList() {
    const p = getPrefs();
    if (!p.vuJusqua) return asSet(p.vus);
    const s = seen();
    setPref('vuJusqua', null);
    return s;
  }
  const keep = (set) => [...set].filter((id) => byId.has(id));
  function counts() {
    const s = seen(); const w = watch();
    const n = { tous: works.length, vus: 0, pasvus: 0, avoir: 0 };
    works.forEach((x) => { if (s.has(x.id)) n.vus += 1; else n.pasvus += 1; if (w.has(x.id)) n.avoir += 1; });
    return n;
  }
  function save(s, wl) {
    setPref('vus', keep(s));
    setPref('aVoir', keep(wl));
    // filtre devenu vide (plus aucune œuvre vue, par exemple) : tout est de nouveau affiché
    const f = getPrefs().filtreVu;
    if (f && f !== 'tous' && !counts()[f]) setPref('filtreVu', 'tous');
  }

  // une œuvre : kind « vu » ou « avoir » ; renvoie { ok, msg } (message à annoncer)
  function toggle(w, kind) {
    const t = w.title_fr ? w.title_fr.v : w.id;
    if (kind === 'vu' && !released(w)) return { ok: false, msg: `${t} n’est pas encore sortie : vous pouvez la marquer « à voir ».` };
    const s = seenList();
    const wl = watch();
    let msg;
    if (kind === 'vu') {
      if (s.has(w.id)) { s.delete(w.id); msg = 'retirée des œuvres vues'; } else { s.add(w.id); wl.delete(w.id); msg = 'vue'; }
    } else if (wl.has(w.id)) { wl.delete(w.id); msg = 'retirée des œuvres à voir'; } else { wl.add(w.id); s.delete(w.id); msg = 'à voir'; }
    save(s, wl);
    return { ok: true, msg: `${t} : ${msg}.` };
  }

  // une phase : « vu » = toutes ses œuvres sorties vues ; « à voir » = toutes celles pas encore vues à voir
  function phaseState(ws, kind, s = seen(), wl = watch()) {
    if (kind === 'vu') {
      const out = ws.filter(released);
      return { all: out.length > 0 && out.every((w) => s.has(w.id)), possible: out.length > 0 };
    }
    const todo = ws.filter((w) => !s.has(w.id));
    return { all: todo.length > 0 && todo.every((w) => wl.has(w.id)), possible: todo.length > 0 };
  }
  // toute la phase d'un geste ; si elle l'est déjà, la marque est retirée. Renvoie le message, ou null.
  function markPhase(ws, kind, phName) {
    const st = phaseState(ws, kind);
    if (!st.possible) return null;
    const s = seenList();
    const wl = watch();
    let n = 0;
    let msg;
    if (kind === 'vu') {
      ws.filter(released).forEach((w) => { if (st.all) { if (s.delete(w.id)) n += 1; } else if (!s.has(w.id)) { s.add(w.id); wl.delete(w.id); n += 1; } });
      msg = st.all ? `${phName} : ${n} ${n > 1 ? 'œuvres retirées' : 'œuvre retirée'} des œuvres vues.` : `${phName} : ${n} ${n > 1 ? 'œuvres marquées vues' : 'œuvre marquée vue'}.`;
    } else {
      ws.filter((w) => !s.has(w.id)).forEach((w) => { if (st.all) { if (wl.delete(w.id)) n += 1; } else if (!wl.has(w.id)) { wl.add(w.id); n += 1; } });
      msg = st.all ? `${phName} : ${n} ${n > 1 ? 'œuvres retirées' : 'œuvre retirée'} des œuvres à voir.` : `${phName} : ${n} ${n > 1 ? 'œuvres ajoutées' : 'œuvre ajoutée'} aux œuvres à voir.`;
    }
    save(s, wl);
    return msg;
  }

  // choisir ce que montre la frise / la liste ; renvoie le message, ou null si ce choix ne montrerait rien
  function setFilter(key) {
    const n = counts();
    if (key !== 'tous' && !n[key]) return null;
    setPref('filtreVu', key);
    return key === 'tous' ? 'Toutes les œuvres sont affichées.' : `Œuvres ${FILTER_SHORT[key]} : ${n[key]}.`;
  }

  return { byId, released, seen, watch, counts, toggle, phaseState, markPhase, setFilter };
}
