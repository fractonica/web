/**
 * wave.js - the WAVE screen: the timeline, with time travel (DESIGN.md
 * sections 7 - 10; renders screen5.png and screen5_greg.png).
 *
 * Time moves under a fixed hairline. From the top:
 *
 *   WAVE · go to           a field that takes any date the core can read (EARTH mode: an Earth date too)
 *   MOMENT ......... NOW   the stamp as nine tumblers; NOW is lit while the present is shown, else it
 *                          says how far the cursor is and returns on a click
 *                          (EARTH mode: the Earth date-time under it, its six fields tumblers too)
 *   the Sun's lane         the solar sync that holds the moment: Pentads, quarters; drag for coarse moves
 *   the wave               the focused level's cycles laid along a line; drag to scrub
 *   the threshold rule     the four thresholds of the cycle under the hairline
 *   the limb, laid straight   change the focused level: the wave re-scales to it
 *   NEXT THRESHOLDS        across the levels around the focus, nearest first
 *
 * STATE: `store.state.cursor` (null = the present) and `store.state.focus`.
 * Scrubbing is global: every way of travelling here ends in
 * `store.setCursor(instant)`, and the other screens show that instant until
 * NOW is pressed. The store clamps the cursor to the catalogue (ruling 7).
 *
 * One rhythm: every pass reads the instant afresh (wave-reading.js), repaints
 * the two canvases and writes the texts that changed. A pass comes when the
 * state changes, at the core's next instant (the end of the running Blink, a
 * threshold), and, while time runs, when the wave has moved half a pixel.
 *
 * Parts: wave-reading.js (what is said and lit, as data), wave-panels.js (the
 * DOM: tumblers, go to, NOW, the list), wave-field.js (the wave and scrubbing),
 * wave-sun.js (the Sun's lane), drawing/wave.js (the arcs), model/travel.js
 * (where a step leads), styles/wave.css.
 */
import { Unit } from '../../../lib/fractonica.js';
import { createLimb } from '../../instrument/limb-control.js';
import { EARTH_SIGN, dateLine, msToNextSecond } from '../../model/earth.js';
import { CIVIL_FIELDS, parseMoment, stepCivil, stepTerm } from '../../model/travel.js';
import { FOCUS_MAX, FOCUS_MIN } from '../../model/url.js';
import { h } from '../../shell/dom.js';
import { createWaveField } from './wave-field.js';
import { buildMoment, buildNext, buildSunCaption, buildWaveCaption } from './wave-panels.js';
import { defaultTerm, describeWave, readWave } from './wave-reading.js';
import { createSunLane } from './wave-sun.js';

/** Spans shorter than ten Blinks show a decimal that moves faster than the Blink: refresh this often (ms). */
const FAST_TEXT_MS = 100;
/** The list reaches two levels finer than the focus: from this focus on, its spans carry such decimals. */
const FAST_TEXT_FROM_FOCUS = 9;
/** Height of one row of the list (styles/wave.css `.next-row`), and the most rows shown. */
const ROW_PITCH = 22.4;
const ROW_PITCH_DESKTOP = 26;
const MAX_ROWS = 8;

