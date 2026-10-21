# Política del repositorio

Este repo es un **módulo vendorizable** y **open source** (MIT): varias apps lo copian tal cual
y cualquiera puede usarlo, pedir cambios o contribuir. Esta política dice qué entra y cómo se
decide. Vale igual para un pedido de afuera y para uno de una app de casa: el que pide no
cambia la respuesta.

Todo es común a los módulos vendorizables salvo la última sección, **En este repo**, que es lo
único que cambia de un repo a otro.

## El principio

**No hacemos cambios con una utilidad específica: hacemos una herramienta específica para un
abanico de posibilidades.**

Un pedido nace casi siempre de una app concreta, y está bien que sea así. Pero lo que entra al
módulo no es la solución de esa app sino la herramienta que resuelve esa clase de problema para
cualquier app. Si no se puede generalizar, queda en la app.

## El filtro

Cada pedido (issue o PR) pasa por estas preguntas, en orden. La primera que corta decide.

1. **¿Qué problema resuelve?** El pedido se lee por la necesidad, no por la solución que trae.
   "Quiero un botón de vista frontal para mis placas" es, de fondo, "vistas con nombre y
   encuadre".
2. **¿Ya se puede?** Si la app lo resuelve con la API que hay, con un preset o con un punto de
   extensión, no hace falta cambiar el módulo: se responde con el cómo.
3. **¿A quién más le sirve?** Tiene que servirle al menos a dos tipos de app distintos, no a dos
   pantallas de la misma. Si el único caso es el de quien lo pide, no entra tal cual.
4. **¿Se puede generalizar?** Si la necesidad de fondo es general aunque el pedido no lo sea, se
   reescribe como herramienta general y entra así.
5. **¿Respeta el contrato del repo?** El de **En este repo**: forma de la API, módulos puros,
   dependencias, compatibilidad.

Ante la duda, se prefiere **un punto de extensión a una función nueva**: una marca que el módulo
respeta, una opción, un aviso (`on…`), un preset. Le deja a la app hacer lo suyo sin que lo suyo
entre al módulo.

## Qué puede pasar con un pedido

Cada pedido nuevo entra con la etiqueta `triage` y sale con una de estas:

| Etiqueta | Qué quiere decir | Qué pasa |
|---|---|---|
| `aceptado` | pasa el filtro tal cual | queda abierto hasta que se implementa |
| `generalizar` | la necesidad sirve, el pedido es muy puntual | se reescribe en el issue como herramienta general; con eso pasa a `aceptado` |
| `sin-cambios` | ya se puede con lo que hay | se cierra con el cómo (API, preset o extensión) |
| `fuera-de-alcance` | es de la app, no del módulo | se cierra con por qué y dónde resolverlo |

Ningún pedido se cierra sin una explicación. Un "no" dice siempre por qué y qué hacer en cambio.

Aparte, `error` marca lo que el módulo promete y no cumple. Un error no pasa por el filtro, salvo
que sea un pedido disfrazado: si "no anda" quiere decir "no hace lo que mi app necesita", es un
pedido.

Las etiquetas están en `.github/labels.json` y se crean solas en GitHub (`.github/workflows/labels.yml`).

## Vendorizar

- Se copia el módulo **tal cual**, en una versión publicada.
- **La copia no se edita.** Si una app necesita un cambio, vuelve acá como issue y pasa por el
  filtro. Una copia con parches propios deja de poder actualizarse.
- Lo que la app agrega va en la app, usando la API y los puntos de extensión.

## Versiones y compatibilidad

- [Semver](https://semver.org/lang/es/). Mientras sea 0.x, una versión menor puede romper; un
  parche nunca.
- Toda ruptura va en el `CHANGELOG.md` marcada **Ruptura**, con qué cambia y cómo migrar.
- Cuando se puede, lo viejo sigue andando una versión más, con un aviso en la consola.

## Dependencias

- Ninguna dependencia propia sin justificarla en el issue: cada una es una dependencia más para
  cada app que vendoriza el módulo.
- Las pesadas se cargan a pedido, para que una app que no las usa no las necesite.

## Open source

- Licencia MIT ([`LICENSE`](LICENSE)). Lo que se contribuye entra bajo la misma licencia.
- Convivencia: [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md).
- Problemas de seguridad: [`SECURITY.md`](SECURITY.md), en privado.
- Cómo se contribuye: [`CONTRIBUTING.md`](CONTRIBUTING.md).
- **Idioma:** el repo está en castellano (código, documentación, issues). Un issue en otro idioma
  se acepta y se responde.

## En este repo

**threejs-physics-engine:** física para three.js con Rapier, con datos planos. Un puente entre
Rapier y la suite.

**La pregunta:** ¿le sirve a cualquier app de three.js que necesite física (un juego, un
configurador que apila piezas, una visualización que deja caer cosas)?

- **Entra:** la definición de un cuerpo, un collider y un personaje como datos (validada, con
  errores que dicen dónde, que se guarda en JSON), los grupos de colisión y los materiales de
  contacto con nombre, la traducción a Rapier (cuerpos, colliders, sensores, el controlador de
  personaje, avisos de contacto, rayos y consultas), y lo que conecta con la suite sin importarla:
  colliders a partir de un `Object3D`, cuerpos enlazados con objetos, la vista de depuración y el
  sistema para el mundo de entidades de threejs-game-engine.
- **No entra:** la física propia (la hace Rapier: este repo no escribe un solver), las reglas de
  un juego (cuánto salta un personaje, qué gravedad tiene un nivel, qué hace una moneda al
  tocarla: eso es una definición o un oyente en la app), cómo se ve la escena (es de
  threejs-render-engine), ni importar otro motor de la suite: se conectan desde la app.
- **El núcleo no sabe de Rapier.** `src/` es puro (datos, validación, matemática) y Rapier entra
  solo en `adapters/rapier/`; three, solo en `adapters/three/`. El día que haga falta otro motor de
  física (Jolt), es otro adaptador con la misma API y la app no cambia. Una feature que solo existe
  en Rapier entra por la escotilla (`raw`), no como API.
- **Lo pesado se carga a pedido:** Rapier se importa la primera vez que se crea un mundo; una app
  que no hace física no lo necesita en su importmap.
- **Puntos de extensión que ya hay:** las definiciones (`defineBody`, `defineCharacter`, los
  `groups` y `materials` del mundo), los avisos (`on('enter' | 'exit' | 'contact' | 'separate', a,
  b, fn)`), `onStep(fn)`, las consultas (`ray`, `rayAll`, `overlap`, `closest`), `userData` (datos
  de la app en cada cuerpo), `createLinks` y `createDebugView` (el adaptador de three habla con el
  mundo por su forma), `bodySystem` (el mundo del juego, por su forma) y `raw` (Rapier, si la app
  acepta quedar atada a él).
- **Una feature entra primero al núcleo y después a los adaptadores**, con su prueba en Node (con
  Rapier de verdad si simula) y su línea en `help()`.
- **El contrato** (el técnico, con sus pruebas) está en [`CONTRIBUTING.md`](CONTRIBUTING.md).
