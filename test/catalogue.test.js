/**
 * The LADDER and the LENS, without a browser: what they READ (model/rungs.js,
 * screens/lens/lens-reading.js, the ladder's row descriptions), the band rule
 * (the core's edges of SPEC 16.2, frc_band_edges) held against the core's
 * bands, and the geometry of the wheel.
 *
 * Literals are SPEC's: 16.1 (the ladder's table at the reference interval),
 * 15.4 - 15.6 (spans at vector A), design rulings 2 - 4 (pure wordings,
 * "between", "no band"). U+202F groups thousands in the core's numbers.
 */
process.env.TZ = 'UTC'; // Earth-mode readings use the platform's zone: fix it before any Date is made

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Band, LevelKind, Quarter } from '../public/lib/fractonica.js';
import { WHEEL, rimPoint, rowAtOffset, rowOffset, wheelRim } from '../public/app/drawing/wheel.js';
import { spineLevelAt } from '../public/app/drawing/spine.js';
import { createFrame } from '../public/app/model/frame.js';
import { intervalKey, rungEarth, rungFacts } from '../public/app/model/rungs.js';
import { describeRung } from '../public/app/screens/ladder/ladder-rows.js';
import { LINEAGE_MAX, readLens } from '../public/app/screens/lens/lens-reading.js';
import { A, cat, frc } from './helpers.js';

const LEVELS = Array.from({ length: frc.constants.LEVEL_COUNT }, (_, level) => level);
const REFERENCE = frc.referenceInterval;
/** Anything an Earth clock, calendar or SI unit would leave in a text. */
const EARTH_TEXT = /⊕|\b(UTC|GMT|JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC|MON|TUE|WED|THU|FRI|SAT|SUN|min|Hz|nm|km)\b|\d{1,2}:\d{2}|\b\d+(\.\d+)? ?(s|h|d|m|y)\b|%|20\d\d/;

/** Every string reachable inside a value. */
function strings(value, out = []) {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) value.forEach((item) => strings(item, out));
  else if (value && typeof value === 'object') Object.values(value).forEach((item) => strings(item, out));
  return out;
}

test('a rung\'s pure facts are the core\'s wordings: the Helion, a level between units, the Blink, zeta-1, the last rung', () => {
  const helion = rungFacts(frc, 6);
  assert.deepEqual(
    [helion.depth, helion.name, helion.word, helion.title, helion.kindShort, helion.kindWords, helion.focusable, helion.solar],
    // the kind in the core's words (frc_format_level_kind; the web wrote "minor unit" before the core did)
    [7, 'η', 'Eta', 'Helion', 'Helion', 'unit', true, true],
  );
  assert.deepEqual([helion.inParent, helion.children, helion.grandchildren, helion.madeOf, helion.childIsUnit], ['11 in ζ', '9 θ', '4 ι', '36ι', false]);
  assert.deepEqual(helion.inUnits, ['36ι', '2 340λ', '58 500ν']);
  assert.deepEqual([helion.span, helion.rate, helion.rateShort, helion.lengthOrRate], ['1η', '1 per 58 500 Blinks', '1 per 58 500 Blinks', '1η']);
  assert.deepEqual([helion.prefix, helion.prefixFactors], ['125 125', '125 125 = 5 · 13 · 5 · 5 · 7 · 11']);
  assert.equal(rungFacts(frc, 6), helion, 'kept: one object per rung');

  const zeta = rungFacts(frc, 5);
  assert.deepEqual([zeta.kind, zeta.kindShort, zeta.kindWords, zeta.title, zeta.span, zeta.madeOf, zeta.childIsUnit], [LevelKind.BETWEEN, 'between', 'between', 'Zeta', '11η', '11η', true]);
  const alpha = rungFacts(frc, 0);
  assert.deepEqual([alpha.kindWords, alpha.inParent, alpha.siblings, alpha.madeOf, alpha.prefix, alpha.prefixFactors, alpha.inUnits.length, alpha.isFirst], ['major', '', 0, '5β', '1', '1', 8, true]);
  const blink = rungFacts(frc, 12);
  assert.deepEqual([blink.title, blink.span, blink.rate, blink.madeOf, blink.inUnits], ['Blink', '1ν', '1 pB', '7 ξ', []]);
  const xi = rungFacts(frc, 13);
  assert.deepEqual([xi.kindShort, xi.kindWords, xi.span, xi.lengthOrRate, xi.focusable], ['', 'sub-Blink', '', '7 pB', true]);
  // design ruling 3 and DESIGN.md section 9: the rate in full for zeta-1, rounded where it would not fit a row
  const zeta1 = rungFacts(frc, 29);
  assert.deepEqual([zeta1.name, zeta1.title, zeta1.rate, zeta1.rateShort, zeta1.madeOf, zeta1.inParent, zeta1.prefix, zeta1.prefixFactors, zeta1.focusable], ['ζ1', 'Zeta1', '142 033 641 750 000 pB', '142 033 641 750 000 pB', '11 η1', '7 in ε1', '', '', false]);
  assert.equal(rungFacts(frc, 30).rateShort, '1.562 × 10¹⁵ pB');
  const last = rungFacts(frc, 62);
  // the last rung has no rung below it in the ladder: the core refuses its children (the web wrote "9 π2", a 64th
  // rung that the ladder does not have, before frc_format_level_children existed)
  assert.deepEqual([last.depth, last.name, last.isLast, last.rateShort, last.madeOf, last.children], [63, 'ο2', true, '6.432 × 10⁴¹ pB', '', '']);
  assert.deepEqual([rungFacts(frc, 61).children, rungFacts(frc, 61).grandchildren], [frc.formatLevelChildren(61), '']);
  assert.equal(last.rate.replace(/\D/g, '').length, 42, 'the exact rate of the last rung has 42 digits');
});

