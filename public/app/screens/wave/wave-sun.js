/**
 * wave-sun.js - the Sun's lane of the WAVE screen: one solar sync across the
 * width (19 Helions, about four days), and the control for coarse moves.
 *
 * The lane itself stands still: it always shows the whole sync that holds the
 * instant, lit up to it, with the Pentads above and the sync's quarters
 * below (drawing/wave.js `paintSunLane`). A lumen bracket under it marks the
 * part of the sync the wave below shows.
 *
 * COARSE MOVES (DESIGN.md section 8, "four days per width"): drag along the
 * lane and the instant moves with the finger, a whole sync per width of the
 * lane (into the neighbouring sync too); click a place to go there. Keys,
 * when the lane has the focus: Left / Right one Helion, Page Up / Page Down
 * one sync.
 *
 * In the catalogue's first and last partial sync the core has no sync: the
 * lane is engraved and does nothing.
 */
import { fitCanvas } from '../../drawing/canvas.js';
import { paintSunLane, sunLaneBox } from '../../drawing/wave.js';
import { theme } from '../../design/tokens.js';
import { TERMS, stepTerm } from '../../model/travel.js';
import { Unit } from '../../../lib/fractonica.js';
import { capture } from '../../shell/dom.js';

/** A press that travels less than this is a click on a place, not a drag. */
const DRAG_SLOP = 3;
/** The lane's ends stand this far inside the canvas (the design: x 22 on a screen with margins of 20). */
const INSET = 2;

/**
 * @param {object} options
 * @param {import('../../model/store.js').Store} options.store
 */
export function createSunLane({ store }) {
  const { frc, cat } = store;
  const halves = 2 * frc.constants.SYNC_CYCLES;
  const helionTerm = TERMS.findIndex((term) => term.unit === Unit.HELION);
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  const element = document.createElement('div');
  element.className = 'sun-lane';
  element.tabIndex = 0;
  element.setAttribute('role', 'slider');
  element.setAttribute('aria-label', 'Solar sync: coarse moves');
  element.setAttribute('aria-orientation', 'horizontal');
  element.setAttribute('aria-valuemin', '1');
  element.setAttribute('aria-valuemax', String(halves / 2));
  element.append(canvas);

  /** The sync on the lane (the core's), or null. */
  let shown = null;
  let lane = null;
  let drag = null;

  /** Fit the lane to the width it has: its height follows from the size of its arcs. */
  function fit() {
    const width = element.clientWidth;
    if (width < 2) return false;
    const big = store.state.layout === 'desktop';
    const scale = big ? 1.15 : 1;
    const span = width - 2 * INSET;
    const { axis, height } = sunLaneBox(span, halves, scale);
    lane = { width, height, big, x0: INSET, x1: width - INSET, y: axis, halves, scale };
    element.style.height = `${height}px`;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    return true;
  }

  /**
   * @param {ReturnType<typeof import('./wave-reading.js').readWave>} reading
   * @param {{ from: bigint, to: bigint } | null} window the instants at the edges of the wave in view
   */
  function paint(reading, window) {
    if (!lane && !fit()) return;
    const { glow } = theme();
    const ctx = fitCanvas(canvas, lane.width, lane.height);
    const sun = reading.lit ? reading.sun : null;
    shown = sun ? sun.sync : null;
    paintSunLane(ctx, frc, lane, sun, sun && window ? { from: placeOf(window.from), to: placeOf(window.to) } : null, lane.big ? glow.sigmaDesktop : glow.sigmaPhone);
    const set = (name, value) => {
      if (element.getAttribute(name) !== value) element.setAttribute(name, value);
    };
    if (sun) {
      // the running Helion of the sync, counted from 1 as the core counts Helions in a date
      set('aria-valuenow', String((sun.half >> 1) + 1));
      set('aria-valuetext', `Solar sync ${sun.number}, ${sun.pentadName}. ${sun.nextWord} in ${sun.nextSpan}.`);
    } else {
      element.removeAttribute('aria-valuenow');
      set('aria-valuetext', reading.lit ? 'No whole solar sync here' : reading.out);
    }
  }

  /** Where an instant lies on the lane, as a fraction of the shown sync (clamped to its ends). */
  function placeOf(instant) {
    if (instant < shown.start) return 0;
    if (instant >= shown.end) return 1;
    return cat.syncAt(instant).fraction;
  }

  /** The instant at a fraction of the lane; beyond an end, that far into the neighbouring sync. */
  function instantAt(sync, fraction) {
    let target = sync;
    let place = fraction;
    try {
      while (place < 0) {
        target = cat.syncByNumber(target.sync - 1);
        place += 1;
      }
      while (place > 1) {
        target = cat.syncByNumber(target.sync + 1);
        place -= 1;
      }
    } catch {
      // no whole sync further that way: stop at the end of the last one reached
      place = place < 0 ? 0 : 1;
    }
    // the core's first microsecond at that phase of the sync; its end exactly at the far edge
    if (place >= 1) return target.end;
    return cat.timeAtSyncPhase(target.sync, frc.fracFromDouble(place)) ?? target.start;
  }

  element.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || drag || !shown || !lane) return;
    element.focus({ preventScroll: true });
    const t = store.time();
    drag = { id: event.pointerId, x: event.clientX, moved: false, sync: shown, fraction: cat.syncAt(t).fraction };
    capture(element, event.pointerId);
    event.preventDefault();
  });
  element.addEventListener('pointermove', (event) => {
    if (!drag || event.pointerId !== drag.id) return;
    const travelled = event.clientX - drag.x;
    if (!drag.moved && Math.abs(travelled) < DRAG_SLOP) return;
    drag.moved = true;
    // the point follows the finger: a whole sync per width of the lane
    store.setCursor(instantAt(drag.sync, drag.fraction + travelled / (lane.x1 - lane.x0)));
  });
  const release = (event) => {
    if (!drag || event.pointerId !== drag.id) return;
    const { moved, sync } = drag;
    drag = null;
    if (moved || event.type === 'pointercancel') return;
    // a click: go to that place of the sync
    const rect = element.getBoundingClientRect();
    store.setCursor(instantAt(sync, Math.min(1, Math.max(0, (event.clientX - rect.left - lane.x0) / (lane.x1 - lane.x0)))));
  };
  element.addEventListener('pointerup', release);
  element.addEventListener('pointercancel', release);

  element.addEventListener('keydown', (event) => {
    const t = store.time();
    if (!cat.contains(t)) return;
    let target;
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      target = stepTerm(frc, cat, t, helionTerm, event.key === 'ArrowRight' ? 1 : -1);
    } else if ((event.key === 'PageDown' || event.key === 'PageUp') && shown) {
      target = instantAt(shown, cat.syncAt(t).fraction + (event.key === 'PageDown' ? 1 : -1));
    } else return;
    event.preventDefault();
    event.stopPropagation();
    store.setCursor(target);
  });

  return {
    /** The control's root: focusable, role="slider". */
    element,
    fit,
    paint,
    destroy() {
      element.remove();
    },
  };
}
