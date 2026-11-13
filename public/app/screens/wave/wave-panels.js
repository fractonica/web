/**
 * wave-panels.js - the DOM of the WAVE screen around its two canvases: real
 * text and real controls, readable by assistive technology.
 *
 *   .wave-head      WAVE (the screen's word, design ruling 4) · the "go to" field
 *   .wave-moment    MOMENT ............................ (o) NOW   [+3η 12ι]
 *                   α#6 β#4 γ#9 δ#3 ε#5 34η 29ι 21λ 3ν      the stamp: nine tumblers
 *                   ⊕ THU 8 OCT 2026 · 12:00:00 UTC          EARTH mode: the date-time line, whose
 *                                                            six fields are tumblers too
 *   .wave-next      NEXT THRESHOLDS: mark, level, quarter, (⊕ when), span
 *
 * A TUMBLER is one term that turns on its own: `role="spinbutton"`, drag it
 * up or down, roll the wheel over it, or focus it and press Up / Down (Page
 * Up / Down: five at a time). The neighbours of the selected tumbler are
 * shown ghosted above (the earlier value) and below (the later one), as on a
 * drum. This file reports the gestures; what a step means is model/travel.js.
 *
 * `build...()` makes a tree once; its `update(reading)` writes a reading of
 * wave-reading.js into it and touches only what changed.
 */
import { quarterMark, sunMark } from '../../drawing/marks.js';
import { EARTH_SIGN } from '../../model/earth.js';
import { CIVIL_FIELDS, MOMENT_MAX_LENGTH } from '../../model/travel.js';
import { capture, h, setHidden, setReading, setText, setWords } from '../../shell/dom.js';
import { steadyCaret } from '../../shell/steady-caret.js';

/** A drag turns a tumbler by one unit per this many px. */
const DRAG_STEP_PX = 18;
/** A wheel turns it by one unit per this much delta. */
const WHEEL_STEP = 50;
/** Page Up / Page Down step this many units. */
const PAGE_STEP = 5;

/**
 * Give an element the gestures of a tumbler.
 * @param {HTMLElement} element focusable, role="spinbutton"
 * @param {(delta: number) => void} step +1 = one unit later
 * @param {() => void} select the tumbler was touched or focused
 */
function makeTumbler(element, step, select) {
  let drag = null;
  let wheel = 0;
  element.addEventListener('focus', select);
  element.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || drag) return;
    drag = { id: event.pointerId, y: event.clientY, steps: 0 };
    capture(element, event.pointerId);
    element.focus({ preventScroll: true });
    event.preventDefault();
  });
  element.addEventListener('pointermove', (event) => {
    if (!drag || event.pointerId !== drag.id) return;
    // the drum follows the finger: dragging up brings the later value into the window
    const steps = Math.trunc((drag.y - event.clientY) / DRAG_STEP_PX);
    if (steps !== drag.steps) {
      step(steps - drag.steps);
      drag.steps = steps;
    }
  });
  const release = (event) => {
    if (drag && event.pointerId === drag.id) drag = null;
  };
  element.addEventListener('pointerup', release);
  element.addEventListener('pointercancel', release);
  element.addEventListener(
    'wheel',
    (event) => {
      event.preventDefault();
      select();
      wheel += event.deltaMode === 1 ? event.deltaY * 30 : event.deltaY;
      const steps = Math.trunc(wheel / WHEEL_STEP);
      if (steps !== 0) {
        wheel -= steps * WHEEL_STEP;
        step(steps);
      }
    },
    { passive: false },
  );
  element.addEventListener('keydown', (event) => {
    const delta = { ArrowUp: 1, ArrowDown: -1, PageUp: PAGE_STEP, PageDown: -PAGE_STEP }[event.key];
    if (delta === undefined) return;
    event.preventDefault();
    event.stopPropagation();
    step(delta);
  });
}

/** One tumbler: the value, with the earlier value ghosted above and the later below. */
function tumbler(className, label) {
  const previous = h('span', { class: 'ghost previous', 'aria-hidden': 'true' });
  const value = h('span', { class: 'value' });
  const next = h('span', { class: 'ghost next', 'aria-hidden': 'true' });
  const element = h('span', { class: `tumbler ${className}`.trim(), role: 'spinbutton', tabindex: 0, 'aria-label': label }, previous, value, next);
  return { element, previous, value, next };
}

/**
 * The top of the screen: title, "go to", the NOW mark, the stamp, the Earth line.
 * @param {object} options
 * @param {import('../../../lib/fractonica.js').Fractonica} options.frc
 * @param {(row: 'pure' | 'earth', index: number, delta: number) => void} options.onStep
 * @param {(row: 'pure' | 'earth', index: number) => void} options.onSelect
 * @param {(text: string) => 'ok' | 'parse' | 'range' | 'empty'} options.onGoTo
 * @param {() => void} options.onNow
 */
