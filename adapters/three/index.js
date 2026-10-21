// Lo de three: lo único del repo que importa three. No importa Rapier (habla con el mundo de física
// por su forma: `bodies`, `onStep`, `alpha`, y con cada cuerpo por `position`, `rotation`,
// `colliders`), ni threejs-render-engine, ni el juego, ni los sprites.
//
//   import { collidersFrom, createLinks, createDebugView } from 'threejs-physics-engine/three';
//
//   const caja = fisica.body({ position: [0, 3, 0], colliders: collidersFrom(malla) });   // de la geometría
//   const enlaces = createLinks(fisica);
//   enlaces.link(caja, malla);                              // la malla sigue al cuerpo
//   const depuracion = createDebugView(fisica);
//   motor.overlay.add(depuracion.object);                   // threejs-render-engine (o escena.add)
//   motor.onFrame((dt) => { fisica.advance(dt); enlaces.sync(); depuracion.update(); });
//
// - `collidersFrom(objeto, { shape })`: los colliders (definiciones, datos) a partir de la geometría
//   del objeto y de lo que cuelga de él, en el espacio del objeto y con su escala (el cuerpo va
//   donde está el objeto, sin escala). Sirve con una malla o con el `.object` de un sprite de
//   threejs-sprite-engine (para un sprite, mejor `shape: 'capsule'`: la caja de un plano es fina).
// - `createLinks(fisica)`: cada `sync(alpha)` copia posición y rotación de cada cuerpo a su objeto,
//   interpolando entre los dos últimos pasos (como el juego). Si el objeto tiene padre, pasa del
//   mundo al espacio del padre. Un sprite (algo con `facing`) recibe la guiñada en su facing y no
//   se gira (se orienta solo hacia la cámara).
// - `createDebugView(fisica)`: líneas con la forma de cada collider, armadas una vez por cuerpo a
//   partir de su definición (src/wire.js) y movidas en cada `update()`. Marcadas
//   `userData.noEdge`, `noAO` y `noRender`: threejs-render-engine las deja afuera de las aristas, de
//   la oclusión y del render final.
import * as THREE from 'three';
import { fitCollider, FIT_SHAPES } from '../../src/fit.js';
import { defineCollider } from '../../src/shapes.js';
import { colliderLines } from '../../src/wire.js';
import { lerpVec3, slerpQuat, yawFromQuat } from '../../src/math.js';
import { help } from '../../src/help.js';
import { LINKS_MEMBERS, DEBUG_VIEW_MEMBERS } from '../../src/members.js';

/** @typedef {[number, number, number]} Vec3 */
/** @typedef {[number, number, number, number]} Quat */

/** El Object3D de algo: el mismo, o su `.object` (un sprite, un emisor). @param {any} x @returns {THREE.Object3D | null} */
const objetoDe = (x) => (x?.isObject3D ? x : x?.object?.isObject3D ? x.object : null);
const plano = (/** @type {unknown} */ v) => !!v && typeof v === 'object' && !Array.isArray(v);

const _m = new THREE.Matrix4(), _inv = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();
const _v = new THREE.Vector3(), _uno = new THREE.Vector3(1, 1, 1);
const IDENTIDAD = new THREE.Matrix4();

/**
 * Los colliders de un objeto, a partir de su geometría (y la de lo que cuelga de él): en el espacio
 * del objeto, con su escala. 'auto' es una caja.
 * @param {any} object un THREE.Object3D o algo con .object (un sprite)
 * @param {{ shape?: 'auto' | 'box' | 'sphere' | 'capsule' | 'convex' | 'mesh', margin?: number, thickness?: number }} [opts]
 * @returns {import('../../src/shapes.js').ColliderDef[]}
 */
