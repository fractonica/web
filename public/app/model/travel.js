/**
 * travel.js - time travel by whole steps: where a tumbler, a key or a typed
 * date takes the cursor. Every destination is an instant the core returned.
 *
 *   stepTerm(frc, cat, t, index, delta)   one term of the stamp, by whole units
 *   stepCivil(frc, t, field, delta)       one field of the Earth date (EARTH mode)
 *   stepThreshold(frc, cat, t, level, d)  to the next / previous threshold of a level
 *   parseMoment(frc, cat, text, t, earth) what the "go to" field accepts
 *
 * HOW A TERM IS STEPPED WITHOUT ARITHMETIC: "one Preon later" is the same
 * place in the next Preon. The next Preon is the core's (`cycleByIndex` of the
 * running cycle's index + 1), its date is the core's (`dateAt` of its start:
 * that is where a Helion or a Nuclide is carried), and the finer terms of the
 * moment shown are written into that date, which `dateToTime` turns into the
 * instant. No radix, no range and no carry is known to this file.
 */
import { FractonicaError, Unit } from '../../lib/fractonica.js';
import { parseEarthDate } from './earth.js';

/** The nine terms of the stamp, coarsest first: the unit of each and its field in a date. */
export const TERMS = Object.freeze([
  { unit: Unit.ALPHA, field: 'alpha' },
  { unit: Unit.BETA, field: 'beta' },
  { unit: Unit.GAMMA, field: 'gamma' },
  { unit: Unit.DELTA, field: 'delta' },
  { unit: Unit.NUCLIDE, field: 'epsilon' },
  { unit: Unit.HELION, field: 'eta' },
  { unit: Unit.PREON, field: 'iota' },
  { unit: Unit.FLAVON, field: 'lambda' },
  { unit: Unit.BLINK, field: 'nu' },
]);

/** The fields of an Earth date that can be stepped, in the order of a civil date-time. */
export const CIVIL_FIELDS = Object.freeze(['year', 'month', 'day', 'hour', 'minute', 'second']);

/** Longer text than this is not a moment (the longest form the core writes is under 160 bytes). */
export const MOMENT_MAX_LENGTH = 200;

const isStatus = (error, ...statuses) => error instanceof FractonicaError && statuses.includes(error.status);

/**
 * Step one term of the stamp by whole units, keeping the finer terms.
 * @param {import('../../lib/fractonica.js').Fractonica} frc
 * @param {import('../../lib/fractonica.js').Catalogue} cat
 * @param {bigint} t the moment shown (inside the catalogue)
 * @param {number} index which term, 0 (Alpha) .. 8 (Blink)
 * @param {number} delta whole units, negative = earlier
 * @returns {bigint} the instant; a step that would leave the catalogue stops at its edge (design ruling 7)
 */
export function stepTerm(frc, cat, t, index, delta) {
  const edge = delta < 0 ? cat.first : cat.last;
  const level = frc.unitLevel(TERMS[index].unit);
  const target = cat.cycleAt(t, level).cycle + BigInt(delta);
  if (target < 0n || target >= cat.cycleCount(level)) return edge;
  const start = cat.cycleByIndex(level, target).start;
  if (start === null) return edge;
  const here = cat.dateAt(t);
  // the coarser terms as the core carries them, the finer ones as they stand
  const date = { ...cat.dateAt(start) };
  for (let i = index + 1; i < TERMS.length; i++) date[TERMS[i].field] = here[TERMS[i].field];
  try {
    return cat.dateToTime(date);
  } catch (error) {
    if (isStatus(error, 'FRC_ERR_RANGE')) return edge; // a Blink after the closing instant
    throw error;
  }
}

