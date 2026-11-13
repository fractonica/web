/**
 * arcs.js - nested alternating circular arcs: the one ornament of the instrument.
 *
 * Every arc here is made by the core (`frc.arcChild`) and every point on one
 * by `frc.arcPoint`; this module only decides WHICH arcs exist (a nest), keeps
 * them (geometry does not depend on time), and paints them in the styles of
 * DESIGN.md section 5:
 *
 *   layer            elapsed                 to come        on the path to now
 *   children         lumen, hero + glow      etch-3 0.9     lumen hero + glow, split at now
 *   grandchildren    lumen-mid 0.75, 95 %    etch-2 0.75    lumen 0.9; the current child cycle's are lumen
 *   great-grand...   lumen-mid 0.6, 60 %     etch-2 0.6     lumen 0.7
 *
 * A NEST is a carrier arc plus `depth` layers. Layer d holds the half-cycle
 * arcs of level `level + 1 + d`, flat and in time order: arc `i` of layer d
 * is child `i mod m` of arc `floor(i / m)` of layer d - 1. Time order means a
 * single index per layer says what is lit: arcs before it have elapsed, the
 * arc at it is being drawn now, arcs after it are to come.
 */
import { theme } from '../design/tokens.js';
import { stroke } from './canvas.js';

/** Stop nesting when an arc's radius would fall under this many px (design ruling 9). */
export const MIN_ARC_RADIUS = 3;

/**
 * The carrier of a whole cycle drawn as a closed ring: a full circle that
 * starts at 12 o'clock and runs clockwise. A fraction 0..1 along it is the
 * phase of the cycle.
 * @returns {import('../../lib/fractonica.js').Arc}
 */
export function ringCarrier(frc, cx, cy, radius) {
  const pi = frc.constants.PI;
  return { cx, cy, radius, start: -pi / 2, sweep: 2 * pi };
}

/**
 * Build a nest. Costs one core call per arc; build it once per focus and size.
 * @param {import('../../lib/fractonica.js').Fractonica} frc
 * @param {import('../../lib/fractonica.js').Arc} carrier
 * @param {number} level the carrier's level (its children are half-cycles of level + 1)
 * @param {object} [options]
 * @param {number} [options.depth] layers wanted (2 on phones, 3 on desktop)
 * @param {boolean} [options.ring] true (default): the carrier is a whole cycle, so it has
 *   2 x factor(level) children; false: the carrier is itself a half-cycle with factor(level) children
 * @param {number} [options.parity] parity of the carrier's own global half index (wave carriers)
 * @param {number} [options.minRadius] drop a nested layer whose arcs are, on average, under this radius
 *   (design ruling 9, "stop nesting when an arc's radius falls under 3 pt", read as DESIGN.md's own renders
 *   read it: desktop1.png draws the Helion's third layer, whose inward-bulging arcs are 2.75 px at R 172;
 *   judging by the smallest arc would remove that layer from the reference itself). 0 = keep every layer
 * @returns {Nest}
 * @typedef {{ carrier: object, level: number, lead: number, layers: { level: number, m: number, arcs: object[], odd: Uint8Array }[] }} Nest
 *   `lead` is the parity of the first arc's global half index: 1 when the first arc of the first layer is the
 *   SECOND half of a child cycle (a wave carrier of odd index with an odd number of children), else 0.
 */
export function buildNest(frc, carrier, level, { depth = 2, ring = true, parity = 0, minRadius = MIN_ARC_RADIUS } = {}) {
  const layers = [];
  let parents = [carrier];
  let parentOdd = Uint8Array.of(parity & 1);
  for (let d = 0; d < depth; d++) {
    const m = (d === 0 && ring ? 2 : 1) * frc.factor(level + d);
    const arcs = new Array(parents.length * m);
    const odd = new Uint8Array(arcs.length);
    let total = 0;
    for (let p = 0; p < parents.length; p++) {
      for (let j = 0; j < m; j++) {
        // parity of the child's global half-cycle index: parent index x m + j
        const isOdd = (parentOdd[p] * m + j) & 1;
        const arc = frc.arcChild(parents[p], m, j, isOdd);
        arcs[p * m + j] = arc;
        odd[p * m + j] = isOdd;
        total += arc.radius;
      }
    }
    // arcs on an inward bulge are smaller than those on an outward one: judge the layer by its mean
    if (d > 0 && total / arcs.length < minRadius) break;
    layers.push({ level: level + 1 + d, m, arcs, odd });
    parents = arcs;
    parentOdd = odd;
  }
  return { carrier, level, layers, lead: layers.length > 0 ? layers[0].odd[0] : 0 };
}

/**
 * Where "now" is in a nest: for each layer the flat index of the arc being
 * drawn and how far along it is.
 * @typedef {{ index: number, progress: number }[]} NestPath
 *
 * @param {Nest} nest
 * @param {{ local: number, progress: number }[]} steps per layer: the index of the running
 *   half-cycle INSIDE ITS PARENT ARC and its progress 0..1 (model/halves.js gives these)
 * @returns {NestPath} cut to the layers the nest really has
 */
export function nestPath(nest, steps) {
  const path = [];
  let flat = 0;
  for (let d = 0; d < nest.layers.length && d < steps.length; d++) {
    flat = flat * nest.layers[d].m + steps[d].local;
    path.push({ index: flat, progress: steps[d].progress });
  }
  return path;
}

