/**
 * The WAVE (the timeline) and time travel, without a browser: what the screen
 * READS (screens/wave/wave-reading.js), where a step leads (model/travel.js),
 * the half-cycle bookkeeping of the wave (model/halves.js `waveSteps`), the
 * geometry of a cell (drawing/wave.js) and the scrub (a place on the timeline
 * -> an instant: the core's frc_time_at_phase, no longer a shim), held against
 * the core.
 *
 * Literals are SPEC's vector A (2026-10-08T12:00:00Z): the stamp
 * "α#6 β#4 γ#9 δ#3 ε#5 34η 29ι 21λ 3ν", the Helion's END in "6ι 43λ", sync
 * 4820, Pentad II; and the list of next thresholds as design/astrolabe
 * screen5.png prints it (with the core's "43λ 21ν" where the brief rounded
 * to 44λ). U+202F groups thousands in the core's numbers.
 */
process.env.TZ = 'UTC'; // Earth-mode readings use the platform's zone: fix it before any Date is made

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DateForm, Quarter, Unit } from '../public/lib/fractonica.js';
import { nestPath, nowPoint } from '../public/app/drawing/arcs.js';
import { SUN_LANE, buildWaveCell, fitWaveCell, sunLaneBox } from '../public/app/drawing/wave.js';
import { createFrame } from '../public/app/model/frame.js';
import { ringSteps, waveSteps } from '../public/app/model/halves.js';
import { CIVIL_FIELDS, TERMS, parseMoment, stepCivil, stepTerm, stepThreshold } from '../public/app/model/travel.js';
import { defaultTerm, describeWave, readWave } from '../public/app/screens/wave/wave-reading.js';
import { A, B, C, cat, frc, makeRandom } from './helpers.js';

const FOCUSES = Array.from({ length: 14 }, (_, level) => level);
/** Anything an Earth clock, calendar or SI unit would leave in a text. */
const EARTH_TEXT = /⊕|\b(UTC|GMT|JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC|MON|TUE|WED|THU|FRI|SAT|SUN|min|Hz|nm|km)\b|\d{1,2}:\d{2}|\b\d+(\.\d+)? ?(s|h|d|m|y)\b|%|20\d\d/;
const stamp = (t) => frc.formatDate(cat.dateAt(t), DateForm.LETTERS, Unit.BLINK);
const isoOf = (t) => frc.formatCivil(frc.civilFromTime(t, 0), 0);
const IOTA = { row: 'pure', index: 6 };
const read = (t, focus = 6, mode = 'pure', view = {}) => readWave(createFrame(frc, cat, t), focus, mode, { selected: IOTA, present: t, away: false, ...view });

/** Every string reachable inside a value. */
function strings(value, out = []) {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) value.forEach((item) => strings(item, out));
  else if (value && typeof value === 'object') Object.values(value).forEach((item) => strings(item, out));
  return out;
}

/** Instants spread over the catalogue, the same every run. */
function instants(count) {
  const random = makeRandom();
  return Array.from({ length: count }, () => random.between(cat.first, cat.last));
}

/* ------------------------------------------------------------------ reading */

