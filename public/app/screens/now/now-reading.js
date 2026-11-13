/**
 * now-reading.js - everything the NOW screen says in text, asked of the core.
 *
 * `readNow(frame, focus, mode)` returns the strings and counts of the panels
 * beside the instrument (DESIGN.md sections 7 and 9). Each string is the
 * core's own wording; this module chooses WHICH readings are shown and in
 * which order, and nothing else. Earth translations are present only when
 * `mode === 'earth'` (they are '' otherwise, so pure mode cannot leak one).
 */
import { LevelKind, PentadForm, Unit } from '../../../lib/fractonica.js';
import { BEZEL_FRACTIONS } from '../../instrument/reading.js';
import { driftFlavons, outOfCatalogueText } from '../../model/frame.js';
import { clockTime, dateLine, dayMonthTime, duration, when } from '../../model/earth.js';
import { driftSeconds } from '../../model/shim-earth-text.js';

/** The four majors, said in words (levels 0..3). */
const MAJORS = Object.freeze([0, 1, 2, 3]);
/** How many ancestors the list of next thresholds shows. */
const UPCOMING_LEVELS = 4;

/**
 * @param {import('../../model/frame.js').Frame} frame
 * @param {number} focus
 * @param {'pure' | 'earth'} mode
 */
export function readNow(frame, focus, mode) {
  const { frc, cat, t } = frame;
  const earth = mode === 'earth';
  const earthLine = earth ? dateLine(frc, t) : '';
  if (!frame.inCatalogue) return { lit: false, out: outOfCatalogueText(frc, cat), earthLine, changes: [] };

  const stamp = frame.stamp(); // "α#6 β#4 γ#9 δ#3 ε#5 34η 29ι 21λ 3ν"
  const terms = frame.terms(); // the same, term by term: "α#6" ... "3ν"
  const changes = [frame.cycle(frc.unitLevel(Unit.BLINK)).end];

  // --- the majors, in words ---------------------------------------------------
  const majors = MAJORS.map((level) => {
    const cycle = frame.cycle(level);
    return { level, letter: frc.formatLevelName(level), name: frc.formatCycleName(level, cycle.cycle), quarter: frc.formatQuarter(cycle.quarter) };
  });

  // --- the two periods on the instrument: the focus and its child ------------
  const countdowns = [focus, focus + 1].map((level) => {
    const cycle = frame.cycle(level);
    const threshold = frame.threshold(level);
    changes.push(threshold.time, frame.spanChange(threshold.time)); // the countdown's text: the core's next change
    const kind = frc.levelKind(level);
    const unit = frc.unitOfLevel(level);
    return {
      level,
      letter: frc.formatLevelName(level),
      // "HELION", or the core's "between" for a level between units (design ruling 4)
      kind: unit !== null ? frc.formatUnitName(unit) : kind === LevelKind.BETWEEN ? frc.formatLevelKind(kind) : frc.formatLevelWord(level),
      siblings: cycle.siblings,
      local: cycle.local,
      digits: frame.odometer(level).digits,
      // the catalogue's closing instant: nothing comes later, so there is no "η PEAK IN" without a span either
      quarter: threshold.time === null ? '' : frc.formatQuarter(threshold.name),
      span: threshold.time === null ? '' : frame.spanTo(threshold.time),
      earthTime: earth && threshold.time !== null ? clockTime(frc, threshold.time) : '',
      earthDuration: earth && threshold.time !== null ? duration(frc, t, threshold.time) : '',
    };
  });

  // --- the Sun -----------------------------------------------------------------
  const pentad = frame.pentad();
  const sync = frame.sync();
  let sun = null;
  if (sync) {
    changes.push(sync.next.time, frame.syncOdometer().nextChange, frame.spanChange(sync.next.time));
    sun = {
      digits: frame.syncOdometer().digits,
      // a sync before the anchor has a negative number ("−3"): the core writes it with its sign
      number: frc.formatCountSigned(sync.sync),
      // "−6 235λ": the drift in Flavons, as the core cuts it (towards zero; the design's "−6 236λ" is rounded)
      drift: driftFlavons(frame, sync),
      nextQuarter: frc.formatQuarter(sync.next.name),
      nextFraction: BEZEL_FRACTIONS[sync.next.name],
      nextTime: sync.next.time,
      nextSpan: frame.spanTo(sync.next.time),
      earthStart: earth ? dayMonthTime(frc, sync.start) : '',
      earthDrift: earth ? driftSeconds(frc, sync.driftUs) : '',
      earthNext: earth && sync.next.time !== null ? dayMonthTime(frc, sync.next.time, true) : '',
    };
  }

  // --- what comes next, across the levels: the nearest ancestors and the Sun ---
  const upcoming = [];
  for (let level = focus - 1; level >= Math.max(0, focus - UPCOMING_LEVELS); level--) {
    const threshold = frame.threshold(level);
    if (threshold.time === null) continue; // the catalogue's closing instant: nothing comes later
    changes.push(frame.spanChange(threshold.time));
    upcoming.push({ sun: false, symbol: frc.formatLevelName(level), quarter: frc.formatQuarter(threshold.name), fraction: BEZEL_FRACTIONS[threshold.name], time: threshold.time, span: frame.spanTo(threshold.time) });
  }
  if (sun) upcoming.push({ sun: true, symbol: '', quarter: sun.nextQuarter, fraction: sun.nextFraction, time: sun.nextTime, span: sun.nextSpan });
  upcoming.sort((a, b) => (a.time === b.time ? 0 : a.time === null ? 1 : b.time === null ? -1 : a.time < b.time ? -1 : 1));
  for (const row of upcoming) row.earth = earth && row.time !== null ? when(frc, row.time, t) : '';

  return {
    lit: true,
    stamp,
    /** "Delta Trifracton" and "End": the innermost major and its quarter (the phone's date line). */
    dateName: majors[3].name,
    dateQuarter: majors[3].quarter,
    majors,
    /** The reading: the Nuclide, Helion and Preon terms large, Flavons and Blinks at half size. */
    reading: { main: terms.slice(4, 7), fine: terms.slice(7) },
    earthLine,
    countdowns,
    pentad: {
      index: pentad.index,
      helion: pentad.helion,
      helions: pentad.helions,
      name: frc.formatPentad(pentad, PentadForm.FULL), // "Pentad II"
      // the numeral inside the drawn mark: "II" ("" for the Hypopentad, whose square is the whole mark)
      numeral: frc.formatPentad(pentad, PentadForm.NUMERAL),
      detail: `${frc.formatUnitName(Unit.HELION)} ${pentad.helion} of ${pentad.helions}`,
    },
    sun,
    upcoming,
    changes,
  };
}
