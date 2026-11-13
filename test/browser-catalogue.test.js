/**
 * The LADDER and the LENS in a real browser (headless Chrome, tools/chrome.mjs),
 * at SPEC vector A (?t=1791460800, zone UTC).
 *
 * What only a browser can prove here: where the rows stand (DESIGN.md
 * section 7), the input of DESIGN.md section 8 (turn the wheel, the spine,
 * open the lens, focus the instrument, the limb over all 63 rungs, swipe
 * down), that PURE mode leaves no Earth text on either screen at any rung,
 * that EARTH mode adds its figures, and a clean console.
 *
 * Skipped, with the reason, when no Chrome is installed (set CHROME=).
 * Grouped numbers of the core carry U+202F; `flat` turns every kind of space
 * into a plain one before a text is compared.
 */
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { CHROME, haveChrome, launchChrome } from '../tools/chrome.mjs';
import { startServer } from '../tools/serve.mjs';

const skip = haveChrome() ? false : `no browser at ${CHROME} (set CHROME=)`;
const VECTOR_A = 't=1791460800';
const PHONE = { width: 393, height: 852, timezone: 'UTC' };
const DESKTOP = { width: 1280, height: 800, timezone: 'UTC' };

/** Anything an Earth clock, calendar or SI unit would leave in a text. */
const EARTH_TEXT = /⊕|\b(UTC|GMT|JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC|MON|TUE|WED|THU|FRI|SAT|SUN|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec|min|Hz|nm|km)\b|\d{1,2}:\d{2}|\b\d+(\.\d+)? ?(s|h|d|m|y)\b|%|20\d\d/;

/** Everything a user or assistive technology can read on the page, as one list of strings. */
const REACHABLE = `(() => {
  const out = [document.title, document.body.innerText];
  for (const element of document.querySelectorAll('*')) {
    for (const name of ['aria-label', 'aria-valuetext', 'aria-description', 'title', 'alt', 'placeholder']) {
      const value = element.getAttribute(name);
      if (value) out.push(value);
    }
    if (element.classList.contains('sr-only') && element.textContent) out.push(element.textContent);
  }
  return out;
})()`;

/** [screen, mode, layout, focus, level]: the state as the page shows it (the level is in the link). */
const state = `(() => { const app = document.getElementById('app').dataset; const level = new URLSearchParams(location.search).get('level'); return [app.screen, app.mode, app.layout, Number(app.focus), level === null ? null : Number(level)]; })()`;
const flat = `((text) => text.replace(/\\s+/g, ' ').trim())`;
const text = (selector) => `${flat}(document.querySelector(${JSON.stringify(selector)}).textContent)`;
const texts = (selector) => `[...document.querySelectorAll(${JSON.stringify(selector)})].map((e) => ${flat}(e.textContent))`;
/** The vertical centre of an element in the viewport. */
const centreY = (selector) => `(() => { const b = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return (b.top + b.bottom) / 2; })()`;
/** A press and release on the ladder's wheel with a pointer of our own making (two of them make a double click). */
const press = (x, y) => `(() => { const el = document.querySelector('.ladder-wheel'); for (const type of ['pointerdown', 'pointerup']) el.dispatchEvent(new PointerEvent(type, { pointerId: 7, pointerType: 'mouse', button: 0, clientX: ${x}, clientY: ${y}, bubbles: true, cancelable: true })); })()`;
const pause = (ms) => new Promise((done) => setTimeout(done, ms));

let server;
let chrome;
before(async () => {
  if (skip) return;
  server = await startServer({ port: 0, quiet: true });
  chrome = await launchChrome();
});
after(async () => {
  await chrome?.close();
  await server?.close();
});

