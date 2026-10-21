// La física como un sistema del mundo de threejs-game-engine, sin importarlo: recibe el `world`
// (cualquier objeto con `system`, `query`, `onAdd`, `onRemove` y `set`) y el mundo de física (el
// de `createPhysics`, o cualquiera con `body`, `character`, `step` y `remove`).
//
//   const fisica = await createPhysics();
//   const sistema = bodySystem(juego.world, fisica);           // un sistema de fase 'fixed'
//   juego.world.add({
//     object3d: malla,
//     transform: { position: [0, 4, 0], rotation: [0, 0, 0] },
//     body: { type: 'dynamic', colliders: { shape: 'box' } },   // datos: se guarda con la partida
//   });
//   juego.world.add({ object3d: sprite, transform: { position: [0, 0, 3] }, character: { radius: 0.3, height: 1.6 } });
//   sistema.of(entidad).applyImpulse([0, 5, 0]);                 // el cuerpo de verdad
//
// Qué hace:
//   - Al agregar una entidad con `body` (una definición, o un cuerpo ya hecho con fisica.body()) o
//     `character` (una definición o un personaje), crea el cuerpo donde dice su `transform` (si no
//     tiene, le pone uno con la posición de la definición).
//   - En cada paso fijo (después de los sistemas de la app: `order` 100 por defecto): los cuerpos
//     kinematic van a donde dice su `transform` (moveTo); `fisica.step(dt)`; y el `transform` de los
//     dynamic y de los personajes queda donde los dejó la física. El juego lo dibuja interpolado.
//   - Al sacar la entidad, saca su cuerpo (si lo creó el sistema; uno que se pasó hecho es de la app).
//
// El `transform` del juego guarda la rotación en radianes (Euler XYZ); la física, en cuaterniones:
// el sistema pasa de uno a otro. A un personaje no le toca la rotación (no gira: la guiñada es de
// la app). Un cuerpo fixed no se mueve: para moverlo, `sistema.of(e).teleport(…)`.
//
// Guardar partida: `world.toJSON()` guarda `body` y `character` si son definiciones (datos) y el
// `transform` de ese momento; al cargar, el cuerpo nace donde estaba (no con su velocidad).
//
// Puro: no importa three, Rapier ni el DOM.
import { plano } from './valid.js';
import { quatFromEuler, eulerFromQuat } from './math.js';
import { help } from './help.js';
import { BODY_SYSTEM_MEMBERS } from './members.js';

/**
 * Registra la física como un sistema del mundo del juego.
 * @param {any} world el mundo de entidades (threejs-game-engine: juego.world)
 * @param {any} fisica el mundo de física (createPhysics)
 * @param {{ order?: number, name?: string }} [opts]
 */
export function bodySystem(world, fisica, opts = {}) {
  for (const k of ['system', 'query', 'onAdd', 'onRemove', 'set']) {
    if (typeof world?.[k] !== 'function') throw new TypeError(`bodySystem(world): world va el mundo de entidades de threejs-game-engine (le falta ${k})`);
  }
  for (const k of ['body', 'character', 'step', 'remove']) {
    if (typeof fisica?.[k] !== 'function') throw new TypeError(`bodySystem(world, fisica): fisica va el mundo de createPhysics (le falta ${k})`);
  }
  if (!plano(opts)) throw new TypeError('bodySystem: las opciones van { order?, name? }');
  for (const k of Object.keys(opts)) if (!['order', 'name'].includes(k)) throw new Error(`bodySystem.${k}: clave desconocida (van order, name)`);
  const order = opts.order ?? 100, nombre = opts.name ?? 'physics';

  /** El cuerpo o personaje de cada entidad. @type {Map<any, any>} */
  const deEntidad = new Map();
  /** La entidad de cada cuerpo (y del cuerpo de cada personaje). @type {Map<any, any>} */
  const deCuerpo = new Map();
  /** Los que creó el sistema (y saca al sacar la entidad). @type {Set<any>} */
  const propios = new Set();

  /** @param {any} e */
  function crear(e) {
    if (deEntidad.has(e)) return;
    const esPersonaje = e.character !== undefined;
    if (esPersonaje && e.body !== undefined) throw new Error(`entidad ${e.id}: va body o character, no los dos`);
    const comp = esPersonaje ? e.character : e.body;
    const t = e.transform;
    let x;
    if (comp?.isBody || comp?.isCharacter) x = comp;
    else {
      const def = { ...comp };
      if (t?.position) def.position = [...t.position];
      if (t?.rotation && !esPersonaje) def.rotation = quatFromEuler(t.rotation);
      x = esPersonaje ? fisica.character(def) : fisica.body(def);
      propios.add(x);
    }
    deEntidad.set(e, x);
    deCuerpo.set(x.isCharacter ? x.body : x, e);
    if (!t) world.set(e, 'transform', esPersonaje ? { position: x.position } : { position: x.position, rotation: eulerFromQuat(x.rotation) });
  }
  /** @param {any} e */
  function sacar(e) {
    const x = deEntidad.get(e);
    if (!x) return;
    deEntidad.delete(e);
    deCuerpo.delete(x.isCharacter ? x.body : x);
    if (propios.delete(x)) fisica.remove(x);
  }
  /** Copia en el lugar (la app puede tener el array). @param {number[]} a @param {number[]} b */
  const copiar = (a, b) => { a[0] = b[0]; a[1] = b[1]; a[2] = b[2]; };

  for (const e of [...world.query('body'), ...world.query('character')]) crear(e);
  const sinAlta = world.onAdd((/** @type {any} */ e) => { if (e.body !== undefined || e.character !== undefined) crear(e); });
  const sinBaja = world.onRemove(sacar);
  const sinSistema = world.system(nombre, (/** @type {number} */ dt) => {
    for (const [e, x] of deEntidad) {
      if (!x.isBody || x.type !== 'kinematic' || !e.transform?.position) continue;
      x.moveTo(e.transform.position, e.transform.rotation ? quatFromEuler(e.transform.rotation) : undefined);
    }
    fisica.step(dt);
    for (const [e, x] of deEntidad) {
      const t = e.transform;
      if (!t || (x.isBody && x.type !== 'dynamic')) continue;
      if (t.position) copiar(t.position, x.position); else t.position = x.position;
      if (x.isBody) { if (t.rotation) copiar(t.rotation, eulerFromQuat(x.rotation)); else t.rotation = eulerFromQuat(x.rotation); }
    }
  }, { phase: 'fixed', order });

  const sistema = {
    /** El cuerpo (o el personaje) de una entidad. @param {any} entity */
    of(entity) { return deEntidad.get(entity); },
    /** La entidad de un cuerpo (o de un personaje): para los avisos de contacto. @param {any} body */
    entityOf(body) { return deCuerpo.get(body?.isCharacter ? body.body : body); },
    /** Cuántas entidades tienen cuerpo. */
    get size() { return deEntidad.size; },
    /** Saca el sistema, deja de mirar las entidades y saca los cuerpos que creó. */
    dispose() {
      sinSistema(); sinAlta(); sinBaja();
      for (const e of [...deEntidad.keys()]) sacar(e);
    },
    /** @param {{ print?: boolean }} [o] */
    help(o) { return help('bodySystem — la física como un sistema del juego', BODY_SYSTEM_MEMBERS, o); },
  };
  return sistema;
}
