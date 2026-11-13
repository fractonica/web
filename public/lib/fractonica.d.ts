/**
 * Types of fractonica.js, the JavaScript binding of the Fractonica core.
 * Hand-written (there is no build step); keep it in step with fractonica.js.
 * test/binding.test.js checks that every method declared here exists and
 * the other way round.
 *
 * Conventions: see the head of fractonica.js. In short: an instant is a
 * BigInt of Unix MICROSECONDS, `null` stands for FRC_TIME_NONE, levels are
 * zero-based, 64-bit values are BigInt, enums are numbers.
 */

/** Unix time in microseconds (frc_time_t). */
export type Instant = bigint;
/** A uint64_t / int64_t argument: a BigInt, or a safe integer Number. */
export type Int64Like = bigint | number;
/** A frc_frac_t: a fraction of a whole in unsigned 0.32 fixed point (0 .. 2^32 - 1). */
export type Frac = number;
/** Zero-based rung of the hierarchy, 0 = Alpha. Clock readings: 0..21; static facts: 0..62. */
export type Level = number;

/* ------------------------------------------------------------------------- */
/* Enumerations                                                               */
/* ------------------------------------------------------------------------- */

export declare const Status: {
  readonly FRC_OK: 0;
  readonly FRC_ERR_RANGE: -1;
  readonly FRC_ERR_ARG: -2;
  readonly FRC_ERR_OVERFLOW: -3;
  readonly FRC_ERR_BUFFER: -4;
  readonly FRC_ERR_PARSE: -5;
  readonly FRC_ERR_REFUSED: -6;
};
export type StatusName = keyof typeof Status;

export declare const LevelKind: { readonly MAJOR: 0; readonly UNIT: 1; readonly BETWEEN: 2; readonly SUB: 3 };
export type LevelKind = (typeof LevelKind)[keyof typeof LevelKind];

export declare const Unit: {
  readonly ALPHA: 0;
  readonly BETA: 1;
  readonly GAMMA: 2;
  readonly DELTA: 3;
  readonly NUCLIDE: 4;
  readonly HELION: 5;
  readonly PREON: 6;
  readonly FLAVON: 7;
  readonly BLINK: 8;
};
export type Unit = (typeof Unit)[keyof typeof Unit];

export declare const Quarter: { readonly PEAK: 0; readonly NODE: 1; readonly VALLEY: 2; readonly END: 3 };
export type Quarter = (typeof Quarter)[keyof typeof Quarter];

export declare const PentadForm: { readonly FULL: 0; readonly SHORT: 1; readonly ASCII: 2; readonly NUMERAL: 3 };
export type PentadForm = (typeof PentadForm)[keyof typeof PentadForm];

export declare const DateForm: { readonly FULL: 0; readonly SHORT: 1; readonly LETTERS: 2; readonly SHORT_LETTERS: 3 };
export type DateForm = (typeof DateForm)[keyof typeof DateForm];

export declare const Medium: {
  readonly VACUUM: 0;
  readonly BOUNDED: 1;
  readonly DIAMOND: 2;
  readonly WATER: 3;
  readonly AIR: 4;
  readonly NERVE: 5;
  readonly CHEMICAL: 6;
};
export type Medium = (typeof Medium)[keyof typeof Medium];

export declare const Band: {
  readonly NONE: 0;
  readonly AUDIBLE: 1;
  readonly RADIO: 2;
  readonly MICROWAVE: 3;
  readonly INFRARED: 4;
  readonly VISIBLE: 5;
  readonly ULTRAVIOLET: 6;
  readonly XRAY: 7;
  readonly GAMMA: 8;
};
export type Band = (typeof Band)[keyof typeof Band];

export declare const Quantity: { readonly TIME: 0; readonly FREQUENCY: 1; readonly LENGTH: 2 };
export type Quantity = (typeof Quantity)[keyof typeof Quantity];

export declare const PathOp: { readonly MOVE: 0; readonly LINE: 1; readonly CUBIC: 2; readonly DOT: 3 };
export type PathOp = (typeof PathOp)[keyof typeof PathOp];

