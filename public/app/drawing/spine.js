/**
 * spine.js - the whole ladder at the edge of the LADDER screen: 63 ticks, one
 * per rung, top to bottom (DESIGN.md section 8).
 *
 *   unit rungs      a longer tick, lettered
 *   other rungs     a short tick; fainter outside every band
 *   the marked rung the tick of the rung that is visible light, in the h-alpha colour
 *   the window      a bracket in lumen around the rungs the wheel shows
 *   the turn        the tick of the rung under the wheel's index, in bone
 *   the focus       a small ring beside the rung the instrument is focused on
 *
 * Drawing and the hit test only; the control that owns the pointer and the
 * keyboard is screens/ladder/spine-control.js. Letters and kinds are the
 * core's, handed in by the caller.
 */
import { canvasFont, theme } from '../design/tokens.js';
import { line, ring, stroke, text } from './canvas.js';

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} spine
 * @param {number} spine.x the line the ticks end on (they grow to the left)
 * @param {number} spine.top y of the first rung
 * @param {number} spine.bottom y of the last rung
 * @param {number} spine.count rungs (63)
 * @param {number} spine.turn the rung under the wheel's index (fractional while turning)
 * @param {number} spine.before rows the wheel shows above the index
 * @param {number} spine.after rows below it
 * @param {number} spine.focus the instrument's level, or -1
 * @param {(level: number) => { letter: string, unit: boolean, banded: boolean, marked: boolean }} spine.rung
 */
export function paintSpine(ctx, { x, top, bottom, count, turn, before, after, focus, rung }) {
  const { color } = theme();
  const yOf = (level) => top + ((bottom - top) * level) / (count - 1);
  const at = Math.round(turn);
  for (let level = 0; level < count; level++) {
    const { letter, unit, banded, marked } = rung(level);
    const y = yOf(level);
    const on = level === at;
    const ink = marked ? color.hAlpha : on ? color.bone : unit ? color.ash : banded ? color.etch3 : color.etch2;
    line(ctx, x - (unit ? 7 : on ? 5.5 : 3.5), y, x, y, { color: ink, width: marked ? 1.6 : on ? 1.1 : 0.8 });
    if (unit) text(ctx, letter, x - 11, y + 2.6, { font: canvasFont('reading', 7.5, theme().font.earthWeight), color: on ? color.bone : color.ash, align: 'right' });
  }
  // the window of rungs the wheel shows
  const from = yOf(Math.max(0, turn - before)) - 4;
  const to = yOf(Math.min(count - 1, turn + after)) + 4;
  const bracket = new Path2D();
  bracket.moveTo(x + 3, from);
  bracket.lineTo(x + 7, from);
  bracket.lineTo(x + 7, to);
  bracket.lineTo(x + 3, to);
  stroke(ctx, bracket, { color: color.lumen, width: 1 });
  // the rung the instrument is focused on
  if (focus >= 0 && focus < count) ring(ctx, x - 22, yOf(focus), 2.6, { color: color.lumen, width: 0.9 });
}

/** The (fractional) rung at height y of a spine; may lie outside 0..count - 1. */
export function spineLevelAt({ top, bottom, count }, y) {
  return ((y - top) / (bottom - top)) * (count - 1);
}
