/**
 * seal.js - a level's seal: its ring in miniature, the icon of a level.
 *
 * A seal is the carrier plus the 2 x factor(level) first-level arcs, scaled
 * so that the OUTER EXTENT is the same for every level (11 px in lists, 30 px
 * when focused). Beta and gamma1 look different because 13 is not 5: the icon
 * is the factor (DESIGN.md section 5, "Seals").
 */
import { theme } from '../design/tokens.js';
import { ringCarrier } from './arcs.js';
import { ring, stroke } from './canvas.js';

/**
 * The geometry of a seal: the carrier radius that makes the arcs reach
 * exactly `extent`, and the arcs. All of it is the core's construction: the
 * reach of an outward arc is measured on a unit carrier and scaled.
 * @returns {{ radius: number, carrier: object, arcs: object[] }}
 */
export function sealGeometry(frc, cx, cy, extent, level) {
  const slots = 2 * frc.factor(level);
  const probe = frc.arcChild(ringCarrier(frc, 0, 0, 1), slots, 0, 0);
  const reach = Math.hypot(probe.cx, probe.cy) + probe.radius; // outer extent per unit of carrier radius
  const radius = extent / reach;
  const carrier = ringCarrier(frc, cx, cy, radius);
  const arcs = [];
  for (let j = 0; j < slots; j++) arcs.push(frc.arcChild(carrier, slots, j, j % 2));
  return { radius, carrier, arcs };
}

/**
 * Paint a seal on a canvas.
 * @param {{ color?: string, width?: number, alpha?: number, glow?: { sigma: number, alpha: number } | null }} [style]
 * @returns {number} the carrier radius used
 */
export function paintSeal(ctx, frc, cx, cy, extent, level, { color, width = 0.8, alpha = 1, glow = null } = {}) {
  const tokens = theme();
  const ink = color ?? tokens.color.ash;
  const { radius, arcs } = sealGeometry(frc, cx, cy, extent, level);
  ring(ctx, cx, cy, radius, { color: ink, width: tokens.line.hair, alpha: tokens.alpha.sealCarrier * alpha });
  const path = new Path2D();
  for (const arc of arcs) frc.traceArc(path, arc);
  stroke(ctx, path, { color: ink, width, alpha, glow });
  return radius;
}

/**
 * The same seal as SVG path data, for an icon in the DOM
 * (`<svg viewBox="-e -e 2e 2e"><circle r=radius/><path d=.../></svg>`).
 * @returns {{ radius: number, d: string }}
 */
export function sealSvgPath(frc, extent, level) {
  const { radius, arcs } = sealGeometry(frc, 0, 0, extent, level);
  return { radius, d: arcs.map((arc) => frc.arcSvgPath(arc)).join('') };
}
