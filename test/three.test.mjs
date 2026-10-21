// El adaptador de three, con three de verdad en Node (necesita `npm install`): colliders a partir
// de objetos (una caja, una esfera escalada, algo como un sprite, un piso hecho con un plano),
// enlaces con interpolación y la vista de depuración. Y el sistema del juego con un mundo de
// entidades de mentira (con la forma del de threejs-game-engine).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { collidersFrom, createLinks, createDebugView, DEBUG_COLORS } from '../adapters/three/index.js';
import { createPhysics } from '../adapters/rapier/physics.js';
import { bodySystem, quatFromDegrees, eulerFromQuat, quatFromEuler } from '../src/index.js';

const cerca = (a, b, eps, que = '') => {
  if (Array.isArray(a)) { a.forEach((x, i) => cerca(x, b[i], eps, `${que}[${i}]`)); return; }
  assert.ok(Math.abs(a - b) <= eps, `${que}: ${a} ≉ ${b} (±${eps})`);
};

test('las rotaciones puras dan lo mismo que three (Euler XYZ ↔ cuaternión)', () => {
  for (const g of [[10, 20, 30], [-80, 45, 170], [0, 90, 0], [33, -12, 5]]) {
    const e = new THREE.Euler(...g.map(THREE.MathUtils.degToRad), 'XYZ');
    const q = new THREE.Quaternion().setFromEuler(e);
    cerca(quatFromDegrees(g), [q.x, q.y, q.z, q.w], 1e-12, `grados ${g}`);
    const e2 = new THREE.Euler().setFromQuaternion(q, 'XYZ');
    cerca(eulerFromQuat([q.x, q.y, q.z, q.w]), [e2.x, e2.y, e2.z], 1e-9, `euler ${g}`);
    cerca(quatFromEuler([e.x, e.y, e.z]), [q.x, q.y, q.z, q.w], 1e-12);
  }
});

test('collidersFrom: una caja, en el espacio del objeto y con su escala', () => {
  const malla = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 3));
  malla.scale.set(2, 1, 1);
  malla.position.set(5, 5, 5);
  malla.rotation.y = 1; // el giro y la posición son del cuerpo, no del collider
  const [c] = collidersFrom(malla);
  assert.equal(c.shape, 'box');
  cerca(c.size, [2, 2, 3], 1e-6);
  cerca(c.offset, [0, 0, 0], 1e-6);
  // con lo que cuelga: un hijo corrido
  const grupo = new THREE.Group();
  const hijo = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  hijo.position.set(0, 0.5, 0);
  grupo.add(hijo);
  grupo.scale.setScalar(3);
  const [g] = collidersFrom(grupo, { margin: 0.1 });
  cerca(g.size, [3.2, 3.2, 3.2], 1e-6);
  cerca(g.offset, [0, 1.5, 0], 1e-6);
  const [m] = collidersFrom(malla, { shape: 'mesh' });
  assert.equal(m.shape, 'mesh');
  assert.equal(m.indices.length, 36);
  assert.equal(m.vertices.length, 24 * 3);
  const [cv] = collidersFrom(malla, { shape: 'convex' });
  assert.equal(cv.shape, 'convex');
  assert.throws(() => collidersFrom(malla, { shape: 'pelota' }), /collidersFrom\.shape: va 'auto'/);
  assert.throws(() => collidersFrom(new THREE.Group()), /no tiene mallas/);
});

test('collidersFrom: una esfera escalada da el radio con su escala', () => {
  const pelota = new THREE.Mesh(new THREE.SphereGeometry(0.5, 32, 16));
  pelota.scale.setScalar(4);
  const [c] = collidersFrom(pelota, { shape: 'sphere' });
  cerca(c.radius, 2, 1e-6);
  cerca(c.offset, [0, 0, 0], 1e-6);
});

