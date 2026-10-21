# Contribuir

Este motor se vendoriza en varias apps. La pregunta antes de cada cambio no es "¿le sirve a
la app que lo pidió?" sino "¿le sirve a cualquier app de three.js que necesite física?".

**Primero, [`POLITICA.md`](POLITICA.md):** qué entra, cómo se evalúa un pedido y qué puede pasar
con él. Un pedido de una app de casa pasa por el mismo filtro que uno de afuera.

## Cómo se pide algo

- **Un pedido:** un issue con la plantilla *Pedido*. Contá el problema, no solo la solución, y a
  qué otro tipo de app le serviría.
- **Un error:** un issue con la plantilla *Error*, con cómo reproducirlo (las definiciones en
  JSON y la secuencia de pasos: la física es determinista, así que se reproduce igual).
- **Un PR:** mejor después de un issue `aceptado`, para no hacer trabajo que no va a entrar. La
  plantilla del PR trae el checklist del contrato.

## Agnóstico: qué entra y qué no

- **Entra:** lo que cualquier app con física necesita, dicho como datos planos: cuerpos,
  colliders, personajes, sensores, grupos y materiales con nombre, avisos de contacto, rayos y
  consultas; y cómo se conecta con three y con la suite.
- **No entra:** la física propia (la hace Rapier), ni las reglas de un juego (sus valores, sus
  nombres): son definiciones y oyentes en la app.
- **Ningún motor de la suite se importa** (render, materiales, sprites, partículas, juego): se
  conectan desde la app con los puntos de extensión (`object3d` o algo con `.object`,
  `motor.overlay`, `motor.onFrame`, el `world` del juego por su forma).

## El contrato

1. **Una definición es datos:** `defineBody`, `defineCollider`, `defineCharacter` y
   `definePhysics` la validan y la normalizan; se guarda en JSON y se vuelve a pasar dando lo
   mismo, y `hashBody` da el mismo hash para el mismo cuerpo escrito distinto.
2. **Una clave que no existe es un error**, no un valor que se ignora, y **un error dice dónde**
   (`body.colliders[1].size[2]: va un número > 0 (vino -1)`, `body.colour: clave desconocida`).
3. **La física la hace Rapier.** El repo traduce (datos planos ↔ Rapier) y conecta; no escribe un
   solver ni integra nada a mano. Lo que simula se prueba con Rapier de verdad en Node.
4. **Determinista:** la misma secuencia de llamadas da lo mismo (Rapier lo es en la misma
   plataforma); una prueba lo exige.
5. **Cada adaptador importa solo lo suyo:** `src/` no importa three, Rapier ni el DOM;
   `adapters/rapier/` es lo único que importa Rapier (y lo carga a pedido, con `import()`);
   `adapters/three/` es lo único que importa three. Las pruebas lo frenan si pasa. Otro motor de
   física sería otro adaptador con la misma API.
6. **Cada miembro de la API tiene su línea en `src/members.js`** (una tabla por objeto: el mundo,
   el cuerpo, el personaje, los enlaces, la vista de depuración y el sistema del juego). Una prueba
   exige que cada tabla y su API coincidan, en las dos direcciones.
7. **Lo que se dibuja respeta a threejs-render-engine:** la vista de depuración se marca
   `userData.noEdge`, `noAO` y `noRender`.
8. **Sin dependencias de ejecución:** three (`>=0.160.0`, probado con 0.170.0) y
   `@dimforge/rapier3d-compat` (`>=0.21.0`, probado con 0.21.0) son *peers* opcionales. En
   `devDependencies` están los dos, con su versión exacta, y `typescript`.

## Las pruebas necesitan `npm install`

A diferencia de los otros motores de la suite, **las pruebas simulan de verdad**: necesitan Rapier
y three instalados (son `devDependencies`, no se commitea un lockfile).

```
npm install
npm test            # node --test: lo puro, el contrato, y la simulación con Rapier y three reales
npm run typecheck   # tsc estricto sobre src/ y adapters/rapier/ (JSDoc, sin build)
```

El CI hace lo mismo (`npm install` antes de `node --test` y de `tsc`).

## Cómo se agrega algo

La regla: **una feature entra primero al núcleo y después a los adaptadores.**

1. En `src/` (la definición en `body.js`, `shapes.js` o `character.js`, o un módulo nuevo), con su
   prueba en `test/`, en Node.
2. La traducción a Rapier en `adapters/rapier/physics.js` y, si se dibuja o toca three, en
   `adapters/three/index.js`, con su línea en `src/members.js` y su prueba con Rapier y three de
   verdad.
3. Probado a ojo en `examples/index.html`.
4. En el `CHANGELOG.md`, y si rompe algo, marcado **Ruptura** con cómo migrar (una clave que
   cambia de sentido rompe los niveles guardados).

El tipado se verifica con `npm run typecheck`, en modo estricto (cubre `src/` y el adaptador de
Rapier). Los tipos van en JSDoc: los archivos siguen siendo `.js` y no hay paso de build.

## Ramas, pre-releases y releases

**Hasta la 1.0, todo pasa por `test`.** `main` solo se actualiza para la 1.0 (y para la política del
repo y lo que no es código); mientras tanto no hay PR de `test` a `main` ni release sin `-rc`.

- **`test`** es la rama de trabajo y de lo que se prueba en una app. El trabajo se hace en ramas
  propias y se mergea a `test` (con merge commit, nunca squash: los tags tienen que seguir
  apuntando a commits de `test`).
- **Pre-release `vX.Y.Z-rc.N`** sobre un commit de `test`: es lo que una app vendoriza. Cada issue
  que entra suma un rc (`-rc.2`, `-rc.3`…), o abre la versión siguiente (`0.2.0-rc.1`).
- **La serie arranca en `0.1.0-rc.1`.**
- **1.0:** recién ahí `test` pasa a `main` (PR con merge commit), con su commit de release y
  `gh release create v1.0.0`.

### Publicar un pre-release

1. `package.json` dice la versión del rc (`0.1.0-rc.1`) y `CHANGELOG.md` tiene su entrada (lo que
   rompe, arriba de todo).
2. `test` apunta a ese commit.
3. ```bash
   gh release create v0.1.0-rc.1 --prerelease --target <sha completo> --title v0.1.0-rc.1 --notes-file <notas>
   ```
   `--target` necesita el SHA de 40 caracteres: con uno abreviado, GitHub contesta
   "target_commitish is invalid".
