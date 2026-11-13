/**
 * fractonica.js - the JavaScript binding of the Fractonica core (WebAssembly).
 *
 * ONE RULE: this file computes nothing about the clock. Every number, name,
 * boundary and text comes out of `fractonica.wasm`, which is the C core
 * (../../../core) compiled as it is. What this file does is marshalling:
 * check an argument, copy it into the module's memory, call, copy the answer
 * out as a plain frozen object. If you need a quantity that is not here, it
 * belongs in the core (ask for it), not in JavaScript.
 *
 * USE
 *   import { load, Unit, DateForm } from './lib/fractonica.js';
 *   const frc = await load();                    // browser: fetches ../fractonica.wasm
 *   const cat = frc.saros141;                    // the built-in catalogue
 *   const now = frc.now();                       // BigInt Unix MICROSECONDS
 *   const date = cat.dateAt(now);                // { alpha, beta, ... }
 *   frc.formatDate(date, DateForm.LETTERS, Unit.BLINK);   // "α#6 β#4 γ#9 δ#3 ε#5 34η 29ι 21λ 3ν"
 *   const helion = cat.odometerAt(now, 6, 2, 2); // { digits: [13, 0], nextChange, ... }
 *
 * CONVENTIONS (the same for every method)
 *   instants   BigInt Unix microseconds (frc_time_t). FRC_TIME_NONE, "no such
 *              instant", is `null` in every result. Make instants with
 *              frc.now / fromDate / fromUnixSeconds / fromUnixMs.
 *   levels     zero-based, 0 = Alpha (depth = level + 1 is never an argument).
 *   64-bit     uint64_t / int64_t values are BigInt; an argument may also be a
 *              safe integer Number. Everything narrower is a Number.
 *   enums      Numbers; the frozen objects Unit, Quarter, DateForm ... name them.
 *   structs    plain frozen objects, fields named as in fractonica.h in
 *              camelCase (next_change -> nextChange). Arrays are plural
 *              (trit -> trits, digit -> digits, quarter -> quarters), flags
 *              are booleans (clipped, dotted, negative).
 *   phases     a frc_frac_t is kept exact as `phase` (uint32, 0.32 fixed
 *              point); `fraction` beside it is the same as a Number in [0, 1)
 *              (frc_frac_to_double), for drawing.
 *   text       every frc_format_* returns a string.
 *   errors     a negative frc_status_t is thrown as a FractonicaError whose
 *              `status` is the name ("FRC_ERR_RANGE": outside the catalogue).
 *              An argument this file can tell is wrong before calling (not an
 *              integer, out of the C type's range, an instant that is not a
 *              BigInt) is thrown the same way with "FRC_ERR_ARG".
 *   naming     frc_foo_bar(cat, ...) is cat.fooBar(...); without a catalogue
 *              it is frc.fooBar(...). `frc.raw` holds the module's exports.
 *
 * HOW IT STAYS HONEST
 *   Struct layouts, constants and enumerators are read from tables the module
 *   exports (wasm/glue.c builds them from the real header with sizeof /
 *   offsetof). Nothing about a layout is written in this file except the
 *   field NAMES it needs; a missing one stops `load` with a clear message.
 *
 * Works in browsers and in Node (>= 20) without a build step or a dependency.
 * Types: fractonica.d.ts beside this file.
 */

/* ========================================================================== */
/* 1. Enumerations and the error type                                         */
/* ========================================================================== */

/*
 * The values are fractonica.h's. They are written here so that they can be
 * imported without an instance and typed in fractonica.d.ts; `load` compares
 * every one with the module's own table (verifyEnums) and refuses to run on
 * a mismatch, so they cannot drift from the core.
 */

/** frc_status_t. A FractonicaError carries one of these names in `status`. */
export const Status = Object.freeze({
  FRC_OK: 0,
  FRC_ERR_RANGE: -1,
  FRC_ERR_ARG: -2,
  FRC_ERR_OVERFLOW: -3,
  FRC_ERR_BUFFER: -4,
  FRC_ERR_PARSE: -5,
  FRC_ERR_REFUSED: -6,
});

/** frc_level_kind_t: what a level is in the notation. */
export const LevelKind = Object.freeze({ MAJOR: 0, UNIT: 1, BETWEEN: 2, SUB: 3 });

/** frc_unit_t: the nine named units, longest first. */
export const Unit = Object.freeze({
  ALPHA: 0,
  BETA: 1,
  GAMMA: 2,
  DELTA: 3,
  NUCLIDE: 4,
  HELION: 5,
  PREON: 6,
  FLAVON: 7,
  BLINK: 8,
});

/** frc_quarter_t: the quarters of a cycle, named by the threshold that ends each. */
export const Quarter = Object.freeze({ PEAK: 0, NODE: 1, VALLEY: 2, END: 3 });

/** frc_pentad_form_t. NUMERAL is the Roman numeral alone ("II"; "" for the Hypopentad), for a drawn mark. */
export const PentadForm = Object.freeze({ FULL: 0, SHORT: 1, ASCII: 2, NUMERAL: 3 });

/** frc_date_form_t. LETTERS down to Unit.BLINK is the stamp. */
export const DateForm = Object.freeze({ FULL: 0, SHORT: 1, LETTERS: 2, SHORT_LETTERS: 3 });

/** frc_medium_t: the media of SPEC 16.3. */
export const Medium = Object.freeze({
  VACUUM: 0,
  BOUNDED: 1,
  DIAMOND: 2,
  WATER: 3,
  AIR: 4,
  NERVE: 5,
  CHEMICAL: 6,
});

/** frc_band_t: where a frequency falls among sound and light. */
export const Band = Object.freeze({
  NONE: 0,
  AUDIBLE: 1,
  RADIO: 2,
  MICROWAVE: 3,
  INFRARED: 4,
  VISIBLE: 5,
  ULTRAVIOLET: 6,
  XRAY: 7,
  GAMMA: 8,
});

/** frc_quantity_t: the unit ladder formatQuantity uses. */
export const Quantity = Object.freeze({ TIME: 0, FREQUENCY: 1, LENGTH: 2 });

/** frc_path_op_t: the operations of a glyph outline. */
export const PathOp = Object.freeze({ MOVE: 0, LINE: 1, CUBIC: 2, DOT: 3 });

/** frc_civil_form_t: the Earth wordings of formatCivilText (EARTH mode only). */
export const CivilForm = Object.freeze({
  DATE_TIME: 0, //          "THU 8 OCT 2026 · 12:00:00"
  DATE: 1, //               "THU 8 OCT 2026"
  TIME: 2, //               "12:00:00"
  MINUTE: 3, //             "12:00"
  DAY_MONTH: 4, //          "8 OCT"
  DAY_MONTH_TIME: 5, //     "9 OCT 01:34"
  MONTH_YEAR: 6, //         "JAN 2028"
  OFFSET: 7, //             "UTC+3", "UTC−2:30", "UTC"
  DAY_MONTH_YEAR: 8, //     "3 FEB 2028"
  DAY_MONTH_SECONDS: 9, //  "9 OCT 01:34:05"
  ISO_DATE: 10, //          "2026-10-08"
  WEEKDAY: 11, //           "THU"
  MONTH: 12, //             "OCT"
  YEAR: 13, //              "2026"
});

/** Each enum above with the prefix its members carry in fractonica.h. */
const ENUMS = [
  [Status, ''],
  [LevelKind, 'FRC_KIND_'],
  [Unit, 'FRC_UNIT_'],
  [Quarter, 'FRC_'],
  [PentadForm, 'FRC_PENTAD_'],
  [DateForm, 'FRC_DATE_'],
  [Medium, 'FRC_MEDIUM_'],
  [Band, 'FRC_BAND_'],
  [Quantity, 'FRC_QUANTITY_'],
  [PathOp, 'FRC_PATH_'],
  [CivilForm, 'FRC_CIVIL_'],
];

/** "FRC_UNIT_ALPHA", "FRC_PEAK", ...: the header names of every member above. */
const ENUM_MEMBERS = new Set(ENUMS.flatMap(([members, prefix]) => Object.keys(members).map((name) => prefix + name)));

/**
 * What every failure of this binding is thrown as.
 * `status` is the frc_status_t name, `code` its number, `call` the C function
 * (or "fractonica.js" when the binding itself refused an argument).
 */
export class FractonicaError extends Error {
  /**
   * @param {string} status e.g. "FRC_ERR_RANGE"
   * @param {string} call   e.g. "frc_cycle_at"
   * @param {string} [detail]
   */
  constructor(status, call, detail) {
    super(detail ? `${call}: ${status} (${detail})` : `${call}: ${status}`);
    this.name = 'FractonicaError';
    this.status = status;
    this.code = Status[status] ?? null;
    this.call = call;
  }
}

/* ========================================================================== */
/* 2. Argument checks                                                         */
/* ========================================================================== */

/*
 * WebAssembly takes any Number for an i32 and wraps it silently, and the C
 * side trusts a uint8_t to be 0..255. So a value is checked against its C
 * type BEFORE the call; what is wrong for the clock (a level above 62, a
 * unit that does not exist) is left to the core, which says so itself.
 */

const HERE = 'fractonica.js';
const I64_MIN = -(2n ** 63n);
const I64_MAX = 2n ** 63n - 1n;
const U64_MAX = 2n ** 64n - 1n;

function argError(what, value, expected) {
  const shown = typeof value === 'bigint' ? `${value}n` : typeof value === 'string' ? JSON.stringify(value) : String(value);
  return new FractonicaError('FRC_ERR_ARG', HERE, `${what}: expected ${expected}, got ${shown}`);
}

function int(value, min, max, what) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw argError(what, value, `an integer ${min}..${max}`);
  }
  return value;
}
const u8 = (value, what) => int(value, 0, 0xff, what);
const i8 = (value, what) => int(value, -0x80, 0x7f, what);
const u16 = (value, what) => int(value, 0, 0xffff, what);
const i16 = (value, what) => int(value, -0x8000, 0x7fff, what);
const u32 = (value, what) => int(value, 0, 0xffffffff, what);
const i32 = (value, what) => int(value, -0x80000000, 0x7fffffff, what);

function big(value, min, max, what) {
  let result;
  if (typeof value === 'bigint') result = value;
  else if (Number.isSafeInteger(value)) result = BigInt(value);
  else throw argError(what, value, 'a BigInt or a safe integer');
  if (result < min || result > max) throw argError(what, value, `a value ${min}..${max}`);
  return result;
}
const u64 = (value, what) => big(value, 0n, U64_MAX, what);
const i64 = (value, what) => big(value, I64_MIN, I64_MAX, what);

/** An instant must be a BigInt: a Number here is nearly always seconds or milliseconds by mistake. */
function instant(value, what) {
  if (typeof value !== 'bigint' || value < I64_MIN || value > I64_MAX) {
    throw argError(what, value, 'an instant (BigInt Unix microseconds; see fromDate, fromUnixSeconds)');
  }
  return value;
}

function float(value, what) {
  if (typeof value !== 'number') throw argError(what, value, 'a number');
  return value;
}

const flag = (value) => (value ? 1 : 0);

function object(value, what) {
  if (value === null || typeof value !== 'object') throw argError(what, value, 'an object');
  return value;
}

const freeze = Object.freeze;

/* ========================================================================== */
/* 3. The machine: memory, layout tables, calls                               */
/* ========================================================================== */

/** The version of the contract with wasm/glue.c (its FRCW_ABI). */
const GLUE_ABI = 1;
/** Room for any text the core writes but one (a full date is under 160 bytes); the longer one,
 * frc_format_prefix_factors, gets the header's FRC_PREFIX_FACTORS_SIZE (429: level 62 is 428 bytes + NUL). */
const TEXT_BYTES = 256;

/** Bytes of each scalar type letter of glue.c's layout table. */
const WIDTH = { B: 1, b: 1, H: 2, h: 2, I: 4, i: 4, Q: 8, q: 8, f: 4, P: 4, T: 0 };

