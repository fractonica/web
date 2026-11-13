/**
 * crosscheck-lines.js - the JavaScript side of test/crosscheck.test.js.
 *
 * Prints, through fractonica.wasm and the binding, exactly the lines that
 * test/native/dump.c prints through a native build of the core. The two files
 * are mirrors: the same facts in the same order in the same format. Read the
 * head of dump.c for the formats; change a line here, change it there.
 *
 * Not a test by itself (no `.test.js`): crosscheck.test.js runs it.
 */
import { FractonicaError } from '../public/lib/fractonica.js';

/* ---- printing (dump.c: put_time, put_f32, put_f64, put_text) ------------- */

const T = (time) => (time === null ? 'none' : String(time));
const B = (flag) => (flag ? 1 : 0);

const bits = new DataView(new ArrayBuffer(8));
const f32 = (value) => {
  bits.setFloat32(0, value);
  return bits.getUint32(0).toString(16).padStart(8, '0');
};
const f64 = (value) => {
  bits.setFloat64(0, value);
  return bits.getBigUint64(0).toString(16).padStart(16, '0');
};

/** The text a format call returns, or [STATUS] when the core refused. */
function text(call) {
  try {
    return `"${call()}"`;
  } catch (error) {
    if (error instanceof FractonicaError) return `[${error.status}]`;
    throw error;
  }
}

/** What `call` returns (already formatted), or the status name it failed with. */
function attempt(call) {
  try {
    return call();
  } catch (error) {
    if (error instanceof FractonicaError) return error.status;
    throw error;
  }
}

/** The status alone: FRC_OK when `call` does not throw. */
const statusOf = (call) => attempt(() => (call(), 'FRC_OK'));

const cycleText = (c) =>
  `${c.level} ${c.quarter} ${B(c.clipped)} ${c.local} ${c.siblings} ${c.cycle} ${c.phase} ${f64(c.fraction)} ${T(c.start)} ${T(c.end)}`;
const thresholdText = (th) => `${th.name} ${T(th.time)}`;
const glyphText = (g) => [g.index, g.value, g.derivative, B(g.dotted), g.strokes, ...g.trits].join(' ');
const odometerText = (o) => [o.count, o.strokes, o.states, ...o.digits, T(o.nextChange)].join(' ');
const syncText = (s) =>
  `${s.sync} ${s.quarter} ${s.helion} ${s.phase} ${f64(s.fraction)} ${T(s.start)} ${T(s.end)} ${T(s.nominal)} ${s.driftUs} ${thresholdText(s.next)}`;
const pentadText = (p) => `${p.sync} ${p.index} ${p.helion} ${p.helions} ${p.first} ${T(p.start)} ${T(p.end)}`;
const dateText = (d) => [d.alpha, d.beta, d.gamma, d.delta, d.epsilon, d.eta, d.iota, d.lambda, d.nu, ...d.quarters].join(' ');
const sciText = (v) => `${v.mantissa} ${v.exp10}`;
const arcText = (a) => [a.cx, a.cy, a.radius, a.start, a.sweep].map(f32).join(' ');
const civilText = (c) => [c.year, c.month, c.day, c.hour, c.minute, c.second, c.weekday, c.microsecond].join(' ');

/** dump.c: put_span_all */
function spanAll(frc, span) {
  const parts = (list) => [list.length, ...list.map((part) => `${part.unit}:${part.count}`)].join(' ');
  return [
    `${B(span.negative)} ${span.blinks} ${span.frac}`,
    ...[0, 1, 4].map((maxParts) => text(() => frc.formatSpan(span, maxParts))),
    ...[0, 1, 4].map((maxParts) => text(() => frc.formatSpanSigned(span, maxParts))),
    ...Array.from({ length: frc.constants.UNIT_COUNT + 2 }, (_, i) => text(() => frc.formatSpanInUnit(span, i - 1))),
    parts(frc.spanParts(span, frc.constants.UNIT_COUNT, false)),
    parts(frc.spanParts(span, 3, true)),
  ].join(' ');
}

/** dump.c: INVERSE_PHASES */
const INVERSE_PHASES = [0, 0x40000000, 0x80000000, 0xc0000000, 0xffffffff, 12345678];

/** dump.c: lcg. The same 32-bit generator on both sides. */
function makeLcg() {
  let state = 20261008;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state;
  };
}

