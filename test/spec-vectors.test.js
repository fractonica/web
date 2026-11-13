/**
 * SPEC.md section 12: test vectors A, B, C and the anchor, typed in from the
 * specification and read through the binding.
 *
 * SPEC prints instants to the millisecond; the core returns the first
 * microsecond at or after the exact instant, so an instant matches when it
 * rounds to SPEC's millisecond (helpers.js: nearestMs).
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Quarter } from '../public/lib/fractonica.js';
import { A, ANCHOR_PLUS_1S, B, C, cat, frc, fractionE12, iso, nearestMs, nearestTenthMs, phaseIs } from './helpers.js';

/** The reading of one level, as SPEC's tables list it. */
function level(t, l) {
  const glyph = cat.glyphAt(t, l, 2);
  const cycle = cat.cycleAt(t, l);
  const next = cat.nextThreshold(t, l);
  return {
    index: glyph.index,
    value: glyph.value,
    derivative: glyph.derivative,
    dotted: glyph.dotted,
    digits: [...cat.odometerAt(t, l, 2, 2).digits],
    cycle: cycle.cycle,
    local: cycle.local,
    siblings: cycle.siblings,
    next: next.name,
    nextMs: nearestMs(next.time),
    nextIso: iso(next.time),
  };
}

/** The solar sync, as SPEC's tables list it. */
function solar(t) {
  const sync = cat.syncAt(t);
  return {
    sync: sync.sync,
    startMs: nearestMs(sync.start),
    startIso: iso(sync.start),
    endIso: iso(sync.end),
    fraction: sync.fraction,
    driftTenthMs: nearestTenthMs(sync.driftUs),
    digits3x2: [...cat.syncOdometer(t, 2, 3).digits],
    digits2x3: [...cat.syncOdometer(t, 3, 2).digits],
    next: sync.next.name,
    nextMs: nearestMs(sync.next.time),
    nextIso: iso(sync.next.time),
  };
}

function positionOf(t) {
  const position = cat.positionAt(t);
  return `${position.ordinal}.${String(fractionE12(position.num, position.den)).padStart(12, '0')}`;
}

test('SPEC 12 vector A: 2026-10-08T12:00:00Z (Unix 1791460800)', () => {
  assert.equal(A, 1791460800000000n);
  assert.equal(iso(A), '2026-10-08T12:00:00.000Z');
  assert.equal(positionOf(A), '22.927850216635');

  // depth 7 (L = 6): index / value / derivative 13 / −3 / +1
  const helion = level(A, 6);
  assert.deepEqual(
    { index: helion.index, value: helion.value, derivative: helion.derivative, dotted: helion.dotted },
    { index: 13, value: -3, derivative: 1, dotted: false },
  );
  assert.deepEqual(helion.digits, [13, 0]);
  assert.deepEqual([helion.cycle, helion.local, helion.siblings], [717211n, 0, 11]);
  assert.equal(helion.next, Quarter.END);
  assert.equal(helion.nextMs, 1791464172428n);
  assert.equal(helion.nextIso, '2026-10-08T12:56:12.428Z');
  // 3-stroke index / value 42 / −10
  const three = cat.glyphAt(A, 6, 3);
  assert.deepEqual([three.index, three.value], [42, -10]);

  // depth 8 (L = 7): 5 / 3 / −1 (dotted)
  const theta = level(A, 7);
  assert.deepEqual(
    { index: theta.index, value: theta.value, derivative: theta.derivative, dotted: theta.dotted },
    { index: 5, value: 3, derivative: -1, dotted: true },
  );
  assert.deepEqual(theta.digits, [5, 4]);
  assert.deepEqual([theta.cycle, theta.local, theta.siblings], [6454906n, 7, 9]);
  assert.equal(theta.next, Quarter.NODE);
  assert.equal(theta.nextMs, 1791461140937n);
  assert.equal(theta.nextIso, '2026-10-08T12:05:40.937Z');

  // the solar sync at A
  const sun = solar(A);
  assert.equal(sun.sync, 4820);
  assert.equal(sun.startMs, 1791336849826n);
  assert.equal(sun.startIso, '2026-10-07T01:34:09.826Z');
  assert.equal(sun.endIso, '2026-10-11T01:33:59.745Z');
  assert.ok(phaseIs(sun.fraction, 0.358662585), `phase ${sun.fraction}`);
  assert.equal(sun.driftTenthMs, -484699899n); // −48469.9899 s
  assert.deepEqual(sun.digits3x2, [5, 11, 13]);
  assert.deepEqual(sun.digits2x3, [18, 33]);
  assert.equal(sun.next, Quarter.NODE);
  assert.equal(sun.nextMs, 1791509644786n);
  assert.equal(sun.nextIso, '2026-10-09T01:34:04.786Z');

  // SPEC 7.5: Pentad II
  assert.equal(frc.formatPentad(cat.pentadAt(A)), 'Pentad II');
});