export function collidersFrom(object, opts = {}) {
  const obj = objetoDe(object);
  if (!obj) throw new TypeError('collidersFrom(object): va un THREE.Object3D o algo con .object (un sprite)');
  if (!plano(opts)) throw new TypeError("collidersFrom: las opciones van { shape?, margin?, thickness? }");
  for (const k of Object.keys(opts)) if (!['shape', 'margin', 'thickness'].includes(k)) throw new Error(`collidersFrom.${k}: clave desconocida (van shape, margin, thickness)`);
  const shape = opts.shape ?? 'auto';
  if (shape !== 'auto' && shape !== 'mesh' && !FIT_SHAPES.includes(/** @type {any} */ (shape))) throw new Error(`collidersFrom.shape: va 'auto', ${FIT_SHAPES.map((s) => `'${s}'`).join(', ')} o 'mesh' (vino ${JSON.stringify(shape)})`);

  obj.updateWorldMatrix(true, true);
  obj.matrixWorld.decompose(_p, _q, _s);
  // del mundo al espacio del objeto, y su escala
  _inv.copy(obj.matrixWorld).invert().premultiply(new THREE.Matrix4().makeScale(_s.x, _s.y, _s.z));
  /** @type {number[]} */ const puntos = [];
  /** @type {number[]} */ const indices = [];
  obj.traverse((o) => {
    const m = /** @type {THREE.Mesh} */ (o);
    if (!m.isMesh || !m.geometry?.attributes?.position) return;
    const pos = m.geometry.attributes.position;
    const base = puntos.length / 3;
    _m.multiplyMatrices(_inv, m.matrixWorld);
    for (let i = 0; i < pos.count; i++) {
      _v.fromBufferAttribute(pos, i).applyMatrix4(_m);
      puntos.push(_v.x, _v.y, _v.z);
    }
    if (shape === 'mesh') {
      const ix = m.geometry.index;
      if (ix) for (let i = 0; i < ix.count; i++) indices.push(base + ix.getX(i));
      else for (let i = 0; i < pos.count; i++) indices.push(base + i);
    }
  });
  if (!puntos.length) throw new Error('collidersFrom: el objeto no tiene mallas con geometría');
  if (shape === 'mesh') {
    if (opts.margin) throw new Error("collidersFrom.margin: no va con shape 'mesh' (los triángulos van tal cual)");
    return [defineCollider({ shape: 'mesh', vertices: puntos, indices })];
  }
  return [fitCollider(puntos, { shape: shape === 'auto' ? 'box' : shape, margin: opts.margin ?? 0, thickness: opts.thickness ?? 0.1 })];
}

/**
 * Los enlaces entre cuerpos y objetos de three.
 * @param {any} fisica el mundo de física (createPhysics)
 */