/** The point of now: on the deepest arc drawn, at its own fraction. null without a path. */
export function nowPoint(frc, nest, path) {
  if (!path || path.length === 0) return null;
  const last = path[path.length - 1];
  return frc.arcPoint(nest.layers[path.length - 1].arcs[last.index], last.progress);
}

/**
 * Paint a nest.
 * @param {CanvasRenderingContext2D} ctx
 * @param {import('../../lib/fractonica.js').Fractonica} frc
 * @param {Nest} nest
 * @param {NestPath | null} path where now is; null paints everything as "to come" (the engraved,
 *   unlit state: out of the catalogue)
 * @param {object} [style]
 * @param {number} [style.heroWidth] weight of the first layer's elapsed arcs
 * @param {number} [style.sigma] glow sigma; 0 = no glow
 * @param {boolean} [style.allElapsed] paint every arc as elapsed (a completed cycle; `path` is ignored)
 * @param {'all' | 'settled' | 'current'} [style.part] `part` splits the painting for a caller that keeps the settled arcs in a bitmap (instrument/draw.js):
 * 'settled' = everything that changes only when an arc is completed (the arc being drawn engraved whole),
 * 'current' = only the lit part of the arcs being drawn, laid over it; 'all' (default) = both in one pass.
 */
export function paintNest(ctx, frc, nest, path, { heroWidth, sigma = 0, allElapsed = false, part = 'all' } = {}) {
  const { color, line, glow, alpha } = theme();
  const hero = heroWidth ?? line.heroPhone;
  // per layer: [width, elapsed colour, elapsed opacity, to-come colour, to-come width]
  const styles = [
    [hero, color.lumen, 1, color.etch3, line.tick],
    [line.engrave, color.lumenMid, alpha.grand, color.etch2, line.engrave],
    [line.deep, color.lumenMid, alpha.great, color.etch2, line.deep],
    [line.hair, color.lumenMid, alpha.great - 0.1, color.etch2, line.hair],
  ];
  const arcGlow = sigma > 0 ? { sigma, alpha: glow.arc } : null;
  // the child cycle that holds now: two neighbouring first-layer arcs (paired by their GLOBAL half index)
  const lead = nest.lead ?? 0;
  const nearCycle = path && path.length > 0 ? (path[0].index + lead) >> 1 : -1;

  for (let d = nest.layers.length - 1; d >= 0; d--) {
    const { arcs } = nest.layers[d];
    const [width, lit, litAlpha, rest, restWidth] = styles[Math.min(d, styles.length - 1)];
    const step = d < (path?.length ?? 0) ? path[d] : null;
    // how many arcs of this layer stand on one first-layer arc
    const perFirst = arcs.length / nest.layers[0].arcs.length;
    const toCome = new Path2D();
    const elapsed = new Path2D();
    const near = new Path2D();
    const current = new Path2D();
    let hasNear = false;
    for (let i = 0; i < arcs.length; i++) {
      if (allElapsed) frc.traceArc(elapsed, arcs[i]);
      else if (step === null || i > step.index) frc.traceArc(toCome, arcs[i]);
      else if (i === step.index) {
        // 'settled': the arc being drawn is engraved whole (the lit part is laid over it by 'current')
        if (part === 'settled') frc.traceArc(toCome, arcs[i]);
        else {
          if (step.progress > 0) frc.traceArc(current, arcs[i], 0, step.progress);
          if (step.progress < 1 && part === 'all') frc.traceArc(toCome, arcs[i], step.progress, 1);
        }
      } else if (d > 0 && (Math.floor(i / perFirst) + lead) >> 1 === nearCycle) {
        frc.traceArc(near, arcs[i]);
        hasNear = true;
      } else frc.traceArc(elapsed, arcs[i]);
    }
    if (part !== 'current') {
      stroke(ctx, toCome, { color: rest, width: restWidth });
      stroke(ctx, elapsed, { color: lit, width, alpha: litAlpha, glow: d === 0 ? arcGlow : null });
      if (hasNear) stroke(ctx, near, { color: d === 1 ? color.lumen : lit, width, alpha: Math.min(1, litAlpha + 0.25) });
    }
    if (step && part !== 'settled') stroke(ctx, current, { color: color.lumen, width: d === 0 ? width : width * 1.2, glow: arcGlow });
  }
}

/**
 * The point of now: a lit disc with a white core and a hairline halo. It
 * never pulses (DESIGN.md section 10).
 * @param {{ x: number, y: number }} point
 * @param {number} radius 2.6 on phones, 3.2 on desktop
 */
export function paintNowPoint(ctx, point, radius, sigma = 0) {
  const { color, glow, alpha } = theme();
  const circle = (r) => {
    const path = new Path2D();
    path.arc(point.x, point.y, r, 0, 2 * Math.PI);
    return path;
  };
  stroke(ctx, circle(radius * 2.6), { color: color.now, width: 0.6, alpha: alpha.nowHalo });
  ctx.save();
  ctx.fillStyle = color.now;
  if (sigma > 0) {
    ctx.shadowColor = color.now;
    ctx.shadowBlur = 2 * sigma * (ctx.ratio ?? 1);
    ctx.globalAlpha = glow.now;
    ctx.fill(circle(radius));
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
  }
  ctx.fill(circle(radius));
  ctx.fillStyle = color.nowCore;
  ctx.fill(circle(radius * 0.45));
  ctx.restore();
}
