// La simulación de verdad, con Rapier en Node (necesita `npm install`): caer y apoyarse, rebotar,
// sensores, grupos, rayos, kinematic, avisos de contacto, consultas, determinismo, guardar el mundo
// en JSON y volverlo a armar.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPhysics, loadRapier } from '../adapters/rapier/physics.js';

const cerca = (a, b, eps, que = '') => {
  if (Array.isArray(a)) { a.forEach((x, i) => cerca(x, b[i], eps, `${que}[${i}]`)); return; }
  assert.ok(Math.abs(a - b) <= eps, `${que}: ${a} ≉ ${b} (±${eps})`);
};
/** Un mundo con un piso de 40 × 40 con la cara de arriba en y = 0. */
async function conPiso(opts = {}) {
  const fisica = await createPhysics(opts);
  const piso = fisica.body({ type: 'fixed', name: 'piso', position: [0, -0.5, 0], colliders: { shape: 'box', size: [40, 1, 40] } });
  return { fisica, piso };
}
const pasos = (fisica, n, dt = 1 / 60) => { for (let i = 0; i < n; i++) fisica.step(dt); };

test('Rapier se carga a pedido, una sola vez, y es la 0.21', async () => {
  const [a, b] = await Promise.all([loadRapier(), loadRapier()]);
  assert.equal(a, b);
  assert.equal(a.version(), '0.21.0');
});

test('una caja cae y se apoya en el piso (y su centro queda a media altura)', async () => {
  const { fisica } = await conPiso();
  const caja = fisica.body({ position: [0, 5, 0], colliders: { shape: 'box', size: [1, 2, 1] } });
  pasos(fisica, 30);
  assert.ok(caja.position[1] < 4, 'en medio segundo cayó');
  assert.ok(caja.velocity[1] < -4, 'cae');
  pasos(fisica, 270);
  cerca(caja.position[1], 1, 0.02, 'apoyada');
  cerca(caja.velocity, [0, 0, 0], 0.02, 'quieta');
  assert.ok(caja.sleeping, 'quieta, se duerme');
  cerca(caja.mass, 2, 1e-6, 'densidad 1 × 2 m³');
  const s = fisica.stats();
  assert.deepEqual([s.bodies, s.colliders, s.sleeping, s.contacts, s.steps], [2, 2, 1, 1, 300]);
  cerca(s.time, 5, 1e-9);
  fisica.dispose();
});

test('restitución: con más restitution rebota más alto', async () => {
  const altura = async (restitution) => {
    const { fisica } = await conPiso();
    const p = fisica.body({ position: [0, 3, 0], colliders: { shape: 'sphere', radius: 0.5, restitution, restitutionCombine: 'max' } });
    let bajo = false, max = 0;
    for (let i = 0; i < 180; i++) {
      fisica.step(1 / 60);
      if (p.velocity[1] > 0) bajo = true;
      if (bajo) max = Math.max(max, p.position[1]);
    }
    fisica.dispose();
    return max;
  };
  const [nada, media, mucha] = [await altura(0), await altura(0.5), await altura(0.9)];
  assert.ok(nada < 0.6, `sin restitución casi no rebota (${nada})`);
  assert.ok(media > nada + 0.3 && mucha > media + 0.5, `${nada} < ${media} < ${mucha}`);
  assert.ok(mucha > 2, `con 0.9 vuelve cerca de donde salió (${mucha})`);
});

test('materiales con nombre: el hielo patina, la goma rebota', async () => {
  const deslizar = async (material) => {
    const { fisica } = await conPiso({ materials: { hielo: { friction: 0.01, frictionCombine: 'min' }, goma: { friction: 1, frictionCombine: 'max' } } });
    const c = fisica.body({ position: [0, 0.5, 0], linearVelocity: [5, 0, 0], colliders: { shape: 'box', material } });
    pasos(fisica, 60);
    const x = c.position[0];
    fisica.dispose();
    return x;
  };
  const [hielo, goma] = [await deslizar('hielo'), await deslizar('goma')];
  assert.ok(hielo > 4, `en el hielo sigue de largo (${hielo})`);
  assert.ok(goma < 2, `en la goma frena (${goma})`);
});

