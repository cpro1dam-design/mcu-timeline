// Spoilers réellement masqués : le contenu reste dans un <template> (ni affiché, ni lu par les
// lecteurs d'écran, ni trouvé par Ctrl+F) tant qu'il n'est pas révélé.
// - intrigue complète (data-spoiler="plot") : seulement sur demande (bouton), œuvre vue ou non ;
// - caméos : révélés d'office pour une œuvre vue ou avec « Tout afficher ».

import { getPrefs, onPrefs } from './prefs.js';
import { loadData } from './data.js';

let orderById = null;

async function ensureOrders() {
  if (orderById) return orderById;
  try {
    const data = await loadData('works.json');
    orderById = new Map(data.works.map((w) => [w.id, w.order_release.v]));
  } catch (e) {
    orderById = new Map();
  }
  return orderById;
}

// Une œuvre est « vue » si elle est marquée vue (écran « Vus et à voir ») ou si elle sort au plus tard
// la dernière œuvre vue (« J'ai vu jusqu'à… », ordre de sortie).
export async function isSeen(workId) {
  const { vuJusqua, vus } = getPrefs();
  if (Array.isArray(vus) && vus.includes(workId)) return true;
  if (!vuJusqua) return false;
  const orders = await ensureOrders();
  const limit = orders.get(vuJusqua);
  const mine = orders.get(workId);
  return limit !== undefined && mine !== undefined && mine <= limit;
}

// même règle, d'un coup et sans attente, pour une liste d'œuvres chargée (works.json)
export function seenIds(works) {
  const { vuJusqua, vus } = getPrefs();
  const set = new Set(Array.isArray(vus) ? vus : []);
  const lim = vuJusqua ? works.find((w) => w.id === vuJusqua) : null;
  const L = lim && lim.order_release ? lim.order_release.v : null;
  if (L !== null) works.forEach((w) => { if (w.order_release && w.order_release.v <= L) set.add(w.id); });
  return set;
}

function labels(btn) {
  if (!btn.dataset.showLabel) btn.dataset.showLabel = btn.textContent.trim();
  return { show: btn.dataset.showLabel, hide: btn.dataset.hideLabel || 'Masquer' };
}

function show(box) {
  const btn = box.querySelector('.spoiler__reveal');
  const tpl = box.querySelector('template.spoiler__content');
  if (!btn || !tpl || box.querySelector('.spoiler__shown')) return;
  const div = document.createElement('div');
  div.className = 'spoiler__shown';
  div.id = `${box.dataset.spoiler}-${box.dataset.work}-contenu`;
  div.append(tpl.content.cloneNode(true));
  btn.after(div);
  btn.setAttribute('aria-expanded', 'true');
  btn.setAttribute('aria-controls', div.id);
  btn.textContent = labels(btn).hide;
}

function hide(box) {
  const btn = box.querySelector('.spoiler__reveal');
  const shown = box.querySelector('.spoiler__shown');
  if (shown) shown.remove();
  if (btn) {
    btn.setAttribute('aria-expanded', 'false');
    btn.removeAttribute('aria-controls');
    btn.textContent = labels(btn).show;
  }
}

async function applyAuto(root) {
  const { toutAfficher } = getPrefs();
  for (const box of root.querySelectorAll('.spoiler')) {
    if (box.dataset.manual || box.dataset.spoiler === 'plot') continue; // l'intrigue : au clic seulement
    const auto = toutAfficher || (await isSeen(box.dataset.work));
    if (auto) show(box); else hide(box);
  }
}

export function refreshSpoilers(root) {
  return applyAuto(root);
}

let delegated = false;

export function initSpoilers(root = document) {
  if (!delegated) {
    delegated = true;
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('.spoiler__reveal');
      if (!btn) return;
      const box = btn.closest('.spoiler');
      box.dataset.manual = 'true';
      if (btn.getAttribute('aria-expanded') === 'true') hide(box); else show(box);
    });
    onPrefs(() => {
      document.querySelectorAll('.spoiler').forEach((b) => delete b.dataset.manual);
      applyAuto(document);
    });
  }
  applyAuto(root);
}
