/**
 * geometry.js - where the instrument's circles are: sizes, not readings.
 *
 * Two reference arrangements (DESIGN.md sections 5 and 7), each scaled as a
 * whole by one factor k = R / reference R:
 *
 *   phone    R 102   rings +9.5 (majors +6.5)   limb r 209, 8.2 deg per letter, 5 each side
 *   desktop  R 172   rings +13  (majors +10.5)  limb r 352, 5.6 deg per letter, 7 each side
 *
 * `fitInstrument` chooses R and the centre for a box; `ringRadii` lays the
 * counter rings of a focus outside the hero; `heroShape` sizes the carrier
 * and the bezel so that the nested arcs of ANY level fit between them (the
 * design fixes both for the Helion; other levels have fewer, larger arcs). For a focus finer than the
 * Helion there are more ancestors than the reference has room for: the gaps
 * are then tightened (down to 55 %), and beyond that the hero itself is drawn
 * a little smaller, so that the outermost ring never grows past the
 * reference outline. Nothing here reads the clock.
 */
import { MIN_ARC_RADIUS, buildNest, ringCarrier } from '../drawing/arcs.js';
import { CURVED_DESKTOP, CURVED_PHONE } from '../drawing/limb.js';

/** The first counter ring sits at this multiple of the hero radius. */
export const FIRST_RING = 1.37;
/** The inner bezel sits at this multiple of the hero radius. */
export const BEZEL = 0.71;
/**
 * The nested arcs may reach out to this multiple of the hero radius, so that
 * they stay clear of the first counter ring and its planet. The Helion's ring
 * (18 arcs) reaches 1.28: it is drawn at the full radius. A level with few,
 * large arcs (theta has 8) would reach 1.7 and is drawn on a smaller carrier.
 */
const NEST_REACH = 1.335;
/** The Sun's ring exists while the focus is this level (the Helion) or finer. */
const SUN_AFTER_LEVEL = 5; // it follows zeta's ring
const LAST_MAJOR = 3;
/** From this hero radius up the instrument is drawn "big": desktop weights, three nested levels. */
const BIG_FROM = 140;
const TIGHTEST_GAPS = 0.55;

export const REFERENCE = Object.freeze({
  phone: Object.freeze({
    R: 102,
    gap: 9.5,
    gapMajor: 6.5,
    outline: 186.3, // radius of the outermost ring at the Helion focus
    limbRadius: 209,
    limb: CURVED_PHONE,
    depth: 2, // nested levels
    above: 186.3, // room needed above the centre
    below: 233, // and below (the limb and its index)
    firstMark: 214, // radius of the first machining mark of the ground
  }),
  desktop: Object.freeze({
    R: 172,
    gap: 13,
    gapMajor: 10.5,
    outline: 305.7,
    limbRadius: 352,
    limb: CURVED_DESKTOP,
    depth: 3,
    above: 384,
    below: 416,
    firstMark: 371,
  }),
});

/**
 * Choose the hero radius and the centre for a box.
 * @param {object} box
 * @param {'phone' | 'desktop'} box.layout
 * @param {number} box.width the instrument's box, CSS px
 * @param {number} box.height
 * @param {number} box.viewportWidth
 * @param {number} box.viewportHeight
 * @param {number} [box.topInset] phone: px kept free above the outermost ring (status bar, corner marks)
 * @returns {{ layout: string, cx: number, cy: number, R: number, k: number, big: boolean, markScale: number, depth: number }}
 *   R is the reference hero radius for this box; k the scale of the arrangement (gaps, limb radius);
 *   big = draw with the desktop's weights and three nested levels; markScale = scale of marks and type
 */
export function fitInstrument({ layout, width, height, viewportWidth, viewportHeight, topInset = 0 }) {
  const ref = REFERENCE[layout];
  let R;
  let cy;
  if (layout === 'phone') {
    // DESIGN.md section 7: R = min(0.26 x width, 0.2 x height), and it must fit its box
    const span = (ref.above + ref.below) / ref.R;
    R = Math.min(0.26 * viewportWidth, 0.2 * viewportHeight, (height - topInset) / span, (width - 20) / ((2 * ref.outline) / ref.R));
    R = Math.max(36, R);
    const spare = Math.max(0, height - topInset - span * R);
    cy = topInset + spare / 2 + (ref.above / ref.R) * R;
  } else {
    // never above 0.24 x window height; the reference itself is 0.215
    const span = (ref.above + ref.below) / ref.R;
    R = Math.min(0.215 * viewportHeight, width / (728 / ref.R), height / span);
    R = Math.max(36, R);
    // a window taller than it is wide (a portrait tablet) has room the instrument cannot use: it stands
    // as high as it would in a landscape window of that width, level with the column, and the air goes below
    cy = Math.max((ref.above / ref.R) * R * 0.82, Math.min(height, viewportWidth * 0.75) * 0.48);
  }
  // sizes of marks and type follow the instrument's real size, not the arrangement: a small
  // instrument in the desktop arrangement (a narrow window) is drawn with the phone's weights
  const big = R > BIG_FROM;
  return { layout, cx: width / 2, cy, R, k: R / ref.R, big, markScale: Math.min(1.3, Math.max(0.72, R / REFERENCE[big ? 'desktop' : 'phone'].R)), depth: REFERENCE[big ? 'desktop' : 'phone'].depth };
}

