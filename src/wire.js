// Las líneas que dibujan un collider en la vista de depuración: segmentos [x, y, z, x, y, z, …] en
// el espacio del cuerpo (con el offset y la rotación del collider ya aplicados). Salen de la
// definición, no del motor de física: la vista de depuración del adaptador de three las arma una
// vez por cuerpo y después solo mueve el cuerpo.
//
// Puro: no importa three, Rapier ni el DOM.
import { rotateVec } from './math.js';
import { convexHull, edgesOf } from './hull.js';

/** @typedef {import('./valid.js').Vec3} Vec3 */
/** @typedef {import('./shapes.js').ColliderDef} ColliderDef */

/**
 * Un círculo de `n` segmentos en el plano de dos ejes.
 * @param {number[]} out @param {Vec3} c el centro @param {number} r @param {0 | 1 | 2} a @param {0 | 1 | 2} b @param {number} n
 * @param {number} [desde] @param {number} [hasta] en vueltas (de 0 a 1)
 */
function circulo(out, c, r, a, b, n, desde = 0, hasta = 1) {
  const pasos = Math.max(1, Math.round(n * (hasta - desde)));
  for (let i = 0; i < pasos; i++) {
    for (const t of [desde + ((hasta - desde) * i) / pasos, desde + ((hasta - desde) * (i + 1)) / pasos]) {
      const p = [c[0], c[1], c[2]];
      p[a] += r * Math.cos(t * 2 * Math.PI);
      p[b] += r * Math.sin(t * 2 * Math.PI);
      out.push(p[0], p[1], p[2]);
    }
  }
}

/** @param {number[]} out @param {...number} v */
const seg = (out, ...v) => { out.push(...v); };

/**
 * Los segmentos de un collider, en el espacio del cuerpo.
 * @param {ColliderDef} c @param {{ segments?: number }} [opts] cuántos segmentos por círculo
 * @returns {Float32Array}
 */
export function colliderLines(c, { segments = 24 } = {}) {
  /** @type {number[]} */
  const l = [];
  const n = segments;
  const r = c.radius ?? 0, h = c.height ?? 0;
  switch (c.shape) {
    case 'box': {
      const [x, y, z] = /** @type {Vec3} */ (c.size).map((s) => s / 2);
      const v = [[-x, -y, -z], [x, -y, -z], [x, y, -z], [-x, y, -z], [-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z]];
      for (const [i, j] of [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]]) seg(l, ...v[i], ...v[j]);
      break;
    }
    case 'sphere':
      circulo(l, [0, 0, 0], r, 0, 1, n); circulo(l, [0, 0, 0], r, 1, 2, n); circulo(l, [0, 0, 0], r, 2, 0, n);
      break;
    case 'capsule': {
      const m = h / 2 - r;
      circulo(l, [0, m, 0], r, 2, 0, n); circulo(l, [0, -m, 0], r, 2, 0, n);
      for (const [a, b] of /** @type {const} */ ([[0, 1], [2, 1]])) {
        circulo(l, [0, m, 0], r, a, b, n, 0, 0.5);
        circulo(l, [0, -m, 0], r, a, b, n, 0.5, 1);
      }
      for (const [x, z] of [[r, 0], [-r, 0], [0, r], [0, -r]]) seg(l, x, m, z, x, -m, z);
      break;
    }
    case 'cylinder': case 'cone': {
      const y = h / 2;
      circulo(l, [0, -y, 0], r, 2, 0, n);
      if (c.shape === 'cylinder') circulo(l, [0, y, 0], r, 2, 0, n);
      for (const [x, z] of [[r, 0], [-r, 0], [0, r], [0, -r]]) {
        if (c.shape === 'cylinder') seg(l, x, -y, z, x, y, z);
        else seg(l, x, -y, z, 0, y, 0); // a la punta
      }
      break;
    }
    case 'convex': {
      const p = /** @type {number[]} */ (c.points);
      for (const [i, j] of edgesOf(convexHull(p) ?? [])) seg(l, p[i * 3], p[i * 3 + 1], p[i * 3 + 2], p[j * 3], p[j * 3 + 1], p[j * 3 + 2]);
      break;
    }
    case 'mesh': {
      const p = /** @type {number[]} */ (c.vertices), ix = /** @type {number[]} */ (c.indices);
      /** @type {[number, number, number][]} */
      const tris = [];
      for (let i = 0; i + 2 < ix.length; i += 3) tris.push([ix[i], ix[i + 1], ix[i + 2]]);
      for (const [i, j] of edgesOf(tris)) seg(l, p[i * 3], p[i * 3 + 1], p[i * 3 + 2], p[j * 3], p[j * 3 + 1], p[j * 3 + 2]);
      break;
    }
    case 'heightfield': {
      const H = /** @type {number[][]} */ (c.heights), [sx, sy, sz] = /** @type {Vec3} */ (c.size);
      const filas = H.length, cols = H[0].length;
      const P = (/** @type {number} */ i, /** @type {number} */ j) => [(j / (cols - 1) - 0.5) * sx, H[i][j] * sy, (i / (filas - 1) - 0.5) * sz];
      for (let i = 0; i < filas; i++) for (let j = 0; j < cols; j++) {
        if (j + 1 < cols) seg(l, ...P(i, j), ...P(i, j + 1));
        if (i + 1 < filas) seg(l, ...P(i, j), ...P(i + 1, j));
      }
      break;
    }
  }
  // el offset y la rotación del collider dentro del cuerpo
  const q = c.rotation, o = c.offset;
  const gira = !(q[0] === 0 && q[1] === 0 && q[2] === 0);
  const out = new Float32Array(l.length);
  for (let i = 0; i < l.length; i += 3) {
    const v = gira ? rotateVec(q, [l[i], l[i + 1], l[i + 2]]) : [l[i], l[i + 1], l[i + 2]];
    out[i] = v[0] + o[0]; out[i + 1] = v[1] + o[1]; out[i + 2] = v[2] + o[2];
  }
  return out;
}
