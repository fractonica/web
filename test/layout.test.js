/**
 * Struct layouts and enumerators: the binding never guesses them, it reads
 * the tables wasm/glue.c builds from the real header. These tests hold those
 * tables from three sides:
 *
 *   1. against fractonica.h's TEXT: every public struct and every field is in
 *      the table (a field added to the core cannot be forgotten in glue.c),
 *      and every enumerator is in the binding's enum objects;
 *   2. against a snapshot of the wasm32 layout, typed in below: a change of
 *      layout in the core fails here first, where it is easy to read (the
 *      binding itself would follow the new offsets by itself);
 *   3. against themselves: fields aligned, inside the struct, not overlapping.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';

import * as binding from '../public/lib/fractonica.js';
import { CORE, frc, HAVE_CORE, NO_CORE } from './helpers.js';

/** The header without its comments. */
function headerText() {
  return readFileSync(resolve(CORE, 'include/fractonica.h'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

/** { frc_cycle_t: ['level', 'quarter', ...], ... } from the header's text. */
function headerStructs(text) {
  const structs = {};
  for (const [, body, name] of text.matchAll(/typedef\s+struct\s+\w+\s*\{([^}]*)\}\s*(frc_\w+_t)\s*;/g)) {
    structs[name] = body
      .split(';')
      .map((declaration) => declaration.trim())
      .filter(Boolean)
      .flatMap((declaration) =>
        // "float cx, cy" declares two fields; "int8_t trit[FRC_MAX_STROKES]" one array
        declaration.split(',').map((declarator) => declarator.replace(/\[[^\]]*\]/g, '').trim().match(/(\w+)$/)[1]),
      );
  }
  return structs;
}

/** { frc_unit_t: { FRC_UNIT_ALPHA: 0, ... }, ... } from the header's text. */
function headerEnums(text) {
  const enums = {};
  for (const [, body, name] of text.matchAll(/typedef\s+enum\s+\w+\s*\{([^}]*)\}\s*(frc_\w+_t)\s*;/g)) {
    enums[name] = Object.fromEntries(
      body.split(',').map((member) => member.trim()).filter(Boolean).map((member) => {
        const [, key, value] = member.match(/^(\w+)\s*=\s*(-?\d+)$/);
        return [key, Number(value)];
      }),
    );
  }
  return enums;
}

test('every struct and field of fractonica.h is in the layout table, in the header\'s order', { skip: !HAVE_CORE && NO_CORE }, () => {
  const expected = headerStructs(headerText());
  assert.ok(Object.keys(expected).length >= 17, 'the header parser found the structs');
  const actual = Object.fromEntries(Object.entries(frc.layout).map(([name, struct]) => [name, Object.keys(struct.fields)]));
  assert.deepEqual(
    Object.fromEntries(Object.entries(actual).sort()),
    Object.fromEntries(Object.entries(expected).sort()),
    'wasm/glue.c FRCW_LAYOUT must list exactly the header\'s structs and fields',
  );
});

test('every enumerator of fractonica.h is in the binding\'s enum objects', { skip: !HAVE_CORE && NO_CORE }, () => {
  // the header's enum -> the binding's object and the prefix it drops
  const map = {
    frc_status_t: [binding.Status, ''],
    frc_level_kind_t: [binding.LevelKind, 'FRC_KIND_'],
    frc_unit_t: [binding.Unit, 'FRC_UNIT_'],
    frc_quarter_t: [binding.Quarter, 'FRC_'],
    frc_pentad_form_t: [binding.PentadForm, 'FRC_PENTAD_'],
    frc_date_form_t: [binding.DateForm, 'FRC_DATE_'],
    frc_medium_t: [binding.Medium, 'FRC_MEDIUM_'],
    frc_band_t: [binding.Band, 'FRC_BAND_'],
    frc_quantity_t: [binding.Quantity, 'FRC_QUANTITY_'],
    frc_path_op_t: [binding.PathOp, 'FRC_PATH_'],
    frc_civil_form_t: [binding.CivilForm, 'FRC_CIVIL_'],
  };
  const enums = headerEnums(headerText());
  assert.deepEqual(Object.keys(enums).sort(), Object.keys(map).sort(), 'an enum was added to or removed from the header');
  for (const [name, members] of Object.entries(enums)) {
    const [object, prefix] = map[name];
    const expected = Object.fromEntries(
      Object.entries(members)
        .filter(([key]) => !key.endsWith('_COUNT')) // a count, not a value (it is in frc.constants)
        .map(([key, value]) => [key.slice(prefix.length), value]),
    );
    assert.deepEqual({ ...object }, expected, name);
    assert.ok(Object.isFrozen(object));
  }
  assert.equal(frc.constants.UNIT_COUNT, enums.frc_unit_t.FRC_UNIT_COUNT);
  assert.equal(frc.constants.MEDIUM_COUNT, enums.frc_medium_t.FRC_MEDIUM_COUNT);
});

/**
 * The wasm32 layout, typed in: [sizeof, alignof, 'field:offset+type[count] ...'].
 * Types are the letters of glue.c (B u8, b i8, H u16, h i16, I u32, i i32,
 * Q u64, q i64, f float, P pointer, T nested frc_threshold_t).
 */
