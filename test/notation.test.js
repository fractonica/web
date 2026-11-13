/**
 * SPEC.md section 15.6: the notation vectors, typed in from the specification,
 * and the worked examples of 15.3 - 15.5 that the clock screens print.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DateForm, FractonicaError, LevelKind, Medium, PentadForm, Quarter, Unit } from '../public/lib/fractonica.js';
import { A, ANCHOR_PLUS_1S, B, C, cat, frc } from './helpers.js';

/** SPEC 15.6, the table. */
const VECTORS = [
  {
    name: 'A',
    t: A,
    full: 'Alpha Hexafracton Valley, Beta Tetrafracton Valley, Gamma Nonafracton Valley, Delta Trifracton End, ε#5 34η 29ι 21λ 3ν',
    short: 'Delta Trifracton End ε#5 34η 29ι',
    pair: [13, 0],
  },
  {
    name: 'B',
    t: B,
    full: 'Alpha Hexafracton Node, Beta Difracton End, Gamma Didecafracton Node, Delta Trifracton Node, ε#2 21η 12ι 6λ 5ν',
    short: 'Delta Trifracton Node ε#2 21η 12ι',
    pair: [5, 6],
  },
  {
    name: 'C',
    t: C,
    full: 'Alpha Heptafracton Peak, Beta Difracton Peak, Gamma Monofracton End, Delta Pentafracton Peak, ε#2 1η 23ι 1λ 21ν',
    short: 'Delta Pentafracton Peak ε#2 1η 23ι',
    pair: [10, 3],
  },
  {
    name: 'Anchor + 1 s',
    t: ANCHOR_PLUS_1S,
    full: 'Alpha Hexafracton Peak, Beta Monofracton Peak, Gamma Monofracton Peak, Delta Monofracton Peak, ε#1 1η 0ι 0λ 3ν',
    short: 'Delta Monofracton Peak ε#1 1η 0ι',
    pair: [0, 0],
  },
];

for (const vector of VECTORS) {
  test(`SPEC 15.6 vector ${vector.name}: full date, short date, Helion pair`, () => {
    const date = cat.dateAt(vector.t);
    assert.equal(frc.formatDate(date, DateForm.FULL, Unit.BLINK), vector.full);
    assert.equal(frc.formatDate(date, DateForm.SHORT, Unit.PREON), vector.short);
    // "The Helion pair is the depth-7 odometer of §12"
    assert.deepEqual([...cat.odometerAt(vector.t, 6, 2, 2).digits], vector.pair);

    // the full date reads back, and names the Blink that holds the instant
    const { date: parsed, finest } = frc.parseDate(vector.full);
    assert.equal(finest, Unit.BLINK);
    const blinkStart = cat.dateToTime(parsed);
    assert.ok(blinkStart <= vector.t && vector.t - blinkStart < 312000n, 'a Blink is 310.92 ms');
  });
}

test('SPEC 15.6: the stamp at A, and the depth-7 end as the span 6ι 43λ', () => {
  const date = cat.dateAt(A);
  assert.equal(frc.formatDate(date, DateForm.LETTERS, Unit.BLINK), 'α#6 β#4 γ#9 δ#3 ε#5 34η 29ι 21λ 3ν');
  assert.deepEqual(
    { ...date, quarters: [...date.quarters] },
    { alpha: 6, beta: 4, gamma: 9, delta: 3, epsilon: 5, eta: 34, iota: 29, lambda: 21, nu: 3, quarters: [2, 2, 2, 3] },
  );
  // "At A the depth-7 end is 3,372.428 s away (§12), which is the span 6ι 43λ"
  const end = cat.nextThreshold(A, 6);
  assert.equal(frc.formatQuarter(end.name), 'End');
  assert.equal(frc.formatSpan(cat.spanBetween(A, end.time)), '6ι 43λ');
  // the same for depth 8: the node is 340.937 s away, 1096.5 Blinks. A span is
  // counted greedily and never rounded up (SPEC 15.4), so it reads "43λ 21ν",
  // and "43λ" with one part; the design brief's "44λ" is that figure rounded.
  const node = cat.nextThreshold(A, 7);
  assert.equal(frc.formatQuarter(node.name), 'Node');
  assert.equal(frc.formatSpan(cat.spanBetween(A, node.time)), '43λ 21ν');
  assert.equal(frc.formatSpan(cat.spanBetween(A, node.time), 1), '43λ');
});

