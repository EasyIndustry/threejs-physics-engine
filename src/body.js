// Un cuerpo, como datos: qué tipo es, dónde está, cómo se mueve al empezar y con qué colliders.
//
//   {
//     type: 'dynamic',                       // 'dynamic' (lo mueve la física), 'fixed' (no se mueve), 'kinematic' (lo mueve la app)
//     position: [0, 2, 0],
//     rotation: [0, 45, 0],                  // grados [rx, ry, rz] (orden XYZ) o un cuaternión [x, y, z, w]
//     linearVelocity: [0, 0, 0],             // unidades por segundo
//     angularVelocity: [0, 0, 0],            // radianes por segundo, en cada eje
//     gravityScale: 1, linearDamping: 0, angularDamping: 0,
//     ccd: false,                            // para lo rápido (una bala): que no atraviese lo fino
//     lockRotation: false,                   // true, o [x, y, z]: un personaje dinámico que no se cae
//     lockPosition: false,                   // true, o [x, y, z]: [false, false, true] para un juego de plataformas 2.5D
//     sleeping: false, canSleep: true,       // empezar dormido; poder dormirse quieto
//     mass: null,                            // la masa total; sin ella, sale de la densidad de los colliders
//     colliders: [{ shape: 'box', size: [1, 1, 1] }],
//     name: 'caja', userData: { puntos: 10 },   // userData: datos (se guarda en JSON)
//   }
//
// **La rotación se guarda como cuaternión** [x, y, z, w] (lo de Rapier, lo que se interpola sin
// sorpresas y lo que usa threejs-particle-engine); tres números son el atajo en grados, como los
// de threejs-render-engine, y se pasan a cuaternión. Lo normalizado se guarda en JSON y se vuelve a
// pasar dando lo mismo, y `hashBody` da el mismo hash para el mismo cuerpo escrito distinto.
//
// **La masa**: con `mass` en el cuerpo, se reparte entre sus colliders según su volumen (y entonces
// ningún collider dice `density` ni `mass`). Sin ella, cada collider pone la suya (densidad 1 por
// defecto: un cubo de 1 m pesa 1).
//
// Puro: no importa three, Rapier ni el DOM.
import { plano, num, positivo, bool, texto, vec3, unoDe, claves, esDatos, stableStringify, hash53 } from './valid.js';
import { rotation } from './math.js';
import { defineCollider, shapeVolume, FIXED_ONLY } from './shapes.js';
import { groupBits } from './groups.js';

/** @typedef {import('./valid.js').Vec3} Vec3 */
/** @typedef {import('./valid.js').Quat} Quat */
/** @typedef {import('./shapes.js').ColliderDef} ColliderDef */
/** @typedef {'dynamic' | 'fixed' | 'kinematic'} BodyType */
/** @typedef {[boolean, boolean, boolean]} Axes */
/**
 * @typedef {{
 *   type: BodyType, position: Vec3, rotation: Quat, linearVelocity: Vec3, angularVelocity: Vec3,
 *   gravityScale: number, linearDamping: number, angularDamping: number, ccd: boolean,
 *   lockRotation: Axes, lockPosition: Axes, sleeping: boolean, canSleep: boolean, mass: number | null,
 *   colliders: ColliderDef[], name: string, userData: unknown,
 * }} BodyDef
 */
/** Lo que hace falta para validar los nombres de grupos y materiales contra los del mundo. @typedef {{ groups?: readonly string[], materials?: Readonly<Record<string, unknown>> }} BodyContext */

export const BODY_TYPES = /** @type {const} */ (['dynamic', 'fixed', 'kinematic']);

/** Los valores por defecto de cada clave (lo que no se pasa). */
export const BODY_DEFAULTS = Object.freeze({
  type: 'dynamic', position: Object.freeze([0, 0, 0]), rotation: Object.freeze([0, 0, 0, 1]),
  linearVelocity: Object.freeze([0, 0, 0]), angularVelocity: Object.freeze([0, 0, 0]),
  gravityScale: 1, linearDamping: 0, angularDamping: 0, ccd: false,
  lockRotation: false, lockPosition: false, sleeping: false, canSleep: true, mass: null,
  colliders: Object.freeze([]), name: '', userData: null,
});
const CLAVES = Object.keys(BODY_DEFAULTS);

/** true / false / [x, y, z] → [x, y, z]. @param {unknown} v @param {string} que @returns {Axes} */
function ejes(v, que) {
  if (typeof v === 'boolean') return [v, v, v];
  if (Array.isArray(v) && v.length === 3) return /** @type {Axes} */ (v.map((x, i) => bool(x, `${que}[${i}]`)));
  throw new TypeError(`${que}: va true, false o [x, y, z] con true/false (vino ${JSON.stringify(v)})`);
}

/**
 * Los colliders de una definición: una lista, uno solo (sin array) o el nombre de una forma.
 * @param {unknown} v @param {string} que @returns {ColliderDef[]}
 */
function colliders(v, que) {
  const lista = Array.isArray(v) ? v : [v];
  return lista.map((c, i) => defineCollider(c, `${que}[${i}]`));
}