/** frc_civil_form_t: the Earth wordings of formatCivilText. */
export declare const CivilForm: {
  readonly DATE_TIME: 0;
  readonly DATE: 1;
  readonly TIME: 2;
  readonly MINUTE: 3;
  readonly DAY_MONTH: 4;
  readonly DAY_MONTH_TIME: 5;
  readonly MONTH_YEAR: 6;
  readonly OFFSET: 7;
  readonly DAY_MONTH_YEAR: 8;
  readonly DAY_MONTH_SECONDS: 9;
  readonly ISO_DATE: 10;
  readonly WEEKDAY: 11;
  readonly MONTH: 12;
  readonly YEAR: 13;
};
export type CivilForm = (typeof CivilForm)[keyof typeof CivilForm];

/* ------------------------------------------------------------------------- */
/* Errors                                                                     */
/* ------------------------------------------------------------------------- */

/** Every failure of the binding. Outside the catalogue: status "FRC_ERR_RANGE". */
export declare class FractonicaError extends Error {
  constructor(status: string, call: string, detail?: string);
  readonly name: 'FractonicaError';
  /** The frc_status_t name, e.g. "FRC_ERR_RANGE". */
  readonly status: StatusName;
  /** Its number, e.g. -1. */
  readonly code: number | null;
  /** The C function that answered it, or "fractonica.js" for an argument the binding refused. */
  readonly call: string;
}

/* ------------------------------------------------------------------------- */
/* Structs (all frozen)                                                       */
/* ------------------------------------------------------------------------- */

/** frc_position_t: ordinal + num/den Saros units, exact. */
export interface Position {
  readonly ordinal: number;
  readonly num: bigint;
  readonly den: bigint;
}

/** frc_cycle_t: one cycle of one level and where an instant sits in it. */
export interface Cycle {
  readonly level: Level;
  /** The quarter the instant is in (0 when the cycle was asked for by index). */
  readonly quarter: Quarter;
  /** true when the catalogue ends inside this cycle. */
  readonly clipped: boolean;
  /** Index inside the parent (the sibling counter: `local` of `siblings`). */
  readonly local: number;
  readonly siblings: number;
  /** Global index. */
  readonly cycle: bigint;
  /** Fraction of the cycle done, exact (linear in position). */
  readonly phase: Frac;
  /** The same as a Number in [0, 1): for drawing, never for decisions. */
  readonly fraction: number;
  readonly start: Instant | null;
  /** First microsecond after the cycle (clipped: the closing instant). */
  readonly end: Instant | null;
}

/** frc_threshold_t: which quarter boundary, and when (null after the catalogue). */
export interface Threshold {
  readonly name: Quarter;
  readonly time: Instant | null;
}

/** frc_glyph_t: one state of a phase glyph. */
export interface Glyph {
  /** 0 .. 4M-1 */
  readonly index: number;
  /** -M .. +M */
  readonly value: number;
  /** +1 rising, 0 at peak and valley, -1 falling */
  readonly derivative: number;
  /** true on the falling branch only */
  readonly dotted: boolean;
  readonly strokes: number;
  /** Balanced ternary, `strokes` of them, trits[0] least significant (drawn at the top). */
  readonly trits: readonly number[];
}

/** frc_odometer_t: k glyphs side by side, coarsest first. */
export interface Odometer {
  readonly count: number;
  readonly strokes: number;
  /** States per digit (4M). */
  readonly states: number;
  /** Glyph indices, `count` of them. */
  readonly digits: readonly number[];
  /** When the finest digit next changes; null at the catalogue's closing instant or for a bare phase. */
  readonly nextChange: Instant | null;
}

/** frc_sync_t: one solar sync (19 Helions against 4 civil days). */
export interface Sync {
  /** 0 at the anchor, negative before it. */
  readonly sync: number;
  readonly quarter: Quarter;
  /** The running Helion's place in the sync, 0..18 (0 from syncByNumber). */
  readonly helion: number;
  /** Linear in TIME. */
  readonly phase: Frac;
  readonly fraction: number;
  readonly start: Instant | null;
  readonly end: Instant | null;
  /** Anchor + sync * 4 days. */
  readonly nominal: Instant | null;
  /** start - nominal, microseconds. */
  readonly driftUs: bigint;
  /** The next quarter of the sync. */
  readonly next: Threshold;
}

