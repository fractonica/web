#!/usr/bin/env node
/**
 * shoot.mjs - deterministic screenshots of the site with headless Chrome.
 *
 * Serves public/ on a free port (tools/serve.mjs), opens each view of the URL
 * contract at a frozen instant in a viewport of exactly the asked size
 * (tools/chrome.mjs) and writes a PNG per view. It also reports what the
 * browser console said: any error, warning or uncaught exception fails the
 * run (exit 1) after all pictures are taken. LOOK at the PNGs before saying
 * a screen is right.
 *
 * Usage:
 *   node tools/shoot.mjs [options] [filter ...]
 *   make shoot                          every view
 *   make shoot SHOTS="now phone"        only the views whose name has every word
 *   make shoot SHOTS="now-phone-pure lens-desktop-earth"   exactly these views
 *   make shoot SHOTS="--query theme=basalt now"
 *
 * VIEWS  (all at ?t=1791460800, SPEC test vector A, 2026-10-08T12:00:00Z)
 *   <screen>-<layout>-<mode>.png        every screen x layout x mode
 *       screen  now | ladder | lens | wave        (from public/app/model/url.js SCREENS:
 *                                                  a screen added there is shot without touching this file)
 *       layout  phone 393 x 852 at 3x | desktop 1280 x 800 at 2x     (DESIGN.md section 7)
 *       mode    pure | earth
 *   now-<layout>-pure-f<NN>.png         the NOW screen at focus levels 0 3 5 6 7 9 12 13
 *   ladder-<layout>-<mode>-l<NN>.png    the LADDER turned to the top (00), zeta-1 (29) and the bottom (62);
 *                                       the plain ladder view above is the ladder at the Helion
 *   lens-<layout>-<mode>-l<NN>.png      the LENS on levels 0 12 13 30 62 (the plain lens view is the Helion)
 *   wave-<layout>-<mode>-f<NN>.png      the WAVE at focus levels 3 and 9 (the plain wave view is the Helion's, 6)
 *   wave-<layout>-<mode>-away.png       the WAVE with a scrubbed cursor (&at=): the NOW mark shows the offset
 *
 * To add a view of your own, push it in `views()` below: { name, query, width, height, scale }.
 *
 * Options
 *   --out <dir>       where the PNGs go             (build/shots)
 *   --t <unix s>      the frozen instant            (1791460800)
 *   --scale <n>       device pixel ratio for every view (default: 3 phone, 2 desktop)
 *   --query <a=b&..>  more URL state for every view (theme=basalt, at=<unix s> for a cursor)
 *   --tz <IANA id>    the browser's time zone       (UTC, as the design renders; "local" = the machine's)
 *
 * Environment: CHROME = the browser binary (default: Google Chrome on macOS).
 */
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { MODES, SCREENS } from '../public/app/model/url.js';
import { haveChrome, launchChrome, CHROME } from './chrome.mjs';
import { startServer } from './serve.mjs';

const WEB = fileURLToPath(new URL('..', import.meta.url));

/** layout -> [width, height, device pixel ratio] */
const LAYOUTS = { phone: [393, 852, 3], desktop: [1280, 800, 2] };
/** The NOW screen is also shot at these focus levels (0 = Alpha, 6 = Helion, 13 = xi). */
const FOCUS_LEVELS = [0, 3, 5, 6, 7, 9, 12, 13];

/** The LADDER is also shot turned to these rungs, the LENS inspecting these (the plain views show level 6). */
const LADDER_LEVELS = [0, 29, 62];
const LENS_LEVELS = [0, 12, 13, 30, 62];
/** The WAVE is also shot at these focus levels (the plain views are at the Helion) ... */
const WAVE_FOCUS = [3, 9];
/** ... and with the cursor this many seconds after the frozen present (9 200 s: half a Helion on). */
const WAVE_AWAY_SECONDS = 9200n;

