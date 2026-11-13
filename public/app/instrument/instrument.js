/**
 * instrument.js - the instrument as a component: canvas, limb, input, accessibility.
 *
 *   const instrument = createInstrument({ store, topInset: () => 91 });
 *   host.append(instrument.element);            // fills its container
 *   clock.add((t, changed) => instrument.update(createFrame(frc, cat, t), changed));
 *
 * It owns:
 *   - a canvas, repainted by draw.js from a reading (reading.js) of the frame it is given;
 *   - the curved limb (limb-control.js), bound to store.state.focus;
 *   - a round button over the centre: open the LENS on the focus;
 *   - wheel and pinch on the instrument: one level finer / coarser;
 *   - the zoom of a focus change (320 ms, the old ring swelling into the place of
 *     the first counter ring while the new one grows into its own; a cut under
 *     reduced motion) and the fades of motion.js;
 *   - its own description for assistive technology, in the current mode.
 *
 * It does not own time: `update(frame)` paints the instant it is handed and
 * answers when it wants to be called again (see model/clock.js).
 */
import { fitCanvas } from '../drawing/canvas.js';
import { buildNest, ringCarrier } from '../drawing/arcs.js';
import { EARTH_SIGN, dateLine } from '../model/earth.js';
import { drawInstrument } from './draw.js';
import { FIRST_RING, REFERENCE, fitInstrument, heroShape, ringRadii } from './geometry.js';
import { createLimb } from './limb-control.js';
import { FADE, createTweens, easeInOut, prefersReducedMotion } from './motion.js';
import { describeInstrument, readInstrument } from './reading.js';
import { FOCUS_MAX, FOCUS_MIN } from '../model/url.js';

/** Wheel distance (px) per level; pinch ratio per level. */
const WHEEL_STEP = 80;
const PINCH_STEP = 1.25;
/** The words for assistive technology are rebuilt at most this often (ms). */
const DESCRIBE_EVERY = 1000;
/** While a fade of motion.js runs, redraw this often (ms). */
const FADE_FRAME_MS = 33;
/** Redraw when the fastest moving ink has moved this far (px). */
const MOVE_PX = 0.5;

/**
 * @param {object} options
 * @param {import('../model/store.js').Store} options.store
 * @param {() => number} [options.topInset] phone: px to keep free above the outermost ring
 * @param {(centre: { cx: number, cy: number, r0: number }) => void} [options.onCentre] told the
 *   centre in viewport px whenever it moves (the ground's machining marks follow it)
 * @param {() => void} [options.requestDraw] ask the scheduler for a pass (after a resize)
 */