test('collidersFrom: algo como un sprite (un Group con un plano, con los pies en el origen) y un piso hecho con un plano', () => {
  // como el .object de threejs-sprite-engine: el Group es el pivote (los pies), la malla un plano
  const plano = new THREE.PlaneGeometry(1, 1.5);
  plano.translate(0, 0.75, 0);
  const object = new THREE.Group();
  object.add(new THREE.Mesh(plano));
  const sprite = { object, facing: 0 };
  const [cap] = collidersFrom(sprite, { shape: 'capsule' });
  assert.deepEqual([cap.shape, cap.radius, cap.height], ['capsule', 0.5, 1.5]);
  cerca(cap.offset, [0, 0.75, 0], 1e-6, 'centrado a media altura, los pies en el origen');
  // un piso: un plano acostado. La caja crece para abajo de la cara
  const piso = new THREE.Mesh(new THREE.PlaneGeometry(10, 10));
  piso.rotation.x = -Math.PI / 2;
  const [c] = collidersFrom(piso, { thickness: 0.5 });
  cerca(c.size, [10, 10, 0.5], 1e-6);
  cerca(c.offset, [0, 0, -0.25], 1e-6);
});

test('collidersFrom + física: una malla cae y se apoya con su caja', async () => {
  const fisica = await createPhysics();
  const piso = new THREE.Mesh(new THREE.PlaneGeometry(20, 20));
  piso.rotation.x = -Math.PI / 2;
  piso.updateMatrixWorld();
  fisica.body({ type: 'fixed', rotation: piso.quaternion.toArray(), colliders: collidersFrom(piso) });
  const malla = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  malla.scale.set(1, 2, 1);
  const caja = fisica.body({ position: [0, 3, 0], colliders: collidersFrom(malla) });
  for (let i = 0; i < 240; i++) fisica.step(1 / 60);
  cerca(caja.position[1], 1, 0.02, 'el piso está en y = 0 (la cara del plano) y la caja mide 2');
});

test('link y sync: el objeto sigue al cuerpo, interpolando entre los dos últimos pasos', async () => {
  const fisica = await createPhysics({ gravity: [0, 0, 0] });
  const b = fisica.body({ position: [0, 0, 0], linearVelocity: [6, 0, 0], angularVelocity: [0, Math.PI, 0], colliders: 'box' });
  const malla = new THREE.Mesh();
  const enlaces = createLinks(fisica);
  enlaces.link(b, malla);
  cerca(malla.position.toArray(), [0, 0, 0], 1e-9, 'al enlazar, donde está');
  fisica.step(0.1);
  fisica.step(0.1);
  enlaces.sync(1);
  cerca(malla.position.x, 1.2, 1e-4, 'el último paso');
  enlaces.sync(0.5);
  cerca(malla.position.x, 0.9, 1e-4, 'entre el anterior (0.6) y el último (1.2)');
  const q = new THREE.Quaternion().fromArray(b.rotation);
  enlaces.sync(1);
  cerca(malla.quaternion.toArray(), q.toArray(), 1e-9, 'y girado como el cuerpo');
  // con advance, el alpha es el de la física
  fisica.advance(1 / 60 * 1.5);
  enlaces.sync();
  const [prev, cur] = [1.2 + 6 / 60 - 6 / 60, 1.2 + 6 / 60];
  cerca(malla.position.x, prev + (cur - prev) * 0.5, 1e-3);
  // snap: no interpola desde donde estaba
  b.teleport([10, 0, 0]);
  fisica.step(1 / 60);
  enlaces.snap(b);
  enlaces.sync(0);
  cerca(malla.position.x, 10, 1e-6);
  // un padre corrido y girado: pasa del mundo a su espacio
  const padre = new THREE.Group();
  padre.position.set(0, 5, 0);
  padre.rotation.y = Math.PI / 2;
  padre.add(malla);
  enlaces.sync(1);
  malla.updateWorldMatrix(true, false);
  cerca(new THREE.Vector3().setFromMatrixPosition(malla.matrixWorld).toArray(), b.position, 1e-5);
  assert.equal(enlaces.links.length, 1);
  assert.equal(enlaces.unlink(malla), true);
  assert.equal(enlaces.links.length, 0);
  enlaces.dispose();
  assert.ok(enlaces.help({ print: false }).length >= 5);
});