/* ---- static facts ---------------------------------------------------------- */

function catalogueLines(out, cat, tag) {
  const mean = cat.intervalMean();
  out.push(`${tag} catalogue ${cat.count} ${cat.series} ${cat.anchor} ${T(cat.first)} ${T(cat.last)} ${mean.num} ${mean.den}`);
  for (let k = 0; k <= cat.count; k++) out.push(`${tag} instant ${k} ${T(cat.instant(k))}`);
  for (let level = 0; level <= 22; level++) out.push(`${tag} cycles ${level} ${cat.cycleCount(level)}`);
  for (let k = 0; k < 12; k++) {
    const n = k * 37 + 1;
    const d = 7 + k;
    out.push(`${tag} position ${n}/${d} ${T(cat.timeAtPosition(n, d))}`);
  }
}

function levelLines(out, frc) {
  const { UNIT_COUNT, MEDIUM_COUNT } = frc.constants;
  for (let level = 0; level <= 70; level++) {
    out.push(
      [
        'level', level, frc.factor(level), frc.siblings(level), frc.prefix(level) ?? 'null',
        text(() => frc.formatPrefix(level)), frc.levelKind(level),
        text(() => frc.formatLevelName(level)), text(() => frc.formatLevelWord(level)),
        frc.unitOfLevel(level) ?? 'null',
      ].join(' '),
    );
    out.push(`levelspan ${level} ${attempt(() => spanAll(frc, frc.spanOfLevel(level)))}`);
    out.push(
      [
        'levelrate', level,
        attempt(() => {
          const { num, den } = frc.levelPerBlink(level);
          return `${num} ${den} ${text(() => frc.formatPerBlink(num, den))}`;
        }),
        ...[0, 4, 9, 1].map((digits) => text(() => frc.formatLevelRate(level, digits))),
      ].join(' '),
    );
    const units = [];
    for (let unit = 0; unit <= UNIT_COUNT; unit++) units.push(text(() => frc.formatLevelInUnit(level, unit)));
    out.push(`levelunits ${level} ${units.join(' ')}`);
    out.push(
      `levelwords ${level} ${text(() => frc.formatLevelChildren(level))} ${text(() => frc.formatLevelInParent(level))} ${text(() => frc.formatPrefixFactors(level))}`,
    );
    for (let withWord = 0; withWord < 2; withWord++) {
      const spans = [];
      for (let medium = 0; medium <= MEDIUM_COUNT; medium++) {
        spans.push(text(() => frc.formatLightSpan(level, frc.mediumSpeed(medium), withWord === 1)));
      }
      out.push(`levellight ${level} ${withWord} ${spans.join(' ')}`);
    }
  }
}

