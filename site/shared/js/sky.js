// Ciel étoilé en WebGL1 : 2 appels de dessin (fond + nébuleuse procédurale, puis étoiles en points).
// - teinte animée vers la palette de l'œuvre centrée (setTint), étoiles toujours blanc neutre ;
// - aucune animation autonome : le ciel ne bouge qu'en réponse à l'utilisateur (parallaxe de setCamera,
//   quand la frise défile ou tourne) et lors des changements de teinte ; rien en mouvement réduit ;
// - 30 images/s maximum, résolution réduite, arrêt hors écran / onglet caché ;
// - perte de contexte gérée ; repli : ciel CSS statique (variables --sky, --nebula-1, --nebula-2).
// Le canvas est décoratif : aria-hidden="true" dans le HTML.

const VS_BG = `attribute vec2 p; varying vec2 v; void main(){ v = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }`;
const FS_BG = `precision mediump float;
varying vec2 v; uniform vec3 uSky; uniform vec3 uN1; uniform vec3 uN2; uniform vec2 uOff; uniform float uT; uniform vec2 uRes;
float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int k = 0; k < 5; k++) { s += a * n(p); p = p * 2.03 + 17.0; a *= 0.5; } return s; }
void main(){
  vec2 q = v; q.x *= uRes.x / uRes.y;
  vec2 o = uOff * 0.04;
  float w = fbm(q * 1.6 + o + vec2(uT * 0.004, 0.0));
  float m = fbm(q * 2.4 + vec2(w * 1.8) - o);
  float band = smoothstep(0.35, 0.85, m) * (0.55 + 0.45 * smoothstep(0.0, 1.0, 1.0 - abs(v.y - 0.55) * 1.6));
  vec3 top = uSky * 0.72; vec3 bottom = uSky * 1.12;
  vec3 col = mix(top, bottom, v.y < 0.5 ? 0.0 : 0.0) ;
  col = mix(top, bottom, 1.0 - v.y);
  vec3 neb = mix(uN1, uN2, smoothstep(0.2, 0.8, w));
  col = mix(col, neb, band * 0.42);
  float vig = smoothstep(1.25, 0.35, length(v - 0.5) * 1.4);
  gl_FragColor = vec4(col * (0.78 + 0.22 * vig), 1.0);
}`;
const VS_ST = `attribute vec2 a; attribute vec4 b; uniform float uT; uniform vec2 uOff; uniform float uDpr; uniform float uTw;
varying float vA; varying float vS;
void main(){
  float layer = b.w; vec2 pos = a + uOff * (0.004 + layer * 0.01);
  pos = fract(pos); gl_Position = vec4(pos * 2.0 - 1.0, 0.0, 1.0);
  float tw = 1.0 - uTw * 0.3 * (0.5 + 0.5 * sin(uT * 6.2831 / b.z + b.y * 6.2831));
  vA = (0.35 + 0.45 * layer) * tw; vS = b.x;
  gl_PointSize = b.x * uDpr;
}`;
const FS_ST = `precision mediump float; varying float vA; varying float vS;
void main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d);
  float core = smoothstep(0.5, 0.0, r); float glow = smoothstep(0.5, 0.15, r) * 0.35;
  float a = (core * core + glow) * vA; if (a < 0.01) discard;
  gl_FragColor = vec4(vec3(1.0, 0.98, 0.95) * a, a); }`;

function hexToRgb(h) {
  const x = h.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(x.slice(i, i + 2), 16) / 255);
}

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
  return sh;
}

function program(gl, vs, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  return p;
}

export function setCssTint(t) {
  const s = document.documentElement.style;
  s.setProperty('--sky', t.sky);
  s.setProperty('--nebula-1', t.nebula[0]);
  s.setProperty('--nebula-2', t.nebula[1]);
  if (t.accent) s.setProperty('--accent-film', t.accent);
  if (t.band) s.setProperty('--band', t.band);
}