test('SPEC 12 vector B: 2000-01-01T00:00:00Z (Unix 946684800)', () => {
  assert.equal(iso(B), '2000-01-01T00:00:00.000Z');
  assert.equal(positionOf(B), '21.443111640256');

  // depth 7: index 5 (3, dotted); digits [5, 6]; local 9 of 11; next node at 946687783.046 (00:49:43.046Z)
  const helion = level(B, 6);
  assert.deepEqual([helion.index, helion.value, helion.dotted], [5, 3, true]);
  assert.deepEqual(helion.digits, [5, 6]);
  assert.deepEqual([helion.local, helion.siblings], [9, 11]);
  assert.equal(helion.next, Quarter.NODE);
  assert.equal(helion.nextMs, 946687783046n);
  assert.equal(helion.nextIso, '2000-01-01T00:49:43.046Z');

  // depth 8: index 0; digits [0, 6]; local 3 of 9; next peak at 946685256.803 (00:07:36.803Z)
  const theta = level(B, 7);
  assert.equal(theta.index, 0);
  assert.deepEqual(theta.digits, [0, 6]);
  assert.deepEqual([theta.local, theta.siblings], [3, 9]);
  assert.equal(theta.next, Quarter.PEAK);
  assert.equal(theta.nextMs, 946685256803n);
  assert.equal(theta.nextIso, '2000-01-01T00:07:36.803Z');

  // solar: sync 2375; start 946369476.520 (1999-12-28T08:24:36.520Z); phase 0.912420883;
  // drift −23843.2957 s; digits [14, 9, 9]; next end at 946715066.462
  const sun = solar(B);
  assert.equal(sun.sync, 2375);
  assert.equal(sun.startMs, 946369476520n);
  assert.equal(sun.startIso, '1999-12-28T08:24:36.520Z');
  assert.ok(phaseIs(sun.fraction, 0.912420883), `phase ${sun.fraction}`);
  assert.equal(sun.driftTenthMs, -238432957n);
  assert.deepEqual(sun.digits3x2, [14, 9, 9]);
  assert.equal(sun.next, Quarter.END);
  assert.equal(sun.nextMs, 946715066462n);
});

test('SPEC 12 vector C: 2061-06-15T18:30:00Z (Unix 2886085800)', () => {
  assert.equal(iso(C), '2061-06-15T18:30:00.000Z');
  assert.equal(positionOf(C), '24.851712757369');

  // depth 7: index 10 (−2, dotted); digits [10, 3]; local 0 of 11; next valley at 2886087806.395 (19:03:26.395Z)
  const helion = level(C, 6);
  assert.deepEqual([helion.index, helion.value, helion.dotted], [10, -2, true]);
  assert.deepEqual(helion.digits, [10, 3]);
  assert.deepEqual([helion.local, helion.siblings], [0, 11]);
  assert.equal(helion.next, Quarter.VALLEY);
  assert.equal(helion.nextMs, 2886087806395n);
  assert.equal(helion.nextIso, '2061-06-15T19:03:26.395Z');

  // depth 8: index 12 (−4, valley); digits [12, 1]; local 5 of 9; next end at 2886086290.651 (18:38:10.651Z)
  const theta = level(C, 7);
  assert.deepEqual([theta.index, theta.value, theta.derivative, theta.dotted], [12, -4, 0, false]);
  assert.deepEqual(theta.digits, [12, 1]);
  assert.deepEqual([theta.local, theta.siblings], [5, 9]);
  assert.equal(theta.next, Quarter.END);
  assert.equal(theta.nextMs, 2886086290651n);
  assert.equal(theta.nextIso, '2061-06-15T18:38:10.651Z');

  // solar: sync 7987; start 2061-06-12T16:31:59.691Z; phase 0.770510076; drift −81000.1249 s;
  // digits [12, 5, 4]; next end at 2886165109.343
  const sun = solar(C);
  assert.equal(sun.sync, 7987);
  assert.equal(sun.startIso, '2061-06-12T16:31:59.691Z');
  assert.ok(phaseIs(sun.fraction, 0.770510076), `phase ${sun.fraction}`);
  assert.equal(sun.driftTenthMs, -810001249n);
  assert.deepEqual(sun.digits3x2, [12, 5, 4]);
  assert.equal(sun.next, Quarter.END);
  assert.equal(sun.nextMs, 2886165109343n);
});

test('SPEC 12 anchor: Unix 125593320.816 gives sync 0, drift 0, digits [0, 0, 0]', () => {
  assert.equal(ANCHOR_PLUS_1S, 125593320816000n);
  // "one second after the anchor eclipse"
  assert.equal(cat.anchor, 20);
  assert.equal(ANCHOR_PLUS_1S - cat.instant(cat.anchor), 1000000n);
  const sync = cat.syncAt(ANCHOR_PLUS_1S);
  assert.equal(sync.sync, 0);
  assert.equal(sync.driftUs, 0n);
  assert.equal(sync.start, cat.instant(cat.anchor));
  assert.deepEqual([...cat.syncOdometer(ANCHOR_PLUS_1S, 2, 3).digits], [0, 0, 0]);
});

test('a returned boundary shows the new state; one microsecond earlier the old one', () => {
  // the promise the scheduler of the app is built on (fractonica.h, BOUNDARY INSTANTS)
  const odometer = cat.odometerAt(A, 6, 2, 2);
  assert.ok(odometer.nextChange > A);
  assert.deepEqual([...cat.odometerAt(odometer.nextChange - 1n, 6, 2, 2).digits], [13, 0]);
  assert.deepEqual([...cat.odometerAt(odometer.nextChange, 6, 2, 2).digits], [13, 1]);
  const threshold = cat.nextThreshold(A, 6);
  assert.equal(cat.cycleAt(threshold.time - 1n, 6).cycle, 717211n);
  assert.equal(cat.cycleAt(threshold.time, 6).cycle, 717212n);
});
