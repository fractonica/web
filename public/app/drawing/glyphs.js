/**
 * glyphs.js - phase glyphs and odometers, drawn from the core's outlines.
 *
 * The outline of a glyph state is `frc.glyphPath` (SPEC 9.1: stem 3 u per
 * trit, reach 2, bow 1, bar 2, ink 0.3 u, the dot). Nothing here knows what a
 * state means; it only places outlines: `u` px per design unit, stems
 * `pitch` units apart, the box centred vertically the way DESIGN.md section 6
 * says (on y = (3 d - 2.05) / 2 design units below the stem's top).
 *
 * Two renderers: a canvas one (the centre of the instrument) and an SVG one
 * (odometers that live in the DOM flow: the Sun's, the period pair).
 */
import { fill, snapToPixelCentre, stroke } from './canvas.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
/** Stems of the hero odometer are this many design units apart; the Sun's are SUN_PITCH. */
export const PAIR_PITCH = 5.6;
export const SUN_PITCH = 6.4;

/** Path2D outlines by "index.strokes.u": a glyph is redrawn far more often than it changes. */
const outlines = new Map();
function outline(frc, index, strokes, u) {
  const key = `${index}.${strokes}.${u}`;
  let found = outlines.get(key);
  if (!found) {
    if (outlines.size > 600) outlines.clear();
    found = frc.glyphPath2D(frc.glyphFromIndex(index, strokes), { scale: u });
    outlines.set(key, found);
  }
  return found;
}

/** Distance from the top of the stem to the vertical centre of the glyph box, in design units. */
const boxCentre = (strokes) => (3 * strokes - 2.05) / 2;

/**
 * The `u` nearest to the wanted one at which the ink (0.3 u) is a whole
 * number of device pixels, so that a snapped stem is perfectly crisp
 * (DESIGN.md section 6). Used for the big odometer only.
 */
export function crispUnit(frc, u, ratio) {
  const inkPerUnit = frc.constants.GLYPH_INK / frc.constants.GLYPH_UNIT;
  const pixels = Math.max(1, Math.round(u * inkPerUnit * ratio));
  return pixels / (inkPerUnit * ratio);
}

/**
 * How far the ink of an odometer can reach from the point paintOdometer centres it on, in design units:
 * the farthest corner of the union of every state's ink (`frc.glyphBounds`: the dot above included), so the
 * answer does not change with the digits shown (an odometer sized by it never jumps). A circle of radius r
 * holds the odometer whenever u <= r / odometerExtent(...).
 * @param {import('../../lib/fractonica.js').Fractonica} frc
 * @param {number} count glyphs in the row
 * @param {{ strokes?: number, pitch?: number, dy?: number }} [place] dy: the row's centre below the point, in u
 */
export function odometerExtent(frc, count, { strokes = 2, pitch = PAIR_PITCH, dy = 0 } = {}) {
  const unit = frc.constants.GLYPH_UNIT;
  const bounds = frc.glyphBounds(strokes);
  const x = (pitch * (count - 1)) / 2 + Math.max(-bounds.minX, bounds.maxX) / unit;
  const top = dy - boxCentre(strokes) + bounds.minY / unit;
  const bottom = dy - boxCentre(strokes) + bounds.maxY / unit;
  return Math.hypot(x, Math.max(-top, bottom));
}

/**
 * Draw glyphs side by side on a canvas, centred on (x, y).
 * @param {CanvasRenderingContext2D & { ratio?: number }} ctx
 * @param {import('../../lib/fractonica.js').Fractonica} frc
 * @param {readonly number[]} digits glyph state indices, coarsest first (an Odometer's `digits`)
 * @param {object} place
 * @param {number} place.x centre of the row
 * @param {number} place.y centre of the glyph box
 * @param {number} place.u px per design unit
 * @param {number} [place.strokes] strokes per glyph (2)
 * @param {number} [place.pitch] design units between stems
 * @param {boolean} [place.snap] snap stems to the device pixel grid (use with `crispUnit`)
 * @param {{ color: string, alpha?: number, glow?: { sigma: number, alpha: number } | null }} style
 */
export function paintOdometer(ctx, frc, digits, { x, y, u, strokes = 2, pitch = PAIR_PITCH, snap = false }, style) {
  const ratio = ctx.ratio ?? 1;
  const first = x - (pitch * u * (digits.length - 1)) / 2;
  const top = y - boxCentre(strokes) * u;
  digits.forEach((index, i) => {
    const glyph = outline(frc, index, strokes, u);
    // ink of an odd number of device pixels sits on a pixel centre, an even one on a pixel edge
    const odd = Math.round(glyph.lineWidth * ratio) % 2 === 1;
    const crisp = (value) => (odd ? snapToPixelCentre(value, ratio) : Math.round(value * ratio) / ratio);
    ctx.save();
    ctx.translate(snap ? crisp(first + i * pitch * u) : first + i * pitch * u, snap ? crisp(top) : top);
    stroke(ctx, glyph.stroke, { ...style, width: glyph.lineWidth });
    if (glyph.fill) fill(ctx, glyph.fill, style);
    ctx.restore();
  });
}

/**
 * An odometer as an inline SVG element for the DOM flow. Colour comes from
 * CSS (`stroke: currentColor` on `.glyphs path`, see styles/app.css), so the
 * element takes the colour of its context (lumen, or sol for the Sun).
 * @param {import('../../lib/fractonica.js').Fractonica} frc
 * @param {readonly number[]} digits
 * @param {{ u: number, strokes?: number, pitch?: number }} place
 * @returns {SVGSVGElement} sized to the ink bounds the core reports; `data-digits` holds the states
 */
export function odometerSvg(frc, digits, { u, strokes = 2, pitch = PAIR_PITCH }) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'glyphs');
  svg.setAttribute('aria-hidden', 'true');
  updateOdometerSvg(frc, svg, digits, { u, strokes, pitch });
  return svg;
}

/** Redraw an `odometerSvg` element when its digits (or its size) change; cheap when they did not. */
export function updateOdometerSvg(frc, svg, digits, { u, strokes = 2, pitch = PAIR_PITCH }) {
  const key = `${digits.join(' ')}@${u}`;
  if (svg.dataset.key === key) return;
  svg.dataset.key = key;
  svg.dataset.digits = digits.join(' ');
  const unit = frc.constants.GLYPH_UNIT;
  const bounds = frc.glyphBounds(strokes);
  const left = (bounds.minX / unit) * u;
  const top = (bounds.minY / unit) * u;
  const width = ((bounds.maxX - bounds.minX) / unit) * u + pitch * u * Math.max(0, digits.length - 1);
  const height = ((bounds.maxY - bounds.minY) / unit) * u;
  svg.setAttribute('viewBox', `${left} ${top} ${width} ${height}`);
  svg.setAttribute('width', width.toFixed(2));
  svg.setAttribute('height', height.toFixed(2));
  svg.replaceChildren();
  digits.forEach((index, i) => {
    const data = frc.glyphSvgPath(frc.glyphFromIndex(index, strokes), { scale: u, x: i * pitch * u, y: 0 });
    const ink = document.createElementNS(SVG_NS, 'path');
    ink.setAttribute('d', data.stroke);
    ink.setAttribute('stroke-width', String(data.lineWidth));
    svg.append(ink);
    if (data.fill) {
      const dot = document.createElementNS(SVG_NS, 'path');
      dot.setAttribute('d', data.fill);
      dot.setAttribute('class', 'dot');
      svg.append(dot);
    }
  });
}
