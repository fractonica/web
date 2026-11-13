/**
 * Round trips through the binding at random instants of the catalogue:
 * date <-> instant, text <-> date, civil fields <-> instant, cycles and their
 * boundaries. Each one crosses the wasm boundary in both directions, so a
 * field written back wrongly (not only read wrongly) shows here.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DateForm, Unit } from '../public/lib/fractonica.js';
import { cat, frc, makeRandom } from './helpers.js';

const SAMPLES = 400;

function instants(seed) {
  const random = makeRandom(seed);
  const list = [cat.first, cat.last, cat.last - 1n, cat.instant(20), cat.instant(21) - 1n];
  while (list.length < SAMPLES) list.push(random.between(cat.first, cat.last));
  return list;
}

const plain = (date) => ({ ...date, quarters: [...date.quarters] });

test(`date <-> instant at ${SAMPLES} instants`, () => {
  for (const t of instants(1n)) {
    const date = cat.dateAt(t);
    const blinkStart = cat.dateToTime(date);
    // the date names the Blink that holds the instant ...
    assert.ok(blinkStart <= t, `${t}: the Blink starts at ${blinkStart}`);
    const blink = cat.cycleAt(t, 12);
    assert.equal(blinkStart, blink.start, `${t}: the Blink's start`);
    // ... and reading the clock at that start gives the same date back
    assert.deepEqual(plain(cat.dateAt(blinkStart)), plain(date), `${t}`);
  }
});

test(`stamp text <-> date at ${SAMPLES} instants`, () => {
  for (const t of instants(2n)) {
    const date = cat.dateAt(t);
    const stamp = frc.formatDate(date, DateForm.LETTERS, Unit.BLINK);
    const { date: parsed, finest } = frc.parseDate(stamp);
    assert.equal(finest, Unit.BLINK);
    // a parsed date has no quarters; the counts are the same
    assert.deepEqual({ ...plain(parsed), quarters: null }, { ...plain(date), quarters: null }, stamp);
    assert.equal(cat.dateToTime(parsed), cat.dateToTime(date), stamp);
    // the full form in words and its ASCII both read back to the same Blink
    const full = frc.formatDate(date, DateForm.FULL, Unit.BLINK);
    assert.equal(cat.dateToTime(frc.parseDate(full).date), cat.dateToTime(date), full);
    assert.equal(cat.dateToTime(frc.parseDate(frc.toAscii(stamp)).date), cat.dateToTime(date), stamp);
    // a short form with the date as its own context
    const short = frc.formatDate(date, DateForm.SHORT_LETTERS, Unit.BLINK);
    assert.equal(cat.dateToTime(frc.parseDate(short, date).date), cat.dateToTime(date), short);
  }
});

test(`civil fields <-> instant at ${SAMPLES} instants and three offsets`, () => {
  for (const t of instants(3n)) {
    for (const offset of [0, 19800, -28800]) {
      const civil = frc.civilFromTime(t, offset);
      assert.equal(frc.timeFromCivil(civil, offset), t, `${t} at ${offset}`);
    }
  }
});

test(`cycles tile and thresholds follow, at ${SAMPLES} instants`, () => {
  for (const t of instants(4n)) {
    for (const level of [0, 3, 6, 7, 12, 13]) {
      const cycle = cat.cycleAt(t, level);
      assert.ok(cycle.start <= t && (t < cycle.end || t === cat.last), `${t} level ${level}`);
      const byIndex = cat.cycleByIndex(level, cycle.cycle);
      assert.deepEqual([byIndex.start, byIndex.end, byIndex.local], [cycle.start, cycle.end, cycle.local]);
      const points = cat.cyclePoints(level, cycle.cycle);
      assert.equal(points[0], cycle.start);
      if (!cycle.clipped) assert.equal(points[4], cycle.end);
      if (t === cat.last) continue; // nothing comes after the closing instant
      // the next threshold is one of the cycle's quarter points, the first after t
      const next = cat.nextThreshold(t, level);
      assert.ok(next.time > t);
      assert.equal(next.time, points[next.name + 1], `${t} level ${level}: threshold ${next.name}`);
      assert.equal(next.name, cycle.quarter);
    }
  }
});

test('position <-> instant: every eclipse is its own ordinal', () => {
  for (let k = 0; k < cat.count; k++) {
    assert.equal(cat.timeAtPosition(k, 1), cat.instant(k));
    if (k < cat.count - 1) {
      const position = cat.positionAt(cat.instant(k));
      assert.deepEqual([position.ordinal, position.num], [k, 0n]);
      assert.equal(position.den, cat.instant(k + 1) - cat.instant(k));
    }
  }
  assert.equal(cat.instant(cat.count), null);
  assert.equal(cat.timeAtPosition(cat.count, 1), null);
});

test('glyph index <-> state: the odometer of a phase and the glyph of an index agree', () => {
  for (const strokes of [1, 2, 3, 4, 5]) {
    const states = frc.glyphStates(strokes);
    for (let index = 0; index < states; index++) {
      const glyph = frc.glyphFromIndex(index, strokes);
      assert.equal(glyph.index, index);
      assert.equal(glyph.trits.length, strokes);
      assert.equal(glyph.dotted, glyph.derivative < 0); // SPEC pitfall 5
      // the descending family is an involution
      assert.equal(frc.glyphIndexDescending(frc.glyphIndexDescending(index, strokes), strokes), index);
    }
  }
});