test('the WAVE reads vector A: the stamp term by term, the Helion wave, the Sun, the next thresholds', () => {
  const wave = read(A);
  assert.equal(wave.lit, true);
  assert.equal(wave.stamp, 'α#6 β#4 γ#9 δ#3 ε#5 34η 29ι 21λ 3ν');
  assert.deepEqual(wave.terms.map((term) => term.name), ['Alpha', 'Beta', 'Gamma', 'Delta', 'Nuclide', 'Helion', 'Preon', 'Flavon', 'Blink']);
  assert.deepEqual(wave.terms.map((term) => term.text), ['α#6', 'β#4', 'γ#9', 'δ#3', 'ε#5', '34η', '29ι', '21λ', '3ν']);
  // only the selected tumbler shows its neighbours: the Preon before and the Preon after
  assert.deepEqual(wave.terms.map((term) => `${term.previous}|${term.next}`), ['|', '|', '|', '|', '|', '|', '28ι|30ι', '|', '|']);
  assert.deepEqual([wave.title, wave.caption, wave.offset, wave.atNow, wave.earth], ['Helion wave', '9 θ  ·  36 ι', '', true, null]);

  // the Helion that holds the instant: SPEC 12 A gives its END in 6ι 43λ
  assert.deepEqual([wave.wave.name, wave.wave.nextWord, wave.wave.nextSpan], ['ε#5 34η', 'End', '6ι 43λ']);
  assert.deepEqual(wave.wave.thresholds.map((item) => [item.word, item.fraction, item.next, item.earth]), [['Peak', 0.25, false, ''], ['Node', 0.5, false, ''], ['Valley', 0.75, false, ''], ['End', 1, true, '']]);
  assert.deepEqual(wave.wave.thresholds.map((item) => item.time), cat.cyclePoints(6, wave.wave.cycle).slice(1));
  assert.equal(wave.wave.cycle, cat.cycleAt(A, 6).cycle);
  assert.equal(wave.wave.count, cat.cycleCount(6));
  assert.equal(describeWave(wave), 'Helion wave: ε#5 34η. End in 6ι 43λ.');

  // the Sun: sync 4820, Pentad II; the 7th Helion of the sync is in its second half (half 13 of 38)
  assert.deepEqual([wave.sun.number, wave.sun.drift, wave.sun.half, wave.sun.pentadName, wave.sun.nextWord, wave.sun.nextSpan], ['4\u202f820', '−6\u202f235λ', 13, 'Pentad II, 2nd Helion', 'Node', '2η 24ι']);
  assert.ok(wave.sun.progress > 0.62 && wave.sun.progress < 0.64);
  assert.deepEqual(wave.sun.pentads, [
    { index: 0, first: 0, count: 5, numeral: 'I', on: false },
    { index: 1, first: 5, count: 5, numeral: 'II', on: true },
    { index: 2, first: 10, count: 5, numeral: 'III', on: false },
    { index: 3, first: 15, count: 4, numeral: '', on: false }, // the Hypopentad: a square, no numeral
  ]);
  assert.deepEqual(wave.sun.quarters.map((item) => [item.word, item.next, item.earth]), [['Peak', false, ''], ['Node', true, ''], ['Valley', false, ''], ['End', false, '']]);
  assert.equal(wave.sun.quarters[3].time, cat.syncAt(A).end);
  assert.equal(wave.sun.quarters[1].time, cat.syncAt(A).next.time);

  // the list of screen5.png, nearest first (the core floors a span: 43λ 21ν where the brief wrote 44λ)
  assert.deepEqual(wave.upcoming.map((row) => `${row.sun ? 'Sun' : row.symbol} ${row.quarter} ${row.span}`), ['ι Node 11λ 9ν', 'θ Node 43λ 21ν', 'η End 6ι 43λ', 'ζ Peak 1η 33ι', 'Sun Node 2η 24ι', 'ε Node 4η 24ι', 'δ End 43η 6ι', 'γ Valley 4ε 23η']);
  assert.deepEqual(wave.upcoming.map((row) => row.earth), ['', '', '', '', '', '', '', '']);
  // what is shown changes at the end of the running Blink at the latest
  assert.ok(wave.changes.includes(cat.cycleAt(A, 12).end));
  assert.ok(wave.changes.includes(cat.nextThreshold(A, 6).time));
});

test('the default tumbler is the first unit finer than the focus', () => {
  // Alpha -> Beta, Delta -> Nuclide, Helion -> Preon (as in screen5.png), theta -> Preon, kappa -> Flavon, Blink and xi -> Blink
  assert.deepEqual([0, 3, 6, 7, 9, 12, 13].map((focus) => defaultTerm(frc, focus)), [1, 4, 6, 6, 7, 8, 8]);
  assert.deepEqual(TERMS.map((term) => frc.formatUnitSymbol(term.unit)).join(''), 'αβγδεηιλν');
});

test('PURE mode: nothing the WAVE says holds an Earth unit, at any focus, at home or away', () => {
  for (const t of [A, B, C, cat.first, cat.last]) {
    for (const focus of FOCUSES) {
      const wave = read(t, focus, 'pure', { present: A, away: t !== A, selected: { row: 'pure', index: defaultTerm(frc, focus) } });
      for (const text of [...strings(wave), describeWave(wave)]) assert.doesNotMatch(text, EARTH_TEXT, `pure text "${text}" (focus ${focus})`);
    }
  }
});