/** frc_pentad_t: about a day, one of the four runs of Helions of a sync. */
export interface Pentad {
  readonly sync: number;
  /** 0 Pentad I, 1 Pentad II, 2 Pentad III, 3 Hypopentad */
  readonly index: number;
  /** The running Helion's place in it, 1..5 (0 from pentadByNumber). */
  readonly helion: number;
  /** 5, or 4 for the Hypopentad. */
  readonly helions: number;
  /** The place in the sync of its first Helion: 0, 5, 10 or 15 (optional when written; not read by formatPentad). */
  readonly first?: number;
  readonly start: Instant | null;
  readonly end: Instant | null;
}

/** frc_date_t: a moment said in Fractonica terms. */
export interface FrcDate {
  /** 1.. (global) */
  readonly alpha: number;
  /** 1..5 */
  readonly beta: number;
  /** 1..13 */
  readonly gamma: number;
  /** 1..5 */
  readonly delta: number;
  /** 1..5, the Nuclide in its Delta */
  readonly epsilon: number;
  /** 1..77, the Helion in its Nuclide (numbered from 1) */
  readonly eta: number;
  /** 0..35 Preons completed */
  readonly iota: number;
  /** 0..64 Flavons completed */
  readonly lambda: number;
  /** 0..24 Blinks completed */
  readonly nu: number;
  /** Quarter of alpha, beta, gamma, delta. May be left out of a date you write by hand. */
  readonly quarters?: readonly number[];
}

/** frc_span_t: a signed count of Blinks plus a fraction of one. */
export interface Span {
  readonly negative: boolean;
  readonly blinks: bigint;
  readonly frac: Frac;
}
/** A Span as an argument: counts may be Numbers. */
export interface SpanLike {
  readonly negative: boolean | number;
  readonly blinks: Int64Like;
  readonly frac: Frac;
}

/** frc_span_part_t */
export interface SpanPart {
  readonly unit: Unit;
  readonly count: bigint;
}

/** frc_rate_t: a time-lapse preset. `count` 0 is real time. */
export interface Rate {
  readonly unit: Unit;
  readonly count: number;
  readonly factor: bigint;
}
export interface RateLike {
  readonly unit: number;
  readonly count: number;
  readonly factor: Int64Like;
}

/** frc_interval_t (milliseconds per Saros) and frc_speed_t (metres per second): an exact ratio. */
export interface Ratio {
  readonly num: bigint;
  readonly den: bigint;
}
export interface RatioLike {
  readonly num: Int64Like;
  readonly den: Int64Like;
}
export type Interval = Ratio;
export type Speed = Ratio;

/** frc_sci_t: mantissa x 10^exp10, the mantissa with exactly 17 significant digits. */
export interface Sci {
  readonly mantissa: bigint;
  readonly exp10: number;
}
export interface SciLike {
  readonly mantissa: Int64Like;
  readonly exp10: number;
}

/** frc_arc_t: a circular arc. Radians, measured like atan2 with y DOWN; negative sweep = counter-clockwise. */
export interface Arc {
  readonly cx: number;
  readonly cy: number;
  readonly radius: number;
  /** Angle of the arc's first point. */
  readonly start: number;
  /** Signed angle travelled. */
  readonly sweep: number;
}

/** frc_civil_t: proleptic Gregorian fields. */
export interface Civil {
  readonly year: number;
  /** 1..12 */
  readonly month: number;
  /** 1..31 */
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
  /** 0 = Monday .. 6 = Sunday (output only; ignored and optional as an argument). */
  readonly weekday?: number;
  readonly microsecond: number;
}

