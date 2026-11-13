/**
 * lens.js - the LENS screen: inspect one rung (DESIGN.md sections 7 - 9;
 * renders screen4.png and screen4_pure.png).
 *
 * Everything about one level, any of the 63: its name and kind, its lineage
 * from the Alpha as seals with the factors between, what it is made of, its
 * period counted in every finer unit, its rate, its band, and one cycle of
 * travel in seven media. For a level the instrument can show (0..13: design
 * ruling 9) the ring is live and its four thresholds are said as signed spans
 * from the instant shown. EARTH mode sets the translations beside all of it.
 *
 *   change the rung   the straight limb at the bottom (drag, tap a letter, Left / Right,
 *                     Home / End), or a seal of the lineage
 *   go back           Escape (the shell), or swipe down
 *
 * STATE: `store.state.level` (0..62), changed with `store.setLevel`: the
 * instrument's focus follows it while the level is one it can focus.
 *
 * Two rhythms, as on NOW: the ring repaints on every pass (its arcs fill
 * continuously, at the rate lens-ring.js asks for); the text is rewritten
 * only when a text can have changed (a threshold, the end of a Blink, a civil
 * second in EARTH mode, a change of state).
 *
 * Parts: lens-reading.js (what is said, as data), lens-panels.js (the DOM),
 * lens-ring.js (the ring and its thresholds), styles/lens.css.
 */
import { Unit } from '../../../lib/fractonica.js';
import { createLimb } from '../../instrument/limb-control.js';
import { civilAt, msToNextSecond } from '../../model/earth.js';
import { FOCUS_MAX } from '../../model/url.js';
import { h, watchOverflow } from '../../shell/dom.js';
import { buildPanels } from './lens-panels.js';
import { readLens } from './lens-reading.js';
import { createLensRing } from './lens-ring.js';

/** Spans shorter than ten Blinks show a decimal that moves faster than the Blink: refresh this often (ms). */
const FAST_TEXT_MS = 100;
/** A level this fine (kappa or finer) has thresholds that near. */
const FAST_TEXT_FROM_LEVEL = 9;
/**
 * From this width of the screen up (desktop), the two blocks stand side by side. Both need their full 500 px
 * (styles/lens.css): the left one so that the ring's threshold labels stay clear of the title, the right one
 * for the two columns of EARTH mode (spans of light and metres). 2 x 500 + the gap (7 vw) + 80 of padding is
 * 1177 px at this width; at 900, as it was, a 1024 px window cut the metres off and set the labels on the title.
 */
const SIDE_FROM = 1180;
/** The ring is drawn this much larger where the blocks stand side by side. */
const SIDE_RING_SCALE = 1.3;
const COLUMN_RING_MIN_SCALE = 0.68;
/** A touch that travels this far down (px), mostly vertically, from the top of the content goes back. */
const SWIPE_BACK_PX = 90;