const utf8Decoder = new TextDecoder('utf-8');
const utf8Encoder = new TextEncoder();

/**
 * One instantiated module and the few primitives every call is made of.
 * Internal: Fractonica and Catalogue are the public faces.
 */
class Machine {
  /** @param {WebAssembly.Instance} instance */
  constructor(instance) {
    /** The module's exports: frc_* (the core), frcw_* (glue.c) and `memory`. */
    this.x = instance.exports;
    if (typeof this.x.frcw_constant_names !== 'function' || !(this.x.memory instanceof WebAssembly.Memory)) {
      throw new FractonicaError('FRC_ERR_ARG', HERE, 'not a fractonica.wasm module (no glue exports)');
    }
    this.memory = this.x.memory;
    this.view = new DataView(this.memory.buffer);
    this.bytes = new Uint8Array(this.memory.buffer);

    this.constants = this.#readConstants();
    if (this.constants.FRCW_ABI !== GLUE_ABI) {
      throw new FractonicaError('FRC_ERR_ARG', HERE, `the module's glue is ABI ${this.constants.FRCW_ABI}, this binding needs ${GLUE_ABI}: rebuild with \`make wasm\``);
    }
    this.#verifyEnums();
    /** FRC_TIME_NONE as the module holds it. */
    this.none = this.constants.FRC_TIME_NONE;
    /** Status number -> name, from the module's table. */
    this.statusNames = new Map(
      Object.entries(this.constants)
        .filter(([name]) => name === 'FRC_OK' || name.startsWith('FRC_ERR_'))
        .map(([name, value]) => [value, name]),
    );

    const layout = this.#readLayout();
    /**
     * The structs this binding touches and the fields it needs of each.
     * A name that the header no longer has stops the load here.
     */
    this.S = {
      catalogue: need(layout, 'frc_catalogue_t', 'instants_ms', 'count', 'series', 'anchor'),
      position: need(layout, 'frc_position_t', 'ordinal', 'num', 'den'),
      cycle: need(layout, 'frc_cycle_t', 'level', 'quarter', 'clipped', 'local', 'siblings', 'cycle', 'phase', 'start', 'end'),
      threshold: need(layout, 'frc_threshold_t', 'name', 'time'),
      glyph: need(layout, 'frc_glyph_t', 'index', 'value', 'derivative', 'dotted', 'strokes', 'trit'),
      odometer: need(layout, 'frc_odometer_t', 'count', 'strokes', 'states', 'digit', 'next_change'),
      sync: need(layout, 'frc_sync_t', 'sync', 'quarter', 'helion', 'phase', 'start', 'end', 'nominal', 'drift_us', 'next'),
      pentad: need(layout, 'frc_pentad_t', 'sync', 'index', 'helion', 'helions', 'first', 'start', 'end'),
      date: need(layout, 'frc_date_t', 'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'eta', 'iota', 'lambda', 'nu', 'quarter'),
      span: need(layout, 'frc_span_t', 'negative', 'blinks', 'frac'),
      spanPart: need(layout, 'frc_span_part_t', 'unit', 'count'),
      rate: need(layout, 'frc_rate_t', 'unit', 'count', 'factor'),
      interval: need(layout, 'frc_interval_t', 'num', 'den'),
      sci: need(layout, 'frc_sci_t', 'mantissa', 'exp10'),
      speed: need(layout, 'frc_speed_t', 'num', 'den'),
      arc: need(layout, 'frc_arc_t', 'cx', 'cy', 'radius', 'start', 'sweep'),
      civil: need(layout, 'frc_civil_t', 'year', 'month', 'day', 'hour', 'minute', 'second', 'weekday', 'microsecond'),
    };
    /** The whole table as the module gave it, for the layout test. */
    this.layout = layout;
  }

  /* ---- memory ---------------------------------------------------------- */

  /**
   * Start a call: every scratch allocation of the call before is forgotten.
   * (JavaScript is single-threaded and every result is copied out before a
   * method returns, so nothing can still be reading the old ones.)
   */
  begin() {
    this.x.frcw_reset();
    if (this.view.buffer !== this.memory.buffer) {
      // The module's memory is fixed, so this never happens; cheap to be sure.
      this.view = new DataView(this.memory.buffer);
      this.bytes = new Uint8Array(this.memory.buffer);
    }
  }

  /** `size` bytes of scratch (8-byte aligned), valid until the next begin(). */
  alloc(size) {
    const pointer = this.x.frcw_alloc(size);
    if (pointer === 0) {
      throw new FractonicaError('FRC_ERR_BUFFER', HERE, `${size} bytes do not fit the module's scratch memory`);
    }
    return pointer;
  }

  /* ---- statuses and text ----------------------------------------------- */

  /** The error for a negative frc_status_t. */
  failure(code, call) {
    return new FractonicaError(this.statusNames.get(code) ?? `FRC_STATUS_${code}`, call);
  }

  /** Throw unless `code` is FRC_OK. */
  ok(code, call) {
    if (code !== 0) throw this.failure(code, call);
  }

  /** FRC_TIME_NONE -> null. The core says which value that is. */
  time(value) {
    return this.x.frc_time_is_none(value) !== 0 ? null : value;
  }

  /** null -> FRC_TIME_NONE, for a struct this binding writes back. */
  timeIn(value, what) {
    return value === null ? this.none : instant(value, what);
  }

  /** The UTF-8 text of `length` bytes at `pointer`. */
  string(pointer, length) {
    return utf8Decoder.decode(this.bytes.subarray(pointer, pointer + length));
  }

  /** A NUL-terminated string the module holds (a table of names, a version). */
  cstring(pointer) {
    let end = pointer;
    while (this.bytes[end] !== 0) end++;
    return this.string(pointer, end - pointer);
  }

  /** Copy a JavaScript string into scratch as NUL-terminated UTF-8. @returns {{ pointer: number, length: number }} */
  putString(text, what) {
    if (typeof text !== 'string') throw argError(what, text, 'a string');
    if (text.includes('\0')) throw argError(what, text, 'a string without NUL');
    const room = text.length * 3 + 1; // UTF-8 never needs more than 3 bytes per UTF-16 unit
    const pointer = this.alloc(room);
    const { written } = utf8Encoder.encodeInto(text, this.bytes.subarray(pointer, pointer + room - 1));
    this.bytes[pointer + written] = 0;
    return { pointer, length: written };
  }

  /**
   * Run a text function: `invoke(buf, size)` must return what the C function
   * returns, a byte count or a negative status.
   */
  text(call, invoke, size = TEXT_BYTES) {
    const buffer = this.alloc(size);
    const written = invoke(buffer, size);
    if (written < 0) throw this.failure(written, call);
    return this.string(buffer, written);
  }

  /** frc_frac_t -> Number in [0, 1), by the core. */
  fraction(phase) {
    return this.x.frc_frac_to_double(phase);
  }

  /* ---- struct fields ---------------------------------------------------- */

  /** Read element `i` of field `f` of the struct at `pointer`. 64-bit types come back as BigInt. */
  get(pointer, f, i = 0) {
    const at = pointer + f.offset + i * WIDTH[f.type];
    const view = this.view;
    switch (f.type) {
      case 'B': return view.getUint8(at);
      case 'b': return view.getInt8(at);
      case 'H': return view.getUint16(at, true);
      case 'h': return view.getInt16(at, true);
      case 'I': case 'P': return view.getUint32(at, true);
      case 'i': return view.getInt32(at, true);
      case 'Q': return view.getBigUint64(at, true);
      case 'q': return view.getBigInt64(at, true);
      case 'f': return view.getFloat32(at, true);
      default: throw new FractonicaError('FRC_ERR_ARG', HERE, `no reader for field type "${f.type}"`);
    }
  }

  /** Write element `i` of field `f`, after checking `value` against the field's C type. */
  set(pointer, f, value, what, i = 0) {
    const at = pointer + f.offset + i * WIDTH[f.type];
    const view = this.view;
    switch (f.type) {
      case 'B': view.setUint8(at, u8(value, what)); break;
      case 'b': view.setInt8(at, i8(value, what)); break;
      case 'H': view.setUint16(at, u16(value, what), true); break;
      case 'h': view.setInt16(at, i16(value, what), true); break;
      case 'I': view.setUint32(at, u32(value, what), true); break;
      case 'i': view.setInt32(at, i32(value, what), true); break;
      case 'Q': view.setBigUint64(at, u64(value, what), true); break;
      case 'q': view.setBigInt64(at, i64(value, what), true); break;
      case 'f': view.setFloat32(at, float(value, what), true); break;
      default: throw new FractonicaError('FRC_ERR_ARG', HERE, `no writer for field type "${f.type}"`);
    }
  }

  /* ---- the module's own tables ------------------------------------------ */

  /** { FRC_LEVEL_COUNT: 63, FRC_TIME_NONE: -9223372036854775808n, ... } from glue.c section 3. */
  #readConstants() {
    const names = this.cstring(this.x.frcw_constant_names()).split(',').filter(Boolean);
    const values = this.x.frcw_constant_values();
    if (names.length !== this.x.frcw_constant_count()) {
      throw new FractonicaError('FRC_ERR_ARG', HERE, 'the constant table and its names disagree');
    }
    const constants = {};
    names.forEach((entry, i) => {
      const value = this.view.getBigInt64(values + 8 * i, true);
      constants[entry.slice(1)] = entry[0] === 'b' ? value : Number(value);
    });
    return freeze(constants);
  }

  /** The enums written in section 1 must be the module's. */
  #verifyEnums() {
    for (const [members, prefix] of ENUMS) {
      for (const [name, value] of Object.entries(members)) {
        if (this.constants[prefix + name] !== value) {
          throw new FractonicaError('FRC_ERR_ARG', HERE, `${prefix}${name} is ${this.constants[prefix + name]} in the module and ${value} in fractonica.js`);
        }
      }
    }
  }

  /**
   * glue.c section 2 as { frc_cycle_t: { size, align, fields: { level: { offset, type, count }, ... } }, ... }.
   */
  #readLayout() {
    const names = this.cstring(this.x.frcw_layout_names()).split('\n').filter(Boolean);
    const values = this.x.frcw_layout_values();
    const count = this.x.frcw_layout_count();
    let at = 0;
    const next = () => {
      if (at >= count) throw new FractonicaError('FRC_ERR_ARG', HERE, 'the layout table is shorter than its names');
      return this.view.getUint16(values + 2 * at++, true);
    };
    const layout = {};
    for (const line of names) {
      const [struct, list] = line.split(':');
      if (next() !== 0xffff) throw new FractonicaError('FRC_ERR_ARG', HERE, `the layout table is out of step at ${struct}`);
      const entry = { size: next(), align: next(), fields: {} };
      for (const field of list.split(',').filter(Boolean)) {
        entry.fields[field] = freeze({ offset: next(), type: String.fromCharCode(next()), count: next() });
      }
      freeze(entry.fields);
      layout[struct] = freeze(entry);
    }
    if (at !== count) throw new FractonicaError('FRC_ERR_ARG', HERE, 'the layout table is longer than its names');
    return freeze(layout);
  }
}

/** { size, <field>: { offset, type, count }, ... } for one struct, or an error naming the missing field. */
function need(layout, struct, ...fields) {
  const entry = layout[struct];
  if (!entry) throw new FractonicaError('FRC_ERR_ARG', HERE, `the module has no layout for ${struct}`);
  const out = { size: entry.size };
  for (const field of fields) {
    if (!entry.fields[field]) throw new FractonicaError('FRC_ERR_ARG', HERE, `${struct} has no field "${field}" in this module`);
    out[field] = entry.fields[field];
  }
  return freeze(out);
}

/* ========================================================================== */
/* 4. Structs: C memory <-> frozen objects                                    */
/* ========================================================================== */

