// Le fil noir : un tracé SVG unique (plus les branches d'univers), recalculé à chaque image pendant
// une réorganisation, pour un vrai re-routage (Safari n'anime pas la propriété CSS d).
// Deux traitements, choisis par classe CSS (thread--rim : Éphémérides | thread--ink : Fil noir) :
// la géométrie est commune, l'habillage est défini dans les styles de chaque frise.
// Le SVG est décoratif (aria-hidden) : l'information est dans la liste <ol>.

const NS = 'http://www.w3.org/2000/svg';

export function smoothPath(pts) {
  if (!pts.length) return '';
  if (pts.length === 1) return `M${pts[0].x},${pts[0].y}`;
  let d = `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i += 1) {
    const p0 = pts[i - 1] || pts[i]; const p1 = pts[i]; const p2 = pts[i + 1]; const p3 = pts[i + 2] || p2;
    const c1x = p1.x + (p2.x - p0.x) / 6; const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6; const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }
  return d;
}

const LAYERS = ['mask', 'glow', 'rim', 'core'];

function group(svg, cls) {
  const g = document.createElementNS(NS, 'g');
  g.setAttribute('class', cls);
  LAYERS.forEach((l) => {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('class', `thread__${l}`);
    p.setAttribute('fill', 'none');
    g.append(p);
  });
  svg.append(g);
  return g;
}

export function createThread(svg, { treatment = 'rim' } = {}) {
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.classList.add('thread', `thread--${treatment}`);
  const main = group(svg, 'thread__main');
  let branchGroups = [];
  let current = null; // { main: [{id,x,y}], branches: [{pts, open}] }
  let raf = 0;

  function render(state) {
    const d = smoothPath(state.main);
    main.querySelectorAll('path').forEach((p) => p.setAttribute('d', d));
    while (branchGroups.length < state.branches.length) branchGroups.push(group(svg, 'thread__branch'));
    branchGroups.forEach((g, i) => {
      const b = state.branches[i];
      const bd = b ? smoothPath(b.pts) : '';
      g.querySelectorAll('path').forEach((p) => p.setAttribute('d', bd));
      g.toggleAttribute('hidden', !b);
      if (b) {
        g.dataset.universe = b.universe;
        g.classList.toggle('is-open', !!b.open);
      }
    });
  }

  function lerpState(a, b, k) {
    const byA = new Map(a.main.map((p) => [p.id, p]));
    const main = b.main.map((p) => {
      const q = byA.get(p.id) || p;
      return { id: p.id, x: q.x + (p.x - q.x) * k, y: q.y + (p.y - q.y) * k };
    });
    const branches = b.branches.map((br, i) => {
      const old = a.branches[i];
      if (!old || old.pts.length !== br.pts.length) return br;
      return { ...br, pts: br.pts.map((p, j) => ({ x: old.pts[j].x + (p.x - old.pts[j].x) * k, y: old.pts[j].y + (p.y - old.pts[j].y) * k })) };
    });
    return { main, branches };
  }

  return {
    /**
     * @param {Array<{id,x,y}>} mainPts points du fil principal, dans l'ordre courant
     * @param {Array<{universe, pts:Array<{x,y}>, open:boolean}>} branchPts branches
     */
    set(mainPts, branchPts = [], { duration = 900, reduced = false } = {}) {
      const next = { main: mainPts, branches: branchPts };
      cancelAnimationFrame(raf);
      if (!current || reduced || duration <= 0) { current = next; render(next); return; }
      const from = current; const t0 = performance.now();
      const step = (now) => {
        const k = Math.min(1, (now - t0) / duration);
        const e = 1 - Math.pow(1 - k, 3);
        render(lerpState(from, next, e));
        if (k < 1) raf = requestAnimationFrame(step); else current = next;
      };
      raf = requestAnimationFrame(step);
    },
    highlight(on) { svg.classList.toggle('is-dimmed', !!on); },
    element: svg,
  };
}
