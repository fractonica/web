/**
 * The app's model and readings, without a browser: the URL contract, the
 * store, the token table, the rules about where literals and arithmetic may
 * live, and what the instrument and the NOW screen READ at SPEC vector A.
 *
 * The app's modules are plain ES modules that touch the DOM only inside the
 * functions that draw, so everything that decides WHAT is shown can be
 * imported and asked here.
 */
process.env.TZ = 'UTC'; // Earth-mode readings use the platform's zone: fix it before any Date is made

import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import { CivilForm, DateForm, Quarter, Unit } from '../public/lib/fractonica.js';
import { THEMES, applyTheme, withAlpha } from '../public/app/design/tokens.js';
import { buildNest, nestPath, ringCarrier } from '../public/app/drawing/arcs.js';
import { REFERENCE, fitInstrument, heroShape, ringRadii } from '../public/app/instrument/geometry.js';
import { describeInstrument, readInstrument } from '../public/app/instrument/reading.js';
import { createFrame, outOfCatalogueText } from '../public/app/model/frame.js';
import { ringSteps } from '../public/app/model/halves.js';
import * as earth from '../public/app/model/earth.js';
import { driftSeconds, signedDuration } from '../public/app/model/shim-earth-text.js';
import { createStore } from '../public/app/model/store.js';
import { formatUrlState, parseUrlState } from '../public/app/model/url.js';
import { readNow } from '../public/app/screens/now/now-reading.js';
import { A, cat, frc } from './helpers.js';

const PUBLIC = fileURLToPath(new URL('../public/', import.meta.url));

/** Every file under a directory, recursively. */
function filesUnder(directory) {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}

/** A window good enough for the store. */
function fakeWindow(search = '', stored = {}, innerWidth = 393) {
  const window = {
    innerWidth,
    location: { search, pathname: '/', hash: '' },
    history: { replaceState: (_state, _title, url) => (window.location.search = url.slice(url.indexOf('?'))) },
    localStorage: { getItem: (key) => stored[key] ?? null, setItem: (key, value) => (stored[key] = value) },
    stored,
  };
  return window;
}

/**
 * A window with a history the store can push to and go back and forward in (popstate fires, as in a
 * browser, after the address has changed). `entries` are the searches, `index` the current one.
 */
function historyWindow(search = '') {
  const listeners = [];
  const window = fakeWindow(search);
  const entries = [{ search, state: null }];
  let index = 0;
  const go = (delta) => {
    index += delta;
    window.location.search = entries[index].search;
    window.history.state = entries[index].state;
    for (const listener of listeners) listener({ state: entries[index].state });
  };
  const at = (url) => url.slice(url.indexOf('?'));
  window.history = {
    state: null,
    replaceState: (state, _title, url) => {
      entries[index] = { search: at(url), state };
      window.location.search = at(url);
      window.history.state = state;
    },
    pushState: (state, _title, url) => {
      entries.splice(index + 1, Infinity, { search: at(url), state });
      index++;
      window.location.search = at(url);
      window.history.state = state;
    },
    back: () => go(-1),
  };
  window.back = () => go(-1);
  window.forward = () => go(1);
  window.addEventListener = (type, listener) => type === 'popstate' && listeners.push(listener);
  Object.defineProperty(window, 'entries', { get: () => entries.map((entry) => entry.search) });
  return window;
}

/** Anything an Earth clock, calendar or SI unit would leave in a text. */
const EARTH_TEXT = /⊕|\b(UTC|GMT|JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC|MON|TUE|WED|THU|FRI|SAT|SUN|min|Hz|nm|km)\b|\d{1,2}:\d{2}|\b\d+(\.\d+)? ?(s|h|d|m|y)\b|%|20\d\d/;

/** Every string reachable inside a value. */
function strings(value, out = []) {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) value.forEach((item) => strings(item, out));
  else if (value && typeof value === 'object') Object.values(value).forEach((item) => strings(item, out));
  return out;
}

/* ------------------------------------------------------------------------- */

test('URL state: every key of the contract is read, anything malformed is dropped', () => {
  assert.deepEqual(parseUrlState('?t=1791460800&mode=earth&screen=lens&focus=13&level=62&theme=basalt&at=-5'), {
    t: 1791460800_000000n,
    at: -5_000000n,
    mode: 'earth',
    screen: 'lens',
    focus: 13,
    level: 62,
    theme: 'basalt',
  });
  assert.deepEqual(parseUrlState('?t=soon&mode=greg&screen=home&focus=14&level=63&theme=neon&focus=-1'), {});
  assert.deepEqual(parseUrlState(''), {});
});

