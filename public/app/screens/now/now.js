/**
 * now.js - the NOW screen: the instrument and the reading of the present
 * (or of the cursor) beside it. DESIGN.md sections 7 and 9.
 *
 * It follows the screen contract (screens/contract.js):
 *   mount(host, app) -> { update(frame, changed), unmount() }
 *
 * Two parts with different rhythms:
 *   - the instrument repaints on every pass (its arcs fill continuously);
 *   - the text panels are rewritten only when a text can have changed: at the
 *     end of a Blink (the stamp's last term), at a threshold, at a civil
 *     second in Earth mode, or when the state changed.
 */
import { createInstrument } from '../../instrument/instrument.js';
import { civilAt, msToNextSecond } from '../../model/earth.js';
import { h, watchOverflow } from '../../shell/dom.js';
import { readNow } from './now-reading.js';
import { buildPanels } from './panels.js';

/** Spans shorter than ten Blinks show a decimal that moves faster than the Blink: refresh this often (ms). */
const FAST_TEXT_MS = 100;
/** A focus this fine (lambda or finer) has countdowns that short. */
const FAST_TEXT_FROM_LEVEL = 9;

/** The desktop column's designed width (DESIGN.md section 7: x 842 - 1224) and how far it may be scaled. */
const COLUMN_WIDTH = 382;
const COLUMN_MIN_SCALE = 0.7;
const PHONE_WIDTH = 393;
const COLUMN_MAX_SCALE = 1.3;
/** DESIGN.md section 3: no type smaller than 6.2 pt on a phone (CSS px here, everywhere). */
const MIN_TEXT_PX = 6.2;

/**
 * The smallest type in a block as the stylesheet sets it, before the block's own zoom: the floor of the
 * block's scale is MIN_TEXT_PX over it. Read from the page (the stylesheet decides the sizes, per layout).
 * @param {HTMLElement} block
 */
function smallestText(block) {
  let smallest = Infinity;
  for (const element of block.querySelectorAll('*')) {
    if (element instanceof SVGElement || ![...element.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim() !== '')) continue;
    const size = parseFloat(getComputedStyle(element).fontSize);
    if (size > 0 && size < smallest) smallest = size;
  }
  return smallest; // Infinity while the block is still empty: no floor yet
}

export const screen = {
  id: 'now',
  /**
   * @param {HTMLElement} host
   * @param {import('../contract.js').App} app
   * @returns {import('../contract.js').ScreenInstance}
   */
  mount(host, app) {
    const { store, frc, ground, clock } = app;
    const instrument = createInstrument({
      store,
      topInset: () => (store.state.layout === 'phone' ? app.insetTop() : 0),
      onCentre: (centre) => ground.set(centre),
      requestDraw: () => clock.refreshSoon(),
    });
    const panels = buildPanels(frc);
    const root = h('section', { class: 'now', 'aria-label': 'Now' }, h('div', { class: 'now-instrument' }, instrument.element), panels.element);
    host.append(root);

    // desktop: the column was designed 382 px wide; narrower or wider, it is scaled as a whole (CSS zoom)
    const fitColumn = () => {
      const style = getComputedStyle(panels.element);
      const width = panels.element.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      // phone: the block under the instrument was designed for 393 px; a narrower screen gets it smaller
      const wanted = store.state.layout === 'desktop' ? Math.min(COLUMN_MAX_SCALE, Math.max(COLUMN_MIN_SCALE, width / COLUMN_WIDTH)) : Math.min(1, width / PHONE_WIDTH);
      // ... but never so small that its smallest words fall under the design's floor (DESIGN.md section 3)
      const scale = Math.max(wanted, MIN_TEXT_PX / smallestText(panels.element));
      panels.element.style.setProperty('--column-scale', (Math.ceil(scale * 1e4) / 1e4).toFixed(4)); // up: never under the floor
    };
    const columnObserver = new ResizeObserver(fitColumn);
    columnObserver.observe(panels.element);
    // the reading may be taller than the window (a phone on its side, 200 % zoom): whichever box scrolls (the
    // screen on a phone, the column on a desktop) fades out at the bottom while there is more below
    const overflows = [watchOverflow(host), watchOverflow(panels.element)];

    /** When the panels' text is next worth rewriting. */
    let panelsDue = null;
    /** The instant the panels were last written for: an earlier frame means the clock was set back. */
    let panelsFor = null;
    let panelsAt = -Infinity;
    /** Earth mode: the civil second the panels last showed. */
    let shownSecond = -1;

    return {
      update(frame, changed) {
        if (changed?.has('layout')) fitColumn();
        const wants = instrument.update(frame, changed);
        const { mode, focus, layout } = store.state;
        const now = performance.now();
        const second = mode === 'earth' ? civilAt(frc, frame.t).second : -1;
        const due =
          changed !== null ||
          panelsDue === null ||
          frame.t >= panelsDue ||
          (panelsFor !== null && frame.t < panelsFor) || // the wall clock stepped back (NTP, a user): the text shows a later moment
          second !== shownSecond ||
          (focus >= FAST_TEXT_FROM_LEVEL && now - panelsAt >= FAST_TEXT_MS);
        let frameMs = wants.frameMs;
        if (due) {
          const reading = readNow(frame, focus, mode);
          panels.update(reading, layout);
          if (changed !== null) {
            fitColumn(); // the words just written decide the floor of the scale
            for (const overflow of overflows) overflow.check();
          }
          panelsAt = now;
          panelsFor = frame.t;
          shownSecond = second;
          panelsDue = null;
          for (const instant of reading.changes) if (instant !== null && (panelsDue === null || instant < panelsDue)) panelsDue = instant;
        }
        // Earth mode shows a civil clock: it turns over every second
        if (mode === 'earth') frameMs = Math.min(frameMs ?? Infinity, msToNextSecond(frc, frame.t));
        if (focus >= FAST_TEXT_FROM_LEVEL) frameMs = Math.min(frameMs ?? Infinity, FAST_TEXT_MS);
        let next = wants.next;
        if (panelsDue !== null && (next === null || panelsDue < next)) next = panelsDue;
        return { next, frameMs, animating: wants.animating };
      },
      unmount() {
        columnObserver.disconnect();
        for (const overflow of overflows) overflow.destroy();
        instrument.destroy();
        root.remove();
      },
    };
  },
};