function nameLines(out, frc) {
  const { UNIT_COUNT, RATE_COUNT, MEDIUM_COUNT } = frc.constants;
  for (let unit = -1; unit <= UNIT_COUNT + 1; unit++) {
    out.push(
      [
        'unit', unit, frc.unitLevel(unit) ?? 'null', frc.unitBlinks(unit), frc.unitParts(unit),
        text(() => frc.formatUnitSymbol(unit)), text(() => frc.formatUnitName(unit, false)), text(() => frc.formatUnitName(unit, true)),
        text(() => frc.formatUnitInParent(unit)),
      ].join(' '),
    );
  }
  for (let quarter = -1; quarter <= 4; quarter++) {
    out.push(`quarter ${quarter} ${text(() => frc.formatQuarter(quarter, false))} ${text(() => frc.formatQuarter(quarter, true))}`);
    for (let strokes = 0; strokes <= frc.constants.MAX_STROKES + 1; strokes++) {
      out.push(`quarterglyph ${quarter} ${strokes} ${attempt(() => glyphText(frc.glyphAtQuarter(quarter, strokes)))}`);
    }
  }
  for (let kind = -1; kind <= 4; kind++) out.push(`kind ${kind} ${text(() => frc.formatLevelKind(kind))}`);
  out.push(`lightword ${text(() => frc.formatLightWord())}`);
  for (const n of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 25, 100, 65535]) {
    out.push(`ordinal ${n} ${text(() => frc.formatOrdinal(n))}`);
  }
  for (const n of [0n, 7n, 999n, 1000n, 58500n, 142033641750000n, 2n ** 64n - 1n]) {
    out.push(`count ${n} ${text(() => frc.formatCount(n))}`);
  }
  for (const n of [0n, 1n, -1n, -3n, 4820n, -58500n, 2n ** 63n - 1n, -(2n ** 63n)]) {
    out.push(`countsigned ${n} ${text(() => frc.formatCountSigned(n))}`);
  }
  for (let i = 0; i <= RATE_COUNT; i++) {
    out.push(
      `rate ${i} ${attempt(() => {
        const rate = frc.ratePreset(i);
        return `${rate.unit} ${rate.count} ${rate.factor} ${text(() => frc.formatRate(rate))}`;
      })}`,
    );
  }
  for (let medium = -1; medium <= MEDIUM_COUNT; medium++) {
    const speed = frc.mediumSpeed(medium);
    out.push(
      [
        'medium', medium, speed.num, speed.den,
        text(() => frc.formatMediumId(medium)), text(() => frc.formatMediumName(medium)), text(() => frc.formatMediumPhase(medium)),
      ].join(' '),
    );
  }
  for (let band = -1; band <= 9; band++) {
    out.push(`band ${band} ${text(() => frc.formatBand(band))} ${attempt(() => {
      const { low, high } = frc.bandEdges(band);
      return `${sciText(low)} ${sciText(high)}`;
    })}`);
  }
  const ratios = [
    [7n, 1n], [2772n, 1n], [1n, 25n], [1n, 26n], [1n, 58500n], [0n, 5n], [5n, 0n], [110n * 77894856196n, 250529296875n],
    [1n, 2n], [1n, 3n], [1n, 5n], [1n, 10n], [1n, 20n], [2n, 50n], [4n, 100n], [3n, 4n], [2n, 3n], [4001n, 100000n],
  ];
  for (const [num, den] of ratios) out.push(`perblink ${num}/${den} ${text(() => frc.formatPerBlink(num, den))}`);
}

function ladderLines(out, frc, tag, interval) {
  const { LEVEL_COUNT, MEDIUM_COUNT } = frc.constants;
  const Q = { TIME: 0, FREQUENCY: 1, LENGTH: 2 };
  const rates = [1n, 32768n, 48000n, 1000000n, 16000000n, 1000000000000n];
  const bitChoices = [0, 16, 32, 48, 64, 65];
  out.push(`ladder ${tag} ${interval.num} ${interval.den}`);
  for (let level = 0; level <= LEVEL_COUNT; level++) {
    out.push(
      [
        'period', tag, level,
        attempt(() => {
          const value = frc.period(level, interval);
          return [sciText(value), f64(frc.sciToDouble(value)), ...[0, 4, 9, 10].map((digits) => text(() => frc.formatQuantity(value, Q.TIME, digits)))].join(' ');
        }),
        f64(frc.periodSeconds(level, interval)),
        text(() => frc.formatPeriod(level, interval, 0)),
        text(() => frc.formatPeriod(level, interval, 6)),
      ].join(' '),
    );
    out.push(
      [
        'frequency', tag, level,
        attempt(() => {
          const value = frc.frequency(level, interval);
          return `${sciText(value)} ${f64(frc.sciToDouble(value))} ${text(() => frc.formatQuantity(value, Q.FREQUENCY, 5))}`;
        }),
        f64(frc.frequencyHz(level, interval)),
        text(() => frc.formatFrequency(level, interval, 0)),
        text(() => frc.formatFrequency(level, interval, 6)),
        frc.band(level, interval),
      ].join(' '),
    );
    for (let medium = 0; medium <= MEDIUM_COUNT; medium++) {
      const speed = frc.mediumSpeed(medium);
      out.push(
        [
          'length', tag, level, medium,
          attempt(() => {
            const value = frc.length(level, interval, speed);
            return `${sciText(value)} ${text(() => frc.formatQuantity(value, Q.LENGTH, 3))}`;
          }),
          f64(frc.lengthMetres(level, interval, speed)),
          text(() => frc.formatLength(level, interval, speed, 0)),
        ].join(' '),
      );
    }
    out.push(
      [
        'device', tag, level,
        ...rates.map((rate) => attempt(() => frc.deviceTicks(level, interval, rate))),
        ...bitChoices.map((bitCount) => attempt(() => frc.deviceStep(level, interval, 48000, bitCount))),
      ].join(' '),
    );
  }
}