test('EARTH mode adds the translations of DESIGN.md section 9 (zone: UTC here)', () => {
  const wave = read(A, 6, 'earth', { selected: { row: 'earth', index: CIVIL_FIELDS.indexOf('month') } });
  // the date-time line, field by field; the selected field shows its neighbours
  assert.deepEqual([wave.earth.weekday, wave.earth.zone], ['THU', 'UTC']);
  assert.deepEqual(wave.earth.fields.map((item) => `${item.lead}${item.text}`).join(''), ' 8 OCT 2026 · 12:00:00');
  assert.deepEqual(wave.earth.fields.map((item) => [item.field, item.previous, item.next]), [['day', '', ''], ['month', 'SEP', 'NOV'], ['year', '', ''], ['hour', '', ''], ['minute', '', ''], ['second', '', '']]);
  // clock times under the wave's quarters, dates under the Sun's, a column in the list
  assert.deepEqual(wave.wave.thresholds.map((item) => item.earth), ['09:08:50', '10:24:37', '11:40:25', '12:56:12']);
  assert.deepEqual(wave.sun.quarters.map((item) => item.earth), ['8 OCT 01:34', '9 OCT 01:34', '10 OCT 01:34', '11 OCT 01:33']);
  assert.deepEqual(wave.upcoming.map((row) => row.earth), ['12:01:28', '12:05:40', '12:56:12', '21:46:43', '9 OCT 01:34', '9 OCT 11:40', '17 OCT 14:11', '17 DEC 09:05']);
  // the pure readings stand as they were: Earth is an annotation
  assert.equal(wave.stamp, 'α#6 β#4 γ#9 δ#3 ε#5 34η 29ι 21λ 3ν');
  assert.deepEqual(wave.terms.map((term) => `${term.previous}|${term.next}`).join(''), '|||||||||', 'an Earth field is selected: no term shows neighbours');
  // a short cycle: its thresholds are seconds away, said as signed distances in the core's duration wording,
  // which rounds once, a half up (frc_format_duration): the valley 12.526 s ahead is "+13 s". The web's own Earth
  // shim cut it ("+12 s") before the core wrote durations; the plus is the remaining shim's (shim-earth-text.js)
  assert.deepEqual(read(A, 9, 'earth').wave.thresholds.map((item) => item.earth), ['−38 s', '−13 s', '+13 s', '+38 s']);
});

test('away from the present the WAVE says how far, as a signed span; outside the catalogue it says so', () => {
  const later = read(A + 9200n * 1000000n, 6, 'pure', { present: A, away: true });
  assert.deepEqual([later.offset, later.atNow, later.stamp], ['+18ι 13λ', false, 'α#6 β#4 γ#9 δ#3 ε#5 35η 11ι 34λ 17ν']);
  const earlier = read(A - 9200n * 1000000n, 6, 'pure', { present: A, away: true });
  assert.match(earlier.offset, /^−18ι 1[23]λ$/);
  assert.equal(read(A, 6, 'pure', { present: A, away: true }).offset, '', 'a cursor exactly on the present has no distance');

  // the year 3000: after the last eclipse of Saros 141 (only a frozen link gets here: the cursor is clamped)
  const out = read(frc.fromUnixSeconds(32503680000n));
  assert.deepEqual([out.lit, out.out, out.terms, out.wave, out.sun, out.upcoming, out.changes], [false, 'OUT OF CATALOGUE · α#1 – α#18', [], null, null, [], []]);
  assert.equal(describeWave(out), 'Helion wave. OUT OF CATALOGUE · α#1 – α#18');
  // the catalogue's edges and its partial syncs read without a Sun, not with an error
  for (const t of [cat.first, cat.last]) {
    for (const focus of FOCUSES) {
      const edge = read(t, focus);
      assert.equal(edge.lit, true);
      assert.equal(edge.sun, null, 'no whole sync at the edge');
      assert.equal(edge.upcoming.every((row) => !row.sun), true);
      // at the closing instant nothing comes later: the list has no row without an instant (FRC_TIME_NONE)
      assert.equal(edge.upcoming.every((row) => row.time !== null && row.span !== ''), true, 'no empty row');
      if (t === cat.last) assert.deepEqual(edge.upcoming, []);
    }
  }
});

