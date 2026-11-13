/**
 * ladder.js - the LADDER screen: the spectral catalogue of all 63 scales
 * (DESIGN.md sections 7 - 9; renders screen3.png and screen3_pure.png).
 *
 * The limb at full length: every rung lies on the rim of a great wheel
 * (drawing/wheel.js); the rung under the fixed index, at the height of the
 * wheel's centre, is shown large. At the right edge the whole ladder is one
 * line of ticks (spine-control.js).
 *
 *   turn the wheel     drag it, the mouse wheel / trackpad, Up / Down, Page Up / Down, Home / End,
 *                      or press anywhere on the spine
 *   open the LENS      click the large row, or Enter / Space
 *   focus the instrument on a rung (levels 0..13 only: design ruling 9)
 *                      long-press or double-click its row, the FOCUS mark under the large
 *                      seal, or the F key
 *
 * STATE: `store.state.level` is the rung the wheel is turned to (the same
 * level the LENS inspects, so opening the lens and coming back keeps the
 * place); it is set with `store.set({ level })`, which leaves the
 * instrument's focus alone. While a turn is in progress the wheel stands
 * between two rungs: that fraction (`shown`) lives here and nowhere else.
 *
 * Nothing on this screen moves with time: the rungs are static facts
 * (model/rungs.js). It is redrawn when the state changes, when the wheel
 * turns, and when the cursor crosses an eclipse (the Saros interval the
 * Earth figures and the bands are laid from changes there).
 *
 * Parts: ladder-rows.js (the DOM and its text), spine-control.js (the
 * scrubber), drawing/wheel.js and drawing/spine.js (ink), styles/ladder.css
 * (where the cells stand in each arrangement).
 */
import { Band, Unit } from '../../../lib/fractonica.js';
import { theme, withAlpha } from '../../design/tokens.js';
import { disc, fitCanvas } from '../../drawing/canvas.js';
import { limbLetter } from '../../drawing/limb.js';
import { paintSeal } from '../../drawing/seal.js';
import { WHEEL, paintBandRail, paintRim, rimPoint, rowOffset, wheelRim } from '../../drawing/wheel.js';
import { easeInOut, prefersReducedMotion } from '../../instrument/motion.js';
import { intervalKey, rungEarth, rungFacts } from '../../model/rungs.js';
import { capture, h, setHidden, setWords } from '../../shell/dom.js';
import { buildRows } from './ladder-rows.js';
import { createSpine } from './spine-control.js';

/** From this width of the screen up, pure and Earth values stand side by side in columns. */
const SIDE_FROM = 1040;
/** Below this width a row has no room for its whole caption beside two Earth figures. */
const NARROW_BELOW = 372;
/** A row leaving the wheel's window fades out over the last px of rim before the window's edge. */
const EDGE_FADE = 12;
/** Heights of a row at rest and of the row under the index (styles/ladder.css uses the same). */
const ROW_HEIGHT = 47;
const FOCUS_HEIGHT = 184;
/** Outer extent of a seal in a row and under the index (DESIGN.md section 5), and how far the large one stands off the rim. */
const SEAL = 11;
const FOCUS_SEAL = 30;
const FOCUS_SEAL_SHIFT = 16;
/** Half the height a row answers to a pointer: the large row, a row at rest. */
const FOCUS_REACH = 68;
const ROW_REACH = ROW_HEIGHT / 2;
/** Pointer travel that turns the wheel by one rung (between the two pitches of the wheel). */
const PX_PER_RUNG = 62;
const TAP_SLOP = 5;
const LONG_PRESS_MS = 500;
/** Two taps this close together are a double click. */
const DOUBLE_MS = 280;
const GLIDE_MS = 220;
/** After this long without a wheel event the wheel settles on the nearest rung. */
const WHEEL_IDLE_MS = 140;
const PAGE = 5;
/** Where the content begins on a desktop (the phone keeps `app.insetTop()` free for the corner marks). */
const DESKTOP_TOP = 62;
/**
 * The column headings (and the air under them) end this far below the top of the content. The index stands
 * half-way between there and the foot of the screen: 64 puts it at y 452 on the reference phone, where
 * DESIGN.md section 7 has it (60 left it two px high, and every row with it).
 */