export function createSky(canvas, opts = {}) {
  const params = new URLSearchParams(location.search);
  const mode = params.get('sky'); // off | static
  const state = {
    tint: { sky: '#0F1424', nebula: ['#1A2238', '#221E36'] },
    from: null, to: null, t0: 0, dur: 0,
    cam: { x: 0, y: 0 }, paused: !!opts.paused, reduced: !!opts.reducedMotion,
    frames: 0, raf: 0, visible: true, gl: null, lost: false, last: 0,
  };
  const mobile = window.matchMedia('(max-width: 767px)').matches;
  const dpr = Math.min(window.devicePixelRatio || 1, mobile ? 1 : 1.5) * 0.75;
  const STARS = mobile ? 420 : 900;

  const api = {
    setTint(t, { duration = 1000 } = {}) {
      setCssTint(t);
      if (!state.gl) { state.tint = t; return; }
      state.from = { sky: hexToRgb(state.tint.sky), n1: hexToRgb(state.tint.nebula[0]), n2: hexToRgb(state.tint.nebula[1]) };
      state.to = { sky: hexToRgb(t.sky), n1: hexToRgb(t.nebula[0]), n2: hexToRgb(t.nebula[1]) };
      state.t0 = performance.now();
      state.dur = state.reduced ? Math.min(duration, 200) : duration;
      state.tint = t;
      kick();
    },
    setCamera(c) { if (state.reduced) return; state.cam = { x: c.x || 0, y: c.y || 0 }; state.dirty = true; kick(); },
    pause() { state.paused = true; },
    play() { state.paused = false; kick(); },
    isPaused() { return state.paused; },
    setReducedMotion(v) { state.reduced = v; kick(); },
    stats() { return { frames: state.frames, webgl: !!state.gl, paused: state.paused }; },
    destroy() { cancelAnimationFrame(state.raf); io && io.disconnect(); },
  };

  if (mode === 'off' || mode === 'static') { canvas.hidden = true; return api; }
  const gl = canvas.getContext('webgl', { failIfMajorPerformanceCaveat: true, powerPreference: 'low-power', antialias: false, premultipliedAlpha: true, alpha: false });
  if (!gl) { canvas.hidden = true; return api; }

  let bgProg; let stProg; let bgBuf; let stBufA; let stBufB;
  function init() {
    state.gl = gl;
    bgProg = program(gl, VS_BG, FS_BG);
    stProg = program(gl, VS_ST, FS_ST);
    bgBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, bgBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const r = rng(opts.seed || 616);
    const A = new Float32Array(STARS * 2); const B = new Float32Array(STARS * 4);
    for (let i = 0; i < STARS; i += 1) {
      const layer = i < STARS * 0.75 ? 0 : (i < STARS * 0.95 ? 0.5 : 1);
      A[i * 2] = r(); A[i * 2 + 1] = r();
      B[i * 4] = layer === 0 ? 1 + r() * 1.2 : (layer === 0.5 ? 1.8 + r() * 1.4 : 2.6 + r() * 2.2);
      B[i * 4 + 1] = r(); B[i * 4 + 2] = 3 + r() * 5; B[i * 4 + 3] = layer;
    }
    stBufA = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, stBufA); gl.bufferData(gl.ARRAY_BUFFER, A, gl.STATIC_DRAW);
    stBufB = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, stBufB); gl.bufferData(gl.ARRAY_BUFFER, B, gl.STATIC_DRAW);
    resize();
  }

  function resize() {
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    gl.viewport(0, 0, canvas.width, canvas.height);
  }

  function lerp(a, b, k) { return a.map((x, i) => x + (b[i] - x) * k); }

  function draw(now) {
    let sky; let n1; let n2;
    if (state.to) {
      const k = state.dur ? Math.min(1, (now - state.t0) / state.dur) : 1;
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      sky = lerp(state.from.sky, state.to.sky, e); n1 = lerp(state.from.n1, state.to.n1, e); n2 = lerp(state.from.n2, state.to.n2, e);
      if (k >= 1) state.to = null;
    } else {
      sky = hexToRgb(state.tint.sky); n1 = hexToRgb(state.tint.nebula[0]); n2 = hexToRgb(state.tint.nebula[1]);
    }
    const t = state.reduced ? 0 : now / 1000;
    gl.disable(gl.BLEND);
    gl.useProgram(bgProg);
    gl.bindBuffer(gl.ARRAY_BUFFER, bgBuf);
    const lp = gl.getAttribLocation(bgProg, 'p');
    gl.enableVertexAttribArray(lp); gl.vertexAttribPointer(lp, 2, gl.FLOAT, false, 0, 0);
    gl.uniform3fv(gl.getUniformLocation(bgProg, 'uSky'), sky);
    gl.uniform3fv(gl.getUniformLocation(bgProg, 'uN1'), n1);
    gl.uniform3fv(gl.getUniformLocation(bgProg, 'uN2'), n2);
    gl.uniform2f(gl.getUniformLocation(bgProg, 'uOff'), state.cam.x, state.cam.y);
    gl.uniform1f(gl.getUniformLocation(bgProg, 'uT'), t);
    gl.uniform2f(gl.getUniformLocation(bgProg, 'uRes'), canvas.width, canvas.height);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.disableVertexAttribArray(lp);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(stProg);
    const la = gl.getAttribLocation(stProg, 'a'); const lb = gl.getAttribLocation(stProg, 'b');
    gl.bindBuffer(gl.ARRAY_BUFFER, stBufA); gl.enableVertexAttribArray(la); gl.vertexAttribPointer(la, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, stBufB); gl.enableVertexAttribArray(lb); gl.vertexAttribPointer(lb, 4, gl.FLOAT, false, 0, 0);
    gl.uniform1f(gl.getUniformLocation(stProg, 'uT'), t);
    gl.uniform2f(gl.getUniformLocation(stProg, 'uOff'), state.cam.x, state.cam.y);
    gl.uniform1f(gl.getUniformLocation(stProg, 'uDpr'), dpr);
    gl.uniform1f(gl.getUniformLocation(stProg, 'uTw'), 0); // pas de scintillement automatique
    gl.drawArrays(gl.POINTS, 0, STARS);
    gl.disableVertexAttribArray(la); gl.disableVertexAttribArray(lb);
    state.frames += 1;
  }

  function loop(now) {
    state.raf = 0;
    if (state.lost || !state.visible || document.hidden) return;
    const animating = !!state.to;
    if (now - state.last >= 33 || animating) { state.last = now; state.dirty = false; draw(now); }
    if (state.to || state.dirty) state.raf = requestAnimationFrame(loop); // dernière position de caméra toujours dessinée
  }
  function kick() { if (!state.raf && state.gl && !state.lost) state.raf = requestAnimationFrame(loop); }

  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); state.lost = true; canvas.hidden = true; });
  canvas.addEventListener('webglcontextrestored', () => { state.lost = false; canvas.hidden = false; init(); kick(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) kick(); });
  let rt;
  window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { if (state.gl) { resize(); kick(); } }, 150); });
  const io = 'IntersectionObserver' in window ? new IntersectionObserver((es) => { state.visible = es[0].isIntersecting; kick(); }) : null;
  if (io) io.observe(canvas);

  try { init(); draw(performance.now()); } catch (e) { canvas.hidden = true; state.gl = null; return api; }
  canvas.classList.add('is-ready');   // affiché seulement après une première image dessinée
  kick();
  return api;
}