test('URL state: instants keep their microseconds (a Blink is 0.31 s); beyond what a Date holds they are dropped', () => {
  // seconds with up to six decimals, read into the clock's grain
  assert.deepEqual(parseUrlState('?t=1791460800.3125&at=-0.5'), { t: 1791460800_312500n, at: -500000n });
  assert.deepEqual(parseUrlState('?at=1791460800.000001'), { at: 1791460800_000001n });
  assert.deepEqual(parseUrlState('?t=1791460800.1234567&at=1.&at=.5'), {}, 'seven decimals, a bare point: malformed');
  // a JavaScript Date holds ±8.64e15 ms: the platform's zone and timers cannot follow an instant beyond it
  assert.deepEqual(parseUrlState('?t=8640000000000'), { t: 8640000000000_000000n });
  assert.deepEqual(parseUrlState('?t=-8640000000000'), { t: -8640000000000_000000n });
  assert.deepEqual(parseUrlState('?t=8640000000001&at=9223372036854'), {});
  assert.deepEqual(parseUrlState('?t=-9000000000000'), {});
  // written back exactly, the fraction without trailing zeros
  const state = { t: 1791460800_000000n, at: 1791460823_437500n, mode: 'pure', screen: 'wave', focus: 6, level: 6, theme: 'astrolabe' };
  assert.equal(formatUrlState(state), '?t=1791460800&at=1791460823.4375&mode=pure&screen=wave&focus=6');
  assert.equal(formatUrlState({ ...state, t: -1n, at: -1_500000n }), '?t=-0.000001&at=-1.5&mode=pure&screen=wave&focus=6');
  for (const at of [1791460823_437500n, -1n, 0n, 1n, -86_399_999_999n, 8640000000000_000000n]) assert.equal(parseUrlState(formatUrlState({ ...state, at })).at, at);
});

test('URL state: written back as a deep link; foreign keys survive; defaults stay out', () => {
  const state = { t: 1791460800_000000n, at: null, mode: 'pure', screen: 'now', focus: 6, level: 6, theme: 'astrolabe' };
  assert.equal(formatUrlState(state, '?debug=1&mode=earth'), '?t=1791460800&mode=pure&screen=now&focus=6&debug=1');
  assert.equal(formatUrlState({ ...state, t: null, screen: 'lens', level: 40, theme: 'basalt', at: 5_000000n }), '?at=5&mode=pure&screen=lens&focus=6&level=40&theme=basalt');
  // the ladder is turned to a rung: that rung is part of its link too
  assert.equal(formatUrlState({ ...state, screen: 'ladder', level: 29 }), '?t=1791460800&mode=pure&screen=ladder&focus=6&level=29');
  assert.equal(formatUrlState({ ...state, screen: 'wave', level: 29 }), '?t=1791460800&mode=pure&screen=wave&focus=6');
  const again = parseUrlState(formatUrlState({ ...state, screen: 'lens', level: 40 }));
  assert.deepEqual(again, { t: 1791460800_000000n, mode: 'pure', screen: 'lens', focus: 6, level: 40 });
});

test('store: URL beats what is remembered, which beats the default', () => {
  const remembered = { 'fractonica.mode': 'earth', 'fractonica.focus': '9' };
  let store = createStore({ frc, cat, window: fakeWindow('', {}) });
  assert.deepEqual([store.state.mode, store.state.focus, store.state.screen, store.state.theme, store.state.cursor], ['pure', 6, 'now', 'astrolabe', null]);
  store = createStore({ frc, cat, window: fakeWindow('', { ...remembered }) });
  assert.deepEqual([store.state.mode, store.state.focus], ['earth', 9]);
  store = createStore({ frc, cat, window: fakeWindow('?mode=pure&focus=3&screen=wave', { ...remembered }) });
  assert.deepEqual([store.state.mode, store.state.focus, store.state.screen], ['pure', 3, 'wave']);
  assert.equal(createStore({ frc, cat, window: fakeWindow('', { 'fractonica.focus': '99', 'fractonica.mode': 'x' }) }).state.focus, 6);
});

test('store: ?t freezes the present; the cursor is separate, clamped to the catalogue, and in the URL as at=', () => {
  const window = fakeWindow('?t=1791460800');
  const store = createStore({ frc, cat, window });
  assert.equal(store.frozen, A);
  assert.equal(store.now(), A);
  assert.equal(store.time(), A);
  assert.equal(store.live, false);
  assert.equal(store.away, false);
  store.setCursor(A + 3600_000000n);
  assert.equal(store.time(), A + 3600_000000n);
  assert.equal(store.away, true);
  assert.match(window.location.search, /[?&]t=1791460800&at=1791464400&/);
  store.setCursor(cat.last + 1n);
  assert.equal(store.state.cursor, cat.last, 'time travel clamps to the catalogue (ruling 7)');
  store.setCursor(cat.first - 10n ** 12n);
  assert.equal(store.state.cursor, cat.first);
  store.returnToNow();
  assert.equal(store.state.cursor, null);
  assert.doesNotMatch(window.location.search, /at=/);
  // without ?t the platform clock runs
  const live = createStore({ frc, cat, window: fakeWindow('') });
  assert.equal(live.live, true);
  assert.ok(live.now() > A);
});

test('store: a link brings the same moment back, to the microsecond; an instant no Date holds falls back to the clock', () => {
  // a cursor a Blink and a bit after the frozen present, as a tumbler leaves it
  const window = fakeWindow('?t=1791460800&screen=wave');
  const store = createStore({ frc, cat, window });
  const blink = cat.cycleAt(A, frc.unitLevel(Unit.BLINK));
  store.setCursor(blink.end);
  assert.match(window.location.search, /&at=1791460800\.\d+&/);
  const reopened = createStore({ frc, cat, window: fakeWindow(window.location.search) });
  assert.equal(reopened.state.cursor, blink.end, 'the reopened link shows the instant that was shown');
  assert.equal(frc.formatDate(cat.dateAt(reopened.time()), DateForm.LETTERS, Unit.BLINK), 'α#6 β#4 γ#9 δ#3 ε#5 34η 29ι 21λ 4ν');
  // ?t= beyond a JavaScript Date (finding: "The number NaN cannot be converted to a BigInt") is dropped
  for (const search of ['?t=8640000000001', '?t=9223372036854&mode=pure', '?t=-9000000000000', '?t=9000000000000&at=9000000000000']) {
    const fallback = createStore({ frc, cat, window: fakeWindow(search) });
    assert.equal(fallback.frozen, null, search);
    assert.equal(fallback.live, true, search);
  }
  // at the edge of what a Date holds: frozen, out of the catalogue, and the link is written back unchanged
  const edge = fakeWindow('?t=8640000000000&mode=earth');
  const far = createStore({ frc, cat, window: edge });
  assert.equal(far.frozen, 8640000000000_000000n);
  assert.equal(cat.contains(far.time()), false);
  assert.match(edge.location.search, /^\?t=8640000000000&mode=earth/);
  assert.deepEqual(readNow(createFrame(frc, cat, far.time()), 6, 'earth').out, 'OUT OF CATALOGUE · α#1 – α#18');
});