test("un sensor avisa 'enter' y 'exit' cuando un cuerpo lo atraviesa, con los cuerpos nuestros", async () => {
  const fisica = await createPhysics({ gravity: [0, 0, 0] });
  const zona = fisica.body({ type: 'fixed', name: 'zona', colliders: { shape: 'box', size: [2, 2, 2], sensor: true } });
  const bala = fisica.body({ name: 'bala', position: [-5, 0, 0], linearVelocity: [10, 0, 0], colliders: { shape: 'sphere', radius: 0.2 } });
  const avisos = [];
  fisica.on('enter', (a, b, info) => avisos.push(['enter', a.name, b.name, fisica.time.toFixed(2), info.colliders]));
  fisica.on('exit', zona, 'bala', (a, b) => avisos.push(['exit', a.name, b.name, fisica.time.toFixed(2)]));
  fisica.on('contact', () => avisos.push(['contact']));
  pasos(fisica, 90);
  assert.deepEqual(avisos.map((a) => a.slice(0, 3)), [['enter', 'zona', 'bala'], ['exit', 'zona', 'bala']]);
  // entra cuando el borde de la esfera toca x = -1 (t ≈ 0.38) y sale cuando deja x = 1 (t ≈ 0.62);
  // Rapier lo ve en el paso siguiente (su detección mira las posiciones del principio del paso)
  cerca(Number(avisos[0][3]), 0.38, 0.04);
  cerca(Number(avisos[1][3]), 0.62, 0.04);
  assert.deepEqual(avisos[0][4], [0, 0]);
  cerca(bala.velocity, [10, 0, 0], 1e-4, 'un sensor no frena');
});

test("un sensor ve a un personaje (kinematic contra fixed) y 'exit' llega al sacar el cuerpo", async () => {
  const { fisica } = await conPiso();
  fisica.body({ type: 'fixed', name: 'zona', position: [2, 1, 0], colliders: { shape: 'box', size: [1, 2, 1], sensor: true } });
  const heroe = fisica.character({ name: 'heroe', position: [0, 0, 0] });
  const avisos = [];
  fisica.on('enter', 'zona', (z, quien) => avisos.push(['enter', quien.name]));
  fisica.on('exit', 'zona', heroe, (z, quien) => avisos.push(['exit', quien.name, quien.removed]));
  for (let i = 0; i < 40; i++) { heroe.move([0.05, -0.05, 0]); fisica.step(1 / 60); }
  assert.deepEqual(avisos, [['enter', 'heroe']]);
  heroe.remove();
  fisica.step(1 / 60);
  assert.deepEqual(avisos, [['enter', 'heroe'], ['exit', 'heroe', true]]);
});

test('grupos: lo que no choca se atraviesa', async () => {
  const fisica = await createPhysics({ groups: ['jugador', 'fantasma', 'piso'] });
  fisica.body({ type: 'fixed', position: [0, -0.5, 0], colliders: { shape: 'box', size: [20, 1, 20], group: 'piso' } });
  const solido = fisica.body({ position: [-2, 1, 0], colliders: { shape: 'sphere', group: 'jugador' } });
  const fantasma = fisica.body({ position: [2, 1, 0], colliders: { shape: 'sphere', group: 'fantasma', collidesWith: ['jugador'] } });
  pasos(fisica, 120);
  cerca(solido.position[1], 0.5, 0.02, 'el sólido se apoya');
  assert.ok(fantasma.position[1] < -5, `el fantasma atraviesa el piso (${fantasma.position[1]})`);
  // un rayo filtrado por grupo
  assert.equal(fisica.ray([-2, 10, 0], [0, -1, 0], { groups: 'piso' }).distance.toFixed(3), '10.000');
  assert.throws(() => fisica.ray([0, 0, 0], [0, -1, 0], { groups: 'agua' }), /ray\.groups: grupo desconocido agua/);
});

