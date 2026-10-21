// Las tablas de help(): una línea por miembro, una tabla por objeto con API (el mundo de física,
// el cuerpo y el personaje del adaptador de Rapier; los enlaces y la vista de depuración del de
// three; el sistema del juego). Viven aparte (puras, sin three ni Rapier) para que la prueba en Node
// pueda compararlas con la API, leyendo el fuente, en las dos direcciones.

/** @type {import('./help.js').Member[]} */
export const PHYSICS_MEMBERS = [
  ['body(def)', "un cuerpo: { type: 'dynamic' | 'fixed' | 'kinematic', position, rotation, colliders, … } (defineBody); devuelve el cuerpo"],
  ['character(def)', "un personaje: { shape: 'capsule', radius, height, position, step, slope, snap, … } (defineCharacter); move() lo mueve sin atravesar nada"],
  ['remove(body)', 'sacar un cuerpo o un personaje del mundo (body.remove() hace lo mismo)'],
  ['bodies', 'los cuerpos que hay, con los de los personajes (una copia)'],
  ['characters', 'los personajes que hay (una copia)'],
  ['step(dt?)', 'avanza la simulación dt segundos (por defecto, timestep): con el juego, el paso fijo del juego; un dt más largo que maxDelta se parte en pasos iguales'],
  ['advance(dt)', 'para una app sin paso fijo: junta el dt del cuadro, da los pasos de timestep que entran (a lo sumo maxSteps) y devuelve alpha'],
  ['alpha', 'la fracción de paso que sobró en el último advance (de 0 a 1): para interpolar lo que se dibuja'],
  ['time  steps', 'el tiempo simulado (segundos) y cuántos step() se dieron'],
  ['onStep(fn)', 'algo que corre después de cada step: fn(dt); devuelve cómo sacarlo'],
  ['on(type, a?, b?, fn)', "un aviso: 'enter' / 'exit' (un sensor) o 'contact' / 'separate' (dos sólidos); a y b eligen los cuerpos (un cuerpo, un nombre, una función); fn(a, b, info); devuelve cómo sacarlo"],
  ['ray(origin, direction, { max?, groups?, exclude?, sensors? })', 'el primer cuerpo que toca el rayo: { body, point, normal, distance, collider } o null'],
  ['rayAll(origin, direction, { max?, groups?, exclude?, sensors? })', 'todos los que toca el rayo, del más cerca al más lejos'],
  ['overlap(shape, position, { rotation?, groups?, exclude?, sensors? })', "los cuerpos que se superponen con una forma ({ shape: 'sphere', radius: 2 }) puesta ahí"],
  ['closest(point, { groups?, exclude?, sensors? })', 'el punto de un cuerpo más cercano: { body, point, distance, inside } o null'],
  ['gravity', 'la gravedad [x, y, z] (se puede asignar)'],
  ['groups', 'los grupos de colisión con nombre (hasta 16)'],
  ['materials', 'los materiales de contacto con nombre'],
  ['define(def)', 'la definición completa y validada de un cuerpo (con los grupos y materiales de este mundo)'],
  ['stats()', 'qué hay: { bodies, colliders, sleeping, contacts, characters, steps, time }'],
  ['toJSON()', 'el mundo como datos: las opciones y cada cuerpo y personaje donde está ahora (createPhysics(json) lo vuelve a armar)'],
  ['raw', 'el World de Rapier: la escotilla; si lo usás, quedás atado a Rapier'],
  ['dispose()', 'soltar el mundo de Rapier (después no se puede usar)'],
  ['help()', 'esta tabla'],
];