export function createLinks(fisica) {
  if (typeof fisica?.onStep !== 'function' || !('bodies' in fisica)) throw new TypeError('createLinks(fisica): va el mundo de createPhysics');
  /** @typedef {{ p: Vec3, q: Quat }} Pose */
  /** @typedef {{ body: any, from: any, object: THREE.Object3D, target: any, interpolate: boolean, rotation: boolean, prev: Pose, cur: Pose }} Enlace */
  /** Por cuerpo, su enlace. @type {Map<any, Enlace>} */
  const tabla = new Map();
  /** @param {any} b @returns {Pose} */
  const leer = (b) => ({ p: b.position, q: b.rotation });
  const sinPaso = fisica.onStep(() => {
    for (const [b, e] of tabla) {
      if (b.removed) continue;
      e.prev = e.cur;
      e.cur = leer(b);
    }
  });

  /** @param {Enlace} e @param {number} a */
  function aplicar(e, a) {
    const p = a >= 1 ? e.cur.p : lerpVec3(e.prev.p, e.cur.p, a);
    const q = a >= 1 ? e.cur.q : slerpQuat(e.prev.q, e.cur.q, a);
    const obj = e.object;
    const sprite = e.rotation && typeof e.target?.facing === 'number' && !e.target.isObject3D;
    const padre = obj.parent;
    if (padre) padre.updateWorldMatrix(true, false);
    if (padre && !padre.matrixWorld.equals(IDENTIDAD)) {
      // del mundo al espacio del padre
      _m.compose(_p.set(p[0], p[1], p[2]), _q.set(q[0], q[1], q[2], q[3]), _uno);
      _m.premultiply(_inv.copy(padre.matrixWorld).invert());
      _m.decompose(_p, _q, _s);
      obj.position.copy(_p);
      if (e.rotation && !sprite) obj.quaternion.copy(_q);
    } else {
      obj.position.set(p[0], p[1], p[2]);
      if (e.rotation && !sprite) obj.quaternion.set(q[0], q[1], q[2], q[3]);
    }
    if (sprite) e.target.facing = yawFromQuat(q);
  }

  const enlaces = {
    /**
     * Enlaza un cuerpo (o un personaje) con un objeto.
     * @param {any} body @param {any} object un Object3D o algo con .object (un sprite)
     * @param {{ interpolate?: boolean, rotation?: boolean }} [opts]
     */
    link(body, object, opts = {}) {
      const b = body?.isCharacter ? body.body : body;
      if (!b?.isBody) throw new TypeError('link(body, object): body va un cuerpo o un personaje del mundo de física');
      const obj = objetoDe(object);
      if (!obj) throw new TypeError('link(body, object): object va un THREE.Object3D o algo con .object (un sprite)');
      if (!plano(opts)) throw new TypeError('link: las opciones van { interpolate?, rotation? }');
      for (const k of Object.keys(opts)) if (!['interpolate', 'rotation'].includes(k)) throw new Error(`link.${k}: clave desconocida (van interpolate, rotation)`);
      const ahora = leer(b);
      /** @type {Enlace} */
      const e = { body: b, from: body, object: obj, target: object, interpolate: opts.interpolate ?? true, rotation: opts.rotation ?? !body.isCharacter, prev: ahora, cur: ahora };
      tabla.set(b, e);
      aplicar(e, 1);
      return { body, object: obj };
    },
    /** Saca el enlace de un cuerpo, personaje u objeto. Devuelve si estaba. @param {any} bodyOrObject */
    unlink(bodyOrObject) {
      const x = bodyOrObject?.isCharacter ? bodyOrObject.body : bodyOrObject;
      if (tabla.delete(x)) return true;
      const obj = objetoDe(x);
      for (const [b, e] of tabla) if (e.object === obj || e.target === x) { tabla.delete(b); return true; }
      return false;
    },
    /** Copia cada cuerpo a su objeto, interpolado. @param {number} [alpha] */
    sync(alpha = fisica.alpha ?? 1) {
      const a = Math.min(1, Math.max(0, Number.isFinite(alpha) ? alpha : 1));
      for (const [b, e] of [...tabla]) {
        if (b.removed) { tabla.delete(b); continue; }
        aplicar(e, e.interpolate ? a : 1);
      }
    },
    /** Que no interpole desde donde estaba (un teletransporte). @param {any} [body] */
    snap(body) {
      for (const [b, e] of tabla) {
        if (body !== undefined && b !== (body?.isCharacter ? body.body : body)) continue;
        e.prev = e.cur = leer(b);
      }
    },
    /** Los enlaces que hay. */
    get links() { return [...tabla.values()].map((e) => ({ body: e.from, object: e.object })); },
    /** Saca todos los enlaces. */
    dispose() { sinPaso(); tabla.clear(); },
    /** @param {{ print?: boolean }} [o] */
    help(o) { return help('Links — cuerpos de la física enlazados con objetos de three', LINKS_MEMBERS, o); },
  };
  return enlaces;
}

/** Los colores por defecto de la vista de depuración. */
export const DEBUG_COLORS = Object.freeze({ dynamic: '#3fd0ff', fixed: '#8a93a6', kinematic: '#ffb340', sensor: '#5dff7a', sleeping: '#3a5a78' });

/**
 * La vista de depuración: los colliders como líneas.
 * @param {any} fisica el mundo de física (createPhysics)
 * @param {{ colors?: Partial<Record<keyof typeof DEBUG_COLORS, string | number>>, segments?: number }} [opts]
 */
