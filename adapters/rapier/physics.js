// El mundo de física sobre Rapier (@dimforge/rapier3d-compat): lo único del repo que importa
// Rapier. La app escribe datos planos (defineBody, defineCharacter, arrays [x, y, z]) y recibe
// cuerpos y personajes propios, no los de Rapier.
//
//   import { createPhysics } from 'threejs-physics-engine/rapier';
//
//   const fisica = await createPhysics({ groups: ['jugador', 'pared'] });
//   fisica.body({ type: 'fixed', colliders: { shape: 'box', size: [20, 1, 20] }, position: [0, -0.5, 0] });
//   const caja = fisica.body({ position: [0, 4, 0], colliders: { shape: 'box' } });
//   const heroe = fisica.character({ radius: 0.3, height: 1.8, position: [2, 0, 0] });
//   fisica.on('enter', 'zona', (zona, quien) => …);
//   // en cada paso fijo (el del juego, o fisica.advance(dt) en el cuadro):
//   heroe.move([vx * dt, vy * dt, vz * dt]);
//   fisica.step(dt);
//
// **Rapier se carga a pedido**: `createPhysics` es async y la primera vez hace
// `await import('@dimforge/rapier3d-compat')` y `RAPIER.init()` (como threejs-render-engine con
// three-gpu-pathtracer): una app que no hace física no lo necesita en su importmap. En el navegador,
// el importmap lo apunta a `https://cdn.jsdelivr.net/npm/@dimforge/rapier3d-compat@0.21.0/dist/rapier.mjs`
// (el wasm va adentro del archivo); en Node, al paquete.
//
// **step(dt)**: un paso de Rapier de exactamente dt (pone `world.timestep = dt`): con el juego, el
// paso fijo es del juego y la física lo sigue. Un dt más largo que `maxDelta` se parte en pasos
// iguales (estable aunque llegue un cuadro largo). Sin juego, `advance(dtDelCuadro)` junta el
// tiempo y da pasos de `timestep` (src/clock.js). Determinista: la misma secuencia de llamadas da
// lo mismo (Rapier lo es, en la misma plataforma).
//
// **Las consultas ven lo último**: Rapier actualiza sus estructuras de búsqueda en cada paso, así
// que un cuerpo recién creado o teletransportado no lo vería un rayo hasta el próximo step. Antes de
// una consulta (ray, overlap, closest, move de un personaje), si algo cambió desde el último paso,
// se da un paso de 1e-9 s (con dt 0, Rapier las rompe): no mueve nada que se vea, solo actualiza.
// Es determinista como todo lo demás: la misma secuencia de llamadas da lo mismo.
//
// **Los avisos**: los colliders sensores avisan siempre ('enter' / 'exit'; también con un
// personaje o un kinematic, que Rapier por defecto no mira contra lo fixed). Los sólidos avisan
// ('contact' / 'separate') desde que hay un oyente de esos: recién ahí se les prende
// `ActiveEvents.COLLISION_EVENTS`. Los avisos se reparten después de cada step, con los cuerpos
// nuestros.
//
// `fisica.raw`, `cuerpo.raw` y `personaje.raw` son los objetos de Rapier: la escotilla. Si los usás,
// quedás atado a Rapier (el día que haya un adaptador de Jolt, eso no se traduce).
import { definePhysics } from '../../src/options.js';
import { defineBody, colliderMasses } from '../../src/body.js';
import { defineCharacter, characterCollider } from '../../src/character.js';
import { interactionGroups, groupBits, ALL_GROUPS } from '../../src/groups.js';
import { resolveSurface } from '../../src/materials.js';
import { defineCollider } from '../../src/shapes.js';
import { rotation as rotacion, rotateVec, multiplyQuat } from '../../src/math.js';
import { vec3 } from '../../src/valid.js';
import { createClock } from '../../src/clock.js';
import { createListeners } from '../../src/events.js';
import { help } from '../../src/help.js';
import { PHYSICS_MEMBERS, BODY_MEMBERS, CHARACTER_MEMBERS } from '../../src/members.js';

/** @typedef {import('../../src/valid.js').Vec3} Vec3 */
/** @typedef {import('../../src/valid.js').Quat} Quat */
/** @typedef {import('../../src/shapes.js').ColliderDef} ColliderDef */
/** @typedef {import('../../src/body.js').BodyDef} BodyDef */
/** @typedef {import('../../src/character.js').CharacterDef} CharacterDef */
/** @typedef {ReturnType<typeof crearMundo>} Physics */

/** @type {Promise<any> | null} */
let modulo = null;

/**
 * Rapier, cargado e inicializado (una sola vez). Lo usa createPhysics; está exportado para la
 * escotilla (armar algo de Rapier a mano junto con `fisica.raw`).
 * @returns {Promise<any>}
 */
export function loadRapier() {
  modulo ??= import('@dimforge/rapier3d-compat')
    .then(async (m) => {
      const R = /** @type {any} */ (m).default ?? m;
      await R.init();
      return R;
    })
    .catch((e) => {
      modulo = null;
      throw new Error(`no se pudo cargar Rapier (¿está "@dimforge/rapier3d-compat" en el importmap, o instalado?): ${e.message}`);
    });
  return modulo;
}