test('SPEC 15.3: the four forms of a date, and the header examples at A', () => {
  const date = cat.dateAt(A);
  assert.equal(frc.formatDate(date, DateForm.LETTERS, Unit.PREON), 'α#6 β#4 γ#9 δ#3 ε#5 34η 29ι');
  assert.equal(frc.formatDate(date, DateForm.SHORT_LETTERS, Unit.PREON), 'δ#3 ε#5 34η 29ι');
  assert.equal(frc.formatDate(date, DateForm.SHORT, Unit.PREON), 'Delta Trifracton End ε#5 34η 29ι');
  // the defaults are the full form down to the Blink
  assert.equal(frc.formatDate(date), VECTORS[0].full);
  // ASCII shorthand reads back to the same Preon
  const { date: parsed, finest } = frc.parseDate('a#6 b#4 g#9 d#3 e#5 34h 29i');
  assert.equal(finest, Unit.PREON);
  assert.equal(frc.formatDate(parsed, DateForm.LETTERS, Unit.PREON), 'α#6 β#4 γ#9 δ#3 ε#5 34η 29ι');
  // a short form takes its majors from the context
  const short = frc.parseDate('δ#3 ε#5 34η 29ι', date);
  assert.deepEqual([short.date.alpha, short.date.beta, short.date.gamma], [6, 4, 9]);
  assert.throws(() => frc.parseDate('δ#3 ε#5 34η 29ι'), (error) => error instanceof FractonicaError && error.status === 'FRC_ERR_PARSE');
  assert.equal(frc.toAscii('α#6 β#4 γ#9 δ#3 ε#5 34η 29ι'), 'a#6 b#4 g#9 d#3 e#5 34h 29i');
});

test('SPEC 15.2 - 15.3: ordinals and cycle names', () => {
  assert.equal(frc.formatOrdinal(1), 'Monofracton');
  assert.equal(frc.formatOrdinal(3), 'Trifracton');
  assert.equal(frc.formatOrdinal(11), 'Didecafracton');
  assert.equal(frc.formatOrdinal(12), 'Dodecafracton');
  assert.equal(frc.formatOrdinal(20), 'Icosafracton');
  assert.equal(frc.formatOrdinal(25), '#25');
  // at A: the Delta, the Nuclide, the Helion and the theta cycle that are running
  assert.equal(frc.formatCycleName(3, cat.cycleAt(A, 3).cycle), 'Delta Trifracton');
  assert.equal(frc.formatCycleName(3, cat.cycleAt(A, 3).cycle, true), 'δ#3');
  assert.equal(frc.formatCycleName(4, cat.cycleAt(A, 4).cycle), 'ε#5');
  assert.equal(frc.formatCycleName(6, cat.cycleAt(A, 6).cycle), 'ε#5 34η');
  assert.equal(frc.formatCycleName(6, cat.cycleAt(A, 6).cycle, true), '34η');
  assert.equal(frc.formatCycleName(7, cat.cycleAt(A, 7).cycle), 'ε#5 34η 28ι'); // θ starts on multiples of 4ι
});

test('SPEC 7.5: the Pentad at A in its three forms', () => {
  const pentad = cat.pentadAt(A);
  assert.deepEqual([pentad.sync, pentad.index, pentad.helion, pentad.helions], [4820, 1, 2, 5]);
  assert.equal(frc.formatPentad(pentad, PentadForm.FULL), 'Pentad II');
  assert.equal(frc.formatPentad(pentad, PentadForm.FULL, true), 'Pentad II, 2nd Helion');
  assert.equal(frc.formatPentad(pentad, PentadForm.SHORT), '⬠II');
  assert.equal(frc.formatPentad(pentad, PentadForm.SHORT, true), '⬠II·2');
  assert.equal(frc.formatPentad(pentad, PentadForm.ASCII, true), 'P2.2');
  assert.equal(frc.formatPentad(cat.pentadByNumber(4820, 3), PentadForm.SHORT), '◻'); // the Hypopentad
  // the numeral alone, for a drawn mark (new in the core; form 3 was refused before): "" for the Hypopentad
  assert.equal(frc.formatPentad(pentad, PentadForm.NUMERAL), 'II');
  assert.equal(frc.formatPentad(cat.pentadByNumber(4820, 3), PentadForm.NUMERAL), '');
  assert.throws(() => frc.formatPentad(pentad, 4), (error) => error.status === 'FRC_ERR_ARG');
  // where a Pentad stands in its sync, and the running Helion's place there (frc_pentad_t.first, frc_sync_t.helion)
  assert.deepEqual([0, 1, 2, 3].map((index) => cat.pentadByNumber(4820, index).first), [0, 5, 10, 15]);
  assert.equal(pentad.first, 5);
  assert.equal(cat.syncAt(A).helion, pentad.first + pentad.helion - 1);
});