test('LADDER on a phone, turned to zeta-1: the rows of the design, the one red rung, the spine', { skip, timeout: 60000 }, async () => {
  const page = await chrome.open(`${server.url}?${VECTOR_A}&mode=pure&screen=ladder&focus=6&level=29`, PHONE);
  try {
    assert.deepEqual(await page.evaluate(state), ['ladder', 'pure', 'phone', 6, 29]);
    // the large row: zeta-1, depth 30, its exact rate (DESIGN.md section 9), and where it sits in its band
    assert.deepEqual(await page.evaluate(`[${text('.f-name')}, ${text('.f-depth')}, ${text('.f-line1')}, ${text('.f-line2')}, ${text('.f-pure')}, ${text('.f-sub')}]`), ['ζ1', '30', 'VISIBLE', '7 IN ε1MADE OF 11 η1', '142 033 641 750 000 pB', 'CYCLES PER BLINK']);
    assert.equal(await page.evaluate(`${flat}(document.querySelector(".rung-focus").getAttribute("aria-label"))`), 'ζ1, Zeta1: depth 30, sub-Blink, visible. 7 in ε1. made of 11 η1. rate 142 033 641 750 000 pB.');
    assert.deepEqual(await page.evaluate(`[document.querySelector('.rung-focus').classList.contains('visible-light'), document.querySelector('.f-rule').hidden, ${text('.f-low')}, ${text('.f-high')}, Math.round(parseFloat(document.querySelector('.f-mark').style.left))]`), [true, false, 'INFRARED', 'ULTRAVIOLET', 20]);
    // five rows each side, on the rim: pitch 92 to the neighbours, 47 beyond, the index at y 451 (DESIGN.md: 452)
    assert.deepEqual(await page.evaluate(texts('.rung:not([hidden]) .r-name')), ['α1', 'β1', 'γ1', 'δ1', 'ε1', 'η1', 'θ1', 'ι1', 'κ1', 'λ1']);
    const [focusY, above, below, far] = await page.evaluate(`[${centreY('.rung-focus')}, ${centreY('#rung-28')}, ${centreY('#rung-30')}, ${centreY('#rung-24')}]`);
    assert.ok(Math.abs(focusY - 451) <= 1.5, `the index at ${focusY}`);
    assert.ok(Math.abs(focusY - above - 92) < 0.5 && Math.abs(below - focusY - 92) < 0.5, 'the neighbours 92 px along the rim');
    assert.ok(Math.abs(focusY - far - 277.2) < 1, `five rows up: 280 px along the rim (${focusY - far} px up)`);
    assert.deepEqual(await page.evaluate(`[${text('#rung-28 .r-facts')}, ${text('#rung-28 .r-pure')}, ${text('#rung-28 .r-made')}, ${text('#rung-30 .r-pure')}]`), ['INFRARED5 IN δ1', '20 290 520 250 000 pB', '7 ζ1', '1.562 × 10¹⁵ pB']);
    // the h-alpha colour is on the canvas (the large seal, the band rail), and lumen is on the spine
    assert.ok((await page.evaluate('(() => { const c = document.querySelector(".ladder-canvas"); const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 200 && d[i + 1] < 120 && d[i + 2] < 110 && d[i + 3] > 200) n++; return n; })()')) > 300, 'the red rung is drawn');
    // the spine is a slider over all 63 rungs
    assert.deepEqual(await page.evaluate('(() => { const s = document.querySelector(".spine"); return [s.getAttribute("role"), s.getAttribute("aria-orientation"), s.getAttribute("aria-valuemax"), s.getAttribute("aria-valuenow"), s.getAttribute("aria-valuetext"), s.tabIndex]; })()'), ['slider', 'vertical', '62', '29', 'ζ1 Zeta1', 0]);
    // zeta-1 is not a rung the instrument can focus: no focus mark
    assert.equal(await page.evaluate('document.querySelector(".ladder-focus").hidden'), true);
    assert.equal(await page.evaluate('document.documentElement.scrollWidth <= innerWidth'), true);
    for (const reachable of await page.evaluate(REACHABLE)) assert.doesNotMatch(reachable, EARTH_TEXT, `"${reachable.slice(0, 200)}"`);
    assert.deepEqual(page.problems(), []);
  } finally {
    await page.close();
  }
});

