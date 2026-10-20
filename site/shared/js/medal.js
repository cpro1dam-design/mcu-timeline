// Médaillon d'un personnage (pas de photo) : ses initiales, dans un anneau découpé aux couleurs des
// phases où il apparaît (œuvres hors caméos). Décoratif (aria-hidden) : le nom est toujours écrit à côté.
// Utilisé par la galerie et la fiche des personnages (shell.js) et par les Apparitions des Archives.
//
//   const medal = createMedals(taxonomy);
//   medal('Tony Stark', [1, 2, 3]);   // <span class="c-medal">TS</span>

const STOP = /^(le|la|les|l|de|du|des|d|the|of)$/i;

export function initials(name) {
  const ws = String(name).replace(/[’'.]/g, ' ').split(/[\s-]+/).filter((w) => w && !STOP.test(w));
  if (!ws.length) return String(name).slice(0, 2).toUpperCase();
  return (ws.length > 1 ? ws[0][0] + ws[ws.length - 1][0] : ws[0].slice(0, 2)).toUpperCase();
}

export function createMedals(taxonomy) {
  const phaseColor = new Map(((taxonomy && taxonomy.phases) || []).map((p) => [p.n, p.color]));
  return function medal(name, phases = []) {
    const phs = [...new Set(phases)].sort((a, b) => a - b);
    const m = document.createElement('span');
    m.className = 'c-medal';
    m.textContent = initials(name);
    m.setAttribute('aria-hidden', 'true');
    const k = phs.length;
    if (k) {
      const seg = 360 / k; const gap = k > 1 ? 4 : 0;
      const stops = phs.map((n, i) => {
        const a = i * seg; const b = (i + 1) * seg - gap; const c = phaseColor.get(n) || '#C4C4CC';
        return `${c} ${a.toFixed(1)}deg ${b.toFixed(1)}deg${gap ? `, transparent ${b.toFixed(1)}deg ${((i + 1) * seg).toFixed(1)}deg` : ''}`;
      });
      m.style.setProperty('--medal-ring', `conic-gradient(${stops.join(', ')})`);
    }
    return m;
  };
}
