// Sauvegarder et reprendre ses marques « Vus et à voir » sans compte :
// - un fichier (Télécharger / Importer), à garder de côté ou à ouvrir sur un autre appareil ;
// - un lien à s'envoyer : ouvert sur un autre appareil, la liste des œuvres propose d'importer les
//   marques. Les marques sont après le # de l'adresse : le navigateur ne l'envoie jamais au serveur.
// À l'import : ajouter aux marques de l'appareil ou les remplacer (une œuvre vue n'est plus « à voir »).

import { getPrefs, setPref } from './prefs.js';
import { seenIds } from './spoilers.js';
import { siteRoot } from './data.js';

const APP = 'frise-mcu-marques';
const HASH = '#marques=';
const QID = /^Q[1-9]\d*$/;

function mk(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}
function button(cls, text) {
  const b = mk('button', cls, text);
  b.type = 'button';
  return b;
}
const plural = (n, one, many) => `${n} ${n > 1 ? many : one}`;
const summary = (m) => `${plural(m.vus.length, 'œuvre vue', 'œuvres vues')} et ${m.aVoir.length} à voir`;

// marques de l'appareil (« J'ai vu jusqu'à… » compris)
function readMarks(works) {
  const vus = seenIds(works);
  const av = new Set(Array.isArray(getPrefs().aVoir) ? getPrefs().aVoir : []);
  return { vus: [...vus], aVoir: [...av].filter((id) => !vus.has(id)) };
}

// lien : #marques=1.<vus>.<à voir>, numéros Wikidata séparés par des tirets
function encodeLink(m) {
  const n = (ids) => ids.map((q) => q.slice(1)).join('-');
  const url = new URL(`${siteRoot()}index.html`, location.href);
  url.search = '';
  url.hash = '';
  return `${url.href}${HASH}1.${n(m.vus)}.${n(m.aVoir)}`;
}
function decodeLink(hash) {
  if (!hash || !hash.startsWith(HASH)) return null;
  const [v, a = '', b = ''] = hash.slice(HASH.length).split('.');
  if (v !== '1') return null;
  const ids = (x) => x.split('-').filter((n) => /^[1-9]\d*$/.test(n)).map((n) => `Q${n}`);
  return { vus: ids(a), aVoir: ids(b) };
}
function parseFile(text) {
  const d = JSON.parse(text);
  if (!d || d.app !== APP || !Array.isArray(d.vus)) throw new Error('format');
  const ok = (x) => (Array.isArray(x) ? x.filter((q) => typeof q === 'string' && QID.test(q)) : []);
  return { vus: ok(d.vus), aVoir: ok(d.aVoir) };
}

function applyMarks(works, incoming, how) {
  const known = new Set(works.map((w) => w.id));
  const vusIn = incoming.vus.filter((id) => known.has(id));
  const avIn = incoming.aVoir.filter((id) => known.has(id));
  const cur = how === 'replace' ? { vus: [], aVoir: [] } : readMarks(works);
  const vus = new Set([...cur.vus, ...vusIn]);
  const av = new Set([...cur.aVoir, ...avIn]);
  vus.forEach((id) => av.delete(id));
  setPref('vuJusqua', null);
  setPref('vus', [...vus]);
  setPref('aVoir', [...av]);
  const f = getPrefs().filtreVu; // jamais de filtre qui ne montre plus rien
  if ((f === 'vus' && !vus.size) || (f === 'avoir' && !av.size) || (f === 'pasvus' && vus.size >= works.length)) setPref('filtreVu', 'tous');
  return { vus: vus.size, aVoir: av.size, ignored: incoming.vus.length + incoming.aVoir.length - vusIn.length - avIn.length };
}

let n = 0;

/**
 * Bloc repliable « Sauvegarder ou transférer mes marques ».
 * @param {{works: object[], announce?: Function, onChange?: Function}} opts
 * @returns {{element: HTMLElement, offer: Function}} offer(m, origine) : propose d'importer des marques
 */