test('SPEC 15.3 - 15.4: stamp terms, signed spans, spans in one unit, a countdown\'s next change', () => {
  const date = cat.dateAt(A);
  const terms = Object.values(Unit).map((unit) => frc.formatDateTerm(date, unit));
  assert.deepEqual(terms, ['α#6', 'β#4', 'γ#9', 'δ#3', 'ε#5', '34η', '29ι', '21λ', '3ν']);
  assert.equal(terms.join(' '), frc.formatDate(date, DateForm.LETTERS, Unit.BLINK));
  // the lens's thresholds at A: a later one led by "+", an earlier one by the core's minus
  const end = cat.nextThreshold(A, 7).time;
  assert.equal(frc.formatSpanSigned(cat.spanBetween(A, cat.nextThreshold(A, 6).time)), '+6ι 43λ');
  assert.equal(frc.formatSpanSigned(cat.spanBetween(A, end)), '+43λ 21ν');
  assert.equal(frc.formatSpanSigned(cat.spanBetween(A, A)), '0ν');
  assert.equal(frc.formatSpanSigned(cat.spanBetween(A, A + 1n)), '<0.001ν');
  assert.equal(frc.formatSpanSigned(cat.spanBetween(A + 1n, A)), '<0.001ν');
  const helion = cat.cycleAt(A, 6);
  assert.equal(frc.formatSpanSigned(cat.spanBetween(helion.end, helion.start)), '−1η');
  assert.equal(frc.formatSpanInUnit(frc.spanOfLevel(6), Unit.FLAVON), '2\u202f340λ');
  assert.equal(frc.formatSpanInUnit(cat.spanBetween(helion.end, helion.start), Unit.FLAVON), '−2\u202f340λ');
  assert.equal(frc.formatSpanInUnit(frc.spanOfLevel(12), Unit.FLAVON), '0λ'); // cut, never "−0λ"
  // a countdown sleeps until its text changes: then the text differs, a microsecond before it does not
  const next = cat.spanNextChange(A, end);
  const at = (t) => frc.formatSpan(cat.spanBetween(t, end));
  assert.ok(next > A && next <= end);
  assert.notEqual(at(next), at(A));
  assert.equal(at(next - 1n), at(A));
  assert.equal(cat.spanNextChange(end, end), null);
  // ... and a span that grows (an elapsed time, a signed span past its threshold): the same instants, from the
  // other side; "0ν" at the origin lasts one microsecond, then "<0.001ν"
  const since = (t) => frc.formatSpan(cat.spanBetween(helion.start, t));
  assert.equal(cat.spanNextChangeSince(helion.start, helion.start), helion.start + 1n);
  assert.equal(since(helion.start + 1n), '<0.001ν');
  const grows = cat.spanNextChangeSince(helion.start, A);
  assert.ok(grows > A);
  assert.notEqual(since(grows), since(A));
  assert.equal(since(grows - 1n), since(A));
  assert.equal(cat.spanNextChangeSince(A, helion.start), null); // t before the origin: spanNextChange's side
  // a signed threshold once it is past: "0ν" at the threshold, "<0.001ν" the microsecond after
  assert.equal(cat.spanNextChangeSince(end, end), end + 1n);
  assert.equal(frc.formatSpanSigned(cat.spanBetween(end + 1n, end)), '<0.001ν');
});

