/**
 * lens-ring.js - the ring of the LENS: the inspected level's cycle, live, with
 * its four thresholds around it (DESIGN.md sections 5 - 7: R 54, two nested
 * levels, glyph states at u 2.3).
 *
 *   const ring = createLensRing({ frc });
 *   host.append(ring.element);        // CSS places the box; `fit(scale)` sizes it
 *   ring.paint(frame, level);         // every pass: the arcs fill continuously
 *   ring.write(reading);              // when a text may have changed: the threshold labels
 *
 * A canvas (drawing/live-ring.js) and four labels of real text. A rung the
 * instrument cannot show (deeper than level 13: design ruling 9) has no
 * running cycle here: its ring is drawn engraved, as a large seal, and the
 * labels are hidden. Outside the catalogue the ring of a focusable rung is
 * engraved too and its thresholds read "—".
 *
 * The arcs of a level with few, large children (theta has 8) would run into
 * the threshold marks at the design's radius: `heroShape` of
 * instrument/geometry.js gives the carrier on which they fit, exactly as it
 * does for the instrument. The Helion gets the design's R.
 */
import { Quarter } from '../../../lib/fractonica.js';
import { buildNest, ringCarrier } from '../../drawing/arcs.js';
import { fitCanvas } from '../../drawing/canvas.js';
import { paintLiveRing, paintThresholdMarks } from '../../drawing/live-ring.js';
import { FIRST_RING, heroShape } from '../../instrument/geometry.js';
import { readInstrument } from '../../instrument/reading.js';
import { EARTH_SIGN } from '../../model/earth.js';
import { h, setHidden, setReading, setWords } from '../../shell/dom.js';
import { LENS_DEPTH } from './lens-reading.js';

/** The reference ring (phone): everything below is multiplied by the scale given to `fit`. */
const R = 54;
/** The box of the component, the ring at its centre. */
const BOX = 250;
const TICK = 6;
/** Glyph size of the centre odometer and of the threshold states, px per design unit. */
const U_CENTRE = 3.5;
const U_MARK = 2.3;
/**
 * Where each threshold's glyph stands, from the ring's centre, and where its
 * label stands from the glyph: beside it (end, node) or under it (peak, valley).
 */
const PLACES = Object.freeze({
  [Quarter.END]: { name: 'end', x: -24, y: -92, beside: true },
  [Quarter.NODE]: { name: 'node', x: -24, y: 96, beside: true },
  [Quarter.PEAK]: { name: 'peak', x: 96, y: -8, beside: false },
  [Quarter.VALLEY]: { name: 'valley', x: -96, y: -8, beside: false },
});
/** Redraw when the fastest ink has moved this far (px). */
const MOVE_PX = 0.5;

/**
 * @param {object} options
 * @param {import('../../../lib/fractonica.js').Fractonica} options.frc
 */
