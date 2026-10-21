// Un personaje, como datos: el controlador de personaje (en Rapier, el KinematicCharacterController)
// mueve una forma por el mundo corrigiendo el movimiento: no atraviesa paredes, se desliza por
// ellas, sube escalones, no sube pendientes empinadas y se pega al piso al bajar.
//
//   {
//     shape: 'capsule', radius: 0.3, height: 1.8,   // la forma: capsule, sphere, box (size) o cylinder
//     position: [0, 0, 0],
//     origin: 'feet',      // 'feet': position son los pies (como el anchor de un sprite); 'center': el centro
//     step: 0.3,           // la altura de escalón que sube sola (null: no sube escalones)
//     stepWidth: 0.1,      // el ancho mínimo de lo que pisa al subir (que no se trepe a un borde finito)
//     slope: 45,           // la pendiente máxima que sube, en grados; más empinada, se resbala
//     snap: 0.2,           // al bajar (una rampa, un escalón), se pega al piso si está a menos de esto (null: no)
//     offset: 0.01,        // la separación que deja con todo (la piel): chica, pero no 0
//     slide: true,         // se desliza por lo que lo frena (si no, se queda donde chocó)
//     push: true,          // empuja a los cuerpos dynamic con los que choca
//     up: [0, 1, 0],       // para dónde es arriba
//     group: 'jugador', collidesWith: ['pared', 'piso'],
//     name: 'heroe', userData: null,
//   }
//
// **Por qué `origin: 'feet'` por defecto**: en un juego, lo que se ubica es dónde pisa el
// personaje (un punto de aparición en el piso, el anchor de un sprite de threejs-sprite-engine), y
// así `position[1]` es la altura del piso donde está parado. La forma se corre para arriba media
// altura más la piel (`offset`): parado en el piso, `position[1]` es la altura del piso.
//
// El controlador no tiene gravedad: la pone la app en el desplazamiento que le pide a `move()`
// (ver el README: una velocidad vertical que crece mientras no está en el piso).
//
// Puro: no importa three, Rapier ni el DOM.
import { plano, num, positivo, bool, texto, vec3, unoDe, claves, esDatos } from './valid.js';
import { defineCollider } from './shapes.js';
import { groupList } from './groups.js';
import { checkNames } from './body.js';

/** @typedef {import('./valid.js').Vec3} Vec3 */
/**
 * @typedef {{
 *   shape: 'capsule' | 'sphere' | 'box' | 'cylinder', radius: number | null, height: number | null, size: Vec3 | null,
 *   position: Vec3, origin: 'feet' | 'center', step: number | null, stepWidth: number, slope: number,
 *   snap: number | null, offset: number, slide: boolean, push: boolean, up: Vec3,
 *   group: string[] | null, collidesWith: string[] | null, name: string, userData: unknown,
 * }} CharacterDef
 */

export const CHARACTER_SHAPES = /** @type {const} */ (['capsule', 'sphere', 'box', 'cylinder']);
export const CHARACTER_DEFAULTS = Object.freeze({
  shape: 'capsule', radius: null, height: null, size: null, position: Object.freeze([0, 0, 0]), origin: 'feet',
  step: 0.3, stepWidth: 0.1, slope: 45, snap: 0.2, offset: 0.01, slide: true, push: true,
  up: Object.freeze([0, 1, 0]), group: null, collidesWith: null, name: '', userData: null,
});
const CLAVES = Object.keys(CHARACTER_DEFAULTS);
/** Las medidas por defecto de cada forma de personaje (un humano de 1.8 m). */
const MEDIDAS = {
  capsule: { radius: 0.3, height: 1.8 }, sphere: { radius: 0.4 }, box: { size: [0.6, 1.8, 0.6] }, cylinder: { radius: 0.3, height: 1.8 },
};

/**
 * La definición completa y validada de un personaje.
 * @param {unknown} def @param {import('./body.js').BodyContext & { que?: string }} [ctx] @returns {CharacterDef}
 */
