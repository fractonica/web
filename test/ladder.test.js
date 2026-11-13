/**
 * SPEC.md section 16.5: the spectral-ladder vectors, typed in from the
 * specification. The "Exact" column is a rational; the core answers with its
 * 17 significant digits (frc_sci_t), so the test rounds the rational the same
 * way with BigInt (helpers.js: sciOf) and compares digit for digit.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Band, Medium, Quantity } from '../public/lib/fractonica.js';
import { cat, frc, sciOf } from './helpers.js';

const reference = frc.referenceInterval;
const speed = (medium) => frc.mediumSpeed(medium);

/** Assert that a core value is the exact rational num/den to 17 digits. */
function assertExact(value, num, den, what) {
  assert.deepEqual({ ...value }, sciOf(num, den), what);
}

test('SPEC 16.5: the reference interval is I = 568,972,877,000 ms', () => {
  assert.deepEqual(reference, { num: 568972877000n, den: 1n });
  // "the 2010–2028 Saros 141 interval": the one that holds 2026
  assert.deepEqual(cat.intervalAt(frc.fromUnixSeconds(1791460800)), { num: 568972877000n, den: 1n });
});

test('SPEC 16.5: T(12), the Blink (ν) = 51724807/166359375 s = 310.922 ms', () => {
  assertExact(frc.period(12, reference), 51724807n, 166359375n, 'T(12)');
  assert.equal(frc.formatPeriod(12, reference, 6), '310.922 ms');
});

test('SPEC 16.5: f(13), ξ = 1164515625/51724807 Hz = 22.5137 Hz', () => {
  assertExact(frc.frequency(13, reference), 1164515625n, 51724807n, 'f(13)');
  assert.equal(frc.formatFrequency(13, reference, 6), '22.5137 Hz');
});

test('SPEC 16.5: f(62), ο2 = 107008321717714395645982788862060546875000000000000/51724807 Hz = 2.0688 × 10⁴² Hz', () => {
  assertExact(frc.frequency(62, reference), 107008321717714395645982788862060546875000000000000n, 51724807n, 'f(62)');
  assert.equal(frc.formatFrequency(62, reference, 5), '2.0688 × 10⁴² Hz');
});

test('SPEC 16.5: length(12), light in vacuum = 2215243861443658/23765625 m = 93,212.1 km', () => {
  assertExact(frc.length(12, reference, speed(Medium.VACUUM)), 2215243861443658n, 23765625n, 'length(12)');
  // the core writes the same six digits in megametres
  assert.equal(frc.formatLength(12, reference, speed(Medium.VACUUM), 6), '93.2121 Mm');
  assert.ok(Math.abs(frc.lengthMetres(12, reference, speed(Medium.VACUUM)) - 93212.1e3) < 0.05e3);
});

test('SPEC 16.5: length(12, air) = 2534515543/23765625 m = 106.646 m', () => {
  assertExact(frc.length(12, reference, speed(Medium.AIR)), 2534515543n, 23765625n, 'length(12, air)');
  assert.equal(frc.formatLength(12, reference, speed(Medium.AIR), 6), '106.646 m');
});

test('SPEC 16.5: length(12, nerve) = 413798456/11090625 m = 37.3107 m', () => {
  assertExact(frc.length(12, reference, speed(Medium.NERVE)), 413798456n, 11090625n, 'length(12, nerve)');
  assert.equal(frc.formatLength(12, reference, speed(Medium.NERVE), 6), '37.3107 m');
});

test('SPEC 16.5: length(12, chemical) = 51724807/166359375000 m = 310.922 µm', () => {
  assertExact(frc.length(12, reference, speed(Medium.CHEMICAL)), 51724807n, 166359375000n, 'length(12, chemical)');
  assert.equal(frc.formatLength(12, reference, speed(Medium.CHEMICAL), 6), '310.922 µm');
});

test('SPEC 16.5: length(29), ζ1, light in vacuum = 1107621930721829/1687759133607421875000 m = 656.268 nm', () => {
  assertExact(frc.length(29, reference, speed(Medium.VACUUM)), 1107621930721829n, 1687759133607421875000n, 'length(29)');
  assert.equal(frc.formatLength(29, reference, speed(Medium.VACUUM), 6), '656.268 nm');
});