test('ray: el cuerpo, el punto, la normal y la distancia; rayAll y exclude', async () => {
  const { fisica, piso } = await conPiso();
  const caja = fisica.body({ type: 'fixed', name: 'caja', position: [3, 1, 0], colliders: { shape: 'box', size: [2, 2, 2] } });
  // recién creados: el rayo ya los ve (sin step)
  const r = fisica.ray([3, 10, 0], [0, -2, 0]);
  assert.equal(r.body, caja);
  cerca(r.distance, 8, 1e-4);
  cerca(r.point, [3, 2, 0], 1e-4);
  cerca(r.normal, [0, 1, 0], 1e-4);
  assert.equal(r.collider, 0);
  assert.equal(fisica.ray([3, 10, 0], [0, -1, 0], { exclude: caja }).body, piso);
  assert.equal(fisica.ray([3, 10, 0], [0, -1, 0], { max: 5 }), null);
  assert.equal(fisica.ray([3, 10, 0], [0, 1, 0]), null);
  const todos = fisica.rayAll([3, 10, 0], [0, -1, 0]);
  assert.deepEqual(todos.map((h) => h.body.name), ['caja', 'piso']);
  cerca(todos.map((h) => h.distance), [8, 10], 1e-4);
  // de costado
  const lado = fisica.ray([-10, 1, 0], [1, 0, 0], { exclude: [piso] });
  cerca(lado.distance, 12, 1e-4);
  cerca(lado.normal, [-1, 0, 0], 1e-4);
  // un sensor no tapa (salvo que se pida)
  fisica.body({ type: 'fixed', position: [3, 5, 0], colliders: { shape: 'box', sensor: true } });
  assert.equal(fisica.ray([3, 10, 0], [0, -1, 0]).body, caja);
  cerca(fisica.ray([3, 10, 0], [0, -1, 0], { sensors: true }).distance, 4.5, 1e-4);
  // un teletransporte también se ve ya
  caja.teleport([10, 1, 0]);
  assert.equal(fisica.ray([3, 10, 0], [0, -1, 0]).body, piso);
});

test('overlap y closest: lo que hay en un lugar', async () => {
  const { fisica, piso } = await conPiso();
  const a = fisica.body({ type: 'fixed', name: 'a', position: [0, 1, 0], colliders: 'sphere' });
  const b = fisica.body({ type: 'fixed', name: 'b', position: [3, 1, 0], colliders: 'sphere' });
  const nombres = (l) => l.map((x) => x.name).sort();
  assert.deepEqual(nombres(fisica.overlap({ shape: 'sphere', radius: 1 }, [0, 1.5, 0])), ['a']);
  assert.deepEqual(nombres(fisica.overlap({ shape: 'sphere', radius: 1 }, [0, 0.8, 0])), ['a', 'piso']);
  assert.deepEqual(nombres(fisica.overlap({ shape: 'sphere', radius: 1 }, [0, 0.8, 0], { exclude: piso })), ['a']);
  assert.deepEqual(nombres(fisica.overlap({ shape: 'sphere', radius: 1, offset: [0, -0.7, 0] }, [0, 1.5, 0])), ['a', 'piso'], 'con el offset de la forma');
  assert.deepEqual(nombres(fisica.overlap({ shape: 'box', size: [8, 0.5, 0.5] }, [1.5, 1, 0])), ['a', 'b']);
  // una caja larga girada 90°: ya no llega a b
  assert.deepEqual(nombres(fisica.overlap({ shape: 'box', size: [8, 0.5, 0.5] }, [0, 1, 0], { rotation: [0, 90, 0] })), ['a']);
  const c = fisica.closest([0, 1, 0.9]);
  assert.equal(c.body, a);
  cerca(c.point, [0, 1, 0.5], 1e-4);
  cerca(c.distance, 0.4, 1e-4);
  assert.equal(fisica.closest([0, 1, 3]).body, piso, 'el piso está más cerca');
  assert.equal(c.inside, false);
  assert.equal(fisica.closest([3, 1, 0]).inside, true);
  assert.equal(fisica.closest([3, 1, 0], { exclude: [b, a] }).body, piso);
});