test('LADDER: turn the wheel (keys, wheel, drag, a row, the spine), open the LENS, focus the instrument', { skip, timeout: 60000 }, async () => {
  const page = await chrome.open(`${server.url}?${VECTOR_A}&mode=pure&screen=ladder&focus=6&level=29`, { ...PHONE, reducedMotion: true });
  const level = async () => (await page.evaluate(state))[4];
  try {
    await page.evaluate('document.querySelector(".ladder-wheel").focus()');
    await page.key('ArrowDown');
    assert.equal(await level(), 30, 'Down: one rung finer');
    assert.equal(await page.evaluate(text('.f-name')), 'η1');
    await page.key('ArrowUp');
    await page.key('ArrowUp');
    assert.equal(await level(), 28);
    await page.key('End');
    assert.equal(await level(), 62);
    assert.deepEqual(await page.evaluate(texts('.rung:not([hidden]) .r-name')), ['κ2', 'λ2', 'μ2', 'ν2', 'ξ2'], 'at the bottom only the rungs above remain');
    await page.key('Home');
    assert.equal(await level(), 0);
    await page.key('PageDown');
    assert.equal(await level(), 5);
    assert.deepEqual(await page.evaluate(state), ['ladder', 'pure', 'phone', 6, 5], 'turning the wheel leaves the instrument alone');
    // the mouse wheel: two rungs' worth of travel
    await page.evaluate('document.querySelector(".ladder").dispatchEvent(new WheelEvent("wheel", { deltaY: 124, bubbles: true, cancelable: true }))');
    await pause(250);
    assert.equal(await level(), 7, 'wheel');
    // drag the wheel up by two rungs' worth
    await page.drag(200, 500, 200, 500 - 124, 8);
    await pause(100);
    assert.equal(await level(), 9, 'drag');
    // click the row under the large one: the wheel turns to it
    await page.click(200, 451 + 92);
    await pause(100);
    assert.equal(await level(), 10, 'a click on a row turns the wheel to it');
    // the spine: press where a rung is
    const spot = await page.evaluate('(() => { const b = document.querySelector(".spine").getBoundingClientRect(); return [b.right - 24, b.top + 6 + (b.height - 12) * 40 / 62]; })()');
    await page.click(...spot);
    assert.equal(await level(), 40, 'the spine');
    // Enter opens the lens on the rung; Escape comes back to the ladder, where it was
    await page.evaluate('document.querySelector(".ladder-wheel").focus()');
    await page.key('Enter');
    await page.settle();
    assert.deepEqual(await page.evaluate(state), ['lens', 'pure', 'phone', 6, 40]);
    await page.key('Escape');
    await page.settle();
    assert.deepEqual(await page.evaluate(state), ['ladder', 'pure', 'phone', 6, 40]);
    assert.equal(await page.evaluate(text('.f-name')), 'ρ1');
    // a click on the large row opens the lens too (at once: this rung cannot take the instrument's focus)
    await page.click(200, 451);
    await page.settle();
    assert.equal((await page.evaluate(state))[0], 'lens');
    await page.key('Escape');
    await page.settle();

    // the instrument's focus: the mark under the large seal, the F key, a double click
    await page.evaluate('document.querySelector(".ladder-wheel").focus()');
    await page.key('Home');
    await page.key('PageDown');
    await page.key('PageDown');
    assert.deepEqual([await level(), await page.evaluate('[document.querySelector(".ladder-focus").hidden, document.querySelector(".ladder-focus").getAttribute("aria-pressed"), document.querySelector(".ladder-focus").textContent]')], [10, [false, 'false', 'SET FOCUS']]);
    await page.evaluate('document.querySelector(".ladder-focus").click()');
    assert.deepEqual(await page.evaluate(state), ['ladder', 'pure', 'phone', 10, 10], 'the mark focuses the instrument on the rung');
    assert.deepEqual(await page.evaluate('[document.querySelector(".ladder-focus").getAttribute("aria-pressed"), document.querySelector(".ladder-focus").textContent, document.querySelector(".ladder-focus").getAttribute("aria-label")]'), ['true', 'FOCUS', 'The instrument is focused on λ Lambda']);
    await page.evaluate('document.querySelector(".ladder-wheel").focus()');
    await page.key('ArrowDown');
    await page.key('f');
    assert.deepEqual(await page.evaluate(state), ['ladder', 'pure', 'phone', 11, 11], 'F');
    // a double click on the row above: the wheel turns to it and the instrument focuses it
    await page.evaluate(press(200, 451 - 92));
    await page.evaluate(press(200, 451 - 92));
    await page.settle();
    assert.deepEqual(await page.evaluate(state), ['ladder', 'pure', 'phone', 10, 10], 'double click');
    // a single click on the large row of a focusable rung opens the lens after the double-click wait
    await page.key('ArrowDown');
    await page.evaluate(press(200, 451));
    assert.equal((await page.evaluate(state))[0], 'ladder', 'not yet: a second click could follow');
    await pause(450);
    assert.deepEqual(await page.evaluate(state), ['lens', 'pure', 'phone', 10, 11]);
    await page.key('Escape');
    await page.settle();
    // a long press focuses the instrument without opening anything
    await page.evaluate(`document.querySelector('.ladder-wheel').dispatchEvent(new PointerEvent('pointerdown', { pointerId: 9, pointerType: 'touch', button: 0, clientX: 200, clientY: 451, bubbles: true, cancelable: true }))`);
    await pause(650);
    await page.evaluate(`document.querySelector('.ladder-wheel').dispatchEvent(new PointerEvent('pointerup', { pointerId: 9, pointerType: 'touch', button: 0, clientX: 200, clientY: 451, bubbles: true, cancelable: true }))`);
    await pause(350);
    assert.deepEqual(await page.evaluate(state), ['ladder', 'pure', 'phone', 11, 11], 'long press');
    // Tab reaches the wheel, the focus mark and the spine
    const reached = new Set();
    for (let i = 0; i < 10; i++) {
      await page.key('Tab');
      reached.add(await page.evaluate('document.activeElement?.className?.split?.(" ").pop() ?? ""'));
    }
    for (const name of ['ladder-wheel', 'ladder-focus', 'spine']) assert.ok(reached.has(name), `Tab reaches .${name} (reached: ${[...reached].join(', ')})`);
    assert.deepEqual(page.problems(), []);
  } finally {
    await page.close();
  }
});