export const screen = {
  id: 'lens',
  /**
   * @param {HTMLElement} host
   * @param {import('../contract.js').App} app
   * @returns {import('../contract.js').ScreenInstance}
   */
  mount(host, app) {
    const { store, frc, cat, ground } = app;
    const last = frc.constants.LEVEL_COUNT - 1;
    const blink = frc.unitLevel(Unit.BLINK);
    const describe = (level) => `${frc.formatLevelName(level)} ${frc.formatLevelWord(level)}`;

    const panels = buildPanels(frc, cat, (level) => store.setLevel(level));
    const ring = createLensRing({ frc });
    // the same control as the instrument's limb, laid straight, over all 63 rungs
    const limb = createLimb({ frc, shape: 'straight', min: 0, max: last, get: () => store.state.level, set: (level) => store.setLevel(level), describe, label: 'Scale: the rung inspected' });
    // two blocks: on a phone one under the other, on a desktop side by side (styles/lens.css)
    const left = h('div', { class: 'lens-left' }, panels.head, panels.title, ring.element, panels.prefix, panels.lineage);
    const right = h('div', { class: 'lens-right' }, panels.rows, panels.media);
    // the body scrolls when it holds more than the screen, and a browser then makes it a Tab stop: name it
    const body = h('div', { class: 'lens-body', role: 'region', 'aria-label': 'Facts of the rung' }, left, right);
    const root = h('section', { class: 'lens', 'aria-label': 'Lens' }, body, limb.element);
    host.append(root);

    /** The ring's box changed since it was last painted (an engraved ring is not repainted otherwise). */
    let ringStale = true;
    /**
     * Choose the arrangement for the width (styles/lens.css) and size the ring for it: larger where the
     * blocks stand side by side; in one column narrower than the design's, smaller, to stay beside the title.
     */
    const fitRing = () => {
      const width = root.clientWidth;
      const side = store.state.layout === 'desktop' && width >= SIDE_FROM;
      root.dataset.arrangement = side ? 'side' : 'column';
      ring.fit(side ? SIDE_RING_SCALE : Math.min(1, Math.max(COLUMN_RING_MIN_SCALE, (width - 140) / 253)));
      ringStale = true;
    };
    const centreGround = () => ground.set(ring.centre());
    /** Say (to the stylesheet) whether there is content below what the screen holds. */
    const overflow = watchOverflow(body);
    const markOverflow = overflow.check;
    let fittedWidth = 0;
    const observer = new ResizeObserver(() => {
      if (root.clientWidth !== fittedWidth) {
        fittedWidth = root.clientWidth;
        fitRing();
        app.clock.refreshSoon(); // the ring is painted for its size on the next pass
      }
      limb.draw();
      centreGround();
      markOverflow();
    });
    observer.observe(root);

    // swipe down: back to where the lens was opened from (touch and pen; a mouse has Escape and the sigils)
    let swipe = null;
    body.addEventListener('pointerdown', (event) => {
      if (event.pointerType === 'mouse' || body.scrollTop > 0) return;
      swipe = { id: event.pointerId, x: event.clientX, y: event.clientY };
    });
    body.addEventListener('pointermove', (event) => {
      if (!swipe || event.pointerId !== swipe.id) return;
      const dx = event.clientX - swipe.x;
      const dy = event.clientY - swipe.y;
      if (dy < -10 || Math.abs(dx) > Math.abs(dy)) swipe = null; // going up or sideways: not this gesture
      else if (dy >= SWIPE_BACK_PX) {
        swipe = null;
        store.back();
      }
    });
    const endSwipe = () => {
      swipe = null;
    };
    body.addEventListener('pointerup', endSwipe);
    body.addEventListener('pointercancel', endSwipe);

    let first = true;
    /** When the text is next worth rewriting. */
    let textDue = null;
    /** The instant the text was last written for: an earlier frame means the wall clock was set back. */
    let textFor = null;
    let textAt = -Infinity;
    /** EARTH mode: the civil second the text last showed. */
    let shownSecond = -1;

    return {
      update(frame, changed) {
        const { level, mode } = store.state;
        if (first || changed?.has('layout')) fitRing();
        if (first || changed?.has('level') || changed?.has('theme') || changed?.has('layout')) limb.update();
        if (changed?.has('theme')) panels.retheme();

        const now = performance.now();
        const fast = level >= FAST_TEXT_FROM_LEVEL && level <= blink + 1;
        const second = mode === 'earth' ? civilAt(frc, frame.t).second : -1;
        const due = first || changed !== null || textDue === null || frame.t >= textDue || (textFor !== null && frame.t < textFor) || second !== shownSecond || (fast && now - textAt >= FAST_TEXT_MS);
        if (due) {
          const reading = readLens(frame, level, mode);
          panels.update(reading);
          ring.write(reading);
          textAt = now;
          textFor = frame.t;
          shownSecond = second;
          // the spans to the thresholds count down in Blinks at the finest
          textDue = frame.inCatalogue ? frame.cycle(blink).end : null;
          for (const instant of reading.changes) if (instant !== null && (textDue === null || instant < textDue)) textDue = instant;
          if (first || changed !== null) markOverflow();
        }
        // a rung without a running cycle here (deeper than the instrument reaches, or outside the catalogue)
        // has an engraved ring: it is painted when it changes, not on every pass
        const engravedRing = level > FOCUS_MAX || !frame.inCatalogue;
        const wants = !engravedRing || ringStale || first || changed !== null ? ring.paint(frame, level) : { next: null, frameMs: null };
        ringStale = false;
        if (first || changed?.has('layout') || changed?.has('level')) centreGround();
        first = false;

        let frameMs = wants.frameMs;
        if (mode === 'earth' && wants.next !== null) frameMs = Math.min(frameMs ?? Infinity, msToNextSecond(frc, frame.t));
        if (fast && frame.inCatalogue) frameMs = Math.min(frameMs ?? Infinity, FAST_TEXT_MS);
        let next = wants.next;
        if (textDue !== null && (next === null || textDue < next)) next = textDue;
        return { next, frameMs };
      },
      unmount() {
        observer.disconnect();
        overflow.destroy();
        panels.destroy();
        ring.destroy();
        limb.destroy();
        root.remove();
      },
    };
  },
};