function glyphLines(out, frc) {
  const steps = [0, 1, 8, 32, 200];
  for (let strokes = 0; strokes <= frc.constants.MAX_STROKES + 1; strokes++) {
    const states = frc.glyphStates(strokes);
    const stride = states > 60 ? Math.floor(states / 53) : 1;
    const box = frc.glyphBounds(strokes);
    out.push(`glyphs ${strokes} ${frc.glyphExtreme(strokes)} ${states} ${box.minX} ${box.minY} ${box.maxX} ${box.maxY}`);
    for (let index = 0; index < (states ? states + 3 : 2); index += stride) {
      let glyph;
      try {
        glyph = frc.glyphFromIndex(index, strokes);
      } catch (error) {
        out.push(`glyph ${strokes} ${index} ${error.status}`);
        continue;
      }
      out.push(`glyph ${strokes} ${index} ${glyphText(glyph)} ${frc.glyphIndexDescending(index, strokes)}`);
      out.push(['path', strokes, index, ...frc.glyphPath(glyph).map((step) => `${step.op}:${step.points.join(',')}`)].join(' '));
      steps.forEach((curveSteps, i) => {
        if (i > 1 && index % 5 !== 0) return;
        out.push(['segments', strokes, index, curveSteps, ...frc.glyphSegments(glyph, curveSteps).map((s) => s.join(','))].join(' '));
      });
    }
  }
}

function phaseLines(out, frc) {
  const lcg = makeLcg();
  const pairs = [[2, 2], [3, 2], [2, 3], [1, 4], [5, 4], [0, 2], [2, 5]];
  for (let i = 0; i < 200; i++) {
    const phase = i === 0 ? 0 : i === 1 ? 0xffffffff : i === 2 ? frc.constants.FRAC_HALF : lcg();
    const indices = [];
    for (let strokes = 0; strokes <= frc.constants.MAX_STROKES; strokes++) indices.push(frc.glyphIndexOfPhase(phase, strokes));
    out.push(`phase ${phase} ${f64(frc.fracToDouble(phase))} ${indices.join(' ')}`);
    for (const [strokes, digits] of pairs) {
      out.push(`phaseodo ${phase} ${strokes} ${digits} ${attempt(() => odometerText(frc.odometerOfPhase(phase, strokes, digits)))}`);
    }
  }
}

function arcLines(out, frc) {
  const factors = [5, 13, 5, 5, 7, 11, 9, 4];
  const fractions = [0, 0.25, 0.5, 0.8125, 1];
  const pi = frc.constants.PI;
  for (let half = 0; half < 6; half++) out.push(`waveroot ${half} ${arcText(frc.arcWaveRoot(half))}`);
  const carrier = { cx: 196.5, cy: 277, radius: 102, start: Math.fround(-pi / 2), sweep: Math.fround(2 * pi) };
  for (let f = 0; f < 8; f++) {
    const slots = 2 * factors[f];
    const inner = factors[(f + 1) % 8];
    for (let j = 0; j < slots; j++) {
      const child = frc.arcChild(carrier, slots, j, j & 1);
      const points = fractions.map((fraction) => {
        const point = frc.arcPoint(child, fraction);
        return `${f32(point.x)} ${f32(point.y)}`;
      });
      out.push(`child ${slots} ${j} ${arcText(child)} ${points.join(' ')}`);
      for (let k = 0; k < inner; k++) {
        out.push(`grandchild ${slots} ${j} ${k} ${arcText(frc.arcChild(child, inner, k, (j * inner + k) & 1))}`);
      }
    }
  }
  out.push(`child-one ${arcText(frc.arcChild(carrier, 1, 0, 0))} ${arcText(frc.arcChild(carrier, 0, 0, 0))} ${arcText(frc.arcChild(carrier, 2, 1, 1))}`);
  for (let i = 0; i < 120; i++) {
    // dump.c: -12.0f + (float)i * 0.2017f, every step rounded to float
    const angle = Math.fround(-12 + Math.fround(i * Math.fround(0.2017)));
    out.push(`trig ${i} ${f32(frc.sin(angle))} ${f32(frc.cos(angle))}`);
  }
}

