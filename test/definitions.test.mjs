// Lo puro, sin Rapier ni three: las definiciones como datos (atajos, errores que dicen dónde, JSON
// de ida y vuelta, hash), los grupos, los materiales, las medidas a partir de puntos, la
// envolvente convexa, las líneas de depuración, el reloj de paso fijo y los avisos.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  defineBody, hashBody, colliderMasses, BODY_DEFAULTS, defineCollider, shapeVolume, defineCharacter, characterCollider,
  defineGroups, groupBits, interactionGroups, canCollide, defineMaterials, resolveSurface, definePhysics,
  quatFromDegrees, eulerFromQuat, quatFromEuler, degreesFromQuat, yawFromQuat, rotateVec, slerpQuat,
  fitCollider, colliderFromBox, colliderFromSphere, boxFromPoints, colliderLines, convexHull, meshVolume, edgesOf, createClock, createListeners, matcher,
} from '../src/index.js';

const cerca = (a, b, eps = 1e-9, que = '') => {
  if (Array.isArray(a)) { assert.equal(a.length, b.length, que); a.forEach((x, i) => cerca(x, b[i], eps, `${que}[${i}]`)); return; }
  assert.ok(Math.abs(a - b) <= eps, `${que}: ${a} ≉ ${b}`);
};
const mal = (fn, re) => assert.throws(fn, re);

test('defineBody: sin nada, los valores por defecto, con la forma completa', () => {
  const d = defineBody({ colliders: 'box' });
  assert.deepEqual(Object.keys(d).sort(), Object.keys(BODY_DEFAULTS).sort());
  assert.equal(d.type, 'dynamic');
  assert.deepEqual(d.position, [0, 0, 0]);
  assert.deepEqual(d.rotation, [0, 0, 0, 1]);
  assert.deepEqual(d.lockRotation, [false, false, false]);
  assert.equal(d.colliders.length, 1);
  assert.deepEqual(d.colliders[0].size, [1, 1, 1]);
  assert.equal(d.colliders[0].friction, null, 'sin decir: lo del material o lo de Rapier');
  assert.deepEqual(defineBody({ type: 'fixed' }).colliders, [], 'un fixed sin colliders vale');
});

test('defineBody: los atajos dan siempre la misma forma', () => {
  const d = defineBody({
    rotation: [0, 90, 0], lockRotation: true, lockPosition: [false, false, true],
    colliders: { shape: 'box', size: 2, group: 'jugador', collidesWith: 'pared' },
  });
  cerca(d.rotation, [0, Math.SQRT1_2, 0, Math.SQRT1_2], 1e-12);
  assert.deepEqual(d.lockRotation, [true, true, true]);
  assert.deepEqual(d.lockPosition, [false, false, true]);
  assert.deepEqual(d.colliders[0].size, [2, 2, 2]);
  assert.deepEqual(d.colliders[0].group, ['jugador']);
  assert.deepEqual(d.colliders[0].collidesWith, ['pared']);
  // un cuaternión se normaliza
  cerca(defineBody({ rotation: [0, 0, 0, 2], colliders: 'sphere' }).rotation, [0, 0, 0, 1]);
  // los puntos, de a tres o planos
  const tet = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]];
  assert.deepEqual(defineCollider({ shape: 'convex', points: tet }).points, tet.flat());
  assert.deepEqual(defineCollider({ shape: 'convex', points: tet.flat() }).points, tet.flat());
  const m = defineCollider({ shape: 'mesh', vertices: [[0, 0, 0], [1, 0, 0], [0, 0, 1]], indices: [[0, 2, 1]] });
  assert.deepEqual(m.indices, [0, 2, 1]);
});

