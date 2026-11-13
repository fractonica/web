/**
 * wave-field.js - the wave under the fixed hairline: the canvas of the WAVE
 * screen and the control that scrubs time (DESIGN.md sections 8 and 10).
 *
 * WHAT IS DRAWN (drawing/wave.js does the arcs):
 *   the axis · every cycle of the focused level in view, each with a dotted line
 *   at its start and its name ("34η") · elapsed lit up to the hairline · below,
 *   the threshold rule: a tick at every quarter of every cycle in view, the four
 *   words under the cycle that holds the instant (the next one lit; EARTH mode:
 *   its time under each) · the hairline · the point of now.
 *
 * TIME MOVES UNDER THE HAIRLINE. A cycle is `cell.width` px wide, so the
 * instant under the hairline lies `fraction x width` px after the start of
 * its cycle: that is the whole placement. The fraction is the core's.
 *
 * SCRUBBING: drag the wave and the cursor follows (store.setCursor), released
 * it coasts (velocity x 0.92 per frame) and, where it comes to rest within
 * 6 px of a threshold, it takes exactly that threshold's instant (the core's).
 * With reduced motion there is no coasting. A horizontal wheel or trackpad
 * swipe scrubs too; a vertical one changes the scale, as on the instrument.
 * Keys, when the wave has the focus: Left / Right to the previous / next
 * threshold, Page Up / Page Down one whole cycle, Home back to now.
 *
 * The px -> instant step of a scrub is the core's: a place in a cycle is a
 * phase (`frc.fracFromDouble`, a change of container) and `cat.timeAtPhase`
 * gives the first microsecond at it. Nothing is interpolated here.
 */
import { engraved, fitCanvas, line, measure, ring, text } from '../../drawing/canvas.js';
import { paintNowPoint } from '../../drawing/arcs.js';
import { WAVE_RADIUS, WAVE_REACH, fitWaveCell, paintWave } from '../../drawing/wave.js';
import { canvasFont, theme } from '../../design/tokens.js';
import { paintReading } from '../../instrument/draw.js';
import { prefersReducedMotion } from '../../instrument/motion.js';
import { waveSteps } from '../../model/halves.js';
import { stepThreshold } from '../../model/travel.js';
import { capture } from '../../shell/dom.js';

/** A press that travels less than this is not a scrub. */
const DRAG_SLOP = 3;
/** Inertia: the velocity keeps this share per 60 Hz frame (DESIGN.md section 10). */
const DECAY = 0.92;
const FRAME_MS = 1000 / 60;
/** Coasting ends below this speed (px per ms). */
const REST_SPEED = 0.02;
/** A release slower than this does not coast. */
const FLING_SPEED = 0.05;
/** Released within this many px of a threshold, the cursor takes it. */
const SNAP_PX = 6;
/** The velocity of a release is measured over the last this many ms. */
const VELOCITY_WINDOW_MS = 90;
/** After the last wheel event, this long until the scrub is taken as released. */
const WHEEL_REST_MS = 160;
/** A vertical wheel changes the scale by one level per this much delta (as on the instrument). */
const WHEEL_STEP = 80;
/** Redraw when the fastest ink has moved this far (px). */
const MOVE_PX = 0.5;
/** No cycle further than this from the hairline is ever in view. */
const FAR = 64;

/**
 * @param {object} options
 * @param {import('../../model/store.js').Store} options.store
 */