/**
 * Revisa que los grupos y materiales que nombran los colliders existan en el mundo.
 * @param {ColliderDef} c @param {string} que @param {BodyContext} ctx
 */
export function checkNames(c, que, ctx) {
  if (ctx.groups) { groupBits(ctx.groups, c.group, `${que}.group`); groupBits(ctx.groups, c.collidesWith, `${que}.collidesWith`); }
  if (ctx.materials && c.material !== null && !(c.material in ctx.materials)) {
    const hay = Object.keys(ctx.materials);
    throw new Error(`${que}.material: material desconocido ${c.material} (${hay.length ? `van ${hay.join(', ')}` : 'no hay materiales: van en createPhysics({ materials })'})`);
  }
}

/**
 * La definición completa y validada de un cuerpo. Acepta los atajos y devuelve siempre la misma
 * forma, que se guarda en JSON y se vuelve a pasar dando lo mismo. Un error dice dónde. Con
 * `ctx` (lo pasa el mundo), revisa además los nombres de grupos y materiales.
 * @param {unknown} def @param {BodyContext & { que?: string }} [ctx] @returns {BodyDef}
 */
export function defineBody(def, ctx = {}) {
  const que = ctx.que ?? 'body';
  if (def === undefined) def = {};
  if (!plano(def)) throw new TypeError(`${que}: va { type, position, colliders, … }`);
  claves(def, CLAVES, que);
  const de = (/** @type {string} */ k) => (def[k] === undefined ? /** @type {Record<string, unknown>} */ (BODY_DEFAULTS)[k] : def[k]);
  const type = unoDe(de('type'), BODY_TYPES, `${que}.type`);
  const cs = colliders(de('colliders'), `${que}.colliders`);
  const mass = de('mass');
  const userData = de('userData');
  if (!esDatos(userData)) throw new TypeError(`${que}.userData: van datos (números, textos, booleanos, null, y listas u objetos de eso): se guarda en JSON`);

  cs.forEach((c, i) => {
    const q = `${que}.colliders[${i}]`;
    if (FIXED_ONLY.includes(c.shape) && type !== 'fixed') throw new Error(`${q}.shape: '${c.shape}' va solo en un cuerpo fixed (no tiene adentro para calcularle la masa; en uno que se mueve va 'convex' o 'box')`);
    if (mass !== null && (c.density !== null || c.mass !== null)) throw new Error(`${q}: con mass en el cuerpo, la masa se reparte entre los colliders: no va density ni mass en el collider`);
    checkNames(c, q, ctx);
  });
  if (type === 'dynamic' && mass === null && !cs.some((c) => !c.sensor)) throw new Error(`${que}: un cuerpo dynamic sin colliders sólidos no tiene masa: va con colliders o con mass`);

  return {
    type,
    position: vec3(de('position'), `${que}.position`),
    rotation: rotation(de('rotation'), `${que}.rotation`),
    linearVelocity: vec3(de('linearVelocity'), `${que}.linearVelocity`),
    angularVelocity: vec3(de('angularVelocity'), `${que}.angularVelocity`),
    gravityScale: num(de('gravityScale'), `${que}.gravityScale`),
    linearDamping: num(de('linearDamping'), `${que}.linearDamping`, 0),
    angularDamping: num(de('angularDamping'), `${que}.angularDamping`, 0),
    ccd: bool(de('ccd'), `${que}.ccd`),
    lockRotation: ejes(de('lockRotation'), `${que}.lockRotation`),
    lockPosition: ejes(de('lockPosition'), `${que}.lockPosition`),
    sleeping: bool(de('sleeping'), `${que}.sleeping`),
    canSleep: bool(de('canSleep'), `${que}.canSleep`),
    mass: mass === null ? null : positivo(mass, `${que}.mass`),
    colliders: cs,
    name: texto(de('name'), `${que}.name`),
    userData: userData === null ? null : JSON.parse(JSON.stringify(userData)),
  };
}

/**
 * La masa de cada collider cuando el cuerpo dice la suya: repartida según el volumen de cada uno
 * (los sensores no pesan). null si el cuerpo no dice masa (cada collider pone la suya).
 * @param {BodyDef} b @returns {(number | null)[]}
 */
export function colliderMasses(b) {
  if (b.mass === null) return b.colliders.map(() => null);
  const vol = b.colliders.map((c) => (c.sensor ? 0 : shapeVolume(c)));
  const total = vol.reduce((a, x) => a + x, 0);
  const solidos = b.colliders.filter((c) => !c.sensor).length;
  const M = /** @type {number} */ (b.mass);
  return b.colliders.map((c, i) => (c.sensor ? 0 : total > 0 ? (M * vol[i]) / total : M / solidos));
}

/**
 * Un identificador corto del cuerpo: dos definiciones iguales (aunque escritas distinto, con
 * atajos) dan el mismo.
 * @param {unknown} def
 */
export const hashBody = (def) => hash53(stableStringify(defineBody(def)));
