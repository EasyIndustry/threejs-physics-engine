// Las medidas de un collider a partir de unos puntos (los vértices de un objeto, ya en el espacio
// del objeto y con su escala): la parte pura de `collidersFrom` del adaptador de three, que junta
// los puntos y llama acá.
//
//   'box'       la caja que los envuelve (alineada con los ejes del objeto)
//   'sphere'    la esfera con centro en el de la caja y radio hasta el punto más lejano
//   'capsule'   a lo largo del lado más largo de la caja; el radio, la mitad del más ancho de los otros dos
//   'convex'    los puntos mismos (la física arma la envolvente)
//
// `margin` agranda (o achica, si es negativo) la forma de cada lado. Un objeto plano (un plano, un
// sprite sin profundidad) tiene un lado de 0: ese lado toma `thickness`. En la caja crece **para
// atrás** de la cara (para −z en un PlaneGeometry), así un piso hecho con un plano queda con su
// cara arriba donde se ve; en la esfera y la cápsula, parejo (un sprite queda centrado).
//
// Puro: no importa three, Rapier ni el DOM.
import { num } from './valid.js';
import { defineCollider } from './shapes.js';

/** @typedef {import('./valid.js').Vec3} Vec3 */
/** @typedef {{ min: Vec3, max: Vec3 }} Box */
/** @typedef {'box' | 'sphere' | 'capsule' | 'convex'} FitShape */

export const FIT_SHAPES = /** @type {const} */ (['box', 'sphere', 'capsule', 'convex']);
/** Cuánto es "plano": un lado más chico que esto (relativo al más largo). */
const PLANO = 1e-6;

/** La caja que envuelve unos puntos (de a tres). @param {ArrayLike<number>} p @returns {Box} */
export function boxFromPoints(p) {
  if (p.length < 3) throw new RangeError('boxFromPoints: no hay puntos');
  /** @type {Vec3} */ const min = [Infinity, Infinity, Infinity];
  /** @type {Vec3} */ const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i + 2 < p.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      const v = p[i + k];
      if (v < min[k]) min[k] = v;
      if (v > max[k]) max[k] = v;
    }
  }
  return { min, max };
}

/**
 * La caja con los lados planos engrosados: para atrás (la caja) o parejo (lo demás).
 * @param {Box} b @param {number} grueso @param {boolean} atras @returns {Box}
 */
function engrosar(b, grueso, atras) {
  const largo = Math.max(...[0, 1, 2].map((k) => b.max[k] - b.min[k]));
  if (!(largo > 0)) throw new RangeError('collidersFrom: el objeto no tiene tamaño (todos sus puntos en el mismo lugar)');
  const min = /** @type {Vec3} */ ([...b.min]), max = /** @type {Vec3} */ ([...b.max]);
  for (let k = 0; k < 3; k++) {
    if (max[k] - min[k] > PLANO * largo) continue;
    if (atras) min[k] = max[k] - grueso;
    else { const c = (max[k] + min[k]) / 2; min[k] = c - grueso / 2; max[k] = c + grueso / 2; }
  }
  return { min, max };
}

/**
 * Un collider (una definición normalizada) que envuelve los puntos.
 * @param {ArrayLike<number>} points de a tres, en el espacio del objeto (con su escala)
 * @param {{ shape?: FitShape, margin?: number, thickness?: number }} [opts]
 */
export function fitCollider(points, { shape = 'box', margin = 0, thickness = 0.1 } = {}) {
  num(margin, 'collidersFrom.margin');
  num(thickness, 'collidersFrom.thickness', 0);
  const b = engrosar(boxFromPoints(points), thickness, shape === 'box');
  const size = /** @type {Vec3} */ ([0, 1, 2].map((k) => b.max[k] - b.min[k]));
  const centro = /** @type {Vec3} */ ([0, 1, 2].map((k) => (b.max[k] + b.min[k]) / 2));
  const chico = (/** @type {number} */ x, /** @type {string} */ que) => {
    if (!(x > 0)) throw new RangeError(`collidersFrom.margin: con ${margin} el ${que} queda en ${x} (va > 0)`);
    return x;
  };
  switch (shape) {
    case 'box':
      return defineCollider({ shape: 'box', size: size.map((s) => chico(s + 2 * margin, 'lado')), offset: centro });
    case 'sphere': {
      let r = 0;
      for (let i = 0; i + 2 < points.length; i += 3) {
        r = Math.max(r, Math.hypot(points[i] - centro[0], points[i + 1] - centro[1], points[i + 2] - centro[2]));
      }
      return defineCollider({ shape: 'sphere', radius: chico(r + margin, 'radio'), offset: centro });
    }
    case 'capsule': {
      // a lo largo del lado más largo; la cápsula de Rapier va en y, así que se gira si hace falta
      const eje = size.indexOf(Math.max(...size));
      const otros = [0, 1, 2].filter((k) => k !== eje).map((k) => size[k]);
      const radius = chico(Math.max(...otros) / 2 + margin, 'radio');
      const height = Math.max(size[eje] + 2 * margin, 2 * radius);
      const rotation = eje === 1 ? [0, 0, 0] : eje === 0 ? [0, 0, 90] : [90, 0, 0];
      return defineCollider({ shape: 'capsule', radius, height, offset: centro, rotation });
    }
    case 'convex': {
      /** @type {number[]} */
      const p = [];
      for (let i = 0; i + 2 < points.length; i += 3) {
        const d = [points[i] - centro[0], points[i + 1] - centro[1], points[i + 2] - centro[2]];
        const l = Math.hypot(d[0], d[1], d[2]);
        const k = l > 0 ? (l + margin) / l : 1;
        p.push(centro[0] + d[0] * k, centro[1] + d[1] * k, centro[2] + d[2] * k);
      }
      return defineCollider({ shape: 'convex', points: p });
    }
    default:
      throw new Error(`collidersFrom.shape: va 'auto', ${FIT_SHAPES.map((s) => `'${s}'`).join(', ')} o 'mesh' (vino ${JSON.stringify(shape)})`);
  }
}

/**
 * Un collider a partir de una caja { min, max } (la de THREE.Box3, como arrays): sus 8 esquinas
 * pasan por fitCollider (con la forma que se pida: la caja misma, la esfera o la cápsula que la
 * envuelve).
 * @param {Box} box @param {{ shape?: FitShape, margin?: number, thickness?: number }} [opts]
 */
export function colliderFromBox(box, opts) {
  const [a, b] = [box?.min, box?.max];
  if (!Array.isArray(a) || !Array.isArray(b)) throw new TypeError('colliderFromBox: va { min: [x, y, z], max: [x, y, z] }');
  /** @type {number[]} */
  const p = [];
  for (const x of [a[0], b[0]]) for (const y of [a[1], b[1]]) for (const z of [a[2], b[2]]) p.push(x, y, z);
  return fitCollider(p, opts);
}

/**
 * Una esfera a partir de una esfera envolvente { center, radius } (la de THREE.Sphere, como array).
 * @param {{ center: Vec3, radius: number }} sphere @param {{ margin?: number }} [opts]
 */
export function colliderFromSphere(sphere, { margin = 0 } = {}) {
  if (!sphere || !Array.isArray(sphere.center)) throw new TypeError('colliderFromSphere: va { center: [x, y, z], radius }');
  return defineCollider({ shape: 'sphere', radius: num(sphere.radius, 'colliderFromSphere.radius') + num(margin, 'colliderFromSphere.margin'), offset: sphere.center });
}
