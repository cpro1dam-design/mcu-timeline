// Réglages du visiteur, stockés uniquement sur son appareil (localStorage, clé unique versionnée).
// Exemptés de consentement (CNIL 2020-091, art. 5) : personnalisation demandée par l'utilisateur.
// Toute lecture/écriture est protégée : navigation privée, stockage bloqué ou ?storage=off.

const KEY = 'frise-mcu:prefs:v1';
const DEFAULTS = Object.freeze({
  vuJusqua: null,          // QID de la dernière œuvre vue
  toutAfficher: false,
  reduireAnimations: null, // null = suivre le système
  ordre: 'release',
  disposition: 'codex',
  cielEnPause: false,
  seriesVisibles: true,
  vus: [],                 // QID des œuvres vues (écran « Vus et à voir »)
  aVoir: [],               // QID des œuvres à voir
  filtreVu: 'tous',        // frise : tous | vus | pasvus | avoir
});

const storageOff = new URLSearchParams(location.search).get('storage') === 'off';
let memory = { ...DEFAULTS };
const listeners = new Set();

function read() {
  if (storageOff) return { ...memory };
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { ...memory };
    const data = JSON.parse(raw);
    return { ...DEFAULTS, ...(data && typeof data === 'object' ? data : {}) };
  } catch (e) {
    return { ...memory };
  }
}

export function getPrefs() {
  return read();
}

export function setPref(name, value) {
  if (!(name in DEFAULTS)) return;
  const next = { ...read(), [name]: value };
  memory = next;
  if (!storageOff) {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(next));
    } catch (e) { /* stockage indisponible : réglage gardé en mémoire */ }
  }
  listeners.forEach((fn) => fn(next, name));
}

export function clearPrefs() {
  memory = { ...DEFAULTS };
  if (!storageOff) {
    try { window.localStorage.removeItem(KEY); } catch (e) { /* rien */ }
  }
  listeners.forEach((fn) => fn({ ...memory }, '*'));
}

export function onPrefs(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

window.addEventListener('storage', (e) => {
  if (e.key === KEY) listeners.forEach((fn) => fn(read(), '*'));
});

export function reducedMotion() {
  const p = read().reduireAnimations;
  const url = new URLSearchParams(location.search).get('motion');
  if (url === 'reduce') return true;
  if (url === 'full') return false;
  if (p !== null) return p;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
