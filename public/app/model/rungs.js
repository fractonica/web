/**
 * rungs.js - what is known about one rung of the ladder, as the core says it.
 *
 * The LADDER lists all 63 rungs and the LENS inspects one; both show the same
 * facts, so they are read here, once per rung, and kept (they do not depend
 * on time). Two kinds:
 *
 *   rungFacts(frc, level)             the PURE facts: names, kind, factors, the
 *                                     cycle's length as a span, its rate in pB,
 *                                     "made of". Hierarchy only: no catalogue,
 *                                     no interval, no Earth unit.
 *   rungEarth(frc, level, interval)   the facts that need a Saros interval
 *                                     (SPEC 16.1): the band, and the EARTH
 *                                     figures period / frequency / length.
 *
 * NOTHING IS COMPUTED HERE. Every number and every text is a core answer
 * (frc.formatLevelChildren "9 θ", frc.formatLevelInParent "11 in ζ",
 * frc.formatLevelKind, frc.formatPrefixFactors, frc.formatLevelInUnit,
 * frc.formatLevelRate, frc.formatPeriod, frc.bandEdges ...). What this file
 * does is choose. `depth` is the one sum, level + 1, which fractonica.h
 * defines as the user-facing number; a band's place on the ladder's rule is
 * a drawing scale (a logarithm between the core's two edges).
 */
import { Band, LevelKind, Medium, Quantity, Unit } from '../../lib/fractonica.js';
import { FOCUS_MAX } from './url.js';

/** A rate longer than this many characters is shown rounded in a list ("1.562 × 10¹⁵ pB"). */
const FULL_RATE_MAX_CHARS = 22;
/** Significant digits of a rounded rate. */
const RATE_DIGITS = 4;
/** The lens shows P(level) with its factors while they are few: down to this level (eight factors). */
const PREFIX_FACTORS_TO_LEVEL = 8;
/** Digits of a band edge in EARTH mode ("400 THz", "3.4 × 10²⁹ Hz": SPEC 16.2's figures). */
const BAND_EDGE_DIGITS = 2;

/** frc -> level -> facts. The facts are static: one object per rung for the life of the page. */
const factsCache = new WeakMap();
/** frc -> "num/den" -> level -> Earth facts. An interval changes only when the cursor crosses an eclipse. */
const earthCache = new WeakMap();

/**
 * The pure facts of a rung.
 * @param {import('../../lib/fractonica.js').Fractonica} frc
 * @param {number} level 0..62
 * @returns {RungFacts}
 */
export function rungFacts(frc, level) {
  let byLevel = factsCache.get(frc);
  if (!byLevel) factsCache.set(frc, (byLevel = new Map()));
  let facts = byLevel.get(level);
  if (!facts) byLevel.set(level, (facts = readFacts(frc, level)));
  return facts;
}

function readFacts(frc, level) {
  const last = frc.constants.LEVEL_COUNT - 1;
  const blinkLevel = frc.unitLevel(Unit.BLINK);
  const kind = frc.levelKind(level);
  const unit = frc.unitOfLevel(level);
  const name = frc.formatLevelName(level);
  const word = frc.formatLevelWord(level);
  const unitName = unit === null ? '' : frc.formatUnitName(unit);
  const factor = frc.factor(level);
  const siblings = frc.siblings(level);
  const childName = frc.formatLevelName(level + 1);
  const parentName = level > 0 ? frc.formatLevelName(level - 1) : '';
  // the last rung has no rung below it in the ladder (the core refuses its children)
  const children = level < last ? frc.formatLevelChildren(level) : '';
  // one cycle counted in every unit finer than the level (the core refuses a coarser or equal one)
  const inUnits = [];
  if (level <= blinkLevel) {
    for (let u = 0; u < frc.constants.UNIT_COUNT; u++) {
      if (frc.unitLevel(u) > level) inUnits.push(frc.formatLevelInUnit(level, u));
    }
  }
  const rate = frc.formatLevelRate(level, 0);
  const prefix = frc.prefix(level);

  /** @namespace RungFacts */
  return Object.freeze({
    level,
    /** The user-facing number of the rung: level + 1 (fractonica.h, "depth"). */
    depth: level + 1,
    /** "η" */
    name,
    /** "Eta" */
    word,
    /** The unit's name when the rung is one of the nine units ("Helion"), else the letter's word ("Zeta1"). */
    title: unitName || word,
    kind,
    unit,
    unitName,
    /**
     * In a list: the unit's name or the core's "between" (design ruling 4); '' for a rung below the Blink, where
     * the design's rows say the band and the parent only ("INFRARED · 5 IN δ1": every rung there is the same kind).
     */
    kindShort: unitName || (kind === LevelKind.BETWEEN ? frc.formatLevelKind(kind) : ''),
    /** What the rung is, in the core's words: "major", "unit", "between", "sub-Blink". */
    kindWords: frc.formatLevelKind(kind),
    /** The instrument can focus this rung and the lens can show it live (design ruling 9). */
    focusable: level <= FOCUS_MAX,
    /** The rung the solar sync counts in (the Helion). */
    solar: level === frc.constants.SYNC_LEVEL,
    isFirst: level === 0,
    isLast: level === last,
    /** How many cycles of the next rung one cycle holds, and that rung's name. */
    factor,
    childName,
    /** The next rung is itself one of the nine units (then "made of" needs no second step). */
    childIsUnit: frc.unitOfLevel(level + 1) !== null,
    /** "9 θ": the children of one cycle; '' for the last rung. */
    children,
    /** "4 ι": the children of one child (for "9 θ × 4 ι"); '' where the ladder ends first. */
    grandchildren: level + 1 < last ? frc.formatLevelChildren(level + 1) : '',
    /** Cycles per parent cycle (0 for the Alpha, which has no parent) and the parent's name. */
    siblings,
    parentName,
    /** "11 in ζ"; '' for the Alpha. */
    inParent: level > 0 ? frc.formatLevelInParent(level) : '',
    /** One cycle counted in each finer unit: ["36ι", "2 340λ", "58 500ν"]; empty below the Blink. */
    inUnits: Object.freeze(inUnits),
    /** "made of": the cycle in the next finer unit ("36ι"); where no unit is finer, its children ("7 ξ"). */
    madeOf: inUnits[0] ?? children,
    /** The cycle's length as a span, down to the Blink: "11η", "4ι", "1ν"; '' for a finer rung. */
    span: level <= blinkLevel ? frc.formatSpan(frc.spanOfLevel(level)) : '',
    /** The exact rate: "1 per 58 500 Blinks", "7 pB", "142 033 641 750 000 pB". */
    rate,
    /** The rate as a list shows it: in full while it is short, else rounded ("1.562 × 10¹⁵ pB"). */
    rateShort: rate.length <= FULL_RATE_MAX_CHARS ? rate : frc.formatLevelRate(level, RATE_DIGITS),
    /** In a list of pure values: the length down to the Blink, the rate below it (design ruling 3). */
    lengthOrRate: level <= blinkLevel ? frc.formatSpan(frc.spanOfLevel(level)) : rate.length <= FULL_RATE_MAX_CHARS ? rate : frc.formatLevelRate(level, RATE_DIGITS),
    /** P(level), grouped: "125 125"; '' where it no longer fits 64 bits (the core then gives the rate). */
    prefix: prefix === null ? '' : frc.formatCount(prefix),
    /**
     * P(level) and the factors it is made of, while they are few: "125 125 = 5 · 13 · 5 · 5 · 7 · 11"
     * (the core writes every level so; the lens shows it to level 8), then P alone; '' beyond 64 bits.
     */
    prefixFactors: level <= PREFIX_FACTORS_TO_LEVEL ? frc.formatPrefixFactors(level) : prefix === null ? '' : frc.formatCount(prefix),
  });
}

