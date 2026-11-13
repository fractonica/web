/**
 * spine-control.js - the scrubber at the edge of the LADDER: the whole ladder
 * in one line of 63 ticks (drawing/spine.js), as a control.
 *
 *   const spine = createSpine({ count: 63, get, set, describe, rung, view });
 *   host.append(spine.element);          // CSS gives it its box (a narrow strip, full height)
 *   spine.update(turn);                  // after the wheel turned, the focus, the theme or the size changed
 *
 * Input: press or drag anywhere along it to turn the wheel straight to that
 * rung; Up / Down, Page Up / Page Down, Home / End on the keyboard. For
 * assistive technology it is a vertical slider whose value text is the rung's
 * name (pure-safe: the core's letter and word).
 */
import { fitCanvas } from '../../drawing/canvas.js';
import { paintSpine, spineLevelAt } from '../../drawing/spine.js';
import { capture } from '../../shell/dom.js';

/** Room above the first and below the last tick inside the control's box (px). */
const PAD = 6;
/** The ticks end this far from the control's right edge (DESIGN.md section 7: 18 px from the screen's). */
const EDGE = 18;
/** Page Up / Page Down move this many rungs. */
const PAGE = 5;

/**
 * @param {object} options
 * @param {number} options.count rungs on the spine
 * @param {() => number} options.get the rung the wheel is turned to
 * @param {(level: number) => void} options.set turn the wheel to a rung
 * @param {(level: number) => string} options.describe the rung as words (pure-safe)
 * @param {(level: number) => { letter: string, unit: boolean, banded: boolean, marked: boolean }} options.rung
 * @param {() => { before: number, after: number, focus: number }} options.view rows the wheel shows each
 *   side of its index, and the instrument's focus
 */
export function createSpine({ count, get, set, describe, rung, view }) {
  const element = document.createElement('div');
  element.className = 'spine';
  element.tabIndex = 0;
  element.setAttribute('role', 'slider');
  element.setAttribute('aria-label', 'Ladder: all rungs');
  element.setAttribute('aria-orientation', 'vertical');
  element.setAttribute('aria-valuemin', '0');
  element.setAttribute('aria-valuemax', String(count - 1));
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  element.append(canvas);

  let turn = get();
  const clamp = (level) => Math.min(count - 1, Math.max(0, level));
  const extent = () => ({ top: PAD, bottom: element.clientHeight - PAD, count });

  function draw() {
    const width = element.clientWidth;
    const height = element.clientHeight;
    if (width < 2 || height < 2 * PAD + 2) return;
    const ctx = fitCanvas(canvas, width, height);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    paintSpine(ctx, { x: width - EDGE, ...extent(), turn, ...view(), rung });
  }

  function describeValue() {
    const level = get();
    element.setAttribute('aria-valuenow', String(level));
    element.setAttribute('aria-valuetext', describe(level));
  }

  let dragging = null;
  const seek = (event) => {
    const level = clamp(Math.round(spineLevelAt(extent(), event.clientY - element.getBoundingClientRect().top)));
    if (level !== get()) set(level);
  };
  element.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || dragging !== null) return;
    dragging = event.pointerId;
    capture(element, event.pointerId);
    element.focus({ preventScroll: true });
    event.preventDefault();
    seek(event);
  });
  element.addEventListener('pointermove', (event) => {
    if (event.pointerId === dragging) seek(event);
  });
  const release = (event) => {
    if (event.pointerId === dragging) dragging = null;
  };
  element.addEventListener('pointerup', release);
  element.addEventListener('pointercancel', release);

  element.addEventListener('keydown', (event) => {
    const level = get();
    const steps = { ArrowDown: 1, ArrowUp: -1, PageDown: PAGE, PageUp: -PAGE, Home: -count, End: count };
    if (!(event.key in steps) || event.altKey || event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    event.stopPropagation();
    const target = clamp(level + steps[event.key]);
    if (target !== level) set(target);
  });

  describeValue();

  return {
    /** The control's root: focusable, role="slider". */
    element,
    /** Redraw for a turn of the wheel (fractional while it glides), and renew the value for assistive technology. */
    update(next = get()) {
      turn = next;
      describeValue();
      draw();
    },
    destroy() {
      element.remove();
    },
  };
}
