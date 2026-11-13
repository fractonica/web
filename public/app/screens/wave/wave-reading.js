
/**
 * wave-reading.js - everything the WAVE screen says and lights, asked of the core.
 *
 * `readWave(frame, focus, mode, view)` returns data only (DESIGN.md sections 8
 * and 9): the nine terms of the stamp with the neighbours of the selected
 * one, the wave of the focused level (its cycle, its four thresholds), the
 * Sun's lane (sync, Pentads, quarters), the list of next thresholds and the
 * distance of the cursor from the present. Each string is the core's own
 * wording; this module chooses WHICH readings are shown and in which order.
 * Earth translations are present only when `mode === 'earth'` ('' or null
 * otherwise, so pure mode cannot leak one).
 */
import { PentadForm, Quarter, Unit } from '../../../lib/fractonica.js';
import { BEZEL_FRACTIONS } from '../../instrument/reading.js';
import { driftFlavons, outOfCatalogueText } from '../../model/frame.js';
import { cyclesWithin, halfInSync } from '../../model/halves.js';
import { rungFacts } from '../../model/rungs.js';
import { civilTerms, dayMonthTime, when, whenOrOffset } from '../../model/earth.js';
import { CIVIL_FIELDS, TERMS, stepCivil, stepTerm } from '../../model/travel.js';

/** The list of next thresholds reaches from this many levels finer than the focus ... */
const UPCOMING_FINER = 2;
/** ... to this many coarser (and the Sun). */
const UPCOMING_COARSER = 4;
/** The four thresholds of a cycle in the order they come, and where each sits in the cycle. */
const WAVE_QUARTERS = Object.freeze([
  { quarter: Quarter.PEAK, fraction: 0.25, point: 1 },
  { quarter: Quarter.NODE, fraction: 0.5, point: 2 },
  { quarter: Quarter.VALLEY, fraction: 0.75, point: 3 },
  { quarter: Quarter.END, fraction: 1, point: 4 },
]);

/** What does not change inside one solar sync: its Pentads and the instants of its quarters. */
const syncCache = new Map();

/**
 * The first unit strictly finer than a level: the term a tumbler row selects
 * by default, so that a step moves the wave by a visible part of a cycle.
 * @returns {number} an index into TERMS
 */
export function defaultTerm(frc, focus) {
  const index = TERMS.findIndex((term) => frc.unitLevel(term.unit) > focus);
  return index === -1 ? TERMS.length - 1 : index;
}

/**
 * @param {import('../../model/frame.js').Frame} frame
 * @param {number} focus the level of the wave
 * @param {'pure' | 'earth'} mode
 * @param {object} view
 * @param {{ row: 'pure' | 'earth', index: number }} view.selected the tumbler whose neighbours are shown
 * @param {bigint} view.present the present (the cursor's distance is measured from it)
 * @param {boolean} view.away a cursor is set
 */