function civilAndTextLines(out, frc) {
  for (const ms of [-12219292800000n, -11253795486968n, 0n, 1791460800000n]) {
    out.push(`julian ${ms} ${frc.julianFieldsToUnixMs(ms)}`);
  }
  const I64_MAX = 2n ** 63n - 1n;
  for (const value of [0n, 1n, -1n, 1791460800n, 9223372036854775n, 9223372036854776n, -9223372036854776n, I64_MAX, -I64_MAX - 1n]) {
    out.push(`time ${value} ${T(frc.fromUnixMs(value))} ${T(frc.fromUnixSeconds(value))}`);
  }
  const civil = (year, month, day, hour, minute, second, microsecond) => ({ year, month, day, hour, minute, second, weekday: 0, microsecond });
  const fields = [
    civil(2026, 10, 8, 12, 0, 0, 0), civil(2026, 13, 32, 25, 61, 61, 999999), civil(-44, 3, 15, 0, 0, 0, 1),
    civil(10000, 1, 1, 23, 59, 59, 123456), civil(300000, 1, 1, 0, 0, 0, 0), civil(1969, 12, 31, 23, 59, 59, 999999),
  ];
  fields.forEach((value, i) => {
    for (const offset of [0, 3600, -34200, 59, -59]) {
      out.push(`civilfields ${i} ${offset} ${T(frc.timeFromCivil(value, offset))} ${text(() => frc.formatCivil(value, offset))}`);
    }
  });
  fields.forEach((value, i) => {
    const forms = [];
    for (let form = 0; form <= 14; form++) forms.push(text(() => frc.formatCivilText(value, 3600, form)));
    out.push(`civiltext ${i} ${forms.join(' ')} ${civilStatus(frc, value)}`);
  });
  const days = [
    civil(2026, 2, 29, 0, 0, 0, 0), civil(2024, 2, 29, 0, 0, 0, 0), civil(1900, 2, 29, 0, 0, 0, 0),
    civil(2000, 2, 29, 23, 59, 59, 999999), civil(2026, 4, 31, 0, 0, 0, 0), civil(2026, 1, 1, 24, 0, 0, 0),
    civil(2026, 1, 1, 0, 60, 0, 0), civil(2026, 1, 1, 0, 0, 60, 0), civil(2026, 1, 1, 0, 0, 0, 1000000),
    civil(0, 1, 1, 0, 0, 0, 0), civil(800, 10, 8, 1, 2, 3, 0), civil(-290000, 1, 1, 0, 0, 0, 0),
    civil(290001, 1, 1, 0, 0, 0, 0), civil(2026, 0, 1, 0, 0, 0, 0),
  ];
  days.forEach((value, i) => {
    const forms = [];
    for (let form = 0; form <= 14; form++) forms.push(text(() => frc.formatCivilText(value, 0, form)));
    out.push(`civilday ${i} ${civilStatus(frc, value)} ${forms.join(' ')}`);
  });
  for (const offset of [0, 10800, -9000, 19800, 20700, -36000, 59, -59, 86399, -86400]) {
    out.push(`civiloffset ${offset} ${text(() => frc.formatCivilText(null, offset, 7))} ${text(() => frc.formatCivilText(null, offset, 2))}`);
  }
  const durations = [
    0n, 4999n, 5000n, 400000n, 9271000n, 5000000n, 9994999n, 9995000n, 59600000n, 59999999n, 60000000n,
    1433000000n, 3722000000n, 3599600000n, 3762000000n, 273600000000n, 1234n * 86400000000n + 18000000000n, -400000n,
    -3722000000n, -4999n, 2n ** 63n - 1n, -(2n ** 63n),
  ];
  for (const us of durations) {
    out.push(`duration ${us} ${[0, 1, 2, 3, 4, 9].map((parts) => text(() => frc.formatDuration(us, parts))).join(' ')}`);
  }
  const civilTexts = [
    '2026-10-08', '2026-10-08 12:00', '2026-10-08T12:00:00Z', '2026-10-08T14:00:00+02:00', '8 OCT 2026',
    '8 OCT 2026 12:00', 'THU 8 OCT 2026 · 12:00:00', '2026-10-08T12:00:00.000Z', '8 October 2026', 'thu, 8 oct 2026',
    'FRI 8 OCT 2026', '31 FEB 2026', '2026-02-29', '2026-13-01', '2026-10-08 24:00', '2026-10-08 12:60',
    '2026-10-08T12:00+24:00', '2026-10-08 12:00 UTC+3', '2026-10-08 12:00 UTC−2:30', '2026-10-08 12:00 +0530',
    '2026-10-08 12:00 +05', '2026-10-08 12:00 GMT', '2026-10-08 12:00:00.123456789', '-0044-03-15', '+10000-01-01',
    '8 OCT', '12:00', '2026-10-08 CEST', '', '   2026-10-08   ', '2026-10-08 12:00 pm', '8 OCT 2026 · 01:34:05',
  ];
  civilTexts.forEach((value, i) => {
    out.push(`parsecivil ${i} ${attempt(() => {
      const parsed = frc.parseCivil(value);
      return `${civilText(parsed.civil)} ${parsed.offset ?? 'null'}`;
    })}`);
  });
  const texts = [
    'α#6 β#4 γ#9 δ#3 ε#5 34η 29ι 21λ 3ν', '−2ε 5η', '2.454 × 10⁻²⁵ s', '⬠II·3', '◻', '54.98 µHz', '1 per 58 500 Blinks',
    'plain ASCII', '', 'ς ζ ξ ψ ω — – ⁺¹⁰', '日本語 ok',
  ];
  texts.forEach((value, i) => out.push(`ascii ${i} ${text(() => frc.toAscii(value))}`));
  const dates = [
    'a#6 b#4 g#9 d#3 e#5 34h 29i', 'Pentad II · Delta Trifracton End ε#5 34η 29ι', 'd#3 e#5 34h', 'a6 b4', '',
    'α#6 β#4 γ#9 δ#3 ε#5 34η 29ι 21λ 3ν', 'a#6 b#9 g#9 d#3 e#5 34h', 'PII.3 a#1 b#1 g#1 d#1 e#1 1h 0i 0l 0n', 'a#0 b#1 g#1 d#1 e#1',
  ];
  dates.forEach((value, i) => {
    out.push(`parsetext ${i} ${attempt(() => {
      const { date, finest } = frc.parseDate(value, null);
      return `${dateText(date)} ${finest}`;
    })}`);
  });
}

