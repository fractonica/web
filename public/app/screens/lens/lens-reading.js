/**
 * lens-reading.js - everything the LENS says about one rung, asked of the core.
 *
 * `readLens(frame, level, mode)` returns plain data: the static facts of the
 * rung (model/rungs.js), what its running cycle is doing at the frame's
 * instant (levels the instrument can show: 0..13), the seven media, and in
 * EARTH mode the translations. lens-panels.js writes it into the DOM,
 * lens-ring.js draws the ring from `live`; a test can check it without a
 * browser.
 *
 * Every string is the core's wording or a join of the core's wordings with
 * words of the interface. Earth strings are '' unless `mode === 'earth'`, so
 * PURE mode cannot leak one. What is chosen here:
 *   - a threshold of the running cycle is said as a signed span from the
 *     frame's instant, as the core signs it ("−20ι 21λ", "+6ι 43λ");
 *   - the glyph state reached at a threshold is the core's (`frc.glyphAtQuarter`);
 *   - a medium's place on the rule is a drawing scale: the logarithm of its
 *     speed between the slowest and the fastest of the seven.
 */
import { Medium, Quantity, Quarter } from '../../../lib/fractonica.js';
import { BEZEL_FRACTIONS, BEZEL_QUARTERS, readInstrument } from '../../instrument/reading.js';
import { rungEarth, rungFacts } from '../../model/rungs.js';
import { whenOrOffset } from '../../model/earth.js';

/** The index of each threshold in `frame.points()` (start, peak, node, valley, end). */
const POINT_OF = Object.freeze({ [Quarter.PEAK]: 1, [Quarter.NODE]: 2, [Quarter.VALLEY]: 3, [Quarter.END]: 4 });
/** Strokes of the small glyphs around the ring, and nested levels of the ring (DESIGN.md sections 5 and 6). */
const STROKES = 2;
export const LENS_DEPTH = 2;
/**
 * The devices of SPEC 16.4 the lens works a rung out for (EARTH mode, rungs
 * shorter than a Blink): a timer that counts microseconds, and a 32-bit
 * phase accumulator at the audio sample rate. They are examples, not a rule
 * of the clock; the numbers are the core's (`deviceTicks`, `deviceStep`).
 */
const TIMER_RATE = 1_000_000n;
const SAMPLE_RATE = 48_000n;
const PHASE_BITS = 32;
/** How many seals the lineage strip holds: the rung and its nearest ancestors. */
export const LINEAGE_MAX = 7;

/** A whole number of hertz as a frc_sci_t (17 significant digits), for `frc.formatQuantity`. */
function hertz(rate) {
  let mantissa = rate;
  let exp10 = 0;
  while (mantissa < 10n ** 16n) {
    mantissa *= 10n;
    exp10 -= 1;
  }
  return { mantissa, exp10 };
}

/**
 * @param {import('../../model/frame.js').Frame} frame
 * @param {number} level 0..62
 * @param {'pure' | 'earth'} mode
 * @returns {LensReading}
 */