export function buildMoment({ frc, onStep, onSelect, onGoTo, onNow }) {
  // --- the title and the "go to" field ------------------------------------------
  const input = h('input', { type: 'text', class: 'goto-input', 'aria-label': 'Go to a moment', placeholder: 'GO TO', maxlength: String(MOMENT_MAX_LENGTH), autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', enterkeyhint: 'go' });
  const note = h('output', { class: 'caps goto-note', 'aria-live': 'polite' });
  const form = h('form', { class: 'wave-goto', role: 'search', 'aria-label': 'Go to a moment' }, input, note);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const result = onGoTo(input.value);
    setText(note, result === 'parse' ? 'NOT A MOMENT' : result === 'range' ? 'OUT OF CATALOGUE' : '');
    if (result === 'ok') {
      input.value = '';
      input.blur();
    }
  });
  // nothing blinks: a steady caret (the engine's where it has one, else drawn)
  const dropCaret = steadyCaret(input, form, () => Number(getComputedStyle(input).getPropertyValue('--goto-scale')) || 1);
  // the form's invisible hit area (app.css, touch targets) is part of the field: a touch there types into it
  form.addEventListener('pointerdown', (event) => {
    if (event.target !== form) return;
    event.preventDefault();
    input.focus();
  });
  input.addEventListener('input', () => setText(note, ''));
  input.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    input.value = '';
    setText(note, '');
    input.blur();
    event.stopPropagation();
  });
  const head = h('header', { class: 'wave-head' }, h('h1', { class: 'caps wave-title', text: 'WAVE' }), form);

  // --- MOMENT ... NOW -----------------------------------------------------------------
  const offset = h('span', { class: 'offset' });
  const now = h('button', { type: 'button', class: 'wave-now', onclick: onNow }, h('span', { class: 'ring', 'aria-hidden': 'true' }), h('span', { class: 'caps', text: 'NOW' }), offset);
  const caption = h('div', { class: 'moment-caption' }, h('span', { class: 'caps', text: 'MOMENT' }), now);

  // --- the stamp ------------------------------------------------------------------------
  const tumblers = [];
  const stamp = h('div', { class: 'wave-stamp', role: 'group', 'aria-label': 'The moment, term by term' });
  const out = h('p', { class: 'wave-out', hidden: true });
  /** Make the nine tumblers when the first reading names the units. */
  function ensureTumblers(terms) {
    if (tumblers.length === terms.length) return;
    tumblers.length = 0;
    terms.forEach((term, index) => {
      const item = tumbler('term', term.name);
      makeTumbler(
        item.element,
        (delta) => onStep('pure', index, delta),
        () => onSelect('pure', index),
      );
      tumblers.push(item);
    });
    stamp.replaceChildren(...tumblers.map((item) => item.element));
  }

  // --- EARTH: the date-time line, each field a tumbler ---------------------------------
  const earth = h('p', { class: 'earth wave-earth', hidden: true });
  /** field -> tumbler, built when EARTH mode is first shown and removed in PURE mode. */
  let earthTumblers = null;
  let earthWeekday = null;
  let earthZone = null;

  function writeEarth(civil, selected) {
    if (civil === null) {
      if (earthTumblers !== null) {
        // PURE mode: the Earth line is hidden AND empty
        earth.replaceChildren();
        earthTumblers = earthWeekday = earthZone = null;
      }
      setHidden(earth, true);
      return;
    }
    if (earthTumblers === null) {
      earthTumblers = new Map();
      earthWeekday = h('span', { class: 'weekday' });
      earthZone = h('span', { class: 'zone' });
      const parts = [h('span', { class: 'sign', 'aria-hidden': 'true', text: EARTH_SIGN }), h('span', { class: 'sr-only', text: 'Earth: ' }), earthWeekday];
      for (const item of civil.fields) {
        const made = tumbler('civil', item.label);
        const index = CIVIL_FIELDS.indexOf(item.field);
        makeTumbler(
          made.element,
          (delta) => onStep('earth', index, delta),
          () => onSelect('earth', index),
        );
        earthTumblers.set(item.field, made);
        parts.push(h('span', { class: 'lead', text: item.lead }), made.element);
      }
      parts.push(h('span', { class: 'lead', text: ' ' }), earthZone);
      earth.replaceChildren(...parts);
    }
    setHidden(earth, false);
    setText(earthWeekday, civil.weekday);
    setText(earthZone, civil.zone);
    for (const item of civil.fields) {
      const made = earthTumblers.get(item.field);
      const on = selected.row === 'earth' && CIVIL_FIELDS[selected.index] === item.field;
      setText(made.value, item.text);
      setText(made.previous, item.previous);
      setText(made.next, item.next);
      made.element.classList.toggle('selected', on);
      made.element.setAttribute('aria-valuetext', item.text);
    }
  }

  const element = h('div', { class: 'wave-moment' }, caption, stamp, out, earth);

  /**
   * @param {ReturnType<typeof import('./wave-reading.js').readWave>} reading
   * @param {{ row: 'pure' | 'earth', index: number }} selected
   */
  function update(reading, selected) {
    // the NOW mark: lit while the present is shown; away from it, the distance and the way back
    now.classList.toggle('lit', reading.atNow);
    now.setAttribute('aria-pressed', String(reading.atNow));
    now.setAttribute('aria-label', reading.atNow ? 'Now: the present is shown' : `Return to now${reading.offset ? ` (${reading.offset} from it)` : ''}`);
    setReading(offset, reading.offset);

    setHidden(stamp, !reading.lit);
    setHidden(out, reading.lit);
    setText(out, reading.out);
    if (reading.lit) {
      ensureTumblers(reading.terms);
      reading.terms.forEach((term, index) => {
        const item = tumblers[index];
        setReading(item.value, term.text);
        setReading(item.previous, term.previous);
        setReading(item.next, term.next);
        item.element.classList.toggle('selected', selected.row === 'pure' && selected.index === index);
        item.element.setAttribute('aria-valuetext', term.text);
      });
    }
    writeEarth(reading.earth, selected);
  }

  return { head, element, update, input, destroy: dropCaret };
}

