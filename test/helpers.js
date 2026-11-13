/**
 * helpers.js - what the test suites share: one loaded core, the SPEC's test
 * instants, and the rounding SPEC's printed figures need.
 *
 * Tests MAY do arithmetic (they hold the core against figures typed in from
 * SPEC.md); the client may not. Nothing here is imported by public/.
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { load } from '../public/lib/fractonica.js';

/** The web repository's root, and the sibling core checkout (override with CORE=). */
export const WEB = fileURLToPath(new URL('..', import.meta.url));
export const CORE = resolve(process.env.CORE ?? resolve(WEB, '../core'));
/** Tests that read the core's sources are skipped, loudly, when it is not checked out. */
export const HAVE_CORE = existsSync(resolve(CORE, 'include/fractonica.h'));
export const NO_CORE = `no core checkout at ${CORE} (set CORE=)`;

/** The module as the site ships it: public/fractonica.wasm. */
export const WASM_PATH = resolve(WEB, 'public/fractonica.wasm');

/** One instance for every suite. */
export const frc = await load();
export const cat = frc.saros141;

/** SPEC 12: the test instants. */
export const A = frc.fromUnixSeconds(1791460800); // 2026-10-08T12:00:00Z
export const B = frc.fromUnixSeconds(946684800); // 2000-01-01T00:00:00Z
export const C = frc.fromUnixSeconds(2886085800); // 2061-06-15T18:30:00Z
export const ANCHOR_PLUS_1S = frc.fromUnixMs(125593320816); // one second after the anchor eclipse

/**
 * Microseconds rounded to the nearest millisecond (a half away from zero).
 * SPEC prints instants to the millisecond; the core returns the first
 * microsecond at or after the exact instant.
 */
export function nearestMs(us) {
  return us >= 0n ? (us + 500n) / 1000n : -((-us + 500n) / 1000n);
}

/** "2026-10-07T01:34:09.826Z" for an instant rounded to the millisecond. */
export function iso(t) {
  return frc.formatCivil(frc.civilFromTime(nearestMs(t) * 1000n, 0), 0);
}

/** SPEC prints a drift as "−48469.9899 s": microseconds rounded to 0.1 ms. */
export function nearestTenthMs(us) {
  return us >= 0n ? (us + 50n) / 100n : -((-us + 50n) / 100n);
}

/**
 * Does a 0.32 phase match SPEC's 9-decimal figure? The field is the floor of
 * 2^32 times the phase (up to 2.4e-10 low) and SPEC rounds to 1e-9.
 */
export function phaseIs(fraction, expected) {
  return Math.abs(fraction - expected) < 7.5e-10;
}

/** The fraction num/den to 12 decimals, rounded half up, as a BigInt. */
export function fractionE12(num, den) {
  return (num * 10n ** 12n * 2n + den) / (2n * den);
}

/**
 * The exact rational num/den as the core's frc_sci_t would hold it: 17
 * significant digits, rounded half to even. { mantissa, exp10 }.
 */
export function sciOf(num, den) {
  let exp10 = 0;
  const low = 10n ** 16n;
  const high = 10n ** 17n;
  // scale so that low <= num/den < high
  while (num >= den * high) {
    den *= 10n;
    exp10 += 1;
  }
  while (num < den * low) {
    num *= 10n;
    exp10 -= 1;
  }
  let mantissa = num / den;
  const twice = 2n * (num % den);
  if (twice > den || (twice === den && mantissa % 2n === 1n)) mantissa += 1n;
  if (mantissa === high) {
    mantissa = low;
    exp10 += 1;
  }
  return { mantissa, exp10 };
}

/** A small deterministic generator for the property tests (xorshift64*). */
export function makeRandom(seed = 0x9e3779b97f4a7c15n) {
  let state = BigInt.asUintN(64, seed);
  const next = () => {
    state ^= state >> 12n;
    state = BigInt.asUintN(64, state ^ (state << 25n));
    state ^= state >> 27n;
    return BigInt.asUintN(64, state * 0x2545f4914f6cdd1dn);
  };
  return {
    next,
    /** A BigInt in [low, high]. */
    between: (low, high) => low + (next() % (high - low + 1n)),
  };
}
