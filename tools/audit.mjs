#!/usr/bin/env node
/**
 * audit.mjs - every screen at every size the site must survive, photographed
 * and checked for text that falls off the page.
 *
 * `make shoot` holds the two reference viewports (393 x 852 and 1280 x 800)
 * to the design. This tool covers the rest: small and large phones, a phone
 * on its side, tablets both ways, laptop and wide desktop, a page zoomed to
 * 200 % (emulated as half the CSS viewport at twice the pixel ratio, which is
 * what browser zoom does to layout), and prefers-reduced-motion. For each view
 * it writes a PNG and asks the page:
 *   - is any visible text cut by the left or right edge of the window, or by a box that hides its overflow?
 *   - is any text smaller than 6.2 px (DESIGN.md section 3), zoom included?
 *   - does a box that scrolls show the .more-below fade (no scroll bar is drawn)?
 *   - does the page scroll sideways or down? does the screen's own box scroll?
 *   - did the console report anything?
 * The layout holds from 320 CSS px of width (WCAG's reflow width); narrower
 * windows, such as a 393 px phone zoomed to 200 % (196 px), cut text and are
 * not in the list.
 * A scrolling screen box is reported, not failed (the LENS scrolls its body on
 * purpose when it holds more than the screen). Everything else fails (exit 1).
 * LOOK at the PNGs as well: an overlap inside the window is not detected.
 *
 * Usage:
 *   node tools/audit.mjs                     every size x screen x mode into build/sizes/
 *   node tools/audit.mjs w320 land           only these sizes
 *   make audit
 */
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { haveChrome, launchChrome, CHROME } from './chrome.mjs';
import { startServer } from './serve.mjs';

const WEB = fileURLToPath(new URL('..', import.meta.url));

/** name -> [CSS width, CSS height, device pixel ratio, reduced motion] */
export const SIZES = {
  w320: [320, 568, 2],
  w375: [375, 667, 2],
  w393: [393, 852, 3],
  land: [852, 393, 3], // a phone on its side: wider than 700, so the desktop arrangement
  w768: [768, 1024, 2],
  w1024: [1024, 768, 2],
  w1280: [1280, 800, 2],
  w1920: [1920, 1080, 1],
  zoom200: [640, 400, 4], // a 1280 x 800 window at 200 % zoom
  reduced: [393, 852, 3, true],
};

/** What the page is asked after it is ready: a list of problems as words. */
export const AUDIT = `(() => {
  const out = [];
  const W = innerWidth, H = innerHeight;
  const walker = document.createTreeWalker(document.getElementById('app'), NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.textContent.trim()) continue;
    const el = node.parentElement;
    if (el.closest('.sr-only') || !el.getClientRects().length) continue;
    const style = getComputedStyle(el);
    if (style.visibility === 'hidden' || Number(style.opacity) === 0) continue;
    const range = document.createRange(); range.selectNodeContents(node);
    const r = range.getBoundingClientRect();
    if (r.width === 0 || r.bottom < 0 || r.top > H) continue;
    const name = (el.getAttribute('class') || el.tagName) + ' "' + node.textContent.trim().slice(0, 30) + '"';
    if (r.left < -0.5 || r.right > W + 0.5) out.push('text cut by the edge: ' + name + ' x ' + Math.round(r.left) + '..' + Math.round(r.right));
    // cut sideways by a box that hides its overflow (a scaled column wider than its box)
    for (let box = el.parentElement; box && box.id !== 'app'; box = box.parentElement) {
      if (!/hidden|clip/.test(getComputedStyle(box).overflowX)) continue;
      const b = box.getBoundingClientRect();
      if (r.left < b.left - 0.5 || r.right > b.right + 0.5) out.push('text cut by its box: ' + name + ' x ' + Math.round(r.left) + '..' + Math.round(r.right) + ' in ' + Math.round(b.left) + '..' + Math.round(b.right) + ' (' + (box.getAttribute('class') || box.id) + ')');
      break;
    }
    // DESIGN.md section 3: no type under 6.2 px (the zoom of every ancestor included)
    let zoom = 1;
    for (let e = el; e; e = e.parentElement) zoom *= parseFloat(getComputedStyle(e).zoom) || 1;
    if (parseFloat(style.fontSize) * zoom < 6.195) out.push('type under 6.2 px: ' + name + ' ' + (parseFloat(style.fontSize) * zoom).toFixed(2) + ' px');
  }
  // a box that scrolls must say there is more below (no scroll bar is drawn): the .more-below fade
  const scroller = document.getElementById('screen') && [document.getElementById('screen'), ...document.getElementById('screen').querySelectorAll('*')].find((e) => e.scrollHeight > e.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(e).overflowY));
  if (scroller && scroller.scrollTop + scroller.clientHeight < scroller.scrollHeight - 2 && !scroller.classList.contains('more-below')) out.push('a box scrolls with no cue of more below: ' + (scroller.getAttribute('class') || scroller.id));
  if (document.documentElement.scrollWidth > W) out.push('the page scrolls sideways: ' + document.documentElement.scrollWidth + ' in ' + W);
  if (document.documentElement.scrollHeight > H + 1) out.push('the page scrolls down: ' + document.documentElement.scrollHeight + ' in ' + H);
  return out;
})()`;
const SCREEN_SCROLLS = `(() => { const s = document.getElementById('screen'); const inner = s && [s, ...s.querySelectorAll('*')].find((e) => e.scrollHeight > e.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(e).overflowY)); return inner ? (inner.className || inner.id) + ' ' + inner.scrollHeight + ' in ' + inner.clientHeight : ''; })()`;

if (import.meta.url === new URL(`file://${resolve(process.argv[1] ?? '')}`).href) {
  if (!haveChrome()) {
    console.error(`audit: no browser at ${CHROME} (set CHROME=)`);
    process.exit(1);
  }
  const only = process.argv.slice(2);
  const out = resolve(WEB, 'build/sizes');
  mkdirSync(out, { recursive: true });
  const server = await startServer({ port: 0, quiet: true });
  const chrome = await launchChrome();
  let failures = 0;
  let views = 0;
  try {
    for (const [name, [width, height, scale, reducedMotion = false]] of Object.entries(SIZES)) {
      if (only.length && !only.includes(name)) continue;
      for (const screen of ['now', 'ladder', 'lens', 'wave']) {
        for (const mode of ['pure', 'earth']) {
          const page = await chrome.open(`${server.url}?t=1791460800&mode=${mode}&screen=${screen}&focus=6&level=6`, { width, height, scale, timezone: 'UTC', reducedMotion });
          await page.screenshot(`${out}/${name}-${screen}-${mode}.png`);
          const audit = await page.evaluate(AUDIT);
          const scrolls = await page.evaluate(SCREEN_SCROLLS);
          const problems = page.problems().map((p) => `console ${p.type}: ${p.text}`);
          views++;
          if (!page.ready) problems.push('the page never set data-ready');
          if (audit.length || problems.length) {
            failures++;
            console.log(`FAIL ${name} ${screen} ${mode} (${width} x ${height}): ${[...audit, ...problems].join('; ')}`);
          }
          if (scrolls) console.log(`note ${name} ${screen} ${mode}: the screen scrolls its body (${scrolls})`);
          await page.close();
        }
      }
    }
  } finally {
    await chrome.close();
    await server.close();
  }
  console.log(`audit: ${views} view(s) into build/sizes/, ${failures} with problems`);
  process.exit(failures ? 1 : 0);
}