test("los avisos de contacto: 'contact' con la normal y el impulso, 'separate' al separarse", async () => {
  const { fisica, piso } = await conPiso();
  const avisos = [];
  fisica.on('contact', 'pelota', (p, otro, info) => avisos.push(['contact', otro.name, info]));
  fisica.on('separate', 'pelota', (p, otro) => avisos.push(['separate', otro.name]));
  const pelota = fisica.body({ name: 'pelota', position: [0, 2, 0], colliders: { shape: 'sphere', radius: 0.5, restitution: 0.8 } });
  pasos(fisica, 60);
  assert.ok(avisos.length >= 2, 'tocó y rebotó');
  const [tipo, otro, info] = avisos[0];
  assert.deepEqual([tipo, otro], ['contact', 'piso']);
  cerca(info.normal, [0, -1, 0], 1e-3, 'de la pelota hacia el piso');
  assert.ok(info.impulse > 0.5, `el impulso del golpe (${info.impulse})`);
  cerca(info.point[1], 0, 0.05);
  assert.deepEqual(avisos[1], ['separate', 'piso']);
  // del otro lado, la normal al revés
  const desdePiso = [];
  fisica.on('contact', piso, (pi, pe, i) => desdePiso.push(i.normal));
  pelota.teleport([0, 1, 0]);
  pasos(fisica, 30);
  cerca(desdePiso[0], [0, 1, 0], 1e-3);
});

test('kinematic: moveTo lo lleva en el próximo paso y empuja a un dynamic', async () => {
  const { fisica } = await conPiso();
  const plataforma = fisica.body({ type: 'kinematic', position: [0, 0.25, 0], colliders: { shape: 'box', size: [2, 0.5, 2] } });
  const caja = fisica.body({ position: [3, 0.5, 0], colliders: 'box' });
  plataforma.moveTo([0.1, 0.25, 0]);
  cerca(plataforma.position, [0, 0.25, 0], 1e-9, 'todavía no');
  fisica.step(1 / 60);
  cerca(plataforma.position, [0.1, 0.25, 0], 1e-6, 'ya');
  for (let i = 2; i <= 60; i++) { plataforma.moveTo([0.1 * i, 0.25, 0]); fisica.step(1 / 60); }
  cerca(plataforma.position[0], 6, 1e-5);
  assert.ok(caja.position[0] > 6.5, `la empujó (${caja.position[0]})`);
  assert.throws(() => caja.moveTo([0, 0, 0]), /moveTo: es para un cuerpo kinematic/);
});

test('impulsos, fuerzas (por un paso), giros, velocidades, dormir y despertar', async () => {
  const fisica = await createPhysics({ gravity: [0, 0, 0] });
  const b = fisica.body({ colliders: { shape: 'box', size: [1, 1, 1] }, mass: 2 });
  cerca(b.mass, 2, 1e-6);
  b.applyImpulse([4, 0, 0]);
  cerca(b.velocity, [2, 0, 0], 1e-6, 'Δv = J / m');
  b.setVelocity([0, 0, 0]);
  b.applyForce([2, 0, 0]);
  fisica.step(0.5);
  cerca(b.velocity, [0.5, 0, 0], 1e-4, 'a = F / m durante un paso');
  fisica.step(0.5);
  cerca(b.velocity, [0.5, 0, 0], 1e-4, 'la fuerza dura un paso');
  b.applyTorqueImpulse([0, 1, 0]);
  assert.ok(b.angularVelocity[1] > 0);
  b.setAngularVelocity([0, 0, 0]).setVelocity([0, 0, 0]);
  b.sleep();
  assert.equal(b.sleeping, true);
  b.wake();
  assert.equal(b.sleeping, false);
  // un golpe en un punto lo hace girar
  b.applyImpulse([0, 0, 1], [...b.position.map((x, i) => x + (i === 0 ? 0.5 : 0))]);
  assert.ok(Math.abs(b.angularVelocity[1]) > 0.1);
  b.setRotation([0, 90, 0]);
  cerca(b.rotation, [0, Math.SQRT1_2, 0, Math.SQRT1_2], 1e-6);
});

test('lockRotation: un cuerpo que no se cae; lockPosition: uno que no sale de su plano', async () => {
  const { fisica } = await conPiso();
  const palo = fisica.body({ position: [0, 1, 0], rotation: [0, 0, 10], lockRotation: true, colliders: { shape: 'box', size: [0.2, 2, 0.2] } });
  const plano = fisica.body({ position: [3, 2, 0], linearVelocity: [0, 0, 5], lockPosition: [false, false, true], colliders: 'sphere' });
  pasos(fisica, 120);
  cerca(palo.rotation, [0, 0, Math.sin((5 * Math.PI) / 180), Math.cos((5 * Math.PI) / 180)], 1e-6, 'no se cayó');
  cerca(plano.position[2], 0, 1e-9, 'no salió del plano z = 0');
});