/**
 * Step one field of the Earth date in the browser's zone.
 *   second, minute, hour   that much elapsed time (so a step is the same step across a
 *                          change of the zone's offset)
 *   day, month, year       the civil field itself: the fields are the core's
 *                          (`civilFromTime`) and so is the way back (`timeFromCivil` is
 *                          linear in every field: day 32 is the day after the 31st, day 0
 *                          the day before the 1st, month 13 next January). The zone's
 *                          offset is asked again at the result.
 * This is Earth's calendar, not the clock's: no Fractonica quantity is touched.
 * @param {import('../../lib/fractonica.js').Fractonica} frc
 * @param {bigint} t
 * @param {'year' | 'month' | 'day' | 'hour' | 'minute' | 'second'} field
 * @param {number} delta whole steps, negative = earlier
 * @returns {bigint | null} null when the instant cannot be represented
 */
export function stepCivil(frc, t, field, delta) {
  const seconds = { second: 1, minute: 60, hour: 3600 }[field];
  if (seconds !== undefined) return t + BigInt(delta * seconds) * BigInt(frc.constants.US_PER_SECOND);
  let result = t;
  // one step at a time: the civil fields are unsigned, and each step is asked of the core afresh
  for (let n = Math.abs(delta); n > 0 && result !== null; n--) {
    const offset = frc.utcOffsetSeconds(result);
    const civil = { ...frc.civilFromTime(result, offset) };
    civil[field] += Math.sign(delta);
    let stepped = frc.timeFromCivil(civil, offset);
    if (stepped !== null) {
      const offsetThere = frc.utcOffsetSeconds(stepped);
      if (offsetThere !== offset) stepped = frc.timeFromCivil(civil, offsetThere);
    }
    result = stepped;
  }
  return result;
}

/**
 * The threshold of `level` after (direction > 0) or before (direction < 0) the moment shown.
 * Forward it is the core's `nextThreshold`; backward the latest of the running cycle's
 * points before t, or the last point of the cycle before it.
 * @returns {bigint | null} null when there is none inside the catalogue
 */
export function stepThreshold(frc, cat, t, level, direction) {
  if (direction > 0) return cat.nextThreshold(t, level).time;
  const cycle = cat.cycleAt(t, level);
  const points = cat.cyclePoints(level, cycle.cycle); // start, peak, node, valley, end
  for (let i = 3; i >= 0; i--) if (points[i] !== null && points[i] < t) return points[i];
  if (cycle.cycle === 0n) return null;
  return cat.cyclePoints(level, cycle.cycle - 1n)[3];
}

/**
 * Read what was typed into the "go to" field.
 * Everything `frc_parse_date` accepts: any form the core writes ("α#6 β#4 γ#9 δ#3 ε#5 34η 29ι",
 * "Delta Trifracton End ε#5 34η"), its plain-letter shorthand, and a short form completed from the
 * moment shown ("35η" = that Helion of the running Nuclide). In EARTH mode only, an Earth date too.
 * @param {import('../../lib/fractonica.js').Fractonica} frc
 * @param {import('../../lib/fractonica.js').Catalogue} cat
 * @param {string} text
 * @param {bigint} t the moment shown: the context of a short form
 * @param {boolean} earth EARTH mode: also accept an Earth date
 * @returns {{ instant: bigint } | { error: 'empty' | 'parse' | 'range' }}
 */
export function parseMoment(frc, cat, text, t, earth) {
  const typed = text.trim();
  if (typed === '') return { error: 'empty' };
  if (typed.length > MOMENT_MAX_LENGTH) return { error: 'parse' };
  const context = cat.contains(t) ? cat.dateAt(t) : null;
  try {
    return { instant: cat.dateToTime(frc.parseDate(typed, context).date) };
  } catch (error) {
    // RANGE: a date the catalogue does not hold. Anything else the core (or the binding) refuses is not a
    // moment at all: PARSE (not a date), ARG (a field out of its range, "ε#6" in a Delta of five, "α#0", or a NUL
    // the binding refuses), BUFFER (text too long for the module's scratch)
    if (isStatus(error, 'FRC_ERR_RANGE')) return { error: 'range' };
    if (!(error instanceof FractonicaError)) throw error;
  }
  if (earth) {
    const instant = parseEarthDate(frc, typed, t);
    if (instant !== null) return cat.contains(instant) ? { instant } : { error: 'range' };
  }
  return { error: 'parse' };
}