test('store: a change of screen is a history entry (Back goes back a screen); everything else replaces the entry', () => {
  const window = historyWindow('?t=1791460800&mode=pure&screen=now&focus=6');
  const store = createStore({ frc, cat, window });
  assert.equal(window.entries.length, 1);
  store.setFocus(7); // replaced
  store.setCursor(A + 1_000000n); // replaced
  assert.equal(window.entries.length, 1);
  store.openLens(30); // pushed
  store.setLevel(31); // replaced
  store.setScreen('ladder'); // pushed
  assert.deepEqual(window.entries.map((entry) => new URLSearchParams(entry).get('screen')), ['now', 'lens', 'ladder']);
  // the browser's Back: the entry's screen and rung come back; the rest stays as it is now
  window.back();
  assert.deepEqual([store.state.screen, store.state.level, store.state.focus], ['lens', 31, 7]);
  window.back();
  assert.equal(store.state.screen, 'now');
  assert.equal(store.state.cursor, A + 1_000000n, 'Back changes the screen, not the moment');
  window.forward();
  assert.equal(store.state.screen, 'lens');
  // Escape on the lens goes back through the same history (no new entry): Back and Escape agree
  const length = window.entries.length;
  store.back();
  assert.equal(store.state.screen, 'now');
  assert.equal(window.entries.length, length);
  // a page opened on the lens has nothing of its own to go back to: Escape still leaves the lens
  const opened = createStore({ frc, cat, window: historyWindow('?screen=lens&level=40') });
  opened.back();
  assert.equal(opened.state.screen, 'now');
});

test('store: a scrub moves the cursor on every frame, but the link is written a few times a second, the last place always', async () => {
  const window = fakeWindow('?t=1791460800');
  let writes = 0;
  const write = window.history.replaceState;
  window.history.replaceState = (...args) => {
    writes++;
    return write(...args);
  };
  const store = createStore({ frc, cat, window });
  const heard = [];
  store.subscribe((changed) => heard.push(...changed));
  writes = 0;
  // 200 frames of a scrub, at once: every one is shown (listeners hear each), one is written
  for (let frame = 1; frame <= 200; frame++) store.setCursor(A + BigInt(frame) * 1_000000n);
  assert.equal(heard.length, 200);
  assert.equal(writes, 1, 'browsers refuse a flood of history writes');
  assert.match(window.location.search, /&at=1791460801&/);
  // the place where the scrub stopped is written when the wait is over
  await new Promise((done) => setTimeout(done, 320));
  assert.equal(writes, 2);
  assert.match(window.location.search, /&at=1791461000&/);
  // any other change is written at once, the return to the present too (and nothing is left waiting)
  store.setCursor(A + 500_000000n);
  store.setFocus(7);
  assert.match(window.location.search, /&at=1791461300&.*focus=7/);
  store.setCursor(A + 600_000000n);
  store.returnToNow();
  assert.doesNotMatch(window.location.search, /at=/);
  const settled = writes;
  await new Promise((done) => setTimeout(done, 320));
  assert.equal(writes, settled, 'no late write brings the cursor back into the link');
});

test('store: setters clamp, remember, write the URL and tell listeners which keys changed', () => {
  const window = fakeWindow('?t=1791460800', {}, 1280);
  const store = createStore({ frc, cat, window });
  assert.equal(store.state.layout, 'desktop');
  const heard = [];
  store.subscribe((changed) => heard.push([...changed].sort().join(',')));
  store.setFocus(99);
  assert.equal(store.state.focus, 13);
  store.stepFocus(1);
  store.setFocus(-4);
  assert.equal(store.state.focus, 0);
  store.toggleMode();
  store.setMode('martian');
  assert.equal(store.state.mode, 'earth');
  store.openLens(40);
  assert.deepEqual([store.state.screen, store.state.level], ['lens', 40]);
  store.back();
  assert.equal(store.state.screen, 'now');
  store.set({ theme: 'basalt' });
  assert.deepEqual(heard, ['focus', 'focus', 'mode', 'level,screen', 'screen', 'theme']);
  // the lens's level: the focus follows it as far as the instrument can focus (ruling 9)
  store.setLevel(9);
  assert.deepEqual([store.state.level, store.state.focus], [9, 9]);
  store.setLevel(40);
  assert.deepEqual([store.state.level, store.state.focus], [40, 9]);
  store.stepScale(1);
  assert.deepEqual([store.state.level, store.state.focus], [40, 10], 'not on the lens: Right steps the focus');
  store.setScreen('lens');
  store.stepScale(1);
  assert.deepEqual([store.state.level, store.state.focus], [41, 10], 'on the lens: Right steps its level');
  store.set({ focus: 0, screen: 'now' });
  assert.deepEqual(window.stored, { 'fractonica.focus': '0', 'fractonica.mode': 'earth' });
  assert.equal(window.location.search, '?t=1791460800&mode=earth&screen=now&focus=0&theme=basalt');
  assert.equal(createStore({ frc, cat, window: fakeWindow('', {}, 699) }).state.layout, 'phone');
  assert.equal(createStore({ frc, cat, window: fakeWindow('', {}, 700) }).state.layout, 'desktop');
});

