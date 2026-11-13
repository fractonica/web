/**
 * limb.js - drawing the limb: the scale of level letters under a fixed index.
 *
 * Two shapes of the same scale (DESIGN.md section 8):
 *   curved    lying on a circle concentric with the instrument, the index at
 *             6 o'clock, one letter per `step` degrees (NOW)
 *   straight  laid flat, one letter per `pitch` px (LENS, WAVE)
 *
 * Unit levels are ash, levels between units darker, the level under the
 * index bone and larger. `value` may be fractional while the limb is being
 * turned: the letters slide, the index stays.
 *
 * This file only draws and answers "which level is under this point"; the
 * control that owns the pointer and the keyboard is instrument/limb-control.js.
 * Letters and kinds come from the core (`formatLevelName`, `levelKind`).
 */
import { LevelKind } from '../../lib/fractonica.js';
import { canvasFont, theme, withAlpha } from '../design/tokens.js';
import { ringCarrier } from './arcs.js';
import { line, stroke, text } from './canvas.js';

/** The reference limbs of DESIGN.md section 7, per unit of instrument scale. */
export const CURVED_PHONE = Object.freeze({ step: 8.2, span: 5, big: false });
export const CURVED_DESKTOP = Object.freeze({ step: 5.6, span: 7, big: true });
export const STRAIGHT_PITCH = 34;

const letterCache = new Map();
/** { letter, unit } of a level: the core's letter, and whether the level is a named unit. */
export function limbLetter(frc, level) {
  let found = letterCache.get(level);
  if (!found) {
    const kind = frc.levelKind(level);
    found = { letter: frc.formatLevelName(level), unit: kind === LevelKind.MAJOR || kind === LevelKind.UNIT };
    letterCache.set(level, found);
  }
  return found;
}

/**
 * The curved limb.
 * @param {CanvasRenderingContext2D} ctx
 * @param {import('../../lib/fractonica.js').Fractonica} frc
 * @param {object} limb
 * @param {number} limb.cx centre of the instrument
 * @param {number} limb.cy
 * @param {number} limb.radius the circle the letters lie on
 * @param {number} limb.step degrees per letter
 * @param {number} limb.span letters shown each side of the index
 * @param {boolean} limb.big desktop sizes
 * @param {number} limb.value the level under the index (fractional while turning)
 * @param {number} limb.min first level of the scale
 * @param {number} limb.max last level of the scale
 * @param {number} [limb.scale] scale of sizes that follow the instrument (1 = reference)
 */
export function paintCurvedLimb(ctx, frc, { cx, cy, radius, step, span, big, value, min, max, scale = 1 }) {
  const { color } = theme();
  const turn = 360;
  const ruleRadius = radius - (big ? 20 : 14) * scale;
  const rule = ringCarrier(frc, cx, cy, ruleRadius);
  const reach = (span * step + 5) / turn; // the rule's half-length as a fraction of a turn
  // the rule fades out towards both ends
  const left = frc.arcPoint(rule, 0.5 + reach);
  const right = frc.arcPoint(rule, 0.5 - reach);
  const fade = ctx.createLinearGradient(left.x, 0, right.x, 0);
  fade.addColorStop(0, withAlpha(color.etch3, 0));
  fade.addColorStop(0.3, color.etch3);
  fade.addColorStop(0.7, color.etch3);
  fade.addColorStop(1, withAlpha(color.etch3, 0));
  const rulePath = new Path2D();
  frc.traceArc(rulePath, rule, 0.5 - reach, 0.5 + reach);
  ctx.save();
  ctx.strokeStyle = fade;
  ctx.lineWidth = 0.75;
  ctx.stroke(rulePath);
  ctx.restore();

  const focus = Math.round(value);
  for (let level = Math.max(min, Math.ceil(value - span - 0.5)); level <= Math.min(max, Math.floor(value + span + 0.5)); level++) {
    const offset = level - value; // letters to the right of the index are finer
    const on = level === focus;
    const { letter, unit } = limbLetter(frc, level);
    const fraction = 0.5 - (offset * step) / turn; // 6 o'clock is half a turn from 12
    const size = (on ? (big ? 26 : 20) : big ? 16 : 13) * scale;
    const edge = Math.max(0, Math.min(1, span + 0.5 - Math.abs(offset))); // fade in at the ends
    const opacity = (on ? 1 : Math.max(0.4, 1 - Math.abs(offset) / (span + 3.5))) * edge;
    const at = frc.arcPoint(ringCarrier(frc, cx, cy, radius + (on ? 2 : 0)), fraction);
    text(ctx, letter, at.x, at.y + size * 0.3, {
      font: canvasFont('reading', size),
      color: on ? color.bone : unit ? color.ash : color.limbBetween,
      align: 'center',
      rotate: (-offset * step * frc.constants.PI) / 180,
      alpha: opacity,
    });
    const a = frc.arcPoint(rule, fraction);
    const b = frc.arcPoint(ringCarrier(frc, cx, cy, ruleRadius + (unit ? 5 : 2.5) * scale), fraction);
    line(ctx, a.x, a.y, b.x, b.y, { color: on ? color.lumen : unit ? color.etch3 : color.etch2, width: on ? 1.2 : 0.8, alpha: edge });
  }
  paintIndex(ctx, cx, cy + radius + (big ? 22 : 17) * scale);
}