test('step(dt) largo se parte en pasos de maxDelta; advance(dt) junta y da alpha', async () => {
  const caer = async (fn) => {
    const fisica = await createPhysics({ maxDelta: 1 / 60 });
    const b = fisica.body({ position: [0, 100, 0], colliders: 'sphere' });
    fn(fisica);
    return b.position[1];
  };
  const unoLargo = await caer((f) => f.step(1 / 6));
  const diezCortos = await caer((f) => pasos(f, 10, 1 / 60));
  cerca(unoLargo, diezCortos, 1e-6);
  const fisica = await createPhysics();
  const vistos = [];
  fisica.onStep((dt) => vistos.push(dt));
  assert.equal(fisica.advance(1 / 60 * 2.5), fisica.alpha);
  assert.equal(vistos.length, 2);
  cerca(fisica.alpha, 0.5, 1e-6);
  fisica.advance(10);
  assert.equal(vistos.length, 7, 'a lo sumo maxSteps (5) en un cuadro');
  assert.throws(() => fisica.step(0), /step\(dt\): va un número > 0/);
});

test('determinismo: dos mundos con la misma secuencia dan exactamente lo mismo', async () => {
  const correr = async () => {
    const { fisica } = await conPiso();
    const cosas = [];
    for (let i = 0; i < 12; i++) {
      cosas.push(fisica.body({ position: [(i % 4) * 0.6 - 1, 1 + i * 0.7, Math.floor(i / 4) * 0.3], rotation: [i * 7, i * 13, 0], colliders: i % 2 ? 'sphere' : { shape: 'box', size: [0.5, 0.7, 0.4] } }));
    }
    const heroe = fisica.character({ position: [3, 0, 0] });
    for (let t = 0; t < 200; t++) {
      if (t === 50) cosas[3].applyImpulse([2, 3, 0]);
      heroe.move([Math.sin(t / 20) * 0.05, -0.1, 0.03]);
      fisica.step(1 / 60);
    }
    return [...cosas.flatMap((c) => [...c.position, ...c.rotation]), ...heroe.position];
  };
  assert.deepEqual(await correr(), await correr());
});

test('toJSON: el mundo como datos, que createPhysics vuelve a armar donde estaba', async () => {
  const { fisica } = await conPiso({ groups: ['a'], materials: { hielo: { friction: 0 } } });
  fisica.body({ name: 'caja', position: [0, 3, 0], rotation: [0, 30, 0], colliders: { shape: 'box', material: 'hielo', group: 'a' }, userData: { vida: 3 } });
  fisica.character({ name: 'heroe', position: [4, 0, 0] });
  pasos(fisica, 30);
  const json = JSON.parse(JSON.stringify(fisica.toJSON()));
  assert.equal(json.bodies.length, 2, 'los cuerpos sin los de los personajes');
  assert.equal(json.characters.length, 1);
  const otra = await createPhysics(json);
  const [a, b] = [fisica.bodies.find((x) => x.name === 'caja'), otra.bodies.find((x) => x.name === 'caja')];
  cerca(b.position, a.position, 1e-6);
  cerca(b.rotation, a.rotation, 1e-6);
  cerca(b.velocity, a.velocity, 1e-6);
  assert.deepEqual(b.userData, { vida: 3 });
  cerca(otra.characters[0].position, fisica.characters[0].position, 1e-6);
});