function syncNumberLines(out, frc, cat) {
  for (const number of [-32000, -31999, -1, 0, 1, 2375, 4820, 7987, 76000, 77000]) {
    out.push(`syncnumber ${number} ${attempt(() => syncText(cat.syncByNumber(number)))} ${INVERSE_PHASES.map((phase) => T(cat.timeAtSyncPhase(number, phase))).join(' ')}`);
    for (let index = 0; index <= 4; index++) {
      out.push(
        `pentadnumber ${number} ${index} ${attempt(() => {
          const pentad = cat.pentadByNumber(number, index);
          return [
            pentadText(pentad),
            text(() => frc.formatPentad(pentad, 0, false)), text(() => frc.formatPentad(pentad, 1, false)),
            text(() => frc.formatPentad(pentad, 2, false)), text(() => frc.formatPentad(pentad, 0, true)),
            text(() => frc.formatPentad(pentad, 3, false)), text(() => frc.formatPentad(pentad, 4, false)),
          ].join(' ');
        })}`,
      );
    }
  }
}

/** frc_civil_validate's status name (the binding answers it as a boolean). */
function civilStatus(frc, civil) {
  return attempt(() => (frc.civilValidate(civil) ? 'FRC_OK' : 'FRC_ERR_RANGE'));
}

/** dump.c: CUSTOM_MS */
export const CUSTOM_MS = [
  -600000000000n, -31000000000n, 537972877000n, 1106945754000n, 1675918631123n,
  2244891508000n, 2813864385000n, 3382837262001n, 3951810139000n,
];

/**
 * dump.c: dump_static.
 * @param {import('../public/lib/fractonica.js').Fractonica} frc
 * @param {import('../public/lib/fractonica.js').Catalogue} custom frc.catalogue(CUSTOM_MS, 999), made once by the caller
 * @returns {string[]}
 */
