/**
 * limb-control.js - THE control for moving across the scales: the limb.
 *
 * One reusable control, two shapes (drawing/limb.js): curved under the
 * instrument on NOW, laid straight on other screens. It is a slider of
 * levels in the accessibility sense too: focusable, arrow keys, a value text.
 *
 *   const limb = createLimb({ frc, shape: 'straight', min: 0, max: 13,
 *                             get: () => store.state.focus,
 *                             set: (level) => store.setFocus(level),
 *                             describe: (level) => 'η Eta' });
 *   host.append(limb.element);
 *   limb.update();            // after the bound value, the theme or the size changed
 *
 * Input (DESIGN.md section 8): drag along the scale (mouse, touch, pen: the
 * letters follow the finger and the bound value changes each time another
 * letter passes the index), tap or click a letter to go straight there,
 * Left / Right (and Home / End) on the keyboard.
 *
 * The curved shape needs to know the instrument's circle: call
 * `limb.place({ cx, cy, radius, step, span, big, scale })` with coordinates in
 * the control's offset parent; the control then sizes itself to the band the
 * scale occupies. The straight shape fills the width of its container.
 */
import { CURVED_PHONE, STRAIGHT_PITCH, curvedLimbBand, curvedLimbLevelAt, paintCurvedLimb, paintStraightLimb, straightLimbLevelAt } from '../drawing/limb.js';
import { ringCarrier } from '../drawing/arcs.js';
import { fitCanvas } from '../drawing/canvas.js';

/** A press that moves less than this many px is a tap on a letter, not a turn. */
const TAP_SLOP = 5;
/** Settling of the letters after a turn or a step (ms); a cut under reduced motion. */
const SETTLE_MS = 180;
const STRAIGHT_HEIGHT = 64;

/**
 * @param {object} options
 * @param {import('../../lib/fractonica.js').Fractonica} options.frc
 * @param {'curved' | 'straight'} options.shape
 * @param {number} options.min first level of the scale
 * @param {number} options.max last level of the scale
 * @param {() => number} options.get the bound level
 * @param {(level: number) => void} options.set change the bound level
 * @param {(level: number) => string} options.describe the value as words for assistive technology
 *   (must be pure-safe: it is read in pure mode too)
 * @param {string} [options.label] the control's accessible name
 */
