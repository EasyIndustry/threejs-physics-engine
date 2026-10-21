// El personaje, con Rapier de verdad: es lo que más usa un juego. Sube un escalón más bajo que
// `step` y no uno más alto, no atraviesa una pared, se desliza por una pared en diagonal, sube una
// pendiente suave y no una empinada, sabe si está en el piso, cae, se pega al piso al bajar y
// empuja cajas.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPhysics } from '../adapters/rapier/physics.js';

const DT = 1 / 60;
const cerca = (a, b, eps, que = '') => {
  if (Array.isArray(a)) { a.forEach((x, i) => cerca(x, b[i], eps, `${que}[${i}]`)); return; }
  assert.ok(Math.abs(a - b) <= eps, `${que}: ${a} ≉ ${b} (±${eps})`);
};
async function mundo() {
  const fisica = await createPhysics();
  const piso = fisica.body({ type: 'fixed', name: 'piso', position: [0, -0.5, 0], colliders: { shape: 'box', size: [60, 1, 60] } });
  return { fisica, piso };
}
/**
 * Camina como en un juego: la velocidad horizontal que pide la app y la gravedad, que se acumula
 * mientras no está en el piso. Devuelve el último resultado de move().
 */
function caminar(fisica, p, [vx, vz], segundos, { saltar = 0 } = {}) {
  let vy = saltar, r;
  for (let i = 0; i < Math.round(segundos / DT); i++) {
    if (p.grounded && vy < 0) vy = 0;
    vy -= 9.81 * DT;
    r = p.move([vx * DT, vy * DT, vz * DT]);
    fisica.step(DT);
  }
  return r;
}

test('cae hasta el piso: grounded es false en el aire y true parado, y position son los pies', async () => {
  const { fisica } = await mundo();
  const p = fisica.character({ position: [0, 3, 0] });
  const r = p.move([0, -0.01, 0]);
  assert.equal(r.grounded, false, 'en el aire');
  fisica.step(DT);
  assert.equal(p.grounded, false);
  caminar(fisica, p, [0, 0], 2);
  assert.equal(p.grounded, true, 'parado en el piso');
  cerca(p.position[1], 0, 0.02, 'los pies en el piso');
  cerca(p.body.position, p.position, 1e-6);
  // un salto: deja el piso y vuelve
  caminar(fisica, p, [0, 0], 0.1, { saltar: 5 });
  assert.equal(p.grounded, false, 'saltando');
  assert.ok(p.position[1] > 0.3);
  caminar(fisica, p, [0, 0], 1.5);
  assert.equal(p.grounded, true, 'aterrizó');
});

test('sube un escalón más bajo que step y no uno más alto', async () => {
  const subir = async (alto) => {
    const { fisica } = await mundo();
    fisica.body({ type: 'fixed', name: 'escalon', position: [3, alto / 2, 0], colliders: { shape: 'box', size: [2, alto, 4] } });
    const p = fisica.character({ position: [0, 0, 0], radius: 0.3, height: 1.8, step: 0.3 });
    caminar(fisica, p, [0, 0], 0.3);
    caminar(fisica, p, [2, 0], 2);
    return p.position;
  };
  const bajo = await subir(0.2);
  cerca(bajo[1], 0.2, 0.03, 'arriba del escalón de 0.2');
  assert.ok(bajo[0] > 2.5, `siguió caminando arriba (${bajo[0]})`);
  const alto = await subir(0.5);
  cerca(alto[1], 0, 0.03, 'abajo del de 0.5');
  cerca(alto[0], 2 - 0.3, 0.05, 'frenado contra su borde (x = 2 menos el radio)');
});

test('sin step no sube ni un escalón chico', async () => {
  const { fisica } = await mundo();
  fisica.body({ type: 'fixed', position: [3, 0.1, 0], colliders: { shape: 'box', size: [2, 0.2, 4] } });
  const p = fisica.character({ step: null });
  caminar(fisica, p, [2, 0], 2);
  cerca(p.position[0], 1.7, 0.05);
  cerca(p.position[1], 0, 0.03);
});