/* ------------------------------------------------------------- time travel */

test('a tumbler steps its term by whole units and keeps the finer terms; the core carries', () => {
  const steps = TERMS.map((_, index) => [stamp(stepTerm(frc, cat, A, index, 1)), stamp(stepTerm(frc, cat, A, index, -1))]);
  assert.deepEqual(steps, [
    ['α#7 β#4 γ#9 δ#3 ε#5 34η 29ι 21λ 3ν', 'α#5 β#4 γ#9 δ#3 ε#5 34η 29ι 21λ 3ν'],
    ['α#6 β#5 γ#9 δ#3 ε#5 34η 29ι 21λ 3ν', 'α#6 β#3 γ#9 δ#3 ε#5 34η 29ι 21λ 3ν'],
    ['α#6 β#4 γ#10 δ#3 ε#5 34η 29ι 21λ 3ν', 'α#6 β#4 γ#8 δ#3 ε#5 34η 29ι 21λ 3ν'],
    ['α#6 β#4 γ#9 δ#4 ε#5 34η 29ι 21λ 3ν', 'α#6 β#4 γ#9 δ#2 ε#5 34η 29ι 21λ 3ν'],
    // the fifth Nuclide is the last of its Delta: one more is the first of the next Delta
    ['α#6 β#4 γ#9 δ#4 ε#1 34η 29ι 21λ 3ν', 'α#6 β#4 γ#9 δ#3 ε#4 34η 29ι 21λ 3ν'],
    ['α#6 β#4 γ#9 δ#3 ε#5 35η 29ι 21λ 3ν', 'α#6 β#4 γ#9 δ#3 ε#5 33η 29ι 21λ 3ν'],
    ['α#6 β#4 γ#9 δ#3 ε#5 34η 30ι 21λ 3ν', 'α#6 β#4 γ#9 δ#3 ε#5 34η 28ι 21λ 3ν'],
    ['α#6 β#4 γ#9 δ#3 ε#5 34η 29ι 22λ 3ν', 'α#6 β#4 γ#9 δ#3 ε#5 34η 29ι 20λ 3ν'],
    ['α#6 β#4 γ#9 δ#3 ε#5 34η 29ι 21λ 4ν', 'α#6 β#4 γ#9 δ#3 ε#5 34η 29ι 21λ 2ν'],
  ]);
  // carries across more than one term: 77 Helions to a Nuclide, 25 Blinks to a Flavon
  assert.equal(stamp(stepTerm(frc, cat, A, 5, 44)), 'α#6 β#4 γ#9 δ#4 ε#1 1η 29ι 21λ 3ν');
  assert.equal(stamp(stepTerm(frc, cat, A, 8, 22)), 'α#6 β#4 γ#9 δ#3 ε#5 34η 29ι 22λ 0ν');
  // a step is a span the core measures as exactly that unit
  assert.equal(frc.formatSpan(cat.spanBetween(stepTerm(frc, cat, A, 6, -1), stepTerm(frc, cat, A, 6, 1))), '2ι');
  assert.equal(frc.formatSpan(cat.spanBetween(stepTerm(frc, cat, A, 5, -3), stepTerm(frc, cat, A, 5, 0))), '3η');
  // time travel clamps to the catalogue (design ruling 7)
  assert.equal(stepTerm(frc, cat, A, 0, 99), cat.last);
  assert.equal(stepTerm(frc, cat, A, 0, -99), cat.first);
  assert.equal(stepTerm(frc, cat, cat.last, 8, 1), cat.last);
  assert.equal(stepTerm(frc, cat, cat.first, 8, -1), cat.first);
});