export function staticLines(frc, custom) {
  const out = [];
  const cat = frc.saros141;
  out.push(`version ${frc.version} ${frc.specVersion}`);
  catalogueLines(out, cat, 'saros141');
  out.push('custom init FRC_OK');
  catalogueLines(out, custom, 'custom');
  out.push(`custom refused ${statusOf(() => frc.catalogue([5, 4, 3], 1))} ${statusOf(() => frc.catalogue(CUSTOM_MS.slice(0, 1), 1))}`);
  levelLines(out, frc);
  nameLines(out, frc);
  ladderLines(out, frc, 'reference', frc.referenceInterval);
  ladderLines(out, frc, 'mean', cat.intervalMean());
  ladderLines(out, frc, 'alpha', frc.intervalOfAlphaMs(2275891508000n));
  ladderLines(out, frc, 'zero', { num: 0n, den: 1n });
  glyphLines(out, frc);
  phaseLines(out, frc);
  arcLines(out, frc);
  civilAndTextLines(out, frc);
  syncNumberLines(out, frc, cat);
  const ms = (value) => frc.fromUnixMs(value);
  out.push(...instantLines(frc, custom, 'custom', ms(1675918631123n), null, false));
  out.push(...instantLines(frc, custom, 'custom', ms(2000000000000n), ms(1675918631123n), false));
  out.push(...instantLines(frc, custom, 'custom', ms(3951810139000n), ms(2000000000000n), false));
  return out;
}

/* ---- one instant ------------------------------------------------------------- */

/**
 * dump.c: dump_instant_on.
 * @param {import('../public/lib/fractonica.js').Fractonica} frc
 * @param {import('../public/lib/fractonica.js').Catalogue} cat
 * @param {string} tag
 * @param {bigint} t
 * @param {bigint | null} previous the instant before, for the span lines
 * @param {boolean} full glyphs and odometers at every level, not every sixth
 * @returns {string[]}
 */
