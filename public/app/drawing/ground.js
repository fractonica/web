/**
 * ground.js - the plate: obsidian, a vignette, and the machining marks.
 *
 * "A plate of obsidian turned on a lathe": concentric hairlines on the SAME
 * centre as the instrument (spacing 19 / 26 / 33 px, repeating), under a
 * radial vignette from `plate` to `void`. It is one fixed canvas behind
 * everything; a screen moves its centre with `set` (the marks re-centre on
 * the new screen's centre, DESIGN.md section 10).
 */
import { theme, withAlpha } from '../design/tokens.js';
import { fitCanvas, ring } from './canvas.js';

/**
 * @param {HTMLCanvasElement} canvas a fixed, full-viewport canvas
 * @returns {{ set: (centre: { cx: number, cy: number, r0?: number }) => void, draw: () => void }}
 *   `set`: centre of the marks in viewport px and the radius of the first mark
 *   (keep the marks out from under the instrument); `draw`: repaint (resize, theme)
 */
export function createGround(canvas) {
  let centre = null;

  function draw() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const { color, line, ground } = theme();
    const ctx = fitCanvas(canvas, width, height);
    const cx = centre?.cx ?? width / 2;
    const cy = centre?.cy ?? height / 2;
    ctx.fillStyle = color.void;
    ctx.fillRect(0, 0, width, height);
    const reach = Math.max(width, height) * ground.vignette;
    const vignette = ctx.createRadialGradient(cx, cy, 0, cx, cy, reach);
    vignette.addColorStop(0, color.plate);
    vignette.addColorStop(0.45, withAlpha(color.plate, 0.55));
    vignette.addColorStop(1, withAlpha(color.void, 0));
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, width, height);
    const far = Math.hypot(Math.max(cx, width - cx), Math.max(cy, height - cy));
    const spacing = ground.markSpacing;
    for (let radius = centre?.r0 ?? spacing[0], i = 0; radius < far; radius += spacing[i % spacing.length], i++) {
      ring(ctx, cx, cy, radius, { color: color.etch1, width: line.hair, alpha: 0.9 - Math.min(0.6, i * 0.03) });
    }
  }

  return {
    set(next) {
      const same = centre && Math.abs(centre.cx - next.cx) < 0.5 && Math.abs(centre.cy - next.cy) < 0.5 && Math.abs((centre.r0 ?? 0) - (next.r0 ?? 0)) < 0.5;
      if (same) return;
      centre = { ...next };
      draw();
    },
    draw,
  };
}
