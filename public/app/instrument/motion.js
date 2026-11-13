/**
 * motion.js - the few cross-fades of DESIGN.md section 10, as numbers.
 *
 * A tween follows one discrete value (which bezel word is lit, how many beads
 * are lit, which glyphs are shown). When the value changes, `follow` answers
 * { from, to, mix } with mix running 0 -> 1 over the duration, LINEARLY: these
 * are fades of light, not movements. Nothing here ever repeats: a tween runs
 * once per change, so nothing can blink or pulse.
 *
 * Reduced motion, a frozen instant, or a change that arrives while the last
 * one is still fading (a level too fast to fade) all make the change a cut.
 */

/** Durations in ms (DESIGN.md section 10). */
export const FADE = Object.freeze({ threshold: 600, bead: 400, glyph: 120, zoom: 320, screen: 240, mode: 200 });

export const prefersReducedMotion = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/** Ease-in-out for movements (the zoom); fades stay linear. */
export const easeInOut = (x) => (x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2);

/**
 * @param {() => boolean} enabled asked at every change: false = cut
 * @param {() => number} [clock] milliseconds (performance.now)
 */
export function createTweens(enabled, clock = () => performance.now()) {
  /** @type {Map<string, { from: any, to: any, started: number, duration: number }>} */
  const tweens = new Map();
  const same = (a, b) => (Array.isArray(a) && Array.isArray(b) ? a.length === b.length && a.every((v, i) => v === b[i]) : a === b);

  return {
    /**
     * Follow a value. The first value seen, and any change while disabled or
     * mid-fade, is a cut (mix 1).
     * @returns {{ from: any, to: any, mix: number }}
     */
    follow(key, value, duration) {
      const now = clock();
      const tween = tweens.get(key);
      if (!tween) {
        tweens.set(key, { from: value, to: value, started: -Infinity, duration });
        return { from: value, to: value, mix: 1 };
      }
      if (!same(tween.to, value)) {
        const fading = now - tween.started < tween.duration;
        tween.from = tween.to;
        tween.to = value;
        tween.started = enabled() && !fading ? now : -Infinity;
        tween.duration = duration;
      }
      const mix = Math.min(1, (now - tween.started) / tween.duration);
      return { from: mix >= 1 ? tween.to : tween.from, to: tween.to, mix };
    },
    /** Forget everything: the next values are cuts (the user changed the focus or the instant). */
    reset() {
      tweens.clear();
    },
    /** Is any fade still running (the scheduler must keep drawing frames)? */
    get active() {
      const now = clock();
      for (const tween of tweens.values()) if (now - tween.started < tween.duration) return true;
      return false;
    },
  };
}
