# threejs-physics-engine

Física para [three.js](https://threejs.org) con [Rapier](https://rapier.rs), escrita con datos
planos: cuerpos, colliders y personajes son **definiciones** validadas (como un material de
threejs-material-engine o un emisor de threejs-particle-engine), y lo que vuelve son arrays
`[x, y, z]`, no objetos de Rapier. Es un puente: Rapier hace toda la física, este repo la traduce,
la conecta con la suite y la aísla (el núcleo no sabe de Rapier).

```js
import { createPhysics } from 'threejs-physics-engine/rapier';
import { collidersFrom, createLinks, createDebugView } from 'threejs-physics-engine/three';

const fisica = await createPhysics({                       // la primera vez carga Rapier (a pedido)
  groups: ['escena', 'jugador', 'enemigo'],
  materials: { hielo: { friction: 0.02, frictionCombine: 'min' } },
});
fisica.body({ type: 'fixed', position: [0, -0.5, 0], colliders: { shape: 'box', size: [40, 1, 40], group: 'escena' } });
const caja = fisica.body({ position: [0, 4, 0], rotation: [0, 30, 0], colliders: collidersFrom(malla) });
const heroe = fisica.character({ radius: 0.3, height: 1.8, position: [2, 0, 0], step: 0.3, slope: 45 });
const zona = fisica.body({ type: 'fixed', position: [5, 1, 0], colliders: { shape: 'box', size: 2, sensor: true } });

fisica.on('enter', zona, heroe, () => abrirPuerta());                    // un sensor
fisica.on('contact', 'caja', (c, otro, { impulse }) => sonar(impulse)); // un golpe, con su impulso
const golpe = fisica.ray([0, 10, 0], [0, -1, 0]);                       // { body, point, normal, distance }

const enlaces = createLinks(fisica);
enlaces.link(caja, malla);                                               // la malla sigue a la caja
enlaces.link(heroe, capsula);
const depuracion = createDebugView(fisica);                              // los colliders, en líneas
escena.add(depuracion.object);                                           // o motor.overlay.add(…)

let vy = 0;
fisica.onStep((dt) => {                                                  // en cada paso fijo
  if (heroe.grounded && vy < 0) vy = 0;
  if (heroe.grounded && saltar) vy = 5;
  vy -= 9.81 * dt;
  heroe.move([vx * dt, vy * dt, vz * dt]);                               // no atraviesa, sube escalones, se desliza
});
renderer.setAnimationLoop(() => {
  fisica.advance(reloj.getDelta());                                      // los pasos de 1/60 que entran
  enlaces.sync();                                                        // interpolado entre los dos últimos pasos
  depuracion.update();
  renderer.render(escena, camara);
});
fisica.help();                                                           // todo lo que hay (y caja.help(), heroe.help()…)
```

- **Cuerpos como datos** (`defineBody`): `type` (`'dynamic'`, `'fixed'`, `'kinematic'`),
  `position`, `rotation`, `linearVelocity`, `angularVelocity` (radianes por segundo),
  `gravityScale`, `linearDamping`, `angularDamping`, `ccd` (para lo rápido), `lockRotation` y
  `lockPosition` (`true` o `[x, y, z]`: un personaje dinámico que no se cae, un juego 2.5D),
  `sleeping`, `canSleep`, `mass` (la total, repartida por volumen entre los colliders; sin ella,
  sale de su densidad), `colliders`, `name` y `userData` (datos: se guarda en JSON).
- **Colliders** (`defineCollider`): `box` (`size`, las medidas enteras), `sphere` (`radius`),
  `capsule` (`radius`, `height`: **la altura total**, con las tapas), `cylinder` y `cone`
  (`radius`, `height`, a lo largo de y), `convex` (`points`: la envolvente), `mesh` (`vertices`,
  `indices`) y `heightfield` (`heights` en filas a lo largo de z y columnas a lo largo de x,
  `size`); estos dos, solo en un cuerpo `fixed`. Cada uno con `offset`, `rotation`, `density` o
  `mass`, `friction`, `restitution`, `material`, `sensor`, `group` y `collidesWith`.
- **Validados, con errores que dicen dónde**: `body.colliders[1].size[2]: va un número > 0 (vino
  -1)`, `body.colour: clave desconocida (van type, position, …)`, `body.colliders[0].radius: no va
  con shape 'box' (van size; …)`, `body.colliders[0].group: grupo desconocido lava (van jugador,
  pared)`. Los atajos se normalizan (`colliders: 'sphere'`, un collider sin array, `size: 2`,
  puntos de a tres o planos, grados o cuaternión), lo normalizado se guarda en JSON y se vuelve a
  pasar dando lo mismo, y `hashBody` da el mismo hash para el mismo cuerpo escrito distinto.
- **Grupos de colisión con nombre** (hasta 16, los de Rapier): `group: 'jugador'`,
  `collidesWith: ['pared', 'enemigo']`; sin decir, de todos y con todos. El núcleo arma las
  máscaras de bits (`interactionGroups`, puro y probado).
- **Materiales de contacto con nombre**: `materials: { hielo: { friction: 0.02, frictionCombine:
  'min' }, goma: { restitution: 0.9, restitutionCombine: 'max' } }` y el collider dice
  `material: 'hielo'` (lo que diga él mismo pisa lo del material).
- **El personaje** (`fisica.character`): el controlador de personaje de Rapier, con `step` (la
  altura de escalón que sube), `slope` (la pendiente máxima, en grados), `snap` (pegarse al piso
  al bajar), `slide`, `push` (empuja cajas), `offset` (la piel). `move(desplazamiento)` devuelve
  `{ position, grounded, collisions, movement }`: el movimiento corregido, que no atraviesa
  paredes, sube escalones y se desliza.
- **Avisos**: `on('enter' | 'exit', a?, b?, fn)` para los sensores y `on('contact' | 'separate',
  …)` para los choques, con la normal, el punto y el impulso. Cada lado se elige con un cuerpo, un
  personaje, un nombre, una función o una lista, y `fn` recibe **los cuerpos nuestros**.
- **Consultas**: `ray`, `rayAll`, `overlap(forma, posición)` y `closest(punto)`, con `groups`,
  `exclude` y `sensors`. Ven lo último: un cuerpo recién creado o movido ya aparece.
- **Determinista**: la misma secuencia de llamadas da lo mismo (Rapier lo es; una prueba lo exige).
  `fisica.toJSON()` guarda el mundo con cada cuerpo donde está, y `createPhysics(json)` lo vuelve a
  armar (un nivel, una partida).
- **La escotilla**: `fisica.raw`, `cuerpo.raw` y `personaje.raw` son los objetos de Rapier
  (`loadRapier()` da el módulo). Si los usás, quedás atado a Rapier.
- **Sin build**, módulos ES. **El núcleo es puro**: `src/` no importa three, Rapier ni el DOM.
  Rapier está solo en `adapters/rapier/` y three solo en `adapters/three/`, los dos como *peers*
  opcionales.

## Decisiones

- **La rotación se guarda como cuaternión `[x, y, z, w]`** (lo de Rapier, lo que se interpola sin
  sorpresas, lo de threejs-particle-engine). Tres números son el atajo en **grados** `[rx, ry, rz]`
  (orden XYZ, el de three; como los grados de threejs-render-engine): cuatro números son un
  cuaternión, tres son grados, sin ambigüedad. `cuerpo.rotation` siempre devuelve el cuaternión.
- **`height` es la altura total** en la cápsula, el cilindro y el cono: es lo que se mide de un
  personaje y lo que da la caja de un objeto. El adaptador hace la cuenta de Rapier (la mitad del
  cilindro del medio).
- **El personaje tiene los pies en `position`** (`origin: 'feet'`, el anchor de un sprite de
  threejs-sprite-engine): parado, `position[1]` es la altura del piso. `origin: 'center'` lo pone
  en el centro.
- **`step(dt)` da un paso de Rapier de exactamente `dt`** (con el juego, el paso fijo es del
  juego: la física no acumula por su cuenta). Un `dt` más largo que `maxDelta` (1/30) se parte en
  pasos iguales. Sin juego, **`advance(dtDelCuadro)`** junta el tiempo, da pasos de `timestep`
  (1/60, a lo sumo `maxSteps` por cuadro) y deja `alpha` para interpolar.
- **`applyForce` dura un paso** (Rapier las deja puestas hasta que se sacan): para empujar de a
  poco, se llama en cada paso.
- **Las consultas ven lo último**: Rapier arma sus estructuras de búsqueda en cada paso, así que
  antes de una consulta, si algo cambió, el adaptador da un paso de 1e-9 s (con 0, Rapier las
  rompe si algo se movió a mano), con los kinematic quietos para que no salgan disparados hacia
  su destino.
- **El personaje se mueve en dos pasadas** (lo horizontal y después lo vertical): con las dos
  juntas, el controlador de Rapier a veces frena todo un paso cuando lo vertical empuja contra el
  piso (la gravedad de cada paso). Así camina parejo, y una prueba lo exige.
- **Los sensores ven a los kinematic** (un personaje entrando a una zona fija), que Rapier por
  defecto no mira. **Los sólidos avisan recién cuando hay un oyente** de `'contact'` o
  `'separate'`: antes no se les prende `COLLISION_EVENTS`.
- **La vista de depuración dibuja desde las definiciones** (src/wire.js), no desde Rapier: el
  adaptador de three no importa Rapier y sirve igual con otro motor de física. Es un objeto con
  `.object` (como un sprite o un emisor de la suite), no un `Object3D` con métodos colgados.

## El personaje, paso a paso

El controlador no tiene gravedad: la pone la app, en el desplazamiento de cada paso.

```js
const heroe = fisica.character({ radius: 0.3, height: 1.8, step: 0.3, slope: 45, snap: 0.2 });
let vy = 0;
function paso(dt) {                       // en el paso fijo (onStep, o un sistema del juego)
  if (heroe.grounded && vy < 0) vy = 0;   // en el piso, sin acumular caída
  if (heroe.grounded && saltar) vy = 5;
  vy -= 9.81 * dt;
  const { grounded, collisions } = heroe.move([vx * dt, vy * dt, vz * dt]);
  // collisions: [{ body, normal, point }] con lo que chocó en este movimiento
}
```

`move` se puede llamar más de una vez antes del `step` (se suma lo pedido); el cuerpo llega en el
próximo paso, y `position` ya dice a dónde va. `teleport(posición)` lo pone en un lugar sin chocar
con nada en el camino.

## Estructura

```
src/
  body.js          defineBody (validar y normalizar), hashBody, colliderMasses
  shapes.js        defineCollider: las formas y sus medidas, shapeVolume
  character.js     defineCharacter, characterCollider (la forma con los pies en el origen)
  groups.js        defineGroups, interactionGroups, canCollide: los grupos con nombre → bits de Rapier
  materials.js     defineMaterials, resolveSurface: los materiales de contacto
  options.js       definePhysics: las opciones de un mundo (y lo que guarda toJSON)
  math.js          cuaterniones, grados, Euler en radianes (los del juego), slerp
  fit.js           fitCollider, colliderFromBox, colliderFromSphere: las medidas de un collider
  wire.js          colliderLines: las líneas de la vista de depuración, de la definición
  hull.js          la envolvente convexa (validar 'convex', su volumen, sus aristas)
  clock.js         createClock: el paso fijo de advance
  events.js        createListeners: quién escucha qué aviso, y en qué orden van los cuerpos
  system.js        bodySystem: la física como un sistema del mundo de threejs-game-engine
  help.js, members.js
adapters/rapier/
  physics.js       createPhysics, loadRapier: lo único que importa Rapier (a pedido)
adapters/three/
  index.js         collidersFrom, createLinks, createDebugView: lo único que importa three
examples/          una escena: cajas y pelotas, un personaje con WASD, un escalón, una pared y un sensor
test/              las pruebas, en Node, con Rapier y three de verdad
```

## Usarlo, sin build

```html
<script type="importmap">
  { "imports": {
      "three": "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js",
      "@dimforge/rapier3d-compat": "https://cdn.jsdelivr.net/npm/@dimforge/rapier3d-compat@0.21.0/dist/rapier.mjs",
      "threejs-physics-engine": "./vendor/threejs-physics-engine/src/index.js",
      "threejs-physics-engine/rapier": "./vendor/threejs-physics-engine/adapters/rapier/physics.js",
      "threejs-physics-engine/three": "./vendor/threejs-physics-engine/adapters/three/index.js" } }
</script>
```

El `rapier.mjs` de `rapier3d-compat` trae el wasm adentro (en base64): no hay otro archivo que
servir. Rapier se carga la primera vez que se llama a `createPhysics`, así que una app que no hace
física no lo necesita en su importmap. Los dos son *peers* opcionales: three `>=0.160.0` (probado
con 0.170.0) y `@dimforge/rapier3d-compat` `>=0.21.0` (probado con 0.21.0). El núcleo
(`threejs-physics-engine`, `src/index.js`) no necesita ninguno: sirve en un servidor o en un
editor de niveles para validar y guardar definiciones.

## Con threejs-render-engine y los otros motores

El motor no importa a ningún otro motor de la suite: la app los conecta.

```js
import { createEngine } from 'threejs-render-engine';
import { createGame } from 'threejs-game-engine/three';
import { createPhysics } from 'threejs-physics-engine/rapier';
import { bodySystem } from 'threejs-physics-engine';
import { collidersFrom, createDebugView } from 'threejs-physics-engine/three';

const motor = createEngine(document.body, { preset: 'warm' });
const juego = createGame({ engine: motor, bindings: CONTROLES });
const fisica = await createPhysics({ groups: ['escena', 'jugador'] });
const sistema = bodySystem(juego.world, fisica);        // un sistema de fase 'fixed' (order 100)

// una entidad con `body` (datos: se guarda con la partida) o `character`
juego.world.add({ object3d: malla, transform: { position: [0, 4, 0], rotation: [0, 0, 0] }, body: { colliders: collidersFrom(malla) } });
const heroe = juego.world.add({ object3d: sprite, transform: { position: [0, 0, 3] }, character: { radius: 0.3, height: 1.4 } });

let vy = 0;
juego.world.system('caminar', (dt) => {                 // order 0: antes que la física
  const [x, y] = juego.input.axis2('mover');
  const p = sistema.of(heroe);
  if (p.grounded && vy < 0) vy = 0;
  if (p.grounded && juego.input.justPressed('saltar')) vy = 5;
  vy -= 9.81 * dt;
  p.move([x * 4 * dt, vy * dt, -y * 4 * dt]);
});
fisica.on('enter', 'moneda', (m, quien) => { if (sistema.entityOf(quien) === heroe) juntar(m); });

const depuracion = createDebugView(fisica);
motor.overlay.add(depuracion.object);                   // encima de todo, fuera del post-proceso
motor.onFrame(() => depuracion.update());
juego.start();
```

- **threejs-game-engine**: `bodySystem(world, fisica)` registra un sistema de fase `'fixed'`: los
  `kinematic` van a donde dice su `transform` (`moveTo`), corre `fisica.step(dt)` con el paso fijo
  del juego, y deja en el `transform` de los `dynamic` y de los personajes dónde los puso la física
  (la rotación, en los radianes de Euler XYZ del juego). El juego los dibuja interpolados. Un
  componente `body` o `character` es una definición (datos: `world.toJSON()` lo guarda con la
  partida y al cargar nace donde estaba) o un cuerpo ya hecho con `fisica.body()` (ese es de la
  app: el sistema no lo saca al sacar la entidad). `sistema.of(entidad)` da el cuerpo y
  `sistema.entityOf(cuerpo)`, la entidad (para los avisos). No importa el juego: recibe su
  `world` por la forma (`system`, `query`, `onAdd`, `onRemove`, `set`).
- **threejs-render-engine**: la vista de depuración va en `motor.overlay` (encima de todo y fuera
  del post-proceso) y se marca `userData.noEdge`, `noAO` y `noRender`: no sale en las aristas, la
  oclusión ni el render final. Sin el juego, `motor.onFrame((dt) => { fisica.advance(dt);
  enlaces.sync(); })`.
- **threejs-sprite-engine**: `collidersFrom(sprite, { shape: 'capsule' })` arma la cápsula con el
  ancho y el alto del cuadro, con los pies en el pivote (mejor antes del primer `update`, con el
  billboard sin girar). `enlaces.link(cuerpo, sprite)` pasa la guiñada del cuerpo a `sprite.facing`
  y no gira el objeto (el sprite se orienta solo hacia la cámara), como hace el juego.
- **threejs-particle-engine**: un aviso es donde se larga un efecto — `fisica.on('contact', (a, b,
  { point, impulse }) => { if (impulse > 5) { chispas.position = point; chispas.burst(20); } })`.

| | |
|---|---|
| `fisica.step(dt)` | con el juego: el paso fijo es del juego (`bodySystem` lo llama) |
| `fisica.advance(dt)` + `alpha` | sin el juego: el paso fijo de la física, y cuánto interpolar |
| `fisica.onStep(fn)` | algo que corre después de cada paso (mover el personaje, los enlaces) |
| `collidersFrom(objeto)` | colliders de un `Object3D` o de algo con `.object` (un sprite) |
| `createLinks(fisica)` | cuerpos que mueven objetos, con interpolación y `facing` para sprites |
| `createDebugView(fisica).object` | va a `motor.overlay` o a la escena |
| `userData` | los datos de la app en cada cuerpo (se guardan en JSON) |

## Lo que todavía no hace

- **Articulaciones** (joints): bisagra, resorte, cuerda, motores. Hoy, por la escotilla
  (`fisica.raw.createImpulseJoint(…)` con `loadRapier()`).
- **Ragdolls** (salen de las articulaciones) y **vehículos** (el `DynamicRayCastVehicleController`
  de Rapier).
- **Otro motor de física** (Jolt) como segundo adaptador, con la misma API: el núcleo y el
  adaptador de three ya no dependen de Rapier.
- **Cuerpos que cambian de tipo o de colliders** después de creados (hoy se saca y se crea otro),
  y `setEnabled` para apagar uno sin sacarlo.
- **Formas compuestas desde un modelo** (una malla por hijo, `convexDecomposition`):
  `collidersFrom` da hoy un collider por objeto (la caja, la esfera, la cápsula, la envolvente o
  los triángulos de todo lo que cuelga de él).
- **Física de fluidos o telas**: fuera de alcance.
- Mientras tanto: la interpolación del juego mezcla los ángulos de Euler eje por eje (para un
  cuerpo que da vueltas en varios ejes a la vez, a 60 Hz no se nota; `createLinks` interpola con
  cuaterniones). Una partida cargada con `toJSON` arranca sin los contactos de antes (Rapier no
  guarda su estado interno en JSON): no sigue bit a bit igual que si no se hubiera guardado.

## Pruebas

```
npm install         # Rapier, three y typescript (devDependencies): las pruebas simulan de verdad
npm test            # node --test: lo puro, el contrato y la simulación con Rapier y three reales
npm run typecheck   # tsc estricto sobre src/ y adapters/rapier/ (JSDoc, sin build)
```

Lo que dibuja se prueba a ojo en `examples/index.html` (por HTTP: `python3 -m http.server` en la
raíz del repo y abrir `/examples/`).

## Contribuir

El motor es agnóstico: no entra la regla de un juego, entra la herramienta que resuelve esa clase
de problema para cualquier app. Qué entra y cómo se evalúa un pedido está en
[`POLITICA.md`](POLITICA.md); cómo se contribuye, en [`CONTRIBUTING.md`](CONTRIBUTING.md).

## Licencia

MIT
