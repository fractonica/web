/**
 * frame.js - one instant, read from the core, shared by everything drawn in one pass.
 *
 * WHY: a pass draws a ring, counter rings, countdowns and text that all need
 * `cycleAt(t, L)` for overlapping levels. A frame memoises those answers so
 * the core is asked once per level, and so that everything on screen comes
 * from the SAME instant (a ring never disagrees with the numerals beside it).
 *
 * A frame holds no arithmetic of its own: every member is a core answer, or
 * null where the core has none (outside the catalogue, or in the first / last
 * partial sync for the Sun).
 */
import { DateForm, FractonicaError, Unit } from '../../lib/fractonica.js';

/**
 * @param {import('../../lib/fractonica.js').Fractonica} frc
 * @param {import('../../lib/fractonica.js').Catalogue} cat
 * @param {bigint} t the instant (Unix microseconds)
 * @returns {Frame}
 */
export function createFrame(frc, cat, t) {
  const inCatalogue = cat.contains(t);
  const memo = new Map();
  /** Ask once; null outside the catalogue or where the core answers FRC_ERR_RANGE. */
  const once = (key, ask) => {
    if (!inCatalogue) return null;
    if (!memo.has(key)) {
      let answer = null;
      try {
        answer = ask();
      } catch (error) {
        if (!(error instanceof FractonicaError) || error.status !== 'FRC_ERR_RANGE') throw error;
      }
      memo.set(key, answer);
    }
    return memo.get(key);
  };

  /** @namespace Frame */
  return {
    frc,
    cat,
    t,
    /** false outside [cat.first, cat.last]: every reading below is then null (design ruling 7). */
    inCatalogue,
    /** The cycle of `level` running at t (0..21). */
    cycle: (level) => once(`c${level}`, () => cat.cycleAt(t, level)),
    /** The next quarter boundary of `level` after t. */
    threshold: (level) => once(`t${level}`, () => cat.nextThreshold(t, level)),
    /** start, peak, node, valley, end of the running cycle of `level` (null beyond the catalogue). */
    points: (level) => once(`p${level}`, () => cat.cyclePoints(level, cat.cycleAt(t, level).cycle)),
    /** The 2-glyph odometer of a level (2 strokes each: the 256-state pair). */
    odometer: (level, strokes = 2, digits = 2) => once(`o${level}.${strokes}.${digits}`, () => cat.odometerAt(t, level, strokes, digits)),
    /** The date at t. */
    date: () => once('date', () => cat.dateAt(t)),
    /** The stamp: "α#6 β#4 γ#9 δ#3 ε#5 34η 29ι 21λ 3ν". */
    stamp: () => once('stamp', () => frc.formatDate(cat.dateAt(t), DateForm.LETTERS, Unit.BLINK)),
    /** The stamp's nine terms, coarsest first, as the core writes each: ["α#6", ..., "3ν"]. */
    terms: () =>
      once('terms', () => {
        const date = cat.dateAt(t);
        return Object.freeze(Object.values(Unit).map((unit) => frc.formatDateTerm(date, unit)));
      }),
    /** The solar sync, or null in the catalogue's first / last partial sync. */
    sync: () => once('sync', () => cat.syncAt(t)),
    /** The sync phase as three 2-stroke glyphs. */
    syncOdometer: () => once('syncOdometer', () => cat.syncOdometer(t, 2, 3)),
    /** The Pentad at t. */
    pentad: () => once('pentad', () => cat.pentadAt(t)),
    /**
     * The Saros interval the spectral ladder is laid from (SPEC 16.1): the one that holds t; outside
     * the catalogue, where no interval holds the instant, the series' mean interval.
     */
    interval: () => once('interval', () => cat.intervalAt(t)) ?? cat.intervalMean(),
    /** "6ι 43λ": the span from t to a later (or earlier) instant, the core's wording; '' for null. */
    spanTo: (instant, parts = 0) => (inCatalogue && instant !== null ? frc.formatSpan(cat.spanBetween(t, instant), parts) : ''),
    /** "+6ι 43λ" / "−20ι 21λ": the same with its direction said, as the core signs it; '' for null. */
    signedSpanTo: (instant, parts = 0) => (inCatalogue && instant !== null ? frc.formatSpanSigned(cat.spanBetween(t, instant), parts) : ''),
    /**
     * When the text of spanTo / signedSpanTo(instant, parts) next changes, as the core computes it: before
     * the instant the span shrinks (frc_span_next_change), from it on it grows (frc_span_next_change_since);
     * both give the same instants. null when nothing changes later (or for null, or outside the catalogue).
     */
    spanChange: (instant, parts = 0) => {
      if (!inCatalogue || instant === null || !cat.contains(instant)) return null;
      return t < instant ? cat.spanNextChange(t, instant, parts) : cat.spanNextChangeSince(instant, t, parts);
    },
  };
}

/**
 * The words shown instead of a reading outside the catalogue:
 * "OUT OF CATALOGUE · α#1 – α#18" (design ruling 7). The two names are the
 * core's names of the first and last Alpha.
 */
export function outOfCatalogueText(frc, cat) {
  const lastAlpha = cat.cycleCount(0) - 1n;
  return `OUT OF CATALOGUE · ${frc.formatCycleName(0, 0, true)} – ${frc.formatCycleName(0, lastAlpha, true)}`;
}

/** "−6 235λ": the sync's drift (from its nominal start to its start) in Flavons, the core's wording; '' when the nominal start lies outside the catalogue. */
export function driftFlavons(frame, sync) {
  const { frc, cat } = frame;
  if (!cat.contains(sync.nominal) || !cat.contains(sync.start)) return '';
  return frc.formatSpanInUnit(cat.spanBetween(sync.nominal, sync.start), Unit.FLAVON);
}