export function createLensRing({ frc }) {
  const canvas = h('canvas', { class: 'lens-ring-canvas', role: 'img' });
  const labels = Object.fromEntries(
    Object.keys(PLACES).map((quarter) => {
      const label = { word: h('span', { class: 'caps th-word' }), span: h('span', { class: 'th-span' }), earth: h('span', { class: 'earth th-earth', hidden: true }) };
      label.element = h('div', { class: `th th-${PLACES[quarter].name} ${PLACES[quarter].beside ? 'th-beside' : 'th-under'}` }, label.word, label.span, label.earth);
      return [quarter, label];
    }),
  );
  const element = h('div', { class: 'lens-ring' }, canvas, ...Object.values(labels).map((label) => label.element));

  let scale = 1;
  let nest = null;
  let nestKey = '';
  let shape = null;
  /** The threshold marks of the last `write`: what `paint` draws around the ring. */
  let marks = [];

  /** The nest of a level at the current scale (built once per level and size). */
  function nestOf(level) {
    const key = `${level}@${scale}`;
    if (key !== nestKey) {
      nestKey = key;
      shape = heroShape(frc, level, LENS_DEPTH, R * scale, 0);
      const centre = (BOX * scale) / 2;
      nest = buildNest(frc, ringCarrier(frc, centre, centre, shape.carrier), level, { depth: shape.depth, minRadius: 0 });
    }
    return nest;
  }

  return {
    element,
    /** Size the component: 1 = the phone's ring (R 54 in a 250 px box). */
    fit(next) {
      scale = next;
      const size = BOX * scale;
      // a smaller ring keeps its centre where the full-size one has it
      Object.assign(element.style, { width: `${size}px`, height: `${size}px`, marginTop: `${Math.max(0, (BOX - size) / 2)}px`, marginRight: `${Math.max(0, (BOX - size) / 4)}px` });
      element.style.setProperty('--ring-scale', String(scale));
      for (const [quarter, label] of Object.entries(labels)) {
        const place = PLACES[quarter];
        const x = size / 2 + place.x * scale;
        const y = size / 2 + place.y * scale;
        // beside: the label starts right of the glyph, its first baseline just above the glyph's middle;
        // under: centred on the glyph, below it
        Object.assign(label.element.style, place.beside ? { left: `${x + 14 * scale}px`, top: `${y - 2 - 6}px` } : { left: `${x}px`, top: `${y + 22 * scale - 6}px` });
      }
    },
    /** The ring's centre and radius in viewport px (for the plate's machining marks). */
    centre() {
      const box = element.getBoundingClientRect();
      return { cx: box.left + box.width / 2, cy: box.top + box.height / 2, r0: 112 * scale };
    },
    /**
     * Write the threshold labels of a reading (lens-reading.js) and remember
     * its marks for `paint`.
     * @param {import('./lens-reading.js').LensReading} reading
     */
    write(reading) {
      const live = reading.live;
      for (const label of Object.values(labels)) setHidden(label.element, live === null);
      canvas.setAttribute('aria-label', live?.name ? `Ring of ${reading.facts.title}: ${live.name}` : `Ring of ${reading.facts.title}`);
      marks = [];
      if (!live) return;
      const size = BOX * scale;
      for (const item of live.thresholds) {
        const label = labels[item.quarter];
        const place = PLACES[item.quarter];
        label.element.classList.toggle('next', item.next);
        setWords(label.word, item.word);
        setReading(label.span, item.span);
        const key = item.earth;
        if (label.earth.dataset.text !== key) {
          label.earth.dataset.text = key;
          label.earth.replaceChildren();
          setHidden(label.earth, key === '');
          if (key !== '') label.earth.append(h('span', { class: 'sign', 'aria-hidden': 'true', text: EARTH_SIGN }), h('span', { class: 'sr-only', text: 'Earth: ' }), item.earth);
        }
        marks.push({ fraction: item.fraction, glyph: item.glyph, next: item.next, x: size / 2 + place.x * scale, y: size / 2 + place.y * scale });
      }
    },
    /**
     * Paint the ring for an instant.
     * @param {import('../../model/frame.js').Frame} frame
     * @param {number} level
     * @returns {{ next: bigint | null, frameMs: number | null }} when the ring changes next
     */
    paint(frame, level) {
      const size = BOX * scale;
      const centre = size / 2;
      const ctx = fitCanvas(canvas, size, size);
      canvas.style.width = `${size}px`;
      canvas.style.height = `${size}px`;
      const arcs = nestOf(level);
      const live = level <= frc.constants.CLOCK_MAX_LEVEL - LENS_DEPTH && marks.length > 0;
      const reading = live ? readInstrument(frame, level, shape.depth, 'pure') : { lit: false, fraction: 0, steps: null, beads: { count: frc.factor(level), lit: -1 }, digits: null, changes: [] };
      paintLiveRing(ctx, frc, { cx: centre, cy: centre, nest: arcs, reading, scale, unit: U_CENTRE * scale * Math.min(1, shape.centre) });
      if (marks.length > 0) {
        // outside the catalogue no threshold is the next one
        const items = reading.lit ? marks : marks.map((mark) => ({ ...mark, next: false }));
        paintThresholdMarks(ctx, frc, { cx: centre, cy: centre, radius: FIRST_RING * R * scale, tick: TICK * scale, unit: U_MARK * scale, items });
      }
      if (!reading.lit) return { next: null, frameMs: null };
      let next = null;
      for (const instant of reading.changes) if (instant !== null && (next === null || instant < next)) next = instant;
      // how long until the finest arc drawn has filled by MOVE_PX
      const deepest = arcs.layers[arcs.layers.length - 1];
      const cycle = frame.cycle(deepest.level);
      const halfMs = Number(cycle.end - cycle.start) / 2000;
      const travel = Math.abs(deepest.arcs[0].sweep) * deepest.arcs[0].radius;
      return { next, frameMs: (halfMs * MOVE_PX) / travel };
    },
    destroy() {
      element.remove();
    },
  };
}
