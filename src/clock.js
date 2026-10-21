// El paso fijo, para una app que no tiene uno: `fisica.advance(dtDelCuadro)` junta el tiempo de los
// cuadros y da los pasos fijos que entran (a lo sumo `maxSteps`: con un cuadro muy lento descarta
// el resto en vez de entrar en la espiral de la muerte), y deja `alpha`, la fracción de paso que
// sobró, para interpolar lo que se dibuja entre los dos últimos pasos. Es la misma cuenta que el
// loop de threejs-game-engine: con el juego, el paso fijo es del juego y la física solo hace
// `step(dt)`.
//
// Puro: no importa three, Rapier ni el DOM.
import { positivo, entero, num } from './valid.js';

/**
 * @param {{ step?: number, maxSteps?: number }} [opts]
 */
export function createClock({ step = 1 / 60, maxSteps = 5 } = {}) {
  positivo(step, 'clock.step');
  entero(maxSteps, 'clock.maxSteps', 1);
  let acumulado = 0, alpha = 0, descartados = 0;
  return {
    /** El largo de cada paso fijo. */
    get step() { return step; },
    /** La fracción de paso que sobró en el último advance (de 0 a 1): para interpolar. */
    get alpha() { return alpha; },
    /** Cuántos pasos se descartaron por cuadros lentos. */
    get dropped() { return descartados; },
    /**
     * Junta dt y llama a `fn(step)` por cada paso fijo que entra. Devuelve cuántos pasos dio.
     * @param {number} dt @param {(step: number) => void} fn
     */
    advance(dt, fn) {
      num(dt, 'advance(dt)', 0);
      acumulado += dt;
      let n = 0;
      while (acumulado >= step * (1 - 1e-9) && n < maxSteps) {
        fn(step);
        acumulado = Math.max(0, acumulado - step);
        n++;
      }
      if (acumulado >= step) {
        const sobran = Math.floor(acumulado / step);
        descartados += sobran;
        acumulado -= sobran * step;
      }
      alpha = Math.min(1, acumulado / step);
      return n;
    },
    /** Vuelve a cero (sin tiempo juntado). */
    reset() { acumulado = 0; alpha = 0; },
  };
}