test('SPEC 6.2, 7.1: glyph states at the thresholds, and instants at a phase', () => {
  assert.deepEqual([Quarter.PEAK, Quarter.NODE, Quarter.VALLEY, Quarter.END].map((q) => frc.glyphAtQuarter(q, 2).index), [4, 8, 12, 0]);
  assert.equal(frc.glyphAtQuarter(Quarter.NODE, 2).dotted, true);
  const helion = cat.cycleAt(A, 6);
  const points = cat.cyclePoints(6, helion.cycle);
  const { FRAC_QUARTER, FRAC_HALF } = frc.constants;
  assert.deepEqual(
    [0, FRAC_QUARTER, FRAC_HALF, FRAC_HALF + FRAC_QUARTER].map((phase) => cat.timeAtPhase(6, helion.cycle, phase)),
    points.slice(0, 4),
  );
  // the inverse of cycleAt's phase: the first microsecond at that phase
  const back = cat.timeAtPhase(6, helion.cycle, helion.phase);
  assert.ok(back <= A && cat.cycleAt(back, 6).phase >= helion.phase && cat.cycleAt(back - 1n, 6).phase < helion.phase);
  const sync = cat.syncAt(A);
  assert.equal(cat.timeAtSyncPhase(sync.sync, 0), sync.start);
  assert.ok(cat.timeAtSyncPhase(sync.sync, sync.phase) <= A);
  assert.equal(cat.timeAtSyncPhase(-40000, 0), null); // a sync before the catalogue
});

test('SPEC 15.4: exact cycle lengths as spans', () => {
  const span = (level) => frc.formatSpan(frc.spanOfLevel(level));
  // "ζ = 11η, θ = 4ι, κ = 13λ, μ = 5ν, and ξ = 0.14ν"
  assert.deepEqual([5, 7, 9, 11, 13].map(span), ['11η', '4ι', '13λ', '5ν', '0.14ν']);
  // "depths 1–5, 7, 9, 11 and 13 are one unit each"
  assert.deepEqual([0, 1, 2, 3, 4, 6, 8, 10, 12].map(span), ['1α', '1β', '1γ', '1δ', '1ε', '1η', '1ι', '1λ', '1ν']);
  // a cycle's start -> end is its length exactly
  const helion = cat.cycleAt(A, 6);
  assert.equal(frc.formatSpan(cat.spanBetween(helion.start, helion.end)), '1η');
  assert.equal(frc.formatSpan(cat.spanBetween(helion.end, helion.start)), '−1η');
  assert.deepEqual(
    frc.spanParts(cat.spanBetween(A, cat.nextThreshold(A, 6).time), 2).map((part) => [part.unit, part.count]),
    [[Unit.PREON, 6n], [Unit.FLAVON, 43n]],
  );
});

test('SPEC 15.5: Blinks and pB', () => {
  // "ξ 7, ο 77, π 693 and ρ 2,772 pB"
  assert.deepEqual([13, 14, 15, 16].map((level) => frc.levelPerBlink(level)), [
    { num: 7n, den: 1n }, { num: 77n, den: 1n }, { num: 693n, den: 1n }, { num: 2772n, den: 1n },
  ]);
  assert.equal(frc.formatPerBlink(2772, 1), '2\u202f772 pB');
  assert.deepEqual(frc.levelPerBlink(6), { num: 1n, den: 58500n });
  assert.equal(frc.formatPerBlink(1, 58500), '1 per 58\u202f500 Blinks');
  // "The natural presets are whole counts: 5ν (5×), λ (25×), 13λ (325×), ι (1,625×), 4ι (6,500×), η (58,500×), 11η (643,500×)"
  assert.deepEqual(
    Array.from({ length: 8 }, (_, i) => frc.ratePreset(i).factor),
    [1n, 5n, 25n, 325n, 1625n, 6500n, 58500n, 643500n],
  );
  assert.equal(frc.formatRate(frc.ratePreset(0)), 'real time');
  assert.equal(frc.formatRate(frc.ratePreset(5)), '4ι per Blink');
});