test('SPEC 16.5: the mean interval of Saros 141, 39,259,007,522,784 / 69 ms', () => {
  const mean = cat.intervalMean();
  assert.ok(mean.den !== 0n && mean.num * 69n === 39259007522784n * mean.den);
  assert.equal(cat.last - cat.first, 39259007522784n * 1000n);
  // "f(12) = 250529296875/77894856196 Hz, which is 3.21625 Hz"
  assertExact(frc.frequency(12, mean), 250529296875n, 77894856196n, 'f(12) on the mean');
  assert.equal(frc.formatFrequency(12, mean, 6), '3.21625 Hz');
  // "and T(12) is 310.921 ms, the Blink of §15.5"
  assertExact(frc.period(12, mean), 77894856196n, 250529296875n, 'T(12) on the mean');
  assert.equal(frc.formatPeriod(12, mean, 6), '310.921 ms');
});

test('SPEC 16.5 as doubles: the nearest double to the exact value', () => {
  const close = (value, expected, relative) => assert.ok(Math.abs(value / expected - 1) < relative, `${value} vs ${expected}`);
  close(frc.periodSeconds(12, reference), 51724807 / 166359375, 4e-16);
  close(frc.frequencyHz(13, reference), 1164515625 / 51724807, 4e-16);
  close(frc.frequencyHz(62, reference), 2.0688e42, 5e-5);
  close(frc.lengthMetres(29, reference, speed(Medium.VACUUM)), 656.268e-9, 1e-6);
  close(frc.sciToDouble(frc.period(12, reference)), 51724807 / 166359375, 4e-16);
});

test('SPEC 16.1: rows of the ladder table (reference interval)', () => {
  // depth | level | name | siblings | period | frequency | band | light in vacuum
  // SPEC prints a dash where there is no band; the core writes "no band" there since it took design ruling 4
  // (a change of the core on purpose: frc_format_band(FRC_BAND_NONE) was "—")
  const NO_BAND = 'no band';
  const rows = [
    [0, 'α', 0, '72.12 y', '439.4 pHz', NO_BAND, '682.3 Pm'],
    [6, 'η', 11, '5.052 h', '54.98 µHz', NO_BAND, '5.453 Tm'],
    [8, 'ι', 4, '8.421 min', '1.979 mHz', NO_BAND, '151.5 Gm'],
    [12, 'ν', 5, '310.9 ms', '3.216 Hz', NO_BAND, '93.21 Mm'],
    [13, 'ξ', 7, '44.42 ms', '22.51 Hz', 'audible', '13.32 Mm'],
    [17, 'σ', 5, '22.43 µs', '44.58 kHz', 'radio', '6.725 km'],
    [22, 'ψ', 11, '896.4 ps', '1.116 GHz', 'microwave', '268.7 mm'],
    [26, 'γ1', 13, '383.1 fs', '2.610 THz', 'infrared', '114.8 µm'],
    [29, 'ζ1', 7, '2.189 fs', '456.8 THz', 'visible', '656.3 nm'],
    [30, 'η1', 11, '199.0 as', '5.025 PHz', 'ultraviolet', '59.66 nm'],
    [31, 'θ1', 9, '22.11 as', '45.22 PHz', 'X-ray', '6.629 nm'],
    [35, 'μ1', 5, '17.01 zs', '58.79 EHz', 'gamma ray', '5.099 pm'],
    [41, 'σ1', 5, '2.454 × 10⁻²⁵ s', '4.074 YHz', 'gamma ray', '73.58 am'],
    [47, 'ω1', 9, '1.090 × 10⁻³⁰ s', '9.176 × 10²⁹ Hz', NO_BAND, '326.7 ym'],
    [62, 'ο2', 11, '4.834 × 10⁻⁴³ s', '2.069 × 10⁴² Hz', NO_BAND, '1.449 × 10⁻³⁴ m'],
  ];
  const vacuum = speed(Medium.VACUUM);
  for (const [level, name, siblings, period, frequency, band, light] of rows) {
    assert.deepEqual(
      [
        frc.formatLevelName(level), frc.siblings(level), frc.formatPeriod(level, reference), frc.formatFrequency(level, reference),
        frc.formatBand(frc.band(level, reference)), frc.formatLength(level, reference, vacuum),
      ],
      [name, siblings, period, frequency, band, light],
      `level ${level}`,
    );
  }
  assert.equal(frc.band(29, reference), Band.VISIBLE);
  assert.equal(frc.formatQuantity(frc.period(12, reference), Quantity.TIME), '310.9 ms');
});