test('LADDER in EARTH mode: Earth replaces pure on a phone, stands beside it on a desktop under one Earth sign', { skip, timeout: 60000 }, async () => {
  const phone = await chrome.open(`${server.url}?${VECTOR_A}&mode=earth&screen=ladder&focus=6&level=29`, PHONE);
  const desktop = await chrome.open(`${server.url}?${VECTOR_A}&mode=earth&screen=ladder&focus=6&level=29`, DESKTOP);
  const shown = (selector) => `[...document.querySelectorAll(${JSON.stringify(selector)})].filter((e) => getComputedStyle(e).display !== 'none' && !e.closest('[hidden]')).map((e) => ${flat}(e.textContent))`;
  try {
    // phone: zeta-1 leads with its wavelength (DESIGN.md section 9), the band edges carry their frequencies
    assert.equal(await phone.evaluate('document.querySelector(".ladder").dataset.columns'), 'stack');
    assert.deepEqual(await phone.evaluate(`[${text('.f-earth .lead')}, ${texts('.f-earth > :not(.lead)')}, ${texts('.f-edge')}]`), ['⊕656.3 nm', ['2.189 fs', '456.8 THz'], ['400 THz', '790 THz']]);
    assert.deepEqual(await phone.evaluate(shown('#rung-28 :is(.r-pure, .r-made, .r-period, .r-freq, .r-length)')), ['15.32 fs', '65.26 THz', '4.594 µm']);
    assert.deepEqual(await phone.evaluate(shown('.ladder-heads > *')), ['⊕PERIOD', 'FREQUENCY', 'LIGHT IN VACUUM']);
    assert.deepEqual(await phone.evaluate(shown('.f-values')), [], 'the pure lead gives way on a phone');
    // desktop: five columns, the pure ones still there
    assert.equal(await desktop.evaluate('document.querySelector(".ladder").dataset.columns'), 'side');
    assert.deepEqual(await desktop.evaluate(shown('#rung-28 :is(.r-pure, .r-made, .r-period, .r-freq, .r-length)')), ['20 290 520 250 000 pB', '7 ζ1', '15.32 fs', '65.26 THz', '4.594 µm']);
    assert.deepEqual(await desktop.evaluate(shown('.ladder-heads > *')), ['LENGTH · RATE', 'MADE OF', '⊕PERIOD', 'FREQUENCY', 'LIGHT IN VACUUM']);
    assert.deepEqual(await desktop.evaluate(shown('.f-values, .f-madeof, .f-earth > *')), ['142 033 641 750 000 pBCYCLES PER BLINK', '11 η1', '2.189 fs', '456.8 THz', '⊕656.3 nm']);
    // the columns do not run into each other: each value ends before the next column's begins
    const edges = await desktop.evaluate('[".r-pure", ".r-made", ".r-period", ".r-freq", ".r-length"].map((s) => { const b = document.querySelector("#rung-28 " + s).getBoundingClientRect(); return [b.left, b.right]; })');
    for (let i = 1; i < edges.length; i++) assert.ok(edges[i - 1][1] < edges[i][0], `column ${i} begins after column ${i - 1} ends (${JSON.stringify(edges)})`);
    assert.equal(await desktop.evaluate('document.documentElement.scrollWidth <= innerWidth'), true);
    // toggling back empties every Earth cell again
    await desktop.evaluate('document.querySelector(".mode-toggle").click()');
    await desktop.settle();
    assert.equal(await desktop.evaluate('[...document.querySelectorAll(".earth")].every((e) => e.hidden && e.textContent === "")'), true);
    for (const reachable of await desktop.evaluate(REACHABLE)) assert.doesNotMatch(reachable, EARTH_TEXT, `"${reachable.slice(0, 200)}"`);
    assert.deepEqual([...phone.problems(), ...desktop.problems()], []);
  } finally {
    await phone.close();
    await desktop.close();
  }
});

