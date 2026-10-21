# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/). Versiones
según [SemVer](https://semver.org): mientras sea `0.x`, una versión menor puede romper algo,
y si rompe queda dicho arriba de todo en esa entrada. Los pre-releases (`-rc.N`) se prueban
en una app antes del release (ver `CONTRIBUTING.md`).

## [0.1.0-rc.1] - 2026-10-21

Primera versión.

### Agregado

- **Cuerpos como datos** (`defineBody`): `type` (`dynamic`, `fixed`, `kinematic`), `position`,
  `rotation` (cuaternión `[x, y, z, w]`, o el atajo en grados `[rx, ry, rz]` orden XYZ),
  velocidades, `gravityScale`, amortiguación, `ccd`, `lockRotation` y `lockPosition` (`true` o por
  eje), `sleeping`, `canSleep`, `mass` (repartida por volumen entre los colliders), `colliders`,
  `name` y `userData` (datos). Validados con errores que dicen dónde, una clave desconocida es un
  error, los atajos se normalizan, lo normalizado vuelve igual por JSON y `hashBody` no depende de
  cómo se escribió.
- **Colliders** (`defineCollider`): `box`, `sphere`, `capsule` (con `height` total), `cylinder`,
  `cone`, `convex`, `mesh` y `heightfield` (estos dos, solo en cuerpos `fixed`), con `offset`,
  `rotation`, `density` o `mass`, `friction`, `restitution`, reglas para combinar, `material`,
  `sensor`, `group` y `collidesWith`.
- **Grupos de colisión con nombre** (hasta 16) → las máscaras de bits de Rapier, puras
  (`defineGroups`, `groupBits`, `interactionGroups`, `canCollide`).
- **Materiales de contacto con nombre** (`defineMaterials`, `resolveSurface`): fricción,
  restitución, densidad y cómo se combinan dos superficies.
- **Personajes** (`defineCharacter`): cápsula, esfera, caja o cilindro, con los pies en `position`
  (`origin: 'feet'`), `step`, `stepWidth`, `slope`, `snap`, `offset`, `slide`, `push`, `up`, grupos.
- **El mundo de física sobre Rapier** (`createPhysics`, en `threejs-physics-engine/rapier`): carga
  `@dimforge/rapier3d-compat` a pedido (0.21.0) y da `body`, `character`, `remove`, `step(dt)` (un
  paso de exactamente dt, partido si pasa de `maxDelta`), `advance(dt)` + `alpha` (el paso fijo
  para una app sin juego), `onStep`, los avisos `on('enter' | 'exit' | 'contact' | 'separate', a?,
  b?, fn)` con los cuerpos propios (y la normal, el punto y el impulso del contacto), `ray`,
  `rayAll`, `overlap`, `closest`, `gravity`, `stats()`, `toJSON()` (que `createPhysics` vuelve a
  armar), `dispose()`, `help()` y la escotilla `raw`.
- **El cuerpo**: `position`, `rotation`, `velocity`, `angularVelocity`, `mass`, `sleeping`,
  `setPosition`, `setRotation`, `teleport`, `setVelocity`, `setAngularVelocity`, `applyImpulse`
  (con punto), `applyForce` (por un paso), `applyTorqueImpulse`, `moveTo` (kinematic), `sleep`,
  `wake`, `toJSON`, `remove`, `help()`, `raw`.
- **El personaje**: `move(desplazamiento)` → `{ position, grounded, collisions, movement }` (no
  atraviesa paredes, sube escalones, no sube lo empinado, se desliza, se pega al piso, empuja
  cajas), `teleport`, `grounded`, `collisions`, `body`, `toJSON`, `remove`, `help()`, `raw`.
- **El adaptador de three** (`threejs-physics-engine/three`): `collidersFrom(objeto, { shape })`
  (caja, esfera, cápsula, envolvente o triángulos, en el espacio del objeto y con su escala; sirve
  con el `.object` de un sprite), `createLinks(fisica)` (`link`, `unlink`, `sync(alpha)` con
  interpolación, `snap`, `facing` para sprites, el espacio del padre) y `createDebugView(fisica)`
  (las líneas de cada collider, marcadas `noEdge`, `noAO` y `noRender`).
- **El sistema para threejs-game-engine** (`bodySystem(world, fisica)`, puro, sin importar el
  juego): componentes `body` y `character` (datos o ya hechos), el paso fijo del juego, kinematic
  desde el `transform`, y el `transform` de los dynamic y los personajes desde la física.
- En el núcleo: las rotaciones (`quatFromDegrees`, `eulerFromQuat`, `slerpQuat`…), las medidas de
  un collider a partir de unos puntos, una caja o una esfera (`fitCollider`, `colliderFromBox`,
  `colliderFromSphere`), `colliderLines`, `convexHull`, `createClock`, `createListeners` y las
  tablas de `help()`.
- Las pruebas simulan con Rapier y three de verdad en Node (`npm install` antes de `npm test`), y
  el contrato (núcleo puro, cada adaptador con lo suyo, `help()` contra la API en las dos
  direcciones) se lee del fuente.
- `examples/index.html`: cajas y pelotas que caen y rebotan, un personaje con WASD que sube un
  escalón y no otro, una pared, una rampa, hielo, un sensor que cambia de color y la vista de
  depuración.
- La política del repo (`POLITICA.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`,
  `.github/`), como en los otros motores de la suite.