test('tokens: two themes of one shape; colours are hex; CSS variables are generated from the table', () => {
  const shape = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, shape(value[key])])) : typeof value);
  assert.deepEqual(shape({ ...THEMES.basalt, name: '' }), shape({ ...THEMES.astrolabe, name: '' }));
  for (const theme of Object.values(THEMES)) {
    for (const [name, colour] of Object.entries(theme.color)) assert.match(colour, /^#[0-9a-f]{6}([0-9a-f]{2})?$/, `${theme.name}.${name}`);
  }
  // DESIGN.md section 2, typed in
  assert.deepEqual(
    [THEMES.astrolabe.color.void, THEMES.astrolabe.color.lumen, THEMES.astrolabe.color.sol, THEMES.astrolabe.color.bone, THEMES.astrolabe.color.ash],
    ['#040506', '#8df3e9', '#ffd60a', '#e9ecf0', '#8d96a3'],
  );
  assert.equal(withAlpha('#8df3e9', 0.42), 'rgba(141, 243, 233, 0.42)');
  assert.equal(withAlpha('#e6b54e80', 0.5), 'rgba(230, 181, 78, 0.251)');
  const set = {};
  const root = { style: { setProperty: (key, value) => (set[key] = value) }, dataset: {} };
  applyTheme(root, 'basalt');
  assert.equal(set['--c-void'], '#0b0907');
  assert.equal(set['--c-lumen-mid'], THEMES.basalt.color.lumenMid);
  assert.equal(set['--c-etch2'], THEMES.basalt.color.etch2);
  assert.match(set['--font-caps'], /^Optima/);
  assert.equal(root.dataset.theme, 'basalt');
  assert.equal(applyTheme(root, 'no-such-theme').name, 'astrolabe');
  // the web manifest and the page's <meta theme-color> cannot read the table: they mirror the void and the
  // plate, and this holds them
  const manifest = JSON.parse(readFileSync(join(PUBLIC, 'manifest.webmanifest'), 'utf8'));
  assert.equal(manifest.background_color, THEMES.astrolabe.color.void);
  assert.equal(manifest.theme_color, THEMES.astrolabe.color.plate);
  const page = readFileSync(join(PUBLIC, 'index.html'), 'utf8');
  assert.equal(page.match(/<meta name="theme-color" content="([^"]*)"/)?.[1], THEMES.astrolabe.color.plate);
  for (const icon of manifest.icons) assert.ok(existsSync(join(PUBLIC, icon.src)), `the manifest's ${icon.src} exists`);
  // every URL the page and the manifest name is relative, so the site runs under any sub-path
  for (const [, url] of page.matchAll(/(?:href|src)="([^"]+)"/g)) assert.ok(!/^\/|^[a-z]+:\/\//i.test(url), `index.html names ${url}`);
  for (const url of [manifest.start_url, manifest.scope, ...manifest.icons.map((icon) => icon.src)]) assert.ok(!url.startsWith('/'), `the manifest names ${url}`);
  // every variable the stylesheet uses is one the table generates
  // (lengths a stylesheet or a screen defines for itself are listed here)
  const local = new Set(['--v', '--safe-top', '--safe-bottom', '--inset-top', '--column-scale', '--inset', '--rx', '--edge', '--c1', '--c2', '--c3', '--c4', '--c5', '--top', '--ring-scale', '--hit-top', '--hit-bottom', '--hit-left', '--hit-right', '--goto-scale']);
  for (const sheet of readdirSync(join(PUBLIC, 'styles'))) {
    const css = readFileSync(join(PUBLIC, 'styles', sheet), 'utf8');
    for (const [, name] of css.matchAll(/var\((--[a-z0-9-]+)/g)) assert.ok(name in set || local.has(name), `${sheet} uses ${name}, which tokens.js does not generate`);
  }
});