test('LENS on a phone reads the Helion at vector A, at the design\'s positions', { skip, timeout: 60000 }, async () => {
  const page = await chrome.open(`${server.url}?${VECTOR_A}&mode=pure&screen=lens&focus=6&level=6`, PHONE);
  try {
    assert.deepEqual(await page.evaluate(`[${text('.lens-head .sub')}, ${text('.lens-letter')}, ${text('.lens-word')}, ${text('.lens-kind')}, ${text('.lens-note')}, ${text('.lens-cycle')}]`), ['RUNG 7 OF 63', 'η', 'HELION', 'DEPTH 7 · LEVEL 6 · UNIT', 'THE UNIT OF THE SOLAR SYNC', 'ε#5 34η']);
    // the four thresholds of the running cycle as signed spans; the next one is marked
    assert.deepEqual(await page.evaluate(`[...document.querySelectorAll('.th')].map((th) => [${flat}(th.querySelector('.th-word').textContent), ${flat}(th.querySelector('.th-span').textContent), th.classList.contains('next')])`), [
      ['PEAK', '−20ι 21λ', false],
      ['NODE', '−11ι 21λ', false],
      ['VALLEY', '−2ι 21λ', false],
      ['END', '+6ι 43λ', true],
    ]);
    assert.deepEqual(await page.evaluate(`[...document.querySelectorAll('.lens-row:not([hidden])')].map((row) => [${flat}(row.querySelector('.label').textContent), ${flat}(row.querySelector('.value').textContent)])`), [
      ['EXACT P(6)', '125 125 = 5 · 13 · 5 · 5 · 7 · 11'],
      ['MADE OF', '36ι · 9 θ × 4 ι'],
      ['SIBLINGS', '11 in ζ'],
      ['PERIOD', '36ι · 2 340λ · 58 500ν'],
      ['RATE', '1 per 58 500 Blinks'],
      ['BAND', 'no band'],
    ]);
    assert.deepEqual(await page.evaluate('[document.querySelectorAll(".lens-siblings .bead").length, document.querySelectorAll(".lens-siblings .bead.lit").length]'), [11, 1], 'the sibling counter: the first of eleven');
    assert.deepEqual(await page.evaluate(`[${text('.m-title')}, ${texts('.m-light')}]`), ['ONE HELION OF TRAVEL', ['1η', '24ι 1λ', '3.5ν', '2.05ξ', '5.15ο', '1.80ο', '6.15χ']]);
    assert.equal(await page.evaluate('document.querySelector(".lens-lineage-canvas").getAttribute("aria-label")'), 'Lineage: α × 5, β × 13, γ × 5, δ × 5, ε × 7, ζ × 11, η');
    assert.equal(await page.evaluate('document.querySelector(".lens-ring-canvas").getAttribute("aria-label")'), 'Ring of Helion: ε#5 34η');
    // the ring is lit, and its centre is where DESIGN.md section 7 puts it: (268, 188)
    assert.ok((await page.evaluate('(() => { const c = document.querySelector(".lens-ring-canvas"); const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; let lit = 0; for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 200 && d[i + 1] > 200 && d[i + 2] > 180 && d[i] < 180) lit++; return lit; })()')) > 1000, 'lumen on the ring');
    const ring = await page.evaluate('(() => { const b = document.querySelector(".lens-ring").getBoundingClientRect(); return [(b.left + b.right) / 2, (b.top + b.bottom) / 2, b.width]; })()');
    assert.deepEqual(ring.map(Math.round), [268, 188, 250]);
    // baselines of the design: rows from y 414 at pitch 25, media from y 573 at pitch 21.5, the limb's box from y 708
    const tops = await page.evaluate('[...document.querySelectorAll(".lens-rows .lens-row:not([hidden])")].map((row) => row.getBoundingClientRect().top)');
    assert.ok(Math.abs(tops[0] - 398) < 2 && tops.every((top, i) => i === 0 || Math.abs(top - tops[i - 1] - 25) < 0.01), JSON.stringify(tops));
    const media = await page.evaluate('[...document.querySelectorAll(".m-row")].map((row) => row.getBoundingClientRect().top)');
    assert.ok(Math.abs(media[0] - 558) < 2.5 && Math.abs(media[6] - media[0] - 6 * 21.5) < 0.01, JSON.stringify(media));
    assert.ok(Math.abs((await page.evaluate('document.querySelector(".lens .limb").getBoundingClientRect().top')) - 708) < 1);
    // everything fits the reference phone: nothing to scroll, nothing sideways
    assert.deepEqual(await page.evaluate('(() => { const b = document.querySelector(".lens-body"); return [b.scrollHeight <= b.clientHeight, b.classList.contains("more-below"), document.documentElement.scrollWidth <= innerWidth]; })()'), [true, false, true]);
    for (const reachable of await page.evaluate(REACHABLE)) assert.doesNotMatch(reachable, EARTH_TEXT, `"${reachable.slice(0, 200)}"`);
    assert.deepEqual(page.problems(), []);
  } finally {
    await page.close();
  }
});

