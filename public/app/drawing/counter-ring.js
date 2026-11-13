/**
 * counter-ring.js - the orrery: one plain ring per ancestor of the focus.
 *
 * A counter ring shows one level. Its slots are its children (factor(level)
 * of them, separated by small gaps, starting at 12 o'clock): slots before
 * the running child are completed, the running one is lit as far as that
 * child has run, the rest are engraved. One "planet" rides the ring at the
 * level's own phase, labelled with the level's letter.
 *
 * The Sun's ring is the same object for the solar sync: 19 slots (Helions),
 * wider gaps where a Pentad begins, in the Sun's colours, no letter. In Earth
 * mode the civil days of the sync are hung on it (`paintEarthRing`).
 *
 * Positions come from `frc.arcPoint` on the ring's carrier: a fraction 0..1
 * of the ring IS a phase. Every count and phase is given by the caller, from
 * the core (instrument/reading.js).
 */
import { canvasFont, theme } from '../design/tokens.js';
import { ringCarrier } from './arcs.js';
import { disc, ring as strokeRing, stroke, text } from './canvas.js';

/**
 * @typedef {object} CounterRing
 * @property {number} radius
 * @property {number} slots how many children the level has
 * @property {number} current index of the running child; -1 = nothing lit (engraved state)
 * @property {number} slotFraction how far the running child has run, 0..1
 * @property {number | null} fraction the level's own phase (where the planet is); null = no planet
 * @property {string} [letter] the level's letter ('' for the Sun)
 * @property {'major' | 'minor' | 'sun'} kind
 * @property {readonly number[]} [groups] slots that begin a group (wider gap before them)
 */

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {import('../../lib/fractonica.js').Fractonica} frc
 * @param {number} cx
 * @param {number} cy
 * @param {CounterRing} ringSpec
 * @param {{ big?: boolean, sigma?: number, scale?: number }} [options] `big` = desktop sizes;
 *   `scale` shrinks gaps and marks when many rings share the space
 */
export function paintCounterRing(ctx, frc, cx, cy, ringSpec, { big = false, sigma = 0, scale = 1 } = {}) {
  const { color, line, glow } = theme();
  const { radius, slots, current, slotFraction, fraction, letter = '', kind, groups = [] } = ringSpec;
  const palette =
    kind === 'sun'
      ? { rest: color.solEmpty, done: color.solDim, lit: color.sol, planet: color.sol, label: color.ash, width: line.ringMinor }
      : kind === 'major'
        ? { rest: color.etch2, done: color.lumenEtch, lit: color.lumenRing, planet: color.lumenMid, label: color.majorLabel, width: line.ringMajor }
        : { rest: color.etch2, done: color.lumenDim, lit: color.lumenMid, planet: color.lumen, label: color.ash, width: line.ringMinor };
  const carrier = ringCarrier(frc, cx, cy, radius);
  const turn = 2 * frc.constants.PI * radius; // px in one turn
  const gap = ((kind === 'sun' ? 2.4 : 3.2) * Math.max(0.6, scale)) / turn; // as a fraction of the ring
  const done = new Path2D();
  const rest = new Path2D();
  const lit = new Path2D();
  for (let j = 0; j < slots; j++) {
    const wide = groups.includes(j) ? gap * 1.4 : 0;
    const from = j / slots + gap / 2 + wide;
    const to = (j + 1) / slots - gap / 2;
    if (to <= from) continue;
    if (j < current) frc.traceArc(done, carrier, from, to);
    else if (j > current || current < 0) frc.traceArc(rest, carrier, from, to);
    else {
      const split = from + (to - from) * Math.min(1, Math.max(0, slotFraction));
      if (split > from) frc.traceArc(lit, carrier, from, split);
      if (split < to) frc.traceArc(rest, carrier, split, to);
    }
  }
  stroke(ctx, rest, { color: palette.rest, width: palette.width });
  stroke(ctx, done, { color: palette.done, width: palette.width });
  stroke(ctx, lit, { color: palette.lit, width: palette.width * line.currentSlot });

  if (fraction === null || fraction === undefined || current < 0) return;
  // the planet, knocked out of its ring
  const at = frc.arcPoint(carrier, fraction);
  const planetRadius = (kind === 'sun' ? (big ? 2.6 : 2.1) : kind === 'major' ? (big ? 2 : 1.6) : big ? 2.4 : 1.9) * Math.max(0.8, scale);
  if (sigma > 0) disc(ctx, at.x, at.y, planetRadius, { color: palette.planet, alpha: glow.planet, glow: { sigma, alpha: 1 } });
  strokeRing(ctx, at.x, at.y, planetRadius + 1.4, { color: color.void, width: 1.4 });
  disc(ctx, at.x, at.y, planetRadius, { color: palette.planet });
  if (letter) {
    const size = (big ? 10 : 8) * Math.max(0.85, scale);
    const further = frc.arcPoint(carrier, fraction + (big ? 12 : 9.5) / turn);
    text(ctx, letter, further.x, further.y + size * 0.34, {
      font: canvasFont('reading', size),
      color: palette.label,
      align: 'center',
      knock: { color: color.void, width: 3.5 },
    });
  }
}

/**
 * Earth mode only: the civil days of the running sync, hung on the Sun's
 * ring. 19 Helions against 4 days, slipping about ten seconds per sync.
 * @param {{ fraction: number, kind: 'hour' | 'six' | 'midnight', label?: string }[]} ticks where each
 *   civil hour falls in the sync (the sync phase the core gives for that instant) and what it is
 */
export function paintEarthRing(ctx, frc, cx, cy, radius, ticks, { big = false } = {}) {
  const { color } = theme();
  const inner = ringCarrier(frc, cx, cy, radius + 2.2);
  const turn = 2 * frc.constants.PI * radius;
  const hours = new Path2D();
  const days = new Path2D();
  const labels = [];
  for (const tick of ticks) {
    const length = tick.kind === 'midnight' ? (big ? 9 : 6.5) : tick.kind === 'six' ? (big ? 5 : 3.6) : big ? 2.6 : 1.8;
    const a = frc.arcPoint(inner, tick.fraction);
    const b = frc.arcPoint(ringCarrier(frc, cx, cy, radius + 2.2 + length), tick.fraction);
    const path = tick.kind === 'midnight' ? days : hours;
    path.moveTo(a.x, a.y);
    path.lineTo(b.x, b.y);
    if (tick.kind === 'midnight' && tick.label) {
      const at = frc.arcPoint(ringCarrier(frc, cx, cy, radius + 2.2 + (big ? 7 : 5)), tick.fraction + (big ? 9 : 7.5) / turn);
      labels.push({ at, label: tick.label });
    }
  }
  stroke(ctx, hours, { color: color.etch3, width: 0.7 });
  stroke(ctx, days, { color: color.earth, width: 1 });
  for (const { at, label } of labels) {
    text(ctx, label, at.x, at.y + 2.4, {
      font: canvasFont('reading', big ? 9 : 7),
      color: color.earth,
      align: 'center',
      knock: { color: color.void, width: 3 },
    });
  }
}