test('defineBody: lo normalizado se guarda en JSON y vuelve igual; el hash no depende de cómo se escribió', () => {
  const defs = [
    { type: 'fixed', colliders: [{ shape: 'mesh', vertices: [0, 0, 0, 1, 0, 0, 0, 0, 1], indices: [0, 2, 1] }, { shape: 'heightfield', heights: [[0, 1], [2, 3]], size: [4, 1, 4] }] },
    { position: [1, 2, 3], rotation: [10, 20, 30], userData: { puntos: 3, tags: ['a'] }, colliders: [{ shape: 'capsule', radius: 0.3, height: 1.8, sensor: true }, { shape: 'cone', material: 'goma' }, 'sphere'] },
    { type: 'kinematic', mass: 3, colliders: [{ shape: 'cylinder', offset: [0, 1, 0], rotation: [0, 0, 0.3826834323650898, 0.9238795325112867] }] },
  ];
  for (const def of defs) {
    const d = defineBody(def);
    assert.deepEqual(defineBody(JSON.parse(JSON.stringify(d))), d);
    assert.equal(hashBody(d), hashBody(def));
  }
  assert.equal(hashBody({ colliders: { shape: 'box', size: 1 } }), hashBody({ colliders: [{ size: [1, 1, 1], shape: 'box' }] }));
  assert.notEqual(hashBody({ colliders: 'box' }), hashBody({ colliders: 'sphere' }));
});

test('defineBody: un error dice dónde está', () => {
  mal(() => defineBody({ colour: 1 }), /body\.colour: clave desconocida/);
  mal(() => defineBody({ type: 'estatico' }), /body\.type: va 'dynamic', 'fixed', 'kinematic'/);
  mal(() => defineBody({ position: [0, 'x', 0], colliders: 'box' }), /body\.position\[1\]: va un número/);
  mal(() => defineBody({ colliders: ['sphere', { shape: 'box', size: [1, 1, -1] }] }), /body\.colliders\[1\]\.size\[2\]: va un número > 0 \(vino -1\)/);
  mal(() => defineBody({ colliders: { shape: 'box', radius: 1 } }), /body\.colliders\[0\]\.radius: no va con shape 'box' \(van size; radius es de sphere, capsule, cylinder, cone\)/);
  mal(() => defineBody({ colliders: { shape: 'box', radio: 1 } }), /body\.colliders\[0\]\.radio: clave desconocida/);
  mal(() => defineBody({ colliders: { shape: 'pelota' } }), /body\.colliders\[0\]\.shape: va 'box', 'sphere'/);
  mal(() => defineBody({ colliders: { shape: 'capsule', radius: 1, height: 1 } }), /body\.colliders\[0\]\.height: es la altura total, con las tapas/);
  mal(() => defineBody({ colliders: { shape: 'convex', points: [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0]] } }), /body\.colliders\[0\]\.points: no tienen volumen/);
  mal(() => defineBody({ colliders: { shape: 'convex' } }), /body\.colliders\[0\]\.points: falta/);
  mal(() => defineBody({ colliders: { shape: 'mesh', vertices: [0, 0, 0, 1, 0, 0, 0, 0, 1], indices: [0, 1, 2] } }), /body\.colliders\[0\]\.shape: 'mesh' va solo en un cuerpo fixed/);
  mal(() => defineBody({ type: 'fixed', colliders: { shape: 'mesh', vertices: [0, 0, 0, 1, 0, 0, 0, 0, 1], indices: [0, 1, 3] } }), /body\.colliders\[0\]\.indices\[2\]: va de 0 a 2 \(vino 3\)/);
  mal(() => defineBody({ type: 'fixed', colliders: { shape: 'heightfield', heights: [[0, 1], [2]] } }), /body\.colliders\[0\]\.heights\[1\]: va una fila de al menos 2/);
  mal(() => defineBody({ colliders: { shape: 'sphere', density: 1, mass: 2 } }), /body\.colliders\[0\]: va density o mass, no las dos/);
  mal(() => defineBody({ mass: 2, colliders: { shape: 'sphere', density: 1 } }), /body\.colliders\[0\]: con mass en el cuerpo/);
  mal(() => defineBody({}), /body: un cuerpo dynamic sin colliders sólidos no tiene masa/);
  mal(() => defineBody({ rotation: [0, 0, 0, 0], colliders: 'box' }), /body\.rotation: el cuaternión \[x, y, z, w\] tiene largo 0/);
  mal(() => defineBody({ rotation: [1, 2], colliders: 'box' }), /body\.rotation: va un cuaternión \[x, y, z, w\] o grados/);
  mal(() => defineBody({ lockRotation: 'y', colliders: 'box' }), /body\.lockRotation: va true, false o \[x, y, z\]/);
  mal(() => defineBody({ userData: { f: () => 1 }, colliders: 'box' }), /body\.userData: van datos/);
  mal(() => defineBody({ colliders: { shape: 'box', friction: -1 } }), /body\.colliders\[0\]\.friction: va ≥ 0/);
  mal(() => defineBody({ colliders: { shape: 'box', frictionCombine: 'suma' } }), /body\.colliders\[0\]\.frictionCombine: va 'average', 'min', 'max', 'multiply'/);
  // con los grupos y materiales del mundo
  const ctx = { groups: ['jugador', 'pared'], materials: { hielo: {} } };
  mal(() => defineBody({ colliders: { shape: 'box', group: 'enemigo' } }, ctx), /body\.colliders\[0\]\.group: grupo desconocido enemigo \(van jugador, pared\)/);
  mal(() => defineBody({ colliders: { shape: 'box', material: 'lava' } }, ctx), /body\.colliders\[0\]\.material: material desconocido lava \(van hielo\)/);
  assert.doesNotThrow(() => defineBody({ colliders: { shape: 'box', group: 'pared', material: 'hielo' } }, ctx));
});

