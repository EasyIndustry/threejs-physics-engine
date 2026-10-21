// Los colliders, como datos: la forma y sus medidas, dónde está en el cuerpo, de qué es y con qué
// choca.
//
//   { shape: 'box', size: [1, 2, 1] }                         // las medidas enteras, no la mitad
//   { shape: 'sphere', radius: 0.5 }
//   { shape: 'capsule', radius: 0.3, height: 1.8 }            // height: la altura TOTAL, con las tapas
//   { shape: 'cylinder', radius: 0.5, height: 1 }             // a lo largo de y, como en three
//   { shape: 'cone', radius: 0.5, height: 1 }                 // la punta para +y
//   { shape: 'convex', points: [[x, y, z], …] }                // la envolvente convexa de los puntos
//   { shape: 'mesh', vertices: [x, y, z, …], indices: [a, b, c, …] }   // triángulos: solo en un cuerpo fixed
//   { shape: 'heightfield', heights: [[…], …], size: [ancho, escalaY, fondo] }   // filas en z, columnas en x: solo fixed
//
// Y para todos: `offset: [x, y, z]` y `rotation` (cuaternión o grados) dentro del cuerpo;
// `density` o `mass` (no las dos); `friction`, `restitution`, `frictionCombine`,
// `restitutionCombine` y `material` (ver materials.js); `sensor: true` (un disparador: no choca,
// avisa 'enter' y 'exit'); `group` y `collidesWith` (ver groups.js); `name`.
//
// **Por qué `height` es la altura total en la cápsula**: es lo que se mide de un personaje (1.8 m) y
// lo que da la caja de un objeto; Rapier pide la mitad del cilindro del medio, y esa cuenta la hace
// el adaptador (`(height - 2 × radius) / 2`). En el cilindro y el cono, también la altura entera.
//
// Atajos: un texto es la forma con sus medidas por defecto (`'sphere'`); `size: 2` es [2, 2, 2];
// los puntos y los vértices van planos o de a tres (`[[x, y, z], …]`), y los índices planos o de a
// tres. Lo normalizado tiene siempre todas las claves (las de su forma y las comunes).
//
// Puro: no importa three, Rapier ni el DOM.
import { plano, num, positivo, entero, bool, texto, vec3, unoDe, claves } from './valid.js';
import { rotation } from './math.js';
import { surface } from './materials.js';
import { groupList } from './groups.js';
import { convexHull, meshVolume } from './hull.js';

/** @typedef {import('./valid.js').Vec3} Vec3 */
/** @typedef {import('./valid.js').Quat} Quat */
/** @typedef {'box' | 'sphere' | 'capsule' | 'cylinder' | 'cone' | 'convex' | 'mesh' | 'heightfield'} ShapeType */
/**
 * @typedef {import('./materials.js').Material & {
 *   shape: ShapeType, offset: Vec3, rotation: Quat, mass: number | null, material: string | null,
 *   sensor: boolean, group: string[] | null, collidesWith: string[] | null, name: string,
 *   size?: Vec3, radius?: number, height?: number, points?: number[], vertices?: number[], indices?: number[], heights?: number[][],
 * }} ColliderDef
 */

/** Las medidas de cada forma, con sus valores por defecto (null: hay que darlas). */
export const SHAPES = Object.freeze({
  box: Object.freeze({ size: Object.freeze([1, 1, 1]) }),
  sphere: Object.freeze({ radius: 0.5 }),
  capsule: Object.freeze({ radius: 0.5, height: 2 }),
  cylinder: Object.freeze({ radius: 0.5, height: 1 }),
  cone: Object.freeze({ radius: 0.5, height: 1 }),
  convex: Object.freeze({ points: null }),
  mesh: Object.freeze({ vertices: null, indices: null }),
  heightfield: Object.freeze({ heights: null, size: Object.freeze([1, 1, 1]) }),
});
/** Las formas que solo van en un cuerpo fixed (no tienen volumen, o no se les puede calcular la masa). */
export const FIXED_ONLY = Object.freeze(['mesh', 'heightfield']);
const TIPOS = /** @type {ShapeType[]} */ (Object.keys(SHAPES));