export function instantLines(frc, cat, tag, t, previous, full) {
  const out = [];
  const { CLOCK_MAX_LEVEL, MAX_STROKES, UNIT_COUNT } = frc.constants;
  const pairs = [[2, 2], [3, 2], [2, 3], [1, 4], [5, 1], [4, 4], [5, 4], [0, 2], [2, 0]];

  out.push(`${tag} t ${t} ${B(cat.contains(t))}`);
  out.push(
    `${tag} position ${attempt(() => {
      const position = cat.positionAt(t);
      return `${position.ordinal} ${position.num} ${position.den} ${f64(frc.positionToDouble(position))}`;
    })}`,
  );
  let interval = null;
  out.push(
    `${tag} interval ${attempt(() => {
      interval = cat.intervalAt(t);
      return `${interval.num} ${interval.den}`;
    })}`,
  );

  for (let level = 0; level <= CLOCK_MAX_LEVEL + 1; level++) {
    let cycle = null;
    out.push(`${tag} cycle ${level} ${attempt(() => cycleText((cycle = cat.cycleAt(t, level))))}`);
    if (cycle !== null) {
      const index = cycle.cycle;
      out.push(`${tag} byindex ${level} ${attempt(() => cycleText(cat.cycleByIndex(level, index)))}`);
      out.push(`${tag} points ${level} ${attempt(() => cat.cyclePoints(level, index).map(T).join(' '))}`);
      out.push(
        `${tag} name ${level} ${text(() => frc.formatCycleName(level, index, false))} ${text(() => frc.formatCycleName(level, index, true))} ${text(() => frc.formatCyclePlace(cycle))}`,
      );
      const phases = [cycle.phase, ...INVERSE_PHASES].map((phase) => T(cat.timeAtPhase(level, index, phase)));
      out.push(`${tag} atphase ${level} ${phases.join(' ')} ${T(cat.timeAtPhase(level, index + 1n, 0))}`);
    }
    out.push(
      `${tag} threshold ${level} ${attempt(() => {
        const threshold = cat.nextThreshold(t, level);
        const parts = [thresholdText(threshold)];
        if (threshold.time !== null) {
          const boundary = threshold.time;
          parts.push(...[0, 1, 4].map((maxParts) => T(cat.spanNextChange(t, boundary, maxParts))), T(cat.spanNextChange(boundary, t, 0)));
          parts.push(T(cat.spanNextChangeSince(t, boundary, 0)), T(cat.spanNextChangeSince(t, boundary, 4)), T(cat.spanNextChangeSince(boundary, t, 0)), T(cat.spanNextChangeSince(t, t, 1)));
          const to = attempt(() => cat.spanBetween(t, boundary));
          if (typeof to !== 'string') parts.push(text(() => frc.formatSpanSigned(to, 0)));
        }
        return parts.join(' ');
      })}`,
    );

    if (!full && level % 6 !== 0) continue;
    for (let strokes = 0; strokes <= MAX_STROKES + 1; strokes++) {
      out.push(`${tag} glyph ${level} ${strokes} ${attempt(() => glyphText(cat.glyphAt(t, level, strokes)))}`);
    }
    for (const [strokes, digits] of pairs) {
      out.push(`${tag} odometer ${level} ${strokes} ${digits} ${attempt(() => odometerText(cat.odometerAt(t, level, strokes, digits)))}`);
    }
  }

  out.push(
    `${tag} sync ${attempt(() => {
      const sync = cat.syncAt(t);
      return `${syncText(sync)} ${T(cat.timeAtSyncPhase(sync.sync, sync.phase))}`;
    })}`,
  );
  out.push(`${tag} syncodometer 0 ${attempt(() => odometerText(cat.syncOdometer(t, 2, 3)))}`);
  out.push(`${tag} syncodometer 1 ${attempt(() => odometerText(cat.syncOdometer(t, 3, 2)))}`);

  out.push(
    `${tag} pentad ${attempt(() => {
      const pentad = cat.pentadAt(t);
      const texts = [];
      for (let form = 0; form <= 4; form++) {
        texts.push(text(() => frc.formatPentad(pentad, form, false)), text(() => frc.formatPentad(pentad, form, true)));
      }
      return `${pentadText(pentad)} ${texts.join(' ')}`;
    })}`,
  );

  let date = null;
  out.push(`${tag} date ${attempt(() => dateText((date = cat.dateAt(t))))}`);
  if (date !== null) {
    const terms = [];
    for (let unit = -1; unit <= UNIT_COUNT; unit++) terms.push(text(() => frc.formatDateTerm(date, unit)));
    out.push(`${tag} dateterm ${terms.join(' ')}`);
    for (let form = 0; form <= 4; form++) {
      for (let finest = 2; finest <= UNIT_COUNT; finest++) {
        let written = null;
        const shown = text(() => (written = frc.formatDate(date, form, finest)));
        out.push(`${tag} dateform ${form} ${finest} ${shown}${written === null ? '' : ` ${text(() => frc.toAscii(written))}`}`);
      }
    }
    out.push(`${tag} datetime ${attempt(() => T(cat.dateToTime(date)))}`);
    const stamp = frc.formatDate(date, 2, 8);
    out.push(
      `${tag} parse ${attempt(() => {
        const parsed = frc.parseDate(stamp, null);
        return `${dateText(parsed.date)} ${parsed.finest}`;
      })}`,
    );
    const short = frc.formatDate(date, 1, 6);
    out.push(
      `${tag} parseshort ${attempt(() => {
        const parsed = frc.parseDate(short, date);
        return `${dateText(parsed.date)} ${parsed.finest}`;
      })} ${statusOf(() => frc.parseDate(short, null))}`,
    );
  }

  if (previous !== null) {
    out.push(`${tag} span ${attempt(() => spanAll(frc, cat.spanBetween(previous, t)))}`);
    out.push(`${tag} spanback ${attempt(() => spanAll(frc, cat.spanBetween(t, previous)))}`);
  }

  for (const offset of [0, 19800, -28800]) {
    const civil = frc.civilFromTime(t, offset);
    out.push(`${tag} civil ${offset} ${civilText(civil)} ${text(() => frc.formatCivil(civil, offset))} ${T(frc.timeFromCivil(civil, offset))}`);
    const forms = [];
    for (let form = 0; form < 14; form++) forms.push(text(() => frc.formatCivilText(civil, offset, form)));
    out.push(`${tag} civiltext ${offset} ${forms.join(' ')}`);
  }

  if (interval !== null) {
    const vacuum = frc.mediumSpeed(0);
    for (const level of [0, 6, 12, 13, 29, 62]) {
      out.push(
        [
          `${tag} rung ${level}`,
          sciText(frc.period(level, interval)), sciText(frc.frequency(level, interval)), sciText(frc.length(level, interval, vacuum)),
          text(() => frc.formatPeriod(level, interval, 4)), text(() => frc.formatFrequency(level, interval, 4)),
          text(() => frc.formatLength(level, interval, vacuum, 4)),
          f64(frc.periodSeconds(level, interval)), frc.band(level, interval),
        ].join(' '),
      );
    }
  }
  return out;
}