/**
 * Un mundo de física. Async: la primera vez carga Rapier.
 * @param {Record<string, unknown>} [opts] { gravity, timestep, maxSteps, maxDelta, groups, materials, bodies, characters }
 */
export async function createPhysics(opts = {}) {
  const o = definePhysics(opts); // valida antes de cargar nada
  const R = await loadRapier();
  return crearMundo(R, o);
}

/** @param {Vec3} v */
const xyz = (v) => ({ x: v[0], y: v[1], z: v[2] });
/** @param {Quat} q */
const xyzw = (q) => ({ x: q[0], y: q[1], z: q[2], w: q[3] });
/** La velocidad sin lo de los ejes trabados. @param {Vec3} v @param {[boolean, boolean, boolean]} ejes @returns {Vec3} */
const libre = (v, ejes) => [ejes[0] ? 0 : v[0], ejes[1] ? 0 : v[1], ejes[2] ? 0 : v[2]];
/** @param {{ x: number, y: number, z: number }} v @returns {Vec3} */
const arr3 = (v) => [v.x, v.y, v.z];
/** @param {{ x: number, y: number, z: number, w: number }} q @returns {Quat} */
const arr4 = (q) => [q.x, q.y, q.z, q.w];

/**
 * @param {any} R el módulo de Rapier, ya inicializado
 * @param {import('../../src/options.js').PhysicsOptions} o
 */
