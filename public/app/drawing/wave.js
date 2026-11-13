/**
 * wave.js - a level's cycles laid along a line: the nested alternating arcs of
 * the ring, unrolled (DESIGN.md section 8, "the timeline").
 *
 * One cycle is two half-cycles: the core's wave roots (`frc.arcWaveRoot(0)`
 * above the axis, `frc.arcWaveRoot(1)` below it), each the carrier of a nest
 * (drawing/arcs.js) exactly as a ring is. Every cycle of a level has the same
 * shape, so ONE cell is built per level and size and painted wherever a cycle
 * stands; only the fill differs:
 *
 *   a cycle before the one that holds the instant    all elapsed (lit)
 *   the cycle that holds it                          lit up to the instant
 *   a cycle after it                                 engraved
 *
 * Also here: the Sun's lane, one solar sync drawn the same way (its Helions
 * as wave roots in a row), with its Pentads and quarters.
 *
 * Geometry is the core's; this module scales it to pixels and paints.
 */
import { canvasFont, theme } from '../design/tokens.js';
import { MIN_ARC_RADIUS, buildNest, nestPath, nowPoint, paintNest, ringCarrier } from './arcs.js';
import { disc, engraved, line, measure, ring, stroke, text } from './canvas.js';

/** The design's half-cycle radius on the reference phone (one Helion = 208 px). */
export const WAVE_RADIUS = 52;
/** ...for which the wave may reach this far from its axis. */
export const WAVE_REACH = 84;

/** A wave root of the core, scaled to `radius` px and set down with its cycle's start at x = 0. */
function rootArc(frc, half, radius) {
  const root = frc.arcWaveRoot(half);
  return { cx: root.cx * radius, cy: root.cy * radius, radius: root.radius * radius, start: root.start, sweep: root.sweep };
}

/**
 * Build the cell of one cycle of `level`: x runs 0 .. 4 x radius, the axis is y = 0.
 * @param {import('../../lib/fractonica.js').Fractonica} frc
 * @param {number} level
 * @param {number} radius px of a half-cycle's semicircle
 * @param {number} depth nested levels wanted (2 on phones, 3 on desktop)
 * @returns {WaveCell}
 * @typedef {{ level: number, radius: number, width: number, reach: number, halves: import('./arcs.js').Nest[] }} WaveCell
 *   `reach`: how far from the axis the ink of the cell goes (px), for fitting it into a band
 */
export function buildWaveCell(frc, level, radius, depth) {
  const halves = [0, 1].map((half) => buildNest(frc, rootArc(frc, half, radius), level, { depth, ring: false, parity: half, minRadius: MIN_ARC_RADIUS }));
  let reach = radius;
  for (const nest of halves) for (const layer of nest.layers) for (const arc of layer.arcs) reach = Math.max(reach, Math.abs(arc.cy) + arc.radius);
  return { level, radius, width: 4 * radius, reach, halves };
}

/**
 * The largest cell of `level` whose ink stays within `reach` px of the axis,
 * no larger than `radius`.
 */
export function fitWaveCell(frc, level, radius, reach, depth) {
  const cell = buildWaveCell(frc, level, radius, depth);
  // the nest's shape does not depend on its size, so one division gives the size that fits
  return cell.reach <= reach ? cell : buildWaveCell(frc, level, (radius * reach) / cell.reach, depth);
}

/**
 * Paint the cycles of a wave that are in view.
 * @param {CanvasRenderingContext2D} ctx
 * @param {import('../../lib/fractonica.js').Fractonica} frc
 * @param {WaveCell} cell
 * @param {object} place
 * @param {number} place.originX x of the START of the cycle that holds the instant
 * @param {number} place.axisY
 * @param {number} place.left  the band in view, px
 * @param {number} place.right
 * @param {number} place.first how many cycles exist before that cycle (none are drawn further back)
 * @param {number} place.last  how many exist after it
 * @param {{ half: 0 | 1, progress: number, steps: { local: number, progress: number }[] } | null} now
 *   model/halves.js `waveSteps`; null = nothing lit (outside the catalogue)
 * @param {{ heroWidth?: number, sigma?: number }} [style]
 * @returns {{ x: number, y: number } | null} the point of now
 */
