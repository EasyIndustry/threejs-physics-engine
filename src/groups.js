// Los grupos de colisión con nombre: la app dice `['jugador', 'pared', 'enemigo', 'agua']` y cada
// collider dice a qué grupo es (`group: 'jugador'`) y con cuáles choca (`collidesWith: ['pared']`).
// Acá se arman las máscaras de bits que usa el motor de física.
//
// Hasta 16 grupos (los que da Rapier: 16 bits de "soy de" y 16 de "choco con"). Dos colliders
// chocan si cada uno es de algún grupo con el que el otro choca. Sin `group`, un collider es de
// todos; sin `collidesWith`, choca con todos. El valor de 32 bits es el de Rapier:
// `(soyDe << 16) | chocoCon`.
//
// Puro: no importa three, Rapier ni el DOM.

/** Cuántos grupos hay como máximo. */
export const MAX_GROUPS = 16;
/** Todos los bits de los 16 grupos. */
export const ALL_GROUPS = 0xffff;

/**
 * La lista de grupos, validada: nombres distintos, no vacíos, a lo sumo 16.
 * @param {unknown} names @returns {readonly string[]}
 */
export function defineGroups(names) {
  if (names === undefined || names === null) return Object.freeze([]);
  if (!Array.isArray(names)) throw new TypeError("groups: va una lista de nombres (['jugador', 'pared', …])");
  if (names.length > MAX_GROUPS) throw new RangeError(`groups: van a lo sumo ${MAX_GROUPS} grupos (vinieron ${names.length})`);
  names.forEach((n, i) => {
    if (typeof n !== 'string' || !n) throw new TypeError(`groups[${i}]: va un nombre (vino ${JSON.stringify(n)})`);
    if (names.indexOf(n) !== i) throw new Error(`groups[${i}]: ${n} está repetido`);
  });
  return Object.freeze([...names]);
}

/**
 * Los bits de una lista de nombres de grupo (null: todos).
 * @param {readonly string[]} groups @param {readonly string[] | null} names @param {string} [que]
 */
export function groupBits(groups, names, que = 'group') {
  if (names === null) return ALL_GROUPS;
  let bits = 0;
  for (const n of names) {
    const i = groups.indexOf(n);
    if (i < 0) throw new Error(`${que}: grupo desconocido ${n} (${groups.length ? `van ${groups.join(', ')}` : "no hay grupos: van en createPhysics({ groups: ['jugador', …] })"})`);
    bits |= 1 << i;
  }
  return bits;
}

/**
 * El valor de 32 bits de un collider: de qué grupos es y con cuáles choca.
 * @param {readonly string[]} groups @param {readonly string[] | null} group @param {readonly string[] | null} collidesWith @param {string} [que]
 */
export function interactionGroups(groups, group, collidesWith, que = 'collider') {
  return ((groupBits(groups, group, `${que}.group`) << 16) | groupBits(groups, collidesWith, `${que}.collidesWith`)) >>> 0;
}

/** ¿Chocan dos colliders con estos valores? (la regla de Rapier) @param {number} a @param {number} b */
export const canCollide = (a, b) => ((a >>> 16) & b & ALL_GROUPS) !== 0 && ((b >>> 16) & a & ALL_GROUPS) !== 0;

/**
 * Una lista de grupos de una definición: un nombre, varios, ninguno ([]) o null (todos).
 * @param {unknown} v @param {string} que @returns {string[] | null}
 */
export function groupList(v, que) {
  if (v === null || v === undefined) return null;
  const lista = typeof v === 'string' ? [v] : v;
  if (!Array.isArray(lista)) throw new TypeError(`${que}: va un nombre de grupo, una lista de nombres o null (vino ${JSON.stringify(v)})`);
  lista.forEach((n, i) => { if (typeof n !== 'string' || !n) throw new TypeError(`${que}[${i}]: va un nombre de grupo (vino ${JSON.stringify(n)})`); });
  return [...new Set(/** @type {string[]} */ (lista))];
}
