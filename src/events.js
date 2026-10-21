// Los avisos de contacto, sin el motor de física: quién escucha qué y a quién se le avisa. El
// adaptador saca de Rapier los pares que empezaron o dejaron de tocarse y llama a `emit`; acá se
// decide qué oyentes corresponden y en qué orden van los dos cuerpos.
//
//   fisica.on('enter', zona, (zona, quien) => …);          // algo entró al sensor `zona`
//   fisica.on('exit', 'moneda', 'heroe', (m, h) => …);      // por nombre
//   fisica.on('contact', (a, b, info) => …);                // cualquier choque: info.normal, info.impulse
//
// Cada lado se elige con un cuerpo, un personaje (su cuerpo), un nombre, una función
// `(cuerpo) => boolean` o una lista de esos; sin nada, cualquiera. El oyente recibe los dos cuerpos
// en el orden en que los eligió (si los dos lados sirven en los dos órdenes, el primero que se
// pidió va primero). En 'enter' / 'exit' sin elegir, el sensor va primero.
//
// Puro: no importa three, Rapier ni el DOM.

/** Los avisos que hay. */
export const EVENT_TYPES = /** @type {const} */ (['enter', 'exit', 'contact', 'separate']);
/** @typedef {typeof EVENT_TYPES[number]} EventType */
/** @typedef {(a: any, b: any, info: any) => void} Listener */
/** @typedef {(body: any) => boolean} Match */

/**
 * Cómo se elige un lado: lo convierte en una función.
 * @param {unknown} sel @param {string} que @returns {Match}
 */
export function matcher(sel, que = 'on') {
  if (sel === undefined || sel === null) return () => true;
  if (typeof sel === 'string') return (b) => !!b && b.name === sel;
  if (typeof sel === 'function') return (b) => !!/** @type {Function} */ (sel)(b);
  if (Array.isArray(sel)) {
    const fs = sel.map((s, i) => matcher(s, `${que}[${i}]`));
    return (b) => fs.some((f) => f(b));
  }
  if (typeof sel === 'object') {
    const o = /** @type {any} */ (sel);
    if (o.isCharacter) return (b) => b === o.body;
    if (o.isBody) return (b) => b === o;
  }
  throw new TypeError(`${que}: va un cuerpo, un personaje, un nombre, una función (cuerpo) => boolean o una lista de esos`);
}

/** Los oyentes de los avisos de contacto. */
export function createListeners() {
  /** @type {{ type: EventType, a: Match, b: Match, fn: Listener }[]} */
  let oyentes = [];
  return {
    /**
     * on(type, fn) · on(type, a, fn) · on(type, a, b, fn). Devuelve cómo sacarlo.
     * @param {string} type @param {...unknown} args
     */
    on(type, ...args) {
      if (!EVENT_TYPES.includes(/** @type {EventType} */ (type))) throw new Error(`on: aviso desconocido ${JSON.stringify(type)} (van ${EVENT_TYPES.join(', ')})`);
      const fn = args.pop();
      if (typeof fn !== 'function') throw new TypeError(`on('${type}', …): el último va la función (a, b, info) => …`);
      if (args.length > 2) throw new TypeError(`on('${type}', a?, b?, fn): van a lo sumo dos lados`);
      const o = { type: /** @type {EventType} */ (type), a: matcher(args[0], `on('${type}').a`), b: matcher(args[1], `on('${type}').b`), fn: /** @type {Listener} */ (fn) };
      oyentes = [...oyentes, o];
      return () => { oyentes = oyentes.filter((x) => x !== o); };
    },
    /** ¿Hay alguien escuchando este aviso? @param {EventType} type */
    has(type) { return oyentes.some((o) => o.type === type); },
    /** Cuántos oyentes hay. */
    get size() { return oyentes.length; },
    /**
     * Avisa: a cada oyente de ese tipo cuyos lados sirvan, en el orden (x, y) o (y, x). `info` es
     * del orden (x, y); `swap(info)` lo da para el orden (y, x) (la normal al revés, por ejemplo).
     * @param {EventType} type @param {any} x @param {any} y @param {any} info @param {(info: any) => any} [swap]
     */
    emit(type, x, y, info, swap = (i) => i) {
      for (const o of oyentes) {
        if (o.type !== type) continue;
        if (o.a(x) && o.b(y)) o.fn(x, y, info);
        else if (o.a(y) && o.b(x)) o.fn(y, x, swap(info));
      }
    },
    /** Saca todos. */
    clear() { oyentes = []; },
  };
}