export function paintWave(ctx, frc, cell, { originX, axisY, left, right, first, last }, now, { heroWidth, sigma = 0 } = {}) {
  const { color, line: weight } = theme();
  const from = Math.max(-first, Math.floor((left - originX) / cell.width) - 1);
  const to = Math.min(last, Math.ceil((right - originX) / cell.width));
  let point = null;
  for (let k = from; k <= to; k++) {
    ctx.save();
    ctx.translate(originX + k * cell.width, axisY);
    for (let half = 0; half < 2; half++) {
      const nest = cell.halves[half];
      // -1 elapsed, 0 holds the instant, 1 to come
      const state = now === null ? 1 : k !== 0 ? Math.sign(k) : Math.sign(half - now.half);
      const elapsed = new Path2D();
      const toCome = new Path2D();
      const split = state < 0 ? 1 : state > 0 ? 0 : now.progress;
      if (split > 0) frc.traceArc(elapsed, nest.carrier, 0, split);
      if (split < 1) frc.traceArc(toCome, nest.carrier, split, 1);
      stroke(ctx, toCome, { color: color.etch2, width: weight.engrave });
      stroke(ctx, elapsed, { color: color.lumenDim, width: weight.carrierLit });
      if (state === 0) {
        const path = nestPath(nest, now.steps);
        paintNest(ctx, frc, nest, path, { heroWidth, sigma });
        const at = nowPoint(frc, nest, path);
        if (at) point = { x: at.x + originX + k * cell.width, y: at.y + axisY };
      } else {
        paintNest(ctx, frc, nest, null, { heroWidth, sigma, allElapsed: state < 0 });
      }
    }
    ctx.restore();
  }
  return point;
}

/**
 * The Sun's lane: one solar sync as a row of half-Helions, alternating about
 * the lane's axis, lit up to the instant; above it the Pentads as brackets
 * with their marks, below it the sync's four quarters.
 * @param {CanvasRenderingContext2D} ctx
 * @param {import('../../lib/fractonica.js').Fractonica} frc
 * @param {object} lane
 * @param {number} lane.x0 left end of the sync, px
 * @param {number} lane.x1 right end
 * @param {number} lane.y  the axis
 * @param {number} lane.halves half-Helions per sync (2 x FRC_SYNC_CYCLES)
 * @param {number} [lane.scale] 1 on the reference phone (sizes of marks and words)
 * @param {object | null} sun what to light (screens/wave/wave-reading.js `sun`); null = engraved only
 * @param {{ from: number, to: number } | null} window the part of the sync the wave below shows, as fractions
 * @param {number} [sigma] glow
 */
/** The Sun lane's arcs are this high on the reference phone; its marks keep the design's distances from them. */
export const SUN_LANE = Object.freeze({ arc: 4.6, above: 22.4, below: 38 });

/** How high a lane of this width is, and where its axis lies in it (px from its top). */
export function sunLaneBox(width, halves, scale = 1) {
  const radius = width / (2 * halves);
  const axis = radius + SUN_LANE.above * scale;
  return { axis, height: Math.ceil(axis + radius + SUN_LANE.below * scale - SUN_LANE.arc * scale) };
}