test('SPEC 16.2: the band edges, the very ones frc_band compares with', () => {
  const hz = (band) => {
    const { low, high } = frc.bandEdges(band);
    return [frc.formatQuantity(low, Quantity.FREQUENCY, 2), frc.formatQuantity(high, Quantity.FREQUENCY, 2)];
  };
  assert.deepEqual(frc.bandEdges(Band.AUDIBLE).low, { mantissa: 20000000000000000n, exp10: -15 }); // 20 Hz
  assert.deepEqual(hz(Band.VISIBLE), ['400 THz', '790 THz']);
  assert.deepEqual(hz(Band.GAMMA)[0], '30 EHz');
  assert.throws(() => frc.bandEdges(Band.NONE), (error) => error.status === 'FRC_ERR_ARG');
  // every rung of the reference ladder lies inside the edges of its own band
  for (let level = 0; level < frc.constants.LEVEL_COUNT; level++) {
    const band = frc.band(level, reference);
    if (band === Band.NONE) continue;
    const { low, high } = frc.bandEdges(band);
    const f = frc.frequencyHz(level, reference);
    assert.ok(f >= frc.sciToDouble(low) && f < frc.sciToDouble(high), `level ${level}`);
  }
});

test('SPEC 16.4: prefixes and the devices that make a rung', () => {
  assert.equal(frc.prefix(12), 7319812500n);
  assert.equal(frc.prefix(22), 2538851346281250000n);
  assert.equal(frc.prefix(23), null); // does not fit 64 bits
  assert.equal(frc.formatPrefix(62), '4708366155579433408423242709930664062500000000000000');
  assert.equal(frc.formatPrefix(63), '42375295400214900675809184389375976562500000000000000');
  // one Blink on a 32,768 Hz crystal: round(T(12) * 32768)
  assert.equal(frc.deviceTicks(12, reference, 32768), 10188n);
  // "A period of less than half a tick cannot be counted": refused, not rounded
  assert.throws(() => frc.deviceTicks(40, reference, 32768), (error) => error.status === 'FRC_ERR_REFUSED');
  // "A frequency above half the sample rate cannot be made"
  assert.throws(() => frc.deviceStep(17, reference, 48000, 32), (error) => error.status === 'FRC_ERR_REFUSED');
  assert.equal(typeof frc.deviceStep(14, reference, 48000, 32), 'bigint');
});

test('SPEC 16.3: the seven media', () => {
  const table = [
    ['vacuum', 'Light in vacuum', 'Vacuum', 299792458n, 1n],
    ['bounded', 'Light in bounded medium', 'Vacuum + solid', 200000000n, 1n],
    ['diamond', 'Diamond sound', 'Solid', 18000n, 1n],
    ['water', 'Water sound', 'Liquid', 1500n, 1n],
    ['air', 'Air sound', 'Gas', 343n, 1n],
    ['nerve', 'Nerve conduction', 'Solid + liquid', 120n, 1n],
    ['chemical', 'Chemical transport', 'Liquid + gas + solid', 1n, 1000n],
  ];
  table.forEach(([id, name, phase, num, den], medium) => {
    assert.deepEqual([frc.formatMediumId(medium), frc.formatMediumName(medium), frc.formatMediumPhase(medium)], [id, name, phase]);
    const { num: n, den: d } = frc.mediumSpeed(medium);
    assert.equal(n * den, num * d, `speed of ${id}`); // the same ratio, however it is reduced
  });
});
