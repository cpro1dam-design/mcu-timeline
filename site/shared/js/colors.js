// Code couleur des sagas et des phases. Les couleurs sont dans data/couleurs.css (généré depuis
// taxonomy.json) et s'appliquent par les attributs data-saga / data-phase ; cette légende les nomme,
// car la couleur n'est jamais la seule information (le chiffre romain ou le nom l'accompagne toujours).

function node(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

function swatch() {
  const s = node('span', 'color-key__sw');
  s.setAttribute('aria-hidden', 'true');
  return s;
}

export function colorKey(taxonomy, { title = true } = {}) {
  const wrap = node('section', 'color-key');
  const list = node('ul', 'color-key__list');
  if (title) {
    const h = node('h2', 'color-key__title', 'Code couleur');
    h.id = `h-couleurs-${Math.random().toString(36).slice(2, 7)}`;
    wrap.setAttribute('aria-labelledby', h.id);
    wrap.append(h);
  } else {
    wrap.setAttribute('aria-label', 'Code couleur');
  }
  (taxonomy.sagas || []).forEach((sg) => {
    const li = node('li', 'color-key__saga');
    li.dataset.saga = sg.id;
    li.append(swatch(), document.createTextNode(sg.label_fr), node('span', 'color-key__name', sg.color_name ? ` (${sg.color_name})` : ''));
    const sub = node('ul');
    (sg.phases || []).forEach((n) => {
      const p = (taxonomy.phases || []).find((x) => x.n === n);
      if (!p) return;
      const pl = node('li');
      pl.dataset.phase = String(n);
      pl.append(swatch(), document.createTextNode(`Phase ${p.roman}`), node('span', 'color-key__name', p.color_name ? ` (${p.color_name})` : ''));
      sub.append(pl);
    });
    li.append(sub);
    list.append(li);
  });
  wrap.append(list);
  return wrap;
}