test('pure wording (design rulings 2 - 3): counts, a level in a unit, rates, light-spans', () => {
  // grouped numbers are separated by U+202F NARROW NO-BREAK SPACE, written \u202f here so that it shows
  assert.equal(frc.formatCount(58500), '58\u202f500');
  assert.equal(frc.formatCount(142033641750000n), '142\u202f033\u202f641\u202f750\u202f000');
  // the Helion: "58 500ν" in Blinks, "2 340λ" in Flavons, "36ι" in Preons, "1η"
  assert.deepEqual(
    [Unit.BLINK, Unit.FLAVON, Unit.PREON, Unit.HELION].map((unit) => frc.formatLevelInUnit(6, unit)),
    ['58\u202f500ν', '2\u202f340λ', '36ι', '1η'],
  );
  assert.equal(frc.formatLevelInUnit(5, Unit.HELION), '11η');
  assert.throws(() => frc.formatLevelInUnit(6, Unit.NUCLIDE), (error) => error.status === 'FRC_ERR_ARG');
  // rates: a rung finer than the Blink by its exact rate, a coarser one as "1 per N Blinks"
  assert.equal(frc.formatLevelRate(13), '7 pB');
  assert.equal(frc.formatLevelRate(16), '2\u202f772 pB');
  assert.equal(frc.formatLevelRate(29), '142\u202f033\u202f641\u202f750\u202f000 pB');
  assert.equal(frc.formatLevelRate(29, 4), '1.420 × 10¹⁴ pB');
  assert.equal(frc.formatLevelRate(6), '1 per 58\u202f500 Blinks');
  // one Helion in each medium of SPEC 16.3 (fractonica.h, frc_format_light_span)
  assert.deepEqual(
    Object.values(Medium).map((medium) => frc.formatLightSpan(6, frc.mediumSpeed(medium))),
    ['1η', '24ι 1λ', '3.5ν', '2.05ξ', '5.15ο', '1.80ο', '6.15χ'],
  );
  assert.equal(frc.formatLightSpan(6, frc.mediumSpeed(Medium.BOUNDED), true), '24ι 1λ light');
  assert.equal(frc.formatLightSpan(6, frc.mediumSpeed(Medium.VACUUM), true), '1η light');
  assert.equal(frc.formatLightWord(), 'light');
  // rates below one pB with a whole reciprocal are "1 per N Blinks" (changed in the core: (1, 25) was "0.04 pB")
  assert.equal(frc.formatLevelRate(10), '1 per 25 Blinks');
  assert.equal(frc.formatLevelRate(11), '1 per 5 Blinks');
  assert.equal(frc.formatPerBlink(2, 50), '1 per 25 Blinks');
  assert.equal(frc.formatPerBlink(3, 4), '0.75 pB');
  // what a level is and where it stands
  assert.deepEqual(Object.values(LevelKind).map((kind) => frc.formatLevelKind(kind)), ['major', 'unit', 'between', 'sub-Blink']);
  assert.equal(frc.formatCountSigned(-3), '−3');
  assert.equal(frc.formatCountSigned(4820), '4\u202f820');
  assert.equal(frc.formatCyclePlace(cat.cycleAt(A, 7)), '8 of 9');
  assert.equal(frc.formatLevelChildren(6), '9 θ');
  assert.equal(frc.formatLevelInParent(6), '11 in ζ');
  assert.equal(frc.formatUnitInParent(Unit.HELION), '77 in ε');
  assert.equal(frc.formatPrefixFactors(6), '125\u202f125 = 5 · 13 · 5 · 5 · 7 · 11');
  assert.equal(frc.formatPrefixFactors(0), '1');
  assert.ok(frc.formatPrefixFactors(62).startsWith(frc.formatPrefix(62).replace(/\B(?=(\d{3})+$)/g, '\u202f')));
  assert.throws(() => frc.formatLevelChildren(62), (error) => error.status === 'FRC_ERR_ARG');
  assert.throws(() => frc.formatLevelInParent(0), (error) => error.status === 'FRC_ERR_ARG');
});

test('no Earth unit in any pure wording of any level', () => {
  // design/README.md ruling 11: pure mode shows no second, hertz or metre
  const earth = /\b(s|ms|min|h|d|y|Hz|m|km|nm)\b|%/;
  for (let level = 0; level < frc.constants.LEVEL_COUNT; level++) {
    const texts = [frc.formatLevelRate(level), frc.formatLevelRate(level, 4), frc.formatSpan(frc.spanOfLevel(level))];
    for (const medium of Object.values(Medium)) texts.push(frc.formatLightSpan(level, frc.mediumSpeed(medium), true));
    for (const text of texts) assert.doesNotMatch(text, earth, `level ${level}: ${text}`);
  }
});