/** One operation of a glyph outline: MOVE [x, y], LINE [x, y], CUBIC [c1x, c1y, c2x, c2y, x, y], DOT [cx, cy, r]. */
export interface PathStep {
  readonly op: PathOp;
  readonly points: readonly number[];
}

/** Where a glyph is drawn: `scale` pixels per design unit, (x, y) the top of the stem. */
export interface GlyphPlacement {
  scale?: number;
  x?: number;
  y?: number;
}

/** What traceArc draws on: a CanvasRenderingContext2D or a Path2D. */
export interface ArcPathTarget {
  moveTo(x: number, y: number): void;
  arc(x: number, y: number, radius: number, startAngle: number, endAngle: number, counterclockwise?: boolean): void;
}

/** Layout of one C struct as the module reports it. */
export interface StructLayout {
  readonly size: number;
  readonly align: number;
  readonly fields: Readonly<Record<string, { readonly offset: number; readonly type: string; readonly count: number }>>;
}

/** The header's constants, FRC_ prefix dropped. */
export interface Constants {
  readonly VERSION_MAJOR: number;
  readonly VERSION_MINOR: number;
  readonly VERSION_PATCH: number;
  readonly US_PER_SECOND: number;
  readonly US_PER_DAY: bigint;
  readonly FRAC_HALF: number;
  readonly FRAC_QUARTER: number;
  /** 63: levels 0..62 exist as static facts. */
  readonly LEVEL_COUNT: number;
  /** 21: the deepest level the clock reads at an instant. */
  readonly CLOCK_MAX_LEVEL: number;
  readonly SEQUENCE_LENGTH: number;
  readonly LEVEL_NONE: number;
  readonly MAX_STROKES: number;
  readonly MAX_DIGITS: number;
  readonly SYNC_LEVEL: number;
  readonly SYNC_CYCLES: number;
  readonly SYNC_DAYS: number;
  readonly UNIT_COUNT: number;
  readonly RATE_COUNT: number;
  readonly MEDIUM_COUNT: number;
  readonly INTERVAL_REFERENCE_MS: bigint;
  readonly SCI_DIGITS: number;
  /** FRC_PREFIX_FACTORS_SIZE (429): room for formatPrefixFactors of any level */
  readonly PREFIX_FACTORS_SIZE: number;
  /** Glyph coordinate units per design unit (100). */
  readonly GLYPH_UNIT: number;
  readonly GLYPH_INK: number;
  readonly GLYPH_DOT_RADIUS: number;
  readonly GLYPH_DOT_Y: number;
  readonly GREGORIAN_REFORM_MS: bigint;
  /** The core's pi, a float32. */
  readonly PI: number;
}

/* ------------------------------------------------------------------------- */
/* Catalogue: everything read at an instant                                   */
/* ------------------------------------------------------------------------- */

/**
 * One Saros series and the clock on it. Every method that takes an instant
 * throws FractonicaError "FRC_ERR_RANGE" outside [first, last].
 */
export declare class Catalogue {
  private constructor();
  /** Address of the frc_catalogue_t in the module's memory. */
  readonly pointer: number;
  /** Number of eclipses. */
  readonly count: number;
  /** Saros series number, 0 if unnamed. */
  readonly series: number;
  /** Ordinal of the solar-sync anchor eclipse. */
  readonly anchor: number;
  readonly first: Instant;
  readonly last: Instant;

  /** frc_catalogue_instant */
  instant(ordinal: number): Instant | null;
  /** frc_catalogue_contains */
  contains(t: Instant): boolean;
  /** frc_position_at */
  positionAt(t: Instant): Position;
  /** frc_time_at_position */
  timeAtPosition(n: Int64Like, d: Int64Like): Instant | null;

  /** frc_cycle_at (level 0..21) */
  cycleAt(t: Instant, level: Level): Cycle;
  /** frc_cycle_by_index */
  cycleByIndex(level: Level, cycle: Int64Like): Cycle;
  /** frc_cycle_count */
  cycleCount(level: Level): bigint;
  /** frc_cycle_points: [start, peak, node, valley, end] */
  cyclePoints(level: Level, cycle: Int64Like): readonly (Instant | null)[];
  /** frc_next_threshold: strictly after `t` */
  nextThreshold(t: Instant, level: Level): Threshold;
  /** frc_time_at_phase: the first microsecond at which the cycle reaches `phase` (ceiling); null beyond the catalogue */
  timeAtPhase(level: Level, cycle: Int64Like, phase: Frac): Instant | null;