export function paintSunLane(ctx, frc, { x0, x1, y, halves, scale = 1 }, sun, window, sigma = 0) {
  const { color, glow, font, alpha } = theme();
  const radius = (x1 - x0) / (2 * halves);
  const elapsed = new Path2D();
  const toCome = new Path2D();
  let point = null;
  for (let h = 0; h < halves; h++) {
    const root = frc.arcWaveRoot(h);
    const arc = { cx: x0 + root.cx * radius, cy: y + root.cy * radius, radius: root.radius * radius, start: root.start, sweep: root.sweep };
    const split = sun === null || h > sun.half ? 0 : h < sun.half ? 1 : sun.progress;
    if (split > 0) frc.traceArc(elapsed, arc, 0, split);
    if (split < 1) frc.traceArc(toCome, arc, split, 1);
    if (sun !== null && h === sun.half) point = frc.arcPoint(arc, split);
  }
  const paintArcs = () => {
    stroke(ctx, toCome, { color: color.solDim, width: 1 });
    stroke(ctx, elapsed, { color: color.sol, width: 1.2, glow: sigma > 0 ? { sigma, alpha: glow.arc } : null });
  };
  if (sun === null) {
    paintArcs();
    return;
  }

  // the Pentads: a bracket over each run of Helions, its mark set into the bracket
  // (painted before the arcs: the gap cut for a mark must not cut their glow)
  const perHelion = (x1 - x0) / (halves / 2);
  // every mark keeps its distance from the arcs, whatever their size (on the reference phone the arcs are
  // 4.6 px high and the bracket stands 13 px above the axis)
  const clear = radius - 4.6 * scale;
  const top = y - 13 * scale - clear;
  for (const pentad of sun.pentads) {
    const ink = pentad.on ? color.sol : color.solDim;
    const xa = x0 + pentad.first * perHelion + 2;
    const xb = x0 + (pentad.first + pentad.count) * perHelion - 2;
    const bracket = new Path2D();
    bracket.moveTo(xa, top + 4);
    bracket.lineTo(xa, top);
    bracket.lineTo(xb, top);
    bracket.lineTo(xb, top + 4);
    stroke(ctx, bracket, { color: ink, width: 0.9 });
    const mid = (xa + xb) / 2;
    ctx.clearRect(mid - 13 * scale, top - 6 * scale, 26 * scale, 12 * scale);
    // a polygon with one vertex per Helion: a pentagon, or a square for the Hypopentad (design ruling 10)
    const markX = mid - (pentad.numeral ? 5 * scale : 0);
    const carrier = ringCarrier(frc, markX, top + 0.5, 4.6 * scale);
    const turn = pentad.count === 4 ? 1 / 8 : 0;
    const polygon = new Path2D();
    for (let i = 0; i < pentad.count; i++) {
      const vertex = frc.arcPoint(carrier, i / pentad.count + turn);
      if (i === 0) polygon.moveTo(vertex.x, vertex.y);
      else polygon.lineTo(vertex.x, vertex.y);
    }
    polygon.closePath();
    stroke(ctx, polygon, { color: ink, width: 0.9 });
    if (pentad.numeral) text(ctx, pentad.numeral, mid + 3 * scale, top + 3 * scale, { font: canvasFont('caps', 7 * scale), color: ink, tracking: 0.42 * scale });
  }

  paintArcs();

  // the four quarters of the sync, a quarter of the lane apart; the next one lit
  const below = y + clear;
  // on a short lane the four dates would run into each other: then only the next quarter keeps its date
  const earthFont = canvasFont('reading', 7.5 * scale, font.earthWeight);
  const widestDate = Math.max(0, ...sun.quarters.map((quarter) => measure(ctx, quarter.earth, earthFont)));
  const datesFit = widestDate * 1.5 + 4 <= (x1 - x0) / sun.quarters.length;
  sun.quarters.forEach((quarter, i) => {
    const x = x0 + ((x1 - x0) * (i + 1)) / sun.quarters.length;
    const ink = quarter.next ? color.sol : color.solDim;
    const align = i === sun.quarters.length - 1 ? 'right' : 'center';
    const size = 5.8 * scale;
    line(ctx, x, below + 9 * scale, x, below + 14 * scale, { color: ink, width: 1 });
    text(ctx, engraved(quarter.word), x, below + 24 * scale, { font: canvasFont('caps', size), color: quarter.next ? color.sol : color.solLabel, tracking: size * 0.18, align });
    if (quarter.earth && (datesFit || quarter.next)) text(ctx, quarter.earth, x, below + 35 * scale, { font: earthFont, color: color.earth, align });
  });

  // where the wave's window lies in this sync
  if (window) {
    const xa = x0 + (x1 - x0) * window.from;
    const xb = Math.max(xa + 1, x0 + (x1 - x0) * window.to);
    const bracket = new Path2D();
    bracket.moveTo(xa, below + 6 * scale);
    bracket.lineTo(xa, below + 9.5 * scale);
    bracket.lineTo(xb, below + 9.5 * scale);
    bracket.lineTo(xb, below + 6 * scale);
    stroke(ctx, bracket, { color: color.lumen, width: 0.9 });
  }

  // the point of the instant, in the Sun's light (it never pulses)
  if (point) {
    const r = 1.9 * scale;
    ring(ctx, point.x, point.y, r * 2.6, { color: color.sol, width: 0.6, alpha: alpha.nowHalo });
    disc(ctx, point.x, point.y, r, { color: color.sol, glow: sigma > 0 ? { sigma, alpha: glow.now } : null });
    disc(ctx, point.x, point.y, r * 0.45, { color: color.nowCore });
  }
}
