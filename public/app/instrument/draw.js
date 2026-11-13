/**
 * draw.js - paint one frame of the instrument (DESIGN.md section 5).
 *
 * Input: where the circles are (geometry.js), the arcs (a nest of
 * drawing/arcs.js, cached by the caller), and a reading (reading.js). Output:
 * ink. Painted back to front, as the design is layered:
 *
 *   counter rings of the ancestors, the Sun's ring (+ civil days in Earth mode)
 *   the carrier, the nested arcs, the beads
 *   the inner bezel: graduations, four threshold ticks and their engraved words
 *   the alidade, the point of now
 *   the centre: the focused level's odometer, the cycle's name above it
 *
 * `motion` carries the cross-fades of DESIGN.md section 10 (all weights 0..1);
 * without it every change is a cut.
 */
import { canvasFont, theme } from '../design/tokens.js';
import { nestPath, nowPoint, paintNest, paintNowPoint, ringCarrier } from '../drawing/arcs.js';
import { disc, engraved, fitCanvas, line, measure, ring, stroke, text } from '../drawing/canvas.js';
import { paintCounterRing, paintEarthRing } from '../drawing/counter-ring.js';
import { PAIR_PITCH, crispUnit, odometerExtent, paintOdometer } from '../drawing/glyphs.js';
import { BEZEL_FRACTIONS } from './reading.js';

/** Below this bezel radius (px) the engraved words no longer fit beside the odometer (72 / 122 as designed). */
const WORDS_FROM = 57;
const WORDS_FROM_BIG = 96;
/** Below this bezel radius the cycle's name no longer fits above the odometer. */
const NAME_FROM = 34;
/** The centre odometer sits this many design units below the centre (the name stands above it). */
const ODOMETER_DROP = 0.4;

/**
 * @param {CanvasRenderingContext2D & { ratio: number }} ctx
 * @param {import('../../lib/fractonica.js').Fractonica} frc
 * @param {object} scene
 * @param {{ cx: number, cy: number, big: boolean, markScale: number }} scene.fit from geometry.fitInstrument
 * @param {object} scene.radii geometry.ringRadii merged with geometry.heroShape: hero, carrier, bezel,
 *   centre, rings, outer
 * @param {import('../drawing/arcs.js').Nest} scene.nest built on a carrier of radius radii.hero
 * @param {import('./reading.js').InstrumentReading} scene.reading
 * @param {object} [scene.motion] cross-fade weights
 * @param {{ from: number, to: number, mix: number }} [scene.motion.next] the lit bezel word changing
 * @param {{ from: number, to: number, mix: number }} [scene.motion.beads] a bead being lit
 * @param {{ from: readonly number[] | null, mix: number }} [scene.motion.digits] the glyphs changing
 * @param {{ canvas: HTMLCanvasElement, key: string }} [scene.settled] a bitmap the caller keeps between passes
 *   (`{ canvas: document.createElement('canvas'), key: '' }`): the nest's settled arcs are painted into it
 *   only when they change. Without it every pass paints every arc.
 */