test('la masa del cuerpo se reparte entre los colliders según su volumen', () => {
  const d = defineBody({ mass: 10, colliders: [{ shape: 'box', size: [1, 1, 1] }, { shape: 'box', size: [1, 1, 3] }, { shape: 'sphere', sensor: true }] });
  cerca(colliderMasses(d), [2.5, 7.5, 0]);
  assert.deepEqual(colliderMasses(defineBody({ colliders: 'box' })), [null]);
  cerca(shapeVolume(defineCollider({ shape: 'capsule', radius: 1, height: 4 })), Math.PI * 2 + (4 / 3) * Math.PI);
  cerca(shapeVolume(defineCollider({ shape: 'convex', points: [[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]] })), 1 / 6);
  cerca(shapeVolume(defineCollider({ shape: 'cone', radius: 1, height: 3 })), Math.PI);
});

test('los grupos con nombre arman las máscaras de bits de Rapier', () => {
  const g = defineGroups(['jugador', 'pared', 'enemigo', 'agua']);
  assert.equal(groupBits(g, ['pared', 'agua']), 0b1010);
  assert.equal(groupBits(g, null), 0xffff, 'sin decir: todos');
  assert.equal(groupBits(g, []), 0, 'ninguno');
  const jugador = interactionGroups(g, ['jugador'], ['pared', 'enemigo']);
  assert.equal(jugador, ((0b0001 << 16) | 0b0110) >>> 0);
  const pared = interactionGroups(g, ['pared'], null);
  const enemigo = interactionGroups(g, ['enemigo'], ['pared']);
  const agua = interactionGroups(g, ['agua'], null);
  const fantasma = interactionGroups(g, null, []);
  assert.ok(canCollide(jugador, pared));
  assert.ok(!canCollide(jugador, enemigo), 'el enemigo no choca con el jugador (solo con paredes)');
  assert.ok(!canCollide(jugador, agua), 'el jugador no choca con el agua');
  assert.ok(canCollide(enemigo, pared));
  assert.ok(!canCollide(fantasma, pared));
  assert.ok(canCollide(interactionGroups(g, null, null), interactionGroups(g, null, null)));
  mal(() => defineGroups(Array.from({ length: 17 }, (_, i) => `g${i}`)), /groups: van a lo sumo 16 grupos/);
  mal(() => defineGroups(['a', 'a']), /groups\[1\]: a está repetido/);
  mal(() => groupBits(g, ['lava'], 'x.group'), /x\.group: grupo desconocido lava/);
});