export function readLens(frame, level, mode) {
  const { frc, cat, t } = frame;
  const earth = mode === 'earth';
  const interval = frame.interval();
  const facts = rungFacts(frc, level);
  const band = rungEarth(frc, level, interval);
  const count = frc.constants.LEVEL_COUNT;

  // --- the running cycle: only for rungs the instrument can show ---------------
  let live = null;
  /** Instants at which a text of the lens changes. */
  const changes = [];
  if (facts.focusable) {
    const ring = readInstrument(frame, level, LENS_DEPTH, 'pure');
    const points = ring.lit ? frame.points(level) : null;
    const cycle = ring.lit ? frame.cycle(level) : null;
    live = {
      /** What drawing/live-ring.js paints (fraction, steps, beads, digits; `lit` false outside the catalogue). */
      ring,
      /** The running cycle's name: "Delta Trifracton", "ε#5 34η". */
      name: cycle ? frc.formatCycleName(level, cycle.cycle) : '',
      /** The sibling counter: this cycle's place among the cycles of its parent, to light beads through. */
      siblings: cycle ? { count: cycle.siblings, local: cycle.local } : null,
      /** The four thresholds, in the order they sit around the ring: 12, 3, 6 and 9 o'clock. */
      thresholds: BEZEL_QUARTERS.map((quarter) => {
        const instant = points ? points[POINT_OF[quarter]] : null;
        return {
          quarter,
          word: frc.formatQuarter(quarter),
          fraction: BEZEL_FRACTIONS[quarter],
          /** The glyph state the level shows from this threshold on. */
          glyph: frc.glyphAtQuarter(quarter, STROKES).index,
          next: ring.lit && quarter === ring.next,
          /** "+6ι 43λ" ahead, "−20ι 21λ" behind; "—" where the catalogue ends before it. */
          span: instant === null ? '—' : frame.signedSpanTo(instant),
          /** EARTH: the clock time ("12:56:12"), the day when it is another one, the distance within a minute. */
          earth: earth && instant !== null ? whenOrOffset(frc, instant, t) : '',
        };
      }),
    };
    if (ring.lit) {
      changes.push(...ring.changes);
      // the signed spans: a threshold ahead counts down (frc_span_next_change), one behind counts up
      // (frc_span_next_change_since); frame.spanChange asks the right one of the two
      for (const quarter of BEZEL_QUARTERS) changes.push(frame.spanChange(points[POINT_OF[quarter]]));
    }
  }

  // --- the seven media ------------------------------------------------------------
  const speeds = [];
  for (let medium = 0; medium < frc.constants.MEDIUM_COUNT; medium++) speeds.push(frc.mediumSpeed(medium));
  const logs = speeds.map((speed) => Math.log(Number(speed.num) / Number(speed.den)));
  const slowest = Math.min(...logs);
  const fastest = Math.max(...logs);
  const media = speeds.map((speed, medium) => ({
    medium,
    name: frc.formatMediumName(medium),
    /** Where the medium stands between the slowest and the fastest, 0..1, on a logarithmic rule. */
    place: Math.max(0.02, (logs[medium] - slowest) / (fastest - slowest)),
    /** The length as the span light in vacuum needs for it (design ruling 2): "24ι 1λ", "6.15χ". */
    light: frc.formatLightSpan(level, speed, false),
    metres: earth ? frc.formatLength(level, interval, speed) : '',
    first: medium === Medium.VACUUM,
  }));

  // --- SPEC 16.4: a device that makes the rung (EARTH mode, below the Blink) -------
  let devices = null;
  if (earth && facts.span === '') {
    const made = (ask, unit) => {
      try {
        return `${frc.formatCount(ask())} ${unit}`;
      } catch (error) {
        if (error?.status === 'FRC_ERR_REFUSED' || error?.status === 'FRC_ERR_OVERFLOW') return 'cannot be made';
        throw error;
      }
    };
    devices = [
      { label: 'timer', rate: frc.formatQuantity(hertz(TIMER_RATE), Quantity.FREQUENCY, 1), value: made(() => frc.deviceTicks(level, interval, TIMER_RATE), 'ticks') },
      {
        label: `${PHASE_BITS} bit phase`,
        rate: frc.formatQuantity(hertz(SAMPLE_RATE), Quantity.FREQUENCY, 2),
        value: made(() => frc.deviceStep(level, interval, SAMPLE_RATE, PHASE_BITS), 'per sample'),
      },
    ];
  }

  // --- the lineage: the rung and its nearest ancestors, with the factors between ---
  const from = Math.max(0, level - (LINEAGE_MAX - 1));
  const lineage = [];
  for (let l = from; l <= level; l++) lineage.push({ level: l, name: frc.formatLevelName(l), factor: l < level ? frc.formatCount(frc.factor(l)) : '', visible: rungEarth(frc, l, interval).visible });

  /** @namespace LensReading */
  return {
    level,
    facts,
    band,
    count,
    /** false outside the catalogue: the ring stays engraved, the thresholds have no spans. */
    lit: frame.inCatalogue,
    live,
    media,
    devices,
    lineage,
    /** The lineage does not reach the Alpha: more ancestors than the strip holds. */
    lineageCut: from > 0,
    /** "125 125 = 5 · 13 · 5 · 5 · 7 · 11": P(level) and the factors it is made of (the core's); '' beyond 64 bits. */
    prefix: facts.prefixFactors,
    /** "36ι · 2 340λ · 58 500ν": the cycle counted in each finer unit; the Blink itself "1ν"; '' below it. */
    period: facts.inUnits.length > 0 ? facts.inUnits.join('  ·  ') : facts.span,
    /** "one Helion of travel": the heading of the media (a rung that is no unit goes by its letter). */
    travel: `one ${facts.unitName || facts.name} of travel`,
    /** "36ι · 9 θ × 4 ι": the cycle in the next finer unit, and how that comes about. */
    madeOf: facts.inUnits.length === 0 || facts.childIsUnit || facts.grandchildren === '' ? facts.madeOf : `${facts.madeOf}  ·  ${facts.children} × ${facts.grandchildren}`,
    /** "11 in ζ"; for the Alpha: how many the catalogue holds. */
    siblings: facts.inParent || (cat.series ? `${frc.formatCount(cat.cycleCount(0))} in Saros ${cat.series}` : ''),
    earthPeriod: earth ? band.period : '',
    earthFrequency: earth ? band.frequency : '',
    changes,
  };
}
