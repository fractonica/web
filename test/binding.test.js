/**
 * The binding's own promises (the head of fractonica.js): instants are
 * BigInt, FRC_TIME_NONE is null, structs are frozen plain objects, a status
 * is a FractonicaError with its name, a wrong argument is refused before the
 * call, and the drawing helpers hand the core's geometry on unchanged.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { CivilForm, FractonicaError, PathOp, Quarter, Status, Unit } from '../public/lib/fractonica.js';
import { A, cat, frc } from './helpers.js';

const status = (name) => (error) => error instanceof FractonicaError && error.status === name;

test('errors: a FractonicaError carries the status name, its number and the C function', () => {
  const outside = cat.last + 1n;
  assert.equal(cat.contains(outside), false);
  try {
    cat.cycleAt(outside, 6);
    assert.fail('the clock is not defined outside the catalogue');
  } catch (error) {
    assert.ok(error instanceof FractonicaError && error instanceof Error);
    assert.equal(error.name, 'FractonicaError');
    assert.equal(error.status, 'FRC_ERR_RANGE');
    assert.equal(error.code, Status.FRC_ERR_RANGE);
    assert.equal(error.call, 'frc_cycle_at');
    assert.match(error.message, /frc_cycle_at: FRC_ERR_RANGE/);
  }
  // every reading at an instant refuses it the same way, before and after the catalogue
  for (const t of [cat.first - 1n, outside]) {
    for (const read of [
      () => cat.positionAt(t), () => cat.cycleAt(t, 0), () => cat.nextThreshold(t, 6), () => cat.glyphAt(t, 6, 2),
      () => cat.odometerAt(t, 6, 2, 2), () => cat.syncAt(t), () => cat.syncOdometer(t, 2, 3), () => cat.pentadAt(t),
      () => cat.dateAt(t), () => cat.spanBetween(A, t), () => cat.intervalAt(t),
    ]) {
      assert.throws(read, status('FRC_ERR_RANGE'));
    }
  }
  // an argument error of the core wins over a range error
  assert.throws(() => cat.cycleAt(outside, 22), status('FRC_ERR_ARG'));
  assert.throws(() => cat.odometerAt(A, 6, 6, 2), status('FRC_ERR_ARG'));
  assert.throws(() => frc.formatUnitSymbol(99), (error) => status('FRC_ERR_ARG')(error) && error.call === 'frc_format_unit_symbol');
  assert.throws(() => frc.levelPerBlink(36), status('FRC_ERR_OVERFLOW'));
  assert.throws(() => frc.parseDate('tomorrow'), status('FRC_ERR_PARSE'));
});

test('arguments are checked against their C type before the call', () => {
  const refused = (call) => assert.throws(call, (error) => status('FRC_ERR_ARG')(error) && error.call === 'fractonica.js');
  // an instant is a BigInt of microseconds: a Number is seconds or milliseconds by mistake
  refused(() => cat.cycleAt(1791460800, 6));
  refused(() => cat.cycleAt('1791460800000000', 6));
  refused(() => cat.cycleAt(2n ** 63n, 6));
  // WebAssembly would wrap these silently
  refused(() => cat.cycleAt(A, 256));
  refused(() => cat.cycleAt(A, -1));
  refused(() => cat.cycleAt(A, 6.5));
  refused(() => cat.cycleAt(A, undefined));
  refused(() => cat.cycleByIndex(6, -1n));
  refused(() => cat.cycleByIndex(6, 2n ** 64n));
  refused(() => cat.cycleByIndex(6, 1.5));
  refused(() => frc.fromUnixSeconds(1791460800.5));
  refused(() => frc.fromDate(new Date(NaN)));
  refused(() => frc.fromDate('2026-10-08'));
  refused(() => frc.formatSpan({ negative: false, blinks: -1n, frac: 0 }));
  refused(() => frc.formatSpan(null));
  refused(() => frc.formatDate({ alpha: 6 }));
  refused(() => frc.toAscii(42));
  refused(() => frc.toAscii('a\0b'));
  refused(() => frc.arcPoint({ cx: 0, cy: 0, radius: 1, start: 0, sweep: '1' }, 0.5));
  // 64-bit arguments may be safe integers
  assert.equal(cat.cycleByIndex(6, 717211).cycle, 717211n);
  assert.equal(frc.formatCount(58500), frc.formatCount(58500n));
});

test('FRC_TIME_NONE is null in every result', () => {
  // nothing comes after the catalogue's closing instant
  assert.equal(cat.nextThreshold(cat.last, 6).time, null);
  assert.equal(cat.odometerAt(cat.last, 6, 2, 2).nextChange, null);
  assert.equal(frc.odometerOfPhase(0x40000000, 2, 2).nextChange, null);
  assert.equal(cat.instant(cat.count), null);
  assert.equal(cat.timeAtPosition(1, 0), null);
  assert.equal(cat.syncByNumber(0).next.time, null);
  // the last Alpha is clipped: its later quarter points fall after the catalogue
  const last = cat.cycleAt(cat.last, 0);
  assert.equal(last.clipped, true);
  assert.equal(last.end, cat.last);
  const points = cat.cyclePoints(0, last.cycle);
  assert.equal(points[0], last.start);
  assert.ok(points.includes(null), 'a clipped cycle has points beyond the catalogue');
  // conversions that do not fit
  assert.equal(frc.fromUnixMs(2n ** 62n), null);
  assert.equal(frc.timeFromCivil({ year: 300000, month: 1, day: 1, hour: 0, minute: 0, second: 0, microsecond: 0 }), null);
  // sentinels of other kinds
  assert.equal(frc.unitLevel(99), null);
  assert.equal(frc.unitOfLevel(5), null);
  assert.equal(frc.unitOfLevel(6), Unit.HELION);
  assert.equal(frc.unitLevel(Unit.HELION), 6);
});

test('results are frozen plain objects with the documented shapes', () => {
  const cycle = cat.cycleAt(A, 6);
  assert.deepEqual(Object.keys(cycle), ['level', 'quarter', 'clipped', 'local', 'siblings', 'cycle', 'phase', 'fraction', 'start', 'end']);
  assert.equal(typeof cycle.cycle, 'bigint');
  assert.equal(typeof cycle.start, 'bigint');
  assert.equal(typeof cycle.clipped, 'boolean');
  assert.ok(Number.isInteger(cycle.phase) && cycle.phase >= 0 && cycle.phase < 2 ** 32);
  assert.equal(cycle.fraction, frc.fracToDouble(cycle.phase));
  assert.ok(cycle.fraction >= 0 && cycle.fraction < 1);
  assert.equal(Object.getPrototypeOf(cycle), Object.prototype);

  const sync = cat.syncAt(A);
  assert.deepEqual(Object.keys(sync), ['sync', 'quarter', 'helion', 'phase', 'fraction', 'start', 'end', 'nominal', 'driftUs', 'next']);
  assert.equal(sync.helion, 6); // vector A: the 7th Helion of sync 4 820 (half-Helion 13 of 38)
  assert.deepEqual(Object.keys(cat.pentadAt(A)), ['sync', 'index', 'helion', 'helions', 'first', 'start', 'end']);
  assert.equal(cat.pentadAt(A).first, 5);
  assert.deepEqual(Object.keys(sync.next), ['name', 'time']);
  assert.equal(sync.driftUs, sync.start - sync.nominal);

  const glyph = cat.glyphAt(A, 7, 2);
  assert.deepEqual({ ...glyph, trits: [...glyph.trits] }, { index: 5, value: 3, derivative: -1, dotted: true, strokes: 2, trits: [0, 1] });
  const odometer = cat.odometerAt(A, 6, 3, 4);
  assert.deepEqual([odometer.count, odometer.strokes, odometer.states, odometer.digits.length], [4, 3, 52, 4]);

  for (const value of [
    cycle, sync, sync.next, glyph, glyph.trits, odometer, odometer.digits, cat.positionAt(A), cat.pentadAt(A), cat.dateAt(A),
    cat.dateAt(A).quarters, cat.spanBetween(A, A + 1n), cat.cyclePoints(6, cycle.cycle), cat.intervalAt(A), frc.constants,
    frc.layout, frc.referenceInterval, frc.ratePreset(3), frc.period(6, frc.referenceInterval), frc.civilFromTime(A),
    frc.glyphPath(glyph), frc.glyphPath(glyph)[0], frc.glyphSegments(glyph), frc.glyphBounds(2), frc.arcWaveRoot(0),
    frc.spanParts(frc.spanOfLevel(5)), frc.parseDate('a#6 b#4 g#9 d#3 e#5'), frc, cat,
  ]) {
    assert.ok(Object.isFrozen(value));
  }
});

test('time helpers', () => {
  assert.equal(frc.fromUnixSeconds(1791460800), A);
  assert.equal(frc.fromUnixSeconds(1791460800n), A);
  assert.equal(frc.fromUnixMs(1791460800000), A);
  assert.equal(frc.fromDate(new Date('2026-10-08T12:00:00Z')), A);
  assert.equal(frc.toDate(A).toISOString(), '2026-10-08T12:00:00.000Z');
  // a Date holds milliseconds: the microseconds are cut towards the past, also before 1970
  assert.equal(frc.toDate(A + 999n).getTime(), 1791460800000);
  assert.equal(frc.toDate(-1n).getTime(), -1);
  assert.equal(frc.toDate(-1000n).getTime(), -1);
  assert.equal(frc.toDate(-1001n).getTime(), -2);
  const now = frc.now();
  assert.equal(typeof now, 'bigint');
  assert.ok(cat.contains(now));
  assert.ok(Math.abs(Number(now / 1000n) - Date.now()) < 5000);
  // the local zone's offset, from the platform
  const offset = frc.utcOffsetSeconds(A);
  assert.equal(offset, -new Date(1791460800000).getTimezoneOffset() * 60);
  assert.ok(Number.isInteger(offset) && Math.abs(offset) <= 14 * 3600);
});

test('civil time: fields, text and back', () => {
  const civil = frc.civilFromTime(A);
  assert.deepEqual({ ...civil }, { year: 2026, month: 10, day: 8, hour: 12, minute: 0, second: 0, weekday: 3, microsecond: 0 }); // a Thursday
  assert.equal(frc.formatCivil(civil), '2026-10-08T12:00:00.000Z');
  assert.equal(frc.formatCivil(frc.civilFromTime(A, 7200), 7200), '2026-10-08T14:00:00.000+02:00');
  // `weekday` is output only and may be left out of fields written by hand
  assert.equal(frc.timeFromCivil({ year: 2026, month: 10, day: 8, hour: 12, minute: 0, second: 0, microsecond: 0 }), A);
  assert.equal(frc.timeFromCivil({ year: 2026, month: 10, day: 8, hour: 14, minute: 0, second: 0, microsecond: 0 }, 7200), A);
  // SPEC 2.3: 1582-10-15 Gregorian is 1582-10-05 Julian, ten days apart
  assert.equal(frc.julianFieldsToUnixMs(frc.constants.GREGORIAN_REFORM_MS) - frc.constants.GREGORIAN_REFORM_MS, 10n * 86400000n);
});

test('Earth wording (EARTH mode only): civil text, durations, validation, reading a typed date', () => {
  const civil = frc.civilFromTime(A);
  const text = (form, offset = 0) => frc.formatCivilText(civil, offset, form);
  assert.equal(text(CivilForm.DATE_TIME), 'THU 8 OCT 2026 · 12:00:00');
  assert.equal(text(CivilForm.TIME), '12:00:00');
  assert.equal(text(CivilForm.MINUTE), '12:00');
  assert.equal(text(CivilForm.DAY_MONTH_TIME), '8 OCT 12:00');
  assert.equal(text(CivilForm.DAY_MONTH_YEAR), '8 OCT 2026');
  assert.equal(text(CivilForm.ISO_DATE), '2026-10-08');
  assert.deepEqual([CivilForm.WEEKDAY, CivilForm.MONTH, CivilForm.YEAR].map((form) => text(form)), ['THU', 'OCT', '2026']);
  // the weekday is the date's, not the field's; the offset is read by OFFSET only, and civil may then be null
  assert.equal(frc.formatCivilText({ ...civil, weekday: 0 }, 0, CivilForm.WEEKDAY), 'THU');
  assert.equal(frc.formatCivilText(null, 10800, CivilForm.OFFSET), 'UTC+3');
  assert.equal(frc.formatCivilText(null, -9000, CivilForm.OFFSET), 'UTC−2:30');
  assert.equal(frc.formatCivilText(null, 0, CivilForm.OFFSET), 'UTC');
  assert.throws(() => frc.formatCivilText({ ...civil, day: 31, month: 2 }, 0, CivilForm.DATE), (e) => e.status === 'FRC_ERR_ARG');
  // durations: rounded once, half up, then worded
  assert.equal(frc.formatDuration(1433000000n), '23 min 53 s');
  assert.equal(frc.formatDuration(3722000000n), '1 h 2 min');
  assert.equal(frc.formatDuration(400000), '0.4 s');
  assert.equal(frc.formatDuration(59600000), '1 min');
  assert.equal(frc.formatDuration(-400000), '−0.4 s');
  // validation and reading
  assert.equal(frc.civilValidate(civil), true);
  assert.equal(frc.civilValidate({ ...civil, month: 2, day: 29 }), false);
  assert.deepEqual(frc.parseCivil('THU 8 OCT 2026 · 12:00:00'), { civil: { ...civil }, offset: null });
  assert.equal(frc.parseCivil('2026-10-08T14:00:00+02:00').offset, 7200);
  assert.throws(() => frc.parseCivil('31 FEB 2026'), (e) => e.status === 'FRC_ERR_RANGE');
  assert.throws(() => frc.parseCivil('FRI 8 OCT 2026'), (e) => e.status === 'FRC_ERR_PARSE');
  // core 0.2.0: a negative year takes U+2212 in every form but the ISO date; an offset of a day or more is refused
  const ides = frc.civilFromTime(frc.timeFromCivil({ year: -44, month: 3, day: 15, hour: 9, minute: 5, second: 7, microsecond: 0 }));
  assert.deepEqual(
    [CivilForm.DATE_TIME, CivilForm.DAY_MONTH_YEAR, CivilForm.YEAR, CivilForm.ISO_DATE].map((form) => frc.formatCivilText(ides, 0, form)),
    ['THU 15 MAR −0044 · 09:05:07', '15 MAR −0044', '−0044', '-0044-03-15'],
  );
  assert.equal(frc.formatCivilText(null, 86399, CivilForm.OFFSET), 'UTC+23:59');
  for (const offset of [86400, -86400]) assert.throws(() => frc.formatCivilText(null, offset, CivilForm.OFFSET), (e) => e.status === 'FRC_ERR_ARG');
  // ... and reads less loosely: no tab or newline for a space, a separator after the weekday, 'T' only after an
  // ISO date; spaces on either side of the weekday's comma are taken
  for (const typed of ['THU\t8 OCT 2026', 'THU\n8 OCT 2026', 'THU8 OCT 2026', '8 OCT 2026T12:00']) {
    assert.throws(() => frc.parseCivil(typed), (e) => e.status === 'FRC_ERR_PARSE', JSON.stringify(typed));
  }
  for (const typed of ['THU , 8 OCT 2026', 'thu ,8 oct 2026']) assert.equal(frc.parseCivil(typed).civil.day, 8);
});

test('a catalogue from the caller\'s own table', () => {
  // Saros 141 again, copied out through the binding: the same clock
  const table = Array.from({ length: cat.count }, (_, k) => cat.instant(k) / 1000n);
  const copy = frc.catalogue(table, 141);
  assert.deepEqual([copy.count, copy.series, copy.anchor, copy.first, copy.last], [70, 141, 20, cat.first, cat.last]);
  assert.notEqual(copy.pointer, cat.pointer);
  assert.deepEqual(copy.cycleAt(A, 6), cat.cycleAt(A, 6));
  assert.deepEqual(copy.syncAt(A), cat.syncAt(A));
  assert.equal(frc.formatDate(copy.dateAt(A)), frc.formatDate(cat.dateAt(A)));
  // Numbers work too; a table the core refuses is an error and leaves nothing behind
  const mark = frc.raw.frcw_keep_mark();
  assert.throws(() => frc.catalogue([0, 1000, 1000]), status('FRC_ERR_ARG'));
  assert.throws(() => frc.catalogue([0]), status('FRC_ERR_ARG'));
  assert.throws(() => frc.catalogue([0, 1.5]), status('FRC_ERR_ARG'));
  assert.equal(frc.raw.frcw_keep_mark(), mark);
  const small = frc.catalogue([0, 568972877000, 2 * 568972877000], 0);
  assert.deepEqual([small.count, small.series, small.first, small.last], [3, 0, 0n, 2n * 568972877000000n]);
});

test('glyph outlines: the core\'s path, and SVG path data made from it', () => {
  const glyph = frc.glyphFromIndex(5, 2); // value 3, falling: stem, a bar, a hook, the dot
  const path = frc.glyphPath(glyph);
  assert.deepEqual(path.map((step) => step.op), [
    PathOp.MOVE, PathOp.LINE, PathOp.MOVE, PathOp.LINE, // the stem, one segment per trit
    PathOp.MOVE, PathOp.LINE, // trit 0 = 0: the bar
    PathOp.MOVE, PathOp.CUBIC, PathOp.CUBIC, // trit 1 = +1: the hook
    PathOp.DOT,
  ]);
  assert.deepEqual([...path[1].points], [0, 300]);
  assert.deepEqual([...path.at(-1).points], [0, frc.constants.GLYPH_DOT_Y, frc.constants.GLYPH_DOT_RADIUS]);
  assert.deepEqual(frc.glyphBounds(2), { minX: -215, minY: -220, maxX: 215, maxY: 615 });

  // at 10 px per design unit a coordinate of 300 is 30 px, and the ink 0.3 u is 3 px
  const svg = frc.glyphSvgPath(glyph, { scale: 10 });
  assert.equal(svg.stroke, 'M0 0L0 30M0 30L0 60M-10 0L10 0M0 30C0 30 0 40 10 40C20 40 20 30 20 30');
  assert.equal(svg.fill, 'M-3 -17.5a3 3 0 1 0 6 0a3 3 0 1 0 -6 0Z');
  assert.equal(svg.lineWidth, 3);
  const moved = frc.glyphSvgPath(glyph, { scale: 10, x: 100, y: 50 });
  assert.ok(moved.stroke.startsWith('M100 50L100 80'));
  // a rising glyph has no dot
  assert.equal(frc.glyphSvgPath(frc.glyphFromIndex(1, 2)).fill, '');
  // a glyph the core will not draw has no outline
  assert.deepEqual(frc.glyphPath({ index: 0, value: 0, derivative: 0, dotted: false, strokes: 0, trits: [] }), []);

  // flattened: the cubic pieces end where the cubic ends
  const segments = frc.glyphSegments(glyph, 4);
  assert.equal(segments.length, 3 + 2 * 4);
  assert.deepEqual([...segments.at(-1)].slice(2), [200, 300]);

  // Path2D exists in browsers only
  assert.throws(() => frc.glyphPath2D(glyph), status('FRC_ERR_ARG'));
  class FakePath2D {
    constructor(d) {
      this.d = d;
    }
  }
  globalThis.Path2D = FakePath2D;
  try {
    const drawn = frc.glyphPath2D(glyph, { scale: 10 });
    assert.deepEqual([drawn.stroke.d, drawn.fill.d, drawn.lineWidth], [svg.stroke, svg.fill, 3]);
    assert.equal(frc.glyphPath2D(frc.glyphFromIndex(1, 2)).fill, null);
  } finally {
    delete globalThis.Path2D;
  }
});

/** A canvas path that records what is drawn on it. */
function recorder() {
  const calls = [];
  return {
    calls,
    moveTo: (x, y) => calls.push(['moveTo', x, y]),
    arc: (...args) => calls.push(['arc', ...args]),
  };
}