export function defineCharacter(def, ctx = {}) {
  const que = ctx.que ?? 'character';
  if (def === undefined) def = {};
  if (!plano(def)) throw new TypeError(`${que}: va { shape, radius, height, position, step, slope, … }`);
  claves(def, CLAVES, que);
  const de = (/** @type {string} */ k) => (def[k] === undefined ? /** @type {Record<string, unknown>} */ (CHARACTER_DEFAULTS)[k] : def[k]);
  const shape = unoDe(de('shape'), CHARACTER_SHAPES, `${que}.shape`);
  const medidas = /** @type {Record<string, unknown>} */ (MEDIDAS[shape]);
  for (const k of ['radius', 'height', 'size']) {
    if (def[k] !== undefined && def[k] !== null && !(k in medidas)) throw new Error(`${que}.${k}: no va con shape '${shape}' (van ${Object.keys(medidas).join(', ')})`);
  }
  // la forma la valida el collider (las mismas reglas: la cápsula con su altura total)
  /** @type {Record<string, unknown>} */
  const forma = { shape };
  for (const k of Object.keys(medidas)) forma[k] = def[k] ?? medidas[k];
  const c = defineCollider(forma, que);
  const step = de('step'), snap = de('snap');
  const up = vec3(de('up'), `${que}.up`);
  const largo = Math.hypot(...up);
  if (!(largo > 1e-9)) throw new RangeError(`${que}.up: va una dirección (no [0, 0, 0])`);
  const out = /** @type {CharacterDef} */ ({
    shape,
    radius: c.radius ?? null,
    height: c.height ?? null,
    size: c.size ?? null,
    position: vec3(de('position'), `${que}.position`),
    origin: unoDe(de('origin'), /** @type {const} */ (['feet', 'center']), `${que}.origin`),
    step: step === null ? null : positivo(step, `${que}.step`),
    stepWidth: num(de('stepWidth'), `${que}.stepWidth`, 0),
    slope: num(de('slope'), `${que}.slope`, 0, 90),
    snap: snap === null ? null : positivo(snap, `${que}.snap`),
    offset: positivo(de('offset'), `${que}.offset`),
    slide: bool(de('slide'), `${que}.slide`),
    push: bool(de('push'), `${que}.push`),
    up: Math.abs(largo - 1) < 1e-12 ? up : /** @type {Vec3} */ (up.map((x) => x / largo)),
    group: groupList(de('group'), `${que}.group`),
    collidesWith: groupList(de('collidesWith'), `${que}.collidesWith`),
    name: texto(de('name'), `${que}.name`),
    userData: null,
  });
  const ud = de('userData');
  if (!esDatos(ud)) throw new TypeError(`${que}.userData: van datos (se guarda en JSON)`);
  out.userData = ud === null ? null : JSON.parse(JSON.stringify(ud));
  checkNames(/** @type {any} */ ({ group: out.group, collidesWith: out.collidesWith, material: null }), que, ctx);
  return out;
}

/**
 * El collider del personaje (en el espacio de su cuerpo): la forma, corrida para arriba si el
 * origen son los pies (media altura más la piel).
 * @param {CharacterDef} c @returns {import('./shapes.js').ColliderDef}
 */
export function characterCollider(c) {
  const alto = c.shape === 'sphere' ? 2 * /** @type {number} */ (c.radius) : c.shape === 'box' ? /** @type {Vec3} */ (c.size)[1] : /** @type {number} */ (c.height);
  const sube = c.origin === 'feet' ? alto / 2 + c.offset : 0;
  /** @type {Record<string, unknown>} */
  const forma = { shape: c.shape, offset: [c.up[0] * sube, c.up[1] * sube, c.up[2] * sube], group: c.group, collidesWith: c.collidesWith };
  if (c.radius !== null) forma.radius = c.radius;
  if (c.height !== null) forma.height = c.height;
  if (c.size !== null) forma.size = c.size;
  return defineCollider(forma, 'character');
}
