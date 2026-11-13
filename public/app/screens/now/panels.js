/**
 * panels.js - the DOM of the NOW screen beside the instrument: real text,
 * selectable and readable by assistive technology.
 *
 * One tree serves both arrangements; styles/app.css places it (phone: under
 * the instrument, centred; desktop: the right column) and hides what an
 * arrangement does not show (the majors' rows and the list of next thresholds
 * are desktop only, the single date line is phone only).
 *
 *   .now-info > .now-column   the scrolling box and its content; inside:
 *   .pentad        the Pentad mark (pentagon / square) and its name
 *   .date-words    DELTA TRIFRACTON · END                         (phone)
 *   .majors        the four major names with their quarter words   (desktop)
 *   .reading       ε#5 34η 29ι  21λ 3ν
 *   .earth-line    ⊕ THU 8 OCT 2026 · 12:00:00 UTC                 (Earth mode)
 *   .countdowns    two periods: bead counter, "η END IN", the span (+ glyph pair on desktop)
 *   .sun           three-glyph sync odometer | SOLAR SYNC | DRIFT | <quarter> IN
 *   .upcoming      NEXT THRESHOLDS                                 (desktop)
 *
 * `build()` makes the tree once; `update(reading)` writes a reading of
 * now-reading.js into it and touches only what changed.
 */
import { beadRow, pentadMark, quarterMark, sunMark } from '../../drawing/marks.js';
import { SUN_PITCH, odometerSvg, updateOdometerSvg } from '../../drawing/glyphs.js';
import { EARTH_SIGN } from '../../model/earth.js';
import { h, readingNodes, setHidden, setReading, setText, setWords } from '../../shell/dom.js';

/** Glyph sizes in px per design unit (DESIGN.md section 6). */
const U = Object.freeze({ pair: 5.2, sunPhone: 3.7, sunDesktop: 4.6 });

/** An Earth translation line: hidden and empty until `setEarth` gives it words. */
const earthLine = (className = '') => h('p', { class: `earth ${className}`.trim(), hidden: true });

/** Write (or clear) an Earth translation, led by the Earth sign. */
function setEarth(element, words, extra = '') {
  const key = `${words}|${extra}`;
  if (element.dataset.text === key) return;
  element.dataset.text = key;
  element.replaceChildren();
  setHidden(element, words === '');
  if (words === '') return;
  element.append(h('span', { class: 'sign', 'aria-hidden': 'true', text: EARTH_SIGN }), h('span', { class: 'sr-only', text: 'Earth: ' }), words);
  if (extra) element.append(h('span', { class: 'dur', text: ` · ${extra}` }));
}

/**
 * @param {import('../../../lib/fractonica.js').Fractonica} frc
 * @returns {{ element: HTMLElement, update: (reading: ReturnType<typeof import('./now-reading.js').readNow>, layout: string) => void }}
 */
