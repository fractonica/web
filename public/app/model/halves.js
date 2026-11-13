/**
 * halves.js - half-cycles: the unit of the arc geometry, read from the core's cycles.
 *
 * The core returns cycles; arcs are HALF-cycles. fractonica.h says this
 * conversion "needs no function" and states the rule, which is the whole of
 * this file:
 *
 *     half index = 2 * cycle + (phase >= FRC_FRAC_HALF);   progress = phase << 1
 *     child half index = parent half index * m + j          (m = frc_factor(parent level))
 *     first child of cycle c at level L = c * frc_factor(L)
 *
 * It is index bookkeeping on the core's exact answers (BigInt), not clock
 * arithmetic: no period, no time, no position is computed here. A core
 * function for it has been requested (frc_half_cycle_at); when it lands,
 * this file becomes three calls.
 */

/**
 * The running half-cycle of a cycle the core returned.
 * @param {import('../../lib/fractonica.js').Fractonica} frc
 * @param {import('../../lib/fractonica.js').Cycle} cycle
 * @returns {{ index: bigint, second: boolean, progress: number }} global half index, whether it is
 *   the second half, and how far along the half is (0..1)
 */
export function halfOf(frc, cycle) {
  const second = cycle.phase >= frc.constants.FRAC_HALF;
  return {
    index: 2n * cycle.cycle + (second ? 1n : 0n),
    second,
    progress: frc.fracToDouble((cycle.phase << 1) >>> 0),
  };
}

/**
 * The running half-Helion of a solar sync, counted from the sync's start: the
 * same rule on the core's place of the running Helion in the sync
 * (`sync.helion`, 0..18), so 0..37, and how far along it is.
 * @param {import('../../lib/fractonica.js').Fractonica} frc
 * @param {import('../../lib/fractonica.js').Sync} sync from cat.syncAt
 * @param {import('../../lib/fractonica.js').Cycle} helion the Helion (level 6) running at the same instant
 * @returns {{ index: number, progress: number }}
 */
export function halfInSync(frc, sync, helion) {
  const half = halfOf(frc, helion);
  return { index: 2 * sync.helion + (half.second ? 1 : 0), progress: half.progress };
}

/**
 * The path from a focused cycle down to now, as steps for drawing/arcs.js
 * `nestPath`: for each nested level the running half-cycle's index inside its
 * parent arc and its progress.
 * @param {import('./frame.js').Frame} frame
 * @param {number} focus the level of the ring's carrier (a whole cycle)
 * @param {number} depth how many nested levels (focus + 1 .. focus + depth)
 * @returns {{ local: number, progress: number }[] | null} null outside the catalogue
 */
export function ringSteps(frame, focus, depth) {
  if (!frame.inCatalogue) return null;
  const { frc } = frame;
  const steps = [];
  // the first half-cycle of level focus + 1 inside the focused cycle: 2 x its first child cycle
  const first = 2n * frame.cycle(focus).cycle * BigInt(frc.factor(focus));
  let parent = null;
  for (let d = 0; d < depth; d++) {
    const level = focus + 1 + d;
    if (level > frc.constants.CLOCK_MAX_LEVEL) break;
    const half = halfOf(frc, frame.cycle(level));
    // d = 0: counted from the start of the focused cycle; deeper: child index = parent index * m + j
    const base = parent === null ? first : parent * BigInt(frc.factor(level - 1));
    steps.push({ local: Number(half.index - base), progress: half.progress });
    parent = half.index;
  }
  return steps;
}

/**
 * The same path for the WAVE, whose carriers are the two HALF-cycles of the
 * focused cycle (drawing/wave.js) instead of one ring: which half of the
 * focused cycle is running, how far along it is, and the steps of
 * `ringSteps` with the first one counted from the start of that half (a half
 * carries `frc_factor(focus)` half-cycles of the next level).
 * @param {import('./frame.js').Frame} frame
 * @param {number} focus the level of the wave
 * @param {number} depth how many nested levels
 * @returns {{ half: 0 | 1, progress: number, steps: { local: number, progress: number }[] } | null}
 *   null outside the catalogue
 */
export function waveSteps(frame, focus, depth) {
  const steps = ringSteps(frame, focus, depth);
  if (!steps || steps.length === 0) return null;
  const { frc } = frame;
  const own = halfOf(frc, frame.cycle(focus));
  const before = own.second ? frc.factor(focus) : 0;
  return { half: own.second ? 1 : 0, progress: own.progress, steps: [{ local: steps[0].local - before, progress: steps[0].progress }, ...steps.slice(1)] };
}

/**
 * How many whole cycles of `level` have completed inside the running cycle of
 * `ancestor` (the index of the running one, from 0): the count the inner
 * bezel lights up. Tree navigation by the header's rule.
 */
export function cycleIndexWithin(frame, ancestor, level) {
  const { frc } = frame;
  let first = frame.cycle(ancestor).cycle;
  for (let l = ancestor; l < level; l++) first *= BigInt(frc.factor(l));
  return Number(frame.cycle(level).cycle - first);
}

/** How many cycles of `level` one cycle of `ancestor` holds (product of the core's factors). */
export function cyclesWithin(frc, ancestor, level) {
  let count = 1;
  for (let l = ancestor; l < level; l++) count *= frc.factor(l);
  return count;
}