/** Lo común a todos los colliders, con sus valores por defecto. */
export const COLLIDER_DEFAULTS = Object.freeze({
  offset: Object.freeze([0, 0, 0]), rotation: Object.freeze([0, 0, 0, 1]), density: null, mass: null,
  friction: null, restitution: null, frictionCombine: null, restitutionCombine: null, material: null,
  sensor: false, group: null, collidesWith: null, name: '',
});
const COMUNES = ['shape', ...Object.keys(COLLIDER_DEFAULTS)];

/**
 * Una lista de [x, y, z]: plana o de a tres. Devuelve plana.
 * @param {unknown} v @param {string} que @param {number} minimo cuántos puntos al menos @returns {number[]}
 */
function puntos(v, que, minimo) {
  if (!Array.isArray(v)) throw new TypeError(`${que}: va una lista de puntos [[x, y, z], …] o plana [x, y, z, …]`);
  /** @type {number[]} */
  let out;
  if (v.length && Array.isArray(v[0])) out = v.flatMap((p, i) => vec3(p, `${que}[${i}]`));
  else {
    if (v.length % 3) throw new RangeError(`${que}: plana, va de a tres números (x, y, z): vinieron ${v.length}`);
    out = v.map((x, i) => num(x, `${que}[${i}]`));
  }
  if (out.length / 3 < minimo) throw new RangeError(`${que}: van al menos ${minimo} puntos (vinieron ${out.length / 3})`);
  return out;
}

/** Los índices de los triángulos: planos o de a tres. @param {unknown} v @param {string} que @param {number} n cuántos vértices hay @returns {number[]} */
function indices(v, que, n) {
  if (!Array.isArray(v)) throw new TypeError(`${que}: va una lista de índices [a, b, c, …] o de triángulos [[a, b, c], …]`);
  const plana = v.length && Array.isArray(v[0])
    ? v.flatMap((t, i) => {
      if (!Array.isArray(t) || t.length !== 3) throw new TypeError(`${que}[${i}]: va un triángulo [a, b, c]`);
      return t.map((x, k) => entero(x, `${que}[${i}][${k}]`, 0, n - 1));
    })
    : v.map((x, i) => entero(x, `${que}[${i}]`, 0, n - 1));
  if (!plana.length || plana.length % 3) throw new RangeError(`${que}: van de a tres (triángulos): vinieron ${plana.length}`);
  return plana;
}

/** Las alturas de un heightfield: filas (a lo largo de z) de columnas (a lo largo de x), todas iguales. @param {unknown} v @param {string} que @returns {number[][]} */
function alturas(v, que) {
  if (!Array.isArray(v) || v.length < 2) throw new TypeError(`${que}: va una matriz de al menos 2 × 2: filas (a lo largo de z) de alturas (a lo largo de x)`);
  const cols = Array.isArray(v[0]) ? v[0].length : 0;
  return v.map((fila, i) => {
    if (!Array.isArray(fila) || fila.length < 2) throw new TypeError(`${que}[${i}]: va una fila de al menos 2 alturas`);
    if (fila.length !== cols) throw new RangeError(`${que}[${i}]: todas las filas van del mismo largo (la primera tiene ${cols}, esta ${fila.length})`);
    return fila.map((x, j) => num(x, `${que}[${i}][${j}]`));
  });
}

/**
 * Un collider validado y normalizado: siempre las mismas claves, con las medidas de su forma.
 * Un error dice dónde (`que`: `body.colliders[1]`).
 * @param {unknown} def @param {string} [que] @returns {ColliderDef}
 */