export function marksTransfer({ works, announce = () => {}, onChange = () => {} }) {
  n += 1;
  const box = mk('details', 'marks-io');
  box.append(mk('summary', 'marks-io__s', 'Sauvegarder ou transférer mes marques'));
  const body = mk('div', 'marks-io__body');
  body.append(mk('p', 'marks-io__p', 'Pour garder vos marques de côté ou les retrouver sur un autre appareil : un fichier, ou un lien à vous envoyer. Aucun compte : rien ne part sur un serveur.'));
  const row = mk('div', 'marks-io__row');
  const bDl = button('mark-btn marks-io__b', 'Télécharger le fichier');
  const bUp = button('mark-btn marks-io__b', 'Importer un fichier');
  const bLink = button('mark-btn marks-io__b', 'Copier le lien');
  const file = mk('input', 'visually-hidden');
  file.type = 'file';
  file.accept = 'application/json,.json';
  file.tabIndex = -1;
  file.setAttribute('aria-hidden', 'true');
  row.append(bDl, bUp, bLink, file);
  const out = mk('div', 'marks-io__out');
  body.append(row, out);
  box.append(body);

  function say(text) { out.replaceChildren(mk('p', 'marks-io__msg', text)); announce(text); }

  bDl.addEventListener('click', () => {
    const m = readMarks(works);
    const day = new Date().toISOString().slice(0, 10);
    const blob = new Blob([JSON.stringify({ app: APP, version: 1, date: day, vus: m.vus, aVoir: m.aVoir }, null, 1)], { type: 'application/json' });
    const a = mk('a');
    a.href = URL.createObjectURL(blob);
    a.download = `frise-mcu-marques-${day}.json`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    say(`Fichier préparé : ${summary(m)}.`);
  });

  bUp.addEventListener('click', () => file.click());
  file.addEventListener('change', () => {
    const f = file.files && file.files[0];
    file.value = '';
    if (!f) return;
    f.text().then((t) => offer(parseFile(t), 'Fichier lu'))
      .catch(() => say('Ce fichier n’est pas une sauvegarde de marques de ce site.'));
  });

  bLink.addEventListener('click', () => {
    const m = readMarks(works);
    const link = encodeLink(m);
    // le lien reste affiché : on peut le sélectionner si la copie automatique est refusée
    const id = `marks-io-lien-${n}`;
    const lab = mk('label', 'marks-io__l', `Lien de vos marques (${summary(m)})`);
    lab.htmlFor = id;
    const field = mk('input', 'marks-io__field');
    field.id = id;
    field.readOnly = true;
    field.value = link;
    field.addEventListener('focus', () => field.select());
    const msg = mk('p', 'marks-io__msg');
    out.replaceChildren(lab, field, msg);
    const done = (ok) => {
      msg.textContent = ok ? 'Lien copié : envoyez-le-vous, puis ouvrez-le sur l’autre appareil.' : 'Copiez le lien ci-dessus, puis ouvrez-le sur l’autre appareil.';
      announce(msg.textContent);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(link).then(() => done(true), () => { field.focus(); done(false); });
    else { field.focus(); done(false); }
  });

  // marques reçues (fichier ou lien) : ajouter, remplacer ou annuler
  function offer(m, origin) {
    box.open = true;
    const id = `marks-io-offre-${n}`;
    const grp = mk('div', 'marks-io__confirm');
    grp.setAttribute('role', 'group');
    grp.setAttribute('aria-labelledby', id);
    const p = mk('p', 'marks-io__q', `${origin} : ${summary(m)}. Que faire de vos marques actuelles ?`);
    p.id = id;
    p.tabIndex = -1;
    const acts = mk('div', 'marks-io__row');
    const add = button('mark-btn marks-io__b', 'Ajouter aux miennes');
    const rep = button('mark-btn marks-io__b', 'Remplacer les miennes');
    const no = button('mark-btn marks-io__b', 'Annuler');
    const finish = (how) => {
      const r = applyMarks(works, m, how);
      onChange();
      say(`Marques importées : ${plural(r.vus, 'œuvre vue', 'œuvres vues')} et ${r.aVoir} à voir sur cet appareil.${r.ignored ? ` ${plural(r.ignored, 'œuvre inconnue ignorée', 'œuvres inconnues ignorées')}.` : ''}`);
      bUp.focus();
    };
    add.addEventListener('click', () => finish('add'));
    rep.addEventListener('click', () => finish('replace'));
    no.addEventListener('click', () => { say('Import annulé : vos marques n’ont pas changé.'); bUp.focus(); });
    acts.append(add, rep, no);
    grp.append(p, acts);
    out.replaceChildren(grp);
    p.focus();
  }

  return { element: box, offer };
}

// Lien de marques ouvert sur cet appareil : renvoie les marques qu'il porte (et retire le # de
// l'adresse, pour qu'un rechargement ne repropose pas l'import), sinon null.
export function takeLinkMarks() {
  const m = decodeLink(location.hash);
  if (!m) return null;
  const u = new URL(location.href);
  u.hash = '';
  history.replaceState(history.state, '', u);
  return m;
}