test('a step forward and the same step back return to the Blink it left, at 300 instants and every term', () => {
  for (const t of instants(300)) {
    const home = cat.dateToTime(cat.dateAt(t));
    for (let index = 0; index < TERMS.length; index++) {
      const there = stepTerm(frc, cat, t, index, 1);
      if (there === cat.last) continue; // stopped at the edge
      assert.ok(there > t, `term ${index}: later`);
      // every finer term is as it was
      const [from, to] = [cat.dateAt(t), cat.dateAt(there)];
      for (let finer = index + 1; finer < TERMS.length; finer++) assert.equal(to[TERMS[finer].field], from[TERMS[finer].field]);
      assert.equal(stepTerm(frc, cat, there, index, -1), home, `term ${index} at ${t}`);
    }
  }
});

test('an Earth tumbler steps a civil field (UTC here): months and days by the calendar, clock fields by elapsed time', () => {
  const steps = [['year', 1], ['month', 3], ['month', -10], ['day', -8], ['day', 24], ['hour', -13], ['minute', 61], ['second', -1]];
  assert.deepEqual(
    steps.map(([field, delta]) => isoOf(stepCivil(frc, A, field, delta))),
    ['2027-10-08T12:00:00.000Z', '2027-01-08T12:00:00.000Z', '2025-12-08T12:00:00.000Z', '2026-09-30T12:00:00.000Z', '2026-11-01T12:00:00.000Z', '2026-10-07T23:00:00.000Z', '2026-10-08T13:01:00.000Z', '2026-10-08T11:59:59.000Z'],
  );
  assert.deepEqual(CIVIL_FIELDS, ['year', 'month', 'day', 'hour', 'minute', 'second']);
});

test('the keys of the wave: to the next and the previous threshold, exactly', () => {
  const points = cat.cyclePoints(6, cat.cycleAt(A, 6).cycle); // start, peak, node, valley, end
  assert.equal(stepThreshold(frc, cat, A, 6, 1), points[4]);
  assert.equal(stamp(stepThreshold(frc, cat, A, 6, 1)), 'α#6 β#4 γ#9 δ#3 ε#5 35η 0ι 0λ 0ν');
  assert.equal(stepThreshold(frc, cat, A, 6, -1), points[3]);
  assert.equal(stamp(points[3]), 'α#6 β#4 γ#9 δ#3 ε#5 34η 27ι 0λ 0ν');
  // from a threshold: the one before it, also across the start of the cycle
  assert.equal(stepThreshold(frc, cat, points[3], 6, -1), points[2]);
  assert.equal(stamp(stepThreshold(frc, cat, points[0], 6, -1)), 'α#6 β#4 γ#9 δ#3 ε#5 33η 27ι 0λ 0ν');
  assert.equal(stepThreshold(frc, cat, cat.first, 6, -1), null);
  assert.equal(stepThreshold(frc, cat, cat.last, 6, 1), null);
  for (const t of instants(100)) {
    for (const level of [0, 4, 6, 9, 13]) {
      const before = stepThreshold(frc, cat, t, level, -1);
      if (before === null) continue;
      assert.ok(before < t);
      // nothing lies between: the next threshold after it is at or after t
      assert.ok(cat.nextThreshold(before, level).time >= t, `level ${level} at ${t}`);
    }
  }
});

