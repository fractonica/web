/**
 * shim-earth-text.js - TEMPORARY SHIM: the two Earth texts the core does not write yet.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ THIS FILE IS A SHIM. Every other Earth text is the core's now           │
 * │ (frc_format_civil_text, frc_format_duration, frc_parse_civil: see       │
 * │ model/earth.js). Two are not:                                           │
 * │   driftSeconds   the sync's drift in seconds with hundredths,           │
 * │                  "−48 469.99 s" (DESIGN.md section 9: "drift in s").    │
 * │                  frc_format_duration words it "−13 h 28 min".           │
 * │                  Requested:                                             │
 * │     int frc_format_seconds(int64_t microseconds, uint8_t decimals,      │
 * │                            char *buf, size_t size); // "−48 469.99 s"   │
 * │   signedDuration the distance to a threshold within a minute, signed    │
 * │                  both ways: "+5.41 s" ahead, "−0.21 s" behind. The core │
 * │                  writes the minus of a negative duration, never a plus. │
 * │                  Requested: a signed form of frc_format_duration, as    │
 * │                  frc_format_span_signed is of frc_format_span.          │
 * │ When they exist, delete this file and call them.                        │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * WHAT IS HERE: rounding a drift to hundredths of a second (Earth arithmetic
 * on the core's drift_us), and one "+" in front of the core's duration. The
 * grouping of digits and the duration's words are the core's.
 *
 * Nothing in this file may be called in PURE mode: every caller is guarded by
 * `mode === 'earth'`.
 */

/** U+2212, the minus the core writes in its own text. */
const MINUS = '−';

/** "−48 469.99 s": the sync's drift (the core's drift_us) in seconds, rounded to hundredths, grouped by the core. */
export function driftSeconds(frc, driftUs) {
  const negative = driftUs < 0n;
  const perHundredth = BigInt(frc.constants.US_PER_SECOND) / 100n;
  const hundredths = ((negative ? -driftUs : driftUs) + perHundredth / 2n) / perHundredth;
  const decimals = String(hundredths % 100n).padStart(2, '0');
  return `${negative && hundredths > 0n ? MINUS : ''}${frc.formatCount(hundredths / 100n)}.${decimals} s`;
}

/**
 * The core's Earth duration from `now` to `t`, its direction always said: "+5.41 s" ahead (the plus is this
 * shim's), "−0.21 s" behind (the minus is the core's). "0 s" has no sign.
 */
export function signedDuration(frc, t, now) {
  const text = frc.formatDuration(t - now);
  return t > now && text !== '0 s' ? `+${text}` : text;
}
