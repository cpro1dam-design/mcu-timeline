// Ordres et géométrie communs aux deux frises. Aucune donnée inventée : la position vient soit de la
// date de sortie (échelle de temps), soit du rang (ordre de sortie ou ordre de l'histoire).
// L'année « dans l'histoire » n'existe pas dans les sources : l'ordre de l'histoire est un rang.

export function mainDate(w) {
  const r = w.release || {};
  return r.fr || r.us || r.first || null;
}

export function dateToNumber(d) {
  if (!d) return null;
  const [y, m = '07', dd = '01'] = d.v.split('-');
  return Date.UTC(Number(y), Number(m) - 1, Number(dd)) / 86400000;
}

export function sortWorks(works, order = 'release') {
  const key = order === 'story' ? (w) => w.story.v : (w) => w.order_release.v;
  return [...works].sort((a, b) => key(a) - key(b));
}

// Couloir (lane) d'une œuvre selon son univers (taxonomy.universes[].lane).
export function laneOf(w, taxonomy) {
  const u = taxonomy.universes.find((x) => x.id === (w.universe && w.universe.v));
  return u ? u.lane : 0;
}

/**
 * Branches d'univers dans l'ordre courant : pour chaque couloir ≠ 0, la suite de ses œuvres,
 * l'œuvre principale qui la précède (point de bifurcation) et la jonction si elle est sourcée.
 */
export function branches(works, taxonomy, order = 'release') {
  const list = sortWorks(works, order);
  const res = [];
  taxonomy.universes.filter((u) => !u.main).forEach((u) => {
    const ids = list.filter((w) => laneOf(w, taxonomy) === u.lane).map((w) => w.id);
    if (!ids.length) return;
    const firstIdx = list.findIndex((w) => w.id === ids[0]);
    const fork = [...list.slice(0, firstIdx)].reverse().find((w) => laneOf(w, taxonomy) === 0);
    res.push({ universe: u.id, label: u.label_fr, lane: u.lane, ids, fork: fork ? fork.id : null, join: null });
  });
  return res;
}

// Projection du cadran (Éphémérides)
export function spiral(t, lane, { cx, cy, r0, r1, turns = 1.5, start = -Math.PI / 2, laneGap = 18 }) {
  const ang = start + t * turns * Math.PI * 2;
  const r = r0 + (r1 - r0) * t + lane * laneGap;
  return { x: cx + r * Math.cos(ang), y: cy + r * Math.sin(ang), angle: ang };
}