const HEADS = 64;

export const screen = {
  id: 'ladder',
  /**
   * @param {HTMLElement} host
   * @param {import('../contract.js').App} app
   * @returns {import('../contract.js').ScreenInstance}
   */
  mount(host, app) {
    const { store, frc, ground } = app;
    const count = frc.constants.LEVEL_COUNT;
    const last = count - 1;
    const clamp = (level) => Math.min(last, Math.max(0, level));

    // --- the tree -----------------------------------------------------------------
    const tree = buildRows(frc);
    const canvas = h('canvas', { class: 'ladder-canvas', 'aria-hidden': 'true' });
    const wheel = h(
      'div',
      { class: 'ladder-wheel', role: 'listbox', tabindex: 0, 'aria-label': `Spectral ladder: ${count} rungs. Enter opens the lens`, 'aria-activedescendant': 'rung-focus' },
      ...tree.rows.map((row) => row.element),
      tree.focus.element,
    );
    const focusWord = h('span', {});
    const focusButton = h('button', { type: 'button', class: 'caps ladder-focus', hidden: true }, h('span', { class: 'ring', 'aria-hidden': 'true' }), focusWord);
    const title = h('div', { class: 'caps title' });
    const sub = h('div', { class: 'caps sub' });
    setWords(title, 'Spectral ladder');
    setWords(sub, `${count} rungs  ·  ${frc.formatUnitName(Unit.ALPHA)} to the Planck edge`);
    const describe = (level) => `${frc.formatLevelName(level)} ${frc.formatLevelWord(level)}`;

    /** The interval the bands and the Earth figures are laid from (set on every pass). */
    let interval = frc.referenceInterval;
    /** What the wheel shows right now: the rung under the index, fractional while it turns. */
    let shown = store.state.level;
    /** Where everything stands for the current box; null until the box has a size. */
    let geometry = null;

    const spine = createSpine({
      count,
      get: () => store.state.level,
      set: (level) => store.set({ level }),
      describe,
      rung: (level) => {
        const band = rungEarth(frc, level, interval);
        return { ...limbLetter(frc, level), banded: band.band !== Band.NONE, marked: band.visible };
      },
      view: () => ({ before: geometry?.before ?? 0, after: geometry?.after ?? 0, focus: store.state.focus }),
    });
    const root = h('section', { class: 'ladder', 'aria-label': 'Ladder' }, h('header', { class: 'ladder-head' }, title, sub), tree.headRow, canvas, wheel, focusButton, spine.element);
    host.append(root);

    // --- geometry -----------------------------------------------------------------
    /** How many rows fit in `room` px of rim beyond the index. */
    const rowsIn = (room) => (room < WHEEL.focusPitch ? 0 : 1 + Math.floor((room - WHEEL.focusPitch) / WHEEL.pitch));

    function layout() {
      const width = root.clientWidth;
      const height = root.clientHeight;
      if (width < 2 || height < 2) return false;
      const phone = store.state.layout === 'phone';
      const inset = phone ? app.insetTop() : DESKTOP_TOP;
      const headBottom = inset + HEADS;
      const cy = Math.round((headBottom + height) / 2);
      const rimX = phone ? 46 : 78;
      // how far along the rim a row may stand and still be whole: clear of the column headings above,
      // of the screen's edge below
      // (the margins are chosen so that the fifth row either side is whole on the reference phone: 280 px of rim,
      // plus the 12 px over which a row fades out at the edge)
      const above = cy - headBottom - 4;
      const below = height - cy - (phone ? 4 : 26);
      geometry = { width, height, cy, rimX, above, below, before: rowsIn(above), after: rowsIn(below), rim: wheelRim(frc, rimX, cy), narrow: width < NARROW_BELOW };
      root.dataset.columns = width >= SIDE_FROM ? 'side' : 'stack';
      root.style.setProperty('--inset', `${inset}px`);
      const box = root.getBoundingClientRect();
      // the plate's machining marks are turned on the wheel's centre
      ground.set({ cx: box.left + geometry.rim.cx, cy: box.top + cy, r0: WHEEL.radius % 26 });
      return true;
    }

    // --- placing and painting -----------------------------------------------------
    /** Rows whose elements are showing, to hide the ones that leave. */
    let showing = new Set();
    let placedFocus = -1;

    /** How visible a row `rows` away from the index is: fainter with distance, gone at the edge. */
    function fadeOf(rows, offset) {
      const room = offset < 0 ? geometry.above : geometry.below;
      const edge = Math.min(1, Math.max(0, (room - Math.abs(offset)) / EDGE_FADE));
      return edge * (1 - Math.min(0.62, Math.max(0, Math.abs(rows) - 1) * 0.15));
    }

    function place() {
      if (!geometry && !layout()) return;
      const g = geometry;
      const { color, glow } = theme();
      const nearest = clamp(Math.round(shown));
      const firstRow = Math.max(0, Math.ceil(shown - g.before - 1));
      const lastRow = Math.min(last, Math.floor(shown + g.after + 1));
      const ctx = fitCanvas(canvas, g.width, g.height);
      canvas.style.width = `${g.width}px`;
      canvas.style.height = `${g.height}px`;

      if (nearest !== placedFocus) {
        placedFocus = nearest;
        tree.writeFocus(nearest, store.state.mode, interval);
        const facts = rungFacts(frc, nearest);
        const isFocus = nearest === store.state.focus;
        setHidden(focusButton, !facts.focusable);
        setWords(focusWord, isFocus ? 'focus' : 'set focus');
        focusButton.setAttribute('aria-pressed', String(isFocus));
        focusButton.setAttribute('aria-label', isFocus ? `The instrument is focused on ${describe(nearest)}` : `Focus the instrument on ${describe(nearest)}`);
      }

      const visible = rungEarth(frc, nearest, interval).visible;
      const at = rimPoint(frc, g.rim, rowOffset(nearest - shown));
      if (visible) {
        // the one red light of the app: behind the rung that is visible light
        const halo = ctx.createRadialGradient(at.x, at.y, 0, at.x, at.y, 120);
        halo.addColorStop(0, withAlpha(color.hAlpha, 0.16));
        halo.addColorStop(1, withAlpha(color.hAlpha, 0));
        ctx.fillStyle = halo;
        ctx.fillRect(at.x - 120, at.y - 120, 240, 240);
      }
      paintRim(ctx, frc, g.rim, Math.max(g.above, g.below) + 50);

      const next = new Set();
      /** @type {{ from: number, to: number, marked: boolean, band: number }[]} */
      const runs = [];
      for (let level = firstRow; level <= lastRow; level++) {
        const rows = level - shown;
        const offset = rowOffset(rows);
        const fade = fadeOf(rows, offset);
        const point = rimPoint(frc, g.rim, offset);
        const large = level === nearest;
        // the band rail: neighbouring rows of one band share an arc
        const band = rungEarth(frc, level, interval);
        if (band.band !== Band.NONE && fade > 0) {
          const reach = large ? FOCUS_REACH - 6 : ROW_REACH - 6.5;
          const run = runs[runs.length - 1];
          if (run && run.band === band.band && run.level === level - 1) Object.assign(run, { to: offset + reach, level });
          else runs.push({ from: offset - reach, to: offset + reach, marked: band.visible, band: band.band, level });
        }
        if (large) {
          const style = tree.focus.element.style;
          style.transform = `translateY(${(point.y - FOCUS_HEIGHT / 2).toFixed(2)}px)`;
          style.setProperty('--rx', `${point.x.toFixed(2)}px`);
          focusButton.style.transform = `translate(${(point.x + FOCUS_SEAL_SHIFT).toFixed(2)}px, ${(point.y + 42).toFixed(2)}px) translateX(-50%)`;
          const ink = visible ? color.hAlpha : color.lumen;
          paintSeal(ctx, frc, point.x + FOCUS_SEAL_SHIFT, point.y, FOCUS_SEAL, level, { color: ink, width: 1.3, glow: { sigma: glow.sigmaPhone, alpha: glow.arc } });
          continue;
        }
        const element = tree.rows[level].element;
        if (fade <= 0) continue;
        next.add(level);
        setHidden(element, false);
        element.style.transform = `translateY(${(point.y - ROW_HEIGHT / 2).toFixed(2)}px)`;
        element.style.setProperty('--rx', `${point.x.toFixed(2)}px`);
        element.style.opacity = fade.toFixed(3);
        paintSeal(ctx, frc, point.x, point.y, SEAL, level, { color: color.seal, alpha: fade });
        disc(ctx, point.x, point.y, 2.6, { color: color.void, alpha: fade });
      }
      for (const level of showing) if (!next.has(level)) setHidden(tree.rows[level].element, true);
      showing = next;
      paintBandRail(ctx, frc, g.rim, runs);
      spine.update(shown);
    }

    // --- turning ------------------------------------------------------------------
    let glide = null;
    const stopGlide = () => {
      if (glide) cancelAnimationFrame(glide.frame);
      glide = null;
    };

    /** Let the wheel run to a rung (a cut under reduced motion). */
    function glideTo(target) {
      stopGlide();
      if (prefersReducedMotion() || Math.abs(shown - target) < 0.01) {
        shown = target;
        place();
        return;
      }
      const from = shown;
      const started = performance.now();
      const step = (now) => {
        const x = Math.min(1, (now - started) / GLIDE_MS);
        shown = from + (target - from) * easeInOut(x);
        place();
        if (x < 1) glide.frame = requestAnimationFrame(step);
        else glide = null;
      };
      glide = { frame: requestAnimationFrame(step) };
    }

    /** Show a turn in progress and tell the store when another rung comes under the index. */
    function turnTo(value) {
      shown = Math.min(last + 0.35, Math.max(-0.35, value));
      const level = clamp(Math.round(shown));
      if (level !== store.state.level) store.set({ level });
      else place();
    }

    /** The rung whose row is under a height of the screen (viewport px), or -1. */
    function levelAt(clientY) {
      if (!geometry) return -1;
      const offset = clientY - root.getBoundingClientRect().top - geometry.cy;
      const nearest = clamp(Math.round(shown));
      let best = -1;
      let bestDistance = Infinity;
      for (const level of [nearest, ...showing]) {
        const distance = Math.abs(offset - rowOffset(level - shown)) - (level === nearest ? FOCUS_REACH : ROW_REACH);
        if (distance < bestDistance) {
          best = level;
          bestDistance = distance;
        }
      }
      return bestDistance <= 4 ? best : -1;
    }

    /** Focus the instrument on a rung it can show, and turn the wheel to it. */
    function focusInstrument(level) {
      if (level < 0 || !rungFacts(frc, level).focusable) return;
      store.set({ level, focus: level });
    }

    let lastTap = null;
    let pendingOpen = null;
    const cancelOpen = () => {
      clearTimeout(pendingOpen);
      pendingOpen = null;
    };

    function tap(level) {
      const now = performance.now();
      if (lastTap && now - lastTap.time < DOUBLE_MS) {
        // a double click: the rung of the first click is the one meant (the rows may have moved since)
        cancelOpen();
        const meant = lastTap.level;
        lastTap = null;
        focusInstrument(meant);
        return;
      }
      if (level < 0) return;
      lastTap = { level, time: now };
      if (level !== store.state.level) store.set({ level });
      else if (rungFacts(frc, level).focusable && level !== store.state.focus) {
        // a second click may follow and mean "focus the instrument": wait for it before opening the lens
        pendingOpen = setTimeout(() => store.openLens(level), DOUBLE_MS);
      } else store.openLens(level);
    }

    let drag = null;
    wheel.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || drag) return;
      stopGlide();
      drag = { id: event.pointerId, x: event.clientX, y: event.clientY, start: shown, moved: false, held: false, timer: null };
      const pressed = drag;
      drag.timer = setTimeout(() => {
        if (drag !== pressed || pressed.moved) return;
        pressed.held = true;
        cancelOpen();
        focusInstrument(levelAt(pressed.y));
      }, LONG_PRESS_MS);
      capture(wheel, event.pointerId);
      wheel.focus({ preventScroll: true });
      event.preventDefault();
    });
    wheel.addEventListener('pointermove', (event) => {
      if (!drag || event.pointerId !== drag.id || drag.held) return;
      if (!drag.moved && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < TAP_SLOP) return;
      drag.moved = true;
      clearTimeout(drag.timer);
      turnTo(drag.start - (event.clientY - drag.y) / PX_PER_RUNG);
    });
    const release = (event) => {
      if (!drag || event.pointerId !== drag.id) return;
      const { moved, held, y } = drag;
      clearTimeout(drag.timer);
      drag = null;
      if (!moved && !held && event.type === 'pointerup') tap(levelAt(y));
      glideTo(store.state.level);
    };
    wheel.addEventListener('pointerup', release);
    wheel.addEventListener('pointercancel', release);

    let idle = null;
    const onWheel = (event) => {
      if (event.ctrlKey) return; // a pinch on a trackpad: leave it to the browser
      event.preventDefault();
      stopGlide();
      const px = event.deltaMode === 1 ? event.deltaY * 30 : event.deltaY;
      turnTo(shown + px / PX_PER_RUNG);
      clearTimeout(idle);
      idle = setTimeout(() => {
        idle = null;
        if (!drag) glideTo(store.state.level);
      }, WHEEL_IDLE_MS);
    };
    root.addEventListener('wheel', onWheel, { passive: false });

    wheel.addEventListener('keydown', (event) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const level = store.state.level;
      const steps = { ArrowDown: 1, ArrowUp: -1, PageDown: PAGE, PageUp: -PAGE, Home: -count, End: count };
      if (event.key in steps) store.set({ level: clamp(level + steps[event.key]) });
      else if (event.key === 'Enter' && event.shiftKey) focusInstrument(level);
      else if (event.key === 'Enter' || event.key === ' ') store.openLens(level);
      else if (event.key === 'f' || event.key === 'F') focusInstrument(level);
      else return;
      event.preventDefault();
      event.stopPropagation();
    });
    focusButton.addEventListener('click', () => focusInstrument(store.state.level));

    const observer = new ResizeObserver(() => {
      const was = geometry?.narrow;
      if (!layout()) return;
      // the rows are written for the width class: let the next pass write them again
      if (was !== geometry.narrow) app.clock.refreshSoon();
      place();
    });
    observer.observe(root);

    let first = true;
    let writtenFor = '';

    return {
      update(frame, changed) {
        interval = frame.interval();
        if (first || changed?.has('layout')) layout();
        const narrow = geometry?.narrow ?? false;
        const key = `${store.state.mode}|${intervalKey(interval)}|${narrow}`;
        const rewrite = key !== writtenFor;
        if (rewrite) {
          writtenFor = key;
          tree.write(store.state.mode, interval, key, narrow);
        }
        if (first || changed !== null || rewrite) {
          placedFocus = -1; // the large row is written again: the mode, the focus or the interval may have changed
          if (first) shown = store.state.level;
          if (!first && changed?.has('level') && !drag && idle === null) glideTo(store.state.level);
          else place();
        }
        first = false;
        // nothing here moves with time; the shell's title carries the stamp, whose last term is the Blink
        return { next: frame.inCatalogue ? frame.cycle(frc.unitLevel(Unit.BLINK)).end : null };
      },
      unmount() {
        observer.disconnect();
        stopGlide();
        cancelOpen();
        clearTimeout(idle);
        clearTimeout(drag?.timer);
        spine.destroy();
        root.remove();
      },
    };
  },
};
