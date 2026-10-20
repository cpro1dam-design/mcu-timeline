// Chargement des données générées, avec gestion du cache par empreinte (manifest.json).

let manifestPromise = null;

function base() {
  // chemin relatif vers la racine du site, déduit de la feuille de style partagée
  const link = document.querySelector('link[href$="shared/css/base.css"]');
  return link ? link.getAttribute('href').replace('shared/css/base.css', '') : '';
}

export function siteRoot() {
  return base();
}

// empreintes écrites dans la page par build_site.py (meta frise-data) : pas d'aller-retour pour
// manifest.json, et l'adresse demandée est celle que la page a déjà préchargée
function embedded() {
  const m = document.querySelector('meta[name="frise-data"]');
  if (!m) return null;
  try { return { files: JSON.parse(m.content) }; } catch (e) { return null; }
}

function manifest() {
  if (!manifestPromise) {
    const e = embedded();
    if (e) return (manifestPromise = Promise.resolve(e));
    manifestPromise = fetch(`${base()}data/manifest.json`, { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
  }
  return manifestPromise;
}

const cache = new Map();

export async function loadData(name) {
  if (cache.has(name)) return cache.get(name);
  const p = (async () => {
    const m = await manifest();
    const v = m && m.files && m.files[name] ? `?v=${m.files[name]}` : '';
    const r = await fetch(`${base()}data/${name}${v}`);
    if (!r.ok) throw new Error(`Données indisponibles (${name})`);
    const data = await r.json();
    if (data.schema_version && data.schema_version > 1) {
      throw new Error('Nouvelle version des données : rechargez la page.');
    }
    return data;
  })();
  cache.set(name, p);
  return p;
}