test('los materiales con nombre: el collider pisa lo del material, y lo que falta es de Rapier', () => {
  const m = defineMaterials({ hielo: { friction: 0.02, frictionCombine: 'min' }, goma: { restitution: 0.9, restitutionCombine: 'max', density: 0.5 } });
  const hielo = defineCollider({ material: 'hielo' });
  assert.deepEqual(resolveSurface(hielo, m), { friction: 0.02, restitution: 0, density: 1, frictionCombine: 'min', restitutionCombine: 'average' });
  assert.deepEqual(resolveSurface(defineCollider({ material: 'goma', restitution: 0.5 }), m), { friction: 0.5, restitution: 0.5, density: 0.5, frictionCombine: 'average', restitutionCombine: 'max' });
  assert.deepEqual(resolveSurface(defineCollider({}), m), { friction: 0.5, restitution: 0, density: 1, frictionCombine: 'average', restitutionCombine: 'average' });
  mal(() => defineMaterials({ hielo: { friccion: 0 } }), /materials\.hielo\.friccion: clave desconocida/);
  mal(() => resolveSurface(defineCollider({ material: 'lava' }), m), /material desconocido lava/);
});

test('definePhysics: las opciones del mundo, con sus cuerpos validados contra sus grupos', () => {
  const o = definePhysics({ groups: ['a'], bodies: [{ type: 'fixed', colliders: { shape: 'box', group: 'a' } }] });
  assert.deepEqual(o.gravity, [0, -9.81, 0]);
  assert.equal(o.timestep, 1 / 60);
  assert.equal(o.bodies.length, 1);
  assert.deepEqual(definePhysics(JSON.parse(JSON.stringify(o))), o);
  mal(() => definePhysics({ gravedad: 1 }), /createPhysics\.gravedad: clave desconocida/);
  mal(() => definePhysics({ bodies: [{ colliders: { shape: 'box', group: 'b' } }] }), /createPhysics\.bodies\[0\]\.colliders\[0\]\.group: grupo desconocido b/);
  mal(() => definePhysics({ timestep: 0 }), /createPhysics\.timestep: va un número > 0/);
});

test('defineCharacter: una cápsula de 1.8 m con los pies en position, y sus errores', () => {
  const c = defineCharacter({});
  assert.equal(c.shape, 'capsule');
  assert.equal(c.radius, 0.3);
  assert.equal(c.height, 1.8);
  assert.equal(c.origin, 'feet');
  assert.deepEqual(defineCharacter(JSON.parse(JSON.stringify(c))), c);
  // con los pies en el origen, la cápsula sube media altura más la piel
  cerca(characterCollider(c).offset, [0, 0.9 + c.offset, 0]);
  assert.deepEqual(characterCollider(defineCharacter({ origin: 'center' })).offset, [0, 0, 0]);
  assert.deepEqual(defineCharacter({ shape: 'box' }).size, [0.6, 1.8, 0.6]);
  mal(() => defineCharacter({ shape: 'box', radius: 1 }), /character\.radius: no va con shape 'box' \(van size\)/);
  mal(() => defineCharacter({ shape: 'cone' }), /character\.shape: va 'capsule', 'sphere', 'box', 'cylinder'/);
  mal(() => defineCharacter({ radius: 0.5, height: 0.8 }), /character\.height: es la altura total/);
  mal(() => defineCharacter({ slope: 120 }), /character\.slope: va de 0 a 90/);
  mal(() => defineCharacter({ salto: 1 }), /character\.salto: clave desconocida/);
  mal(() => defineCharacter({ group: 'x' }, { groups: ['jugador'] }), /character\.group: grupo desconocido x/);
});

test('las rotaciones: grados ↔ cuaternión ↔ los radianes del transform del juego', () => {
  for (const g of [[0, 0, 0], [30, 0, 0], [0, 45, 0], [0, 0, -60], [10, 20, 30], [-80, 45, 170]]) {
    cerca(degreesFromQuat(quatFromDegrees(g)), g, 1e-9, `grados ${g}`);
    const rad = g.map((x) => (x * Math.PI) / 180);
    cerca(eulerFromQuat(quatFromEuler(rad)), rad, 1e-9, `radianes ${g}`);
  }
  // girar [0, 0, 1] 90° en y da [1, 0, 0]: la guiñada de un sprite
  cerca(rotateVec(quatFromDegrees([0, 90, 0]), [0, 0, 1]), [1, 0, 0], 1e-12);
  cerca(yawFromQuat(quatFromDegrees([0, 90, 0])), Math.PI / 2, 1e-12);
  cerca(slerpQuat([0, 0, 0, 1], quatFromDegrees([0, 90, 0]), 0.5), quatFromDegrees([0, 45, 0]), 1e-12);
});

