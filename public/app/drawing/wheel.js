/**
 * wheel.js - the great wheel of the LADDER: the limb at full length.
 *
 * All 63 rungs lie on the rim of a wheel far larger than the screen (radius
 * 1150 px, centre far to the right), so the few rows in view stand on a
 * shallow arc. The row under the fixed index, at the height of the wheel's
 * centre, is the focused one: it takes twice the room of the others
 * (DESIGN.md section 7: rows at pitch 47, the focused row 2 x 92 tall).
 *
 * This file is geometry and ink only:
 *   wheelRim       the rim as an arc of the core, so that a point on it is `frc.arcPoint`
 *   rowOffset      how far along the rim a row is from the index, for a (fractional) turn
 *   rowAtOffset    the inverse: which row is under a pointer
 *   rimPoint       the point of the rim at an offset
 *   paintRim       the rim itself, fading out towards both ends
 *   paintBandRail  the bands, as broken arcs just outside the rim
 * It knows nothing about rungs: the screen gives it offsets and colours.
 */
import { theme, withAlpha } from '../design/tokens.js';
import { stroke } from './canvas.js';

/** The reference wheel of DESIGN.md section 7. */
export const WHEEL = Object.freeze({
  radius: 1150,
  /** px along the rim between two rows at rest */
  pitch: 47,
  /** px from the focused row to its neighbours */
  focusPitch: 92,
  /** the band rail runs this far outside the rim */
  railGap: 9,
});

/**
 * The rim: a full circle whose leftmost point is (x, cy), as an arc that
 * starts there and runs DOWN the screen, so that a positive offset along it is
 * a row below the index.
 * @param {import('../../lib/fractonica.js').Fractonica} frc
 * @param {number} x the rim's leftmost point (where the focused row's seal sits)
 * @param {number} cy the height of the index
 * @param {number} [radius]
 * @returns {import('../../lib/fractonica.js').Arc}
 */
export function wheelRim(frc, x, cy, radius = WHEEL.radius) {
  const pi = frc.constants.PI;
  return { cx: x + radius, cy, radius, start: pi, sweep: -2 * pi };
}

/** The point of the rim `offset` px along it from the index (positive = below). */
export function rimPoint(frc, rim, offset) {
  return frc.arcPoint(rim, offset / (2 * frc.constants.PI * rim.radius));
}

/**
 * How far along the rim a row is from the index.
 * @param {number} rows the row's distance from the index in rows (level - turn; fractional while turning)
 * @returns {number} px: the first row either side is `focusPitch` away, each further one `pitch` more
 */
export function rowOffset(rows) {
  const distance = Math.abs(rows);
  const offset = distance <= 1 ? distance * WHEEL.focusPitch : WHEEL.focusPitch + (distance - 1) * WHEEL.pitch;
  return rows < 0 ? -offset : offset;
}

/** The inverse of `rowOffset`: the (fractional) row distance of a point `offset` px along the rim. */
export function rowAtOffset(offset) {
  const distance = Math.abs(offset);
  const rows = distance <= WHEEL.focusPitch ? distance / WHEEL.focusPitch : 1 + (distance - WHEEL.focusPitch) / WHEEL.pitch;
  return offset < 0 ? -rows : rows;
}

/**
 * The rim: one engraved line, fading out above and below.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} reach px along the rim, each side of the index, that is drawn
 */
export function paintRim(ctx, frc, rim, reach) {
  const { color, line } = theme();
  const turn = 2 * frc.constants.PI * rim.radius;
  const path = new Path2D();
  frc.traceArc(path, rim, -reach / turn, reach / turn);
  const fade = ctx.createLinearGradient(0, rim.cy - reach, 0, rim.cy + reach);
  fade.addColorStop(0, withAlpha(color.etch3, 0));
  fade.addColorStop(0.22, withAlpha(color.etch3, 0.85));
  fade.addColorStop(0.78, withAlpha(color.etch3, 0.85));
  fade.addColorStop(1, withAlpha(color.etch3, 0));
  ctx.save();
  ctx.strokeStyle = fade;
  ctx.lineWidth = line.tick;
  ctx.lineCap = 'round';
  ctx.stroke(path);
  ctx.restore();
}

/**
 * The band rail: each run of neighbouring rows in one band is an arc just
 * outside the rim; the gaps between the arcs are where the band changes.
 * @param {{ from: number, to: number, marked: boolean, alpha?: number }[]} runs offsets along the rim (px);
 *   `marked` draws the run in the h-alpha colour (the visible band)
 */
export function paintBandRail(ctx, frc, rim, runs) {
  const { color, line } = theme();
  const rail = { ...rim, cx: rim.cx, radius: rim.radius + WHEEL.railGap };
  const turn = 2 * frc.constants.PI * rim.radius; // offsets are measured on the rim, not on the rail
  for (const run of runs) {
    if (run.to <= run.from) continue;
    const path = new Path2D();
    frc.traceArc(path, rail, run.from / turn, run.to / turn);
    stroke(ctx, path, { color: run.marked ? color.hAlpha : color.etch3, width: run.marked ? 1.2 : line.tick, alpha: (run.marked ? 1 : 0.8) * (run.alpha ?? 1) });
  }
}
