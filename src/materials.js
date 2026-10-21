// Los materiales de contacto con nombre: cómo se frota y cuánto rebota una superficie, para no
// repetir los números en cada collider.
//
//   createPhysics({ materials: {
//     hielo: { friction: 0.02, frictionCombine: 'min' },     // patina aunque el otro no
//     goma: { restitution: 0.9, restitutionCombine: 'max' }, // rebota aunque el otro no
//   } });
//   fisica.body({ colliders: { shape: 'box', material: 'hielo' } });
//
// Un collider toma lo de su material y pisa lo que diga él mismo: `{ material: 'hielo', friction:
// 0.1 }` es hielo con otra fricción. Sin material ni valor propio, lo de Rapier: fricción 0.5,
// restitución 0, densidad 1.
//
// **Cómo se combinan dos superficies** (`frictionCombine`, `restitutionCombine`): `'average'` (el
// promedio, lo de Rapier), `'min'`, `'max'` o `'multiply'`. Entre dos colliders con reglas
// distintas manda la de más arriba en esa lista al revés (max > multiply > min > average), como
// en Rapier. Por eso el hielo dice `'min'`: con el promedio, hielo sobre piso (0.02 y 0.5) daría
// 0.26, que no patina.
//
// Puro: no importa three, Rapier ni el DOM.
import { plano, num, unoDe, claves } from './valid.js';

/** Las reglas para combinar dos superficies. */
export const COMBINE_RULES = /** @type {const} */ (['average', 'min', 'max', 'multiply']);
/** Lo que pone el motor de física si nadie dice nada. */
export const SURFACE_DEFAULTS = Object.freeze({ friction: 0.5, restitution: 0, density: 1, frictionCombine: 'average', restitutionCombine: 'average' });

/**
 * @typedef {{ friction: number | null, restitution: number | null, density: number | null,
 *   frictionCombine: 'average' | 'min' | 'max' | 'multiply' | null, restitutionCombine: 'average' | 'min' | 'max' | 'multiply' | null }} Material
 */

const CLAVES = ['friction', 'restitution', 'density', 'frictionCombine', 'restitutionCombine'];

/**
 * Las propiedades de superficie de un material o de un collider (null: no dice).
 * @param {Record<string, unknown>} o @param {string} que @returns {Material}
 */
export function surface(o, que) {
  const v = (/** @type {string} */ k) => (o[k] === undefined ? null : o[k]);
  const f = v('friction'), r = v('restitution'), d = v('density'), fc = v('frictionCombine'), rc = v('restitutionCombine');
  return {
    friction: f === null ? null : num(f, `${que}.friction`, 0),
    restitution: r === null ? null : num(r, `${que}.restitution`, 0),
    density: d === null ? null : num(d, `${que}.density`, 0),
    frictionCombine: fc === null ? null : unoDe(fc, COMBINE_RULES, `${que}.frictionCombine`),
    restitutionCombine: rc === null ? null : unoDe(rc, COMBINE_RULES, `${que}.restitutionCombine`),
  };
}

/**
 * Los materiales validados: { nombre: { friction, restitution, density, frictionCombine, restitutionCombine } }.
 * @param {unknown} map @returns {Readonly<Record<string, Material>>}
 */
export function defineMaterials(map) {
  if (map === undefined || map === null) return Object.freeze({});
  if (!plano(map)) throw new TypeError("materials: va { nombre: { friction?, restitution?, … } } (vino otra cosa)");
  /** @type {Record<string, Material>} */
  const out = {};
  for (const [nombre, m] of Object.entries(map)) {
    const que = `materials.${nombre}`;
    if (!nombre) throw new Error('materials: un material sin nombre');
    if (!plano(m)) throw new TypeError(`${que}: va { friction?, restitution?, density?, frictionCombine?, restitutionCombine? }`);
    claves(m, CLAVES, que);
    out[nombre] = surface(m, que);
  }
  return Object.freeze(out);
}

/**
 * Lo que va de verdad en el motor de física: lo del collider, si no lo de su material, si no lo
 * de Rapier.
 * @param {Material & { material?: string | null }} collider @param {Readonly<Record<string, Material>>} [materials]
 * @returns {{ friction: number, restitution: number, density: number, frictionCombine: 'average' | 'min' | 'max' | 'multiply', restitutionCombine: 'average' | 'min' | 'max' | 'multiply' }}
 */
export function resolveSurface(collider, materials = {}) {
  const m = collider.material ? materials[collider.material] : null;
  if (collider.material && !m) throw new Error(`material desconocido ${collider.material} (${Object.keys(materials).length ? `van ${Object.keys(materials).join(', ')}` : 'no hay materiales: van en createPhysics({ materials })'})`);
  return {
    friction: collider.friction ?? m?.friction ?? SURFACE_DEFAULTS.friction,
    restitution: collider.restitution ?? m?.restitution ?? SURFACE_DEFAULTS.restitution,
    density: collider.density ?? m?.density ?? SURFACE_DEFAULTS.density,
    frictionCombine: collider.frictionCombine ?? m?.frictionCombine ?? 'average',
    restitutionCombine: collider.restitutionCombine ?? m?.restitutionCombine ?? 'average',
  };
}