test('LENS: the limb runs over all 63 rungs, the focus follows to level 13, the lineage and a swipe navigate', { skip, timeout: 60000 }, async () => {
  const page = await chrome.open(`${server.url}?${VECTOR_A}&mode=pure&screen=lens&focus=6&level=6`, PHONE);
  try {
    assert.deepEqual(await page.evaluate('(() => { const l = document.querySelector(".lens .limb"); return [l.getAttribute("role"), l.getAttribute("aria-valuemin"), l.getAttribute("aria-valuemax"), l.getAttribute("aria-valuenow"), l.getAttribute("aria-valuetext")]; })()'), ['slider', '0', '62', '6', 'η Eta']);
    await page.key('ArrowRight');
    assert.deepEqual(await page.evaluate(state), ['lens', 'pure', 'phone', 7, 7], 'Right: the next rung, and the instrument follows');
    assert.deepEqual(await page.evaluate(`[${text('.lens-letter')}, ${text('.lens-word')}, ${text('.lens-kind')}, document.querySelector('.lens-note').hidden]`), ['θ', 'THETA', 'DEPTH 8 · LEVEL 7 · BETWEEN', true]);
    assert.equal(await page.evaluate(`${flat}(document.querySelector('.th.next').textContent)`), 'NODE+43λ 21ν', 'theta at A: the node comes next, 43λ 21ν away');
    // a tap on the limb, two letters to the right of the index (pitch 34 px, baseline y 742)
    await pause(300);
    await page.click(196.5 + 68, 742);
    await pause(300);
    assert.deepEqual(await page.evaluate(state), ['lens', 'pure', 'phone', 9, 9], 'tap a letter of the limb');
    // End: the last rung; the instrument's focus stays at the last rung it can show
    await page.evaluate('document.querySelector(".lens .limb").focus()');
    await page.key('End');
    await page.settle();
    assert.deepEqual(await page.evaluate(state), ['lens', 'pure', 'phone', 9, 62]);
    assert.deepEqual(await page.evaluate(`[${text('.lens-letter')}, ${text('.lens-word')}, ${text('.lens-kind')}, ${text('.lens-head .sub')}]`), ['ο2', 'OMICRON2', 'DEPTH 63 · LEVEL 62 · SUB-BLINK', 'RUNG 63 OF 63']);
    // a rung below the instrument's reach: no thresholds, no period in spans, its exact rate in full under the rounded one;
    // the last rung has no rung below it in the ladder, so no "made of" (the core refuses frc_format_level_children(62))
    assert.deepEqual(await page.evaluate('[[...document.querySelectorAll(".th")].every((th) => th.hidden), document.querySelector(".lens-period").hidden, document.querySelector(".lens-prefix").hidden, document.querySelector(".lens-siblings .beads").hasAttribute("hidden")]'), [true, true, true, true]);
    assert.deepEqual(await page.evaluate(`[${text('.lens-rate .value')}, document.querySelector('.lens-rate .extra').textContent.replace(/\\D/g, '').length, ${text('.lens-made .value')}, document.querySelector('.lens-made').hidden]`), ['6.432 × 10⁴¹ pB', 42, '', true]);
    assert.equal(await page.evaluate('document.querySelector(".lens-ring-canvas").getAttribute("aria-label")'), 'Ring of Omicron2');
    for (const reachable of await page.evaluate(REACHABLE)) assert.doesNotMatch(reachable, EARTH_TEXT, `"${reachable.slice(0, 200)}"`);
    // a seal of the lineage inspects that rung (the strip holds the rung and its six nearest ancestors)
    const strip = await page.evaluate('(() => { const b = document.querySelector(".lens-lineage-canvas").getBoundingClientRect(); return [b.left, b.top, b.width]; })()');
    await page.click(strip[0] + 14 + (4 * (strip[2] - 28)) / 6, strip[1] + 22);
    await page.settle();
    assert.equal((await page.evaluate(state))[4], 60, 'the fifth seal of seven: two rungs up');
    // swipe down with a finger: back to where the lens was opened from
    await page.evaluate(`(() => { const el = document.querySelector('.lens-body'); const send = (type, y) => el.dispatchEvent(new PointerEvent(type, { pointerId: 3, pointerType: 'touch', clientX: 120, clientY: y, bubbles: true })); send('pointerdown', 300); send('pointermove', 340); send('pointermove', 420); send('pointerup', 420); })()`);
    await page.settle();
    assert.equal((await page.evaluate(state))[0], 'now', 'swipe down');
    assert.deepEqual(page.problems(), []);
  } finally {
    await page.close();
  }
});

