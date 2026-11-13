/**
 * icon.js - the app's icon: the Helion's ring in miniature, as an SVG string.
 *
 * WHY HERE: the icon is drawn from the instrument's own geometry (the core's
 * arcs, the token table's colours), never by hand. Two places need it and
 * share this one function: app/main.js puts it in the page as the favicon of
 * the current theme, and tools/icons.mjs writes the files the site ships
 * (public/icons/: favicon SVG, touch icon and the manifest's PNGs), which a
 * browser shows before any script has run and on a home screen.
 *
 * The picture: a void plate, the carrier circle of a Helion (lumen-dim), and
 * its 18 first-level half-cycle arcs (frc_arc_child), the first seven lit in
 * lumen and the rest engraved: "light means elapsed" (DESIGN.md section 1),
 * the instrument as it stands one Preon into a cycle's second third.
 */
import { sealGeometry } from './seal.js';

/** How many of the Helion's 18 arcs the icon shows lit. A picture, not a reading. */
const LIT_ARCS = 7;

/**
 * The icon as an SVG document (viewBox -16 -16 32 32).
 * @param {import('../../lib/fractonica.js').Fractonica} frc
 * @param {{ void: string, plate: string, lumen: string, lumenDim: string, etch3: string }} color a theme's colours
 * @param {{ rounded?: boolean, extent?: number, weight?: number }} [shape] rounded: a rounded plate (a favicon) or a full square
 *   (a touch or manifest icon; the platform rounds it); extent: the ring's outer reach (13 of 16; 10 keeps it
 *   inside the safe circle of a maskable icon); weight: the arcs' stroke in viewBox units at extent 13 (1.5 reads
 *   at 16 px; a large icon wants a finer line)
 * @returns {string}
 */
export function iconSvg(frc, color, { rounded = true, extent = 13, weight = 1.5 } = {}) {
  const level = frc.constants.SYNC_LEVEL;
  const { radius, arcs } = sealGeometry(frc, 0, 0, extent, level);
  const lit = arcs.slice(0, LIT_ARCS).map((arc) => frc.arcSvgPath(arc)).join('');
  const dark = arcs.slice(LIT_ARCS).map((arc) => frc.arcSvgPath(arc)).join('');
  const width = (weight * extent) / 13;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-16 -16 32 32">` +
    `<defs><radialGradient id="p"><stop offset="0" stop-color="${color.plate}"/><stop offset="1" stop-color="${color.void}"/></radialGradient></defs>` +
    `<rect x="-16" y="-16" width="32" height="32"${rounded ? ' rx="7"' : ''} fill="url(#p)"/>` +
    `<circle r="${radius.toFixed(3)}" fill="none" stroke="${color.lumenDim}" stroke-width="${((weight / 1.5) * 0.8 * extent) / 13}"/>` +
    `<path d="${dark}" fill="none" stroke="${color.etch3}" stroke-width="${width}" stroke-linecap="round"/>` +
    `<path d="${lit}" fill="none" stroke="${color.lumen}" stroke-width="${width}" stroke-linecap="round"/>` +
    `</svg>`
  );
}