test('colliders de todas las formas: convex, mesh, heightfield, cilindro, cono, cápsula', async () => {
  const fisica = await createPhysics({ gravity: [0, 0, 0] });
  const H = [[0, 1, 2, 3], [10, 11, 12, 13], [20, 21, 22, 23]];
  fisica.body({ type: 'fixed', name: 'terreno', position: [100, 0, 0], colliders: { shape: 'heightfield', heights: H, size: [3, 1, 2] } });
  // filas a lo largo de z (de −1 a 1), columnas a lo largo de x (de −1.5 a 1.5)
  for (const [x, z, h] of [[-1.5, -1, 0], [1.5, -1, 3], [-1.5, 1, 20], [1.5, 1, 23], [-0.5, 0, 11]]) {
    cerca(100 - fisica.ray([100 + x, 100, z], [0, -1, 0]).distance, h, 1e-3, `alto en ${x}, ${z}`);
  }
  fisica.body({ type: 'fixed', name: 'rampa', position: [200, 0, 0], colliders: { shape: 'mesh', vertices: [[-1, 0, -1], [1, 2, -1], [1, 2, 1], [-1, 0, 1]], indices: [[0, 2, 1], [0, 3, 2]] } });
  cerca(fisica.ray([200, 10, 0], [0, -1, 0]).distance, 9, 1e-4);
  const formas = {
    convex: { shape: 'convex', points: [[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]] },
    cylinder: { shape: 'cylinder', radius: 1, height: 2 },
    cone: { shape: 'cone', radius: 1, height: 2 },
    capsule: { shape: 'capsule', radius: 0.5, height: 3 },
  };
  let x = 300;
  for (const [nombre, c] of Object.entries(formas)) {
    const b = fisica.body({ name: nombre, position: [x, 0, 0], colliders: c });
    assert.ok(b.mass > 0, nombre);
    x += 10;
  }
  cerca(fisica.bodies.find((b) => b.name === 'capsule').mass, Math.PI * 0.25 * 2 + (4 / 3) * Math.PI * 0.125, 1e-3);
  cerca(10 - fisica.ray([310, 10, 0], [0, -1, 0]).distance, 1, 1e-4, 'el cilindro va de −1 a 1');
  cerca(10 - fisica.ray([320, 10, 0], [0, -1, 0]).distance, 1, 1e-4, 'el cono, la punta arriba');
  cerca(10 - fisica.ray([330, 10, 0], [0, -1, 0]).distance, 1.5, 1e-4, 'la cápsula mide 3 en total');
});

test('un cuerpo sacado no está más; el mundo soltado no se usa', async () => {
  const { fisica } = await conPiso();
  const c = fisica.body({ position: [0, 1, 0], colliders: 'box' });
  assert.equal(fisica.bodies.length, 2);
  fisica.remove(c);
  assert.equal(c.removed, true);
  assert.equal(fisica.bodies.length, 1);
  assert.equal(fisica.ray([0, 5, 0], [0, -1, 0]).body.name, 'piso');
  c.remove(); // dos veces no rompe
  fisica.dispose();
  assert.throws(() => fisica.body({ colliders: 'box' }), /el mundo de física ya se soltó/);
  assert.throws(() => fisica.step(), /ya se soltó/);
});

test('los errores de createPhysics y de body dicen dónde, antes de cargar nada', async () => {
  await assert.rejects(createPhysics({ gravity: [0, 'x', 0] }), /createPhysics\.gravity\[1\]: va un número/);
  const fisica = await createPhysics({ groups: ['a'] });
  assert.throws(() => fisica.body({ colliders: { shape: 'box', group: 'b' } }), /body\.colliders\[0\]\.group: grupo desconocido b \(van a\)/);
  assert.throws(() => fisica.body({ colliders: { shape: 'box', material: 'hielo' } }), /body\.colliders\[0\]\.material: material desconocido hielo/);
  assert.throws(() => fisica.on('golpe', () => {}), /on: aviso desconocido/);
  assert.throws(() => fisica.ray([0, 0, 0], [0, 0, 0]), /ray\(direction\): va una dirección/);
  assert.throws(() => fisica.ray([0, 0, 0], [0, 1, 0], { maximo: 3 }), /ray\.maximo: clave desconocida/);
});

test('help(): cada objeto imprime su tabla', async () => {
  const fisica = await createPhysics();
  const b = fisica.body({ colliders: 'box' });
  const p = fisica.character();
  for (const x of [fisica, b, p]) assert.ok(x.help({ print: false }).length > 5);
  assert.equal(fisica.raw.constructor.name.length > 0, true, 'la escotilla: el World de Rapier');
  assert.equal(typeof b.raw.translation, 'function');
  assert.equal(typeof p.raw.computeColliderMovement, 'function');
});