test('arc geometry: the ring construction and the canvas / SVG helpers', () => {
  const pi = frc.constants.PI;
  // DESIGN.md section 5: a full-circle carrier starting at 12 o'clock; a Helion (level 6)
  // holds factor(6) = 9 theta cycles, so the ring has 18 half-cycle arcs
  const carrier = { cx: 0, cy: 0, radius: 100, start: -pi / 2, sweep: 2 * pi };
  const slots = 2 * frc.factor(6);
  assert.equal(slots, 18);
  const children = Array.from({ length: slots }, (_, j) => frc.arcChild(carrier, slots, j, j % 2));
  const near = (a, b) => Math.abs(a.x - b.x) < 1e-3 && Math.abs(a.y - b.y) < 1e-3;
  children.forEach((child, j) => {
    // each child ends where the next begins, on the carrier
    const end = frc.arcPoint(child, 1);
    const nextStart = frc.arcPoint(children[(j + 1) % slots], 0);
    assert.ok(near(end, nextStart), `child ${j} meets child ${j + 1}`);
    assert.ok(Math.abs(Math.hypot(end.x, end.y) - 100) < 1e-3, 'on the carrier');
    // they alternate outward / inward
    const middle = frc.arcPoint(child, 0.5);
    assert.equal(Math.hypot(middle.x, middle.y) > 100, j % 2 === 0, `child ${j} bulges ${j % 2 ? 'inward' : 'outward'}`);
  });
  assert.ok(near(frc.arcPoint(children[0], 0), { x: 0, y: -100 }), 'the ring starts at 12 o\'clock');
  // the documented edges
  assert.deepEqual(frc.arcChild(carrier, 0, 0, 0), { cx: 0, cy: 0, radius: 0, start: 0, sweep: 0 });
  assert.deepEqual(frc.arcWaveRoot(0).cx, 1);
  assert.ok(Math.abs(frc.sin(pi / 2) - 1) < 1e-6 && Math.abs(frc.cos(pi)) - 1 < 1e-6);

  // traceArc: the whole arc as its own sub-path
  const child = children[3];
  const whole = recorder();
  frc.traceArc(whole, child);
  const first = frc.arcPoint(child, 0);
  assert.deepEqual(whole.calls, [
    ['moveTo', first.x, first.y],
    ['arc', child.cx, child.cy, child.radius, child.start, child.start + child.sweep, child.sweep < 0],
  ]);
  // elapsed and to come are the two parts of one arc
  const split = recorder();
  frc.traceArc(split, child, 0, 0.25);
  frc.traceArc(split, child, 0.25, 1, false);
  assert.equal(split.calls.length, 3);
  assert.equal(split.calls[1][5], child.start + child.sweep * 0.25);
  assert.equal(split.calls[2][4], child.start + child.sweep * 0.25);
  assert.equal(split.calls[2][5], child.start + child.sweep);
  assert.equal(split.calls[1][6], split.calls[2][6]);
  // odd children turn the other way
  assert.notEqual(children[0].sweep < 0, children[1].sweep < 0);

  // SVG: starts at the arc's first point, ends at its last, in pieces under half a turn
  const d = frc.arcSvgPath(child);
  const last = frc.arcPoint(child, 1);
  const round3 = (value) => Math.round(value * 1000) / 1000;
  assert.ok(d.startsWith(`M${round3(first.x)} ${round3(first.y)}A`), d);
  assert.ok(d.endsWith(` ${round3(last.x)} ${round3(last.y)}`), d);
  assert.equal(frc.arcSvgPath(carrier).split('A').length - 1, 3, 'a full circle is cut in three');
});