test('"go to" reads everything frc_parse_date reads; an Earth date only in EARTH mode', () => {
  const go = (text, earth = false) => {
    const result = parseMoment(frc, cat, text, A, earth);
    return 'instant' in result ? stamp(result.instant) : result.error;
  };
  assert.equal(go('α#6 β#4 γ#9 δ#3 ε#5 34η 29ι 21λ 3ν'), 'α#6 β#4 γ#9 δ#3 ε#5 34η 29ι 21λ 3ν');
  assert.equal(go('  a#6 b#4 g#9 d#3 e#5 34h 29i  '), 'α#6 β#4 γ#9 δ#3 ε#5 34η 29ι 0λ 0ν', 'plain letters; missing fine parts are the start');
  assert.equal(go('Alpha Hexafracton Valley, Beta Tetrafracton Valley, Gamma Nonafracton Valley, Delta Trifracton End, ε#5 34η 29ι'), 'α#6 β#4 γ#9 δ#3 ε#5 34η 29ι 0λ 0ν');
  // a short form is completed from the moment shown
  assert.equal(go('35η'), 'α#6 β#4 γ#9 δ#3 ε#5 35η 0ι 0λ 0ν');
  assert.equal(go('Delta Tetrafracton Peak ε#2'), 'α#6 β#4 γ#9 δ#4 ε#2 1η 0ι 0λ 0ν');
  assert.equal(go('a#7 b#2'), 'α#7 β#2 γ#1 δ#1 ε#1 1η 0ι 0λ 0ν');
  assert.deepEqual([go(''), go('   '), go('nonsense'), go('a6'), go('a#99'), go('a#18 b#5')], ['empty', 'empty', 'parse', 'parse', 'range', 'range']);
  // Earth dates: not a moment in PURE mode, read in EARTH mode (zone UTC here)
  assert.deepEqual([go('2030-01-01'), go('8 Oct 2026 12:00:30'), go('12:00')], ['parse', 'parse', 'parse']);
  assert.equal(go('2026-10-08 12:00', true), 'α#6 β#4 γ#9 δ#3 ε#5 34η 29ι 21λ 3ν');
  assert.equal(go('2026-10-08T12:00:30', true), 'α#6 β#4 γ#9 δ#3 ε#5 34η 29ι 24λ 24ν');
  assert.equal(go('8 Oct 2026 12:00:30', true), 'α#6 β#4 γ#9 δ#3 ε#5 34η 29ι 24λ 24ν');
  assert.equal(go('8 OCTOBER 2026', true), stamp(frc.fromUnixSeconds(1791417600n)));
  assert.deepEqual([go('1200-01-01', true), go('2026-13-01', true), go('31.12.2026', true)], ['range', 'parse', 'parse']);
  // a Fractonica date still reads in EARTH mode
  assert.equal(go('35η', true), 'α#6 β#4 γ#9 δ#3 ε#5 35η 0ι 0λ 0ν');
});

test('go to: what is not a moment is said so, never "out of catalogue", and nothing throws', () => {
  const go = (text, earth = false) => {
    const result = parseMoment(frc, cat, text, A, earth);
    return 'instant' in result ? isoOf(result.instant) : result.error;
  };
  // FRC_ERR_ARG: a field out of its range in text that is a date (a Delta has five Nuclides; there is no α#0),
  // and a NUL the binding refuses: none is a moment outside the catalogue
  assert.deepEqual([go('α#6 β#4 γ#9 δ#3 ε#6'), go('α#0'), go('x\u0000y'), go('a#6 b#4 g#9 d#3 e#5 78h')], ['parse', 'parse', 'parse', 'parse']);
  // FRC_ERR_BUFFER from text longer than the module's scratch: refused before the core, and never thrown
  assert.equal(go('a'.repeat(6000)), 'parse');
  assert.equal(go('😀'.repeat(6000), true), 'parse');
  assert.equal(go(`α#6 ${' '.repeat(190)}`), go('α#6'), 'surrounding spaces do not count towards the limit');
  // the range is still the range
  assert.deepEqual([go('a#99'), go('a#18 b#5')], ['range', 'range']);
  // Earth dates the calendar does not have are not rolled over into the next month
  assert.deepEqual([go('31 FEB 2026', true), go('2026-02-29', true), go('2026-04-31 10:00', true), go('2026-02-30', true)], ['parse', 'parse', 'parse', 'parse']);
  assert.equal(go('29 FEB 2028', true), '2028-02-29T00:00:00.000Z');
  assert.equal(go('2026-12-31 23:59:59', true), '2026-12-31T23:59:59.000Z');
});

/* ------------------------------------------------------ the scrub */

