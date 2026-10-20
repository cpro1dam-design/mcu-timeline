// Zoom sémantique commun : 4 niveaux (N0 sagas, N1 phases, N2 œuvres, N3 carte enrichie).
// Commandes : boutons visibles (alternative aux gestes, WCAG 2.5.1 / 2.5.7), clavier quand le
// composant a le focus (+ − 0, jamais Ctrl/Cmd, WCAG 2.1.4), pincement à deux doigts sur la zone.
// Le zoom du navigateur n'est jamais bloqué (pas de user-scalable=no, Ctrl+molette libre).
// N3 n'ouvre jamais la vue Archives tout seul : seule une action explicite le fait.

export const LEVELS = [
  { id: 0, key: 'sagas', label: 'Vue : sagas', spoken: 'Vue des sagas' },
  { id: 1, key: 'phases', label: 'Vue : phases', spoken: 'Vue des phases' },
  { id: 2, key: 'oeuvres', label: 'Vue : œuvres', spoken: 'Vue des œuvres' },
  { id: 3, key: 'detail', label: 'Vue : détail', spoken: 'Vue détaillée' },
];

// `skip` : niveaux absents d'une maquette (ex. [1] : le mode Phases tient déjà ce rôle) ; `labels` :
// libellés propres à une maquette ({ 0: { label, spoken } }).
export function createZoom({ root, initial = 2, skip = [], labels = {}, announce = () => {}, onLevel = () => {} }) {
  const ids = LEVELS.map((l) => l.id).filter((id) => !skip.includes(id));
  const info = (n) => ({ ...LEVELS[n], ...(labels[n] || {}) });
  // niveau permis le plus proche, dans le sens demandé d'abord
  const snap = (n, dir) => {
    const c = Math.max(ids[0], Math.min(ids[ids.length - 1], n));
    if (ids.includes(c)) return c;
    const fwd = dir >= 0 ? ids.find((id) => id > c) : [...ids].reverse().find((id) => id < c);
    return fwd !== undefined ? fwd : ids.reduce((b, id) => (Math.abs(id - c) < Math.abs(b - c) ? id : b));
  };
  let level = snap(initial, 1);
  let buttons = null;
  const home = level;

  function set(n, source = 'api') {
    const next = snap(n, Math.sign(n - level) || 1);
    if (next === level && source !== 'init') return;
    const prev = level;
    level = next;
    if (root) root.dataset.zoom = LEVELS[level].key;
    sync();
    onLevel(level, prev, { source });
    if (source !== 'init') announce(info(level).spoken + '.');
  }
  // niveau voisin (+1 : zoomer, −1 : dézoomer), en sautant les niveaux absents
  const neighbor = (dir) => ids[Math.max(0, Math.min(ids.length - 1, ids.indexOf(level) + dir))];

  function sync() {
    if (!buttons) return;
    const { zoomIn, zoomOut, label } = buttons;
    if (zoomIn) zoomIn.setAttribute('aria-disabled', String(level >= ids[ids.length - 1]));
    if (zoomOut) zoomOut.setAttribute('aria-disabled', String(level <= ids[0]));
    if (label) label.textContent = info(level).label;
  }

  const api = {
    get level() { return level; },
    get spoken() { return info(level).spoken; },
    get max() { return ids[ids.length - 1]; },
    get min() { return ids[0]; },
    neighbor,
    set: (n) => set(n, 'api'),
    in: () => set(neighbor(1), 'button'),
    out: () => set(neighbor(-1), 'button'),
    reset: () => set(home, 'button'),

    attachButtons(b) {
      buttons = b;
      const guard = (fn) => (e) => { if (e.currentTarget.getAttribute('aria-disabled') === 'true') return; fn(); };
      if (b.zoomIn) b.zoomIn.addEventListener('click', guard(api.in));
      if (b.zoomOut) b.zoomOut.addEventListener('click', guard(api.out));
      if (b.reset) b.reset.addEventListener('click', api.reset);
      sync();
    },

    // + − 0 seulement quand le focus est dans `container` ; jamais avec Ctrl/Cmd/Alt
    attachKeys(container) {
      container.addEventListener('keydown', (e) => {
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        const t = e.target;
        if (t.matches('input, select, textarea, [contenteditable="true"]')) return;
        if (e.key === '+' || e.key === '=' || e.code === 'NumpadAdd') { e.preventDefault(); set(neighbor(1), 'key'); }
        else if (e.key === '-' || e.code === 'NumpadSubtract') { e.preventDefault(); set(neighbor(-1), 'key'); }
        else if (e.key === '0' || e.code === 'Numpad0') { e.preventDefault(); set(home, 'key'); }
      });
    },

    // pincement à deux doigts sur la zone (seuils de rapport 1,25 / 0,8)
    attachPinch(el) {
      const pts = new Map();
      let startDist = 0;
      const dist = () => { const [a, b] = [...pts.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
      el.addEventListener('pointerdown', (e) => { pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (pts.size === 2) startDist = dist(); });
      el.addEventListener('pointermove', (e) => {
        if (!pts.has(e.pointerId)) return;
        pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pts.size === 2 && startDist) {
          const r = dist() / startDist;
          if (r > 1.25) { set(neighbor(1), 'pinch'); startDist = dist(); }
          else if (r < 0.8) { set(neighbor(-1), 'pinch'); startDist = dist(); }
        }
      });
      const end = (e) => { pts.delete(e.pointerId); if (pts.size < 2) startDist = 0; };
      el.addEventListener('pointerup', end);
      el.addEventListener('pointercancel', end);
    },
  };
  set(initial, 'init');
  return api;
}

// Garde un élément au même endroit de l'écran pendant une réorganisation (changement de niveau).
export function keepAnchor(scroller, anchor, mutate) {
  if (!anchor) { mutate(); return; }
  const before = anchor.getBoundingClientRect();
  mutate();
  const after = anchor.getBoundingClientRect();
  const s = scroller === document.documentElement || !scroller ? window : scroller;
  s.scrollBy({ left: after.left - before.left, top: after.top - before.top, behavior: 'instant' });
}