export function buildPanels(frc) {
  // --- the Pentad -------------------------------------------------------------
  const mark = pentadMark(frc);
  const pentadName = h('span', { class: 'caps pentad-name' });
  const pentadDetail = h('span', { class: 'caps pentad-detail' });
  const pentad = h('div', { class: 'pentad' }, mark.element, h('span', {}, pentadName, pentadDetail));

  // --- the date ---------------------------------------------------------------
  const dateWords = h('p', { class: 'caps date-words' });
  const majorRows = [0, 1, 2, 3].map(() => ({
    letter: h('span', { class: 'letter' }),
    name: h('span', { class: 'caps name' }),
    quarter: h('span', { class: 'caps quarter' }),
  }));
  const majors = h('div', { class: 'majors' }, ...majorRows.map((row) => h('div', { class: 'major' }, row.letter, row.name, row.quarter)));
  const reading = h('p', { class: 'reading', 'aria-label': '' });
  const earthDate = earthLine('earth-line');

  // --- the two periods --------------------------------------------------------
  const periods = [0, 1].map(() => {
    const beads = beadRow();
    const period = {
      glyphs: odometerSvg(frc, [0, 0], { u: U.pair }),
      headLetter: h('span', { class: 'cd-letter' }),
      kind: h('span', { class: 'caps' }),
      beads,
      labelLetter: h('span', { class: 'cd-letter' }),
      labelWords: h('span', {}),
      span: h('div', { class: 'cd-span value' }),
      earth: earthLine(),
    };
    period.element = h(
      'div',
      { class: 'countdown' },
      period.glyphs,
      h('div', { class: 'cd-head' }, period.headLetter, period.kind),
      beads.element,
      h('div', { class: 'caps cd-label' }, period.labelLetter, period.labelWords),
      period.span,
      period.earth,
    );
    return period;
  });
  const countdowns = h('div', { class: 'countdowns' }, ...periods.map((p) => p.element));

  // --- the Sun ----------------------------------------------------------------
  const sunGlyphs = odometerSvg(frc, [0, 0, 0], { u: U.sunPhone, pitch: SUN_PITCH });
  sunGlyphs.classList.add('sol');
  const sunColumn = (label) => {
    const column = { label: h('div', { class: 'caps', text: label }), value: h('div', { class: 'value' }), earth: earthLine() };
    column.element = h('div', { class: 'sun-col' }, column.label, column.value, column.earth);
    return column;
  };
  const sunNumber = sunColumn('SOLAR SYNC');
  const sunDrift = sunColumn('DRIFT');
  const sunNext = sunColumn('');
  const sun = h('div', { class: 'sun' }, h('div', { class: 'sun-glyphs' }, sunGlyphs), sunNumber.element, sunDrift.element, sunNext.element);

  // --- next thresholds --------------------------------------------------------
  const upcomingRows = h('div', { class: 'upcoming-rows' });
  const upcoming = h('div', { class: 'upcoming' }, h('div', { class: 'caps upcoming-title', text: 'NEXT THRESHOLDS' }), upcomingRows);
  let upcomingKey = '';

  const rules = [h('hr', { class: 'rule rule-sun' }), h('hr', { class: 'rule rule-upcoming' })];
  // .now-info is the scrolling box; .now-column is its content, scaled as a whole on desktop
  const column = h(
    'div',
    { class: 'now-column' },
    pentad,
    dateWords,
    majors,
    reading,
    earthDate,
    countdowns,
    rules[0],
    sun,
    rules[1],
    upcoming,
  );
  const element = h('div', { class: 'now-info', role: 'region', 'aria-label': 'The reading' }, column);

  /** Write a reading into the tree. */
  function update(now, layout) {
    element.classList.toggle('out-of-catalogue', !now.lit);
    setEarth(earthDate, now.earthLine);
    for (const block of [pentad, dateWords, majors, countdowns, sun, upcoming, ...rules]) block.style.visibility = now.lit ? '' : 'hidden';
    if (!now.lit) {
      // design ruling 7: the reading is replaced by the words, nothing else is shown
      setText(reading, now.out);
      reading.setAttribute('aria-label', now.out);
      return;
    }

    mark.update(now.pentad, now.pentad.numeral);
    setWords(pentadName, now.pentad.name);
    setWords(pentadDetail, `  ·  ${now.pentad.detail}`);
    pentad.setAttribute('aria-label', `${now.pentad.name}, ${now.pentad.detail}`);

    setWords(dateWords, `${now.dateName}  ·  ${now.dateQuarter}`);
    now.majors.forEach((major, i) => {
      setText(majorRows[i].letter, major.letter);
      setWords(majorRows[i].name, major.name);
      setWords(majorRows[i].quarter, major.quarter);
    });

    const text = [...now.reading.main, ...now.reading.fine].join(' ');
    if (reading.dataset.text !== text) {
      reading.dataset.text = text;
      reading.setAttribute('aria-label', text);
      reading.replaceChildren(
        ...now.reading.main.map((term) => h('span', { class: 'term' }, ...readingNodes(term))),
        ...now.reading.fine.map((term, i) => h('span', { class: i === 0 ? 'term fine' : 'fine', text: term })),
      );
    }

    now.countdowns.forEach((countdown, i) => {
      const period = periods[i];
      updateOdometerSvg(frc, period.glyphs, countdown.digits, { u: U.pair });
      setText(period.headLetter, countdown.letter);
      setWords(period.kind, countdown.kind);
      period.beads.update(countdown.siblings, countdown.local, layout === 'desktop' ? 9.5 : 8.2);
      // no threshold ahead (the catalogue's closing instant): the label goes with the span
      setText(period.labelLetter, countdown.quarter ? `${countdown.letter}  ` : '');
      setWords(period.labelWords, countdown.quarter ? `${countdown.quarter}  in` : '');
      setReading(period.span, countdown.span);
      setEarth(period.earth, countdown.earthTime, countdown.earthDuration);
    });

    const hasSun = now.sun !== null;
    sun.style.visibility = hasSun ? '' : 'hidden';
    if (hasSun) {
      updateOdometerSvg(frc, sunGlyphs, now.sun.digits, { u: layout === 'desktop' ? U.sunDesktop : U.sunPhone, pitch: SUN_PITCH });
      setReading(sunNumber.value, now.sun.number);
      setReading(sunDrift.value, now.sun.drift);
      setWords(sunNext.label, `${now.sun.nextQuarter} in`);
      setReading(sunNext.value, now.sun.nextSpan);
      setEarth(sunNumber.earth, now.sun.earthStart);
      setEarth(sunDrift.earth, now.sun.earthDrift);
      setEarth(sunNext.earth, now.sun.earthNext);
    }

    // the list is rebuilt only when its rows change order or kind; its texts are updated in place
    const key = now.upcoming.map((row) => `${row.sun ? 'sun' : row.symbol}:${row.quarter}`).join('|');
    if (key !== upcomingKey) {
      upcomingKey = key;
      upcomingRows.replaceChildren(
        ...now.upcoming.map((row) =>
          h(
            'div',
            { class: row.sun ? 'upcoming-row sun-row' : 'upcoming-row' },
            quarterMark(frc, row.fraction),
            row.sun ? h('span', { class: 'symbol', role: 'img', 'aria-label': 'Sun' }, sunMark()) : h('span', { class: 'symbol', text: row.symbol }),
            h('span', { class: 'caps', text: row.quarter.toUpperCase() }),
            h('span', { class: 'leader' }),
            earthLine(),
            h('span', { class: 'span' }),
          ),
        ),
      );
    }
    now.upcoming.forEach((row, i) => {
      const line = upcomingRows.children[i];
      setEarth(line.querySelector('.earth'), row.earth);
      setReading(line.querySelector('.span'), row.span);
    });
  }

  return { element, update };
}