export function createInstrument({ store, topInset = () => 0, onCentre = () => {}, requestDraw = () => {} }) {
  const { frc } = store;
  const element = document.createElement('div');
  element.className = 'instrument';
  const canvas = document.createElement('canvas');
  canvas.className = 'instrument-canvas';
  canvas.setAttribute('role', 'img');
  const centreButton = document.createElement('button');
  centreButton.type = 'button';
  centreButton.className = 'instrument-centre';
  centreButton.addEventListener('click', () => store.openLens(store.state.focus));

  const describeLevel = (level) => `${frc.formatLevelName(level)} ${frc.formatLevelWord(level)}`;
  const limb = createLimb({
    frc,
    shape: 'curved',
    min: FOCUS_MIN,
    max: FOCUS_MAX,
    get: () => store.state.focus,
    set: (level) => store.setFocus(level),
    describe: describeLevel,
    label: 'Scale: the focused level',
  });
  element.append(canvas, centreButton, limb.element);

  /** Geometry for the current box and focus; null until the box has a size. */
  let fit = null;
  let radii = null;
  let nest = null;
  let nestKey = '';
  let box = { width: 0, height: 0 };
  let lastFrame = null;
  let shownFocus = store.state.focus;
  /** A focus change in progress: { snapshot, stage, steps, finer, started }. */
  let zoom = null;
  let describedAt = -Infinity;
  const tweens = createTweens(() => store.live && !prefersReducedMotion());

  function layout() {
    const width = element.clientWidth;
    const height = element.clientHeight;
    if (width < 8 || height < 8) return false;
    box = { width, height };
    fit = fitInstrument({
      layout: store.state.layout,
      width,
      height,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      topInset: topInset(),
    });
    radii = ringRadii(frc, store.state.focus, fit);
    // the carrier and the bezel that let this level's arcs fit between them (the Helion's are the design's)
    const longTick = (fit.big ? 7 : 4.6) * fit.markScale;
    Object.assign(radii, heroShape(frc, store.state.focus, fit.depth, radii.hero, longTick));
    const key = `${store.state.focus}|${fit.cx}|${fit.cy}|${radii.carrier}|${radii.depth}`;
    if (key !== nestKey) {
      nestKey = key;
      nest = buildNest(frc, ringCarrier(frc, fit.cx, fit.cy, radii.carrier), store.state.focus, { depth: radii.depth, minRadius: 0 });
    }
    const ref = REFERENCE[fit.layout];
    limb.place({ cx: fit.cx, cy: fit.cy, radius: radii.limbRadius, ...ref.limb, scale: Math.min(1.3, Math.max(0.6, fit.k)) });
    const hit = radii.bezel - 8;
    Object.assign(centreButton.style, { left: `${fit.cx - hit}px`, top: `${fit.cy - hit}px`, width: `${2 * hit}px`, height: `${2 * hit}px` });
    const rect = element.getBoundingClientRect();
    onCentre({ cx: rect.left + fit.cx, cy: rect.top + fit.cy, r0: ref.firstMark * fit.k });
    return true;
  }

  /** Copy the canvas as it is, for the outgoing half of a zoom. */
  function snapshot() {
    const copy = document.createElement('canvas');
    copy.width = canvas.width;
    copy.height = canvas.height;
    copy.getContext('2d').drawImage(canvas, 0, 0);
    return copy;
  }

  /** The nest's settled arcs as a bitmap, repainted only when an arc is completed (instrument/draw.js). */
  const settled = { canvas: document.createElement('canvas'), key: '' };

  function paint(reading, motion) {
    canvas.style.width = `${box.width}px`;
    canvas.style.height = `${box.height}px`;
    const scene = { fit, radii, nest, reading, motion, settled };
    const ctx = fitCanvas(canvas, box.width, box.height);
    const x = zoom ? (performance.now() - zoom.started) / FADE.zoom : 1;
    if (!zoom || x >= 1 || zoom.snapshot.width !== canvas.width) {
      zoom = null;
      drawInstrument(ctx, frc, scene);
      return;
    }
    if (!zoom.stage) {
      zoom.stage = document.createElement('canvas');
      drawInstrument(fitCanvas(zoom.stage, box.width, box.height), frc, scene);
    }
    // going finer the old ring swells to where the first counter ring is, the new one grows from inside it
    const eased = easeInOut(x);
    const grow = Math.min(FIRST_RING ** zoom.steps, 2.2) ** (zoom.finer ? 1 : -1);
    const layer = (image, scale, alpha) => {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = alpha;
      ctx.translate(fit.cx * ctx.ratio, fit.cy * ctx.ratio);
      ctx.scale(scale, scale);
      ctx.translate(-fit.cx * ctx.ratio, -fit.cy * ctx.ratio);
      ctx.drawImage(image, 0, 0);
      ctx.restore();
    };
    layer(zoom.snapshot, grow ** eased, 1 - eased);
    layer(zoom.stage, grow ** (eased - 1), eased);
  }

  /** How long until the fastest ink has moved MOVE_PX: the finest arc drawn, or the alidade's tip. */
  function frameInterval(frame) {
    if (!frame.inCatalogue || !nest) return null;
    const millis = (cycle) => (cycle.start === null || cycle.end === null ? 0 : Number(cycle.end - cycle.start) / 1000);
    const deepest = nest.layers[nest.layers.length - 1];
    const arc = deepest.arcs[0];
    const arcTravel = Math.abs(arc.sweep) * arc.radius; // px along one half-cycle
    const perHalf = millis(frame.cycle(deepest.level)) / 2;
    const turn = 2 * frc.constants.PI * radii.outer; // px the alidade's tip travels in one cycle
    const perTurn = millis(frame.cycle(store.state.focus));
    return Math.min((perHalf * MOVE_PX) / arcTravel, (perTurn * MOVE_PX) / turn);
  }

  function describe(frame) {
    const now = performance.now();
    if (now - describedAt < DESCRIBE_EVERY) return;
    describedAt = now;
    let words = describeInstrument(frame, store.state.focus);
    if (store.state.mode === 'earth') words += ` ${EARTH_SIGN} ${dateLine(frc, frame.t)}.`;
    if (canvas.getAttribute('aria-label') !== words) canvas.setAttribute('aria-label', words);
    const open = `Open the lens on ${describeLevel(store.state.focus)}`;
    if (centreButton.getAttribute('aria-label') !== open) centreButton.setAttribute('aria-label', open);
  }

  /**
   * Paint the frame. `changed` is the set of store keys that changed since
   * the last pass (null when only time moved).
   * @returns {{ next: bigint | null, frameMs: number | null, animating: boolean }}
   */
  function update(frame, changed = null) {
    lastFrame = frame;
    const focus = store.state.focus;
    if (changed?.has('focus') && focus !== shownFocus && fit && canvas.width > 1 && !prefersReducedMotion()) {
      zoom = { snapshot: snapshot(), stage: null, steps: Math.abs(focus - shownFocus), finer: focus > shownFocus, started: performance.now() };
    }
    if (changed && (changed.has('focus') || changed.has('cursor') || changed.has('layout') || changed.has('mode'))) {
      tweens.reset();
      describedAt = -Infinity;
    }
    if (!fit || changed?.has('focus') || changed?.has('layout') || changed?.has('theme')) {
      if (!layout()) return { next: null, frameMs: null, animating: false };
    }
    shownFocus = focus;
    if (changed?.has('focus') || changed?.has('theme')) limb.update();

    const reading = readInstrument(frame, focus, radii.depth, store.state.mode);
    const motion = reading.lit
      ? {
          next: tweens.follow('next', reading.next, FADE.threshold),
          beads: tweens.follow('beads', reading.beads.lit, FADE.bead),
          digits: tweens.follow('digits', reading.digits, FADE.glyph),
        }
      : null;
    paint(reading, motion);
    describe(frame);

    let next = null;
    for (const instant of reading.changes) if (instant !== null && (next === null || instant < next)) next = instant;
    // a fade is redrawn at the modest rate of the clock (30 per second); only the zoom runs at the display's
    const frameMs = tweens.active ? Math.min(frameInterval(frame) ?? Infinity, FADE_FRAME_MS) : frameInterval(frame);
    return { next, frameMs, animating: zoom !== null };
  }

  // --- input: wheel and pinch step the focus --------------------------------
  let wheel = 0;
  element.addEventListener(
    'wheel',
    (event) => {
      event.preventDefault();
      wheel += event.deltaMode === 1 ? event.deltaY * 30 : event.deltaY;
      // rolling away (up) goes in: one level finer
      while (wheel <= -WHEEL_STEP) {
        wheel += WHEEL_STEP;
        store.stepFocus(1);
      }
      while (wheel >= WHEEL_STEP) {
        wheel -= WHEEL_STEP;
        store.stepFocus(-1);
      }
    },
    { passive: false },
  );
  const fingers = new Map();
  let pinchBase = 0;
  const spread = () => {
    const [a, b] = [...fingers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };
  element.addEventListener('pointerdown', (event) => {
    if (event.pointerType !== 'touch') return;
    fingers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (fingers.size === 2) pinchBase = spread();
  });
  element.addEventListener('pointermove', (event) => {
    if (!fingers.has(event.pointerId)) return;
    fingers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (fingers.size !== 2 || pinchBase <= 0) return;
    const ratio = spread() / pinchBase;
    // spreading the fingers goes in: one level finer
    if (ratio >= PINCH_STEP) {
      store.stepFocus(1);
      pinchBase = spread();
    } else if (ratio <= 1 / PINCH_STEP) {
      store.stepFocus(-1);
      pinchBase = spread();
    }
  });
  const lift = (event) => {
    fingers.delete(event.pointerId);
    pinchBase = 0;
  };
  element.addEventListener('pointerup', lift);
  element.addEventListener('pointercancel', lift);

  const observer = new ResizeObserver(() => {
    if (layout()) {
      zoom = null;
      if (lastFrame) update(lastFrame, null);
      else requestDraw();
    }
  });
  observer.observe(element);

  return {
    /** The root element; give it a size with CSS, it fills it. */
    element,
    update,
    /** Recompute the geometry (the box or an inset changed without a resize event). */
    layout,
    /** { cx, cy, R, hero, carrier, bezel, outer, limbRadius } in the element's own px, or null before the first layout. */
    geometry: () => (fit ? { cx: fit.cx, cy: fit.cy, R: fit.R, hero: radii.hero, carrier: radii.carrier, bezel: radii.bezel, outer: radii.outer, limbRadius: radii.limbRadius } : null),
    destroy() {
      observer.disconnect();
      limb.destroy();
      element.remove();
    },
  };
}