/** The Sun lane's caption: SOLAR SYNC 4 820 ............ DRIFT −6 235λ (the drift in Flavons) */
export function buildSunCaption() {
  const number = h('span', { class: 'caps' });
  const drift = h('span', { class: 'caps' });
  const element = h('div', { class: 'sun-caption' }, number, drift);
  return {
    element,
    /** @param {ReturnType<typeof import('./wave-reading.js').readWave>} reading */
    update(reading) {
      // the numbers are the core's text; only the words are engraved (a drift carries lowercase unit letters)
      setWords(number, reading.sun ? `SOLAR SYNC ${reading.sun.number}` : 'SOLAR SYNC');
      setWords(drift, reading.sun?.drift ? `DRIFT ${reading.sun.drift}` : '');
    },
  };
}

/** The wave's caption: HELION WAVE ............ 9 θ · 36 ι */
export function buildWaveCaption() {
  const title = h('span', { class: 'caps' });
  const made = h('span', { class: 'caps made' });
  const element = h('div', { class: 'field-caption' }, title, made);
  return {
    element,
    update(reading) {
      setWords(title, reading.title);
      setWords(made, reading.caption);
    },
  };
}

/**
 * The list of next thresholds.
 * @param {import('../../../lib/fractonica.js').Fractonica} frc
 */
export function buildNext(frc) {
  const rows = h('div', { class: 'next-rows', role: 'list' });
  const element = h('section', { class: 'wave-next', 'aria-label': 'Next thresholds' }, h('h2', { class: 'caps next-title', text: 'NEXT THRESHOLDS' }), rows);
  let key = '';
  return {
    element,
    rows,
    /**
     * @param {ReturnType<typeof import('./wave-reading.js').readWave>} reading
     * @param {number} limit how many rows the screen holds
     */
    update(reading, limit) {
      const shown = reading.upcoming.slice(0, limit);
      // the rows are rebuilt only when their order, marks or count change; the spans are rewritten in place
      const next = shown.map((row) => `${row.sun ? 'sun' : row.symbol}.${row.quarter}`).join('|');
      if (next !== key) {
        key = next;
        rows.replaceChildren(
          ...shown.map((row) =>
            h(
              'div',
              { class: row.sun ? 'next-row sun-row' : 'next-row', role: 'listitem' },
              quarterMark(frc, row.fraction),
              row.sun ? h('span', { class: 'symbol' }, sunMark(), h('span', { class: 'sr-only', text: 'Solar sync' })) : h('span', { class: 'symbol', text: row.symbol }),
              h('span', { class: 'caps', text: row.quarter.toUpperCase() }),
              h('span', { class: 'leader', 'aria-hidden': 'true' }),
              h('span', { class: 'earth', hidden: true }),
              h('span', { class: 'span value' }),
            ),
          ),
        );
      }
      shown.forEach((row, i) => {
        const element = rows.children[i];
        const earth = element.querySelector('.earth');
        if (earth.dataset.text !== row.earth) {
          earth.dataset.text = row.earth;
          earth.replaceChildren();
          setHidden(earth, row.earth === '');
          if (row.earth !== '') earth.append(h('span', { class: 'sign', 'aria-hidden': 'true', text: EARTH_SIGN }), h('span', { class: 'sr-only', text: 'Earth: ' }), row.earth);
        }
        setReading(element.querySelector('.span'), row.span);
      });
    },
  };
}
