// threejs-physics-engine, la parte pura: las definiciones como datos (cuerpos, colliders,
// personajes, grupos, materiales, las opciones de un mundo), sus validaciones con errores que
// dicen dónde, la matemática de rotaciones, lo que sirve para conectar con la suite (las medidas de
// un collider a partir de unos puntos, las líneas de la vista de depuración, el sistema para el
// mundo de threejs-game-engine) y las tablas de help(). Corre en Node y en el navegador: no sabe de
// Rapier ni de three.
//
// La física de verdad está en adapters/rapier/physics.js (lo único que importa Rapier) y lo de
// three en adapters/three/index.js (lo único que importa three).
export { defineBody, hashBody, colliderMasses, BODY_DEFAULTS, BODY_TYPES } from './body.js';
export { defineCollider, shapeVolume, SHAPES, COLLIDER_DEFAULTS, FIXED_ONLY } from './shapes.js';
export { defineCharacter, characterCollider, CHARACTER_DEFAULTS, CHARACTER_SHAPES } from './character.js';
export { defineGroups, groupBits, interactionGroups, canCollide, MAX_GROUPS, ALL_GROUPS } from './groups.js';
export { defineMaterials, resolveSurface, SURFACE_DEFAULTS, COMBINE_RULES } from './materials.js';
export { definePhysics, PHYSICS_DEFAULTS } from './options.js';
export { quatFromEuler, quatFromDegrees, eulerFromQuat, degreesFromQuat, yawFromQuat, normalizeQuat, multiplyQuat, rotateVec, lerpVec3, slerpQuat } from './math.js';
export { fitCollider, colliderFromBox, colliderFromSphere, boxFromPoints, FIT_SHAPES } from './fit.js';
export { colliderLines } from './wire.js';
export { convexHull, meshVolume, edgesOf } from './hull.js';
export { createClock } from './clock.js';
export { createListeners, matcher, EVENT_TYPES } from './events.js';
export { bodySystem } from './system.js';
export { stableStringify } from './valid.js';
export { help, memberNames } from './help.js';
export { PHYSICS_MEMBERS, BODY_MEMBERS, CHARACTER_MEMBERS, LINKS_MEMBERS, DEBUG_VIEW_MEMBERS, BODY_SYSTEM_MEMBERS } from './members.js';