export function createDebugView(fisica, opts = {}) {
  if (!fisica || !('bodies' in fisica)) throw new TypeError('createDebugView(fisica): va el mundo de createPhysics');
  if (!plano(opts)) throw new TypeError('createDebugView: las opciones van { colors?, segments? }');
  for (const k of Object.keys(opts)) if (!['colors', 'segments'].includes(k)) throw new Error(`createDebugView.${k}: clave desconocida (van colors, segments)`);
  /** @type {Record<string, string | number>} */
  const colores = { ...DEBUG_COLORS };
  for (const [k, v] of Object.entries(opts.colors ?? {})) {
    if (!(k in DEBUG_COLORS)) throw new Error(`createDebugView.colors.${k}: clave desconocida (van ${Object.keys(DEBUG_COLORS).join(', ')})`);
    colores[k] = /** @type {string | number} */ (v);
  }
  const segments = opts.segments ?? 24;
  /** @type {Record<string, THREE.LineBasicMaterial>} */
  const materiales = {};
  for (const [k, c] of Object.entries(colores)) materiales[k] = new THREE.LineBasicMaterial({ color: c, toneMapped: false, fog: false });

  const grupo = new THREE.Group();
  grupo.name = 'física: depuración';
  /** @param {THREE.Object3D} o */
  const marcar = (o) => { o.userData.noEdge = true; o.userData.noAO = true; o.userData.noRender = true; };
  marcar(grupo);
  /** @type {Map<any, { grupo: THREE.Group, solidas: THREE.LineSegments | null }>} */
  const porCuerpo = new Map();

  /** @param {number[][]} partes */
  const unir = (partes) => {
    const n = partes.reduce((a, p) => a + p.length, 0);
    const out = new Float32Array(n);
    let i = 0;
    for (const p of partes) { out.set(p, i); i += p.length; }
    return out;
  };
  /** @param {any} b */
  function crear(b) {
    const g = new THREE.Group();
    g.name = b.name || 'cuerpo';
    marcar(g);
    /** @type {number[][]} */ const solidas = [];
    /** @type {number[][]} */ const sensores = [];
    for (const c of b.colliders) (c.sensor ? sensores : solidas).push([...colliderLines(c, { segments })]);
    /** @type {THREE.LineSegments | null} */
    let s = null;
    for (const [partes, mat] of /** @type {const} */ ([[solidas, 'fixed'], [sensores, 'sensor']])) {
      if (!partes.length) continue;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(unir(partes), 3));
      const l = new THREE.LineSegments(geo, materiales[mat]);
      l.frustumCulled = false;
      marcar(l);
      g.add(l);
      if (mat === 'fixed') s = l;
    }
    grupo.add(g);
    const x = { grupo: g, solidas: s };
    porCuerpo.set(b, x);
    return x;
  }
  /** @param {any} b */
  function soltar(b) {
    const x = porCuerpo.get(b);
    if (!x) return;
    x.grupo.removeFromParent();
    for (const l of x.grupo.children) /** @type {THREE.LineSegments} */ (l).geometry.dispose();
    porCuerpo.delete(b);
  }

  const vista = {
    object: grupo,
    /** Dibuja cada collider donde está ahora. */
    update() {
      const hay = new Set(fisica.bodies);
      for (const b of [...porCuerpo.keys()]) if (!hay.has(b)) soltar(b);
      if (!grupo.visible) return;
      for (const b of hay) {
        const x = porCuerpo.get(b) ?? crear(b);
        const p = b.position, q = b.rotation;
        x.grupo.position.set(p[0], p[1], p[2]);
        x.grupo.quaternion.set(q[0], q[1], q[2], q[3]);
        if (x.solidas) x.solidas.material = materiales[b.type !== 'fixed' && b.sleeping ? 'sleeping' : b.type];
      }
    },
    get visible() { return grupo.visible; },
    set visible(v) { grupo.visible = !!v; if (v) vista.update(); },
    get colors() { return { ...colores }; },
    /** Saca la vista de la escena y suelta lo suyo. */
    dispose() {
      for (const b of [...porCuerpo.keys()]) soltar(b);
      grupo.removeFromParent();
      for (const m of Object.values(materiales)) m.dispose();
    },
    /** @param {{ print?: boolean }} [o] */
    help(o) { return help('DebugView — los colliders como líneas', DEBUG_VIEW_MEMBERS, o); },
  };
  return vista;
}