test('PURE mode at every kind of rung, both screens, both layouts: no Earth text, every Earth cell empty', { skip, timeout: 180000 }, async () => {
  for (const viewport of [PHONE, DESKTOP]) {
    for (const [screen, levels] of [['ladder', [0, 13, 62]], ['lens', [0, 12, 13, 30, 62]]]) {
      for (const level of levels) {
        const page = await chrome.open(`${server.url}?${VECTOR_A}&mode=pure&screen=${screen}&focus=6&level=${level}`, viewport);
        try {
          for (const reachable of await page.evaluate(REACHABLE)) assert.doesNotMatch(reachable, EARTH_TEXT, `pure ${screen} level ${level} at ${viewport.width} px: "${reachable.slice(0, 200)}"`);
          assert.equal(await page.evaluate('[...document.querySelectorAll(".earth")].every((e) => e.hidden && e.textContent === "")'), true, `${screen} level ${level}`);
          assert.doesNotMatch((await page.evaluate(REACHABLE)).join('\n'), /%|per ?cent/i);
          assert.equal(await page.evaluate('document.documentElement.scrollWidth <= innerWidth'), true, `${screen} level ${level} at ${viewport.width} px does not scroll sideways`);
          assert.deepEqual(page.problems(), [], `${screen} level ${level}`);
        } finally {
          await page.close();
        }
      }
    }
  }
});