test('link con un sprite: la guiñada va a su facing y el objeto no se gira; con un personaje, sin rotación', async () => {
  const fisica = await createPhysics({ gravity: [0, 0, 0] });
  const b = fisica.body({ rotation: [0, 90, 0], colliders: 'box' });
  const sprite = { object: new THREE.Group(), facing: 0 };
  const enlaces = createLinks(fisica);
  enlaces.link(b, sprite);
  cerca(sprite.facing, Math.PI / 2, 1e-6);
  cerca(sprite.object.quaternion.toArray(), [0, 0, 0, 1], 1e-12);
  const p = fisica.character({ position: [2, 0, 0] });
  const capsula = new THREE.Mesh();
  capsula.rotation.y = 1; // lo gira la app (hacia donde camina)
  enlaces.link(p, capsula);
  for (let i = 0; i < 10; i++) { p.move([0.1, 0, 0]); fisica.step(1 / 60); }
  enlaces.sync(1);
  cerca(capsula.position.toArray(), p.position, 1e-6, 'los pies del personaje');
  cerca(capsula.rotation.y, 1, 1e-9, 'la rotación sigue siendo de la app');
  assert.throws(() => enlaces.link({}, capsula), /body va un cuerpo o un personaje/);
});

test('la vista de depuración arma líneas por cuerpo, las mueve y cambia de color dormido o sensor', async () => {
  const fisica = await createPhysics();
  fisica.body({ type: 'fixed', name: 'piso', position: [0, -0.5, 0], colliders: { shape: 'box', size: [10, 1, 10] } });
  const caja = fisica.body({ name: 'caja', position: [0, 2, 0], colliders: ['box', { shape: 'sphere', radius: 2, sensor: true }] });
  fisica.character({ position: [3, 0, 0] });
  const vista = createDebugView(fisica, { colors: { dynamic: '#ff0000' } });
  const escena = new THREE.Scene();
  escena.add(vista.object);
  assert.ok(vista.object.userData.noEdge && vista.object.userData.noAO && vista.object.userData.noRender);
  vista.update();
  assert.equal(vista.object.children.length, 3);
  const g = vista.object.children.find((x) => x.name === 'caja');
  assert.equal(g.children.length, 2, 'lo sólido y el sensor, aparte');
  const [solidas, sensor] = g.children;
  assert.ok(solidas.isLineSegments && solidas.geometry.attributes.position.count === 24);
  assert.equal(solidas.material.color.getHexString(), 'ff0000');
  assert.equal('#' + sensor.material.color.getHexString(), DEBUG_COLORS.sensor);
  assert.ok(g.children.every((l) => l.userData.noRender));
  for (let i = 0; i < 300; i++) fisica.step(1 / 60);
  vista.update();
  cerca(g.position.y, caja.position[1], 1e-9);
  assert.ok(caja.sleeping);
  assert.equal('#' + solidas.material.color.getHexString(), DEBUG_COLORS.sleeping);
  caja.remove();
  vista.update();
  assert.equal(vista.object.children.length, 2, 'lo sacado se va');
  vista.visible = false;
  assert.equal(vista.object.visible, false);
  vista.dispose();
  assert.equal(escena.children.length, 0);
  assert.throws(() => createDebugView(fisica, { colors: { rojo: 1 } }), /createDebugView\.colors\.rojo: clave desconocida/);
});