test('a scrub\'s place in a cycle is the core\'s instant at that phase (timeAtPhase), read back as that place', () => {
  // wave-field.js: cat.timeAtPhase(level, cycle, frc.fracFromDouble(fraction)) ?? cat.last
  const at = (level, cycle, fraction) => cat.timeAtPhase(level, cycle, frc.fracFromDouble(fraction)) ?? cat.last;
  const helion = cat.cycleAt(A, 6);
  const points = cat.cyclePoints(6, helion.cycle);
  // at the quarters it IS the core's instant; 1 is the last phase of the cycle, a microsecond before its end at most
  assert.deepEqual([0, 0.25, 0.5, 0.75].map((fraction) => at(6, helion.cycle, fraction)), points.slice(0, 4));
  assert.ok(points[4] - at(6, helion.cycle, 1) <= (points[4] - points[0]) / 2n ** 32n + 1n);
  assert.equal(at(6, helion.cycle, -3), points[0], 'clamped');
  assert.deepEqual([frc.fracFromDouble(-3), frc.fracFromDouble(0.5), frc.fracFromDouble(7)], [0, frc.constants.FRAC_HALF, 0xffffffff]);
  const random = makeRandom(7n);
  for (const t of instants(120)) {
    for (const level of [0, 2, 4, 6, 8, 10, 12, 13]) {
      const cycle = cat.cycleAt(t, level);
      if (cycle.clipped) continue; // the catalogue's last cycle ends early
      const fraction = Number(random.between(0n, 999999n)) / 1e6;
      const instant = at(level, cycle.cycle, fraction);
      const back = cat.cycleAt(instant, level);
      // the first microsecond at or after the phase: one microsecond is 2.3e-5 of a xi and far less of anything longer
      const grain = level >= 12 ? 1e-4 : 1e-6;
      assert.equal(back.cycle, cycle.cycle, `level ${level}`);
      assert.ok(back.fraction >= fraction - 1e-9 && back.fraction - fraction < grain, `level ${level}: ${back.fraction} for ${fraction}`);
    }
  }
  // beyond the closing instant of the catalogue's last, clipped cycle there is nothing: the closing instant
  const last = cat.cycleAt(cat.last, 0);
  assert.equal(last.clipped, true);
  assert.equal(at(0, last.cycle, 0.99), cat.last);

  // the Sun lane (wave-sun.js): cat.timeAtSyncPhase, the sync's end at the far edge
  const sync = cat.syncAt(A);
  assert.equal(cat.timeAtSyncPhase(sync.sync, 0), sync.start);
  for (const fraction of [0.1, 0.358662585, 0.5, 0.9]) {
    const back = cat.syncAt(cat.timeAtSyncPhase(sync.sync, frc.fracFromDouble(fraction)));
    assert.equal(back.sync, sync.sync);
    assert.ok(back.fraction >= fraction - 1e-9 && back.fraction - fraction < 1e-9);
  }
});

/* --------------------------------------------------- half-cycles, geometry */

test('waveSteps: the running half of the focused cycle and the path inside it, by the header\'s rule', () => {
  const frame = createFrame(frc, cat, A);
  // the Helion is at 0.8146 of its cycle: its second half, 0.629 through; theta 8 of 9 is in its first
  // half, which is arc 14 of the ring's 18 and arc 5 of the second half's 9; the Preon is the 3rd of 4 there
  const helion = waveSteps(frame, 6, 2);
  assert.equal(helion.half, 1);
  assert.ok(Math.abs(helion.progress - 0.6291782) < 1e-6);
  assert.deepEqual(helion.steps.map((step) => step.local), [5, 2]);
  assert.deepEqual(ringSteps(frame, 6, 2).map((step) => step.local), [14, 2]);
  assert.deepEqual(waveSteps(frame, 7, 2).steps.map((step) => step.local), [2, 3]);
  assert.equal(waveSteps(frame, 7, 2).half, 0);
  assert.equal(waveSteps(createFrame(frc, cat, frc.fromUnixSeconds(32503680000n)), 6, 2), null);

  for (const t of instants(60)) {
    const at = createFrame(frc, cat, t);
    for (const focus of FOCUSES) {
      const now = waveSteps(at, focus, 3);
      const cycle = at.cycle(focus);
      assert.equal(now.half, cycle.fraction >= 0.5 ? 1 : 0);
      // the first step is the arc that floor(progress x arcs) names, as on a ring
      const m = frc.factor(focus);
      assert.ok(now.steps[0].local >= 0 && now.steps[0].local < m);
      assert.equal(now.steps[0].local, Math.min(m - 1, Math.floor(now.progress * m)), `focus ${focus} at ${t}`);
      now.steps.forEach((step, d) => {
        if (d > 0) assert.ok(step.local >= 0 && step.local < frc.factor(focus + d));
        assert.ok(step.progress >= 0 && step.progress < 1);
      });
    }
  }
});