export function createLimb({ frc, shape, min, max, get, set, describe, label = 'Scale' }) {
  const element = document.createElement('div');
  element.className = `limb limb-${shape}`;
  element.tabIndex = 0;
  element.setAttribute('role', 'slider');
  element.setAttribute('aria-label', label);
  element.setAttribute('aria-orientation', 'horizontal');
  element.setAttribute('aria-valuemin', String(min));
  element.setAttribute('aria-valuemax', String(max));
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  element.append(canvas);

  /** Curved: the instrument's circle in the offset parent's coordinates. */
  let placed = { cx: 0, cy: 0, radius: 100, ...CURVED_PHONE, scale: 1 };
  /** The box of the control inside its offset parent (curved shape). */
  let box = { left: 0, top: 0, width: 0, height: 0 };
  /** What the index shows right now: the bound level plus the slide of a turn in progress. */
  let shown = get();
  let drag = null;
  let settle = null;
  const reducedMotion = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  const clampLevel = (level) => Math.min(max, Math.max(min, level));

  function draw() {
    const width = shape === 'curved' ? box.width : element.clientWidth;
    const height = shape === 'curved' ? box.height : STRAIGHT_HEIGHT;
    if (width < 2 || height < 2) return;
    const ctx = fitCanvas(canvas, width, height);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    if (shape === 'curved') {
      paintCurvedLimb(ctx, frc, { ...placed, cx: placed.cx - box.left, cy: placed.cy - box.top, value: shown, min, max });
    } else {
      paintStraightLimb(ctx, frc, { cx: width / 2, y: 34, width, value: shown, min, max });
    }
  }

  function describeValue() {
    const level = get();
    element.setAttribute('aria-valuenow', String(level));
    element.setAttribute('aria-valuetext', describe(level));
  }

  /** Let the letters glide to the bound level. */
  function settleTo(target) {
    if (settle) cancelAnimationFrame(settle.frame);
    settle = null;
    if (reducedMotion() || Math.abs(shown - target) < 0.01) {
      shown = target;
      draw();
      return;
    }
    const from = shown;
    const started = performance.now();
    const step = (now) => {
      const x = Math.min(1, (now - started) / SETTLE_MS);
      const eased = x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2; // ease-in-out
      shown = from + (target - from) * eased;
      draw();
      if (x < 1) settle.frame = requestAnimationFrame(step);
      else settle = null;
    };
    settle = { frame: requestAnimationFrame(step) };
  }

  /** The fractional level under a pointer event, for the limb as it stood at `value`. */
  function levelAt(event, value) {
    const rect = element.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    if (shape === 'curved') {
      return curvedLimbLevelAt({ cx: placed.cx - box.left, cy: placed.cy - box.top, step: placed.step, value }, x, y);
    }
    return straightLimbLevelAt({ cx: rect.width / 2, pitch: STRAIGHT_PITCH, value }, x);
  }

  /** Is the pointer on the scale itself (the curved control's box also covers part of the rings)? */
  function onScale(event) {
    if (shape !== 'curved') return true;
    const rect = element.getBoundingClientRect();
    const distance = Math.hypot(event.clientX - rect.left - (placed.cx - box.left), event.clientY - rect.top - (placed.cy - box.top));
    const band = curvedLimbBand(placed);
    return distance >= band.inner && distance <= band.outer;
  }

  element.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || !onScale(event) || drag) return;
    if (settle) cancelAnimationFrame(settle.frame);
    settle = null;
    // the level under the finger stays under the finger while it moves
    drag = { id: event.pointerId, grabbed: levelAt(event, shown), x: event.clientX, y: event.clientY, moved: false };
    element.setPointerCapture(event.pointerId);
    event.preventDefault();
    element.focus({ preventScroll: true });
  });
  element.addEventListener('pointermove', (event) => {
    if (!drag || event.pointerId !== drag.id) return;
    if (!drag.moved && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < TAP_SLOP) return;
    drag.moved = true;
    // solve levelAt(event, value) = grabbed for value
    const value = drag.grabbed - levelAt(event, 0);
    shown = Math.min(max + 0.35, Math.max(min - 0.35, value));
    const level = clampLevel(Math.round(shown));
    if (level !== get()) set(level);
    draw();
  });
  const release = (event) => {
    if (!drag || event.pointerId !== drag.id) return;
    const wasTap = !drag.moved;
    const grabbed = drag.grabbed;
    drag = null;
    if (wasTap) {
      const level = clampLevel(Math.round(grabbed));
      if (level !== get()) set(level);
    }
    settleTo(get());
  };
  element.addEventListener('pointerup', release);
  element.addEventListener('pointercancel', release);

  element.addEventListener('keydown', (event) => {
    const level = get();
    const target =
      event.key === 'ArrowRight' || event.key === 'ArrowUp'
        ? level + 1
        : event.key === 'ArrowLeft' || event.key === 'ArrowDown'
          ? level - 1
          : event.key === 'Home'
            ? min
            : event.key === 'End'
              ? max
              : null;
    if (target === null) return;
    event.preventDefault();
    event.stopPropagation();
    if (clampLevel(target) !== level) set(clampLevel(target));
  });

  describeValue();

  return {
    /** The control's root: focusable, role="slider". Append it where the limb goes. */
    element,
    /**
     * Curved shape: tell the control where the instrument's circle is (offset
     * parent coordinates). It positions and sizes itself over the scale's band.
     */
    place(next) {
      placed = { ...placed, ...next };
      const band = curvedLimbBand(placed);
      // the ends of the scale, as points of the core's circle: they bound the control's box
      const end = 0.5 - Math.min(0.25, (placed.span * placed.step + 6) / 360);
      const halfWidth = frc.arcPoint(ringCarrier(frc, placed.cx, placed.cy, band.outer), end).x - placed.cx + 8;
      const top = frc.arcPoint(ringCarrier(frc, placed.cx, placed.cy, band.inner), end).y - 4;
      box = { left: Math.round(placed.cx - halfWidth), top: Math.round(top), width: Math.round(2 * halfWidth), height: Math.round(placed.cy + band.outer - top) };
      Object.assign(element.style, { left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px` });
      draw();
    },
    /** Redraw for the bound value as it is now (it glides there unless a turn is in progress). */
    update() {
      describeValue();
      if (drag) draw();
      else settleTo(get());
    },
    /** Redraw at once (theme or size changed). */
    draw,
    destroy() {
      if (settle) cancelAnimationFrame(settle.frame);
      element.remove();
    },
  };
}