  /** frc_glyph_at */
  glyphAt(t: Instant, level: Level, strokes: number): Glyph;
  /** frc_odometer_at: redraw at `nextChange`, never poll */
  odometerAt(t: Instant, level: Level, strokes: number, digits: number): Odometer;

  /** frc_sync_at (FRC_ERR_RANGE also in the first / last partial sync) */
  syncAt(t: Instant): Sync;
  /** frc_sync_by_number */
  syncByNumber(number: number): Sync;
  /** frc_sync_odometer (reference: 2 strokes, 3 digits) */
  syncOdometer(t: Instant, strokes: number, digits: number): Odometer;
  /** frc_time_at_sync_phase: the first microsecond at which sync `sync` reaches `phase`; null for a partial sync */
  timeAtSyncPhase(sync: number, phase: Frac): Instant | null;
  /** frc_pentad_at */
  pentadAt(t: Instant): Pentad;
  /** frc_pentad_by_number */
  pentadByNumber(sync: number, index: number): Pentad;

  /** frc_date_at */
  dateAt(t: Instant): Required<FrcDate>;
  /** frc_date_to_time: the first microsecond of the Blink the date names */
  dateToTime(date: FrcDate): Instant | null;
  /** frc_span_between */
  spanBetween(t1: Instant, t2: Instant): Span;
  /** frc_span_next_change: when formatSpan(spanBetween(t, boundary), maxParts) next changes; null when t >= boundary */
  spanNextChange(t: Instant, boundary: Instant, maxParts?: number): Instant | null;
  /** frc_span_next_change_since: when formatSpan(spanBetween(origin, t), maxParts) next changes, t >= origin; origin + 1 at the origin; null when t < origin */
  spanNextChangeSince(origin: Instant, t: Instant, maxParts?: number): Instant | null;

  /** frc_interval_at */
  intervalAt(t: Instant): Interval;
  /** frc_interval_mean */
  intervalMean(): Interval;
}

/* ------------------------------------------------------------------------- */
/* Fractonica: static facts, text, geometry, time                             */
/* ------------------------------------------------------------------------- */

export declare class Fractonica {
  private constructor();
  /** The module's exports (frc_*, frcw_*, memory), for a call the binding does not wrap. */
  readonly raw: WebAssembly.Exports;
  readonly memory: WebAssembly.Memory;
  /** Library version of the core, "0.2.0". */
  readonly version: string;
  /** SPEC.md version the core implements, "2.2.0". */
  readonly specVersion: string;
  readonly constants: Constants;
  /** Struct layouts by C name ("frc_cycle_t"), as the module reports them. */
  readonly layout: Readonly<Record<string, StructLayout>>;
  /** Solar Saros 141, the built-in catalogue. */
  readonly saros141: Catalogue;
  /** The 2010-2028 interval of Saros 141 (the one SPEC's tables use). */
  readonly referenceInterval: Interval;

  /* time */
  now(): Instant;
  /** frc_time_from_ms; null when it does not fit */
  fromUnixMs(ms: Int64Like): Instant | null;
  /** frc_time_from_s (whole seconds) */
  fromUnixSeconds(seconds: Int64Like): Instant | null;
  fromDate(date: Date): Instant | null;
  /** For platform APIs only (the microseconds are cut). */
  toDate(t: Instant): Date;
  /** The local zone's UTC offset at `t`, seconds east: Earth mode only. */
  utcOffsetSeconds(t: Instant): number;

  /** frc_catalogue_init on your own table of Unix-millisecond instants. */
  catalogue(instantsMs: Iterable<Int64Like>, series?: number): Catalogue;

