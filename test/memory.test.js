/**
 * Memory hygiene: the module has no heap. Its memory is fixed, the scratch
 * block is reset at the start of every call, and only frc.catalogue() keeps
 * anything. Ten thousand mixed calls must leave everything where it was.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DateForm, FractonicaError, Medium, Unit } from '../public/lib/fractonica.js';
import { A, cat, frc } from './helpers.js';

/** One call of every kind: structs out, structs in, text, arrays, sinks, errors. */
function mixedCalls(i) {
  const t = A + BigInt(i) * 7919000n;
  const date = cat.dateAt(t);
  frc.formatDate(date, DateForm.FULL, Unit.BLINK);
  cat.dateToTime(date);
  cat.cycleAt(t, i % 22);
  cat.cyclePoints(6, cat.cycleAt(t, 6).cycle);
  cat.odometerAt(t, 6, 2, 2);
  cat.syncAt(t);
  frc.formatPentad(cat.pentadAt(t));
  const span = cat.spanBetween(A, t);
  frc.formatSpan(span);
  frc.spanParts(span);
  const glyph = cat.glyphAt(t, 7, 1 + (i % 5));
  frc.glyphPath(glyph);
  frc.glyphSegments(glyph, 32);
  frc.glyphSvgPath(glyph, { scale: 8.8 });
  frc.formatLength(i % 63, frc.referenceInterval, frc.mediumSpeed(Medium.AIR));
  frc.formatLightSpan(i % 63, frc.mediumSpeed(Medium.WATER), true);
  frc.arcPoint(frc.arcChild({ cx: 0, cy: 0, radius: 100, start: 0, sweep: 6 }, 22, i % 22, i & 1), 0.5);
  frc.toAscii(frc.formatDate(date, DateForm.LETTERS, Unit.BLINK));
  frc.parseDate('a#6 b#4 g#9 d#3 e#5 34h 29i');
  frc.formatCivil(frc.civilFromTime(t, 3600), 3600);
  // calls that fail must not leak either
  assert.throws(() => cat.cycleAt(cat.last + 1n, 6), FractonicaError);
  assert.throws(() => frc.parseDate('not a date'), FractonicaError);
  assert.throws(() => frc.catalogue([3, 2, 1]), FractonicaError);
}

test('ten thousand calls do not grow memory, the scratch block or the keep block', () => {
  mixedCalls(0); // warm up: after one round everything is at its resting size
  const before = {
    bytes: frc.memory.buffer.byteLength,
    buffer: frc.memory.buffer,
    keep: frc.raw.frcw_keep_mark(),
    scratch: frc.raw.frcw_scratch_used(),
  };
  for (let i = 1; i <= 10000; i++) {
    mixedCalls(i);
    assert.equal(frc.raw.frcw_scratch_used(), before.scratch, `round ${i}: the scratch block is where round 0 left it`);
  }
  assert.equal(frc.memory.buffer.byteLength, before.bytes, 'the memory did not grow');
  assert.equal(frc.memory.buffer, before.buffer, 'the same buffer: nothing was detached');
  assert.equal(frc.raw.frcw_keep_mark(), before.keep, 'refused catalogues gave their storage back');
  frc.raw.frcw_reset();
  assert.equal(frc.raw.frcw_scratch_used(), 0);
});

test('the memory is fixed: it cannot grow at all', () => {
  const pages = frc.memory.buffer.byteLength / 65536;
  assert.equal(pages, 3);
  assert.throws(() => frc.memory.grow(1), RangeError);
});

test('a call that needs more scratch than there is fails cleanly', () => {
  const huge = 'α'.repeat(20000); // 40 KB of UTF-8: more than the scratch block
  assert.throws(() => frc.toAscii(huge), (error) => error instanceof FractonicaError && error.status === 'FRC_ERR_BUFFER');
  // and the next call is unaffected
  assert.equal(frc.toAscii('34η'), '34h');
  const long = 'η'.repeat(2000);
  assert.equal(frc.toAscii(long), 'h'.repeat(2000));
});

test('a kept catalogue survives every later call; a full keep block is refused', async () => {
  // a fresh instance, so this suite does not use up the shared one's storage
  const { load } = await import('../public/lib/fractonica.js');
  const own = await load();
  const table = Array.from({ length: 90 }, (_, k) => BigInt(k) * 568972877000n);
  const first = own.catalogue(table, 7);
  const made = [first];
  assert.throws(
    () => {
      for (let i = 0; i < 1000; i++) made.push(own.catalogue(table, 7));
    },
    (error) => error instanceof FractonicaError && error.status === 'FRC_ERR_BUFFER',
  );
  assert.ok(made.length > 30, `${made.length} catalogues of 90 eclipses fit`);
  for (let i = 0; i < 1000; i++) own.saros141.dateAt(A + BigInt(i));
  // the first and the last are both intact
  for (const kept of [first, made.at(-1)]) {
    assert.equal(kept.count, 90);
    assert.equal(kept.instant(89), 89n * 568972877000n * 1000n);
    assert.equal(kept.cycleAt(kept.instant(40) + 1n, 0).cycle, 10n);
  }
});