/**
 * The facts of a rung that depend on the Saros interval the ladder is laid
 * from: its band (shown in both modes: a band is a name, not a unit) and the
 * Earth figures (shown in EARTH mode only).
 * @param {import('../../lib/fractonica.js').Fractonica} frc
 * @param {number} level 0..62
 * @param {{ num: bigint, den: bigint }} interval `frame.interval()`
 * @returns {RungEarth}
 */
export function rungEarth(frc, level, interval) {
  let byInterval = earthCache.get(frc);
  if (!byInterval) earthCache.set(frc, (byInterval = new Map()));
  const key = `${interval.num}/${interval.den}`;
  let byLevel = byInterval.get(key);
  if (!byLevel) {
    if (byInterval.size > 4) byInterval.clear();
    byInterval.set(key, (byLevel = new Map()));
  }
  let facts = byLevel.get(level);
  if (!facts) {
    const band = frc.band(level, interval);
    const edges = band === Band.NONE ? null : frc.bandEdges(band);
    /** @namespace RungEarth */
    facts = Object.freeze({
      band,
      /** "visible", "X-ray"; the core's "no band" outside every band (design ruling 4). */
      bandName: frc.formatBand(band),
      /**
       * The band rule: where the rung sits inside its band, 0 at its lower edge .. 1 at its upper, on a
       * logarithmic rule between the core's edges (SPEC 16.2); the bands beyond the two edges ("no band" past
       * the audible and the gamma ray: the bands rise in the order of frc_band_t); in EARTH mode the edges as the
       * core writes a frequency ("400 THz"). null outside every band.
       */
      rule: edges === null ? null : Object.freeze({
        place: Math.min(1, Math.max(0, logBetween(frc.frequencyHz(level, interval), frc.sciToDouble(edges.low), frc.sciToDouble(edges.high)))),
        below: frc.formatBand(band > Band.AUDIBLE ? band - 1 : Band.NONE),
        above: frc.formatBand(band < Band.GAMMA ? band + 1 : Band.NONE),
        low: frc.formatQuantity(edges.low, Quantity.FREQUENCY, BAND_EDGE_DIGITS),
        high: frc.formatQuantity(edges.high, Quantity.FREQUENCY, BAND_EDGE_DIGITS),
      }),
      /** The rung that is visible light: the one place the h-alpha colour is used. */
      visible: band === Band.VISIBLE,
      /** "5.052 h" */
      period: frc.formatPeriod(level, interval),
      /** "54.98 µHz" */
      frequency: frc.formatFrequency(level, interval),
      /** "5.453 Tm": light in vacuum. */
      length: frc.formatLength(level, interval, frc.mediumSpeed(Medium.VACUUM)),
    });
    byLevel.set(level, facts);
  }
  return facts;
}

/** Where `value` lies between `from` and `to` on a logarithmic rule (a drawing scale: 0 at `from`, 1 at `to`). */
function logBetween(value, from, to) {
  return (Math.log(value) - Math.log(from)) / (Math.log(to) - Math.log(from));
}

/** A key that changes when the interval does: for "must the Earth texts be rewritten?". */
export function intervalKey(interval) {
  return `${interval.num}/${interval.den}`;
}