  /* hierarchy, names, units */
  /** frc_factor */
  factor(level: Level): number;
  /** frc_siblings */
  siblings(level: Level): number;
  /** frc_prefix; null when P(level) does not fit 64 bits (level > 22) */
  prefix(level: Level): bigint | null;
  /** frc_format_prefix (any level 0..63) */
  formatPrefix(level: Level): string;
  /** frc_level_kind */
  levelKind(level: Level): LevelKind;
  /** frc_format_level_name: "η" */
  formatLevelName(level: Level): string;
  /** frc_format_level_word: "Eta" */
  formatLevelWord(level: Level): string;
  /** frc_unit_level; null when `unit` is not a Unit */
  unitLevel(unit: number): Level | null;
  /** frc_unit_of_level; null when the level is not a unit */
  unitOfLevel(level: Level): Unit | null;
  /** frc_unit_blinks */
  unitBlinks(unit: number): bigint;
  /** frc_unit_parts */
  unitParts(unit: number): number;
  /** frc_format_unit_symbol: "η" */
  formatUnitSymbol(unit: number): string;
  /** frc_format_unit_name: "Helion" / "Helions" */
  formatUnitName(unit: number, plural?: boolean): string;
  /** frc_format_quarter: "Peak" / "peak" */
  formatQuarter(quarter: number, lower?: boolean): string;
  /** frc_position_to_double (display only) */
  positionToDouble(position: { ordinal: number; num: Int64Like; den: Int64Like }): number;
  /** frc_frac_to_double */
  fracToDouble(phase: Frac): number;
  /** A Number in [0, 1] as a Frac, floor(x · 2^32) clamped to 0 .. 2^32 − 1: the inverse of fracToDouble (binding helper) */
  fracFromDouble(fraction: number): Frac;

  /* glyphs and odometer */
  /** frc_glyph_extreme */
  glyphExtreme(strokes: number): number;
  /** frc_glyph_states */
  glyphStates(strokes: number): number;
  /** frc_glyph_from_index */
  glyphFromIndex(index: number, strokes: number): Glyph;
  /** frc_glyph_index_descending */
  glyphIndexDescending(index: number, strokes: number): number;
  /** frc_glyph_index_of_phase */
  glyphIndexOfPhase(phase: Frac, strokes: number): number;
  /** frc_glyph_at_quarter: the state at the threshold that ends `quarter` (2 strokes: 4, 8, 12, 0) */
  glyphAtQuarter(quarter: Quarter, strokes: number): Glyph;
  /** frc_odometer_of_phase */
  odometerOfPhase(phase: Frac, strokes: number, digits: number): Odometer;
  /** frc_glyph_path, collected */
  glyphPath(glyph: Glyph): readonly PathStep[];
  /** frc_glyph_segments, collected: [x0, y0, x1, y1] each */
  glyphSegments(glyph: Glyph, curveSteps?: number): readonly (readonly number[])[];
  /** frc_glyph_bounds */
  glyphBounds(strokes: number): { readonly minX: number; readonly minY: number; readonly maxX: number; readonly maxY: number };
  /** The outline as SVG path data: stroke `stroke` with `lineWidth` and round caps, fill `fill` (the dot, "" if none). */
  glyphSvgPath(glyph: Glyph, placement?: GlyphPlacement): { readonly stroke: string; readonly fill: string; readonly lineWidth: number };
  /** The same as Path2D objects (browser only). */
  glyphPath2D(glyph: Glyph, placement?: GlyphPlacement): { readonly stroke: Path2D; readonly fill: Path2D | null; readonly lineWidth: number };

  /* Pentads and notation */
  /** frc_format_pentad */
  formatPentad(pentad: Pentad, form?: PentadForm, withHelion?: boolean): string;
  /** frc_format_date; LETTERS down to Unit.BLINK is the stamp */
  formatDate(date: FrcDate, form?: DateForm, finest?: Unit): string;
  /** frc_format_date_term: one term of the stamp, "α#6", "34η", "3ν" */
  formatDateTerm(date: FrcDate, unit: Unit): string;
  /** frc_parse_date */
  parseDate(text: string, context?: FrcDate | null): { readonly date: Required<FrcDate>; readonly finest: Unit };
  /** frc_format_ordinal: "Trifracton" */
  formatOrdinal(n: number): string;
  /** frc_format_cycle_name */
  formatCycleName(level: Level, cycle: Int64Like, shortForm?: boolean): string;