/**
 * The radii of everything concentric for a focus.
 * @param {import('../../lib/fractonica.js').Fractonica} frc
 * @param {number} focus 0..13
 * @param {{ layout: string, R: number, k: number }} fit from fitInstrument
 * @returns {{ hero: number, rings: { level: number | 'sun', radius: number, major: boolean }[],
 *            outer: number, limbRadius: number, ringScale: number, heroScale: number }}
 *   rings are ordered outward: the parent of the focus first, the Sun's ring after zeta's, Alpha last
 */
export function ringRadii(frc, focus, fit) {
  const ref = REFERENCE[fit.layout];
  const gap = ref.gap * fit.k;
  const gapMajor = ref.gapMajor * fit.k;
  const outline = ref.outline * fit.k;

  // the steps outward, in order, as [what, distance from the previous ring]
  const steps = [];
  for (let level = focus - 1; level >= 0; level--) {
    const first = steps.length === 0;
    const previous = level + 1; // the ring before this one belongs to the finer level
    steps.push({ level, major: level <= LAST_MAJOR, step: first ? 0 : previous <= LAST_MAJOR + 1 ? gapMajor : gap });
    if (level === SUN_AFTER_LEVEL && focus > SUN_AFTER_LEVEL) steps.push({ level: 'sun', major: false, step: gap, after: gap * 0.16 });
  }
  const natural = steps.reduce((sum, s) => sum + s.step + (s.after ?? 0), 0);
  const room = outline - FIRST_RING * fit.R;
  let ringScale = natural > room ? room / natural : 1;
  let heroScale = 1;
  if (ringScale < TIGHTEST_GAPS) {
    ringScale = TIGHTEST_GAPS;
    heroScale = (outline - natural * TIGHTEST_GAPS) / (FIRST_RING * fit.R);
  }
  const hero = fit.R * heroScale;
  const rings = [];
  let radius = FIRST_RING * hero;
  let carry = 0;
  for (const s of steps) {
    radius += (s.step + carry) * ringScale;
    carry = s.after ?? 0;
    rings.push({ level: s.level, radius, major: s.major });
  }
  return {
    hero,
    rings,
    outer: rings.length > 0 ? rings[rings.length - 1].radius : FIRST_RING * hero,
    limbRadius: ref.limbRadius * fit.k,
    ringScale,
    heroScale,
  };
}

/** Reach of the nested arcs of a focus on a carrier of radius 1, per number of layers drawn. */
const reachCache = new Map();
function unitReach(frc, focus, depth) {
  const key = `${focus}.${depth}`;
  let found = reachCache.get(key);
  if (!found) {
    const nest = buildNest(frc, ringCarrier(frc, 0, 0, 1), focus, { depth, minRadius: 0 });
    found = [];
    let outer = 1;
    let inner = 1;
    for (const layer of nest.layers) {
      let sum = 0;
      for (const arc of layer.arcs) {
        const distance = Math.hypot(arc.cx, arc.cy);
        outer = Math.max(outer, distance + arc.radius);
        inner = Math.min(inner, distance - arc.radius);
        sum += arc.radius;
      }
      found.push({ outer, inner, meanRadius: sum / layer.arcs.length });
    }
    reachCache.set(key, found);
  }
  return found;
}

/**
 * The carrier radius, the bezel radius and the number of nested layers for a
 * focus, such that the arcs stay between the bezel's graduations and the
 * first counter ring. For the Helion this gives exactly the design: carrier
 * = hero radius, bezel = 0.71 x hero.
 * @param {import('../../lib/fractonica.js').Fractonica} frc
 * @param {number} focus
 * @param {number} depth layers wanted (2 on phones, 3 on desktop)
 * @param {number} hero the hero radius (ringRadii().hero)
 * @param {number} tick length of the longest bezel graduation, px
 * @returns {{ carrier: number, bezel: number, depth: number, centre: number }} `centre` is the bezel's
 *   size relative to the design's (1 = as designed): the odometer and the words inside scale with it
 */
export function heroShape(frc, focus, depth, hero, tick) {
  const reach = unitReach(frc, focus, depth);
  let layers = reach.length;
  let carrier = hero;
  for (;;) {
    carrier = Math.min(hero, (NEST_REACH * hero) / reach[layers - 1].outer);
    // a layer whose arcs would be under 3 px is not drawn (design ruling 9, judged by the layer's mean as in
    // drawing/arcs.js buildNest: the design's own Helion keeps its 2.75 px inner arcs); then the reach is smaller
    if (layers > 1 && reach[layers - 1].meanRadius * carrier < MIN_ARC_RADIUS) layers--;
    else break;
  }
  const bezel = Math.min(BEZEL * hero, carrier * reach[layers - 1].inner - tick);
  return { carrier, bezel, depth: layers, centre: bezel / (BEZEL * hero) };
}