/** Command-line options: --name value; everything else is a filter word. */
function parseArgs(argv) {
  const options = { out: resolve(WEB, 'build/shots'), t: '1791460800', scale: '', query: '', tz: 'UTC', filters: [] };
  for (let i = 0; i < argv.length; i++) {
    const name = argv[i].startsWith('--') ? argv[i].slice(2) : null;
    if (name !== null && name in options && name !== 'filters' && argv[i + 1] !== undefined) options[name] = argv[++i];
    else options.filters.push(argv[i]);
  }
  return options;
}

/** Every view. */
function views({ t, query, scale }) {
  const list = [];
  const more = query ? `&${query}` : '';
  for (const [layout, [width, height, ratio]] of Object.entries(LAYOUTS)) {
    const size = { width, height, scale: scale ? Number(scale) : ratio };
    for (const screen of SCREENS) {
      for (const mode of MODES) {
        list.push({ name: `${screen}-${layout}-${mode}`, query: `t=${t}&mode=${mode}&screen=${screen}&focus=6${more}`, ...size });
      }
    }
    for (const focus of FOCUS_LEVELS) {
      list.push({ name: `now-${layout}-pure-f${String(focus).padStart(2, '0')}`, query: `t=${t}&mode=pure&screen=now&focus=${focus}${more}`, ...size });
    }
    for (const mode of MODES) {
      for (const focus of WAVE_FOCUS) {
        list.push({ name: `wave-${layout}-${mode}-f${String(focus).padStart(2, '0')}`, query: `t=${t}&mode=${mode}&screen=wave&focus=${focus}${more}`, ...size });
      }
      // a scrubbed cursor: the NOW mark shows how far it is from the (frozen) present
      list.push({ name: `wave-${layout}-${mode}-away`, query: `t=${t}&at=${BigInt(t) + WAVE_AWAY_SECONDS}&mode=${mode}&screen=wave&focus=6${more}`, ...size });
    }
    for (const [screen, levels] of [['ladder', LADDER_LEVELS], ['lens', LENS_LEVELS]]) {
      for (const mode of MODES) {
        for (const level of levels) {
          list.push({ name: `${screen}-${layout}-${mode}-l${String(level).padStart(2, '0')}`, query: `t=${t}&mode=${mode}&screen=${screen}&focus=6&level=${level}${more}`, ...size });
        }
      }
    }
  }
  return list;
}

const options = parseArgs(process.argv.slice(2));
if (!haveChrome()) {
  console.error(`shoot: no browser at ${CHROME} (set CHROME=)`);
  process.exit(1);
}
// filter words: a full view name picks that view; other words must all be parts of the name
const names = options.filters.filter((word) => word.includes('-'));
const words = options.filters.filter((word) => !word.includes('-'));
const wanted = views(options).filter((view) => (names.length === 0 || names.includes(view.name)) && words.every((word) => view.name.split('-').includes(word)));
if (wanted.length === 0) {
  console.error(`shoot: no view matches "${options.filters.join(' ')}"`);
  process.exit(1);
}
mkdirSync(options.out, { recursive: true });
const server = await startServer({ port: 0, quiet: true });
const chrome = await launchChrome();
let problems = 0;
try {
  for (const view of wanted) {
    const file = resolve(options.out, `${view.name}.png`);
    const page = await chrome.open(`${server.url}?${view.query}`, {
      width: view.width,
      height: view.height,
      scale: view.scale,
      timezone: options.tz === 'local' ? null : options.tz,
    });
    if (!page.ready) {
      problems++;
      console.error(`shoot: ${view.name}: the page never set data-ready on <html>; shot as it was`);
    }
    await page.screenshot(file);
    for (const message of page.problems()) {
      problems++;
      console.error(`shoot: ${view.name}: console ${message.type}: ${message.text}`);
    }
    await page.close();
    console.log(file);
  }
} finally {
  await chrome.close();
  await server.close();
}
if (problems > 0) {
  console.error(`shoot: ${problems} problem(s) reported by the browser`);
  process.exit(1);
}
console.log(`shoot: ${wanted.length} view(s), console clean`);