  /* spans and rates */
  /** frc_span_of_level */
  spanOfLevel(level: Level): Span;
  /** frc_span_parts */
  spanParts(span: SpanLike, maxParts?: number, keepZeros?: boolean): readonly SpanPart[];
  /** frc_format_span: "6ι 43λ" */
  formatSpan(span: SpanLike, maxParts?: number): string;
  /** frc_format_span_signed: "+6ι 43λ", "−20ι 21λ"; "0ν" and "<0.001ν" unsigned */
  formatSpanSigned(span: SpanLike, maxParts?: number): string;
  /** frc_format_span_in_unit: whole units, cut toward zero, "−6 236λ" */
  formatSpanInUnit(span: SpanLike, unit: Unit): string;
  /** frc_rate_preset */
  ratePreset(i: number): Rate;
  /** frc_format_rate: "4ι per Blink" */
  formatRate(rate: RateLike): string;
  /** frc_level_per_blink (FRC_ERR_OVERFLOW above level 35) */
  levelPerBlink(level: Level): Ratio;
  /** frc_format_per_blink: "7 pB" */
  formatPerBlink(num: Int64Like, den: Int64Like): string;

  /* pure wording */
  /** frc_format_count: "58 500" */
  formatCount(n: Int64Like): string;
  /** frc_format_count_signed: "4 820", "−3", "0" */
  formatCountSigned(n: Int64Like): string;
  /** frc_format_light_word: "light" */
  formatLightWord(): string;
  /** frc_format_level_kind: "major", "unit", "between", "sub-Blink" */
  formatLevelKind(kind: LevelKind): string;
  /** frc_format_cycle_place: "8 of 9" */
  formatCyclePlace(cycle: Cycle): string;
  /** frc_format_level_children: "9 θ" (level 0..61) */
  formatLevelChildren(level: Level): string;
  /** frc_format_level_in_parent: "11 in ζ" (level 1..62) */
  formatLevelInParent(level: Level): string;
  /** frc_format_unit_in_parent: "77 in ε" (not the Alpha) */
  formatUnitInParent(unit: Unit): string;
  /** frc_format_prefix_factors: "125 125 = 5 · 13 · 5 · 5 · 7 · 11", "1" (level 0) */
  formatPrefixFactors(level: Level): string;
  /** frc_format_level_in_unit: "58 500ν" */
  formatLevelInUnit(level: Level, unit: number): string;
  /** frc_format_level_rate: "2 772 pB", "1.420 × 10¹⁴ pB", "1 per 58 500 Blinks" */
  formatLevelRate(level: Level, digits?: number): string;
  /** frc_format_light_span: "24ι 1λ", "6.15χ light" */
  formatLightSpan(level: Level, speed: RatioLike, withWord?: boolean): string;