/** Un mundo de entidades de mentira, con la forma del de threejs-game-engine. */
function mundoDeJuego() {
  const entidades = new Set(), sistemas = [], altas = new Set(), bajas = new Set();
  let id = 1;
  return {
    add(e) { e.id = id++; entidades.add(e); for (const f of altas) f(e); return e; },
    remove(e) { if (!entidades.delete(e)) return false; for (const f of bajas) f(e); return true; },
    query(...cs) { return [...entidades].filter((e) => cs.every((c) => c in e)); },
    set(e, c, v) { e[c] = v; return e; },
    system(name, fn, { order = 0, phase = 'fixed' } = {}) { const s = { name, fn, order, phase }; sistemas.push(s); sistemas.sort((a, b) => a.order - b.order); return () => sistemas.splice(sistemas.indexOf(s), 1); },
    onAdd(fn) { altas.add(fn); return () => altas.delete(fn); },
    onRemove(fn) { bajas.add(fn); return () => bajas.delete(fn); },
    fixed(dt) { for (const s of [...sistemas]) if (s.phase === 'fixed') s.fn(dt, this); },
    get systems() { return sistemas.map((s) => s.name); },
  };
}

test('bodySystem: entidades con body y character, en el paso fijo del juego, sin importar el juego', async () => {
  const fisica = await createPhysics();
  const world = mundoDeJuego();
  world.add({ name: 'piso', transform: { position: [0, -0.5, 0] }, body: { type: 'fixed', colliders: { shape: 'box', size: [40, 1, 40] } } });
  const sistema = bodySystem(world, fisica);
  assert.deepEqual(world.systems, ['physics']);
  const caja = world.add({ transform: { position: [0, 4, 0], rotation: [0, Math.PI / 4, 0] }, body: { colliders: 'box' } });
  const heroe = world.add({ character: { radius: 0.3, height: 1.6, position: [3, 0, 0] } });
  const plataforma = world.add({ transform: { position: [-3, 0.25, 0] }, body: { type: 'kinematic', colliders: { shape: 'box', size: [2, 0.5, 2] } } });
  assert.equal(sistema.size, 4);
  const b = sistema.of(caja);
  cerca(b.position, [0, 4, 0], 1e-9, 'nace donde dice su transform');
  cerca(b.rotation, quatFromDegrees([0, 45, 0]), 1e-6, 'Rapier guarda en float32');
  cerca(heroe.transform.position, [3, 0, 0], 1e-9, 'sin transform, le pone uno');
  assert.equal(sistema.entityOf(b), caja);
  assert.equal(sistema.entityOf(sistema.of(heroe).body), heroe);
  // la app mueve (en su sistema, antes que la física) y la física pone el transform
  world.system('mover', () => { sistema.of(heroe).move([0.05, -0.05, 0]); plataforma.transform.position[0] += 0.01; }, { order: 0 });
  const posicion = caja.transform.position;
  for (let i = 0; i < 180; i++) world.fixed(1 / 60);
  cerca(caja.transform.position[1], 0.5, 0.02, 'la caja se apoyó: su transform también');
  assert.equal(caja.transform.position, posicion, 'el mismo array, cambiado en el lugar');
  cerca(caja.transform.rotation, [0, Math.PI / 4, 0], 1e-3, 'la rotación en radianes, como el juego');
  cerca(heroe.transform.position[0], 3 + 0.05 * 180, 0.05);
  cerca(sistema.of(plataforma).position[0], -3 + 0.01 * 180, 1e-4, 'el kinematic va a donde dice su transform');
  // al sacar la entidad, se va su cuerpo
  world.remove(caja);
  assert.equal(b.removed, true);
  assert.equal(sistema.size, 3);
  // un cuerpo hecho por la app es de la app
  const propio = fisica.body({ position: [5, 5, 5], colliders: 'sphere' });
  const e = world.add({ transform: { position: [5, 5, 5] }, body: propio });
  world.remove(e);
  assert.equal(propio.removed, false);
  sistema.dispose();
  assert.deepEqual(world.systems, ['mover']);
  assert.equal(fisica.characters.length, 0, 'dispose saca lo que creó');
  assert.throws(() => bodySystem({}, fisica), /bodySystem\(world\): world va el mundo de entidades/);
  assert.ok(sistema.help({ print: false }).length >= 4);
});
