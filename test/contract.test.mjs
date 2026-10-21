// Lo que el repo promete de su forma, leyendo el fuente: que el núcleo sea puro (ni three, ni
// Rapier, ni el DOM), que cada adaptador importe solo lo suyo, y que cada tabla de help() coincida
// con la API de su objeto, en las dos direcciones.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import {
  PHYSICS_MEMBERS, BODY_MEMBERS, CHARACTER_MEMBERS, LINKS_MEMBERS, DEBUG_VIEW_MEMBERS, BODY_SYSTEM_MEMBERS,
  memberNames, help,
} from '../src/index.js';

const fuente = (f) => readFile(new URL(`../${f}`, import.meta.url), 'utf8');

/**
 * Los miembros de un objeto literal del fuente (`const nombre = {` … `};`): los que están un nivel
 * adentro, sean métodos, getters, setters, `clave: valor` o shorthand.
 */
function miembros(s, nombre) {
  const i = s.indexOf(`const ${nombre} = {`);
  assert.ok(i >= 0, `no está const ${nombre} = { en el fuente`);
  const sangria = s.slice(s.lastIndexOf('\n', i) + 1, i);
  const fin = s.indexOf(`\n${sangria}};`, i);
  const cuerpo = s.slice(i, fin);
  const adentro = `${sangria}  `;
  const api = new Set();
  const re = new RegExp(`^${adentro}(?:async |get |set )?([A-Za-z_$][\\w$]*)\\s*(?:\\(|:|,)`, 'gm');
  for (const m of cuerpo.matchAll(re)) api.add(m[1]);
  return api;
}

/** La tabla y la API, en las dos direcciones. */
function coinciden(api, tabla, quien) {
  const doc = new Set(tabla.flatMap(([sig]) => memberNames(sig)));
  assert.ok(api.size > 3, `${quien}: no se encontró la API`);
  for (const n of api) assert.ok(doc.has(n), `${quien}: ${n} está en la API pero no en la tabla de help()`);
  for (const n of doc) assert.ok(api.has(n), `${quien}: ${n} está en la tabla de help() pero no en la API`);
}

test('lo puro no importa three, Rapier ni el DOM', async () => {
  const archivos = (await readdir(new URL('../src/', import.meta.url))).filter((f) => f.endsWith('.js'));
  assert.ok(archivos.length >= 10);
  for (const f of archivos) {
    const s = await fuente(`src/${f}`);
    assert.doesNotMatch(s, /from 'three(\/[^']*)?'/, f);
    assert.doesNotMatch(s, /rapier3d|@dimforge/, f);
    assert.doesNotMatch(s, /\bimport\('(?!\.)/, `${f}: nada a pedido en lo puro`);
    assert.doesNotMatch(s, /\b(document|window)\./, f);
    assert.doesNotMatch(s, /from '\.\.\//, `${f}: src/ no importa nada de afuera de src/`);
  }
});

test('el adaptador de Rapier no importa three, y carga Rapier a pedido', async () => {
  const s = await fuente('adapters/rapier/physics.js');
  assert.doesNotMatch(s, /from 'three(\/[^']*)?'/);
  assert.doesNotMatch(s, /^import .*rapier3d/m, 'Rapier no se importa arriba: se carga a pedido');
  assert.match(s, /import\('@dimforge\/rapier3d-compat'\)/);
  assert.match(s, /\.init\(\)/);
});

test('el adaptador de three no importa Rapier, y three solo se importa ahí', async () => {
  const s = await fuente('adapters/three/index.js');
  assert.match(s, /^import \* as THREE from 'three';$/m);
  assert.doesNotMatch(s, /rapier3d|@dimforge/);
  for (const f of await readdir(new URL('../adapters/three/', import.meta.url))) {
    assert.doesNotMatch(await fuente(`adapters/three/${f}`), /rapier3d|@dimforge/, f);
  }
});

test('ningún archivo importa otro motor de la suite', async () => {
  for (const f of ['adapters/rapier/physics.js', 'adapters/three/index.js', 'src/system.js', 'src/index.js']) {
    assert.doesNotMatch(await fuente(f), /from 'threejs-(render|game|sprite|particle|material)-engine/, f);
  }
});

test('la tabla de help() y la API del mundo de física coinciden, en las dos direcciones', async () => {
  coinciden(miembros(await fuente('adapters/rapier/physics.js'), 'fisica'), PHYSICS_MEMBERS, 'fisica');
});

test('la tabla de help() y la API del cuerpo coinciden, en las dos direcciones', async () => {
  coinciden(miembros(await fuente('adapters/rapier/physics.js'), 'cuerpo'), BODY_MEMBERS, 'cuerpo');
});

test('la tabla de help() y la API del personaje coinciden, en las dos direcciones', async () => {
  coinciden(miembros(await fuente('adapters/rapier/physics.js'), 'personaje'), CHARACTER_MEMBERS, 'personaje');
});

test('la tabla de help() y la API de los enlaces coinciden, en las dos direcciones', async () => {
  coinciden(miembros(await fuente('adapters/three/index.js'), 'enlaces'), LINKS_MEMBERS, 'enlaces');
});

test('la tabla de help() y la API de la vista de depuración coinciden, en las dos direcciones', async () => {
  coinciden(miembros(await fuente('adapters/three/index.js'), 'vista'), DEBUG_VIEW_MEMBERS, 'vista');
});

test('la tabla de help() y la API del sistema del juego coinciden, en las dos direcciones', async () => {
  coinciden(miembros(await fuente('src/system.js'), 'sistema'), BODY_SYSTEM_MEMBERS, 'sistema');
});

test('la vista de depuración se marca para que render la deje afuera', async () => {
  const s = await fuente('adapters/three/index.js');
  for (const m of ['noEdge', 'noAO', 'noRender']) assert.match(s, new RegExp(`userData\\.${m} = true`));
});

test('help(): imprime la tabla con console.table y la devuelve', () => {
  const filas = help('x', [['a()', 'uno']], { print: false });
  assert.deepEqual(filas, [{ member: 'a()', description: 'uno' }]);
  assert.deepEqual(memberNames('ray(origin, direction, { max? })'), ['ray']);
  assert.deepEqual(memberNames('remove()  dispose()'), ['remove', 'dispose']);
});

test('package.json: los tres puntos de entrada, los peers opcionales y lo que hace falta para probar', async () => {
  const p = JSON.parse(await fuente('package.json'));
  assert.equal(p.version, '0.1.0-rc.1');
  assert.deepEqual(p.exports, { '.': './src/index.js', './rapier': './adapters/rapier/physics.js', './three': './adapters/three/index.js' });
  assert.equal(p.peerDependencies.three, '>=0.160.0');
  assert.equal(p.peerDependencies['@dimforge/rapier3d-compat'], '>=0.21.0');
  assert.ok(p.peerDependenciesMeta.three.optional && p.peerDependenciesMeta['@dimforge/rapier3d-compat'].optional);
  assert.equal(p.dependencies, undefined, 'sin dependencias de ejecución');
  assert.deepEqual(Object.keys(p.devDependencies).sort(), ['@dimforge/rapier3d-compat', 'three', 'typescript']);
});