const SNAPSHOT = {
  frc_catalogue_t: [12, 4, 'instants_ms:0P count:4H series:6H anchor:8H'],
  frc_position_t: [24, 8, 'ordinal:0H num:8Q den:16Q'],
  frc_cycle_t: [40, 8, 'level:0B quarter:1B clipped:2B local:4H siblings:6H cycle:8Q phase:16I start:24q end:32q'],
  frc_threshold_t: [16, 8, 'name:0B time:8q'],
  frc_glyph_t: [12, 2, 'index:0H value:2h derivative:4b dotted:5B strokes:6B trit:7b5'],
  frc_odometer_t: [24, 8, 'count:0B strokes:1B states:2H digit:4H4 next_change:16q'],
  frc_sync_t: [64, 8, 'sync:0i quarter:4B helion:5B phase:8I start:16q end:24q nominal:32q drift_us:40q next:48T'],
  frc_pentad_t: [24, 8, 'sync:0i index:4B helion:5B helions:6B first:7B start:8q end:16q'],
  frc_date_t: [14, 2, 'alpha:0H beta:2B gamma:3B delta:4B epsilon:5B eta:6B iota:7B lambda:8B nu:9B quarter:10B4'],
  frc_span_t: [24, 8, 'negative:0B blinks:8Q frac:16I'],
  frc_span_part_t: [16, 8, 'unit:0B count:8Q'],
  frc_rate_t: [16, 8, 'unit:0B count:1B factor:8Q'],
  frc_interval_t: [16, 8, 'num:0Q den:8Q'],
  frc_sci_t: [16, 8, 'mantissa:0Q exp10:8h'],
  frc_speed_t: [16, 8, 'num:0Q den:8Q'],
  frc_arc_t: [20, 4, 'cx:0f cy:4f radius:8f start:12f sweep:16f'],
  frc_civil_t: [16, 4, 'year:0i month:4B day:5B hour:6B minute:7B second:8B weekday:9B microsecond:12I'],
};

test('the wasm32 layout of every struct is the one typed in here', () => {
  const actual = Object.fromEntries(
    Object.entries(frc.layout).map(([name, struct]) => [
      name,
      [
        struct.size,
        struct.align,
        Object.entries(struct.fields).map(([field, f]) => `${field}:${f.offset}${f.type}${f.count > 1 ? f.count : ''}`).join(' '),
      ],
    ]),
  );
  assert.deepEqual(actual, SNAPSHOT);
});

test('fields are aligned, inside their struct, and do not overlap', () => {
  const width = { B: 1, b: 1, H: 2, h: 2, I: 4, i: 4, Q: 8, q: 8, f: 4, P: 4 };
  for (const [name, struct] of Object.entries(frc.layout)) {
    assert.equal(struct.size % struct.align, 0, `${name}: size is a multiple of the alignment`);
    let end = 0;
    for (const [field, f] of Object.entries(struct.fields)) {
      const size = f.type === 'T' ? frc.layout.frc_threshold_t.size : width[f.type] * f.count;
      const align = f.type === 'T' ? frc.layout.frc_threshold_t.align : width[f.type];
      assert.ok(size > 0, `${name}.${field}: a known type`);
      assert.equal(f.offset % align, 0, `${name}.${field}: aligned`);
      assert.ok(f.offset >= end, `${name}.${field}: after the field before it`);
      end = f.offset + size;
    }
    assert.ok(end <= struct.size, `${name}: the last field ends inside the struct`);
  }
});

test('the constants are the header\'s', { skip: !HAVE_CORE && NO_CORE }, () => {
  const text = headerText();
  const define = (name) => text.match(new RegExp(`#define\\s+${name}\\s+(.+)`))[1].trim();
  assert.equal(frc.version, JSON.parse(define('FRC_VERSION')));
  assert.equal(frc.specVersion, JSON.parse(define('FRC_SPEC_VERSION')));
  for (const name of ['LEVEL_COUNT', 'CLOCK_MAX_LEVEL', 'SEQUENCE_LENGTH', 'MAX_STROKES', 'MAX_DIGITS', 'SYNC_LEVEL', 'SYNC_CYCLES', 'SYNC_DAYS', 'RATE_COUNT', 'SCI_DIGITS', 'PREFIX_FACTORS_SIZE', 'GLYPH_UNIT', 'GLYPH_INK', 'GLYPH_DOT_RADIUS']) {
    assert.equal(frc.constants[name], Number(define(`FRC_${name}`)), name);
  }
  assert.equal(frc.constants.GLYPH_DOT_Y, -175);
  assert.equal(frc.constants.INTERVAL_REFERENCE_MS, 568972877000n);
  assert.equal(frc.constants.GREGORIAN_REFORM_MS, -12219292800000n);
  assert.equal(frc.constants.US_PER_DAY, 86400000000n);
  assert.equal(frc.constants.FRAC_HALF, 0x80000000);
  assert.equal(frc.constants.PI, Math.fround(Math.PI));
});