test('LENS in EARTH mode: the translations stand beside the spans, led by the Earth sign', { skip, timeout: 60000 }, async () => {
  const page = await chrome.open(`${server.url}?${VECTOR_A}&mode=earth&screen=lens&focus=6&level=6`, DESKTOP);
  const xi = await chrome.open(`${server.url}?${VECTOR_A}&mode=earth&screen=lens&focus=6&level=13`, PHONE);
  const earthOf = (selector) => `[...document.querySelectorAll(${JSON.stringify(selector)})].filter((e) => !e.hidden).map((e) => ${flat}(e.innerText.replace(/Earth:\\s*/, '')))`;
  try {
    assert.equal(await page.evaluate('document.querySelector(".lens").dataset.arrangement'), 'side');
    assert.deepEqual(await page.evaluate(earthOf('.lens-row .row-earth')), ['⊕ 5.052 h', '⊕ 54.98 µHz']);
    assert.deepEqual(await page.evaluate(earthOf('.th-earth')), ['⊕ 09:08:50', '⊕ 10:24:37', '⊕ 11:40:25', '⊕ 12:56:12']);
    assert.deepEqual(await page.evaluate(`[${earthOf('.m-head-metres')}, ${earthOf('.m-metres')}]`), [['⊕ LENGTH'], ['5.453 Tm', '3.638 Tm', '327.4 Mm', '27.28 Mm', '6.239 Mm', '2.183 Mm', '18.19 m']]);
    // the spans are still there: Earth is an annotation, never a replacement (DESIGN.md principle 5)
    assert.deepEqual(await page.evaluate(`[${text('.lens-period .value')}, ${texts('.m-light')}.length, ${text('.th.next .th-span')}]`), ['36ι · 2 340λ · 58 500ν', 7, '+6ι 43λ']);
    // xi: a rung below the Blink, with the devices of SPEC 16.4; more than a phone holds, so the body says it scrolls
    assert.equal(await xi.evaluate('document.querySelector(".lens").dataset.arrangement'), 'column');
    assert.deepEqual(await xi.evaluate(`[...document.querySelectorAll('.lens-device:not([hidden])')].map((row) => ${flat}(row.innerText.replace(/Earth:\\s*/, '')))`), ['TIMER 1 MHz ⊕ 44 417 ticks', '32 BIT PHASE 48 kHz ⊕ 2 014 490 per sample']);
    assert.deepEqual(await xi.evaluate(earthOf('.lens-period .row-earth, .lens-rate .row-earth')), ['⊕ 44.42 ms', '⊕ 22.51 Hz']);
    assert.equal(await xi.evaluate('document.querySelector(".lens-body").classList.contains("more-below")'), true);
    assert.deepEqual([...page.problems(), ...xi.problems()], []);
  } finally {
    await page.close();
    await xi.close();
  }
});

test('a running clock on the LENS: the ring repaints at a modest rate; an engraved ring and the LADDER not at all', { skip, timeout: 60000 }, async () => {
  const counter = (selector) => `new Promise((done) => { let n = 0; const ctx = document.querySelector('${selector}').getContext('2d'); const clear = ctx.clearRect.bind(ctx); ctx.clearRect = (...a) => { n++; return clear(...a); }; setTimeout(() => done(n), 2000); })`;
  const lens = await chrome.open(`${server.url}?mode=pure&screen=lens&focus=6&level=6`, DESKTOP);
  try {
    const first = await lens.evaluate('document.documentElement.dataset.stamp');
    const paints = await lens.evaluate(counter('.lens-ring-canvas'));
    assert.notEqual(await lens.evaluate('document.documentElement.dataset.stamp'), first, 'time moves');
    assert.ok(paints >= 2 && paints <= 61, `${paints} repaints of the ring in two seconds`);
    assert.deepEqual(lens.problems(), []);
  } finally {
    await lens.close();
  }
  const ladder = await chrome.open(`${server.url}?mode=pure&screen=ladder&focus=6&level=6`, DESKTOP);
  try {
    assert.equal(await ladder.evaluate(counter('.ladder-canvas')), 0, 'nothing on the ladder moves with time');
    assert.deepEqual(ladder.problems(), []);
  } finally {
    await ladder.close();
  }
  // a rung the instrument cannot show has an engraved ring: it is not repainted while time passes
  const deep = await chrome.open(`${server.url}?mode=earth&screen=lens&focus=6&level=40`, DESKTOP);
  try {
    assert.equal(await deep.evaluate(counter('.lens-ring-canvas')), 0, 'an engraved ring stays as it is');
    assert.deepEqual(deep.problems(), []);
  } finally {
    await deep.close();
  }
});
