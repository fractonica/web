/**
 * url.js - the URL state contract, read and written in one place.
 *
 *   ?t=<unix seconds>              freezes time: the present IS this instant (deterministic screenshots)
 *   &at=<unix seconds>             the cursor: a scrubbed instant shown instead of the present (extension;
 *                                  written by the app while the cursor is away from now)
 *
 * Both instants are Unix seconds with an optional fraction of up to six digits ("1791460800",
 * "1791460800.3125"): a Blink is about 0.31 s, so a moment finer than a second must survive a link.
 * They are read into, and written from, the clock's own grain: BigInt Unix MICROSECONDS (frc_time_t).
 * An instant outside what a JavaScript Date can hold (±8.64e15 ms) is dropped like any malformed
 * value: the platform's zone and timers could not follow it.
 *   &mode=pure|earth
 *   &screen=now|ladder|lens|wave
 *   &focus=<level 0..13>           the instrument's focused level (zero-based: 6 = Helion)
 *   &level=<level 0..62>           the level the lens inspects, and the rung the ladder is turned to
 *   &theme=astrolabe|basalt
 *
 * Pure functions on strings: no DOM, no core. Anything malformed is dropped
 * (the store then falls back to what is remembered, then to the default).
 */

export const SCREENS = Object.freeze(['now', 'ladder', 'lens', 'wave']);
export const MODES = Object.freeze(['pure', 'earth']);
/** Focusable levels: depths 1 - 14 (design ruling 9). */
export const FOCUS_MIN = 0;
export const FOCUS_MAX = 13;

const wholeNumber = (text, min, max) => {
  if (text === null || !/^\d{1,3}$/.test(text)) return undefined;
  const value = Number(text);
  return value >= min && value <= max ? value : undefined;
};
const oneOf = (text, list) => (list.includes(text) ? text : undefined);
/** Microseconds in a second: the URL speaks seconds, the clock microseconds (a change of unit only). */
const US_PER_SECOND = 1_000_000n;
/** The largest instant a JavaScript Date holds, in microseconds (8.64e15 ms). */
const DATE_LIMIT_US = 8_640_000_000_000_000_000n;

/** "1791460800" / "-5" / "1791460800.3125" -> BigInt Unix microseconds, or undefined. */
const seconds = (text) => {
  const match = text === null ? null : /^(-?)(\d{1,13})(?:\.(\d{1,6}))?$/.exec(text);
  if (!match) return undefined;
  const magnitude = BigInt(match[2]) * US_PER_SECOND + BigInt((match[3] ?? '').padEnd(6, '0'));
  const us = match[1] === '-' ? -magnitude : magnitude;
  return us >= -DATE_LIMIT_US && us <= DATE_LIMIT_US ? us : undefined;
};

/** BigInt Unix microseconds -> "1791460800" or "1791460800.3125" (the fraction without trailing zeros). */
export function formatSeconds(us) {
  const sign = us < 0n ? '-' : '';
  const magnitude = us < 0n ? -us : us;
  const fraction = String(magnitude % US_PER_SECOND).padStart(6, '0').replace(/0+$/, '');
  return `${sign}${magnitude / US_PER_SECOND}${fraction ? `.${fraction}` : ''}`;
}

/**
 * @param {string} search location.search
 * @param {{ levelMax?: number, themes?: readonly string[] }} [limits]
 * @returns {{ t?: bigint, at?: bigint, mode?: string, screen?: string, focus?: number, level?: number, theme?: string }}
 *   only the keys that were present and valid; `t` and `at` are instants (BigInt Unix MICROSECONDS).
 */
export function parseUrlState(search, { levelMax = 62, themes = ['astrolabe', 'basalt'] } = {}) {
  const query = new URLSearchParams(search);
  const state = {
    t: seconds(query.get('t')),
    at: seconds(query.get('at')),
    mode: oneOf(query.get('mode'), MODES),
    screen: oneOf(query.get('screen'), SCREENS),
    focus: wholeNumber(query.get('focus'), FOCUS_MIN, FOCUS_MAX),
    level: wholeNumber(query.get('level'), 0, levelMax),
    theme: oneOf(query.get('theme'), themes),
  };
  for (const key of Object.keys(state)) if (state[key] === undefined) delete state[key];
  return state;
}

/**
 * The query string for a state (`t` and `at` are instants: BigInt Unix microseconds, written as
 * seconds with the fraction they have). Keys the contract does not know are kept
 * (`extra`), so a link with foreign parameters survives a state change.
 * @param {{ t?: bigint | null, at?: bigint | null, mode: string, screen: string, focus: number, level?: number | null, theme?: string }} state
 * @param {string} [extra] the current location.search, for foreign keys
 * @param {string} [defaultTheme]
 * @returns {string} "?t=...&mode=..." (never empty)
 */
export function formatUrlState(state, extra = '', defaultTheme = 'astrolabe') {
  const known = new Set(['t', 'at', 'mode', 'screen', 'focus', 'level', 'theme']);
  const query = new URLSearchParams();
  if (state.t !== null && state.t !== undefined) query.set('t', formatSeconds(state.t));
  if (state.at !== null && state.at !== undefined) query.set('at', formatSeconds(state.at));
  query.set('mode', state.mode);
  query.set('screen', state.screen);
  query.set('focus', String(state.focus));
  // the rung looked at is part of the link on the two screens that are about one rung
  if (state.level !== null && state.level !== undefined && (state.screen === 'lens' || state.screen === 'ladder')) query.set('level', String(state.level));
  if (state.theme && state.theme !== defaultTheme) query.set('theme', state.theme);
  for (const [key, value] of new URLSearchParams(extra)) if (!known.has(key)) query.append(key, value);
  return `?${query}`;
}