test('no atraviesa una pared, y collisions dice con qué chocó y para dónde', async () => {
  const { fisica } = await mundo();
  const pared = fisica.body({ type: 'fixed', name: 'pared', position: [2.5, 1.5, 0], colliders: { shape: 'box', size: [1, 3, 6] } });
  const p = fisica.character({ name: 'heroe' });
  caminar(fisica, p, [0, 0], 0.3);
  const r = caminar(fisica, p, [8, 0], 2); // rápido: 8 m/s contra una pared a 2 m
  cerca(p.position[0], 2 - 0.3, 0.05, 'pegado a la cara de la pared');
  const choque = r.collisions.find((c) => c.body === pared);
  assert.ok(choque, `chocó con la pared (${r.collisions.map((c) => c.body?.name)})`);
  cerca(choque.normal, [-1, 0, 0], 0.05, 'la normal sale de la pared hacia el personaje');
  // de un salto tampoco
  p.teleport([0, 0, 0]);
  caminar(fisica, p, [30, 0], 0.5, { saltar: 3 });
  assert.ok(p.position[0] < 2, `a 30 m/s tampoco (${p.position[0]})`);
});

test('se desliza por una pared en diagonal en vez de frenarse', async () => {
  const { fisica } = await mundo();
  // una pared larga girada 45°, que cruza z = 0 en x = 5 (la línea x − z = 5)
  fisica.body({ type: 'fixed', position: [3.5, 1.5, -1.5], rotation: [0, 45, 0], colliders: { shape: 'box', size: [0.5, 3, 16] } });
  const p = fisica.character();
  caminar(fisica, p, [0, 0], 0.3);
  caminar(fisica, p, [3, 0], 3);
  const [x, , z] = p.position;
  // llega a la pared en 1.5 s y se desliza el resto a lo largo de ella (hacia +x +z), a 3 × cos 45°
  assert.ok(z > 1.5, `se corrió a lo largo de la pared (z = ${z})`);
  cerca(x - z, 5 - (0.25 + 0.3) * Math.SQRT2, 0.1, 'pegado a la pared, sin atravesarla');
  const sinDeslizar = await (async () => {
    const m = await mundo();
    m.fisica.body({ type: 'fixed', position: [3.5, 1.5, -1.5], rotation: [0, 45, 0], colliders: { shape: 'box', size: [0.5, 3, 16] } });
    const q = m.fisica.character({ slide: false });
    caminar(m.fisica, q, [0, 0], 0.3);
    caminar(m.fisica, q, [3, 0], 3);
    return q.position;
  })();
  assert.ok(Math.abs(sinDeslizar[2]) < Math.abs(z) / 2, `con slide: false se queda donde chocó (z = ${sinDeslizar[2]})`);
});

test('sube una pendiente suave y no una más empinada que slope', async () => {
  const rampa = async (grados) => {
    const { fisica } = await mundo();
    // una rampa que arranca en x = 1 y sube en +x
    const largo = 6, a = (grados * Math.PI) / 180;
    fisica.body({ type: 'fixed', position: [1 + (largo / 2) * Math.cos(a), (largo / 2) * Math.sin(a) - 0.25 * Math.cos(a), 0], rotation: [0, 0, grados], colliders: { shape: 'box', size: [largo, 0.5, 4] } });
    const p = fisica.character({ slope: 45, step: null });
    caminar(fisica, p, [0, 0], 0.3);
    caminar(fisica, p, [2, 0], 2.5);
    return p.position;
  };
  const suave = await rampa(25);
  assert.ok(suave[1] > 1, `subió la de 25° (y = ${suave[1]})`);
  const empinada = await rampa(60);
  assert.ok(empinada[1] < 0.3, `no subió la de 60° (y = ${empinada[1]})`);
});

