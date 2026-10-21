// La envolvente convexa de una nube de puntos (incremental, O(n²): para los pocos puntos de un
// collider 'convex', no para un millón). Sirve para validar que los puntos tienen volumen (no
// están todos en un plano), para su volumen (la masa) y para dibujar sus aristas en la vista de
// depuración sin preguntarle al motor de física.
//
// Puro: no importa three, Rapier ni el DOM.

/** @typedef {[number, number, number]} Tri */

/**
 * Las caras (triángulos, con la normal hacia afuera) de la envolvente convexa, como índices de
 * los puntos. null si los puntos no tienen volumen (menos de 4, o todos en un plano o una recta).
 * @param {ArrayLike<number>} p los puntos, de a tres (x, y, z)
 * @returns {Tri[] | null}
 */
export function convexHull(p) {
  const n = Math.floor(p.length / 3);
  if (n < 4) return null;
  const P = (/** @type {number} */ i) => [p[i * 3], p[i * 3 + 1], p[i * 3 + 2]];
  const sub = (/** @type {number[]} */ a, /** @type {number[]} */ b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross = (/** @type {number[]} */ a, /** @type {number[]} */ b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (/** @type {number[]} */ a, /** @type {number[]} */ b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  // la escala de la nube, para la tolerancia
  let escala = 0;
  for (let i = 0; i < n * 3; i++) escala = Math.max(escala, Math.abs(p[i]));
  const eps = 1e-9 * Math.max(1, escala);

  // el tetraedro inicial: lo más separado que se pueda
  const a = 0;
  let b = -1, mejor = eps;
  for (let i = 1; i < n; i++) { const d = Math.hypot(...sub(P(i), P(a))); if (d > mejor) { mejor = d; b = i; } }
  if (b < 0) return null;
  let c = -1; mejor = eps * mejor;
  const ab = sub(P(b), P(a));
  for (let i = 0; i < n; i++) { const d = Math.hypot(...cross(ab, sub(P(i), P(a)))); if (d > mejor) { mejor = d; c = i; } }
  if (c < 0) return null;
  const nabc = cross(ab, sub(P(c), P(a)));
  let d = -1; mejor = eps * Math.hypot(...nabc);
  for (let i = 0; i < n; i++) { const v = Math.abs(dot(nabc, sub(P(i), P(a)))); if (v > mejor) { mejor = v; d = i; } }
  if (d < 0) return null;

  /** @type {{ v: Tri, n: number[], off: number }[]} */
  let caras = [];
  const centro = [0, 1, 2].map((k) => (P(a)[k] + P(b)[k] + P(c)[k] + P(d)[k]) / 4);
  /** @param {number} i @param {number} j @param {number} k */
  const cara = (i, j, k) => {
    let nn = cross(sub(P(j), P(i)), sub(P(k), P(i)));
    let v = /** @type {Tri} */ ([i, j, k]);
    if (dot(nn, sub(centro, P(i))) > 0) { v = [i, k, j]; nn = nn.map((x) => -x); }
    const l = Math.hypot(...nn) || 1;
    nn = nn.map((x) => x / l);
    return { v, n: nn, off: dot(nn, P(v[0])) };
  };
  caras = [cara(a, b, c), cara(a, b, d), cara(a, c, d), cara(b, c, d)];

  for (let i = 0; i < n; i++) {
    if (i === a || i === b || i === c || i === d) continue;
    const q = P(i);
    const visibles = caras.filter((f) => dot(f.n, q) - f.off > eps);
    if (!visibles.length) continue;
    // el borde: las aristas de las caras visibles que no comparten con otra visible
    const aristas = new Set();
    for (const f of visibles) for (let k = 0; k < 3; k++) aristas.add(`${f.v[k]},${f.v[(k + 1) % 3]}`);
    /** @type {[number, number][]} */
    const borde = [];
    for (const f of visibles) {
      for (let k = 0; k < 3; k++) {
        const u = f.v[k], w = f.v[(k + 1) % 3];
        if (!aristas.has(`${w},${u}`)) borde.push([u, w]);
      }
    }
    caras = caras.filter((f) => !visibles.includes(f));
    for (const [u, w] of borde) {
      let nn = cross(sub(P(w), P(u)), sub(q, P(u)));
      const l = Math.hypot(...nn) || 1;
      nn = nn.map((x) => x / l);
      caras.push({ v: [u, w, i], n: nn, off: dot(nn, P(u)) });
    }
  }
  return caras.map((f) => f.v);
}

/**
 * El volumen de una malla cerrada (triángulos con la normal hacia afuera).
 * @param {ArrayLike<number>} p los puntos, de a tres @param {readonly Tri[]} caras
 */
export function meshVolume(p, caras) {
  let v = 0;
  for (const [i, j, k] of caras) {
    const ax = p[i * 3], ay = p[i * 3 + 1], az = p[i * 3 + 2];
    const bx = p[j * 3], by = p[j * 3 + 1], bz = p[j * 3 + 2];
    const cx = p[k * 3], cy = p[k * 3 + 1], cz = p[k * 3 + 2];
    v += ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
  }
  return Math.abs(v) / 6;
}

/** Las aristas sin repetir de unos triángulos: [[i, j], …]. @param {readonly Tri[]} caras @returns {[number, number][]} */
export function edgesOf(caras) {
  const vistas = new Set();
  /** @type {[number, number][]} */
  const out = [];
  for (const f of caras) {
    for (let k = 0; k < 3; k++) {
      const u = f[k], w = f[(k + 1) % 3];
      const clave = u < w ? `${u},${w}` : `${w},${u}`;
      if (!vistas.has(clave)) { vistas.add(clave); out.push([u, w]); }
    }
  }
  return out;
}