export function readWave(frame, focus, mode, { selected, present, away }) {
  const { frc, cat, t } = frame;
  const earth = mode === 'earth';
  const letter = frc.formatLevelName(focus);
  const facts = rungFacts(frc, focus);
  const base = {
    focus,
    letter,
    /** "Helion wave", "Theta wave": the unit's name, or the letter's word for a level between units. */
    title: `${facts.title} wave`,
    /** "9 θ · 36 ι": what one cycle of the wave is made of, two levels down. */
    caption: `${facts.children}  ·  ${frc.formatCount(cyclesWithin(frc, focus, focus + 2))} ${frc.formatLevelName(focus + 2)}`,
    earth: earth ? readEarthTerms(frc, t, selected) : null,
  };
  if (!frame.inCatalogue) {
    return { ...base, lit: false, out: outOfCatalogueText(frc, cat), terms: [], offset: '', atNow: !away, wave: null, sun: null, upcoming: [], changes: [] };
  }

  const blink = frc.unitLevel(Unit.BLINK);
  const changes = [frame.cycle(blink).end];

  // --- the stamp, term by term (the core writes each term) -------------------------
  const stamp = frame.stamp();
  const words = frame.terms();
  const termOf = (instant, index) => frc.formatDateTerm(cat.dateAt(instant), TERMS[index].unit);
  const terms = TERMS.map((term, index) => {
    const shown = selected.row === 'pure' && selected.index === index;
    // the neighbours are where a step of the tumbler leads; none at the catalogue's edge
    const earlier = shown ? stepTerm(frc, cat, t, index, -1) : null;
    const later = shown ? stepTerm(frc, cat, t, index, 1) : null;
    return {
      index,
      name: frc.formatUnitName(term.unit),
      text: words[index],
      previous: earlier !== null && termOf(earlier, index) !== words[index] ? termOf(earlier, index) : '',
      next: later !== null && termOf(later, index) !== words[index] ? termOf(later, index) : '',
    };
  });

  // --- how far the cursor is from the present --------------------------------------
  let offset = '';
  if (away && cat.contains(present) && present !== t) {
    // the core says the direction: "+18ι 13λ" to a later instant, "−6ι 43λ" to an earlier one
    offset = frc.formatSpanSigned(cat.spanBetween(present, t));
  }

  // --- the wave of the focused level ----------------------------------------------
  const cycle = frame.cycle(focus);
  const threshold = frame.threshold(focus);
  const points = frame.points(focus);
  changes.push(threshold.time, frame.spanChange(threshold.time)); // the countdown's text: the core's next change
  const wave = {
    cycle: cycle.cycle,
    count: cat.cycleCount(focus),
    fraction: cycle.fraction,
    /** How long the running cycle lasts, in ms (how fast the wave moves: for the redraw rate only). */
    millis: Number(cycle.end - cycle.start) / 1000,
    name: frc.formatCycleName(focus, cycle.cycle),
    nextWord: frc.formatQuarter(threshold.name),
    nextSpan: frame.spanTo(threshold.time),
    thresholds: WAVE_QUARTERS.map(({ quarter, fraction, point }) => ({
      quarter,
      fraction,
      word: frc.formatQuarter(quarter),
      time: points[point],
      next: quarter === threshold.name,
      earth: earth && points[point] !== null ? whenOrOffset(frc, points[point], t) : '',
    })),
    /** start, peak, node, valley, end: where a released scrub may snap. */
    points,
  };

  // --- the Sun ------------------------------------------------------------------------
  const sync = frame.sync();
  let sun = null;
  if (sync) {
    const level = frc.constants.SYNC_LEVEL;
    const fixed = syncFacts(frc, cat, sync);
    const helion = frame.cycle(level);
    const half = halfInSync(frc, sync, helion);
    const pentad = frame.pentad();
    changes.push(sync.next.time, frame.spanChange(sync.next.time));
    sun = {
      // a sync before the anchor has a negative number ("−3"): the core writes it with its sign
      number: frc.formatCountSigned(sync.sync),
      drift: driftFlavons(frame, sync), // "−6 235λ", as on NOW
      sync,
      /** The running half-Helion counted from the sync's start (the header's rule on the core's place of the Helion). */
      half: half.index,
      progress: half.progress,
      fraction: sync.fraction,
      pentads: fixed.pentads.map((item) => ({ ...item, on: item.index === pentad.index })),
      pentadName: frc.formatPentad(pentad, PentadForm.FULL, true),
      quarters: fixed.quarters.map((item) => ({
        word: item.word,
        time: item.time,
        next: item.quarter === sync.next.name,
        earth: earth && item.time !== null ? dayMonthTime(frc, item.time) : '',
      })),
      nextWord: frc.formatQuarter(sync.next.name),
      nextSpan: frame.spanTo(sync.next.time),
    };
  }

  // --- what comes next, across the levels around the focus, and the Sun ------------
  const upcoming = [];
  const finest = Math.min(frc.constants.CLOCK_MAX_LEVEL, focus + UPCOMING_FINER);
  for (let level = finest; level >= Math.max(0, focus - UPCOMING_COARSER); level--) {
    const next = frame.threshold(level);
    changes.push(next.time);
    // at the catalogue's closing instant nothing comes later (FRC_TIME_NONE): there is no row to show
    if (next.time === null) continue;
    changes.push(frame.spanChange(next.time));
    upcoming.push({ sun: false, level, symbol: frc.formatLevelName(level), quarter: frc.formatQuarter(next.name), fraction: BEZEL_FRACTIONS[next.name], time: next.time, span: frame.spanTo(next.time) });
  }
  if (sun) upcoming.push({ sun: true, level: -1, symbol: '', quarter: sun.nextWord, fraction: BEZEL_FRACTIONS[sync.next.name], time: sync.next.time, span: sun.nextSpan });
  upcoming.sort((a, b) => (a.time === b.time ? b.level - a.level : a.time === null ? 1 : b.time === null ? -1 : a.time < b.time ? -1 : 1));
  for (const row of upcoming) row.earth = earth && row.time !== null ? when(frc, row.time, t) : '';

  return { ...base, lit: true, out: '', stamp, terms, offset, atNow: !away, wave, sun, upcoming, changes };
}

/** The Earth date-time as terms, with the neighbours of the selected one (EARTH mode only). */
function readEarthTerms(frc, t, selected) {
  const civil = civilTerms(frc, t);
  const neighbour = (field, delta) => {
    const instant = stepCivil(frc, t, field, delta);
    return instant === null ? '' : civilTerms(frc, instant).fields.find((item) => item.field === field).text;
  };
  return {
    ...civil,
    fields: civil.fields.map((item) => {
      const shown = selected.row === 'earth' && CIVIL_FIELDS[selected.index] === item.field;
      return { ...item, previous: shown ? neighbour(item.field, -1) : '', next: shown ? neighbour(item.field, 1) : '' };
    }),
  };
}

/**
 * The parts of a sync that do not move: the Pentads with the place of their
 * first Helion in the sync (the core's `first`), and the instants of the four
 * quarters (each is the core's "next threshold" of the one before).
 */
function syncFacts(frc, cat, sync) {
  let facts = syncCache.get(sync.sync);
  if (facts) return facts;
  const pentads = [];
  for (let index = 0; index < 4; index++) {
    try {
      const pentad = cat.pentadByNumber(sync.sync, index);
      pentads.push({
        index,
        first: pentad.first,
        count: pentad.helions,
        // the numeral beside the drawn mark: "II" ('' for the Hypopentad, whose square is the whole mark)
        numeral: frc.formatPentad(pentad, PentadForm.NUMERAL),
      });
    } catch {
      // a Pentad wholly outside the catalogue is not drawn
    }
  }
  const quarters = [];
  let at = sync.start;
  for (let i = 0; i < 4 && at !== null; i++) {
    const next = cat.syncAt(at).next;
    quarters.push({ quarter: next.name, word: frc.formatQuarter(next.name), time: next.time });
    at = next.time;
  }
  facts = { pentads, quarters };
  if (syncCache.size > 16) syncCache.clear();
  syncCache.set(sync.sync, facts);
  return facts;
}

/**
 * The wave as words, for assistive technology. Pure-safe: only the core's
 * notation (the Earth line is added by the caller in EARTH mode).
 * @param {ReturnType<typeof readWave>} reading
 */
export function describeWave(reading) {
  if (!reading.lit) return `${reading.title}. ${reading.out}`;
  const { wave } = reading;
  return `${reading.title}: ${wave.name}. ${wave.nextWord} in ${wave.nextSpan}.`;
}
