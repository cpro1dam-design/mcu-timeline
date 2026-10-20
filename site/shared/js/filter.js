// Filtre par saga et par phase, commun aux maquettes et à la liste d'accueil.
// Une barre toujours visible, comme Sortie / Histoire : [Toutes | Infini | Multivers] (un clic), puis,
// quand une saga est choisie, ses phases en puces juste à côté ([Toute la saga | I | II | III]).
// Boutons à bascule (aria-pressed) en groupes nommés ; la couleur accompagne toujours un texte.
// Les sagas et phases viennent de taxonomy.json : une phase VII apparaît sans changer ce code.

function node(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

// ?phases=4,5,6 → Set de phases valides ; absent ou vide → toutes
export function phasesFromParam(value, taxonomy) {
  const all = taxonomy.phases.map((p) => p.n);
  const set = new Set(String(value || '').split(',').map(Number).filter((n) => all.includes(n)));
  return set.size ? set : new Set(all);
}

export function phasesToParam(set, taxonomy) {
  const all = taxonomy.phases.map((p) => p.n);
  return all.every((n) => set.has(n)) ? null : all.filter((n) => set.has(n)).join(',');
}

// texte court de l'état du filtre (annonces)
export function describePhases(set, taxonomy) {
  const all = taxonomy.phases;
  if (all.every((p) => set.has(p.n))) return 'toutes les phases';
  const sagas = taxonomy.sagas.filter((s) => s.phases.every((n) => set.has(n)));
  const loose = all.filter((p) => set.has(p.n) && !sagas.some((s) => s.phases.includes(p.n)));
  const parts = sagas.map((s) => s.label_fr.replace(/^La /, 'la '));
  if (loose.length) parts.push(`${loose.length > 1 ? 'phases' : 'phase'} ${loose.map((p) => p.roman).join(', ')}`);
  return parts.join(' et ');
}

// « La Saga de l’Infini » → « Infini »
export function sagaShort(sg) {
  const m = /^La Saga (?:de l[’']|du |de la |des |de )?(.+)$/i.exec(sg.label_fr || '');
  const s = m ? m[1] : (sg.label_fr || sg.id);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function swatch() {
  const s = node('span', 'color-key__sw');
  s.setAttribute('aria-hidden', 'true');
  return s;
}

/**
 * Un seul groupe compact, qui se déplie sur place (la barre d'en-tête tient sur une ligne) :
 *   aucune saga :      [Toutes] [Infini] [Multivers]
 *   saga choisie :     [‹] [Infini] [I] [II] [III]   (« ‹ » = toutes les sagas ; « Infini » = toute la saga)
 * Les boutons ne sont jamais recréés : le focus reste en place quand le groupe se déplie.
 * @param taxonomy  données taxonomy.json
 * @param opts.selected  Set initial (toutes les phases = aucun filtre)
 * @param opts.onChange  (Set) => void
 */
export function createPhaseFilter(taxonomy, { selected, onChange } = {}) {
  const allPhases = taxonomy.phases.map((p) => p.n);
  const wrap = node('div', 'c-sagafilter');
  const group = node('div', 'segmented c-sagafilter__group');
  group.setAttribute('role', 'group');
  wrap.append(group);

  const btnAll = node('button', 'c-sagafilter__all');
  btnAll.type = 'button';
  const allTxt = node('span', 'c-sagafilter__all-txt', 'Toutes');
  const backGlyph = node('span', 'c-sagafilter__back', '‹');
  backGlyph.setAttribute('aria-hidden', 'true');
  const backTxt = node('span', 'visually-hidden', 'Toutes les sagas');
  btnAll.append(allTxt, backGlyph, backTxt);
  group.append(btnAll);

  const sagaBtns = new Map();
  const phaseBtns = new Map(); // saga → [boutons de phase]
  taxonomy.sagas.forEach((sg) => {
    const b = node('button');
    b.type = 'button';
    b.dataset.saga = sg.id;
    b.setAttribute('aria-label', sg.label_fr);
    b.append(swatch(), document.createTextNode(sagaShort(sg)));
    group.append(b);
    sagaBtns.set(sg.id, b);
    const list = [];
    sg.phases.forEach((n) => {
      const p = taxonomy.phases.find((x) => x.n === n);
      if (!p) return;
      const pb = node('button', 'c-sagafilter__phase');
      pb.type = 'button';
      pb.dataset.phase = String(n);
      pb.setAttribute('aria-label', `Phase ${p.roman}`);
      pb.append(swatch(), document.createTextNode(p.roman));
      pb.addEventListener('click', () => { if (phase !== n) { phase = n; commit(); } });
      group.append(pb);
      list.push(pb);
    });
    phaseBtns.set(sg.id, list);
  });

  // état : saga choisie (ou null = toutes) et phase choisie dans la saga (ou null = toute la saga)
  let saga = null;
  let phase = null;
  function fromSet(set) {
    saga = null; phase = null;
    if (!set || allPhases.every((n) => set.has(n))) return;
    const sg = taxonomy.sagas.find((s) => [...set].every((n) => s.phases.includes(n)));
    if (!sg) return; // combinaison non représentable : on revient à « Toutes »
    saga = sg.id;
    if (set.size === 1 && sg.phases.length > 1) phase = [...set][0];
  }
  function toSet() {
    if (!saga) return new Set(allPhases);
    if (phase) return new Set([phase]);
    return new Set(taxonomy.sagas.find((s) => s.id === saga).phases);
  }

  function sync() {
    const sg = saga && taxonomy.sagas.find((s) => s.id === saga);
    group.setAttribute('aria-label', sg ? `Filtre : ${sg.label_fr.replace(/^La /, 'la ')} et ses phases` : 'Filtre par saga');
    btnAll.setAttribute('aria-pressed', String(!saga));
    allTxt.hidden = !!saga;
    backGlyph.hidden = !saga;
    backTxt.hidden = !saga;
    sagaBtns.forEach((b, id) => {
      b.hidden = !!saga && saga !== id;
      b.setAttribute('aria-pressed', String(saga === id && !phase));
    });
    phaseBtns.forEach((list, id) => list.forEach((pb) => {
      pb.hidden = saga !== id;
      pb.setAttribute('aria-pressed', String(phase === Number(pb.dataset.phase)));
    }));
    wrap.classList.toggle('is-active', !!saga);
  }
  function commit() {
    sync();
    if (onChange) onChange(toSet());
  }

  btnAll.addEventListener('click', () => { if (saga) { saga = null; phase = null; commit(); } });
  sagaBtns.forEach((b, id) => b.addEventListener('click', () => {
    if (saga === id && !phase) return;
    saga = id; phase = null; commit();
  }));

  fromSet(selected);
  sync();
  return {
    el: wrap,
    get: toSet,
    set(next) { fromSet(next); sync(); },
  };
}
