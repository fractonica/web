#!/usr/bin/env node
/**
 * idle.mjs - how much main-thread time the running clock costs.
 *
 * Opens the LIVE page (no ?t=: time moves by itself) in headless Chrome,
 * waits, and reads Chrome's own accounting (DevTools `Performance.getMetrics`)
 * before and after: seconds the main thread spent in tasks, in script, in
 * layout and style. A clock that spins (a busy loop, a timer that fires for
 * nothing) shows here as a task time near the wall time; a clock that sleeps
 * between the instants the core names shows a few per cent.
 *
 * Usage:
 *   node tools/idle.mjs                       DEFAULT_VIEWS (below): the Helion on a phone, fine foci on a desktop
 *   node tools/idle.mjs --seconds 10 --query "screen=wave&focus=6" --width 1280 --height 800
 *   make idle
 * Prints one line per view; exits 1 when a view spends more of the wall time in main-thread tasks than its
 * budget (DEFAULT_VIEWS; --budget for a --query view, default 0.20).
 *
 * `measureIdle` is exported for test/browser-journey.test.js.
 */
import { pathToFileURL } from 'node:url';

import { haveChrome, launchChrome, CHROME } from './chrome.mjs';
import { startServer } from './serve.mjs';

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

/**
 * The views `make idle` watches, each [query, width, height, budget]: the Helion on a phone and a desktop
 * (the reference: a few per cent, budget 20 %), and the busiest ones, the fine foci on a desktop, where the
 * arcs fill at 30 passes a second (DESIGN.md section 10) on the largest canvas. Their budget is wider (35 %):
 * tools/chrome.mjs runs Chrome with --disable-gpu, so every pass is rasterised in software; the figure is
 * kept here so that a regression shows, not as a claim about a real browser.
 */
export const DEFAULT_VIEWS = Object.freeze([
  ['screen=now&focus=6&mode=pure', 393, 852, 0.2],
  ['screen=now&focus=6&mode=pure', 1280, 800, 0.2],
  ['screen=now&focus=9&mode=pure', 1280, 800, 0.35],
  ['screen=now&focus=13&mode=pure', 1280, 800, 0.35],
  ['screen=now&focus=13&mode=earth', 1280, 800, 0.35],
  ['screen=wave&focus=13&mode=earth', 1280, 800, 0.35],
  ['screen=lens&level=13&mode=earth', 1280, 800, 0.35],
]);

/**
 * Main-thread accounting of an open page over `seconds` of doing nothing.
 * @param {import('./chrome.mjs').Page} page a page of tools/chrome.mjs
 * @param {number} seconds how long to watch
 * @returns {Promise<{ wall: number, task: number, script: number, layout: number, style: number, share: number, repaints: number | null }>}
 *   seconds each; `share` = task / wall; `repaints` = how often the instrument's canvas was cleared (null when
 *   the view has no such canvas)
 */
export async function measureIdle(page, seconds) {
  await page.send('Performance.enable');
  const read = async () => Object.fromEntries((await page.send('Performance.getMetrics')).metrics.map((metric) => [metric.name, metric.value]));
  // count the repaints of every canvas of the view: each pass of a screen clears its canvas once
  await page.evaluate(`(() => {
    window.__clears = 0;
    const original = CanvasRenderingContext2D.prototype.clearRect;
    CanvasRenderingContext2D.prototype.clearRect = function (...args) { window.__clears++; return original.apply(this, args); };
  })()`);
  const before = await read();
  await sleep(seconds * 1000);
  const after = await read();
  const delta = (name) => after[name] - before[name];
  const wall = delta('Timestamp');
  return {
    wall,
    task: delta('TaskDuration'),
    script: delta('ScriptDuration'),
    layout: delta('LayoutDuration'),
    style: delta('RecalcStyleDuration'),
    share: delta('TaskDuration') / wall,
    repaints: await page.evaluate('window.__clears'),
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const args = process.argv.slice(2);
  const option = (name, fallback) => (args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : fallback);
  if (!haveChrome()) {
    console.error(`idle: no browser at ${CHROME} (set CHROME=)`);
    process.exit(1);
  }
  const seconds = Number(option('seconds', '10'));
  const budget = Number(option('budget', '0.20'));
  const one = option('query', null);
  const scale = Number(option('scale', '2'));
  const size = { width: Number(option('width', '393')), height: Number(option('height', '852')), scale };
  const views = one !== null ? [{ query: one, size, budget }] : DEFAULT_VIEWS.map(([query, width, height, share]) => ({ query, size: { width, height, scale }, budget: share }));
  const server = await startServer({ port: 0, quiet: true });
  const chrome = await launchChrome();
  let over = 0;
  try {
    for (const { query, size, budget: allowed } of views) {
      const page = await chrome.open(`${server.url}?${query}`, size);
      const m = await measureIdle(page, seconds);
      if (m.share > allowed) over++;
      const ms = (value) => `${(value * 1000).toFixed(0)} ms`;
      console.log(`${m.share > allowed ? 'OVER ' : ''}${query}  ${size.width}x${size.height}: over ${m.wall.toFixed(2)} s the main thread worked ${ms(m.task)} (${(m.share * 100).toFixed(1)} % of the time): script ${ms(m.script)}, layout ${ms(m.layout)}, style ${ms(m.style)}; canvas clears ${m.repaints}`);
      await page.close();
    }
  } finally {
    await chrome.close();
    await server.close();
  }
  process.exit(over > 0 ? 1 : 0);
}