test('the Earth figures and the bands are SPEC 16.1\'s, at the reference interval', () => {
  const rows = { 0: ['72.12 y', '439.4 pHz', '682.3 Pm', 'no band'], 6: ['5.052 h', '54.98 µHz', '5.453 Tm', 'no band'], 13: ['44.42 ms', '22.51 Hz', '13.32 Mm', 'audible'], 29: ['2.189 fs', '456.8 THz', '656.3 nm', 'visible'], 62: ['4.834 × 10⁻⁴³ s', '2.069 × 10⁴² Hz', '1.449 × 10⁻³⁴ m', 'no band'] };
  for (const [level, expected] of Object.entries(rows)) {
    const earth = rungEarth(frc, Number(level), REFERENCE);
    assert.deepEqual([earth.period, earth.frequency, earth.length, earth.bandName], expected, `level ${level}`);
  }
  // one rung is visible light, and only one: the one place the h-alpha colour is used
  assert.deepEqual(LEVELS.filter((level) => rungEarth(frc, level, REFERENCE).visible), [29]);
  assert.equal(rungEarth(frc, 29, REFERENCE), rungEarth(frc, 29, { ...REFERENCE }), 'kept per interval');
  assert.notEqual(intervalKey(REFERENCE), intervalKey(cat.intervalMean()));
});

test('the band rule is the core\'s edges (SPEC 16.2): every rung of every interval lies inside the band the core names', () => {
  const visible = rungEarth(frc, 29, REFERENCE).rule;
  assert.deepEqual([visible.below, visible.above, visible.low, visible.high], ['infrared', 'ultraviolet', '400 THz', '790 THz']);
  const audible = rungEarth(frc, 13, REFERENCE).rule;
  assert.deepEqual([audible.below, audible.above, audible.low, audible.high], ['no band', 'radio', '20 Hz', '20 kHz']);
  const gamma = LEVELS.map((level) => rungEarth(frc, level, REFERENCE)).find((earth) => earth.band === Band.GAMMA).rule;
  assert.deepEqual([gamma.above, gamma.high], ['no band', '3.4 × 10²⁹ Hz']);
  const intervals = [REFERENCE, cat.intervalMean(), cat.intervalAt(cat.first), cat.intervalAt(cat.last)];
  for (const interval of intervals) {
    for (const level of LEVELS) {
      const band = frc.band(level, interval);
      const hz = frc.frequencyHz(level, interval);
      const { rule } = rungEarth(frc, level, interval);
      if (band === Band.NONE) {
        assert.equal(rule, null);
        assert.ok(hz < 20 || hz >= 3.4e29, `level ${level}: ${hz} Hz has no band`);
        continue;
      }
      const { low, high } = frc.bandEdges(band);
      assert.ok(hz >= frc.sciToDouble(low) && hz < frc.sciToDouble(high), `level ${level}: ${hz} Hz is inside ${frc.formatBand(band)}`);
      assert.ok(rule.place >= 0 && rule.place < 1);
    }
  }
  // zeta-1, 456.8 THz between 400 and 790 THz on a logarithmic rule
  assert.ok(Math.abs(visible.place - Math.log(456.814 / 400) / Math.log(790 / 400)) < 1e-4);
});