test('fitCollider: las medidas de un collider a partir de los puntos de un objeto', () => {
  // una caja de 2 × 1 × 4 corrida a [1, 0.5, 0]
  const pts = [0, 0, -2, 2, 1, 2, 0, 1, 2, 2, 0, -2];
  assert.deepEqual(boxFromPoints(pts), { min: [0, 0, -2], max: [2, 1, 2] });
  const caja = fitCollider(pts, { shape: 'box' });
  assert.deepEqual([caja.shape, caja.size, caja.offset], ['box', [2, 1, 4], [1, 0.5, 0]]);
  const conMargen = fitCollider(pts, { shape: 'box', margin: 0.1 });
  cerca(conMargen.size, [2.2, 1.2, 4.2]);
  const esfera = fitCollider(pts, { shape: 'sphere' });
  cerca(esfera.radius, Math.hypot(1, 0.5, 2));
  // la cápsula va a lo largo del lado más largo (z): girada 90° en x
  const capsula = fitCollider(pts, { shape: 'capsule' });
  assert.equal(capsula.height, 4);
  assert.equal(capsula.radius, 1);
  cerca(rotateVec(capsula.rotation, [0, 1, 0]), [0, 0, 1], 1e-12);
  // un plano (un piso, un sprite): el lado de 0 toma el grosor, para atrás de la cara (−z)
  const plano = fitCollider([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], { shape: 'box', thickness: 0.2 });
  cerca(plano.size, [2, 2, 0.2]);
  cerca(plano.offset, [0, 0, -0.1]);
  // un sprite de 1 × 1.5 como cápsula: el radio es la mitad del ancho
  const sprite = fitCollider([-0.5, 0, 0, 0.5, 0, 0, 0.5, 1.5, 0, -0.5, 1.5, 0], { shape: 'capsule' });
  assert.deepEqual([sprite.radius, sprite.height], [0.5, 1.5]);
  cerca(sprite.offset, [0, 0.75, 0], 1e-12, 'centrado: los pies en el origen');
  mal(() => fitCollider(pts, { shape: 'box', margin: -2 }), /collidersFrom\.margin: con -2 el lado queda en -2/);
  // a partir de una caja { min, max } (THREE.Box3) o de una esfera envolvente (THREE.Sphere)
  const deCaja = colliderFromBox({ min: [-1, 0, -1], max: [1, 4, 1] });
  assert.deepEqual([deCaja.size, deCaja.offset], [[2, 4, 2], [0, 2, 0]]);
  const capsulaDeCaja = colliderFromBox({ min: [-1, 0, -1], max: [1, 4, 1] }, { shape: 'capsule' });
  assert.deepEqual([capsulaDeCaja.radius, capsulaDeCaja.height], [1, 4]);
  const deEsfera = colliderFromSphere({ center: [0, 1, 0], radius: 2 }, { margin: 0.5 });
  assert.deepEqual([deEsfera.shape, deEsfera.radius, deEsfera.offset], ['sphere', 2.5, [0, 1, 0]]);
  mal(() => colliderFromBox({ min: 1 }), /colliderFromBox: va \{ min/);
});

test('la envolvente convexa: caras hacia afuera, su volumen y sus aristas', () => {
  const cubo = [];
  for (const x of [0, 1]) for (const y of [0, 1]) for (const z of [0, 1]) cubo.push(x, y, z);
  cubo.push(0.5, 0.5, 0.5); // uno de adentro no cambia nada
  const caras = convexHull(cubo);
  assert.equal(caras.length, 12);
  cerca(meshVolume(cubo, caras), 1, 1e-12);
  assert.equal(edgesOf(caras).length, 18, 'las 12 aristas del cubo y una diagonal por cara');
  assert.equal(convexHull([0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0]), null, 'en un plano no hay volumen');
});

test('las líneas de depuración de cada forma, con el offset y la rotación del collider', () => {
  const caja = colliderLines(defineCollider({ shape: 'box', size: [2, 2, 2], offset: [10, 0, 0] }));
  assert.equal(caja.length, 12 * 2 * 3, '12 aristas');
  for (let i = 0; i < caja.length; i += 3) assert.ok(caja[i] === 9 || caja[i] === 11);
  for (const shape of ['sphere', 'capsule', 'cylinder', 'cone']) {
    const l = colliderLines(defineCollider({ shape }), { segments: 16 });
    assert.ok(l.length > 0 && l.length % 6 === 0, shape);
    const r = Math.max(...Array.from({ length: l.length / 3 }, (_, i) => Math.hypot(l[i * 3], l[i * 3 + 2])));
    cerca(r, 0.5, 1e-6, shape);
  }
  const hf = colliderLines(defineCollider({ shape: 'heightfield', heights: [[0, 0, 0], [1, 1, 1]], size: [2, 3, 4] }));
  assert.equal(hf.length / 6, 2 * 2 + 3 * 1, 'las líneas de la grilla');
  assert.equal(Math.max(...hf.filter((_, i) => i % 3 === 1)), 3);
});

test('el reloj de paso fijo: los pasos que entran, el alpha que sobra y sin espiral de la muerte', () => {
  const r = createClock({ step: 0.1, maxSteps: 3 });
  const pasos = [];
  assert.equal(r.advance(0.25, (h) => pasos.push(h)), 2);
  cerca(r.alpha, 0.5, 1e-9);
  assert.equal(r.advance(0.05, (h) => pasos.push(h)), 1);
  cerca(r.alpha, 0, 1e-9);
  assert.equal(r.advance(10, (h) => pasos.push(h)), 3, 'un cuadro larguísimo: a lo sumo maxSteps');
  assert.ok(r.dropped >= 90);
  assert.ok(pasos.every((h) => h === 0.1));
  // 30 o 144 cuadros por segundo dan los mismos pasos en un segundo
  for (const fps of [30, 60, 144]) {
    const c = createClock({ step: 1 / 60 });
    let n = 0;
    for (let i = 0; i < fps; i++) n += c.advance(1 / fps, () => {});
    assert.ok(Math.abs(n - 60) <= 1, `${fps} fps: ${n} pasos`);
  }
});

test('los avisos: cada lado se elige por cuerpo, nombre, función o lista, y el orden sigue a lo pedido', () => {
  const a = { isBody: true, name: 'zona' }, b = { isBody: true, name: 'heroe' }, c = { isBody: true, name: 'caja' };
  const personaje = { isCharacter: true, body: b };
  const l = createListeners();
  const vistos = [];
  l.on('enter', (x, y) => vistos.push(['todos', x.name, y.name]));
  const off = l.on('enter', 'heroe', (x, y, i) => vistos.push(['heroe', x.name, y.name, i.n]));
  l.on('enter', personaje, a, (x, y) => vistos.push(['personaje', x.name, y.name]));
  l.on('enter', [c, (x) => x.name === 'nadie'], (x) => vistos.push(['lista', x.name]));
  l.on('exit', (x) => vistos.push(['exit', x.name]));
  l.emit('enter', a, b, { n: 1 }, (i) => ({ n: -i.n }));
  assert.deepEqual(vistos, [['todos', 'zona', 'heroe'], ['heroe', 'heroe', 'zona', -1], ['personaje', 'heroe', 'zona']]);
  off();
  vistos.length = 0;
  l.emit('enter', c, a, {});
  assert.deepEqual(vistos, [['todos', 'caja', 'zona'], ['lista', 'caja']]);
  assert.ok(l.has('exit') && !l.has('contact'));
  assert.ok(matcher(undefined)(c) && !matcher('x')(c) && matcher(c)(c));
  mal(() => l.on('choque', () => {}), /on: aviso desconocido "choque" \(van enter, exit, contact, separate\)/);
  mal(() => l.on('enter', 'a'), /el último va la función/);
  mal(() => matcher(3, 'on.a'), /on\.a: va un cuerpo, un personaje, un nombre/);
});
