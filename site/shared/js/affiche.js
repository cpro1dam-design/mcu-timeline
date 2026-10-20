// Affiche d'une œuvre, pour les frises sur téléphone (l'affiche d'abord, le texte ensuite).
// - Affiche TMDB si le pipeline l'a téléchargée (w.poster) : image décorative (alt vide), le titre est
//   toujours écrit à côté ou annoncé.
// - Sinon, affiche provisoire dessinée en CSS : aucune image, aucune donnée inventée. Elle ne reprend
//   que des champs sourcés (phase, titre) ; sa composition (halo, rayons) varie d'une œuvre à
//   l'autre selon son identifiant, pour que deux affiches voisines ne se ressemblent pas.
import { siteRoot } from './data.js';

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX'];

function mk(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined && text !== null) n.textContent = text;
  return n;
}

// petit hachage FNV-1a : même identifiant, même composition
function hash(s) {
  let x = 2166136261;
  for (let i = 0; i < s.length; i += 1) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619); }
  return x >>> 0;
}

// composition de l'affiche provisoire (halo, rayons) selon l'identifiant ; CSSOM, permis par la CSP
// (contrairement à un attribut style) : sert aussi aux affiches écrites par build_site.py (accueil)
export function phVars(el, id) {
  const k = hash(id || '');
  el.style.setProperty('--ph-x', `${22 + (k % 57)}%`);
  el.style.setProperty('--ph-y', `${18 + ((k >>> 6) % 30)}%`);
  el.style.setProperty('--ph-a', `${(k >>> 12) % 360}deg`);
}

export function afficheEl(w, { size = 'w342', cls = '' } = {}) {
  const src = w.poster && (w.poster[size] || w.poster.w342);
  if (src) {
    const img = mk('img', `c-affiche ${cls}`.trim());
    img.src = `${siteRoot()}${src}`;
    img.alt = '';
    img.width = 342; img.height = 513;
    img.loading = 'lazy';
    img.decoding = 'async';
    return img;
  }
  const el = mk('span', `c-affiche c-affiche--ph ${cls}`.trim());
  el.setAttribute('aria-hidden', 'true');
  if (w.phase) el.dataset.phase = String(w.phase.v);
  phVars(el, w.id); // position du halo et angle des rayons
  // la phase et l'année sont écrites à côté de l'affiche (carte, cartel) : l'affiche provisoire ne garde
  // que l'emblème de la phase et le titre, comme une vraie affiche
  el.append(
    mk('span', 'c-affiche__roman', w.phase ? ROMAN[w.phase.v] || '' : ''),
    mk('span', 'c-affiche__t', w.title_fr ? w.title_fr.v : ''),
    mk('span', 'c-affiche__tag', 'Affiche provisoire'),
  );
  return el;
}