test('a rung described for assistive technology: pure-safe for all 63, the Earth figures only when asked', () => {
  for (const level of LEVELS) {
    const facts = rungFacts(frc, level);
    const earth = rungEarth(frc, level, REFERENCE);
    const pure = describeRung(facts, earth, false);
    assert.doesNotMatch(pure, EARTH_TEXT, `level ${level}: "${pure}"`);
    for (const text of strings(facts)) assert.doesNotMatch(text, EARTH_TEXT, `level ${level}: "${text}"`);
    assert.match(describeRung(facts, earth, true), /Earth: period .+, frequency .+, light in vacuum .+\.$/);
  }
  assert.equal(
    describeRung(rungFacts(frc, 6), rungEarth(frc, 6, REFERENCE), false),
    'η, Helion: depth 7, unit, no band. 11 in ζ. made of 36ι. length 1η. rate 1 per 58 500 Blinks.',
  );
});

test('the lens reads the Helion at vector A: thresholds as signed spans, glyph states, the seven media as spans of light', () => {
  const frame = createFrame(frc, cat, A);
  const lens = readLens(frame, 6, 'pure');
  assert.deepEqual(
    lens.live.thresholds.map((item) => [item.quarter, item.word, item.span, item.glyph, item.next, item.fraction, item.earth]),
    [
      [Quarter.END, 'End', '+6ι 43λ', 0, true, 0, ''],
      [Quarter.PEAK, 'Peak', '−20ι 21λ', 4, false, 0.25, ''],
      [Quarter.NODE, 'Node', '−11ι 21λ', 8, false, 0.5, ''],
      [Quarter.VALLEY, 'Valley', '−2ι 21λ', 12, false, 0.75, ''],
    ],
  );
  assert.deepEqual([lens.live.name, lens.live.siblings, lens.live.ring.digits, lens.live.ring.beads], ['ε#5 34η', { count: 11, local: 0 }, [13, 0], { count: 9, lit: 7 }]);
  assert.deepEqual([lens.prefix, lens.madeOf, lens.siblings, lens.period, lens.travel], ['125 125 = 5 · 13 · 5 · 5 · 7 · 11', '36ι  ·  9 θ × 4 ι', '11 in ζ', '36ι  ·  2 340λ  ·  58 500ν', 'one Helion of travel']);
  // fractonica.h, frc_format_light_span: one Helion in each medium of SPEC 16.3
  assert.deepEqual(lens.media.map((item) => item.light), ['1η', '24ι 1λ', '3.5ν', '2.05ξ', '5.15ο', '1.80ο', '6.15χ']);
  assert.deepEqual(lens.media.map((item) => item.name), ['Light in vacuum', 'Light in bounded medium', 'Diamond sound', 'Water sound', 'Air sound', 'Nerve conduction', 'Chemical transport']);
  assert.ok(lens.media[0].place === 1 && lens.media[0].first && lens.media.every((item, i) => i === 0 || item.place < lens.media[i - 1].place), 'faster media stand further along the rule');
  assert.deepEqual(lens.lineage.map((item) => `${item.name}${item.factor}`), ['α5', 'β13', 'γ5', 'δ5', 'ε7', 'ζ11', 'η']);
  assert.deepEqual([lens.lineageCut, lens.devices, lens.earthPeriod, lens.earthFrequency, lens.media[0].metres], [false, null, '', '', '']);
  assert.ok(lens.changes.every((instant) => instant === null || instant > A) && lens.changes.length >= 2, 'it says when its texts change');

  // EARTH adds the translations (this interval is the reference one: SPEC 16.1's figures; UTC)
  const earth = readLens(frame, 6, 'earth');
  assert.deepEqual([earth.earthPeriod, earth.earthFrequency], ['5.052 h', '54.98 µHz']);
  assert.deepEqual(earth.media.map((item) => item.metres), ['5.453 Tm', '3.638 Tm', '327.4 Mm', '27.28 Mm', '6.239 Mm', '2.183 Mm', '18.19 m']);
  assert.deepEqual(earth.live.thresholds.map((item) => item.earth), ['12:56:12', '09:08:50', '10:24:37', '11:40:25']);
  assert.deepEqual(earth.live.thresholds.map((item) => item.span), lens.live.thresholds.map((item) => item.span), 'the spans stay: Earth is an annotation');
});