test('snap: al bajar un escalón se pega al piso en vez de volar', async () => {
  const bajar = async (snap) => {
    const { fisica } = await mundo();
    fisica.body({ type: 'fixed', position: [-5, 0.1, 0], colliders: { shape: 'box', size: [10, 0.2, 4] } });
    const p = fisica.character({ position: [-1, 0.2, 0], snap });
    caminar(fisica, p, [0, 0], 0.2);
    let enElAire = 0;
    let vy = 0;
    for (let i = 0; i < 30; i++) {
      if (p.grounded && vy < 0) vy = 0;
      vy -= 9.81 * DT;
      p.move([4 * DT, vy * DT, 0]);
      fisica.step(DT);
      if (p.position[0] > 0.3 && !p.grounded) enElAire++;
    }
    return enElAire;
  };
  assert.equal(await bajar(0.3), 0, 'con snap no deja de pisar');
  assert.ok((await bajar(null)) > 0, 'sin snap, un rato en el aire');
});

test('empuja a una caja dynamic (push), y con push: false no', async () => {
  const empujar = async (push) => {
    const { fisica } = await mundo();
    const caja = fisica.body({ position: [1.5, 0.5, 0], colliders: { shape: 'box', size: [1, 1, 1] } });
    const p = fisica.character({ push });
    caminar(fisica, p, [0, 0], 0.3);
    caminar(fisica, p, [2, 0], 1.5);
    return caja.position[0];
  };
  assert.ok((await empujar(true)) > 2, 'la empujó');
  cerca(await empujar(false), 1.5, 0.05, 'no la tocó');
});

test('grupos: el personaje atraviesa lo que no está en su collidesWith', async () => {
  const fisica = await createPhysics({ groups: ['jugador', 'piso', 'reja'] });
  fisica.body({ type: 'fixed', position: [0, -0.5, 0], colliders: { shape: 'box', size: [40, 1, 40], group: 'piso' } });
  fisica.body({ type: 'fixed', position: [2.5, 1.5, 0], colliders: { shape: 'box', size: [1, 3, 6], group: 'reja' } });
  const p = fisica.character({ group: 'jugador', collidesWith: ['piso'] });
  caminar(fisica, p, [3, 0], 2);
  assert.ok(p.position[0] > 4, `atravesó la reja (${p.position[0]})`);
  cerca(p.position[1], 0, 0.03, 'pero no el piso');
});

test('move dos veces antes de un step suma lo pedido; teleport no choca con nada en el camino', async () => {
  const { fisica } = await mundo();
  const p = fisica.character();
  caminar(fisica, p, [0, 0], 0.3);
  p.move([0.1, -0.01, 0]);
  const r = p.move([0.1, -0.01, 0]);
  cerca(r.position[0], 0.2, 1e-3);
  fisica.step(DT);
  cerca(p.position[0], 0.2, 1e-3);
  fisica.body({ type: 'fixed', position: [3, 1.5, 0], colliders: { shape: 'box', size: [1, 3, 6] } });
  p.teleport([6, 0, 0]);
  cerca(p.position, [6, 0, 0], 1e-9);
  fisica.step(DT);
  cerca(p.position, [6, 0, 0], 1e-6);
  assert.deepEqual(p.toJSON().position, p.position);
  assert.throws(() => p.move([0, 'x', 0]), /move\(delta\)\[1\]: va un número/);
  p.remove();
  assert.throws(() => p.move([0, 0, 0]), /ya se sacó del mundo/);
});

test('camina parejo aunque lo vertical empuje fuerte contra el piso (sin pasos frenados)', async () => {
  const { fisica } = await mundo();
  const p = fisica.character({ position: [0, 0, 0], radius: 0.3, height: 1.6 });
  let frenados = 0;
  for (let i = 0; i < 180; i++) {
    const r = p.move([0.05, -0.05, 0]);
    if (r.movement[0] < 0.049) frenados++;
    assert.equal(r.grounded, true);
    fisica.step(DT);
  }
  assert.equal(frenados, 0);
  cerca(p.position[0], 9, 0.01);
});