export function defineCollider(def, que = 'collider') {
  if (typeof def === 'string') def = { shape: def };
  if (!plano(def)) throw new TypeError(`${que}: va { shape, … } o el nombre de una forma (${TIPOS.join(', ')})`);
  const shape = unoDe(def.shape ?? 'box', TIPOS, `${que}.shape`);
  const medidas = /** @type {Record<string, unknown>} */ (SHAPES[shape]);
  for (const k of Object.keys(def)) {
    if (COMUNES.includes(k) || k in medidas) continue;
    const de = TIPOS.find((t) => k in SHAPES[t]);
    if (de) throw new Error(`${que}.${k}: no va con shape '${shape}' (${Object.keys(medidas).length ? `van ${Object.keys(medidas).join(', ')}` : 'no lleva medidas'}; ${k} es de ${TIPOS.filter((t) => k in SHAPES[t]).join(', ')})`);
    claves(def, [...COMUNES, ...Object.keys(medidas)], que);
  }
  const de = (/** @type {string} */ k) => (def[k] === undefined ? /** @type {Record<string, unknown>} */ ({ ...COLLIDER_DEFAULTS, ...medidas })[k] : def[k]);
  const falta = (/** @type {string} */ k) => { if (def[k] === undefined) throw new Error(`${que}.${k}: falta (una forma '${shape}' lo necesita)`); };

  /** @type {Record<string, unknown>} */
  const m = {};
  switch (shape) {
    case 'box': m.size = vec3(de('size'), `${que}.size`, { todos: true, positivos: true }); break;
    case 'sphere': m.radius = positivo(de('radius'), `${que}.radius`); break;
    case 'capsule': {
      const r = positivo(de('radius'), `${que}.radius`), h = positivo(de('height'), `${que}.height`);
      if (h < 2 * r) throw new RangeError(`${que}.height: es la altura total, con las tapas: va ≥ 2 × radius (${2 * r}) (vino ${h})`);
      m.radius = r; m.height = h; break;
    }
    case 'cylinder': case 'cone':
      m.radius = positivo(de('radius'), `${que}.radius`); m.height = positivo(de('height'), `${que}.height`); break;
    case 'convex': {
      falta('points');
      const p = puntos(def.points, `${que}.points`, 4);
      if (!convexHull(p)) throw new Error(`${que}.points: no tienen volumen (están en un plano o en una recta): va 'box' o 'mesh'`);
      m.points = p; break;
    }
    case 'mesh': {
      falta('vertices'); falta('indices');
      const v = puntos(def.vertices, `${que}.vertices`, 3);
      m.vertices = v; m.indices = indices(def.indices, `${que}.indices`, v.length / 3); break;
    }
    case 'heightfield': {
      falta('heights');
      m.heights = alturas(def.heights, `${que}.heights`);
      m.size = vec3(de('size'), `${que}.size`, { todos: true, positivos: true }); break;
    }
  }
  const sup = surface(def, que);
  const mass = de('mass');
  if (sup.density !== null && mass !== null) throw new Error(`${que}: va density o mass, no las dos`);
  const material = de('material');
  return {
    shape, ...m,
    offset: vec3(de('offset'), `${que}.offset`),
    rotation: rotation(de('rotation'), `${que}.rotation`),
    ...sup,
    mass: mass === null ? null : positivo(mass, `${que}.mass`),
    material: material === null ? null : (texto(material, `${que}.material`) || null),
    sensor: bool(de('sensor'), `${que}.sensor`),
    group: groupList(de('group'), `${que}.group`),
    collidesWith: groupList(de('collidesWith'), `${que}.collidesWith`),
    name: texto(de('name'), `${que}.name`),
  };
}

/**
 * El volumen de un collider (para repartir la masa de un cuerpo entre sus colliders). 0 para mesh y
 * heightfield, que no tienen adentro.
 * @param {ColliderDef} c
 */
export function shapeVolume(c) {
  const r = c.radius ?? 0, h = c.height ?? 0;
  switch (c.shape) {
    case 'box': { const s = /** @type {Vec3} */ (c.size); return s[0] * s[1] * s[2]; }
    case 'sphere': return (4 / 3) * Math.PI * r ** 3;
    case 'capsule': return Math.PI * r * r * (h - 2 * r) + (4 / 3) * Math.PI * r ** 3;
    case 'cylinder': return Math.PI * r * r * h;
    case 'cone': return (Math.PI * r * r * h) / 3;
    case 'convex': {
      const p = /** @type {number[]} */ (c.points);
      return meshVolume(p, convexHull(p) ?? []);
    }
    default: return 0;
  }
}
