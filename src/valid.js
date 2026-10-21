// Las validaciones de todas las definiciones: cada una tira un error que dice dónde está el
// problema (`body.colliders[1].size[2]: va un número > 0 (vino -1)`) y qué va.
//
// Puro: no importa three, Rapier ni el DOM.

/** @typedef {[number, number, number]} Vec3 */
/** @typedef {[number, number, number, number]} Quat */

/** ¿Un objeto plano (no un array, no null)? @param {unknown} v @returns {v is Record<string, any>} */
export const plano = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

/** ¿Un número finito? @param {unknown} v @returns {v is number} */
export const finito = (v) => typeof v === 'number' && Number.isFinite(v);

/** @param {unknown} v */
const mostrar = (v) => {
  try { return JSON.stringify(v) ?? String(v); } catch { return String(v); }
};

/**
 * Un número, entre min y max.
 * @param {unknown} v @param {string} que @param {number} [min] @param {number} [max]
 */
export function num(v, que, min = -Infinity, max = Infinity) {
  if (!finito(v)) throw new TypeError(`${que}: va un número (vino ${mostrar(v)})`);
  if (v < min || v > max) throw new RangeError(`${que}: va ${max === Infinity ? `≥ ${min}` : min === -Infinity ? `≤ ${max}` : `de ${min} a ${max}`} (vino ${v})`);
  return v;
}

/** Un número mayor que 0. @param {unknown} v @param {string} que */
export function positivo(v, que) {
  if (!finito(v) || !(v > 0)) throw new RangeError(`${que}: va un número > 0 (vino ${mostrar(v)})`);
  return v;
}

/** Un entero, entre min y max. @param {unknown} v @param {string} que @param {number} [min] @param {number} [max] */
export function entero(v, que, min = 0, max = Infinity) {
  if (!Number.isInteger(v)) throw new TypeError(`${que}: va un entero (vino ${mostrar(v)})`);
  return num(v, que, min, max);
}

/** true o false. @param {unknown} v @param {string} que */
export function bool(v, que) {
  if (typeof v !== 'boolean') throw new TypeError(`${que}: va true o false (vino ${mostrar(v)})`);
  return v;
}

/** Un texto (vacío o no). @param {unknown} v @param {string} que */
export function texto(v, que) {
  if (typeof v !== 'string') throw new TypeError(`${que}: va un texto (vino ${mostrar(v)})`);
  return v;
}

/** Uno de los valores de la lista. @template {string} T @param {unknown} v @param {readonly T[]} lista @param {string} que @returns {T} */
export function unoDe(v, lista, que) {
  if (!lista.includes(/** @type {T} */ (v))) throw new Error(`${que}: va ${lista.map((x) => `'${x}'`).join(', ')} (vino ${mostrar(v)})`);
  return /** @type {T} */ (v);
}

/** [x, y, z]; un número suelto vale para los tres si `todos`. @param {unknown} v @param {string} que @param {{ todos?: boolean, positivos?: boolean }} [o] @returns {Vec3} */
export function vec3(v, que, { todos = false, positivos = false } = {}) {
  if (todos && finito(v)) v = [v, v, v];
  if (!Array.isArray(v) || v.length !== 3) throw new TypeError(`${que}: va [x, y, z]${todos ? ' o un número' : ''} (vino ${mostrar(v)})`);
  return /** @type {Vec3} */ (v.map((x, i) => (positivos ? positivo(x, `${que}[${i}]`) : num(x, `${que}[${i}]`))));
}

/**
 * Las claves que no van: una clave que no existe es un error, no algo que se ignora.
 * @param {Record<string, unknown>} o @param {readonly string[]} permitidas @param {string} que
 */
export function claves(o, permitidas, que) {
  for (const k of Object.keys(o)) {
    if (!permitidas.includes(k)) throw new Error(`${que}.${k}: clave desconocida (van ${permitidas.join(', ')})`);
  }
}

/**
 * ¿Es datos (se guarda en JSON y vuelve igual)? Números finitos, textos, booleanos, null y
 * arrays u objetos planos de eso.
 * @param {unknown} v @param {number} [prof] @returns {boolean}
 */
export function esDatos(v, prof = 0) {
  if (prof > 64) return false;
  if (v === null || typeof v === 'string' || typeof v === 'boolean') return true;
  if (typeof v === 'number') return Number.isFinite(v);
  if (Array.isArray(v)) return v.every((x) => esDatos(x, prof + 1));
  if (plano(v)) {
    const p = Object.getPrototypeOf(v);
    return (p === Object.prototype || p === null) && Object.values(v).every((x) => esDatos(x, prof + 1));
  }
  return false;
}

/** JSON con las claves ordenadas, para que un hash no dependa del orden en que se escribió. @param {unknown} v @returns {string} */
export function stableStringify(v) {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(/** @type {Record<string, unknown>} */ (v)[k])}`).join(',')}}`;
  return JSON.stringify(v);
}

/** FNV-1a de 53 bits (como hashMaterial y hashEmitter), en base 36. @param {string} s */
export function hash53(s) {
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619);
    h2 = Math.imul(h2 ^ c, 2246822519);
  }
  return ((h2 >>> 0) * 2 ** 21 + ((h1 >>> 0) >>> 11)).toString(36);
}