/** The radius band a pointer must be in to turn the curved limb. */
export function curvedLimbBand({ radius, big, scale = 1 }) {
  return { inner: radius - (big ? 30 : 24) * scale, outer: radius + (big ? 36 : 30) * scale };
}

/**
 * The (fractional) level under a point of the curved limb.
 * @returns {number} may lie outside [min, max]
 */
export function curvedLimbLevelAt({ cx, cy, step, value }, x, y) {
  // angle from 6 o'clock, positive towards 3 o'clock (the finer side), in degrees
  const degrees = (Math.atan2(x - cx, y - cy) * 180) / Math.PI;
  return value + degrees / step;
}

/**
 * The straight limb: the same scale, laid flat around (cx, y).
 * @param {object} limb
 * @param {number} limb.cx the index
 * @param {number} limb.y baseline of the letters
 * @param {number} limb.width px available (letters fade towards the ends)
 * @param {number} [limb.pitch] px per letter
 */
export function paintStraightLimb(ctx, frc, { cx, y, width, pitch = STRAIGHT_PITCH, value, min, max }) {
  const { color } = theme();
  const span = Math.max(1, Math.floor((width / 2 - 12) / pitch));
  const half = Math.min(width / 2, span * pitch + 24);
  const fade = ctx.createLinearGradient(cx - half, 0, cx + half, 0);
  fade.addColorStop(0, withAlpha(color.etch2, 0));
  fade.addColorStop(0.15, color.etch2);
  fade.addColorStop(0.85, color.etch2);
  fade.addColorStop(1, withAlpha(color.etch2, 0));
  ctx.save();
  ctx.strokeStyle = fade;
  ctx.lineWidth = 0.75;
  ctx.beginPath();
  ctx.moveTo(cx - half, y - 20);
  ctx.lineTo(cx + half, y - 20);
  ctx.stroke();
  ctx.restore();

  const focus = Math.round(value);
  for (let level = Math.max(min, Math.ceil(value - span - 0.5)); level <= Math.min(max, Math.floor(value + span + 0.5)); level++) {
    const offset = level - value;
    const on = level === focus;
    const { letter, unit } = limbLetter(frc, level);
    const x = cx + offset * pitch;
    const edge = Math.max(0, Math.min(1, span + 0.5 - Math.abs(offset)));
    text(ctx, letter, x, y + (on ? 2 : 0), {
      font: canvasFont('reading', on ? 20 : 13),
      color: on ? color.bone : unit ? color.ash : color.limbBetween,
      align: 'center',
      alpha: (on ? 1 : Math.max(0.3, 1 - Math.abs(offset) * 0.14)) * edge,
    });
    line(ctx, x, y - 20, x, y - (unit ? 25 : 22.5), { color: on ? color.lumen : unit ? color.etch3 : color.etch2, width: on ? 1.2 : 0.8, alpha: edge });
  }
  paintIndex(ctx, cx, y + 10);
}

/** The (fractional) level under a point of the straight limb. */
export function straightLimbLevelAt({ cx, pitch = STRAIGHT_PITCH, value }, x) {
  return value + (x - cx) / pitch;
}

/** The fixed index: a small caret under the scale, in lumen. */
function paintIndex(ctx, x, y) {
  const { color } = theme();
  const caret = new Path2D();
  caret.moveTo(x - 4.5, y + 5);
  caret.lineTo(x, y);
  caret.lineTo(x + 4.5, y + 5);
  stroke(ctx, caret, { color: color.lumen, width: 1.1 });
}
