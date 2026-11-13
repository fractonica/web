/**
 * canvas.js - the small Canvas 2D kit every drawing module uses.
 *
 * One job: turn "stroke this path in this token colour, this weight, maybe
 * with glow" into canvas calls that look the same at every devicePixelRatio.
 * It knows nothing about the clock. Geometry (arcs, glyph outlines) arrives
 * as Path2D objects built from the core's answers by the other modules.
 *
 * GLOW (DESIGN.md section 2): "one Gaussian blur of the same path under the
 * crisp stroke". On a canvas that is exactly a shadow with no offset: the
 * shadow is the blurred path, drawn under the stroke in the same call.
 * shadowBlur is twice the Gaussian sigma and is not scaled by the canvas
 * transform, hence the multiplication by the pixel ratio.
 */
import { withAlpha } from '../design/tokens.js';

/**
 * Size a canvas for a CSS box at the device's pixel ratio and return its
 * context, cleared and scaled so that drawing units are CSS px.
 * @param {HTMLCanvasElement} canvas
 * @param {number} width CSS px
 * @param {number} height CSS px
 * @param {number} [ratio] devicePixelRatio
 * @returns {CanvasRenderingContext2D & { ratio: number }}
 */
export function fitCanvas(canvas, width, height, ratio = globalThis.devicePixelRatio || 1) {
  const pixelWidth = Math.max(1, Math.round(width * ratio));
  const pixelHeight = Math.max(1, Math.round(height * ratio));
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.ratio = ratio;
  return ctx;
}

/**
 * Stroke a path. All caps and joins are round (DESIGN.md section 4).
 * @param {CanvasRenderingContext2D & { ratio?: number }} ctx
 * @param {Path2D} path
 * @param {{ color: string, width: number, alpha?: number, glow?: { sigma: number, alpha: number } | null }} style
 */
export function stroke(ctx, path, { color, width, alpha = 1, glow = null }) {
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  if (glow) {
    ctx.shadowColor = withAlpha(color, glow.alpha);
    ctx.shadowBlur = 2 * glow.sigma * (ctx.ratio ?? 1);
  }
  ctx.stroke(path);
  ctx.restore();
}

/** Fill a path (dots of glyphs, discs). Same style object as `stroke`, without `width`. */
export function fill(ctx, path, { color, alpha = 1, glow = null }) {
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  if (glow) {
    ctx.shadowColor = withAlpha(color, glow.alpha);
    ctx.shadowBlur = 2 * glow.sigma * (ctx.ratio ?? 1);
  }
  ctx.fill(path);
  ctx.restore();
}

/** A full circle as a Path2D (a disc to fill, or a ring to stroke). */
export function circlePath(x, y, radius) {
  const path = new Path2D();
  path.arc(x, y, radius, 0, 2 * Math.PI);
  return path;
}

/** A filled disc. */
export function disc(ctx, x, y, radius, style) {
  fill(ctx, circlePath(x, y, radius), style);
}

/** A stroked circle. */
export function ring(ctx, x, y, radius, style) {
  stroke(ctx, circlePath(x, y, radius), style);
}

/** One straight line. */
export function line(ctx, x0, y0, x1, y1, style) {
  const path = new Path2D();
  path.moveTo(x0, y0);
  path.lineTo(x1, y1);
  stroke(ctx, path, style);
}

/**
 * Snap a coordinate to the centre of a device pixel, so a hairline or a glyph
 * stem of odd device width stays crisp (DESIGN.md section 6).
 */
export function snapToPixelCentre(value, ratio) {
  return (Math.floor(value * ratio) + 0.5) / ratio;
}

/**
 * Text on the canvas: engraved words, level letters, readings on the rings.
 * Tracking is letter spacing in px; with centred text the trailing space is
 * compensated so the INK is centred, not the advance.
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} text
 * @param {number} x
 * @param {number} y baseline
 * @param {object} style
 * @param {string} style.font a canvas font string (design/tokens.js canvasFont)
 * @param {string} style.color
 * @param {number} [style.tracking] px between letters
 * @param {'left' | 'center' | 'right'} [style.align]
 * @param {number} [style.rotate] radians, about (x, y)
 * @param {number} [style.alpha]
 * @param {{ color: string, width: number } | null} [style.knock] an outline in the ground colour that
 *   knocks the text out of the lines it lies on
 */
export function text(ctx, text, x, y, { font, color, tracking = 0, align = 'left', rotate = 0, alpha = 1, knock = null }) {
  if (alpha <= 0 || !text) return;
  ctx.save();
  ctx.translate(x, y);
  if (rotate) ctx.rotate(rotate);
  ctx.globalAlpha = alpha;
  ctx.font = font;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = color;
  if (knock) {
    ctx.strokeStyle = knock.color;
    ctx.lineWidth = knock.width;
    ctx.lineJoin = 'round';
  }
  const native = 'letterSpacing' in ctx;
  if (!tracking || native) {
    if (native) ctx.letterSpacing = `${tracking}px`;
    ctx.textAlign = align;
    const shift = align === 'center' ? tracking / 2 : align === 'right' ? tracking : 0;
    if (knock) ctx.strokeText(text, shift, 0);
    ctx.fillText(text, shift, 0);
  } else {
    // browsers without canvas letterSpacing: set the letters one by one
    const letters = [...text];
    const widths = letters.map((letter) => ctx.measureText(letter).width);
    const total = widths.reduce((sum, width) => sum + width, 0) + tracking * (letters.length - 1);
    let pen = align === 'center' ? -total / 2 : align === 'right' ? -total : 0;
    ctx.textAlign = 'left';
    letters.forEach((letter, i) => {
      if (knock) ctx.strokeText(letter, pen, 0);
      ctx.fillText(letter, pen, 0);
      pen += widths[i] + tracking;
    });
  }
  ctx.restore();
}

/** The width a tracked text will take, in px (for laying out a reading set in two colours). */
export function measure(ctx, text, font, tracking = 0) {
  ctx.save();
  ctx.font = font;
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  const width = ctx.measureText(text).width + tracking * Math.max(0, [...text].length - 1);
  ctx.restore();
  return width;
}

/**
 * Uppercase for engraved words, leaving Greek letters as they are: inside
 * caps a level letter is a symbol, not a word (DESIGN.md section 3).
 */
export function engraved(words) {
  return words.replace(/[a-z]+/g, (run) => run.toUpperCase());
}
