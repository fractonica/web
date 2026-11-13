/**
 * marks.js - the small inline SVG marks of the interface: sigils, the mode
 * ring, the Pentad polygon, bead counters, quarter marks, the Sun mark.
 *
 * They are drawn "with the same 1 px line as everything else; there is no
 * bar, no background, no badge" (DESIGN.md section 8), inline, no icon font.
 * Colour is CSS: every shape uses `currentColor` or a class styled in
 * styles/app.css from the token variables, so marks follow the theme.
 * Points on circles come from the core (`frc.arcPoint` on a ring carrier).
 */
import { ringCarrier } from './arcs.js';
import { svg } from '../shell/dom.js';

const fixed = (n) => +n.toFixed(2);

/**
 * The four sigils: ring-with-planet (NOW), rungs (LADDER), reticle (LENS),
 * two half-arcs (WAVE). 24 x 24, drawn around the centre.
 * @param {'now' | 'ladder' | 'lens' | 'wave'} screen
 */
export function sigil(frc, screen) {
  const root = svg('svg', { class: 'sigil', viewBox: '-12 -12 24 24', width: 24, height: 24, 'aria-hidden': 'true' });
  if (screen === 'now') {
    const planet = frc.arcPoint(ringCarrier(frc, 0, 0, 7), 40 / 360); // a little past 1 o'clock
    root.append(svg('circle', { r: 7, class: 'ink' }), svg('circle', { cx: fixed(planet.x), cy: fixed(planet.y), r: 1.9, class: 'solid' }));
  } else if (screen === 'ladder') {
    [14, 11, 8, 5].forEach((width, k) => root.append(svg('path', { d: `M-7 ${-6 + k * 4}h${width}`, class: 'ink' })));
  } else if (screen === 'lens') {
    root.append(svg('circle', { r: 4.5, class: 'ink' }));
    for (let k = 0; k < 4; k++) {
      const a = frc.arcPoint(ringCarrier(frc, 0, 0, 6.5), k / 4);
      const b = frc.arcPoint(ringCarrier(frc, 0, 0, 9), k / 4);
      root.append(svg('path', { d: `M${fixed(a.x)} ${fixed(a.y)}L${fixed(b.x)} ${fixed(b.y)}`, class: 'ink' }));
    }
  } else {
    root.append(svg('path', { d: 'M-9 0A4.5 4.5 0 0 1 0 0A4.5 4.5 0 0 0 9 0', class: 'ink' }));
  }
  return root;
}

/**
 * The mode mark: an empty ring in PURE; the ring gains its cross (the Earth
 * sign) in EARTH. The cross is always present and shown by CSS
 * (`[data-mode=earth] .mode-ring .cross`), so the toggle is one cross-fade.
 */
export function modeRing() {
  return svg(
    'svg',
    { class: 'mode-ring', viewBox: '-9 -9 18 18', width: 18, height: 18, 'aria-hidden': 'true' },
    svg('circle', { r: 7.5, class: 'ink' }),
    svg('path', { d: 'M-7.5 0H7.5M0 -7.5V7.5', class: 'ink cross' }),
  );
}

/**
 * The Pentad mark: a pentagon whose vertices count its Helions, lit through
 * the running one; a square for the Hypopentad (design ruling 10). The roman
 * numeral inside is the core's short form without its leading sign.
 * @returns {{ element: SVGSVGElement, update: (pentad: { index: number, helion: number, helions: number } | null, numeral: string) => void }}
 */
export function pentadMark(frc) {
  const element = svg('svg', { class: 'pentad-mark', viewBox: '-13 -13 26 26', width: 26, height: 26, 'aria-hidden': 'true' });
  let key = '';
  return {
    element,
    update(pentad, numeral) {
      const next = pentad ? `${pentad.index}.${pentad.helion}.${pentad.helions}.${numeral}` : '';
      if (next === key) return;
      key = next;
      element.replaceChildren();
      if (!pentad) return;
      const sides = pentad.helions; // 5, or 4 for the Hypopentad
      const carrier = ringCarrier(frc, 0, 1, 10);
      // a square stands on its side: its first vertex is turned by half a side
      const turn = sides === 4 ? 1 / 8 : 0;
      const points = Array.from({ length: sides }, (_, i) => frc.arcPoint(carrier, i / sides + turn));
      element.append(svg('path', { d: `M${points.map((p) => `${fixed(p.x)} ${fixed(p.y)}`).join('L')}Z`, class: 'ink' }));
      points.forEach((p, i) => {
        const lit = i < pentad.helion;
        element.append(svg('circle', { cx: fixed(p.x), cy: fixed(p.y), r: lit ? 1.9 : 1.5, class: lit ? 'vertex lit' : 'vertex' }));
      });
      if (numeral) element.append(svg('text', { x: 0.2, y: 4.2, class: 'numeral', 'text-anchor': 'middle' }, numeral));
    },
  };
}

/**
 * A sibling counter laid straight: `count` beads, lit through index `lit`.
 * @returns {{ element: SVGSVGElement, update: (count: number, lit: number, pitch?: number) => void }}
 */
export function beadRow() {
  const element = svg('svg', { class: 'beads', height: 6, 'aria-hidden': 'true' });
  let key = '';
  return {
    element,
    /** @param {number} [pitch] px between beads: 8.2 on phones, 9.5 on desktop */
    update(count, lit, pitch = 8.2) {
      const next = `${count}.${lit}.${pitch}`;
      if (next === key) return;
      key = next;
      const width = (count - 1) * pitch + 6;
      element.setAttribute('viewBox', `-3 -3 ${fixed(width)} 6`);
      element.setAttribute('width', fixed(width));
      element.replaceChildren();
      for (let j = 0; j < count; j++) {
        const on = j <= lit;
        element.append(svg('circle', { cx: fixed(j * pitch), cy: 0, r: on ? 1.9 : 1.6, class: on ? 'bead lit' : 'bead' }));
      }
    },
  };
}

/**
 * Where on a ring a threshold sits: a small ring with a dot at 12 (end),
 * 3 (peak), 6 (node) or 9 o'clock (valley).
 * @param {number} fraction the threshold's place on the ring, 0..1 from 12 o'clock
 */
export function quarterMark(frc, fraction) {
  const at = frc.arcPoint(ringCarrier(frc, 0, 0, 5), fraction);
  return svg(
    'svg',
    { class: 'quarter-mark', viewBox: '-8 -8 16 16', width: 16, height: 16, 'aria-hidden': 'true' },
    svg('circle', { r: 5, class: 'ink faint' }),
    svg('circle', { cx: fixed(at.x), cy: fixed(at.y), r: 1.9, class: 'solid' }),
  );
}

/** The Sun as a symbol in a list: a ring with its centre point. */
export function sunMark() {
  return svg(
    'svg',
    { class: 'sun-mark', viewBox: '-7 -7 14 14', width: 14, height: 14, 'aria-hidden': 'true' },
    svg('circle', { r: 4.6, class: 'ink' }),
    svg('circle', { r: 1.1, class: 'solid' }),
  );
}