/** @type {import('./help.js').Member[]} */
export const BODY_MEMBERS = [
  ['isBody', 'true: es un cuerpo (para reconocerlo sin importar nada)'],
  ['type', "'dynamic', 'fixed' o 'kinematic'"],
  ['name  userData', 'los de la definición'],
  ['def', 'la definición completa con la que se creó (defineBody)'],
  ['colliders', 'sus colliders, como definiciones (defineCollider)'],
  ['position', 'dónde está: [x, y, z] (una copia)'],
  ['rotation', 'cómo está girado: un cuaternión [x, y, z, w] (una copia)'],
  ['velocity', 'la velocidad lineal [x, y, z], en unidades por segundo'],
  ['angularVelocity', 'la velocidad angular [x, y, z], en radianes por segundo'],
  ['mass', 'su masa (la de los colliders, o la que dice mass)'],
  ['sleeping', '¿está dormido? (quieto: la física no lo calcula hasta que algo lo toca)'],
  ['removed', '¿ya se sacó del mundo?'],
  ['setPosition(position)', 'moverlo ahí (con la velocidad que tenga)'],
  ['setRotation(rotation)', 'girarlo (cuaternión o grados)'],
  ['teleport(position, rotation?)', 'ponerlo ahí, quieto: sin velocidad'],
  ['setVelocity(velocity)', 'su velocidad lineal'],
  ['setAngularVelocity(velocity)', 'su velocidad angular (radianes por segundo)'],
  ['applyImpulse(impulse, point?)', 'un golpe (cambia la velocidad ya); con point, en ese punto del mundo (lo hace girar)'],
  ['applyForce(force, point?)', 'una fuerza durante el próximo step (para empujar de a poco, llamarla en cada paso)'],
  ['applyTorqueImpulse(impulse)', 'un golpe de giro'],
  ['moveTo(position, rotation?)', 'solo kinematic: ir ahí en el próximo step (empuja a los dynamic en el camino)'],
  ['sleep()', 'dormirlo'],
  ['wake()', 'despertarlo'],
  ['toJSON()', 'su definición con cómo está ahora (posición, rotación, velocidades, dormido)'],
  ['raw', 'el RigidBody de Rapier: la escotilla; si lo usás, quedás atado a Rapier'],
  ['remove()  dispose()', 'sacarlo del mundo'],
  ['help()', 'esta tabla'],
];

/** @type {import('./help.js').Member[]} */
export const CHARACTER_MEMBERS = [
  ['isCharacter', 'true: es un personaje'],
  ['name  userData', 'los de la definición'],
  ['def', 'la definición completa (defineCharacter)'],
  ['body', 'su cuerpo kinematic (el que reciben los avisos de contacto y los rayos)'],
  ['position', "dónde está (los pies, con origin: 'feet'): [x, y, z]; después de move(), a donde va"],
  ['grounded', '¿está parado en el piso? (lo dice el último move)'],
  ['collisions', 'con qué chocó en el último move: [{ body, normal, point }]'],
  ['move(delta)', 'pedir un desplazamiento [x, y, z] (con la gravedad que ponga la app): lo corrige (paredes, escalones, pendientes) y devuelve { position, grounded, collisions, movement }; se mueve en el próximo step'],
  ['teleport(position)', 'ponerlo ahí, sin chocar con nada en el camino'],
  ['toJSON()', 'su definición con dónde está ahora'],
  ['raw', 'el KinematicCharacterController de Rapier: la escotilla; si lo usás, quedás atado a Rapier'],
  ['remove()  dispose()', 'sacarlo del mundo (con su cuerpo)'],
  ['help()', 'esta tabla'],
];

/** @type {import('./help.js').Member[]} */
export const LINKS_MEMBERS = [
  ['link(body, object, { interpolate?, rotation? })', 'enlazar un cuerpo (o un personaje) con un Object3D, o algo con .object (un sprite: su facing recibe la guiñada); devuelve el enlace'],
  ['unlink(bodyOrObject)', 'sacar el enlace de ese cuerpo u objeto'],
  ['sync(alpha?)', 'copiar posición y rotación de cada cuerpo a su objeto, interpolando entre los dos últimos pasos (alpha: la de fisica.advance, o la del juego)'],
  ['snap(body?)', 'que el próximo sync no interpole desde donde estaba (un teletransporte); sin cuerpo, todos'],
  ['links', 'los enlaces: [{ body, object }] (una copia)'],
  ['dispose()', 'sacar todos los enlaces y dejar de escuchar los pasos'],
  ['help()', 'esta tabla'],
];

/** @type {import('./help.js').Member[]} */
export const DEBUG_VIEW_MEMBERS = [
  ['object', 'el Object3D con las líneas: va a motor.overlay (threejs-render-engine) o a la escena; marcado noEdge, noAO y noRender'],
  ['update()', 'dibujar cada collider donde está ahora (agrega los cuerpos nuevos y saca los que ya no están)'],
  ['visible', 'prenderla y apagarla (se puede asignar)'],
  ['colors', 'los colores: { dynamic, fixed, kinematic, sensor, sleeping } (hex)'],
  ['dispose()', 'sacarla de la escena y soltar sus geometrías y materiales'],
  ['help()', 'esta tabla'],
];

/** @type {import('./help.js').Member[]} */
export const BODY_SYSTEM_MEMBERS = [
  ['of(entity)', 'el cuerpo (o el personaje) de una entidad'],
  ['entityOf(body)', 'la entidad de un cuerpo o personaje (para los avisos de contacto)'],
  ['size', 'cuántas entidades tienen cuerpo'],
  ['dispose()', 'sacar el sistema y los cuerpos que creó'],
  ['help()', 'esta tabla'],
];