export const screen = {
  id: 'wave',
  /**
   * @param {HTMLElement} host
   * @param {import('../contract.js').App} app
   * @returns {import('../contract.js').ScreenInstance}
   */
  mount(host, app) {
    const { store, frc, cat, ground, clock } = app;
    const blink = frc.unitLevel(Unit.BLINK);
    const describeLevel = (level) => `${frc.formatLevelName(level)} ${frc.formatLevelWord(level)}`;

    /** The tumbler whose neighbours are shown: the first unit finer than the focus, until one is touched. */
    let selected = { row: 'pure', index: defaultTerm(frc, store.state.focus) };

    const moment = buildMoment({
      frc,
      onStep(row, index, delta) {
        const t = store.time();
        // an Earth field can be stepped anywhere; a term of the stamp only where the clock is defined
        const target = row === 'earth' ? stepCivil(frc, t, CIVIL_FIELDS[index], delta) : cat.contains(t) ? stepTerm(frc, cat, t, index, delta) : null;
        if (target !== null) store.setCursor(target);
      },
      onSelect(row, index) {
        if (selected.row === row && selected.index === index) return;
        selected = { row, index };
        clock.refreshSoon();
      },
      onGoTo(text) {
        const result = parseMoment(frc, cat, text, store.time(), store.state.mode === 'earth');
        if ('instant' in result) {
          store.setCursor(result.instant);
          return 'ok';
        }
        return result.error;
      },
      onNow: () => store.returnToNow(),
    });
    const sunCaption = buildSunCaption();
    const sun = createSunLane({ store });
    const waveCaption = buildWaveCaption();
    const field = createWaveField({ store });
    // the same control as the instrument's limb, laid straight: the wave re-scales to the level under its index
    const limb = createLimb({ frc, shape: 'straight', min: FOCUS_MIN, max: FOCUS_MAX, get: () => store.state.focus, set: (level) => store.setFocus(level), describe: describeLevel, label: 'Scale: the level of the wave' });
    const next = buildNext(frc);
    const root = h(
      'section',
      { class: 'wave', 'aria-label': 'Timeline' },
      moment.head,
      // one under the other on a phone, side by side on a desktop (styles/wave.css)
      h('div', { class: 'wave-top' }, moment.element, h('div', { class: 'wave-sun' }, sunCaption.element, sun.element)),
      h('div', { class: 'wave-main' }, waveCaption.element, field.element),
      limb.element,
      next.element,
    );
    host.append(root);

    /** How many rows of the list the screen holds. */
    let rowLimit = MAX_ROWS;
    const fitRows = () => {
      const big = store.state.layout === 'desktop';
      const space = next.element.getBoundingClientRect().bottom - next.rows.getBoundingClientRect().top;
      // on a desktop the rows stand in columns (styles/wave.css)
      const columns = Number(getComputedStyle(next.rows).columnCount) || 1;
      rowLimit = Math.max(2, Math.min(MAX_ROWS, Math.floor((space + 4) / (big ? ROW_PITCH_DESKTOP : ROW_PITCH)) * columns));
    };
    const centreGround = () => ground.set(field.centre());
    const observer = new ResizeObserver(() => {
      field.fit();
      sun.fit();
      limb.draw();
      fitRows();
      centreGround();
      clock.refreshSoon();
    });
    observer.observe(root);
    observer.observe(field.element);

    let first = true;

    return {
      update(frame, changed) {
        const { focus, mode } = store.state;
        if (first || changed?.has('layout')) {
          field.fit();
          sun.fit();
          fitRows();
        }
        if (changed?.has('focus')) {
          // a new scale: select the tumbler that moves the wave by a visible part of a cycle
          selected = { row: 'pure', index: defaultTerm(frc, focus) };
          field.fit();
        }
        if (mode === 'pure' && selected.row === 'earth') selected = { row: 'pure', index: defaultTerm(frc, focus) };
        if (first || changed?.has('focus') || changed?.has('theme') || changed?.has('layout')) limb.update();

        // everything said and lit, asked of the core for this instant (about sixty calls: cheap enough for
        // every pass; the DOM is touched only where a text changed)
        const reading = readWave(frame, focus, mode, { selected, present: store.now(), away: store.away });
        // the wave in words; EARTH mode adds the date, led by the Earth sign
        reading.describe = mode === 'earth' ? `${describeWave(reading)} ${EARTH_SIGN} ${dateLine(frc, frame.t)}.` : describeWave(reading);
        moment.update(reading, selected);
        sunCaption.update(reading);
        waveCaption.update(reading);
        next.update(reading, rowLimit);
        const wants = field.paint(frame, reading);
        sun.paint(reading, field.window(reading));
        if (first || changed?.has('layout') || changed?.has('focus')) centreGround();
        first = false;

        // the spans count down in Blinks at the finest; a threshold reorders the list
        let due = frame.inCatalogue ? frame.cycle(blink).end : null;
        for (const instant of reading.changes) if (instant !== null && (due === null || instant < due)) due = instant;
        let frameMs = wants.frameMs;
        if (store.live && frame.inCatalogue) {
          if (mode === 'earth') frameMs = Math.min(frameMs ?? Infinity, msToNextSecond(frc, frame.t));
          if (focus >= FAST_TEXT_FROM_FOCUS) frameMs = Math.min(frameMs ?? Infinity, FAST_TEXT_MS);
        }
        // a scrub drives its own frames (each one is a change of the cursor): nothing is `animating` here
        return { next: due, frameMs };
      },
      unmount() {
        observer.disconnect();
        field.destroy();
        sun.destroy();
        moment.destroy();
        limb.destroy();
        root.remove();
      },
    };
  },
};