export function createWaveField({ store }) {
  const { frc, cat } = store;

  /**
   * The instant `fraction` (0..1) of the way through cycle `cycle` of `level`: the core's first microsecond at
   * that phase. A place after the closing instant (the catalogue's last, clipped cycle) is the closing instant.
   */
  const instantInCycle = (level, cycle, fraction) => cat.timeAtPhase(level, cycle, frc.fracFromDouble(fraction)) ?? cat.last;
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  const element = document.createElement('div');
  element.className = 'wave-field';
  element.tabIndex = 0;
  element.setAttribute('role', 'slider');
  element.setAttribute('aria-label', 'Timeline: the moment under the hairline');
  element.setAttribute('aria-orientation', 'horizontal');
  element.setAttribute('aria-valuemin', '0');
  element.append(canvas);

  /** Where things stand in the canvas, px; null until the element has a size. */
  let box = null;
  /** The cell of the focused level at the fitted size (drawing/wave.js). */
  let cell = null;

  /**
   * Fit the canvas to its element and the cell to the canvas. Call when the
   * size, the layout or the focus changed.
   * @returns {boolean} false while the element has no size
   */
  function fit() {
    const width = element.clientWidth;
    const height = element.clientHeight;
    if (width < 2 || height < 60) return false;
    const big = store.state.layout === 'desktop';
    // the names of the cycles stand at the top, the threshold rule with its words at the bottom
    const below = big ? 36 : 30;
    const ruleY = height - below;
    const axisY = (ruleY + 4) / 2;
    const reach = ruleY - axisY - 4;
    const scale = Math.min(big ? 1.5 : 1.25, Math.max(0.6, reach / WAVE_REACH));
    box = { width, height, big, ruleY, axisY, reach, scale, hairX: Math.round(width / 2) + 0.5 };
    cell = fitWaveCell(frc, store.state.focus, (WAVE_RADIUS * reach) / WAVE_REACH, reach - 2, big ? 3 : 2);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    return true;
  }

  /**
   * Paint a reading of wave-reading.js.
   * @param {import('../../model/frame.js').Frame} frame
   * @param {ReturnType<typeof import('./wave-reading.js').readWave>} reading
   * @returns {{ frameMs: number | null }} how soon the ink will have moved
   */
  function paint(frame, reading) {
    if (!box || cell.level !== store.state.focus) {
      if (!fit()) return { frameMs: null };
    }
    const { color, line: weight, glow, font, alpha } = theme();
    const { width, height, big, ruleY, axisY, reach, scale, hairX } = box;
    const ctx = fitCanvas(canvas, width, height);
    const focus = store.state.focus;
    const wave = reading.lit ? reading.wave : null;
    const originX = hairX - (wave ? wave.fraction : 0) * cell.width;
    const first = wave ? Number(wave.cycle < BigInt(FAR) ? wave.cycle : BigInt(FAR)) : FAR;
    const after = wave ? wave.count - 1n - wave.cycle : BigInt(FAR);
    const last = Number(after < BigInt(FAR) ? after : BigInt(FAR));
    const from = Math.max(-first, Math.floor(-originX / cell.width) - 1);
    const to = Math.min(last, Math.ceil((width - originX) / cell.width));

    line(ctx, 0, axisY, width, axisY, { color: color.etch2, width: weight.engrave });

    // where each cycle begins: a dotted line, and the cycle's name beside it
    ctx.save();
    ctx.strokeStyle = color.etch2;
    ctx.lineWidth = weight.engrave;
    ctx.setLineDash([1, 3]);
    ctx.beginPath();
    for (let k = from; k <= to + 1; k++) {
      if (k > last + 1) break;
      const x = originX + k * cell.width;
      ctx.moveTo(x, axisY - reach);
      ctx.lineTo(x, axisY + reach);
    }
    ctx.stroke();
    ctx.restore();
    if (wave) {
      const size = (big ? 13 : 11) * Math.min(1.1, scale);
      const face = canvasFont('reading', size, font.valueWeight);
      for (let k = from; k <= to; k++) {
        const name = frc.formatCycleName(focus, wave.cycle + BigInt(k), true);
        ctx.font = face;
        const x = originX + k * cell.width + 5 + ctx.measureText(name).width / 2;
        paintReading(ctx, name, x, axisY - reach + size * 0.72, size);
      }
    }

    // the wave itself
    const sigma = big ? glow.sigmaDesktop : glow.sigmaPhone;
    const depth = cell.halves[0].layers.length;
    const now = wave ? waveSteps(frame, focus, depth) : null;
    const point = paintWave(ctx, frc, cell, { originX, axisY, left: 0, right: width, first, last }, now, { heroWidth: big ? weight.heroDesktop : weight.heroPhone, sigma });

    // the threshold rule
    line(ctx, 0, ruleY, width, ruleY, { color: color.etch2, width: weight.engrave });
    if (wave) {
      const wordSize = (big ? 6.6 : 5.8) * Math.min(1.15, Math.max(0.9, scale));
      const earthSize = big ? 8.5 : 7.5;
      const wordFont = canvasFont('caps', wordSize);
      const earthFont = canvasFont('reading', earthSize, font.earthWeight);
      // a label is centred under its tick but never cut by the canvas's edge (a threshold near the edge keeps
      // its whole word; the tick still marks the place)
      const place = (x, label, face, tracking) => {
        const half = measure(ctx, label, face, tracking) / 2 + 2;
        const centre = Math.min(Math.max(x, half), width - half);
        return { centre, from: centre - half, to: centre + half };
      };
      // a small wave has its thresholds close together: when the labels of the running cycle, where they are
      // drawn, would run into each other, only the next threshold keeps its word (and its time)
      const fits = (label, face, tracking, gap) => {
        const boxes = wave.thresholds
          .filter((item) => item.time !== null && label(item))
          .map((item) => place(originX + item.fraction * cell.width, label(item), face, tracking))
          .sort((p, q) => p.centre - q.centre);
        return boxes.every((box, i) => i === 0 || boxes[i - 1].to + gap <= box.from);
      };
      const wordsFit = fits((item) => engraved(item.word), wordFont, wordSize * 0.18, 2);
      const earthFit = fits((item) => item.earth, earthFont, 0, 1);
      for (let k = from; k <= to; k++) {
        for (const threshold of wave.thresholds) {
          const x = originX + (k + threshold.fraction) * cell.width;
          if (x < -40 || x > width + 40) continue;
          // the clipped last cycle of the catalogue: a quarter the core does not reach is not marked
          if (k === 0 && threshold.time === null) continue;
          const lit = k === 0 && threshold.next;
          // a node is where the wave crosses its axis
          if (threshold.fraction === 0.5) {
            ctx.clearRect(x - 2.4, axisY - 2.4, 4.8, 4.8);
            ring(ctx, x, axisY, 2.4, { color: color.etch3, width: weight.tick });
          }
          line(ctx, x, ruleY, x, ruleY + 5, { color: lit ? color.lumen : k === 0 ? color.etch3 : color.etch2, width: 1 });
          if (k !== 0) continue;
          if (wordsFit || threshold.next) {
            const word = engraved(threshold.word);
            text(ctx, word, place(x, word, wordFont, wordSize * 0.18).centre, ruleY + 15, { font: wordFont, color: lit ? color.lumen : color.limbBetween, tracking: wordSize * 0.18, align: 'center' });
          }
          if (threshold.earth && (earthFit || threshold.next)) text(ctx, threshold.earth, place(x, threshold.earth, earthFont, 0).centre, ruleY + (big ? 28 : 26), { font: earthFont, color: color.earth, align: 'center' });
        }
      }
    }

    // the hairline: fixed; time moves under it
    line(ctx, hairX, axisY - reach, hairX, ruleY - 2, { color: color.bone, width: weight.hair, alpha: alpha.alidade });
    if (point) paintNowPoint(ctx, point, big ? 3.2 : 2.6, sigma);

    describe(reading);
    if (!wave || !store.live) return { frameMs: null };
    // how long until the fastest ink has moved MOVE_PX: the wave under the hairline, or the point on its arc
    const deepest = cell.halves[0].layers[depth - 1];
    const arcTravel = Math.abs(deepest.arcs[0].sweep) * deepest.arcs[0].radius;
    const child = frame.cycle(deepest.level);
    const perHalf = Number(child.end - child.start) / 2000;
    return { frameMs: Math.min((perHalf * MOVE_PX) / arcTravel, (wave.millis * MOVE_PX) / cell.width) };
  }

  /** The slider as assistive technology hears it: which cycle is under the hairline. */
  function describe(reading) {
    const set = (name, value) => {
      if (element.getAttribute(name) !== value) element.setAttribute(name, value);
    };
    if (reading.lit) {
      set('aria-valuemax', String(reading.wave.count - 1n));
      set('aria-valuenow', String(reading.wave.cycle));
    } else {
      element.removeAttribute('aria-valuenow');
    }
    set('aria-valuetext', reading.describe);
  }

  // --- scrubbing --------------------------------------------------------------------

  /** Where the scrub started: a cycle and a place in it, and how far the wave has been moved since (px). */
  let anchor = null;
  let drag = null;
  let coast = null;
  let pendingShift = null;
  let pendingFrame = null;
  let wheelRest = null;
  let wheelFocus = 0;
  /** The cursor as the scrub last set it: when it is another, someone else moved it (NOW, a key, a tumbler). */
  let placed = null;

  /** Begin a scrub at the instant shown. @returns {boolean} false outside the catalogue */
  function grab() {
    const t = store.time();
    if (!cell || !cat.contains(t)) return false;
    const cycle = cat.cycleAt(t, cell.level);
    anchor = { level: cell.level, cycle: cycle.cycle, fraction: cycle.fraction, count: cat.cycleCount(cell.level), width: cell.width };
    return true;
  }

  /** Show the instant that lies `shift` px of wave to the right of the hairline's place at the grab. */
  function scrubTo(shift) {
    if (!anchor || anchor.level !== store.state.focus) return;
    // dragging the wave to the right brings earlier time under the hairline
    const place = anchor.fraction - shift / anchor.width;
    const whole = Math.floor(place);
    let cycle = anchor.cycle + BigInt(whole);
    let fraction = place - whole;
    if (cycle < 0n) [cycle, fraction] = [0n, 0];
    if (cycle >= anchor.count) [cycle, fraction] = [anchor.count - 1n, 1];
    store.setCursor(instantInCycle(anchor.level, cycle, fraction));
    placed = store.state.cursor;
  }

  /** Coalesce a burst of pointer events into one scrub per frame. */
  function scrubSoon(shift) {
    pendingShift = shift;
    if (pendingFrame !== null) return;
    pendingFrame = requestAnimationFrame(() => {
      pendingFrame = null;
      scrubTo(pendingShift);
    });
  }

  function flush() {
    if (pendingFrame === null) return;
    cancelAnimationFrame(pendingFrame);
    pendingFrame = null;
    scrubTo(pendingShift);
  }

  /** The scrub has come to rest: within 6 px of a threshold, take the threshold. */
  function settle() {
    anchor = null;
    const t = store.time();
    if (!cell || store.state.cursor === null || !cat.contains(t)) return;
    const cycle = cat.cycleAt(t, cell.level);
    const points = cat.cyclePoints(cell.level, cycle.cycle); // start, peak, node, valley, end
    let best = null;
    points.forEach((instant, quarter) => {
      const distance = Math.abs(cycle.fraction - quarter / 4) * cell.width;
      if (instant !== null && distance <= SNAP_PX && (best === null || distance < best.distance)) best = { instant, distance };
    });
    if (best && best.instant !== t) store.setCursor(best.instant);
  }

  function stopCoast() {
    if (coast) cancelAnimationFrame(coast.frame);
    coast = null;
  }

  element.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || drag) return;
    stopCoast();
    element.focus({ preventScroll: true });
    if (!grab()) return;
    drag = { id: event.pointerId, x: event.clientX, moved: false, samples: [{ x: event.clientX, at: performance.now() }] };
    capture(element, event.pointerId);
    event.preventDefault();
  });
  element.addEventListener('pointermove', (event) => {
    if (!drag || event.pointerId !== drag.id) return;
    const shift = event.clientX - drag.x;
    if (!drag.moved && Math.abs(shift) < DRAG_SLOP) return;
    drag.moved = true;
    const now = performance.now();
    drag.samples.push({ x: event.clientX, at: now });
    while (drag.samples.length > 2 && now - drag.samples[0].at > VELOCITY_WINDOW_MS) drag.samples.shift();
    scrubSoon(shift);
  });
  const release = (event) => {
    if (!drag || event.pointerId !== drag.id) return;
    const { moved, samples, x } = drag;
    drag = null;
    if (!moved) {
      anchor = null;
      return;
    }
    flush();
    const firstSample = samples[0];
    const lastSample = samples[samples.length - 1];
    const elapsed = lastSample.at - firstSample.at;
    const stale = performance.now() - lastSample.at > VELOCITY_WINDOW_MS;
    const velocity = elapsed > 0 && !stale ? (lastSample.x - firstSample.x) / elapsed : 0;
    if (prefersReducedMotion() || Math.abs(velocity) < FLING_SPEED) {
      settle();
      return;
    }
    // inertia: the wave keeps moving and slows by the design's decay
    coast = { velocity, shift: lastSample.x - x, at: performance.now(), frame: 0 };
    const step = (now) => {
      if (store.state.cursor !== placed) {
        // the cursor was taken elsewhere while the wave coasted: the coasting is over
        coast = null;
        anchor = null;
        return;
      }
      const dt = Math.min(64, now - coast.at);
      coast.at = now;
      coast.velocity *= DECAY ** (dt / FRAME_MS);
      coast.shift += coast.velocity * dt;
      scrubTo(coast.shift);
      const edge = store.state.cursor === cat.first || store.state.cursor === cat.last;
      if (Math.abs(coast.velocity) < REST_SPEED || edge || !anchor) {
        coast = null;
        settle();
      } else coast.frame = requestAnimationFrame(step);
    };
    coast.frame = requestAnimationFrame(step);
  };
  element.addEventListener('pointerup', release);
  element.addEventListener('pointercancel', release);

  element.addEventListener(
    'wheel',
    (event) => {
      event.preventDefault();
      const unit = event.deltaMode === 1 ? 30 : 1;
      if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
        // sideways: scrub, as if the wave were dragged by that much
        stopCoast();
        if (wheelRest === null && !grab()) return;
        if (wheelRest !== null) clearTimeout(wheelRest.timer);
        const shift = (wheelRest?.shift ?? 0) - event.deltaX * unit;
        wheelRest = {
          shift,
          timer: setTimeout(() => {
            wheelRest = null;
            flush();
            settle();
          }, WHEEL_REST_MS),
        };
        scrubSoon(shift);
        return;
      }
      // rolling away (up) goes in: one level finer
      wheelFocus += event.deltaY * unit;
      while (wheelFocus <= -WHEEL_STEP) {
        wheelFocus += WHEEL_STEP;
        store.stepFocus(1);
      }
      while (wheelFocus >= WHEEL_STEP) {
        wheelFocus -= WHEEL_STEP;
        store.stepFocus(-1);
      }
    },
    { passive: false },
  );

  element.addEventListener('keydown', (event) => {
    const t = store.time();
    const level = store.state.focus;
    let target;
    if (event.key === 'Home') {
      store.returnToNow();
    } else if (!cat.contains(t)) {
      return;
    } else if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      target = stepThreshold(frc, cat, t, level, event.key === 'ArrowRight' ? 1 : -1);
    } else if (event.key === 'PageDown' || event.key === 'PageUp') {
      const cycle = cat.cycleAt(t, level);
      const next = cycle.cycle + (event.key === 'PageDown' ? 1n : -1n);
      target = next < 0n ? cat.first : next >= cat.cycleCount(level) ? cat.last : instantInCycle(level, next, cycle.fraction);
    } else return;
    event.preventDefault();
    event.stopPropagation();
    stopCoast();
    if (target !== undefined && target !== null) store.setCursor(target);
  });

  return {
    /** The control's root: focusable, role="slider". */
    element,
    fit,
    paint,
    /**
     * The instants at the left and right edge of the wave in view, for the
     * Sun lane's window mark; null when nothing is lit.
     * @param {ReturnType<typeof import('./wave-reading.js').readWave>} reading
     * @returns {{ from: bigint, to: bigint } | null}
     */
    window(reading) {
      if (!box || !cell || !reading.lit) return null;
      const { cycle, count, fraction } = reading.wave;
      const at = (px) => {
        const place = fraction + px / cell.width;
        const whole = Math.floor(place);
        const index = cycle + BigInt(whole);
        if (index < 0n) return cat.first;
        if (index >= count) return cat.last;
        return instantInCycle(cell.level, index, place - whole);
      };
      return { from: at(-box.hairX), to: at(box.width - box.hairX) };
    },
    /** The point where the hairline crosses the axis, in viewport px: the plate's marks centre on it. */
    centre() {
      const rect = element.getBoundingClientRect();
      return box ? { cx: rect.left + box.hairX, cy: rect.top + box.axisY, r0: 0 } : { cx: rect.left + rect.width / 2, cy: rect.top + rect.height / 2, r0: 0 };
    },
    destroy() {
      stopCoast();
      if (pendingFrame !== null) cancelAnimationFrame(pendingFrame);
      if (wheelRest !== null) clearTimeout(wheelRest.timer);
      element.remove();
    },
  };
}