function crearMundo(R, o) {
  const mundo = new R.World(xyz(o.gravity));
  mundo.timestep = o.timestep;
  const cola = new R.EventQueue(false);
  const reloj = createClock({ step: o.timestep, maxSteps: o.maxSteps });
  const oyentes = createListeners();
  const ctx = { groups: o.groups, materials: o.materials };
  const REGLAS = { average: R.CoefficientCombineRule.Average, min: R.CoefficientCombineRule.Min, multiply: R.CoefficientCombineRule.Multiply, max: R.CoefficientCombineRule.Max };
  // un sensor mira también a los kinematic (un personaje) contra lo fixed y lo kinematic
  const TIPOS_SENSOR = R.ActiveCollisionTypes.DEFAULT | R.ActiveCollisionTypes.KINEMATIC_FIXED | R.ActiveCollisionTypes.KINEMATIC_KINEMATIC;

  /** @typedef {{ cuerpo: any, i: number, sensor: boolean }} DeCollider */
  /** Por handle de collider: de qué cuerpo es y cuál es. @type {Map<number, DeCollider>} */
  const porCollider = new Map();
  /** Los de colliders sacados, hasta repartir los avisos del próximo paso ('exit' al sacar). @type {Map<number, DeCollider>} */
  const quitados = new Map();
  /** @type {Set<any>} */ const cuerpos = new Set();
  /** @type {Set<any>} */ const personajes = new Set();
  /** Los que tienen una fuerza para el próximo paso. @type {Set<any>} */ const conFuerza = new Set();
  /** @type {Set<(dt: number) => void>} */ const alPaso = new Set();
  let sucio = true, soltado = false, pasos = 0, tiempo = 0, conContactos = false;

  const vivo = () => { if (soltado) throw new Error('el mundo de física ya se soltó (dispose)'); };

  /** Los kinematic que tienen a dónde ir en el próximo paso (moveTo, move de un personaje). @type {Map<any, { t: Vec3 | null, q: Quat | null }>} */
  const destinos = new Map();
  /** @param {any} rb @param {Vec3 | null} t @param {Quat | null} q */
  function destino(rb, t, q) {
    const d = destinos.get(rb) ?? { t: null, q: null };
    if (t) { d.t = t; rb.setNextKinematicTranslation(xyz(t)); }
    if (q) { d.q = q; rb.setNextKinematicRotation(xyzw(q)); }
    destinos.set(rb, d);
  }

  /**
   * Que las consultas vean lo último. Rapier arma sus estructuras de búsqueda en cada paso, y con
   * dt 0 las rompe si algo se movió a mano: si algo cambió desde el último paso, se da uno de
   * 1e-9 s (no mueve nada que se vea), con los kinematic quietos (si no, llegarían a su destino a
   * una velocidad enorme) y después se les devuelve su destino.
   */
  function alDia() {
    if (!sucio) return;
    for (const rb of destinos.keys()) { rb.setNextKinematicTranslation(rb.translation()); rb.setNextKinematicRotation(rb.rotation()); }
    mundo.timestep = 1e-9;
    mundo.step(cola);
    for (const [rb, d] of destinos) { if (d.t) rb.setNextKinematicTranslation(xyz(d.t)); if (d.q) rb.setNextKinematicRotation(xyzw(d.q)); }
    sucio = false;
  }

  /** La forma de Rapier de un collider (un ColliderDesc, sin ubicar). @param {ColliderDef} c @param {string} que */
  function forma(c, que) {
    const r = c.radius ?? 0, h = c.height ?? 0;
    switch (c.shape) {
      case 'box': { const s = /** @type {Vec3} */ (c.size); return R.ColliderDesc.cuboid(s[0] / 2, s[1] / 2, s[2] / 2); }
      case 'sphere': return R.ColliderDesc.ball(r);
      case 'capsule': return R.ColliderDesc.capsule(h / 2 - r, r);
      case 'cylinder': return R.ColliderDesc.cylinder(h / 2, r);
      case 'cone': return R.ColliderDesc.cone(h / 2, r);
      case 'convex': {
        const d = R.ColliderDesc.convexHull(new Float32Array(/** @type {number[]} */ (c.points)));
        if (!d) throw new Error(`${que}.points: Rapier no pudo armar la envolvente convexa`);
        return d;
      }
      case 'mesh': return R.ColliderDesc.trimesh(new Float32Array(/** @type {number[]} */ (c.vertices)), new Uint32Array(/** @type {number[]} */ (c.indices)));
      case 'heightfield': {
        // Rapier: celdas (filas − 1, columnas − 1) y las alturas por columna (column-major)
        const H = /** @type {number[][]} */ (c.heights), filas = H.length, cols = H[0].length;
        const a = new Float32Array(filas * cols);
        for (let i = 0; i < filas; i++) for (let j = 0; j < cols; j++) a[j * filas + i] = H[i][j];
        return R.ColliderDesc.heightfield(filas - 1, cols - 1, a, xyz(/** @type {Vec3} */ (c.size)));
      }
    }
    throw new Error(`${que}.shape: forma desconocida ${c.shape}`);
  }

  /**
   * Un collider de Rapier en el cuerpo.
   * @param {ColliderDef} c @param {number} i @param {any} rb @param {number | null} masa @param {any} cuerpo @param {string} que
   */
  function crearCollider(c, i, rb, masa, cuerpo, que) {
    const d = forma(c, que);
    const s = resolveSurface(c, o.materials);
    d.setTranslation(c.offset[0], c.offset[1], c.offset[2]).setRotation(xyzw(c.rotation));
    d.setFriction(s.friction).setRestitution(s.restitution);
    d.setFrictionCombineRule(REGLAS[s.frictionCombine]).setRestitutionCombineRule(REGLAS[s.restitutionCombine]);
    if (masa !== null) { if (masa > 0) d.setMass(masa); else d.setDensity(0); }
    else if (c.mass !== null) d.setMass(c.mass);
    else d.setDensity(s.density);
    d.setSensor(c.sensor);
    d.setCollisionGroups(interactionGroups(o.groups, c.group, c.collidesWith, que));
    if (c.sensor) { d.setActiveEvents(R.ActiveEvents.COLLISION_EVENTS); d.setActiveCollisionTypes(TIPOS_SENSOR); }
    else if (conContactos) d.setActiveEvents(R.ActiveEvents.COLLISION_EVENTS);
    const col = mundo.createCollider(d, rb);
    porCollider.set(col.handle, { cuerpo, i, sensor: c.sensor });
    return col;
  }

  /** Lo que se excluye de una consulta: un cuerpo, un personaje o una lista. @param {unknown} x @returns {Set<any>} */
  function excluidos(x) {
    const lista = x === undefined || x === null ? [] : Array.isArray(x) ? x : [x];
    return new Set(lista.map((/** @type {any} */ b) => (b?.isCharacter ? b.body : b)));
  }

  /**
   * Los filtros de una consulta de Rapier.
   * @param {Record<string, any>} op @param {string} que
   * @returns {{ flags: number, groups: number | undefined, pred: ((c: any) => boolean) | undefined }}
   */
  function filtros(op, que) {
    for (const k of Object.keys(op)) if (!['max', 'groups', 'exclude', 'sensors', 'rotation'].includes(k)) throw new Error(`${que}.${k}: clave desconocida (van max, groups, exclude, sensors${que.startsWith('overlap') ? ', rotation' : ''})`);
    const fuera = excluidos(op.exclude);
    const grupos = op.groups === undefined || op.groups === null ? undefined : ((ALL_GROUPS << 16) | groupBits(o.groups, typeof op.groups === 'string' ? [op.groups] : op.groups, `${que}.groups`)) >>> 0;
    return {
      flags: op.sensors ? 0 : R.QueryFilterFlags.EXCLUDE_SENSORS,
      groups: grupos,
      pred: fuera.size ? (c) => !fuera.has(porCollider.get(c.handle)?.cuerpo) : undefined,
    };
  }

  /**
   * Un cuerpo.
   * @param {unknown} def @param {string} [que]
   */
  function crearCuerpo(def, que = 'body') {
    vivo();
    const d = defineBody(def, { ...ctx, que });
    const desc = d.type === 'dynamic' ? R.RigidBodyDesc.dynamic() : d.type === 'fixed' ? R.RigidBodyDesc.fixed() : R.RigidBodyDesc.kinematicPositionBased();
    desc.setTranslation(d.position[0], d.position[1], d.position[2]).setRotation(xyzw(d.rotation));
    // un eje trabado no se mueve tampoco por la velocidad que se le pone (Rapier solo lo traba para las fuerzas)
    const v0 = libre(d.linearVelocity, d.lockPosition);
    desc.setLinvel(v0[0], v0[1], v0[2]).setAngvel(xyz(libre(d.angularVelocity, d.lockRotation)));
    desc.setGravityScale(d.gravityScale).setLinearDamping(d.linearDamping).setAngularDamping(d.angularDamping);
    desc.setCcdEnabled(d.ccd).setCanSleep(d.canSleep).setSleeping(d.sleeping);
    desc.enabledRotations(!d.lockRotation[0], !d.lockRotation[1], !d.lockRotation[2]);
    desc.enabledTranslations(!d.lockPosition[0], !d.lockPosition[1], !d.lockPosition[2]);
    const rb = mundo.createRigidBody(desc);
    let quitado = false;

    const cuerpo = {
      isBody: true,
      get type() { return d.type; },
      name: d.name,
      userData: d.userData,
      def: d,
      colliders: d.colliders,
      get position() { return arr3(rb.translation()); },
      get rotation() { return arr4(rb.rotation()); },
      get velocity() { return arr3(rb.linvel()); },
      get angularVelocity() { return arr3(rb.angvel()); },
      get mass() { return rb.mass(); },
      get sleeping() { return rb.isSleeping(); },
      get removed() { return quitado; },
      /** @param {unknown} position */
      setPosition(position) { vivo(); rb.setTranslation(xyz(vec3(position, 'setPosition(position)')), true); sucio = true; return cuerpo; },
      /** @param {unknown} rotation cuaternión o grados */
      setRotation(rotation) { vivo(); rb.setRotation(xyzw(rotacion(rotation, 'setRotation(rotation)')), true); sucio = true; return cuerpo; },
      /** @param {unknown} position @param {unknown} [rotation] */
      teleport(position, rotation) {
        vivo();
        const p = vec3(position, 'teleport(position)');
        const q = rotation === undefined ? null : rotacion(rotation, 'teleport(rotation)');
        rb.setTranslation(xyz(p), true);
        if (q) rb.setRotation(xyzw(q), true);
        if (d.type === 'dynamic') { rb.setLinvel({ x: 0, y: 0, z: 0 }, true); rb.setAngvel({ x: 0, y: 0, z: 0 }, true); }
        if (d.type === 'kinematic') destino(rb, p, q);
        sucio = true;
        return cuerpo;
      },
      /** @param {unknown} velocity */
      setVelocity(velocity) { vivo(); rb.setLinvel(xyz(libre(vec3(velocity, 'setVelocity(velocity)'), d.lockPosition)), true); return cuerpo; },
      /** @param {unknown} velocity radianes por segundo */
      setAngularVelocity(velocity) { vivo(); rb.setAngvel(xyz(libre(vec3(velocity, 'setAngularVelocity(velocity)'), d.lockRotation)), true); return cuerpo; },
      /** @param {unknown} impulse @param {unknown} [point] en el mundo */
      applyImpulse(impulse, point) {
        vivo();
        const j = xyz(vec3(impulse, 'applyImpulse(impulse)'));
        if (point === undefined) rb.applyImpulse(j, true);
        else rb.applyImpulseAtPoint(j, xyz(vec3(point, 'applyImpulse(impulse, point)')), true);
        return cuerpo;
      },
      /** @param {unknown} force @param {unknown} [point] en el mundo */
      applyForce(force, point) {
        vivo();
        const f = xyz(vec3(force, 'applyForce(force)'));
        if (point === undefined) rb.addForce(f, true);
        else rb.addForceAtPoint(f, xyz(vec3(point, 'applyForce(force, point)')), true);
        conFuerza.add(cuerpo);
        return cuerpo;
      },
      /** @param {unknown} impulse */
      applyTorqueImpulse(impulse) { vivo(); rb.applyTorqueImpulse(xyz(vec3(impulse, 'applyTorqueImpulse(impulse)')), true); return cuerpo; },
      /** @param {unknown} position @param {unknown} [rotation] */
      moveTo(position, rotation) {
        vivo();
        if (d.type !== 'kinematic') throw new Error(`moveTo: es para un cuerpo kinematic (este es ${d.type}: va setPosition o teleport)`);
        destino(rb, vec3(position, 'moveTo(position)'), rotation === undefined ? null : rotacion(rotation, 'moveTo(rotation)'));
        return cuerpo;
      },
      sleep() { vivo(); rb.sleep(); return cuerpo; },
      wake() { vivo(); rb.wakeUp(); return cuerpo; },
      /** @returns {BodyDef} */
      toJSON() {
        if (quitado) return structuredClone(d);
        return { ...structuredClone(d), position: cuerpo.position, rotation: cuerpo.rotation, linearVelocity: cuerpo.velocity, angularVelocity: cuerpo.angularVelocity, sleeping: rb.isSleeping() };
      },
      raw: rb,
      remove() { sacarCuerpo(cuerpo); },
      dispose() { sacarCuerpo(cuerpo); },
      /** @param {{ print?: boolean }} [op] */
      help(op) { return help(`Body${d.name ? ` "${d.name}"` : ''} — un cuerpo (${d.type})`, BODY_MEMBERS, op); },
    };
    /** Lo saca de Rapier (lo llama sacarCuerpo). */
    const quitar = () => {
      if (quitado) return;
      quitado = true;
      for (let i = 0; i < rb.numColliders(); i++) {
        const h = rb.collider(i).handle;
        const x = porCollider.get(h);
        if (x) { quitados.set(h, x); porCollider.delete(h); }
      }
      destinos.delete(rb);
      mundo.removeRigidBody(rb);
    };
    internos.set(cuerpo, quitar);
    const masas = colliderMasses(d);
    d.colliders.forEach((c, i) => crearCollider(c, i, rb, masas[i], cuerpo, `${que}.colliders[${i}]`));
    cuerpos.add(cuerpo);
    sucio = true;
    return cuerpo;
  }
  /** Cómo se saca cada cuerpo. @type {WeakMap<any, () => void>} */
  const internos = new WeakMap();

  /** @param {any} cuerpo */
  function sacarCuerpo(cuerpo) {
    if (soltado || !cuerpos.has(cuerpo)) return;
    cuerpos.delete(cuerpo);
    conFuerza.delete(cuerpo);
    internos.get(cuerpo)?.();
    sucio = true;
  }

  /**
   * Un personaje.
   * @param {unknown} def @param {string} [que]
   */
  function crearPersonaje(def, que = 'character') {
    vivo();
    const d = defineCharacter(def, { ...ctx, que });
    const cuerpo = crearCuerpo({ type: 'kinematic', position: d.position, colliders: [characterCollider(d)], name: d.name, userData: d.userData }, que);
    const rb = cuerpo.raw;
    const col = rb.collider(0);
    const ctrl = mundo.createCharacterController(d.offset);
    ctrl.setUp(xyz(d.up));
    ctrl.setSlideEnabled(d.slide);
    if (d.step !== null) ctrl.enableAutostep(d.step, d.stepWidth, false);
    ctrl.setMaxSlopeClimbAngle((d.slope * Math.PI) / 180);
    ctrl.setMinSlopeSlideAngle((d.slope * Math.PI) / 180);
    if (d.snap !== null) ctrl.enableSnapToGround(d.snap);
    ctrl.setApplyImpulsesToDynamicBodies(d.push);
    const grupos = interactionGroups(o.groups, d.group, d.collidesWith, que);
    /** Lo pedido desde el último step (si move se llama más de una vez entre pasos, se suma). @type {Vec3} */
    let pendiente = [0, 0, 0];
    /** A donde va. @type {Vec3} */
    let objetivo = cuerpo.position;
    let enPiso = false;
    /** @type {{ body: any, normal: Vec3, point: Vec3 }[]} */
    let choques = [];
    let quitado = false;
    const vivoP = () => { vivo(); if (quitado) throw new Error(`el personaje${d.name ? ` ${d.name}` : ''} ya se sacó del mundo`); };

    const personaje = {
      isCharacter: true,
      name: d.name,
      userData: d.userData,
      def: d,
      body: cuerpo,
      get position() { return /** @type {Vec3} */ ([...objetivo]); },
      get grounded() { return enPiso; },
      get collisions() { return choques.map((c) => ({ ...c })); },
      /** @param {unknown} delta */
      move(delta) {
        vivoP();
        const v = vec3(delta, 'move(delta)');
        pendiente = [pendiente[0] + v[0], pendiente[1] + v[1], pendiente[2] + v[2]];
        alDia();
        // en dos pasadas: lo horizontal y después lo vertical (desde donde quedó). Con las dos
        // juntas, Rapier a veces frena todo un paso cuando lo vertical empuja contra el piso.
        const real = arr3(rb.translation());
        const u = d.up, vu = pendiente[0] * u[0] + pendiente[1] * u[1] + pendiente[2] * u[2];
        /** @type {Vec3} */
        const horizontal = [pendiente[0] - u[0] * vu, pendiente[1] - u[1] * vu, pendiente[2] - u[2] * vu];
        choques = [];
        const calcular = (/** @type {Vec3} */ v) => {
          ctrl.computeColliderMovement(col, xyz(v), R.QueryFilterFlags.EXCLUDE_SENSORS, grupos);
          for (let i = 0; i < ctrl.numComputedCollisions(); i++) {
            const c = ctrl.computedCollision(i);
            if (!c?.collider) continue;
            choques.push({ body: porCollider.get(c.collider.handle)?.cuerpo ?? null, normal: arr3(c.normal1), point: arr3(c.witness1) });
          }
          return arr3(ctrl.computedMovement());
        };
        const mh = calcular(horizontal);
        enPiso = ctrl.computedGrounded();
        /** @type {Vec3} */
        let mv = [0, 0, 0];
        if (vu !== 0) {
          rb.setTranslation(xyz([real[0] + mh[0], real[1] + mh[1], real[2] + mh[2]]), false);
          mundo.propagateModifiedBodyPositionsToColliders();
          mv = calcular([u[0] * vu, u[1] * vu, u[2] * vu]);
          enPiso = ctrl.computedGrounded();
          rb.setTranslation(xyz(real), false);
          mundo.propagateModifiedBodyPositionsToColliders();
        }
        /** @type {Vec3} */
        const m = [mh[0] + mv[0], mh[1] + mv[1], mh[2] + mv[2]];
        objetivo = [real[0] + m[0], real[1] + m[1], real[2] + m[2]];
        destino(rb, objetivo, null);
        return { position: personaje.position, grounded: enPiso, collisions: personaje.collisions, movement: m };
      },
      /** @param {unknown} position */
      teleport(position) {
        vivoP();
        const p = vec3(position, 'teleport(position)');
        cuerpo.teleport(p);
        objetivo = [...p];
        pendiente = [0, 0, 0];
        enPiso = false;
        choques = [];
        return personaje;
      },
      /** @returns {CharacterDef} */
      toJSON() { return { ...structuredClone(d), position: personaje.position }; },
      raw: ctrl,
      remove() { sacarPersonaje(personaje); },
      dispose() { sacarPersonaje(personaje); },
      /** @param {{ print?: boolean }} [op] */
      help(op) { return help(`Character${d.name ? ` "${d.name}"` : ''} — un personaje`, CHARACTER_MEMBERS, op); },
    };
    internosP.set(personaje, {
      /** Después de cada step: lo pedido ya se aplicó. */
      paso() { pendiente = [0, 0, 0]; objetivo = arr3(rb.translation()); },
      quitar() { quitado = true; mundo.removeCharacterController(ctrl); sacarCuerpo(cuerpo); },
    });
    personajes.add(personaje);
    return personaje;
  }
  /** @type {WeakMap<any, { paso: () => void, quitar: () => void }>} */
  const internosP = new WeakMap();

  /** @param {any} p */
  function sacarPersonaje(p) {
    if (soltado || !personajes.has(p)) return;
    personajes.delete(p);
    internosP.get(p)?.quitar();
  }

  /** Lo que dice el contacto entre dos colliders: la normal (de a hacia b), un punto y el impulso. @param {number} h1 @param {number} h2 */
  function contacto(h1, h2) {
    /** @type {{ normal: Vec3 | null, point: Vec3 | null, impulse: number }} */
    const info = { normal: null, point: null, impulse: 0 };
    mundo.contactPair(mundo.getCollider(h1), mundo.getCollider(h2), (/** @type {any} */ m, /** @type {boolean} */ invertido) => {
      if (m.numContacts() === 0 && m.numSolverContacts() === 0) return;
      const n = arr3(m.normal());
      if (!info.normal) info.normal = invertido ? [-n[0], -n[1], -n[2]] : n;
      if (!info.point && m.numSolverContacts() > 0) info.point = arr3(m.solverContactPoint(0));
      for (let i = 0; i < m.numContacts(); i++) info.impulse += m.contactImpulse(i);
    });
    return info;
  }

  /** Reparte los avisos de lo que pasó en los últimos pasos. */
  function avisar() {
    /** @type {[import('../../src/events.js').EventType, any, any, any][]} */
    const lista = [];
    cola.drainCollisionEvents((/** @type {number} */ h1, /** @type {number} */ h2, /** @type {boolean} */ empezo) => {
      let a = porCollider.get(h1) ?? quitados.get(h1), b = porCollider.get(h2) ?? quitados.get(h2);
      if (!a || !b) return;
      const sensor = a.sensor || b.sensor;
      const tipo = sensor ? (empezo ? 'enter' : 'exit') : empezo ? 'contact' : 'separate';
      if (!oyentes.has(tipo)) return;
      let [ha, hb] = [h1, h2];
      if (sensor && !a.sensor) { [a, b] = [b, a]; [ha, hb] = [hb, ha]; } // el sensor primero
      const info = { type: tipo, colliders: [a.i, b.i], normal: /** @type {Vec3 | null} */ (null), point: /** @type {Vec3 | null} */ (null), impulse: 0 };
      if (tipo === 'contact' && porCollider.has(ha) && porCollider.has(hb)) Object.assign(info, contacto(ha, hb));
      lista.push([tipo, a.cuerpo, b.cuerpo, info]);
    });
    quitados.clear();
    const dar = (/** @type {any} */ i) => ({ ...i, colliders: [i.colliders[1], i.colliders[0]], normal: i.normal && i.normal.map((/** @type {number} */ x) => -x) });
    for (const [tipo, x, y, info] of lista) oyentes.emit(tipo, x, y, info, dar);
  }

  /**
   * @param {number} dt
   */
  function paso(dt) {
    vivo();
    if (!(typeof dt === 'number' && Number.isFinite(dt) && dt > 0)) throw new RangeError(`step(dt): va un número > 0 (vino ${JSON.stringify(dt)})`);
    const n = Math.max(1, Math.ceil(dt / o.maxDelta - 1e-9));
    mundo.timestep = dt / n;
    for (let i = 0; i < n; i++) mundo.step(cola);
    destinos.clear();
    for (const c of conFuerza) { c.raw.resetForces(false); c.raw.resetTorques(false); }
    conFuerza.clear();
    for (const p of personajes) internosP.get(p)?.paso();
    sucio = false;
    pasos++;
    tiempo += dt;
    avisar();
    for (const fn of [...alPaso]) fn(dt);
  }

  const fisica = {
    /** Un cuerpo nuevo (ver defineBody). @param {Record<string, unknown>} [def] */
    body(def) { return crearCuerpo(def); },
    /** Un personaje nuevo (ver defineCharacter). @param {Record<string, unknown>} [def] */
    character(def) { return crearPersonaje(def); },
    /** Saca un cuerpo o un personaje. @param {any} body */
    remove(body) {
      if (body?.isCharacter) sacarPersonaje(body);
      else if (body?.isBody) sacarCuerpo(body);
      else throw new TypeError('remove(body): va un cuerpo o un personaje de este mundo');
    },
    /** Los cuerpos que hay (con los de los personajes). */
    get bodies() { return [...cuerpos]; },
    /** Los personajes que hay. */
    get characters() { return [...personajes]; },

    /** Avanza dt segundos (por defecto, timestep). @param {number} [dt] */
    step(dt = o.timestep) { paso(dt); },
    /** Junta el dt del cuadro y da los pasos de timestep que entran. Devuelve alpha. @param {number} dt */
    advance(dt) {
      vivo();
      reloj.advance(dt, paso);
      return reloj.alpha;
    },
    get alpha() { return reloj.alpha; },
    get time() { return tiempo; },
    get steps() { return pasos; },
    /** Algo que corre después de cada step. Devuelve cómo sacarlo. @param {(dt: number) => void} fn */
    onStep(fn) {
      if (typeof fn !== 'function') throw new TypeError('onStep(fn): va una función (dt) => …');
      alPaso.add(fn);
      return () => { alPaso.delete(fn); };
    },
    /**
     * Un aviso de contacto: on(type, fn), on(type, a, fn) o on(type, a, b, fn). Devuelve cómo sacarlo.
     * @param {'enter' | 'exit' | 'contact' | 'separate'} type @param {...any} args
     */
    on(type, ...args) {
      vivo();
      const off = oyentes.on(type, ...args);
      if ((type === 'contact' || type === 'separate') && !conContactos) {
        // recién ahora los sólidos tienen que avisar
        conContactos = true;
        mundo.forEachCollider((/** @type {any} */ c) => { if (!c.isSensor()) c.setActiveEvents(R.ActiveEvents.COLLISION_EVENTS); });
      }
      return off;
    },

    /**
     * El primer cuerpo que toca un rayo.
     * @param {unknown} origin @param {unknown} direction @param {{ max?: number, groups?: string | string[], exclude?: any, sensors?: boolean }} [opts]
     */
    ray(origin, direction, opts = {}) {
      vivo();
      const { r, max, f } = rayo(origin, direction, opts, 'ray');
      alDia();
      const hit = mundo.castRayAndGetNormal(r, max, true, f.flags, f.groups, undefined, undefined, f.pred);
      return hit ? impacto(r, hit.collider, hit.timeOfImpact, hit.normal) : null;
    },
    /**
     * Todos los cuerpos que toca un rayo, del más cerca al más lejos.
     * @param {unknown} origin @param {unknown} direction @param {{ max?: number, groups?: string | string[], exclude?: any, sensors?: boolean }} [opts]
     */
    rayAll(origin, direction, opts = {}) {
      vivo();
      const { r, max, f } = rayo(origin, direction, opts, 'rayAll');
      alDia();
      /** @type {ReturnType<typeof impacto>[]} */
      const out = [];
      mundo.intersectionsWithRay(r, max, true, (/** @type {any} */ hit) => { out.push(impacto(r, hit.collider, hit.timeOfImpact, hit.normal)); return true; }, f.flags, f.groups, undefined, undefined, f.pred);
      return out.sort((a, b) => a.distance - b.distance);
    },
    /**
     * Los cuerpos que se superponen con una forma puesta en un lugar.
     * @param {unknown} shape una definición de collider ({ shape: 'sphere', radius: 2 }) @param {unknown} position
     * @param {{ rotation?: unknown, groups?: string | string[], exclude?: any, sensors?: boolean }} [opts]
     */
    overlap(shape, position, opts = {}) {
      vivo();
      const c = defineCollider(shape, 'overlap(shape)');
      if (c.shape === 'mesh' || c.shape === 'heightfield') throw new Error(`overlap(shape): '${c.shape}' no va en una consulta (va box, sphere, capsule, cylinder, cone o convex)`);
      const p = vec3(position, 'overlap(position)');
      const q = /** @type {Quat} */ (opts.rotation === undefined ? [0, 0, 0, 1] : rotacion(opts.rotation, 'overlap.rotation'));
      const f = filtros(opts, 'overlap');
      alDia();
      const s = forma(c, 'overlap(shape)').shape;
      /** @type {Set<any>} */
      const out = new Set();
      // el offset y la rotación del collider, sobre los de la consulta
      const o2 = rotateVec(q, c.offset);
      const pos = { x: p[0] + o2[0], y: p[1] + o2[1], z: p[2] + o2[2] };
      mundo.intersectionsWithShape(pos, xyzw(multiplyQuat(q, c.rotation)), s, (/** @type {any} */ col) => {
        const x = porCollider.get(col.handle);
        if (x) out.add(x.cuerpo);
        return true;
      }, f.flags, f.groups, undefined, undefined, f.pred);
      return [...out];
    },
    /**
     * El punto de un cuerpo más cercano a un punto.
     * @param {unknown} point @param {{ groups?: string | string[], exclude?: any, sensors?: boolean }} [opts]
     */
    closest(point, opts = {}) {
      vivo();
      const p = vec3(point, 'closest(point)');
      const f = filtros(opts, 'closest');
      alDia();
      const pr = mundo.projectPoint(xyz(p), true, f.flags, f.groups, undefined, undefined, f.pred);
      if (!pr) return null;
      const x = porCollider.get(pr.collider.handle);
      const q = arr3(pr.point);
      return { body: x?.cuerpo ?? null, point: q, distance: Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]), inside: pr.isInside, collider: x?.i ?? -1 };
    },

    get gravity() { return arr3(mundo.gravity); },
    set gravity(v) { vivo(); mundo.gravity = xyz(vec3(v, 'gravity')); for (const c of cuerpos) c.raw.wakeUp(); },
    groups: o.groups,
    materials: o.materials,
    /** La definición completa y validada de un cuerpo, con los grupos y materiales de este mundo. @param {unknown} def */
    define: (def) => defineBody(def, ctx),

    /** Qué hay. */
    stats() {
      vivo();
      let dormidos = 0, contactos = 0;
      for (const c of cuerpos) if (c.raw.isSleeping()) dormidos++;
      mundo.forEachCollider((/** @type {any} */ c1) => {
        mundo.contactPairsWith(c1, (/** @type {any} */ c2) => {
          if (c2.handle <= c1.handle) return;
          let toca = false;
          mundo.contactPair(c1, c2, (/** @type {any} */ m) => { if (m.numContacts() > 0) toca = true; });
          if (toca) contactos++;
        });
      });
      return { bodies: cuerpos.size, colliders: mundo.colliders.len(), sleeping: dormidos, contacts: contactos, characters: personajes.size, steps: pasos, time: tiempo };
    },
    /** El mundo como datos, con cada cuerpo donde está ahora. */
    toJSON() {
      const deP = new Set([...personajes].map((p) => p.body));
      return {
        gravity: fisica.gravity, timestep: o.timestep, maxSteps: o.maxSteps, maxDelta: o.maxDelta,
        groups: [...o.groups], materials: structuredClone(/** @type {Record<string, unknown>} */ (o.materials)),
        bodies: [...cuerpos].filter((c) => !deP.has(c)).map((c) => c.toJSON()),
        characters: [...personajes].map((p) => p.toJSON()),
      };
    },
    raw: mundo,
    /** Suelta el mundo de Rapier. */
    dispose() {
      if (soltado) return;
      for (const p of personajes) mundo.removeCharacterController(p.raw);
      personajes.clear(); cuerpos.clear(); porCollider.clear(); quitados.clear(); alPaso.clear(); oyentes.clear();
      soltado = true;
      cola.free();
      mundo.free();
    },
    /** @param {{ print?: boolean }} [op] */
    help(op) { return help('Physics — física con Rapier, con datos planos', PHYSICS_MEMBERS, op); },
  };

  /**
   * Un rayo validado.
   * @param {unknown} origin @param {unknown} direction @param {Record<string, any>} opts @param {string} que
   */
  function rayo(origin, direction, opts, que) {
    const p = vec3(origin, `${que}(origin)`), d = vec3(direction, `${que}(direction)`);
    const l = Math.hypot(d[0], d[1], d[2]);
    if (!(l > 1e-12)) throw new RangeError(`${que}(direction): va una dirección (no [0, 0, 0])`);
    const max = opts.max ?? 1e6;
    if (!(typeof max === 'number' && max > 0)) throw new RangeError(`${que}.max: va un número > 0 (vino ${JSON.stringify(max)})`);
    return { r: new R.Ray(xyz(p), { x: d[0] / l, y: d[1] / l, z: d[2] / l }), max, f: filtros(opts, que) };
  }
  /** Un impacto de un rayo, con los cuerpos nuestros. @param {any} r @param {any} col @param {number} toi @param {any} normal */
  function impacto(r, col, toi, normal) {
    const x = porCollider.get(col.handle);
    return {
      body: x?.cuerpo ?? null,
      point: /** @type {Vec3} */ ([r.origin.x + r.dir.x * toi, r.origin.y + r.dir.y * toi, r.origin.z + r.dir.z * toi]),
      normal: arr3(normal),
      distance: toi,
      collider: x?.i ?? -1,
    };
  }

  for (const [i, b] of o.bodies.entries()) crearCuerpo(b, `createPhysics.bodies[${i}]`);
  for (const [i, c] of o.characters.entries()) crearPersonaje(c, `createPhysics.characters[${i}]`);
  return fisica;
}
