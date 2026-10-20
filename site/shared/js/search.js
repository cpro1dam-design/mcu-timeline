// Recherche globale : combobox au modèle APG du W3C (liste de suggestions groupées, activedescendant).
// Insensible aux accents et à la casse ; titres français et originaux, personnages récurrents (par nom,
// alias ou interprète).
// Les résultats sont séparés par nature (Films, Séries, Personnages) et chaque
// option dit ce qu'elle est. Dans une maquette, choisir un résultat reste sur la page (Archives de
// l'œuvre, ou mode Personnages) ; ailleurs, il mène à la fiche.

import { loadData, siteRoot } from './data.js';

const norm = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ').trim();
const KIND = { film: 'Film', series: 'Série', special: 'Épisode spécial' };
const GROUPS = [
  { key: 'film', label: 'Films', max: 5 },
  { key: 'series', label: 'Séries', max: 4 },
  { key: 'character', label: 'Personnages', max: 5 },
];

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

export function initSearch(container, { onWork = null, onCharacter = null } = {}) {
  const input = container.querySelector('[role="combobox"]');
  const list = container.querySelector('[role="listbox"]');
  if (!input || !list) return;
  let index = null;
  let options = [];
  let active = -1;

  async function ensureIndex() {
    if (index) return index;
    const data = await loadData('search.json');
    index = [
      ...data.works.map((w) => ({ group: w.kind === 'film' ? 'film' : 'series', id: w.id, label: w.fr, badge: KIND[w.kind] || 'Œuvre',
        sub: [w.vo !== w.fr ? w.vo : '', w.year].filter(Boolean).join(' · '),
        keys: norm(`${w.fr} ${w.vo}`), href: `${siteRoot()}oeuvres/${w.slug}/` })),
      ...data.characters.map((c) => ({ group: 'character', id: c.id, label: c.name, badge: 'Personnage',
        sub: `${c.works.length} œuvres`, keys: norm([c.name, ...(c.aka || []), ...(c.actors || [])].join(' ')), aka: c.aka || [], actors: c.actors || [],
        href: `${siteRoot()}concepts/c-horizon/?mode=personnages&personnage=${encodeURIComponent(c.id)}` })),
    ];
    return index;
  }

  function close() {
    list.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    active = -1;
  }

  function setActive(i) {
    options.forEach((o, j) => o.el.setAttribute('aria-selected', String(i === j)));
    active = i;
    if (i >= 0) {
      input.setAttribute('aria-activedescendant', options[i].el.id);
      options[i].el.scrollIntoView({ block: 'nearest' });
    } else {
      input.removeAttribute('aria-activedescendant');
    }
  }

  function choose(hit) {
    close();
    if (hit.group === 'character' && onCharacter) { input.value = ''; onCharacter(hit.id); return; }
    if (hit.group !== 'character' && onWork) { input.value = ''; onWork(hit.id); return; }
    location.href = hit.href;
  }

  async function update() {
    const raw = input.value.trim();
    const q = norm(raw);
    list.replaceChildren();
    options = [];
    if (q.length < 2) { close(); return; }
    const idx = await ensureIndex();
    const rank = (x) => (x.keys.startsWith(q) ? 0 : (x.keys.includes(` ${q}`) ? 1 : 2));
    const all = idx.filter((x) => x.keys.includes(q)).sort((a, b) => rank(a) - rank(b));
    if (!all.length) {
      const li = el('li', 'search__empty', `Aucun film, série, personnage ou acteur ne correspond à « ${raw} »`);
      li.setAttribute('role', 'option');
      li.setAttribute('aria-disabled', 'true');
      li.id = 'recherche-vide';
      list.append(li);
    }
    GROUPS.forEach((g) => {
      const hits = all.filter((x) => x.group === g.key);
      if (!hits.length) return;
      // listbox > li (none) > ul (group, nommé par son intitulé) > intitulé + options
      const grp = el('li', 'search__group');
      grp.setAttribute('role', 'none');
      const ul = el('ul');
      ul.setAttribute('role', 'group');
      const head = el('li', 'search__group-label', hits.length > g.max ? `${g.label} · ${g.max} sur ${hits.length}` : `${g.label} · ${hits.length}`);
      head.setAttribute('role', 'presentation');
      head.id = `recherche-groupe-${g.key}`;
      ul.setAttribute('aria-labelledby', head.id);
      ul.append(head);
      hits.slice(0, g.max).forEach((h) => {
        const li = el('li', 'search__option');
        li.id = `recherche-option-${options.length}`;
        li.setAttribute('role', 'option');
        li.setAttribute('aria-selected', 'false');
        const main = el('span', 'search__label-main', h.label);
        const badge = el('span', 'search__badge', h.badge);
        const alias = h.aka && !norm(h.label).includes(q) ? h.aka.find((x) => norm(x).includes(q)) : null;
        const actor = !alias && h.actors && !norm(h.label).includes(q) ? h.actors.find((x) => norm(x).includes(q)) : null;
        const sub = el('span', 'search__sub', alias ? `alias ${alias} · ${h.sub}` : actor ? `joué par ${actor} · ${h.sub}` : h.sub);
        li.append(main, badge, sub);
        li.addEventListener('mousedown', (e) => { e.preventDefault(); choose(h); });
        ul.append(li);
        options.push({ el: li, hit: h });
      });
      grp.append(ul);
      list.append(grp);
    });
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    setActive(-1);
  }

  input.addEventListener('input', update);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (list.hidden) update(); else if (options.length) setActive((active + 1) % options.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (options.length) setActive(active <= 0 ? options.length - 1 : active - 1);
    } else if (e.key === 'Enter') {
      if (active >= 0) { e.preventDefault(); choose(options[active].hit); }
    } else if (e.key === 'Escape') {
      if (!list.hidden) { e.preventDefault(); close(); } else { input.value = ''; }
    }
  });
  input.addEventListener('blur', () => setTimeout(close, 120));
}
