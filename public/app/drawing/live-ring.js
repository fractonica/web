/**
 * live-ring.js - a level's ring drawn small: the inspector ring of the LENS
 * (DESIGN.md section 5, "inspector ring R = 54: 2 nested levels").
 *
 * The same construction as the instrument's hero ring, without the orrery
 * and the bezel: the carrier with its elapsed part, the nested arcs, the
 * beads of the children, the point of now, and the level's odometer in the
 * middle. Around it `paintThresholdMarks` sets the four thresholds: a tick
 * and the glyph state the level shows from that threshold on, the next one in
 * the colour of the present.
 *
 * Ink only. The arcs are a nest of drawing/arcs.js, what is lit comes from
 * instrument/reading.js (`readInstrument`); with `reading.lit` false the ring
 * is engraved and nothing glows (outside the catalogue, or a rung the clock
 * has no reading for).
 */
import { theme } from '../design/tokens.js';
import { nestPath, nowPoint, paintNest, paintNowPoint, ringCarrier } from './arcs.js';
import { disc, line, ring, stroke } from './canvas.js';
import { PAIR_PITCH, paintOdometer } from './glyphs.js';

/**
 * @param {CanvasRenderingContext2D & { ratio?: number }} ctx
 * @param {import('../../lib/fractonica.js').Fractonica} frc
 * @param {object} scene
 * @param {number} scene.cx
 * @param {number} scene.cy
 * @param {import('./arcs.js').Nest} scene.nest built on the ring's carrier
 * @param {{ lit: boolean, fraction: number, steps: object[] | null, beads: { count: number, lit: number }, digits: readonly number[] | null }} scene.reading
 * @param {number} [scene.scale] 1 = the phone's ring; marks and weights follow it
 * @param {number} [scene.unit] px per design unit of the odometer in the middle; 0 = none
 */
export function paintLiveRing(ctx, frc, { cx, cy, nest, reading, scale = 1, unit = 0 }) {
  const { color, line: weight, glow } = theme();
  const carrier = nest.carrier;
  const lit = reading.lit;
  const sigma = glow.sigmaPhone * Math.min(1.2, Math.max(0.8, scale));

  // the cycle itself: its elapsed part in resting lumen
  const fraction = lit ? reading.fraction : 0;
  const toCome = new Path2D();
  const elapsed = new Path2D();
  if (fraction < 1) frc.traceArc(toCome, carrier, fraction, 1);
  if (fraction > 0) frc.traceArc(elapsed, carrier, 0, fraction);
  stroke(ctx, toCome, { color: color.etch2, width: weight.engrave });
  stroke(ctx, elapsed, { color: color.lumenDim, width: weight.carrierLit });

  const path = lit && reading.steps ? nestPath(nest, reading.steps) : null;
  paintNest(ctx, frc, nest, path, { heroWidth: 1.3 * Math.max(0.9, scale), sigma: lit ? sigma : 0 });

  // beads: one per child cycle, lit through the running one
  const beadRadius = 1.5 * Math.max(0.9, scale);
  for (let j = 0; j < reading.beads.count; j++) {
    const at = frc.arcPoint(carrier, j / reading.beads.count);
    const on = lit && j <= reading.beads.lit;
    disc(ctx, at.x, at.y, beadRadius, { color: on ? color.bone : color.void });
    ring(ctx, at.x, at.y, beadRadius, { color: on ? color.bone : color.etch3, width: 0.7 });
  }

  const now = lit ? nowPoint(frc, nest, path) : null;
  if (now) paintNowPoint(ctx, now, 2.2 * Math.max(0.9, scale), sigma);
  if (lit && reading.digits && unit > 0) {
    paintOdometer(ctx, frc, reading.digits, { x: cx, y: cy + unit * 0.3, u: unit, strokes: 2, pitch: PAIR_PITCH }, { color: color.lumen, glow: { sigma, alpha: glow.glyph } });
  }
}

/**
 * The four thresholds around a ring: a tick on the circle of `radius`, and
 * beside it the glyph state reached there.
 * @param {object} marks
 * @param {number} marks.cx
 * @param {number} marks.cy
 * @param {number} marks.radius where the ticks begin
 * @param {number} marks.tick their length
 * @param {number} marks.unit px per design unit of the glyphs (2.3 on the phone)
 * @param {{ fraction: number, glyph: number, next: boolean, x: number, y: number }[]} marks.items `fraction` is the
 *   threshold's place on the ring from 12 o'clock; (x, y) the centre of its glyph
 */
export function paintThresholdMarks(ctx, frc, { cx, cy, radius, tick, unit, items }) {
  const { color, glow } = theme();
  const inner = ringCarrier(frc, cx, cy, radius);
  const outer = ringCarrier(frc, cx, cy, radius + tick);
  for (const item of items) {
    const a = frc.arcPoint(inner, item.fraction);
    const b = frc.arcPoint(outer, item.fraction);
    line(ctx, a.x, a.y, b.x, b.y, { color: item.next ? color.now : color.etch3, width: 1 });
    paintOdometer(ctx, frc, [item.glyph], { x: item.x, y: item.y, u: unit, strokes: 2 }, { color: item.next ? color.now : color.ash, glow: item.next ? { sigma: glow.sigmaPhone * 0.6, alpha: glow.glyph } : null });
  }
}
