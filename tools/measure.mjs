#!/usr/bin/env node
/**
 * measure.mjs - where things are on a page, in CSS px: for comparing a layout
 * with the positions DESIGN.md section 7 gives (baselines of text, centres of
 * marks). A development aid; nothing depends on it.
 *
 *   node tools/measure.mjs "mode=pure&screen=now" [--width 393 --height 852] [selector ...]
 *
 * Prints, for every element matching each selector: left, right, top, bottom,
 * centre y and the text BASELINE (found with a zero-size inline-block probe).
 * Without selectors it measures the NOW screen's landmarks. Also prints the
 * instrument's geometry (centre and radii) when there is one.
 */
import { haveChrome, launchChrome, CHROME } from './chrome.mjs';
import { startServer } from './serve.mjs';

const argv = process.argv.slice(2);
const options = { width: '393', height: '852', t: '1791460800' };
const rest = [];
for (let i = 0; i < argv.length; i++) {
  const name = argv[i].startsWith('--') ? argv[i].slice(2) : null;
  if (name !== null && name in options) options[name] = argv[++i];
  else rest.push(argv[i]);
}
const query = rest.shift() ?? 'mode=pure&screen=now';
const selectors = rest.length
  ? rest
  : ['.pentad .caps', '.mode-toggle', '.date-words', '.major .name', '.reading', '.earth-line', '.countdown .beads', '.cd-label', '.cd-span', '.countdown .earth', '.rule-sun', '.sun .caps', '.sun .value', '.sun .earth', '.sun .glyphs', '.upcoming-title', '.upcoming-row .span', '.sigil-button svg', '.sigil-button .caps', '.limb'];

if (!haveChrome()) {
  console.error(`measure: no browser at ${CHROME} (set CHROME=)`);
  process.exit(1);
}
const server = await startServer({ port: 0, quiet: true });
const chrome = await launchChrome();
try {
  const page = await chrome.open(`${server.url}?t=${options.t}&${query}`, { width: Number(options.width), height: Number(options.height), timezone: 'UTC' });
  const rows = await page.evaluate(`(${(list) => {
    const out = [];
    for (const selector of list) {
      for (const element of document.querySelectorAll(selector)) {
        const box = element.getBoundingClientRect();
        if (box.width === 0 && box.height === 0) continue;
        let baseline = null;
        if (!(element instanceof SVGElement) && element.tagName !== 'HR' && element.tagName !== 'CANVAS') {
          const probe = document.createElement('span');
          probe.style.cssText = 'display:inline-block;width:0;height:0';
          element.prepend(probe);
          baseline = probe.getBoundingClientRect().bottom;
          probe.remove();
        }
        out.push([selector, (element.textContent || '').trim().slice(0, 24), box.left, box.right, box.top, box.bottom, (box.top + box.bottom) / 2, baseline]);
      }
    }
    return out;
  }})(${JSON.stringify(selectors)})`);
  const n = (v) => (v === null ? '      -' : v.toFixed(1).padStart(7));
  console.log(`${'selector'.padEnd(22)} ${'text'.padEnd(24)}    left   right     top  bottom  centre    base`);
  for (const [selector, text, ...numbers] of rows) console.log(`${selector.padEnd(22)} ${text.padEnd(24)} ${numbers.map(n).join(' ')}`);
  for (const message of page.problems()) console.error(`console ${message.type}: ${message.text}`);
  await page.close();
} finally {
  await chrome.close();
  await server.close();
}
