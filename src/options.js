// Las opciones de un mundo, como datos: lo que recibe `createPhysics(opts)` y lo que devuelve
// `fisica.toJSON()` (un nivel guardado con sus cuerpos se vuelve a cargar pasándolo de nuevo).
//
//   {
//     gravity: [0, -9.81, 0],
//     timestep: 1 / 60,     // el paso de advance(dt) y el de step() sin dt
//     maxSteps: 5,          // advance: los pasos que da como mucho en un cuadro (el resto se descarta)
//     maxDelta: 1 / 30,     // step(dt): un dt más largo se parte en pasos iguales que no pasen de este
//     groups: ['jugador', 'pared', 'enemigo'],
//     materials: { hielo: { friction: 0.02, frictionCombine: 'min' } },
//     bodies: [ … ],        // cuerpos para crear de entrada (defineBody)
//     characters: [ … ],    // personajes para crear de entrada (defineCharacter)
//   }
//
// Puro: no importa three, Rapier ni el DOM.
import { plano, positivo, entero, vec3, claves } from './valid.js';
import { defineGroups } from './groups.js';
import { defineMaterials } from './materials.js';
import { defineBody } from './body.js';
import { defineCharacter } from './character.js';

/** @typedef {import('./valid.js').Vec3} Vec3 */
/**
 * @typedef {{
 *   gravity: Vec3, timestep: number, maxSteps: number, maxDelta: number,
 *   groups: readonly string[], materials: Readonly<Record<string, import('./materials.js').Material>>,
 *   bodies: import('./body.js').BodyDef[], characters: import('./character.js').CharacterDef[],
 * }} PhysicsOptions
 */

export const PHYSICS_DEFAULTS = Object.freeze({
  gravity: Object.freeze([0, -9.81, 0]), timestep: 1 / 60, maxSteps: 5, maxDelta: 1 / 30,
  groups: Object.freeze([]), materials: Object.freeze({}), bodies: Object.freeze([]), characters: Object.freeze([]),
});
const CLAVES = Object.keys(PHYSICS_DEFAULTS);

/**
 * Las opciones completas y validadas de un mundo.
 * @param {unknown} [opts] @returns {PhysicsOptions}
 */
export function definePhysics(opts = {}) {
  if (!plano(opts)) throw new TypeError('createPhysics: va { gravity?, timestep?, groups?, materials?, … }');
  claves(opts, CLAVES, 'createPhysics');
  const de = (/** @type {string} */ k) => (opts[k] === undefined ? /** @type {Record<string, unknown>} */ (PHYSICS_DEFAULTS)[k] : opts[k]);
  const groups = defineGroups(de('groups'));
  const materials = defineMaterials(de('materials'));
  const ctx = { groups, materials };
  const lista = (/** @type {string} */ k) => {
    const v = de(k);
    if (!Array.isArray(v)) throw new TypeError(`createPhysics.${k}: va una lista`);
    return v;
  };
  return {
    gravity: vec3(de('gravity'), 'createPhysics.gravity'),
    timestep: positivo(de('timestep'), 'createPhysics.timestep'),
    maxSteps: entero(de('maxSteps'), 'createPhysics.maxSteps', 1),
    maxDelta: positivo(de('maxDelta'), 'createPhysics.maxDelta'),
    groups,
    materials,
    bodies: lista('bodies').map((b, i) => defineBody(b, { ...ctx, que: `createPhysics.bodies[${i}]` })),
    characters: lista('characters').map((c, i) => defineCharacter(c, { ...ctx, que: `createPhysics.characters[${i}]` })),
  };
}