/* One reader per struct, and a writer for each struct a function takes as
 * input. They rename and retype (see CONVENTIONS above) and do nothing else. */

function readPosition(m, p) {
  const s = m.S.position;
  return freeze({ ordinal: m.get(p, s.ordinal), num: m.get(p, s.num), den: m.get(p, s.den) });
}

function writePosition(m, position) {
  const s = m.S.position;
  const p = m.alloc(s.size);
  object(position, 'position');
  m.set(p, s.ordinal, position.ordinal, 'position.ordinal');
  m.set(p, s.num, position.num, 'position.num');
  m.set(p, s.den, position.den, 'position.den');
  return p;
}

function readCycle(m, p) {
  const s = m.S.cycle;
  const phase = m.get(p, s.phase);
  return freeze({
    level: m.get(p, s.level),
    quarter: m.get(p, s.quarter),
    clipped: m.get(p, s.clipped) !== 0,
    local: m.get(p, s.local),
    siblings: m.get(p, s.siblings),
    cycle: m.get(p, s.cycle),
    phase,
    fraction: m.fraction(phase),
    start: m.time(m.get(p, s.start)),
    end: m.time(m.get(p, s.end)),
  });
}

function writeCycle(m, cycle) {
  const s = m.S.cycle;
  const p = m.alloc(s.size);
  object(cycle, 'cycle');
  m.set(p, s.level, cycle.level, 'cycle.level');
  m.set(p, s.quarter, cycle.quarter, 'cycle.quarter');
  m.set(p, s.clipped, flag(cycle.clipped), 'cycle.clipped');
  m.set(p, s.local, cycle.local, 'cycle.local');
  m.set(p, s.siblings, cycle.siblings, 'cycle.siblings');
  m.set(p, s.cycle, cycle.cycle, 'cycle.cycle');
  m.set(p, s.phase, cycle.phase, 'cycle.phase');
  m.set(p, s.start, m.timeIn(cycle.start, 'cycle.start'), 'cycle.start');
  m.set(p, s.end, m.timeIn(cycle.end, 'cycle.end'), 'cycle.end');
  return p;
}

function readThreshold(m, p) {
  const s = m.S.threshold;
  return freeze({ name: m.get(p, s.name), time: m.time(m.get(p, s.time)) });
}

function readGlyph(m, p) {
  const s = m.S.glyph;
  const strokes = m.get(p, s.strokes);
  const trits = [];
  // unused trits are 0 in C; the array holds the `strokes` that are drawn
  for (let i = 0; i < strokes && i < s.trit.count; i++) trits.push(m.get(p, s.trit, i));
  return freeze({
    index: m.get(p, s.index),
    value: m.get(p, s.value),
    derivative: m.get(p, s.derivative),
    dotted: m.get(p, s.dotted) !== 0,
    strokes,
    trits: freeze(trits),
  });
}

function writeGlyph(m, glyph) {
  const s = m.S.glyph;
  const p = m.alloc(s.size);
  object(glyph, 'glyph');
  m.set(p, s.index, glyph.index, 'glyph.index');
  m.set(p, s.value, glyph.value, 'glyph.value');
  m.set(p, s.derivative, glyph.derivative, 'glyph.derivative');
  m.set(p, s.dotted, flag(glyph.dotted), 'glyph.dotted');
  m.set(p, s.strokes, glyph.strokes, 'glyph.strokes');
  for (let i = 0; i < s.trit.count; i++) m.set(p, s.trit, glyph.trits?.[i] ?? 0, 'glyph.trits', i);
  return p;
}

function readOdometer(m, p) {
  const s = m.S.odometer;
  const count = m.get(p, s.count);
  const digits = [];
  for (let i = 0; i < count && i < s.digit.count; i++) digits.push(m.get(p, s.digit, i));
  return freeze({
    count,
    strokes: m.get(p, s.strokes),
    states: m.get(p, s.states),
    digits: freeze(digits),
    nextChange: m.time(m.get(p, s.next_change)),
  });
}

function readSync(m, p) {
  const s = m.S.sync;
  const phase = m.get(p, s.phase);
  return freeze({
    sync: m.get(p, s.sync),
    quarter: m.get(p, s.quarter),
    helion: m.get(p, s.helion),
    phase,
    fraction: m.fraction(phase),
    start: m.time(m.get(p, s.start)),
    end: m.time(m.get(p, s.end)),
    nominal: m.time(m.get(p, s.nominal)),
    driftUs: m.get(p, s.drift_us),
    next: readThreshold(m, p + s.next.offset),
  });
}

function readPentad(m, p) {
  const s = m.S.pentad;
  return freeze({
    sync: m.get(p, s.sync),
    index: m.get(p, s.index),
    helion: m.get(p, s.helion),
    helions: m.get(p, s.helions),
    first: m.get(p, s.first),
    start: m.time(m.get(p, s.start)),
    end: m.time(m.get(p, s.end)),
  });
}

function writePentad(m, pentad) {
  const s = m.S.pentad;
  const p = m.alloc(s.size);
  object(pentad, 'pentad');
  m.set(p, s.sync, pentad.sync, 'pentad.sync');
  m.set(p, s.index, pentad.index, 'pentad.index');
  m.set(p, s.helion, pentad.helion, 'pentad.helion');
  m.set(p, s.helions, pentad.helions, 'pentad.helions');
  // `first` is not read by frc_format_pentad: a Pentad typed by hand may leave it out
  m.set(p, s.first, pentad.first ?? 0, 'pentad.first');
  m.set(p, s.start, m.timeIn(pentad.start, 'pentad.start'), 'pentad.start');
  m.set(p, s.end, m.timeIn(pentad.end, 'pentad.end'), 'pentad.end');
  return p;
}

/** The scalar fields of frc_date_t, in the header's order. */
const DATE_FIELDS = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'eta', 'iota', 'lambda', 'nu'];

function readDate(m, p) {
  const s = m.S.date;
  const date = {};
  for (const name of DATE_FIELDS) date[name] = m.get(p, s[name]);
  const quarters = [];
  for (let i = 0; i < s.quarter.count; i++) quarters.push(m.get(p, s.quarter, i));
  date.quarters = freeze(quarters);
  return freeze(date);
}

function writeDate(m, date, what = 'date') {
  const s = m.S.date;
  const p = m.alloc(s.size);
  object(date, what);
  for (const name of DATE_FIELDS) m.set(p, s[name], date[name], `${what}.${name}`);
  // a date typed by hand may leave the quarters out: the counts imply them
  for (let i = 0; i < s.quarter.count; i++) m.set(p, s.quarter, date.quarters?.[i] ?? 0, `${what}.quarters`, i);
  return p;
}

function readSpan(m, p) {
  const s = m.S.span;
  return freeze({ negative: m.get(p, s.negative) !== 0, blinks: m.get(p, s.blinks), frac: m.get(p, s.frac) });
}

function writeSpan(m, span) {
  const s = m.S.span;
  const p = m.alloc(s.size);
  object(span, 'span');
  m.set(p, s.negative, flag(span.negative), 'span.negative');
  m.set(p, s.blinks, span.blinks, 'span.blinks');
  m.set(p, s.frac, span.frac, 'span.frac');
  return p;
}

function readRate(m, p) {
  const s = m.S.rate;
  return freeze({ unit: m.get(p, s.unit), count: m.get(p, s.count), factor: m.get(p, s.factor) });
}

function writeRate(m, rate) {
  const s = m.S.rate;
  const p = m.alloc(s.size);
  object(rate, 'rate');
  m.set(p, s.unit, rate.unit, 'rate.unit');
  m.set(p, s.count, rate.count, 'rate.count');
  m.set(p, s.factor, rate.factor, 'rate.factor');
  return p;
}

/** frc_interval_t and frc_speed_t are both an exact ratio { num, den }. */
function readRatio(m, s, p) {
  return freeze({ num: m.get(p, s.num), den: m.get(p, s.den) });
}

function writeRatio(m, s, ratio, what) {
  const p = m.alloc(s.size);
  object(ratio, what);
  m.set(p, s.num, ratio.num, `${what}.num`);
  m.set(p, s.den, ratio.den, `${what}.den`);
  return p;
}

function readSci(m, p) {
  const s = m.S.sci;
  return freeze({ mantissa: m.get(p, s.mantissa), exp10: m.get(p, s.exp10) });
}

function writeSci(m, value) {
  const s = m.S.sci;
  const p = m.alloc(s.size);
  object(value, 'value');
  m.set(p, s.mantissa, value.mantissa, 'value.mantissa');
  m.set(p, s.exp10, value.exp10, 'value.exp10');
  return p;
}

const ARC_FIELDS = ['cx', 'cy', 'radius', 'start', 'sweep'];

function readArc(m, p) {
  const s = m.S.arc;
  const arc = {};
  for (const name of ARC_FIELDS) arc[name] = m.get(p, s[name]);
  return freeze(arc);
}

function writeArc(m, arc, what = 'arc') {
  const s = m.S.arc;
  const p = m.alloc(s.size);
  object(arc, what);
  for (const name of ARC_FIELDS) m.set(p, s[name], arc[name], `${what}.${name}`);
  return p;
}

const CIVIL_FIELDS = ['year', 'month', 'day', 'hour', 'minute', 'second', 'weekday', 'microsecond'];

function readCivil(m, p) {
  const s = m.S.civil;
  const civil = {};
  for (const name of CIVIL_FIELDS) civil[name] = m.get(p, s[name]);
  return freeze(civil);
}

function writeCivil(m, civil) {
  const s = m.S.civil;
  const p = m.alloc(s.size);
  object(civil, 'civil');
  // `weekday` is output only: the core ignores it, so it may be left out
  for (const name of CIVIL_FIELDS) m.set(p, s[name], name === 'weekday' ? civil[name] ?? 0 : civil[name], `civil.${name}`);
  return p;
}

/* ========================================================================== */
/* 5. Catalogue: everything that is read at an instant                        */
/* ========================================================================== */

/**
 * One Saros series and the clock on it. Get the built-in one from
 * `frc.saros141`, or make another with `frc.catalogue(instantsMs, series)`.
 *
 * Every method that takes an instant throws FRC_ERR_RANGE outside
 * [first, last] (the clock is not defined there and is never extrapolated):
 * test `contains(t)` first where that can happen.
 */
export class Catalogue {
  #m;
  #p;

  /** @internal Use frc.saros141 or frc.catalogue(). */
  constructor(machine, pointer) {
    this.#m = machine;
    this.#p = pointer;
    const s = machine.S.catalogue;
    /** Address of the frc_catalogue_t in the module's memory (for `frc.raw` calls). */
    this.pointer = pointer;
    /** Number of eclipses. */
    this.count = machine.get(pointer, s.count);
    /** Saros series number, 0 if unnamed. */
    this.series = machine.get(pointer, s.series);
    /** Ordinal of the solar-sync anchor eclipse. */
    this.anchor = machine.get(pointer, s.anchor);
    /** First and last instant: the clock is defined on [first, last]. */
    this.first = machine.time(machine.x.frc_catalogue_first(pointer));
    this.last = machine.time(machine.x.frc_catalogue_last(pointer));
    freeze(this);
  }

  /* ---- catalogue and position (SPEC 2) ---------------------------------- */