test('no colour or font literal outside the token table', () => {
  const colour = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b|\b(?:rgba?|hsla?|oklch|oklab|color-mix)\(/;
  const font = /Futura|Avenir|Helvetica|Optima|Iowan|Palatino|Georgia|system-ui|-apple-system|sans-serif|\bserif\b|SF Pro/;
  const files = [...filesUnder(join(PUBLIC, 'app')), ...filesUnder(join(PUBLIC, 'styles')), join(PUBLIC, 'index.html')].filter((file) => !file.endsWith(join('design', 'tokens.js')));
  for (const file of files) {
    readFileSync(file, 'utf8')
      .split('\n')
      .forEach((line, index) => {
        // comments may name colours and faces; the page's <meta theme-color> mirrors the plate (held equal above)
        const code = line.replace(/\/\/.*$|^\s*\*.*$|\/\*.*?\*\//g, '').replace(/<meta name="theme-color" content="[^"]*"/, '');
        assert.doesNotMatch(code, colour, `${relative(PUBLIC, file)}:${index + 1} has a colour literal`);
        assert.doesNotMatch(code, font, `${relative(PUBLIC, file)}:${index + 1} names a font`);
      });
  }
});

test('no trigonometry and no clock arithmetic in the app: circles and periods are the core\'s', () => {
  for (const file of filesUnder(join(PUBLIC, 'app'))) {
    const source = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    const name = relative(PUBLIC, file);
    assert.doesNotMatch(source, /Math\.(sin|cos|tan|asin|acos)\b/, `${name}: positions on circles come from frc.arcPoint / frc.arcChild`);
    // the one inverse function allowed: turning a pointer position into an angle on the limb
    if (!name.endsWith(join('drawing', 'limb.js'))) assert.doesNotMatch(source, /Math\.atan2?\b/, name);
    // the factor sequence, the Saros table and unit lengths never appear as numbers
    assert.doesNotMatch(source, /\[\s*5\s*,\s*13\s*,\s*5\s*,\s*5\s*,\s*7\s*,\s*11\s*,\s*9\s*,\s*4\s*\]|58500|568972877|310\.9/, name);
    // a sign written in front of the core's text is formatting: the core signs its counts and spans
    // (frc_format_count_signed, frc_format_span_signed); only a shim may do it (shim-earth-text.js: a duration ahead)
    if (!/shim-/.test(name)) assert.doesNotMatch(source, /'\+'|`\+\$\{|−\$\{|'\\u2212'/, `${name}: a sign composed outside a shim`);
  }
  // the shims, by name: one is left, the two Earth texts the core does not write yet (a drift in seconds with
  // hundredths, and the plus of an Earth duration ahead). The band edges (frc_band_edges), the scrub's inverse
  // (frc_time_at_phase, frc_time_at_sync_phase), the signs (frc_format_count_signed, frc_format_span_signed) and
  // every other Earth wording (frc_format_civil_text, frc_format_duration, frc_parse_civil) are the core's now.
  // Another shim needs a reason and a line here.
  assert.deepEqual(
    filesUnder(join(PUBLIC, 'app'))
      .map((file) => relative(PUBLIC, file))
      .filter((file) => /shim-/.test(file))
      .sort(),
    [join('app', 'model', 'shim-earth-text.js')],
  );
});

/* ------------------------------------------------------------------------- */

test('the instrument reads vector A: glyphs, beads 8 of 9, zeta 1 of 11, the Sun, the path to now', () => {
  const frame = createFrame(frc, cat, A);
  const reading = readInstrument(frame, 6, 2, 'pure');
  assert.equal(reading.lit, true);
  assert.equal(reading.letter, 'η');
  assert.deepEqual([...reading.digits], [13, 0]);
  assert.equal(reading.name, '34η');
  assert.equal(reading.next, Quarter.END);
  assert.deepEqual(reading.thresholds.map((item) => item.word), ['End', 'Peak', 'Node', 'Valley']);
  assert.ok(reading.thresholds.every((item) => item.time === ''), 'no clock time on the bezel in pure mode');
  // the level under the Helion: 9 beads, lit through index 7 = 8 of 9
  assert.deepEqual(reading.beads, { count: 9, lit: 7 });
  // 36 Preons, a long tick every 4; ticks 0..29 lit: "lit minus one is the count in the reading (29ι)"
  assert.deepEqual(reading.graduations, { count: 36, every: 4, lit: 29 });
  assert.ok(Math.abs(reading.fraction - 0.8146) < 1e-4);
  // counter rings, parent first: zeta (11 slots, the 1st running), epsilon, then the majors
  assert.deepEqual(reading.ancestors.map((ring) => ring.letter), ['ζ', 'ε', 'δ', 'γ', 'β', 'α']);
  assert.deepEqual(reading.ancestors.map((ring) => [ring.slots, ring.current, ring.major]), [[11, 0, false], [7, 3, false], [5, 4, true], [5, 2, true], [13, 8, true], [5, 3, true]]);
  assert.equal(reading.ancestors[0].slotFraction, frame.cycle(6).fraction, 'the running slot of zeta is lit as far as the Helion has run');
  // the Sun: 19 slots, Pentad II Helion 2 = the 7th Helion of sync 4820, Pentads begin at 0 5 10 15
  assert.deepEqual({ ...reading.sun, fraction: 0, slotFraction: 0 }, { slots: 19, current: 6, slotFraction: 0, fraction: 0, groups: [0, 5, 10, 15] });
  assert.ok(Math.abs(reading.sun.fraction - 0.358662585) < 1e-8);
  assert.equal(reading.hourTicks, null);
  // the path to now: theta 8 of 9 is in its first half (arc 14 of 18); the Preon is the 2nd of that half-theta's two
  assert.deepEqual(reading.steps.map((step) => step.local), [14, 2]);
  assert.ok(reading.steps.every((step) => step.progress >= 0 && step.progress < 1));
  // level 7, the other period of the pair
  assert.deepEqual([...frame.odometer(7).digits], [5, 4]);
  assert.deepEqual([frame.cycle(7).local + 1, frame.cycle(7).siblings], [8, 9]);
});

test('the nest of a ring: arcs in time order, the path lands on the arc the core says is running', () => {
  for (const [focus, depth] of [[6, 2], [6, 3], [0, 2], [3, 3], [7, 2], [12, 2], [13, 2]]) {
    const frame = createFrame(frc, cat, A);
    const nest = buildNest(frc, ringCarrier(frc, 0, 0, 100), focus, { depth, minRadius: 0 });
    assert.equal(nest.layers[0].arcs.length, 2 * frc.factor(focus));
    let expected = 2 * frc.factor(focus);
    nest.layers.forEach((layer, d) => {
      if (d > 0) expected *= frc.factor(focus + d);
      assert.equal(layer.arcs.length, expected, `focus ${focus}, layer ${d}`);
      assert.equal(layer.level, focus + 1 + d);
    });
    const path = nestPath(nest, ringSteps(frame, focus, depth));
    path.forEach((step, d) => {
      assert.ok(Number.isInteger(step.index) && step.index >= 0 && step.index < nest.layers[d].arcs.length, `focus ${focus}, layer ${d}: index ${step.index}`);
      // the flat index of the running half-cycle = its place in the focused cycle, by the cycle's own phase
      const cycle = frame.cycle(focus);
      const halves = nest.layers[d].arcs.length;
      assert.equal(step.index, Math.floor(cycle.fraction * halves), `focus ${focus}, layer ${d}`);
    });
  }
});

test('geometry: the Helion on the reference phone is the design; every focus keeps its arcs inside the rings', () => {
  const fit = fitInstrument({ layout: 'phone', width: 393, height: 91 + (419.3 / 102) * 102, viewportWidth: 393, viewportHeight: 852, topInset: 91 });
  assert.ok(Math.abs(fit.R - 102) < 0.3 && Math.abs(fit.cy - 277) < 1 && fit.cx === 196.5, JSON.stringify(fit));
  const exact = { ...fit, R: 102, k: 1 };
  const radii = ringRadii(frc, 6, exact);
  // DESIGN.md section 5: zeta 139.7, Sun 149.2, epsilon 160.3, delta 166.8, gamma 173.3, beta 179.8, alpha 186.3
  assert.deepEqual(radii.rings.map((ring) => [ring.level, +ring.radius.toFixed(1)]), [[5, 139.7], ['sun', 149.2], [4, 160.3], [3, 166.8], [2, 173.3], [1, 179.8], [0, 186.3]]);
  assert.deepEqual(heroShape(frc, 6, 2, 102, 4.6), { carrier: 102, bezel: 0.71 * 102, depth: 2, centre: 1 });
  const desktop = fitInstrument({ layout: 'desktop', width: 728, height: 800, viewportWidth: 1280, viewportHeight: 800 });
  assert.ok(Math.abs(desktop.R - 172) < 0.2 && Math.abs(desktop.cy - 384) < 0.5 && desktop.big && desktop.depth === 3, JSON.stringify(desktop));
  const big = heroShape(frc, 6, 3, 172, 7);
  assert.deepEqual([big.carrier, big.depth, +big.bezel.toFixed(1)], [172, 3, 122.1]);
  for (const [layout, base] of [['phone', exact], ['desktop', desktop]]) {
    for (let focus = 0; focus <= 13; focus++) {
      const rings = ringRadii(frc, focus, base);
      assert.equal(rings.rings.filter((ring) => ring.level === 'sun').length, focus >= 6 ? 1 : 0, 'the Sun\'s ring exists while the focus is the Helion or finer');
      assert.equal(rings.rings.length, focus + (focus >= 6 ? 1 : 0));
      assert.ok(rings.outer <= REFERENCE[layout].outline * base.k + 0.01, `${layout} focus ${focus}: outermost ring ${rings.outer}`);
      for (let i = 1; i < rings.rings.length; i++) assert.ok(rings.rings[i].radius - rings.rings[i - 1].radius > 2.5, `${layout} focus ${focus}: rings too close`);
      const shape = heroShape(frc, focus, base.depth, rings.hero, base.big ? 7 : 4.6);
      const nest = buildNest(frc, ringCarrier(frc, 0, 0, shape.carrier), focus, { depth: shape.depth, minRadius: 0 });
      for (const layer of nest.layers) {
        for (const arc of layer.arcs) {
          const centre = Math.hypot(arc.cx, arc.cy);
          assert.ok(centre + arc.radius < 1.37 * rings.hero, `${layout} focus ${focus}: an arc reaches the first counter ring`);
          assert.ok(centre - arc.radius > shape.bezel, `${layout} focus ${focus}: an arc reaches inside the bezel`);
        }
      }
      assert.ok(nest.layers.length >= 1 && shape.bezel > 20);
    }
  }
});

test('the NOW screen reads vector A in pure mode, and says nothing of Earth', () => {
  const frame = createFrame(frc, cat, A);
  const now = readNow(frame, 6, 'pure');
  assert.equal(now.stamp, 'α#6 β#4 γ#9 δ#3 ε#5 34η 29ι 21λ 3ν');
  assert.deepEqual(now.reading, { main: ['ε#5', '34η', '29ι'], fine: ['21λ', '3ν'] });
  assert.deepEqual([now.dateName, now.dateQuarter], ['Delta Trifracton', 'End']);
  assert.deepEqual(now.majors.map((major) => `${major.letter} ${major.name} ${major.quarter}`), ['α Alpha Hexafracton Valley', 'β Beta Tetrafracton Valley', 'γ Gamma Nonafracton Valley', 'δ Delta Trifracton End']);
  assert.deepEqual(
    now.countdowns.map((c) => [c.letter, c.kind, c.quarter, c.span, c.local, c.siblings, [...c.digits]]),
    // the core counts a span greedily and never rounds up (SPEC 15.4): 43λ 21ν, where the design brief wrote 44λ
    // θ is "between" in the core's words (frc_format_level_kind; the web wrote "between units" before)
    [['η', 'Helion', 'End', '6ι 43λ', 0, 11, [13, 0]], ['θ', 'between', 'Node', '43λ 21ν', 7, 9, [5, 4]]],
  );
  assert.deepEqual({ ...now.pentad }, { index: 1, helion: 2, helions: 5, name: 'Pentad II', numeral: 'II', detail: 'Helion 2 of 5' });
  // the drift in Flavons, cut toward zero by the core (the lead's ruling for every client; it read "−2η 23ι" before,
  // and the design's "−6 236λ" is the same drift rounded)
  assert.deepEqual([[...now.sun.digits], now.sun.number, now.sun.drift, now.sun.nextQuarter, now.sun.nextSpan], [[5, 11, 13], '4 820', '−6 235λ', 'Node', '2η 24ι']);
  assert.deepEqual(now.upcoming.map((row) => `${row.sun ? 'Sun' : row.symbol} ${row.quarter} ${row.span}`), ['ζ Peak 1η 33ι', 'Sun Node 2η 24ι', 'ε Node 4η 24ι', 'δ End 43η 6ι', 'γ Valley 4ε 23η']);
  for (const focus of [0, 3, 6, 9, 13]) {
    for (const text of [...strings(readNow(frame, focus, 'pure')), ...strings(readInstrument(frame, focus, 3, 'pure')), describeInstrument(frame, focus)]) {
      assert.doesNotMatch(text, EARTH_TEXT, `pure text "${text}" (focus ${focus})`);
    }
  }
});

test('EARTH mode adds the translations of DESIGN.md section 9 (zone: UTC here)', () => {
  const frame = createFrame(frc, cat, A);
  const now = readNow(frame, 6, 'earth');
  assert.equal(now.earthLine, 'THU 8 OCT 2026 · 12:00:00 UTC');
  // durations are the core's (frc_format_duration: rounded once, a half up), so 340.937 s is "5 min 41 s" beside
  // the clock time 12:05:40 (the web's own shim cut it to "5 min 40 s" before the core wrote durations)
  assert.deepEqual(now.countdowns.map((c) => [c.earthTime, c.earthDuration]), [['12:56:12', '56 min 12 s'], ['12:05:40', '5 min 41 s']]);
  assert.deepEqual([now.sun.earthStart, now.sun.earthDrift, now.sun.earthNext], ['7 OCT 01:34', '−48 469.99 s', '9 OCT 01:34:04']);
  assert.deepEqual(now.upcoming.map((row) => row.earth), ['21:46:43', '9 OCT 01:34', '9 OCT 11:40', '17 OCT 14:11', '17 DEC 09:05']);
  const reading = readInstrument(frame, 6, 2, 'earth');
  assert.deepEqual(reading.thresholds.map((item) => `${item.word} ${item.time}`), ['End 12:56', 'Peak 09:08', 'Node 10:24', 'Valley 11:40']);
  // the civil days of the sync on the Sun's ring: an hour tick for each whole hour, the midnights lettered
  const ticks = reading.hourTicks;
  assert.equal(ticks.length, 96, 'from 7 Oct 01:34:09 to 11 Oct 01:33:59: the whole hours 02:00 ... 01:00, four times round');
  assert.deepEqual(ticks.filter((tick) => tick.kind === 'midnight').map((tick) => tick.label), ['8', '9', '10', '11']);
  assert.equal(ticks.filter((tick) => tick.kind === 'six').length, 12);
  assert.ok(ticks.every((tick, i) => tick.fraction > 0 && tick.fraction < 1 && (i === 0 || tick.fraction > ticks[i - 1].fraction)));
  // the title's Earth half in the core's forms (DAY_MONTH_YEAR, MINUTE): capitals, as every other Earth date
  // (the web's shim wrote "8 Oct 2026 12:00" before the core wrote dates)
  assert.equal(earth.titleDate(frc, A), '8 OCT 2026 12:00');
  // the core's durations: rounded once, a half up, then worded (never "60 s"); the web's shim cut them
  assert.equal(earth.duration(frc, A, A + 5_410_000n), '5.41 s');
  assert.equal(earth.duration(frc, A, A + 340_937_000n), '5 min 41 s');
  assert.equal(earth.duration(frc, A, A + 59_999_999n), '1 min');
  assert.equal(earth.duration(frc, A, A + 9_999_999n), '10 s');
  assert.equal(earth.duration(frc, A, A + 18_188_000_000n), '5 h 3 min');
  assert.equal(earth.duration(frc, A + 400_000n, A), '0.4 s');
  // the shim's two texts: a drift in seconds with hundredths (grouped by the core), the plus of a duration ahead
  assert.equal(driftSeconds(frc, 0n), '0.00 s');
  assert.equal(driftSeconds(frc, -48_469_989_900n), '−48\u202f469.99 s');
  assert.deepEqual([signedDuration(frc, A + 5_410_000n, A), signedDuration(frc, A - 210_000n, A), signedDuration(frc, A, A)], ['+5.41 s', '−0.21 s', '0 s']);
  assert.equal(earth.when(frc, A + 400n * frc.constants.US_PER_DAY, A), '12 NOV 2027');
  // the zone without a platform name: the core's offset form; a typed Earth date: the core's reader
  assert.equal(frc.formatCivilText(null, -9000, CivilForm.OFFSET), 'UTC−2:30');
  assert.equal(earth.parseEarthDate(frc, 'THU 8 OCT 2026 · 12:00:00', A), A);
  assert.equal(earth.parseEarthDate(frc, '2026-10-08T14:00+02:00', A), A);
  assert.equal(earth.parseEarthDate(frc, '31 FEB 2026', A), null);
});

test('every focus level reads at every kind of instant; outside the catalogue nothing is lit', () => {
  const instants = [cat.first, cat.first + 1n, A, cat.instant(22), cat.last - 1n, cat.last];
  for (const t of instants) {
    const frame = createFrame(frc, cat, t);
    for (let focus = 0; focus <= 13; focus++) {
      for (const mode of ['pure', 'earth']) {
        const reading = readInstrument(frame, focus, 3, mode);
        assert.equal(reading.lit, true);
        assert.equal(reading.digits.length, 2);
        assert.ok(reading.beads.lit >= 0 && reading.beads.lit < reading.beads.count);
        assert.ok(reading.graduations.lit >= 0 && reading.graduations.lit < reading.graduations.count);
        const now = readNow(frame, focus, mode);
        assert.equal(now.countdowns.length, 2);
        assert.ok(now.reading.main.length === 3 && now.reading.fine.length === 2);
      }
    }
  }
  // the catalogue's first and last partial sync have no sync: the Sun block is empty, the Pentad still answers
  const edge = readNow(createFrame(frc, cat, cat.first + 1n), 6, 'pure');
  assert.equal(edge.sun, null);
  assert.ok(edge.pentad.name.length > 0);
  assert.equal(readInstrument(createFrame(frc, cat, cat.first + 1n), 6, 2, 'pure').sun, null);

  const beyond = createFrame(frc, cat, cat.last + 1n);
  assert.equal(beyond.inCatalogue, false);
  assert.equal(beyond.cycle(6), null);
  assert.equal(outOfCatalogueText(frc, cat), 'OUT OF CATALOGUE · α#1 – α#18');
  const dark = readInstrument(beyond, 6, 2, 'pure');
  assert.deepEqual([dark.lit, dark.digits, dark.steps, dark.next, dark.beads.lit, dark.changes.length], [false, null, null, -1, -1, 0]);
  assert.ok(dark.ancestors.every((ring) => ring.current === -1 && ring.fraction === null));
  assert.deepEqual(readNow(beyond, 6, 'pure'), { lit: false, out: 'OUT OF CATALOGUE · α#1 – α#18', earthLine: '', changes: [] });
  assert.equal(describeInstrument(beyond, 6), 'Instrument, focus Eta. Nothing lit.');
});

test('the catalogue\'s closing instant: no countdown says "η PEAK IN" without a span', () => {
  for (const mode of ['pure', 'earth']) {
    const now = readNow(createFrame(frc, cat, cat.last), 6, mode);
    assert.equal(now.lit, true);
    for (const countdown of now.countdowns) {
      assert.equal(cat.nextThreshold(cat.last, countdown.level).time, null);
      assert.deepEqual([countdown.quarter, countdown.span, countdown.earthTime, countdown.earthDuration], ['', '', '', '']);
    }
    assert.ok(now.upcoming.every((row) => row.span !== ''));
  }
});

test('the page\'s Content-Security-Policy: own files and the wasm only, and the inline script\'s hash is current', async () => {
  const { createHash } = await import('node:crypto');
  const page = readFileSync(join(PUBLIC, 'index.html'), 'utf8');
  const policy = page.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/)?.[1];
  assert.ok(policy, 'index.html carries a Content-Security-Policy');
  const directives = Object.fromEntries(policy.split(';').map((part) => part.trim().split(/\s+/)).map(([name, ...values]) => [name, values]));
  assert.deepEqual(directives['default-src'], ["'self'"]);
  assert.deepEqual(directives['object-src'], ["'none'"]);
  assert.deepEqual(directives['base-uri'], ["'none'"]);
  assert.ok(directives['script-src'].includes("'wasm-unsafe-eval'"), 'the module is compiled from bytes');
  assert.ok(!directives['script-src'].includes("'unsafe-inline'") && !directives['script-src'].includes("'unsafe-eval'"));
  assert.deepEqual(directives['style-src'], ["'self'"], 'no inline style, no style attribute');
  const inline = [...page.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => `'sha256-${createHash('sha256').update(match[1]).digest('base64')}'`);
  for (const hash of inline) assert.ok(directives['script-src'].includes(hash), `index.html's inline script changed: put ${hash} in script-src`);
  // nothing in the app sets a style attribute (the policy would refuse it): CSSOM properties only
  for (const file of filesUnder(join(PUBLIC, 'app'))) assert.doesNotMatch(readFileSync(file, 'utf8'), /setAttribute\(\s*'style'|\bstyle:\s*'/, relative(PUBLIC, file));
});

test('the shipped icon is the drawing of app/drawing/icon.js now (run `make icons` after changing either)', async () => {
  const { faviconSvg } = await import('../tools/icons.mjs');
  assert.equal(readFileSync(join(PUBLIC, 'icons', 'icon.svg'), 'utf8'), await faviconSvg());
});
