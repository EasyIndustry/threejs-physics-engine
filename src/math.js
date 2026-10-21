// Las rotaciones como valores planos: cuaterniones [x, y, z, w] (lo que guarda una definición y lo
// que devuelve un cuerpo), el atajo en grados [rx, ry, rz] (ángulos de Euler en orden XYZ, el de
// three por defecto, como los grados de threejs-render-engine), y la ida y vuelta con los radianes
// del `transform` de threejs-game-engine. Más lo que hace falta para interpolar entre dos pasos.
//
// Cuál es cuál, sin ambigüedad: cuatro números son un cuaternión; tres, grados.
//
// Puro: no importa three, Rapier ni el DOM.
import { finito } from './valid.js';

/** @typedef {import('./valid.js').Vec3} Vec3 */
/** @typedef {import('./valid.js').Quat} Quat */

const GRADO = Math.PI / 180;

/** El cuaternión de unos ángulos de Euler en radianes, orden XYZ (como THREE.Quaternion.setFromEuler). @param {Vec3} e @returns {Quat} */
export function quatFromEuler([x, y, z]) {
  const c1 = Math.cos(x / 2), c2 = Math.cos(y / 2), c3 = Math.cos(z / 2);
  const s1 = Math.sin(x / 2), s2 = Math.sin(y / 2), s3 = Math.sin(z / 2);
  return [
    s1 * c2 * c3 + c1 * s2 * s3,
    c1 * s2 * c3 - s1 * c2 * s3,
    c1 * c2 * s3 + s1 * s2 * c3,
    c1 * c2 * c3 - s1 * s2 * s3,
  ];
}

/** El cuaternión de unos ángulos en grados, orden XYZ. @param {Vec3} g @returns {Quat} */
export const quatFromDegrees = (g) => quatFromEuler([g[0] * GRADO, g[1] * GRADO, g[2] * GRADO]);

/**
 * Los ángulos de Euler en radianes, orden XYZ, de un cuaternión (como THREE.Euler.setFromQuaternion):
 * lo que va en `transform.rotation` de threejs-game-engine.
 * @param {Quat} q @returns {Vec3}
 */
export function eulerFromQuat(q) {
  const [x, y, z, w] = normalizeQuat(q);
  const m11 = 1 - 2 * (y * y + z * z), m12 = 2 * (x * y - z * w), m13 = 2 * (x * z + y * w);
  const m22 = 1 - 2 * (x * x + z * z), m23 = 2 * (y * z - x * w);
  const m32 = 2 * (y * z + x * w), m33 = 1 - 2 * (x * x + y * y);
  const ry = Math.asin(Math.max(-1, Math.min(1, m13)));
  if (Math.abs(m13) < 0.9999999) return [Math.atan2(-m23, m33), ry, Math.atan2(-m12, m11)];
  return [Math.atan2(m32, m22), ry, 0];
}

/** Los ángulos en grados, orden XYZ. @param {Quat} q @returns {Vec3} */
export const degreesFromQuat = (q) => /** @type {Vec3} */ (eulerFromQuat(q).map((r) => r / GRADO));

/** La guiñada (giro alrededor de y) hacia donde mira el +z del cuerpo, en radianes: el `facing` de un sprite. @param {Quat} q */
export function yawFromQuat([x, y, z, w]) {
  return Math.atan2(2 * (x * z + w * y), 1 - 2 * (x * x + y * y));
}

/** El cuaternión de largo 1 (si ya lo es, el mismo valor: así lo normalizado vuelve igual). @param {Quat} q @returns {Quat} */
export function normalizeQuat(q) {
  const l = Math.hypot(q[0], q[1], q[2], q[3]);
  if (!(l > 1e-12)) throw new RangeError('rotation: el cuaternión tiene largo 0');
  if (Math.abs(l - 1) < 1e-12) return [q[0], q[1], q[2], q[3]];
  return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
}

/**
 * Una rotación validada: [x, y, z, w] (un cuaternión, se normaliza) o [rx, ry, rz] en grados.
 * @param {unknown} v @param {string} que @returns {Quat}
 */
export function rotation(v, que) {
  if (Array.isArray(v) && (v.length === 3 || v.length === 4) && v.every(finito)) {
    if (v.length === 3) return quatFromDegrees(/** @type {Vec3} */ (v));
    if (!(Math.hypot(v[0], v[1], v[2], v[3]) > 1e-12)) throw new RangeError(`${que}: el cuaternión [x, y, z, w] tiene largo 0`);
    return normalizeQuat(/** @type {Quat} */ (v));
  }
  if (Array.isArray(v) && (v.length === 3 || v.length === 4)) {
    const i = v.findIndex((x) => !finito(x));
    throw new TypeError(`${que}[${i}]: va un número (vino ${JSON.stringify(v[i])})`);
  }
  throw new TypeError(`${que}: va un cuaternión [x, y, z, w] o grados [rx, ry, rz] (vino ${JSON.stringify(v)})`);
}

/** a · b (primero b, después a). @param {Quat} a @param {Quat} b @returns {Quat} */
export function multiplyQuat(a, b) {
  const [ax, ay, az, aw] = a, [bx, by, bz, bw] = b;
  return [
    ax * bw + aw * bx + ay * bz - az * by,
    ay * bw + aw * by + az * bx - ax * bz,
    az * bw + aw * bz + ax * by - ay * bx,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

/** Gira el vector v con el cuaternión q. @param {Quat} q @param {Vec3} v @returns {Vec3} */
export function rotateVec([qx, qy, qz, qw], [vx, vy, vz]) {
  const tx = 2 * (qy * vz - qz * vy), ty = 2 * (qz * vx - qx * vz), tz = 2 * (qx * vy - qy * vx);
  return [vx + qw * tx + qy * tz - qz * ty, vy + qw * ty + qz * tx - qx * tz, vz + qw * tz + qx * ty - qy * tx];
}

/** De a a b, en línea recta. @param {Vec3} a @param {Vec3} b @param {number} t @returns {Vec3} */
export const lerpVec3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** De a a b por el camino más corto (slerp). @param {Quat} a @param {Quat} b @param {number} t @returns {Quat} */
export function slerpQuat(a, b, t) {
  let [bx, by, bz, bw] = b;
  let c = a[0] * bx + a[1] * by + a[2] * bz + a[3] * bw;
  if (c < 0) { c = -c; bx = -bx; by = -by; bz = -bz; bw = -bw; }
  if (c > 0.9995) {
    const q = /** @type {Quat} */ ([a[0] + (bx - a[0]) * t, a[1] + (by - a[1]) * t, a[2] + (bz - a[2]) * t, a[3] + (bw - a[3]) * t]);
    return normalizeQuat(q);
  }
  const th = Math.acos(c), s = Math.sin(th);
  const ka = Math.sin((1 - t) * th) / s, kb = Math.sin(t * th) / s;
  return [a[0] * ka + bx * kb, a[1] * ka + by * kb, a[2] * ka + bz * kb, a[3] * ka + bw * kb];
}