  /** Instant of eclipse `ordinal`, or null when there is none. */
  instant(ordinal) {
    const m = this.#m;
    return m.time(m.x.frc_catalogue_instant(this.#p, u16(ordinal, 'ordinal')));
  }

  /** true when first <= t <= last. */
  contains(t) {
    return this.#m.x.frc_catalogue_contains(this.#p, instant(t, 't')) !== 0;
  }

  /** Exact position of `t`: { ordinal, num, den } = ordinal + num/den Saros. */
  positionAt(t) {
    const m = this.#m;
    m.begin();
    const out = m.alloc(m.S.position.size);
    m.ok(m.x.frc_position_at(this.#p, instant(t, 't'), out), 'frc_position_at');
    return readPosition(m, out);
  }

  /** Instant of the rational position n/d Saros (first microsecond at or after it), or null. */
  timeAtPosition(n, d) {
    const m = this.#m;
    return m.time(m.x.frc_time_at_position(this.#p, u64(n, 'n'), u64(d, 'd')));
  }

  /* ---- cycles, counters, thresholds (SPEC 3.2, 6) ------------------------ */

  /** The cycle of `level` (0..21) running at `t`. `local` of `siblings` is the sibling counter. */
  cycleAt(t, level) {
    const m = this.#m;
    m.begin();
    const out = m.alloc(m.S.cycle.size);
    m.ok(m.x.frc_cycle_at(this.#p, instant(t, 't'), u8(level, 'level'), out), 'frc_cycle_at');
    return readCycle(m, out);
  }

  /** The cycle with global index `cycle` (phase and quarter are 0). */
  cycleByIndex(level, cycle) {
    const m = this.#m;
    m.begin();
    const out = m.alloc(m.S.cycle.size);
    m.ok(m.x.frc_cycle_by_index(this.#p, u8(level, 'level'), u64(cycle, 'cycle'), out), 'frc_cycle_by_index');
    return readCycle(m, out);
  }

  /** Number of cycles of `level` in the catalogue (BigInt), the last partial one included. */
  cycleCount(level) {
    return BigInt.asUintN(64, this.#m.x.frc_cycle_count(this.#p, u8(level, 'level')));
  }

  /** The five quarter points of a cycle: [start, peak, node, valley, end]; null beyond the catalogue. */
  cyclePoints(level, cycle) {
    const m = this.#m;
    m.begin();
    const out = m.alloc(5 * 8);
    m.ok(m.x.frc_cycle_points(this.#p, u8(level, 'level'), u64(cycle, 'cycle'), out), 'frc_cycle_points');
    const points = [];
    for (let i = 0; i < 5; i++) points.push(m.time(m.view.getBigInt64(out + 8 * i, true)));
    return freeze(points);
  }

  /** The first quarter boundary of `level` strictly after `t`: { name: Quarter, time }. */
  nextThreshold(t, level) {
    const m = this.#m;
    m.begin();
    const out = m.alloc(m.S.threshold.size);
    m.ok(m.x.frc_next_threshold(this.#p, instant(t, 't'), u8(level, 'level'), out), 'frc_next_threshold');
    return readThreshold(m, out);
  }

  /**
   * The first microsecond at which cycle `cycle` of `level` reaches `phase` (a frc_frac_t): the inverse of
   * cycleAt's phase, rounded up. Phase 0 is the cycle's start, FRAC_QUARTER its peak. null for a level above
   * 21, a cycle the catalogue does not have, or a phase of its last, clipped cycle after the closing instant.
   */
  timeAtPhase(level, cycle, phase) {
    const m = this.#m;
    return m.time(m.x.frc_time_at_phase(this.#p, u8(level, 'level'), u64(cycle, 'cycle'), u32(phase, 'phase')));
  }

  /* ---- glyphs and odometer (SPEC 4, 5) ----------------------------------- */

  /** The glyph state of `level` at `t` with `strokes` strokes (1..5). */
  glyphAt(t, level, strokes) {
    const m = this.#m;
    m.begin();
    const out = m.alloc(m.S.glyph.size);
    m.ok(m.x.frc_glyph_at(this.#p, instant(t, 't'), u8(level, 'level'), u8(strokes, 'strokes'), out), 'frc_glyph_at');
    return readGlyph(m, out);
  }

  /**
   * `digits` glyphs of `strokes` strokes side by side for `level` at `t`.
   * Redraw at `nextChange` (null at the catalogue's closing instant); never poll.
   */
  odometerAt(t, level, strokes, digits) {
    const m = this.#m;
    m.begin();
    const out = m.alloc(m.S.odometer.size);
    m.ok(
      m.x.frc_odometer_at(this.#p, instant(t, 't'), u8(level, 'level'), u8(strokes, 'strokes'), u8(digits, 'digits'), out),
      'frc_odometer_at',
    );
    return readOdometer(m, out);
  }

  /* ---- solar sync and Pentads (SPEC 7) ----------------------------------- */

  /** The solar sync running at `t`. FRC_ERR_RANGE also inside the first / last partial sync. */
  syncAt(t) {
    const m = this.#m;
    m.begin();
    const out = m.alloc(m.S.sync.size);
    m.ok(m.x.frc_sync_at(this.#p, instant(t, 't'), out), 'frc_sync_at');
    return readSync(m, out);
  }

  /** Sync number `number` (0 at the anchor): phase and quarter 0, next.time null. */
  syncByNumber(number) {
    const m = this.#m;
    m.begin();
    const out = m.alloc(m.S.sync.size);
    m.ok(m.x.frc_sync_by_number(this.#p, i32(number, 'number'), out), 'frc_sync_by_number');
    return readSync(m, out);
  }

  /** The sync phase as an odometer (reference: 2 strokes, 3 digits). */
  syncOdometer(t, strokes, digits) {
    const m = this.#m;
    m.begin();
    const out = m.alloc(m.S.odometer.size);
    m.ok(m.x.frc_sync_odometer(this.#p, instant(t, 't'), u8(strokes, 'strokes'), u8(digits, 'digits'), out), 'frc_sync_odometer');
    return readOdometer(m, out);
  }

  /**
   * The first microsecond at which sync `sync` reaches `phase` (a frc_frac_t; linear in time between its exact
   * start and end). null for a sync that is not whole in the catalogue.
   */
  timeAtSyncPhase(sync, phase) {
    const m = this.#m;
    return m.time(m.x.frc_time_at_sync_phase(this.#p, i32(sync, 'sync'), u32(phase, 'phase')));
  }

  /** The Pentad running at `t` (defined in the partial syncs too). */
  pentadAt(t) {
    const m = this.#m;
    m.begin();
    const out = m.alloc(m.S.pentad.size);
    m.ok(m.x.frc_pentad_at(this.#p, instant(t, 't'), out), 'frc_pentad_at');
    return readPentad(m, out);
  }

  /** Pentad `index` (0..3) of sync `sync`; its `helion` is 0. */
  pentadByNumber(sync, index) {
    const m = this.#m;
    m.begin();
    const out = m.alloc(m.S.pentad.size);
    m.ok(m.x.frc_pentad_by_number(this.#p, i32(sync, 'sync'), u8(index, 'index'), out), 'frc_pentad_by_number');
    return readPentad(m, out);
  }

  /* ---- notation and spans (SPEC 15) -------------------------------------- */

  /** The date at `t`: ordinals of the majors and the Nuclide, the Helion from 1, counts from 0. */
  dateAt(t) {
    const m = this.#m;
    m.begin();
    const out = m.alloc(m.S.date.size);
    m.ok(m.x.frc_date_at(this.#p, instant(t, 't'), out), 'frc_date_at');
    return readDate(m, out);
  }

  /** The first microsecond of the Blink a date names (its quarters are ignored). */
  dateToTime(date) {
    const m = this.#m;
    m.begin();
    const pointer = writeDate(m, date);
    const out = m.alloc(8);
    m.ok(m.x.frc_date_to_time(this.#p, pointer, out), 'frc_date_to_time');
    return m.time(m.view.getBigInt64(out, true));
  }

  /** The span from t1 to t2, measured in position: { negative, blinks, frac }. */
  spanBetween(t1, t2) {
    const m = this.#m;
    m.begin();
    const out = m.alloc(m.S.span.size);
    m.ok(m.x.frc_span_between(this.#p, instant(t1, 't1'), instant(t2, 't2'), out), 'frc_span_between');
    return readSpan(m, out);
  }

  /**
   * When the countdown text formatSpan(spanBetween(t, boundary), maxParts) next changes: the first instant
   * after `t` at which it differs, `boundary` at the latest. null when t >= boundary or either instant is
   * outside the catalogue.
   */
  spanNextChange(t, boundary, maxParts = 0) {
    const m = this.#m;
    return m.time(m.x.frc_span_next_change(this.#p, instant(t, 't'), instant(boundary, 'boundary'), u8(maxParts, 'maxParts')));
  }

  /**
   * The same for a span that GROWS: when formatSpan(spanBetween(origin, t), maxParts) next changes, for
   * t >= origin (an elapsed time; a signed span to a threshold once it is past). At the origin it is
   * origin + 1 ("0ν" becomes "<0.001ν"). null when t < origin (use spanNextChange), when the text does
   * not change again before the catalogue ends, or when either instant is outside the catalogue.
   */
  spanNextChangeSince(origin, t, maxParts = 0) {
    const m = this.#m;
    return m.time(m.x.frc_span_next_change_since(this.#p, instant(origin, 'origin'), instant(t, 't'), u8(maxParts, 'maxParts')));
  }

  /* ---- the ladder's scale (SPEC 16.1) ------------------------------------ */

  /** The Saros interval that holds `t`, { num, den } milliseconds: what the clock is doing then. */
  intervalAt(t) {
    const m = this.#m;
    m.begin();
    const out = m.alloc(m.S.interval.size);
    m.ok(m.x.frc_interval_at(this.#p, instant(t, 't'), out), 'frc_interval_at');
    return readRatio(m, m.S.interval, out);
  }

  /** The series' mean interval (not reduced): one figure that does not step at an eclipse. */
  intervalMean() {
    const m = this.#m;
    m.begin();
    const out = m.alloc(m.S.interval.size);
    m.x.frcw_interval_mean(this.#p, out);
    return readRatio(m, m.S.interval, out);
  }
}

/* ========================================================================== */
/* 6. Fractonica: static facts, text, geometry, time                          */
/* ========================================================================== */

/**
 * An instantiated core. Make one with `load()`; it is cheap to keep for the
 * life of the page and holds no state between calls.
 */
export class Fractonica {
  #m;

  /** @internal Use load(). @param {WebAssembly.Instance} instance */
  constructor(instance) {
    const m = new Machine(instance);
    this.#m = m;
    /** The module's exports, for a call this binding does not wrap. */
    this.raw = m.x;
    /** The module's memory (fixed size). */
    this.memory = m.memory;
    /** Library version of the core, e.g. "0.2.0". */
    this.version = m.cstring(m.x.frcw_version());
    /** The SPEC.md version the core implements, e.g. "2.2.0". */
    this.specVersion = m.cstring(m.x.frcw_spec_version());
    /**
     * The header's constants without the FRC_ prefix, as the module holds
     * them: LEVEL_COUNT (63), CLOCK_MAX_LEVEL (21), SEQUENCE_LENGTH,
     * LEVEL_NONE, MAX_STROKES, MAX_DIGITS, SYNC_LEVEL, SYNC_CYCLES, SYNC_DAYS,
     * UNIT_COUNT, RATE_COUNT, MEDIUM_COUNT, SCI_DIGITS, PREFIX_FACTORS_SIZE (429), GLYPH_UNIT, GLYPH_INK,
     * GLYPH_DOT_RADIUS, GLYPH_DOT_Y, FRAC_HALF, FRAC_QUARTER, US_PER_SECOND,
     * VERSION_MAJOR / MINOR / PATCH, PI (the core's float); as BigInt:
     * US_PER_DAY, INTERVAL_REFERENCE_MS, GREGORIAN_REFORM_MS.
     * (Enumerators are the exported enum objects; FRC_TIME_NONE is null.)
     */
    this.constants = freeze({
      ...Object.fromEntries(
        Object.entries(m.constants)
          .filter(([name]) => name.startsWith('FRC_') && name !== 'FRC_TIME_NONE' && !ENUM_MEMBERS.has(name))
          .map(([name, value]) => [name.slice(4), value]),
      ),
      PI: m.x.frcw_pi(),
    });
    /** Struct layouts as the module reports them (for tests and tools). */
    this.layout = m.layout;
    /** Solar Saros 141, the built-in catalogue (70 eclipses, 1613 .. 2857). */
    this.saros141 = new Catalogue(m, m.x.frcw_saros_141());
    /** The 2010-2028 interval of Saros 141, the one SPEC's tables use: { num, den } ms. */
    this.referenceInterval = freeze({ num: m.constants.FRC_INTERVAL_REFERENCE_MS, den: 1n });
    freeze(this);
  }

  /* ---- time -------------------------------------------------------------- */

  /** The present instant (millisecond grain: the platform clock's). */
  now() {
    return this.fromUnixMs(Date.now());
  }

  /** Unix milliseconds -> instant; null when it does not fit microseconds. */
  fromUnixMs(ms) {
    const m = this.#m;
    return m.time(m.x.frc_time_from_ms(i64(ms, 'ms')));
  }

  /** Unix seconds (a whole number) -> instant; null when it does not fit. */
  fromUnixSeconds(seconds) {
    const m = this.#m;
    return m.time(m.x.frc_time_from_s(i64(seconds, 'seconds')));
  }

  /** A JavaScript Date -> instant. */
  fromDate(date) {
    const ms = date instanceof Date ? date.getTime() : NaN;
    if (!Number.isFinite(ms)) throw argError('date', date, 'a valid Date');
    return this.fromUnixMs(ms);
  }

  /**
   * An instant -> JavaScript Date, for the platform's own APIs (time zone,
   * timers). A Date holds milliseconds: the microseconds are cut (floor).
   * This is a change of container, not clock arithmetic; for anything shown,
   * use civilFromTime / formatCivil.
   */
  toDate(t) {
    instant(t, 't');
    let ms = t / 1000n;
    if (t % 1000n < 0n) ms -= 1n; // BigInt division truncates; before 1970 that would round up
    return new Date(Number(ms));
  }

  /**
   * The local zone's UTC offset in seconds at `t`, from the platform (east
   * positive), ready for civilFromTime / formatCivil. Earth mode only.
   */
  utcOffsetSeconds(t) {
    return -this.toDate(t).getTimezoneOffset() * 60;
  }

  /* ---- catalogues -------------------------------------------------------- */

  /**
   * A catalogue from your own table of greatest-eclipse instants (Unix
   * MILLISECONDS, strictly increasing, at least 2). The anchor is chosen by
   * the rule of SPEC 7.2. The table is copied into the module and stays there
   * for the module's life: make a catalogue once and keep it.
   * @param {Iterable<bigint | number>} instantsMs
   * @param {number} [series] Saros series number, 0 if unnamed
   * @returns {Catalogue}
   */
  catalogue(instantsMs, series = 0) {
    const m = this.#m;
    const values = Array.from(instantsMs, (value, i) => i64(value, `instantsMs[${i}]`));
    const count = u16(values.length, 'instantsMs.length');
    u16(series, 'series');
    m.begin();
    const mark = m.x.frcw_keep_mark();
    const table = m.x.frcw_keep(8 * count);
    const descriptor = m.x.frcw_keep(m.S.catalogue.size);
    if (table === 0 || descriptor === 0) {
      m.x.frcw_keep_release(mark);
      throw new FractonicaError('FRC_ERR_BUFFER', HERE, 'no room left for another catalogue in the module');
    }
    values.forEach((value, i) => m.view.setBigInt64(table + 8 * i, value, true));
    const status = m.x.frc_catalogue_init(descriptor, table, count, series);
    if (status !== 0) {
      m.x.frcw_keep_release(mark);
      throw m.failure(status, 'frc_catalogue_init');
    }
    return new Catalogue(m, descriptor);
  }

  /* ---- hierarchy, names, units (SPEC 3, 15.1) ----------------------------- */

  /** How many level+1 cycles one cycle of `level` contains. */
  factor(level) {
    return this.#m.x.frc_factor(u8(level, 'level'));
  }

  /** Cycles of `level` inside one parent cycle; 0 for level 0. */
  siblings(level) {
    return this.#m.x.frc_siblings(u8(level, 'level'));
  }

  /** P(level) as a BigInt, or null when it does not fit 64 bits (level > 22): use formatPrefix. */
  prefix(level) {
    const value = BigInt.asUintN(64, this.#m.x.frc_prefix(u8(level, 'level')));
    return value === 0n ? null : value;
  }

  /** P(level) as an exact decimal string, any level 0..63. */
  formatPrefix(level) {
    const m = this.#m;
    m.begin();
    return m.text('frc_format_prefix', (buf, size) => m.x.frc_format_prefix(u8(level, 'level'), buf, size));
  }

  /** LevelKind of a level: MAJOR, UNIT, BETWEEN or SUB. */
  levelKind(level) {
    return this.#m.x.frc_level_kind(u8(level, 'level'));
  }

  /** Greek name of a level: "α" .. "ω", "α1" .. */
  formatLevelName(level) {
    const m = this.#m;
    m.begin();
    return m.text('frc_format_level_name', (buf, size) => m.x.frc_format_level_name(u8(level, 'level'), buf, size));
  }

  /** The letter's word: "Alpha" .. "Omega", "Alpha1" .. */
  formatLevelWord(level) {
    const m = this.#m;
    m.begin();
    return m.text('frc_format_level_word', (buf, size) => m.x.frc_format_level_word(u8(level, 'level'), buf, size));
  }

  /** Level of a Unit (0 1 2 3 4 6 8 10 12), or null when `unit` is not one. */
  unitLevel(unit) {
    const level = this.#m.x.frc_unit_level(i32(unit, 'unit'));
    return level === this.#m.constants.FRC_LEVEL_NONE ? null : level;
  }

  /** The Unit that sits on `level`, or null when the level is not a unit. */
  unitOfLevel(level) {
    const unit = this.#m.x.frc_unit_of_level(u8(level, 'level'));
    return unit < 0 ? null : unit;
  }

  /** Exact length of a unit in Blinks (BigInt); 0n when `unit` is not a Unit. */
  unitBlinks(unit) {
    return BigInt.asUintN(64, this.#m.x.frc_unit_blinks(i32(unit, 'unit')));
  }

  /** How many of the next finer unit make one of this unit (0 for the Blink). */
  unitParts(unit) {
    return this.#m.x.frc_unit_parts(i32(unit, 'unit'));
  }

  /** "η" */
  formatUnitSymbol(unit) {
    const m = this.#m;
    m.begin();
    return m.text('frc_format_unit_symbol', (buf, size) => m.x.frc_format_unit_symbol(i32(unit, 'unit'), buf, size));
  }

  /** "Helion", or "Helions" when `plural`. */
  formatUnitName(unit, plural = false) {
    const m = this.#m;
    m.begin();
    return m.text('frc_format_unit_name', (buf, size) => m.x.frc_format_unit_name(i32(unit, 'unit'), flag(plural), buf, size));
  }

  /** "Peak" "Node" "Valley" "End"; lowercase when `lower`. */
  formatQuarter(quarter, lower = false) {
    const m = this.#m;
    m.begin();
    return m.text('frc_format_quarter', (buf, size) => m.x.frc_format_quarter(i32(quarter, 'quarter'), flag(lower), buf, size));
  }

  /** A Catalogue position as a Number (display only). */
  positionToDouble(position) {
    const m = this.#m;
    m.begin();
    return m.x.frc_position_to_double(writePosition(m, position));
  }

  /** A frc_frac_t (the `phase` of a cycle or sync) as a Number in [0, 1). */
  fracToDouble(phase) {
    return this.#m.fraction(u32(phase, 'phase'));
  }

  /**
   * A Number in [0, 1] as a frc_frac_t: floor(fraction × 2^32), clamped to 0 .. 2^32 − 1 (so 1 is the last
   * phase of a cycle). The inverse of fracToDouble, exact for every value it returns. A change of container,
   * like toDate, for turning a place on screen into the phase timeAtPhase / timeAtSyncPhase take; the core
   * has no such function because it never holds a fraction as a float.
   */
  fracFromDouble(fraction) {
    if (typeof fraction !== 'number' || Number.isNaN(fraction)) throw argError('fraction', fraction, 'a number in [0, 1]');
    const scaled = Math.floor(fraction * 4294967296);
    return Math.min(0xffffffff, Math.max(0, scaled));
  }

  /* ---- glyphs and odometer (SPEC 4, 5, 9) --------------------------------- */

  /** M, the extreme value of a glyph of `strokes` strokes; 0 if invalid. */
  glyphExtreme(strokes) {
    return this.#m.x.frc_glyph_extreme(u8(strokes, 'strokes'));
  }

  /** 4M, the number of states of one glyph. */
  glyphStates(strokes) {
    return this.#m.x.frc_glyph_states(u8(strokes, 'strokes'));
  }

  /** Decode state `index` (taken mod 4M): { index, value, derivative, dotted, strokes, trits }. */
  glyphFromIndex(index, strokes) {
    const m = this.#m;
    m.begin();
    const out = m.alloc(m.S.glyph.size);
    m.ok(m.x.frc_glyph_from_index(u16(index, 'index'), u8(strokes, 'strokes'), out), 'frc_glyph_from_index');
    return readGlyph(m, out);
  }

  /** The same state in the descending family. */
  glyphIndexDescending(index, strokes) {
    return this.#m.x.frc_glyph_index_descending(u16(index, 'index'), u8(strokes, 'strokes'));
  }

  /** Glyph state of a bare fraction of a cycle (`phase` is a frc_frac_t). */
  glyphIndexOfPhase(phase, strokes) {
    return this.#m.x.frc_glyph_index_of_phase(u32(phase, 'phase'), u8(strokes, 'strokes'));
  }

  /**
   * The glyph state a cycle shows at the threshold that ends `quarter`: PEAK state M, NODE 2M, VALLEY 3M,
   * END 0 (the next cycle's start). With 2 strokes: 4, 8, 12, 0.
   */
  glyphAtQuarter(quarter, strokes) {
    const m = this.#m;
    m.begin();
    const out = m.alloc(m.S.glyph.size);
    m.ok(m.x.frc_glyph_at_quarter(i32(quarter, 'quarter'), u8(strokes, 'strokes'), out), 'frc_glyph_at_quarter');
    return readGlyph(m, out);
  }

  /** Odometer digits of a bare fraction; nextChange is null. */
  odometerOfPhase(phase, strokes, digits) {
    const m = this.#m;
    m.begin();
    const out = m.alloc(m.S.odometer.size);
    m.ok(m.x.frc_odometer_of_phase(u32(phase, 'phase'), u8(strokes, 'strokes'), u8(digits, 'digits'), out), 'frc_odometer_of_phase');
    return readOdometer(m, out);
  }

  /**
   * The outline of a glyph as the core lists it: stem, one stroke per trit,
   * the dot. Coordinates are hundredths of a design unit (constants.GLYPH_UNIT
   * per unit), x right, y down, origin at the top of the stem.
   * @returns {ReadonlyArray<{ op: number, points: ReadonlyArray<number> }>}
   *   op is a PathOp: MOVE [x, y], LINE [x, y], CUBIC [c1x, c1y, c2x, c2y, x, y],
   *   DOT [cx, cy, radius] (a filled circle). Empty for a glyph that cannot be drawn.
   */
  glyphPath(glyph) {
    const m = this.#m;
    m.begin();
    const pointer = writeGlyph(m, glyph);
    const record = m.constants.FRCW_PATH_RECORD;
    const max = 64; // the widest glyph has 26 operations
    const out = m.alloc(max * record * 2);
    const count = m.x.frcw_glyph_path(pointer, out, max);
    if (count > max) throw new FractonicaError('FRC_ERR_BUFFER', 'frc_glyph_path', `${count} operations`);
    const ops = [];
    for (let i = 0; i < count; i++) {
      const at = out + i * record * 2;
      const n = m.view.getInt16(at + 2, true);
      const points = [];
      for (let k = 0; k < n; k++) points.push(m.view.getInt16(at + 4 + 2 * k, true));
      ops.push(freeze({ op: m.view.getInt16(at, true), points: freeze(points) }));
    }
    return freeze(ops);
  }

  /**
   * The same outline flattened to straight segments [x0, y0, x1, y1], each
   * cubic cut into `curveSteps` pieces (1..32). The dot is not included.
   */
  glyphSegments(glyph, curveSteps = 8) {
    const m = this.#m;
    m.begin();
    const pointer = writeGlyph(m, glyph);
    const record = m.constants.FRCW_SEGMENT_RECORD;
    const max = 512; // 5 strokes of 2 cubics of 32 pieces, plus the stem: 325
    const out = m.alloc(max * record * 2);
    const count = m.x.frcw_glyph_segments(pointer, u8(curveSteps, 'curveSteps'), out, max);
    if (count > max) throw new FractonicaError('FRC_ERR_BUFFER', 'frc_glyph_segments', `${count} segments`);
    const segments = [];
    for (let i = 0; i < count; i++) {
      const at = out + i * record * 2;
      segments.push(freeze([0, 2, 4, 6].map((k) => m.view.getInt16(at + k, true))));
    }
    return freeze(segments);
  }

  /** Ink bounds of any glyph of `strokes` strokes: { minX, minY, maxX, maxY } in glyph coordinates. */
  glyphBounds(strokes) {
    const m = this.#m;
    m.begin();
    const out = m.alloc(8);
    m.x.frc_glyph_bounds(u8(strokes, 'strokes'), out, out + 2, out + 4, out + 6);
    return freeze({
      minX: m.view.getInt16(out, true),
      minY: m.view.getInt16(out + 2, true),
      maxX: m.view.getInt16(out + 4, true),
      maxY: m.view.getInt16(out + 6, true),
    });
  }

  /**
   * A glyph's outline as SVG path data, placed and scaled for drawing.
   * This is drawing-space transformation only: the outline is the core's.
   * @param {object} glyph
   * @param {{ scale?: number, x?: number, y?: number }} [placement]
   *   scale = pixels per design unit (DESIGN.md's "u"); (x, y) = where the top
   *   of the stem goes.
   * @returns {{ stroke: string, fill: string, lineWidth: number }}
   *   `stroke`: stem and strokes, to be stroked with `lineWidth`, round caps
   *   and joins. `fill`: the dot ("" when the glyph has none), to be filled.
   */
  glyphSvgPath(glyph, { scale = 1, x = 0, y = 0 } = {}) {
    const unit = this.#m.constants.FRC_GLYPH_UNIT;
    const px = (value) => round3(x + (value * scale) / unit);
    const py = (value) => round3(y + (value * scale) / unit);
    let stroke = '';
    let fill = '';
    for (const { op, points: p } of this.glyphPath(glyph)) {
      if (op === PathOp.MOVE) stroke += `M${px(p[0])} ${py(p[1])}`;
      else if (op === PathOp.LINE) stroke += `L${px(p[0])} ${py(p[1])}`;
      else if (op === PathOp.CUBIC) stroke += `C${px(p[0])} ${py(p[1])} ${px(p[2])} ${py(p[3])} ${px(p[4])} ${py(p[5])}`;
      else if (op === PathOp.DOT) {
        const r = round3((p[2] * scale) / unit);
        // a circle as two half-turns, so it works as plain path data
        fill += `M${round3(px(p[0]) - r)} ${py(p[1])}a${r} ${r} 0 1 0 ${round3(2 * r)} 0a${r} ${r} 0 1 0 ${round3(-2 * r)} 0Z`;
      }
    }
    return freeze({ stroke, fill, lineWidth: (this.#m.constants.FRC_GLYPH_INK * scale) / unit });
  }

  /**
   * The same as Path2D objects for a canvas (browser only):
   *   ctx.lineWidth = g.lineWidth; ctx.lineCap = ctx.lineJoin = 'round';
   *   ctx.stroke(g.stroke); if (g.fill) ctx.fill(g.fill);
   * @returns {{ stroke: Path2D, fill: Path2D | null, lineWidth: number }}
   */
  glyphPath2D(glyph, placement) {
    if (typeof Path2D === 'undefined') {
      throw new FractonicaError('FRC_ERR_ARG', HERE, 'Path2D is not available here: use glyphSvgPath');
    }
    const { stroke, fill, lineWidth } = this.glyphSvgPath(glyph, placement);
    return freeze({ stroke: new Path2D(stroke), fill: fill ? new Path2D(fill) : null, lineWidth });
  }

  /* ---- Pentads and notation (SPEC 7.5, 15) -------------------------------- */

  /** "Pentad II" / "⬠II" / "P2"; with the Helion: "Pentad II, 3rd Helion" / "⬠II·3" / "P2.3". */
  formatPentad(pentad, form = PentadForm.FULL, withHelion = false) {
    const m = this.#m;
    m.begin();
    const pointer = writePentad(m, pentad);
    return m.text('frc_format_pentad', (buf, size) => m.x.frc_format_pentad(pointer, i32(form, 'form'), flag(withHelion), buf, size));
  }

  /**
   * Write a date. `finest` is the last unit shown (Unit.DELTA .. Unit.BLINK).
   * DateForm.LETTERS down to Unit.BLINK is the stamp.
   */
  formatDate(date, form = DateForm.FULL, finest = Unit.BLINK) {
    const m = this.#m;
    m.begin();
    const pointer = writeDate(m, date);
    return m.text('frc_format_date', (buf, size) => m.x.frc_format_date(pointer, i32(form, 'form'), i32(finest, 'finest'), buf, size));
  }

  /** One term of the stamp: "α#6", "ε#5", "34η", "29ι", "3ν". The nine terms joined by spaces are the stamp. */
  formatDateTerm(date, unit) {
    const m = this.#m;
    m.begin();
    const pointer = writeDate(m, date);
    return m.text('frc_format_date_term', (buf, size) => m.x.frc_format_date_term(pointer, i32(unit, 'unit'), buf, size));
  }

  /**
   * Read a date back from any form formatDate writes, and from ASCII
   * shorthand ("a#6 b#4 g#9 d#3 e#5 34h 29i"). A short form takes its missing
   * coarse parts from `context` (null: a full date is required).
   * @returns {{ date: object, finest: number }} `finest` is the finest Unit written.
   * @throws FractonicaError FRC_ERR_PARSE on text that is not a date.
   */
  parseDate(text, context = null) {
    const m = this.#m;
    m.begin();
    const source = m.putString(text, 'text');
    const contextPointer = context === null ? 0 : writeDate(m, context, 'context');
    const out = m.alloc(m.S.date.size);
    const finest = m.alloc(4);
    m.ok(m.x.frc_parse_date(source.pointer, contextPointer, out, finest), 'frc_parse_date');
    return freeze({ date: readDate(m, out), finest: m.view.getInt32(finest, true) });
  }

  /** Fracton ordinal: "Monofracton" (1) .. "Icosafracton" (20); beyond that "#25". */
  formatOrdinal(n) {
    const m = this.#m;
    m.begin();
    return m.text('frc_format_ordinal', (buf, size) => m.x.frc_format_ordinal(u16(n, 'n'), buf, size));
  }

  /** The name of cycle `cycle` (global index) of `level` <= 21: "Delta Trifracton", "ε#2", "ε#2 5η 9ι"; short: "δ#3", "9ι". */
  formatCycleName(level, cycle, shortForm = false) {
    const m = this.#m;
    m.begin();
    return m.text('frc_format_cycle_name', (buf, size) =>
      m.x.frc_format_cycle_name(u8(level, 'level'), u64(cycle, 'cycle'), flag(shortForm), buf, size),
    );
  }

  /* ---- spans and rates (SPEC 15.4, 15.5) ---------------------------------- */

  /** Nominal length of one cycle of `level` (0..62) as a span; exact down to the Blink. */
  spanOfLevel(level) {
    const m = this.#m;
    m.begin();
    const out = m.alloc(m.S.span.size);
    m.ok(m.x.frc_span_of_level(u8(level, 'level'), out), 'frc_span_of_level');
    return readSpan(m, out);
  }

  /**
   * A span as counts over the unit ladder: up to `maxParts` non-zero parts
   * [{ unit, count }], or with `keepZeros` the next `maxParts` consecutive units.
   */
  spanParts(span, maxParts = this.#m.constants.FRC_UNIT_COUNT, keepZeros = false) {
    const m = this.#m;
    m.begin();
    const pointer = writeSpan(m, span);
    const s = m.S.spanPart;
    int(maxParts, 0, m.constants.FRC_UNIT_COUNT, 'maxParts');
    const out = m.alloc(m.constants.FRC_UNIT_COUNT * s.size);
    const count = m.x.frc_span_parts(pointer, maxParts, flag(keepZeros), out);
    const parts = [];
    for (let i = 0; i < count; i++) {
      const at = out + i * s.size;
      parts.push(freeze({ unit: m.get(at, s.unit), count: m.get(at, s.count) }));
    }
    return freeze(parts);
  }

  /** Write a span: "6ι 43λ", "−2ε 5η", "2.6ν". `maxParts` 0 is the default precision, 2. */
  formatSpan(span, maxParts = 0) {
    const m = this.#m;
    m.begin();
    const pointer = writeSpan(m, span);
    return m.text('frc_format_span', (buf, size) => m.x.frc_format_span(pointer, u8(maxParts, 'maxParts'), buf, size));
  }

  /** A span with its direction always said: "+6ι 43λ", "−20ι 21λ"; "0ν" and "<0.001ν" have no sign. */
  formatSpanSigned(span, maxParts = 0) {
    const m = this.#m;
    m.begin();
    const pointer = writeSpan(m, span);
    return m.text('frc_format_span_signed', (buf, size) => m.x.frc_format_span_signed(pointer, u8(maxParts, 'maxParts'), buf, size));
  }

  /** A span in whole units of one Unit, cut toward zero: "−6 236λ" (never "−0λ"). */
  formatSpanInUnit(span, unit) {
    const m = this.#m;
    m.begin();
    const pointer = writeSpan(m, span);
    return m.text('frc_format_span_in_unit', (buf, size) => m.x.frc_format_span_in_unit(pointer, i32(unit, 'unit'), buf, size));
  }

  /** Time-lapse preset `i` (0 = real time .. constants.RATE_COUNT - 1): { unit, count, factor }. */
  ratePreset(i) {
    const m = this.#m;
    m.begin();
    const out = m.alloc(m.S.rate.size);
    m.ok(m.x.frc_rate_preset(u8(i, 'i'), out), 'frc_rate_preset');
    return readRate(m, out);
  }

  /** "real time", "4ι per Blink". */
  formatRate(rate) {
    const m = this.#m;
    m.begin();
    const pointer = writeRate(m, rate);
    return m.text('frc_format_rate', (buf, size) => m.x.frc_format_rate(pointer, buf, size));
  }

  /** The exact rate of a level in cycles per Blink, { num, den }. FRC_ERR_OVERFLOW above level 35. */
  levelPerBlink(level) {
    const m = this.#m;
    m.begin();
    const out = m.alloc(16);
    m.ok(m.x.frc_level_per_blink(u8(level, 'level'), out, out + 8), 'frc_level_per_blink');
    return freeze({ num: m.view.getBigUint64(out, true), den: m.view.getBigUint64(out + 8, true) });
  }

  /** "7 pB", "34.2 pB", "1 per 58 500 Blinks" for the ratio num/den. */
  formatPerBlink(num, den) {
    const m = this.#m;
    m.begin();
    return m.text('frc_format_per_blink', (buf, size) => m.x.frc_format_per_blink(u64(num, 'num'), u64(den, 'den'), buf, size));
  }

  /* ---- pure wording: static facts without an Earth unit ------------------- */

  /** A whole number grouped in threes with U+202F: "58 500". */
  formatCount(n) {
    const m = this.#m;
    m.begin();
    return m.text('frc_format_count', (buf, size) => m.x.frc_format_count(u64(n, 'n'), buf, size));
  }

  /** A signed whole number grouped the same way, U+2212 before a negative one: "4 820", "−3", "0". */
  formatCountSigned(n) {
    const m = this.#m;
    m.begin();
    return m.text('frc_format_count_signed', (buf, size) => m.x.frc_format_count_signed(i64(n, 'n'), buf, size));
  }

  /** "light": the word formatLightSpan appends, alone, for a client that sets it in its own style. */
  formatLightWord() {
    const m = this.#m;
    m.begin();
    return m.text('frc_format_light_word', (buf, size) => m.x.frc_format_light_word(buf, size));
  }

  /** What a level is (a LevelKind): "major", "unit", "between", "sub-Blink". */
  formatLevelKind(kind) {
    const m = this.#m;
    m.begin();
    return m.text('frc_format_level_kind', (buf, size) => m.x.frc_format_level_kind(i32(kind, 'kind'), buf, size));
  }

  /** Which of its siblings a cycle is, from one: "8 of 9" (local 7 of 9). */
  formatCyclePlace(cycle) {
    const m = this.#m;
    m.begin();
    const pointer = writeCycle(m, cycle);
    return m.text('frc_format_cycle_place', (buf, size) => m.x.frc_format_cycle_place(pointer, buf, size));
  }

  /** What one cycle of a level is made of, in levels: "9 θ" (level 6). FRC_ERR_ARG for level 62. */
  formatLevelChildren(level) {
    const m = this.#m;
    m.begin();
    return m.text('frc_format_level_children', (buf, size) => m.x.frc_format_level_children(u8(level, 'level'), buf, size));
  }

  /** How many of a level its parent holds: "11 in ζ" (level 6). FRC_ERR_ARG for level 0. */
  formatLevelInParent(level) {
    const m = this.#m;
    m.begin();
    return m.text('frc_format_level_in_parent', (buf, size) => m.x.frc_format_level_in_parent(u8(level, 'level'), buf, size));
  }

  /** How many of a Unit make the next coarser unit: "77 in ε" (the Helion). FRC_ERR_ARG for the Alpha. */
  formatUnitInParent(unit) {
    const m = this.#m;
    m.begin();
    return m.text('frc_format_unit_in_parent', (buf, size) => m.x.frc_format_unit_in_parent(i32(unit, 'unit'), buf, size));
  }

  /** P(level) and its factors: "125 125 = 5 · 13 · 5 · 5 · 7 · 11" (level 6), "1" for level 0; every level in full. */
  formatPrefixFactors(level) {
    const m = this.#m;
    m.begin();
    return m.text('frc_format_prefix_factors', (buf, size) => m.x.frc_format_prefix_factors(u8(level, 'level'), buf, size), m.constants.FRC_PREFIX_FACTORS_SIZE);
  }

  /** How many of `unit` one cycle of `level` holds: "58 500ν", "36ι", "11η". */
  formatLevelInUnit(level, unit) {
    const m = this.#m;
    m.begin();
    return m.text('frc_format_level_in_unit', (buf, size) => m.x.frc_format_level_in_unit(u8(level, 'level'), i32(unit, 'unit'), buf, size));
  }

  /**
   * The rate of a rung in cycles per Blink, any level 0..62: "2 772 pB",
   * "1.420 × 10¹⁴ pB" (digits 4), "1 per 58 500 Blinks". `digits` 0 writes a
   * whole rate in full; 2..9 switch to a power of ten from a million up.
   */
  formatLevelRate(level, digits = 0) {
    const m = this.#m;
    m.begin();
    return m.text('frc_format_level_rate', (buf, size) => m.x.frc_format_level_rate(u8(level, 'level'), u8(digits, 'digits'), buf, size));
  }

  /**
   * A length said without metres: the span light in vacuum needs to cover
   * what a wave of `speed` covers in one period of `level`: "24ι 1λ",
   * "6.15χ"; with `withWord` "24ι 1λ light".
   * @param {number} level
   * @param {{ num: bigint | number, den: bigint | number }} speed e.g. mediumSpeed(Medium.AIR)
   */
  formatLightSpan(level, speed, withWord = false) {
    const m = this.#m;
    m.begin();
    const speedPointer = writeRatio(m, m.S.speed, speed, 'speed');
    return m.text('frc_format_light_span', (buf, size) =>
      m.x.frcw_format_light_span(u8(level, 'level'), speedPointer, flag(withWord), buf, size),
    );
  }

  /* ---- spectral ladder (SPEC 16) ------------------------------------------ */

  /** A nominal scale from any Alpha length in milliseconds: { num, den } ms per Saros. */
  intervalOfAlphaMs(alphaMs) {
    const m = this.#m;
    m.begin();
    const out = m.alloc(m.S.interval.size);
    m.x.frcw_interval_of_alpha_ms(u64(alphaMs, 'alphaMs'), out);
    return readRatio(m, m.S.interval, out);
  }

  /** The period of a level in seconds: { mantissa, exp10 }, 17 exact digits. */
  period(level, interval) {
    const m = this.#m;
    m.begin();
    const intervalPointer = writeRatio(m, m.S.interval, interval, 'interval');
    const out = m.alloc(m.S.sci.size);
    m.ok(m.x.frcw_period(u8(level, 'level'), intervalPointer, out), 'frc_period');
    return readSci(m, out);
  }

  /** The frequency of a level in hertz: { mantissa, exp10 }. */
  frequency(level, interval) {
    const m = this.#m;
    m.begin();
    const intervalPointer = writeRatio(m, m.S.interval, interval, 'interval');
    const out = m.alloc(m.S.sci.size);
    m.ok(m.x.frcw_frequency(u8(level, 'level'), intervalPointer, out), 'frc_frequency');
    return readSci(m, out);
  }

  /** The distance covered in one period at `speed`, in metres: { mantissa, exp10 }. */
  length(level, interval, speed) {
    const m = this.#m;
    m.begin();
    const intervalPointer = writeRatio(m, m.S.interval, interval, 'interval');
    const speedPointer = writeRatio(m, m.S.speed, speed, 'speed');
    const out = m.alloc(m.S.sci.size);
    m.ok(m.x.frcw_length(u8(level, 'level'), intervalPointer, speedPointer, out), 'frc_length');
    return readSci(m, out);
  }

  /** The period in seconds as the nearest Number; 0 on a bad level or interval. */
  periodSeconds(level, interval) {
    const m = this.#m;
    m.begin();
    return m.x.frcw_period_seconds(u8(level, 'level'), writeRatio(m, m.S.interval, interval, 'interval'));
  }

  /** The frequency in hertz as the nearest Number. */
  frequencyHz(level, interval) {
    const m = this.#m;
    m.begin();
    return m.x.frcw_frequency_hz(u8(level, 'level'), writeRatio(m, m.S.interval, interval, 'interval'));
  }

  /** The length in metres as the nearest Number. */
  lengthMetres(level, interval, speed) {
    const m = this.#m;
    m.begin();
    const intervalPointer = writeRatio(m, m.S.interval, interval, 'interval');
    return m.x.frcw_length_metres(u8(level, 'level'), intervalPointer, writeRatio(m, m.S.speed, speed, 'speed'));
  }

  /** A { mantissa, exp10 } value as the nearest Number. */
  sciToDouble(value) {
    const m = this.#m;
    m.begin();
    return m.x.frc_sci_to_double(writeSci(m, value));
  }

  /** The speed of a Medium, { num, den } metres per second; { 0n, 0n } when it is not one. */
  mediumSpeed(medium) {
    const m = this.#m;
    m.begin();
    const out = m.alloc(m.S.speed.size);
    m.x.frcw_medium_speed(i32(medium, 'medium'), out);
    return readRatio(m, m.S.speed, out);
  }

  /** "vacuum" */
  formatMediumId(medium) {
    const m = this.#m;
    m.begin();
    return m.text('frc_format_medium_id', (buf, size) => m.x.frc_format_medium_id(i32(medium, 'medium'), buf, size));
  }

  /** "Light in vacuum" */
  formatMediumName(medium) {
    const m = this.#m;
    m.begin();
    return m.text('frc_format_medium_name', (buf, size) => m.x.frc_format_medium_name(i32(medium, 'medium'), buf, size));
  }

  /** "Vacuum + solid" */
  formatMediumPhase(medium) {
    const m = this.#m;
    m.begin();
    return m.text('frc_format_medium_phase', (buf, size) => m.x.frc_format_medium_phase(i32(medium, 'medium'), buf, size));
  }

  /** The Band of a level on the scale `interval`. */
  band(level, interval) {
    const m = this.#m;
    m.begin();
    return m.x.frcw_band(u8(level, 'level'), writeRatio(m, m.S.interval, interval, 'interval'));
  }

  /** "audible", "gamma ray"; "no band" for Band.NONE. */
  formatBand(band) {
    const m = this.#m;
    m.begin();
    return m.text('frc_format_band', (buf, size) => m.x.frc_format_band(i32(band, 'band'), buf, size));
  }

  /**
   * The edges of a band in hertz as SPEC 16.2 tabulates them, the very ones `band` compares with:
   * { low, high } as Sci, `low` inside the band, `high` where the next begins. FRC_ERR_ARG for Band.NONE.
   */
  bandEdges(band) {
    const m = this.#m;
    m.begin();
    const low = m.alloc(m.S.sci.size);
    const high = m.alloc(m.S.sci.size);
    m.ok(m.x.frc_band_edges(i32(band, 'band'), low, high), 'frc_band_edges');
    return freeze({ low: readSci(m, low), high: readSci(m, high) });
  }

  /** Timer ticks of one period at `rate` ticks per second (BigInt). FRC_ERR_REFUSED under half a tick. */
  deviceTicks(level, interval, rate) {
    const m = this.#m;
    m.begin();
    const intervalPointer = writeRatio(m, m.S.interval, interval, 'interval');
    const out = m.alloc(8);
    m.ok(m.x.frcw_device_ticks(u8(level, 'level'), intervalPointer, u64(rate, 'rate'), out), 'frc_device_ticks');
    return m.view.getBigUint64(out, true);
  }

  /** Phase increment per sample for a `bits`-bit accumulator at `rate` samples per second (BigInt). */
  deviceStep(level, interval, rate, bits) {
    const m = this.#m;
    m.begin();
    const intervalPointer = writeRatio(m, m.S.interval, interval, 'interval');
    const out = m.alloc(8);
    m.ok(m.x.frcw_device_step(u8(level, 'level'), intervalPointer, u64(rate, 'rate'), u8(bits, 'bits'), out), 'frc_device_step');
    return m.view.getBigUint64(out, true);
  }

  /** A { mantissa, exp10 } value as SPEC tabulates it: "310.9 ms", "2.454 × 10⁻²⁵ s". `digits` 0 means 4. */
  formatQuantity(value, quantity, digits = 0) {
    const m = this.#m;
    m.begin();
    const pointer = writeSci(m, value);
    return m.text('frc_format_quantity', (buf, size) => m.x.frc_format_quantity(pointer, i32(quantity, 'quantity'), u8(digits, 'digits'), buf, size));
  }

  /** The period of a level, formatted: "5.052 h". */
  formatPeriod(level, interval, digits = 0) {
    const m = this.#m;
    m.begin();
    const intervalPointer = writeRatio(m, m.S.interval, interval, 'interval');
    return m.text('frc_format_period', (buf, size) => m.x.frcw_format_period(u8(level, 'level'), intervalPointer, u8(digits, 'digits'), buf, size));
  }

  /** The frequency of a level, formatted: "54.98 µHz". */
  formatFrequency(level, interval, digits = 0) {
    const m = this.#m;
    m.begin();
    const intervalPointer = writeRatio(m, m.S.interval, interval, 'interval');
    return m.text('frc_format_frequency', (buf, size) => m.x.frcw_format_frequency(u8(level, 'level'), intervalPointer, u8(digits, 'digits'), buf, size));
  }

  /** The length of a level at `speed`, formatted: "5.453 Tm". */
  formatLength(level, interval, speed, digits = 0) {
    const m = this.#m;
    m.begin();
    const intervalPointer = writeRatio(m, m.S.interval, interval, 'interval');
    const speedPointer = writeRatio(m, m.S.speed, speed, 'speed');
    return m.text('frc_format_length', (buf, size) =>
      m.x.frcw_format_length(u8(level, 'level'), intervalPointer, speedPointer, u8(digits, 'digits'), buf, size),
    );
  }

  /* ---- arc geometry: nested alternating circular arcs ---------------------- */

  /**
   * Child `local` (0..m-1) of the carrier `parent` divided in `m`; `odd`
   * selects the bulge side (the parity of the child's global half-cycle
   * index). An arc is { cx, cy, radius, start, sweep }: angles in radians,
   * measured like atan2 with y DOWN; a negative sweep is counter-clockwise.
   * The empty arc (all 0) when the construction does not exist.
   */
  arcChild(parent, m, local, odd) {
    const machine = this.#m;
    machine.begin();
    const parentPointer = writeArc(machine, parent, 'parent');
    const out = machine.alloc(machine.S.arc.size);
    machine.x.frcw_arc_child(parentPointer, u8(m, 'm'), u8(local, 'local'), flag(odd), out);
    return readArc(machine, out);
  }

  /** The point { x, y } at fraction `t` (0..1) along an arc. */
  arcPoint(arc, t) {
    const m = this.#m;
    m.begin();
    const pointer = writeArc(m, arc);
    const out = m.alloc(8);
    m.x.frc_arc_point(pointer, float(t, 't'), out, out + 4);
    return freeze({ x: m.view.getFloat32(out, true), y: m.view.getFloat32(out + 4, true) });
  }

  /** Level-0 "wave" root: half-cycle `half` is a unit semicircle centred at (2*half + 1, 0). */
  arcWaveRoot(half) {
    const m = this.#m;
    m.begin();
    const out = m.alloc(m.S.arc.size);
    m.x.frcw_arc_wave_root(u32(half, 'half'), out);
    return readArc(m, out);
  }

  /** The core's sine and cosine (float32, |error| < 1e-6): what the arcs are built with. */
  sin(radians) {
    return this.#m.x.frc_sin(float(radians, 'radians'));
  }

  cos(radians) {
    return this.#m.x.frc_cos(float(radians, 'radians'));
  }

  /**
   * Trace the part of `arc` between the fractions `from` and `to` (0..1) onto
   * a canvas path (CanvasRenderingContext2D or Path2D). This is how "elapsed"
   * and "to come" are split: traceArc(ctx, arc, 0, f) and traceArc(ctx, arc, f, 1).
   * With `move` (the default) the pen is lifted to the first point, so the
   * piece is its own sub-path; without it the piece continues the current one.
   */
  traceArc(path, arc, from = 0, to = 1, move = true) {
    if (move) {
      const first = this.arcPoint(arc, from);
      path.moveTo(first.x, first.y);
    }
    const turned = arc.sweep * (to - from);
    path.arc(arc.cx, arc.cy, arc.radius, arc.start + arc.sweep * from, arc.start + arc.sweep * to, turned < 0);
  }

  /**
   * The same piece of an arc as SVG path data ("M x y A r r 0 0 f x y ...").
   * The end points are the core's (arcPoint); a long piece is cut so that no
   * SVG arc turns half a circle or more.
   */
  arcSvgPath(arc, from = 0, to = 1) {
    const turned = arc.sweep * (to - from);
    const pieces = Math.max(1, Math.ceil(Math.abs(turned) / 3)); // 3 rad < half a turn
    const sweepFlag = turned < 0 ? 0 : 1;
    const r = round3(arc.radius);
    const first = this.arcPoint(arc, from);
    let d = `M${round3(first.x)} ${round3(first.y)}`;
    for (let i = 1; i <= pieces; i++) {
      const point = this.arcPoint(arc, from + ((to - from) * i) / pieces);
      d += `A${r} ${r} 0 0 ${sweepFlag} ${round3(point.x)} ${round3(point.y)}`;
    }
    return d;
  }

  /* ---- civil time: the Gregorian translation (Earth mode) ------------------ */

  /** Civil fields of `t` at a fixed UTC offset in seconds: { year, month, day, hour, minute, second, weekday (0 = Monday), microsecond }. */
  civilFromTime(t, utcOffsetSeconds = 0) {
    const m = this.#m;
    m.begin();
    const out = m.alloc(m.S.civil.size);
    m.x.frc_civil_from_time(instant(t, 't'), i32(utcOffsetSeconds, 'utcOffsetSeconds'), out);
    return readCivil(m, out);
  }

  /** The instant of civil fields at a fixed UTC offset (fields may overflow), or null when it does not fit. */
  timeFromCivil(civil, utcOffsetSeconds = 0) {
    const m = this.#m;
    m.begin();
    return m.time(m.x.frc_time_from_civil(writeCivil(m, civil), i32(utcOffsetSeconds, 'utcOffsetSeconds')));
  }

  /** "2026-10-08T12:00:00.000Z"; a non-zero offset writes "+02:00". */
  formatCivil(civil, utcOffsetSeconds = 0) {
    const m = this.#m;
    m.begin();
    const pointer = writeCivil(m, civil);
    return m.text('frc_format_civil', (buf, size) => m.x.frc_format_civil(pointer, i32(utcOffsetSeconds, 'utcOffsetSeconds'), buf, size));
  }

  /**
   * Civil fields in an Earth wording (a CivilForm): "THU 8 OCT 2026 · 12:00:00", "12:56", "9 OCT 01:34",
   * "3 FEB 2028", "UTC+5:30" ... The weekday is computed from the date. `utcOffsetSeconds` is read by
   * CivilForm.OFFSET only, for which `civil` may be null. FRC_ERR_ARG for fields that do not exist.
   */
  formatCivilText(civil, utcOffsetSeconds, form) {
    const m = this.#m;
    m.begin();
    const pointer = civil === null ? 0 : writeCivil(m, civil);
    return m.text('frc_format_civil_text', (buf, size) =>
      m.x.frc_format_civil_text(pointer, i32(utcOffsetSeconds, 'utcOffsetSeconds'), i32(form, 'form'), buf, size),
    );
  }

  /**
   * An Earth duration of `microseconds` (BigInt or a safe Number; signed): "23 min 53 s", "1 h 2 min",
   * "0.4 s". Rounded once, half up, to the finest of `maxParts` (0 means 2, at most 4) units, then worded.
   */
  formatDuration(microseconds, maxParts = 0) {
    const m = this.#m;
    m.begin();
    return m.text('frc_format_duration', (buf, size) => m.x.frc_format_duration(i64(microseconds, 'microseconds'), u8(maxParts, 'maxParts'), buf, size));
  }

  /**
   * Whether civil fields name a real moment: true, or false for a day the calendar does not have, a time of
   * day that does not exist, or a year outside ±290 000 (the core's FRC_ERR_RANGE).
   */
  civilValidate(civil) {
    const m = this.#m;
    m.begin();
    const code = m.x.frc_civil_validate(writeCivil(m, civil));
    if (code === m.constants.FRC_ERR_RANGE) return false;
    m.ok(code, 'frc_civil_validate');
    return true;
  }

  /**
   * Read an Earth date and time typed by a person: "2026-10-08", "8 OCT 2026 12:00", "THU 8 OCT 2026 ·
   * 12:00:00", "2026-10-08T14:00:00+02:00". @returns {{ civil: object, offset: number | null }} the fields
   * as written and the offset in seconds the text names (null when it names none).
   * @throws FractonicaError FRC_ERR_PARSE for text of another shape, FRC_ERR_RANGE for a day or time that
   *   does not exist ("31 FEB 2026").
   */
  parseCivil(text) {
    const m = this.#m;
    m.begin();
    const source = m.putString(text, 'text');
    const out = m.alloc(m.S.civil.size);
    const offset = m.alloc(4);
    const has = m.alloc(4);
    m.ok(m.x.frc_parse_civil(source.pointer, out, offset, has), 'frc_parse_civil');
    return freeze({ civil: readCivil(m, out), offset: m.view.getInt32(has, true) !== 0 ? m.view.getInt32(offset, true) : null });
  }

  /** SPEC 2.3, for building tables only: Gregorian fields of a Unix-ms value reread as a Julian date (BigInt ms). */
  julianFieldsToUnixMs(unixMs) {
    return this.#m.x.frc_julian_fields_to_unix_ms(i64(unixMs, 'unixMs'));
  }

  /* ---- text ---------------------------------------------------------------- */

  /** Any text of this library as plain ASCII ("α#6 34η" -> "a#6 34h", "−" -> "-", "⬠II·3" -> "PII.3"). */
  toAscii(text) {
    const m = this.#m;
    m.begin();
    const source = m.putString(text, 'text');
    // ASCII never takes more bytes than the UTF-8 it replaces, plus the "^" of a superscript run
    const room = source.length * 2 + 1;
    return m.text('frc_to_ascii', (buf, size) => m.x.frc_to_ascii(source.pointer, buf, size), room);
  }
}

/** Three decimals are below a tenth of a device pixel at any scale we draw. */
function round3(value) {
  return Math.round(value * 1000) / 1000;
}

/* ========================================================================== */
/* 7. Loading                                                                 */
/* ========================================================================== */

/** Where the module sits relative to this file: public/fractonica.wasm. */
const DEFAULT_URL = new URL('../fractonica.wasm', import.meta.url);

/**
 * Load the core.
 * @param {URL | string | BufferSource | WebAssembly.Module | Response | Promise<Response>} [source]
 *   Nothing: `../fractonica.wasm` beside this file (fetched in a browser, read
 *   from disk in Node). A URL or string: fetched, or read when it is a file:
 *   URL or, in Node, a path. Bytes or a compiled Module: used as they are.
 * @returns {Promise<Fractonica>}
 */
export async function load(source = DEFAULT_URL) {
  const module = await compile(await source);
  // The module imports NOTHING: an empty import object is all it ever gets.
  const instance = await WebAssembly.instantiate(module, {});
  return new Fractonica(instance);
}

/** @returns {Promise<WebAssembly.Module>} */
async function compile(source) {
  if (source instanceof WebAssembly.Module) return source;
  if (source instanceof ArrayBuffer || ArrayBuffer.isView(source)) return WebAssembly.compile(source);
  if (typeof Response !== 'undefined' && source instanceof Response) return compileResponse(source);

  const inNode = typeof process !== 'undefined' && Boolean(process.versions?.node);
  const isFileUrl = (source instanceof URL ? source.protocol : /^file:/i.test(String(source)) ? 'file:' : '') === 'file:';
  const isPath = inNode && typeof source === 'string' && !/^[a-z][a-z0-9+.-]*:/i.test(source);
  if (isFileUrl || isPath) {
    // Node's fetch does not read file: URLs. The import is dynamic so that a
    // browser never resolves it.
    const { readFile } = await import('node:fs/promises');
    const location = isFileUrl && !(source instanceof URL) ? new URL(source) : source;
    return WebAssembly.compile(await readFile(location));
  }
  return compileResponse(await fetch(source));
}

/** Streaming compilation, with a fallback for a server that sends the wrong MIME type. */
async function compileResponse(response) {
  if (!response.ok) {
    throw new FractonicaError('FRC_ERR_ARG', HERE, `could not fetch ${response.url || 'the module'}: HTTP ${response.status}`);
  }
  if (typeof WebAssembly.compileStreaming === 'function') {
    try {
      return await WebAssembly.compileStreaming(response.clone());
    } catch {
      // not served as application/wasm, or no streaming here: compile the bytes instead
    }
  }
  return WebAssembly.compile(await response.arrayBuffer());
}
