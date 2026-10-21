## Qué cambia y por qué

<!-- Qué problema resuelve, para qué tipo de apps. -->

Cierra #

## Política

- [ ] Viene de un issue `aceptado` (o es un error).
- [ ] Es una herramienta general, no la regla de un juego ([POLITICA.md](../POLITICA.md)).
- [ ] Si alcanzaba con un punto de extensión (una definición, un aviso con `on`, `onStep`, `userData`, `raw`), es eso y no una función nueva.

## Contrato

- [ ] Entró primero al núcleo (`src/`), con su prueba en Node, y después a los adaptadores.
- [ ] Una clave nueva de una definición se valida (`defineBody`, `defineCollider`, `defineCharacter`, `definePhysics`), con un error que dice dónde, y lo normalizado se puede volver a pasar (JSON de ida y vuelta).
- [ ] La física la hace Rapier: no se escribió física propia. Si simula, tiene su prueba con Rapier de verdad (`test/physics.test.mjs`, `test/character.test.mjs`).
- [ ] Sigue siendo determinista: la misma secuencia de llamadas da lo mismo.
- [ ] Cada miembro nuevo de la API tiene su línea en `src/members.js`.
- [ ] `src/` no importa three, Rapier ni el DOM; `adapters/rapier/` no importa three; `adapters/three/` no importa Rapier; ninguno importa otro motor de la suite.
- [ ] Ninguna dependencia nueva, o está justificada en el issue.
- [ ] Lo que andaba sigue andando (y las definiciones guardadas también), o va en el `CHANGELOG.md` como **Ruptura** con cómo migrar.
- [ ] `npm install`, `npm test` y `npm run typecheck` pasan, y lo que dibuja está probado a ojo en `examples/index.html`.