test('a wave cell: two halves of the core\'s wave roots, joined end to end, fitted to a band', () => {
  const near = (a, b, why) => assert.ok(Math.abs(a - b) < 0.01, `${why}: ${a} vs ${b}`);
  for (const focus of FOCUSES) {
    const cell = buildWaveCell(frc, focus, 52, 3);
    assert.equal(cell.width, 208, 'the design: one cycle is four radii wide');
    assert.equal(cell.halves.length, 2);
    const m = frc.factor(focus);
    cell.halves.forEach((nest, half) => {
      // the carrier is the core's root: a semicircle on the axis, the first above it and the second below
      near(nest.carrier.cx, (2 * half + 1) * 52, 'centre');
      near(nest.carrier.cy, 0, 'on the axis');
      near(frc.arcPoint(nest.carrier, 0.5).y, half === 0 ? -52 : 52, 'bulge');
      assert.equal(nest.layers[0].arcs.length, m);
      // the children run along the carrier without a gap, from its first point to its last
      const first = nest.layers[0].arcs;
      near(frc.arcPoint(first[0], 0).x, half * 104, 'start');
      near(frc.arcPoint(first[m - 1], 1).x, half * 104 + 104, 'end');
      for (let j = 1; j < m; j++) {
        const [end, start] = [frc.arcPoint(first[j - 1], 1), frc.arcPoint(first[j], 0)];
        near(end.x, start.x, `focus ${focus} join ${j}`);
        near(end.y, start.y, `focus ${focus} join ${j}`);
      }
      // parity of the GLOBAL half index: the second half of a cycle with an odd factor begins on an odd arc
      assert.equal(nest.lead, (half * m) % 2);
      assert.deepEqual([...nest.layers[0].odd], Array.from({ length: m }, (_, j) => (half * m + j) % 2));
    });
    // the ink stays inside the band it was fitted to, at the largest size that does
    const fitted = fitWaveCell(frc, focus, 52, 82, 3);
    assert.ok(fitted.reach <= 82.01, `focus ${focus}: reach ${fitted.reach}`);
    assert.ok(fitted.radius <= 52);
    if (cell.reach <= 82) assert.equal(fitted.radius, 52);
    // and the point of now lies on the deepest arc drawn
    const now = waveSteps(createFrame(frc, cat, A), focus, fitted.halves[0].layers.length);
    const nest = fitted.halves[now.half];
    const point = nowPoint(frc, nest, nestPath(nest, now.steps));
    assert.ok(point.x >= now.half * 2 * fitted.radius - fitted.reach && point.x <= (now.half + 1) * 2 * fitted.radius + fitted.reach);
    assert.ok(Math.abs(point.y) <= fitted.reach);
  }
  // the Helion's cell is the picture of screen5.png: 9 theta arcs per half, 4 Preons on each
  assert.deepEqual(buildWaveCell(frc, 6, 52, 2).halves.map((nest) => nest.layers.map((layer) => layer.arcs.length)), [[9, 36], [9, 36]]);
});

test('the Sun lane: 38 half-Helions across the width, its marks clear of the arcs at any size', () => {
  const halves = 2 * frc.constants.SYNC_CYCLES;
  assert.equal(halves, 38);
  // the reference phone: a lane 353 px wide has arcs 4.6 px high, its axis 27 px down (DESIGN.md: y 232)
  const phone = sunLaneBox(353, halves);
  assert.ok(Math.abs(phone.axis - 27) < 0.1);
  assert.equal(phone.height, 66);
  // a wide lane has larger arcs and is higher by as much above and below
  const wide = sunLaneBox(1064, halves);
  assert.ok(Math.abs(wide.axis - (14 + SUN_LANE.above)) < 0.01);
  assert.ok(wide.height - wide.axis >= 14 + SUN_LANE.below - SUN_LANE.arc);
});

test('the Quarter enum orders a cycle\'s thresholds as the wave draws them', () => {
  assert.deepEqual(read(A).wave.thresholds.map((item) => item.quarter), [Quarter.PEAK, Quarter.NODE, Quarter.VALLEY, Quarter.END]);
});