test('quarters and units are named by the core', () => {
  assert.deepEqual(Object.values(Quarter).map((quarter) => frc.formatQuarter(quarter)), ['Peak', 'Node', 'Valley', 'End']);
  assert.equal(frc.formatQuarter(Quarter.END, true), 'end');
  assert.deepEqual(Object.values(Unit).map((unit) => frc.formatUnitSymbol(unit)), ['α', 'β', 'γ', 'δ', 'ε', 'η', 'ι', 'λ', 'ν']);
  assert.deepEqual(Object.values(Unit).map((unit) => frc.unitLevel(unit)), [0, 1, 2, 3, 4, 6, 8, 10, 12]);
  assert.equal(frc.formatUnitName(Unit.HELION), 'Helion');
  assert.equal(frc.formatUnitName(Unit.HELION, true), 'Helions');
  assert.equal(frc.unitBlinks(Unit.HELION), 58500n);
  assert.equal(frc.unitParts(Unit.HELION), 36);
  // SPEC 3.1: S = [5, 13, 5, 5, 7, 11, 9, 4]
  assert.deepEqual(Array.from({ length: 8 }, (_, level) => frc.factor(level)), [5, 13, 5, 5, 7, 11, 9, 4]);
  assert.deepEqual([frc.formatLevelName(6), frc.formatLevelWord(6), frc.formatLevelName(24), frc.formatLevelName(62)], ['η', 'Eta', 'α1', 'ο2']);
});