test('the lens on every rung: pure-safe, live to level 13, static below, the devices of SPEC 16.4 in EARTH mode', () => {
  const frame = createFrame(frc, cat, A);
  for (const level of LEVELS) {
    const lens = readLens(frame, level, 'pure');
    for (const text of strings({ ...lens, facts: null, band: lens.band.bandName })) assert.doesNotMatch(text, EARTH_TEXT, `level ${level}: "${text}"`);
    assert.equal(lens.live !== null, level <= 13, `level ${level}`);
    assert.equal(lens.lineage.length, Math.min(level + 1, LINEAGE_MAX));
    assert.equal(lens.lineage.at(-1).level, level);
    assert.equal(lens.media.length, 7);
    assert.equal(lens.devices, null, 'no device in pure mode');
    assert.equal(lens.period !== '', level <= 12, 'a period in spans down to the Blink');
  }
  // the theta of vector A: the next threshold is the node, 43λ 21ν away (never rounded up: SPEC 15.4)
  const theta = readLens(frame, 7, 'pure');
  assert.deepEqual(theta.live.thresholds.find((item) => item.next).span, '+43λ 21ν');
  assert.deepEqual([theta.madeOf, theta.period, theta.travel], ['4ι', '4ι  ·  260λ  ·  6 500ν', 'one θ of travel']);
  assert.equal(readLens(frame, 0, 'pure').siblings, '18 in Saros 141');
  assert.deepEqual(readLens(frame, 12, 'pure').period, '1ν');

  // SPEC 16.4, a microsecond timer and a 32-bit phase at 48 kHz: xi is 44 417 ticks; the half-tick rule refuses zeta-1
  const xi = readLens(frame, 13, 'earth');
  assert.deepEqual(xi.devices, [
    { label: 'timer', rate: '1 MHz', value: '44 417 ticks' },
    { label: '32 bit phase', rate: '48 kHz', value: '2 014 490 per sample' },
  ]);
  assert.deepEqual(readLens(frame, 29, 'earth').devices.map((device) => device.value), ['cannot be made', 'cannot be made']);
  assert.equal(readLens(frame, 12, 'earth').devices, null, 'a rung the units reach has no device row');
  // a threshold within a minute is said as a distance, not as a clock time that would read the same four times
  assert.match(readLens(frame, 12, 'earth').live.thresholds[0].earth, /^[+−]0\.\d\d s$/);
});

test('the lens outside the catalogue: static facts stay, nothing is live, the thresholds have no spans', () => {
  const frame = createFrame(frc, cat, frc.fromUnixSeconds(32503680000n));
  const lens = readLens(frame, 6, 'pure');
  assert.deepEqual([lens.lit, lens.live.ring.lit, lens.live.name, lens.live.siblings], [false, false, '', null]);
  assert.deepEqual(lens.live.thresholds.map((item) => [item.span, item.next]), [['—', false], ['—', false], ['—', false], ['—', false]]);
  assert.deepEqual([lens.madeOf, lens.media[1].light, lens.changes], ['36ι  ·  9 θ × 4 ι', '24ι 1λ', []]);
  // SPEC 16.1: outside the catalogue no interval holds the instant; the series' mean one is used
  assert.deepEqual(frame.interval(), cat.intervalMean());
});

test('the wheel: rows stand on the rim at the design\'s pitches, and a pointer finds its row', () => {
  assert.deepEqual([WHEEL.radius, WHEEL.pitch, WHEEL.focusPitch], [1150, 47, 92]);
  assert.deepEqual([0, 1, -1, 2, 5, -5, 0.5].map(rowOffset), [0, 92, -92, 139, 280, -280, 46]);
  for (const rows of [-6.3, -1, -0.4, 0, 0.75, 1, 3.2]) assert.ok(Math.abs(rowAtOffset(rowOffset(rows)) - rows) < 1e-9);
  // DESIGN.md section 7: the rim's leftmost point at x 46, y 452; five rows away it has drawn back by 34 px
  const rim = wheelRim(frc, 46, 452);
  const index = rimPoint(frc, rim, 0);
  const fifth = rimPoint(frc, rim, rowOffset(5));
  const above = rimPoint(frc, rim, rowOffset(-5));
  assert.ok(Math.abs(index.x - 46) < 0.01 && Math.abs(index.y - 452) < 0.01);
  // (280 px ALONG the rim: 277.2 px down, 33.9 px in)
  assert.ok(Math.abs(fifth.x - 79.9) < 0.1 && Math.abs(fifth.y - 729.2) < 0.1, JSON.stringify(fifth));
  assert.ok(Math.abs(above.x - fifth.x) < 0.01 && Math.abs(above.y - (2 * 452 - fifth.y)) < 0.01, 'the same above the index');
  // the spine: 63 rungs from its first tick to its last
  assert.deepEqual([spineLevelAt({ top: 128, bottom: 742, count: 63 }, 128), spineLevelAt({ top: 128, bottom: 742, count: 63 }, 742), spineLevelAt({ top: 128, bottom: 742, count: 63 }, 435)], [0, 62, 31]);
});