export function drawInstrument(ctx, frc, { fit, radii, nest, reading, motion = null, settled = null }) {
  const { color, line: weight, glow, alpha } = theme();
  const { cx, cy, big } = fit;
  const s = fit.markScale; // scale of marks and type
  const sigma = (big ? glow.sigmaDesktop : glow.sigmaPhone) * Math.min(1, s + 0.1);
  const carrier = ringCarrier(frc, cx, cy, radii.carrier);
  const lit = reading.lit;

  // --- the orrery: one ring per ancestor, the Sun's after zeta's -------------
  for (const placed of radii.rings) {
    if (placed.level === 'sun') {
      if (!reading.sun) continue;
      paintCounterRing(ctx, frc, cx, cy, { ...reading.sun, radius: placed.radius, kind: 'sun' }, { big, sigma: sigma * 0.6, scale: radii.ringScale });
      if (reading.hourTicks) paintEarthRing(ctx, frc, cx, cy, placed.radius, reading.hourTicks, { big });
      continue;
    }
    const ancestor = reading.ancestors.find((a) => a.level === placed.level);
    paintCounterRing(
      ctx,
      frc,
      cx,
      cy,
      { ...ancestor, radius: placed.radius, kind: ancestor.major ? 'major' : 'minor' },
      { big, sigma: sigma * 0.6, scale: Math.max(radii.ringScale, 0.75) * Math.min(1, s + 0.15) },
    );
  }

  // --- the carrier: the cycle itself, its elapsed part in resting lumen ------
  const toCome = new Path2D();
  const elapsed = new Path2D();
  const fraction = lit ? reading.fraction : 0;
  if (fraction < 1) frc.traceArc(toCome, carrier, fraction, 1);
  if (fraction > 0) frc.traceArc(elapsed, carrier, 0, fraction);
  stroke(ctx, toCome, { color: color.etch2, width: weight.engrave });
  stroke(ctx, elapsed, { color: color.lumenDim, width: weight.carrierLit });

  // --- the nested arcs ------------------------------------------------------
  const path = lit && reading.steps ? nestPath(nest, reading.steps) : null;
  const nestStyle = { heroWidth: (big ? weight.heroDesktop : weight.heroPhone) * Math.max(0.8, s), sigma };
  if (!settled) paintNest(ctx, frc, nest, path, nestStyle);
  else {
    // the arcs change only when one is completed: they are kept in a bitmap and repainted then; every pass
    // lays the lit part of the arcs being drawn over it (DESIGN.md section 5: thousands of arcs at 30 passes a
    // second would otherwise be rasterised again and again for a few pixels of change)
    const key = `${nest.carrier.cx},${nest.carrier.cy},${nest.carrier.radius},${nest.level},${nest.layers.length}|${ctx.canvas.width}x${ctx.canvas.height}|${theme().name}|${sigma}|${path ? path.map((step) => step.index).join('.') : '-'}`;
    if (settled.key !== key) {
      settled.key = key;
      const width = ctx.canvas.width / ctx.ratio;
      const height = ctx.canvas.height / ctx.ratio;
      paintNest(fitCanvas(settled.canvas, width, height, ctx.ratio), frc, nest, path, { ...nestStyle, part: 'settled' });
    }
    ctx.drawImage(settled.canvas, 0, 0, ctx.canvas.width / ctx.ratio, ctx.canvas.height / ctx.ratio);
    paintNest(ctx, frc, nest, path, { ...nestStyle, part: 'current' });
  }

  // --- beads: the sibling counter of the children ---------------------------
  const beadRadius = (big ? 2.4 : 1.8) * Math.max(0.8, s);
  for (let j = 0; j < reading.beads.count; j++) {
    const at = frc.arcPoint(carrier, j / reading.beads.count);
    let on = j <= reading.beads.lit ? 1 : 0;
    if (motion?.beads && j > motion.beads.from && j <= motion.beads.to) on = motion.beads.mix;
    disc(ctx, at.x, at.y, beadRadius, { color: color.void });
    ring(ctx, at.x, at.y, beadRadius, { color: color.etch3, width: 0.8, alpha: 1 - on });
    if (on > 0) {
      disc(ctx, at.x, at.y, beadRadius, { color: color.bone, alpha: on });
      ring(ctx, at.x, at.y, beadRadius, { color: color.bone, width: 0.8, alpha: on });
    }
  }

  // --- the inner bezel -------------------------------------------------------
  const rIn = radii.bezel;
  ring(ctx, cx, cy, rIn, { color: color.etch2, width: weight.engrave });
  const bezel = ringCarrier(frc, cx, cy, rIn);
  const { count, every } = reading.graduations;
  if (count <= 400) {
    const longTick = ringCarrier(frc, cx, cy, rIn + (big ? 7 : 4.6) * s);
    const shortTick = ringCarrier(frc, cx, cy, rIn + (big ? 3.6 : 2.4) * s);
    const on = new Path2D();
    const off = new Path2D();
    for (let i = 0; i < count; i++) {
      const a = frc.arcPoint(bezel, i / count);
      const b = frc.arcPoint(i % every === 0 ? longTick : shortTick, i / count);
      const target = i <= reading.graduations.lit ? on : off;
      target.moveTo(a.x, a.y);
      target.lineTo(b.x, b.y);
    }
    stroke(ctx, off, { color: color.etch3, width: 0.8 });
    stroke(ctx, on, { color: color.lumenMid, width: weight.tick });
  }

  // four thresholds: end at 12, peak at 3, node at 6, valley at 9
  const wordSize = (big ? 8 : 6.2) * Math.max(0.9, s);
  const tickIn = ringCarrier(frc, cx, cy, rIn - (big ? 9 : 6) * s * Math.max(0.6, radii.centre));
  const wordRing = ringCarrier(frc, cx, cy, rIn - (big ? 18 : 12.5) * s);
  // a small centre keeps its four ticks and drops the words (DESIGN.md section 11: words go first)
  const withWords = rIn >= (big ? WORDS_FROM_BIG : WORDS_FROM);
  for (const item of reading.thresholds) {
    const at = BEZEL_FRACTIONS[item.quarter];
    // how lit this word is: the next threshold is lumen; a crossing fades one down and the next up
    let glowing = item.quarter === reading.next ? 1 : 0;
    if (motion?.next) glowing = (item.quarter === motion.next.to ? motion.next.mix : 0) + (item.quarter === motion.next.from ? 1 - motion.next.mix : 0);
    const a = frc.arcPoint(tickIn, at);
    const b = frc.arcPoint(bezel, at);
    line(ctx, a.x, a.y, b.x, b.y, { color: color.etch3, width: weight.tick, alpha: 1 - glowing });
    line(ctx, a.x, a.y, b.x, b.y, { color: color.now, width: 1.3, alpha: glowing });
    if (!withWords) continue;
    const label = engraved(item.word) + (item.time ? ` ${item.time}` : '');
    const anchor = frc.arcPoint(wordRing, at);
    // rotated to the tangent; the bottom one stays upright and hangs below its radius
    const upright = at === 0.5;
    const style = {
      font: canvasFont('caps', wordSize),
      tracking: wordSize * theme().font.bezelTracking,
      align: 'center',
      rotate: upright ? 0 : at * 2 * frc.constants.PI,
    };
    const y = anchor.y + (upright ? wordSize * 0.75 : 0);
    text(ctx, label, anchor.x, y, { ...style, color: color.etch3, alpha: 1 - glowing });
    text(ctx, label, anchor.x, y, { ...style, color: color.now, alpha: glowing });
  }

  // --- the alidade and the point of now -------------------------------------
  const now = lit ? nowPoint(frc, nest, path) : null;
  if (lit) {
    const a = frc.arcPoint(bezel, fraction);
    const b = frc.arcPoint(ringCarrier(frc, cx, cy, radii.outer + 5), fraction);
    line(ctx, a.x, a.y, b.x, b.y, { color: color.bone, width: weight.hair, alpha: alpha.alidade });
  }
  if (now) paintNowPoint(ctx, now, (big ? 3.2 : 2.6) * Math.max(0.8, s), sigma);

  // --- the centre: the odometer, the cycle's name above it -------------------
  if (lit && reading.digits) {
    // DESIGN.md section 6: u = 0.086 R (0.074 R on a desktop) at every focus. A level with few, large arcs
    // (alpha, gamma, delta, theta ...) has a smaller bezel (heroShape). While the four words stand inside it the
    // odometer shrinks with the bezel, as the words do; where the words are left out (the smallest bezels:
    // theta, gamma, lambda) it takes the room they leave, as large as the circle inside the threshold ticks
    // holds (from the core's glyph bounds), never larger than designed
    const designed = radii.hero * (big ? 0.074 : 0.086);
    const room = rIn - (big ? 9 : 6) * s * Math.max(0.6, radii.centre) - 1.5;
    const fits = room / odometerExtent(frc, reading.digits.length, { dy: ODOMETER_DROP });
    const wanted = withWords ? designed * radii.centre : Math.min(designed, Math.max(designed * radii.centre, fits));
    const u = crispUnit(frc, wanted, ctx.ratio);
    const place = { x: cx, y: cy + u * ODOMETER_DROP, u, strokes: 2, pitch: PAIR_PITCH, snap: true };
    const glyphGlow = { sigma, alpha: glow.glyph };
    const mix = motion?.digits?.from ? motion.digits.mix : 1;
    if (mix < 1) paintOdometer(ctx, frc, motion.digits.from, place, { color: color.lumen, alpha: 1 - mix, glow: glyphGlow });
    paintOdometer(ctx, frc, reading.digits, place, { color: color.lumen, alpha: mix, glow: glyphGlow });
    const nameSize = (big ? 19 : 12.5) * Math.min(1, Math.max(0.62, rIn / (big ? 122 : 72)));
    // the name stands above the odometer while it stays inside the ticks (words go first: DESIGN.md section 11)
    if (rIn >= NAME_FROM && wanted * 5.05 + nameSize * 0.75 <= room) paintReading(ctx, reading.name, cx, cy - wanted * 5.05, nameSize);
  }
}

/**
 * A reading on the canvas, centred on x: numerals in bone, unit letters and
 * '#' in ash (DESIGN.md section 3).
 */
export function paintReading(ctx, reading, x, y, size) {
  const { color, font } = theme();
  const face = canvasFont('reading', size, font.valueWeight);
  const runs = reading.match(/[α-ω#]+|[^α-ω#]+/g) ?? [];
  let pen = x - measure(ctx, reading, face) / 2;
  for (const run of runs) {
    text(ctx, run, pen, y, { font: face, color: /[α-ω#]/.test(run) ? color.ash : color.bone });
    pen += measure(ctx, run, face);
  }
}
