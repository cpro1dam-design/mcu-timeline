// Les deux frises du site : Éphémérides (le cadran) et Fil noir (la frise). On passe de l'une à l'autre
// sans perdre sa place : le lien reprend l'adresse en cours (mode, ordre, filtre, personnage, œuvre ouverte
// dans les Archives…) ; le niveau de zoom reste propre à chaque frise. Les réglages et les marques « vu » /
// « à voir » sont communs (même stockage local).
// Place : en tête de Réglages (fenêtre sur ordinateur, panneau du bas sur téléphone), deux vignettes :
// une miniature dessinée de chaque frise (shared/img/apercu-*.svg ; choix de l'utilisateur, 19/10/2026).

export const VERSIONS = [
  { concept: 'a', dir: 'a-astrolabe', name: 'Éphémérides', desc: 'le cadran', img: new URL('../img/apercu-ephemerides.svg', import.meta.url).href },
  { concept: 'c', dir: 'c-horizon', name: 'Fil noir', desc: 'la frise', img: new URL('../img/apercu-fil-noir.svg', import.meta.url).href },
];
const DROP = ['level', 'affiche', 'vignette', 'apercu']; // propres à une frise (ou anciennes adresses)

export function versionHref(v, extra = {}) {
  const q = new URLSearchParams(location.search);
  DROP.forEach((k) => q.delete(k));
  Object.entries(extra).forEach(([k, val]) => { if (val === null) q.delete(k); else q.set(k, val); });
  const s = q.toString();
  return `../${v.dir}/index.html${s ? `?${s}` : ''}`;
}

function mk(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

export function initVersionSwitch(concept) {
  const body = document.querySelector('.c-settings__body');
  if (!body || !VERSIONS.some((v) => v.concept === concept)) return null;
  const nav = mk('nav', 'c-versions');
  nav.setAttribute('aria-labelledby', 'versions-t');
  const t = mk('p', 'c-versions__t', 'Frise');
  t.id = 'versions-t';
  const list = mk('ul', 'c-versions__list');
  VERSIONS.forEach((v) => {
    const here = v.concept === concept;
    const li = mk('li');
    const a = mk('a', 'c-version');
    if (here) a.setAttribute('aria-current', 'page');
    const view = mk('span', 'c-version__view');
    const img = mk('img');
    img.src = v.img;
    img.alt = '';
    img.width = 160;
    img.height = 100;
    img.decoding = 'async';
    view.append(img);
    const name = mk('span', 'c-version__name', v.name);
    const desc = mk('span', 'c-version__d', here ? 'vous êtes ici' : v.desc);
    a.append(view, name, desc);
    // adresse lue au dernier moment : elle change pendant la visite (mode, œuvre ouverte…)
    const upd = () => { a.href = versionHref(v); };
    upd();
    ['pointerdown', 'focus', 'click'].forEach((ev) => a.addEventListener(ev, upd));
    li.append(a);
    list.append(li);
  });
  nav.append(t, list);
  body.prepend(nav);
  return nav;
}