  /* spectral ladder */
  /** frc_interval_of_alpha_ms */
  intervalOfAlphaMs(alphaMs: Int64Like): Interval;
  /** frc_period, seconds */
  period(level: Level, interval: RatioLike): Sci;
  /** frc_frequency, hertz */
  frequency(level: Level, interval: RatioLike): Sci;
  /** frc_length, metres */
  length(level: Level, interval: RatioLike, speed: RatioLike): Sci;
  /** frc_period_seconds */
  periodSeconds(level: Level, interval: RatioLike): number;
  /** frc_frequency_hz */
  frequencyHz(level: Level, interval: RatioLike): number;
  /** frc_length_metres */
  lengthMetres(level: Level, interval: RatioLike, speed: RatioLike): number;
  /** frc_sci_to_double */
  sciToDouble(value: SciLike): number;
  /** frc_medium_speed, metres per second */
  mediumSpeed(medium: number): Speed;
  /** frc_format_medium_id: "vacuum" */
  formatMediumId(medium: number): string;
  /** frc_format_medium_name: "Light in vacuum" */
  formatMediumName(medium: number): string;
  /** frc_format_medium_phase: "Vacuum + solid" */
  formatMediumPhase(medium: number): string;
  /** frc_band */
  band(level: Level, interval: RatioLike): Band;
  /** frc_format_band: "audible"; "no band" for Band.NONE */
  formatBand(band: number): string;
  /** frc_band_edges: SPEC 16.2's edges in hertz, `low` inside the band (FRC_ERR_ARG for Band.NONE) */
  bandEdges(band: Band): { readonly low: Sci; readonly high: Sci };
  /** frc_device_ticks (FRC_ERR_REFUSED under half a tick) */
  deviceTicks(level: Level, interval: RatioLike, rate: Int64Like): bigint;
  /** frc_device_step */
  deviceStep(level: Level, interval: RatioLike, rate: Int64Like, bits: number): bigint;
  /** frc_format_quantity; digits 0 means 4 */
  formatQuantity(value: SciLike, quantity: Quantity, digits?: number): string;
  /** frc_format_period: "5.052 h" */
  formatPeriod(level: Level, interval: RatioLike, digits?: number): string;
  /** frc_format_frequency: "54.98 µHz" */
  formatFrequency(level: Level, interval: RatioLike, digits?: number): string;
  /** frc_format_length: "5.453 Tm" */
  formatLength(level: Level, interval: RatioLike, speed: RatioLike, digits?: number): string;

  /* arc geometry */
  /** frc_arc_child: child `local` of `parent` divided in `m`; `odd` selects the bulge side */
  arcChild(parent: Arc, m: number, local: number, odd: boolean | number): Arc;
  /** frc_arc_point */
  arcPoint(arc: Arc, t: number): { readonly x: number; readonly y: number };
  /** frc_arc_wave_root */
  arcWaveRoot(half: number): Arc;
  /** frc_sin */
  sin(radians: number): number;
  /** frc_cos */
  cos(radians: number): number;
  /** Trace the part of `arc` between fractions `from` and `to` onto a canvas path. */
  traceArc(path: ArcPathTarget, arc: Arc, from?: number, to?: number, move?: boolean): void;
  /** The same piece as SVG path data. */
  arcSvgPath(arc: Arc, from?: number, to?: number): string;

  /* civil time (Earth mode) */
  /** frc_civil_from_time */
  civilFromTime(t: Instant, utcOffsetSeconds?: number): Required<Civil>;
  /** frc_time_from_civil */
  timeFromCivil(civil: Civil, utcOffsetSeconds?: number): Instant | null;
  /** frc_format_civil: "2026-10-08T12:00:00.000Z" */
  formatCivil(civil: Civil, utcOffsetSeconds?: number): string;
  /** frc_format_civil_text: "THU 8 OCT 2026 · 12:00:00", "12:56", "UTC+5:30" (civil may be null for OFFSET) */
  formatCivilText(civil: Civil | null, utcOffsetSeconds: number, form: CivilForm): string;
  /** frc_format_duration: "23 min 53 s", "0.4 s"; signed microseconds */
  formatDuration(microseconds: Int64Like, maxParts?: number): string;
  /** frc_civil_validate: false where the core answers FRC_ERR_RANGE */
  civilValidate(civil: Civil): boolean;
  /** frc_parse_civil: the fields as written, and the offset the text names (null when none) */
  parseCivil(text: string): { readonly civil: Required<Civil>; readonly offset: number | null };
  /** frc_julian_fields_to_unix_ms */
  julianFieldsToUnixMs(unixMs: Int64Like): bigint;

  /* text */
  /** frc_to_ascii */
  toAscii(text: string): string;
}

/**
 * Load the core. With no argument: `../fractonica.wasm` beside fractonica.js
 * (fetched in a browser, read from disk in Node).
 */
export declare function load(
  source?: URL | string | BufferSource | WebAssembly.Module | Response | Promise<Response>,
): Promise<Fractonica>;
