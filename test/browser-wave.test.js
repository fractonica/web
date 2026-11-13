/**
 * The WAVE (the timeline) in a real browser: headless Chrome loads public/
 * from tools/serve.mjs at SPEC vector A (?t=1791460800) and the page is asked
 * what it shows, dragged, typed at and photographed pixel by pixel.
 *
 * What only a browser can prove here: the positions of DESIGN.md section 7,
 * scrubbing with a pointer (direct, coasting, snapping to a threshold, no
 * coasting under reduced motion), the tumblers as controls (keys, drag,
 * wheel), the "go to" field, that a scrub is global (every screen shows the
 * scrubbed moment), that PURE mode leaves no Earth text at any focus, and
 * that the screen repaints only when something moved.
 *
 * Skipped, with the reason, when no Chrome is installed (set CHROME=).
 */
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { CHROME, haveChrome, launchChrome } from '../tools/chrome.mjs';
import { startServer } from '../tools/serve.mjs';

const skip = haveChrome() ? false : `no browser at ${CHROME} (set CHROME=)`;
const A_SECONDS = 1791460800;
const VECTOR_A = `t=${A_SECONDS}`;
const STAMP_A = 'α#6 β#4 γ#9 δ#3 ε#5 34η 29ι 21λ 3ν';
const PHONE = { width: 393, height: 852, timezone: 'UTC' };
const DESKTOP = { width: 1280, height: 800, timezone: 'UTC' };
/** One Helion at vector A, in seconds (SPEC 12 A: start 08:53:03.485, end 12:56:12.428). */
const HELION_SECONDS = 18188.943;

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

const STAMP = 'document.documentElement.dataset.stamp';
const pause = (ms) => new Promise((done) => setTimeout(done, ms));
/** Where an element is, in viewport px. */
const box = (selector) => `(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; })()`;
/** The baseline of an element's text (a zero-size inline-block probe sits on it). */
const baseline = (selector) => `(() => { const el = document.querySelector(${JSON.stringify(selector)}); const probe = document.createElement('span'); probe.style.cssText = 'display:inline-block;width:0;height:0'; el.append(probe); const y = probe.getBoundingClientRect().bottom; probe.remove(); return Math.round(y * 10) / 10; })()`;
/** The cursor's distance from the frozen present in seconds, from the link (written at most 4 x a second: wait first). */
const awaySeconds = async (page) => {
  await pause(350);
  const at = (await page.evaluate('location.search')).match(/[?&]at=(-?\d+(?:\.\d+)?)/);
  return at ? Number(at[1]) - A_SECONDS : null;
};
/** How many pixels of a canvas carry the cold light (lumen #8df3e9 at near full strength). */
const lumenPixels = (selector) => `(() => { const c = document.querySelector(${JSON.stringify(selector)}); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 200 && d[i + 1] > 200 && d[i + 2] > 180 && d[i] < 190) n++; return n; })()`;

/**
 * How wide one Helion is drawn in a wave field of this height (phone): four half-cycle radii, the radius
 * following the room between the cycle names and the threshold rule (52 px on the design's 210 px field).
 */
const helionWidth = (fieldHeight) => (4 * 52 * ((fieldHeight - 34) / 2 - 4)) / 84;

/** A mouse drag along a horizontal line: `ms` between moves, and a rest before the button goes up. */
async function dragX(page, x0, x1, y, { steps = 12, ms = 12, rest = 160 } = {}) {
  await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x0, y });
  await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: x0, y, button: 'left', clickCount: 1 });
  for (let i = 1; i <= steps; i++) {
    await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x0 + ((x1 - x0) * i) / steps, y, button: 'left', buttons: 1 });
    if (ms) await pause(ms);
  }
  if (rest) await pause(rest);
  await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: x1, y, button: 'left', clickCount: 1 });
  await page.settle();
}

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
const open = (query, viewport = PHONE) => chrome.open(`${server.url}?${query}`, viewport);

test('WAVE on a phone reads vector A at the positions of DESIGN.md section 7', { skip, timeout: 60000 }, async () => {
  const page = await open(`${VECTOR_A}&mode=pure&screen=wave&focus=6`);
  try {
    assert.equal(await page.evaluate(STAMP), STAMP_A);
    // the stamp: nine tumblers, the Preon selected (the first unit finer than the Helion), its neighbours ghosted
    assert.deepEqual(await page.evaluate('[...document.querySelectorAll(".tumbler.term")].map((t) => [t.getAttribute("role"), t.getAttribute("aria-label"), t.getAttribute("aria-valuetext"), t.querySelector(".value").textContent, t.tabIndex])'), [
      ['spinbutton', 'Alpha', 'α#6', 'α#6', 0],
      ['spinbutton', 'Beta', 'β#4', 'β#4', 0],
      ['spinbutton', 'Gamma', 'γ#9', 'γ#9', 0],
      ['spinbutton', 'Delta', 'δ#3', 'δ#3', 0],
      ['spinbutton', 'Nuclide', 'ε#5', 'ε#5', 0],
      ['spinbutton', 'Helion', '34η', '34η', 0],
      ['spinbutton', 'Preon', '29ι', '29ι', 0],
      ['spinbutton', 'Flavon', '21λ', '21λ', 0],
      ['spinbutton', 'Blink', '3ν', '3ν', 0],
    ]);
    assert.deepEqual(await page.evaluate('[...document.querySelectorAll(".tumbler.term.selected")].map((t) => [t.querySelector(".previous").textContent, t.querySelector(".value").textContent, t.querySelector(".next").textContent])'), [['28ι', '29ι', '30ι']]);
    assert.equal(await page.evaluate('[...document.querySelectorAll(".tumbler.term:not(.selected) .ghost")].every((g) => getComputedStyle(g).display === "none")'), true);
    // NOW is lit while the present is shown; the shell's own mark is not shown twice on a phone
    assert.deepEqual(await page.evaluate('(() => { const n = document.querySelector(".wave-now"); return [n.innerText.trim(), n.classList.contains("lit"), n.getAttribute("aria-pressed"), getComputedStyle(n).color]; })()'), ['NOW', true, 'true', 'rgb(141, 243, 233)']);
    assert.equal(await page.evaluate('document.querySelector(".now-mark").hidden'), true);
    // captions and the list (screen5.png; the core floors a span: 43λ 21ν where the brief rounded to 44λ)
    assert.deepEqual(await page.evaluate('[".wave-title", ".sun-caption", ".field-caption"].map((s) => document.querySelector(s).innerText.replace(/\\s+/g, " ").trim())'), ['WAVE', 'SOLAR SYNC 4 820 DRIFT −6 235λ', 'HELION WAVE 9 θ · 36 ι']);
    assert.deepEqual(await page.evaluate('[...document.querySelectorAll(".next-row")].map((r) => r.innerText.replace(/\\s+/g, " ").trim())'), ['ι NODE 11λ 9ν', 'θ NODE 43λ 21ν', 'η END 6ι 43λ', 'ζ PEAK 1η 33ι', 'Solar sync NODE 2η 24ι', 'ε NODE 4η 24ι', 'δ END 43η 6ι', 'γ VALLEY 4ε 23η']);
    assert.equal(await page.evaluate('document.querySelectorAll(".next-row.sun-row .sun-mark").length'), 1);
    // the two canvases are controls with a pure-safe description
    assert.deepEqual(await page.evaluate('(() => { const f = document.querySelector(".wave-field"); return [f.getAttribute("role"), f.getAttribute("aria-valuetext"), f.getAttribute("aria-valuenow"), f.tabIndex]; })()'), ['slider', 'Helion wave: ε#5 34η. End in 6ι 43λ.', '717211', 0]);
    assert.deepEqual(await page.evaluate('(() => { const f = document.querySelector(".sun-lane"); return [f.getAttribute("role"), f.getAttribute("aria-valuetext"), f.getAttribute("aria-valuenow"), f.getAttribute("aria-valuemax")]; })()'), ['slider', 'Solar sync 4\u202f820, Pentad II, 2nd Helion. Node in 2η 24ι.', '7', '19']);
    assert.equal(await page.evaluate('document.querySelector(".wave .limb").getAttribute("aria-valuetext")'), 'η Eta');

    // positions (design: title 85, stamp 136, Sun lane axis 232, wave axis 380, rule 468, limb 522, list from 583 at 22.4)
    const near = (value, wanted, slack, what) => assert.ok(Math.abs(value - wanted) <= slack, `${what}: ${value}, design ${wanted}`);
    near(await page.evaluate(baseline('.wave-title')), 85, 1.5, 'title baseline');
    near(await page.evaluate(baseline('.tumbler.term .value')), 136, 1.5, 'stamp baseline');
    near(await page.evaluate(baseline('.tumbler.term.selected .previous')), 117, 1.5, 'ghost above');
    near(await page.evaluate(baseline('.tumbler.term.selected .next')), 163, 1.5, 'ghost below');
    const lane = await page.evaluate(box('.sun-lane'));
    near(lane.top + 27, 232, 1.5, 'Sun lane axis');
    near(lane.height, 66, 0.5, 'Sun lane height');
    const field = await page.evaluate(box('.wave-field'));
    assert.deepEqual([field.left, field.width], [0, 393], 'the wave runs from edge to edge');
    near(field.top + (field.height - 30 + 4) / 2, 380, 2, 'wave axis');
    near(field.bottom - 30, 468, 2, 'threshold rule');
    near((await page.evaluate(box('.wave .limb'))).top + 34, 522, 2, 'limb letters');
    const rows = await page.evaluate('[...document.querySelectorAll(".next-row")].map((r) => r.getBoundingClientRect().top)');
    near(rows[1] - rows[0], 22.4, 0.05, 'list pitch');
    near(await page.evaluate(baseline('.next-row .span')), 583, 2, 'first row baseline');
    assert.ok((await page.evaluate(box('.next-row:last-child'))).bottom < 760, 'the last row stands above the sigils');
    // light on both canvases, and nothing scrolls
    assert.ok((await page.evaluate(lumenPixels('.wave-field canvas'))) > 800, 'elapsed arcs are lit');
    assert.ok((await page.evaluate('(() => { const c = document.querySelector(".sun-lane canvas"); const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 200 && d[i] > 230 && d[i + 1] > 190 && d[i + 2] < 80) n++; return n; })()')) > 200, 'the Sun lane is lit in the Sun\'s colour');
    assert.equal(await page.evaluate('document.documentElement.scrollWidth <= innerWidth'), true);
    assert.equal(await page.evaluate('(() => { const s = document.querySelector(".wave"); return s.scrollHeight <= s.clientHeight + 1; })()'), true);
    assert.deepEqual(page.problems(), [], 'the console is clean');
  } finally {
    await page.close();
  }
});

test('scrubbing: the wave follows the pointer, snaps to a threshold within 6 px, coasts when thrown', { skip, timeout: 90000 }, async () => {
  const page = await open(`${VECTOR_A}&mode=pure&screen=wave&focus=6`);
  try {
    const field = await page.evaluate(box('.wave-field'));
    const y = field.top + field.height / 2;
    const helionPx = helionWidth(field.height);
    assert.ok(Math.abs(helionPx - 208) < 4, `a Helion is ${helionPx} px wide`);
    const secondsPerPx = HELION_SECONDS / helionPx;

    // dragged 20 px to the left and held: 20 px of time later (a Preon is 5.8 px here), no further
    await dragX(page, 250, 230, y);
    const moved = await awaySeconds(page);
    assert.ok(Math.abs(moved - 20 * secondsPerPx) < 2.5 * secondsPerPx, `20 px is ${20 * secondsPerPx} s, moved ${moved}`);
    assert.deepEqual(await page.evaluate('(() => { const n = document.querySelector(".wave-now"); return [n.classList.contains("lit"), n.getAttribute("aria-pressed"), /^Return to now \\(\\+3ι \\d+λ from it\\)$/.test(n.getAttribute("aria-label")), /^NOW \\+3ι \\d+λ$/.test(n.innerText.replace(/\\s+/g, " ").trim())]; })()'), [false, 'false', true, true]);
    // NOW returns
    await page.evaluate('document.querySelector(".wave-now").click()');
    await page.settle();
    assert.equal(await page.evaluate(STAMP), STAMP_A);
    assert.equal(await awaySeconds(page), null);

    // the Helion's END lies 0.1854 of a cycle to the right of the hairline (38.8 px): released 3 px short of it,
    // the cursor takes the END itself, the core's instant
    const toEnd = (1 - 0.8145891) * helionPx;
    await dragX(page, 250, 250 - (toEnd - 3), y);
    assert.equal(await page.evaluate(STAMP), 'α#6 β#4 γ#9 δ#3 ε#5 35η 0ι 0λ 0ν');
    assert.equal(await page.evaluate('document.querySelector(".wave-now .offset").textContent'), '+6ι 43λ', 'exactly the span SPEC 12 A gives to the END');
    assert.equal(await page.evaluate('document.querySelector(".wave-field").getAttribute("aria-valuetext")'), 'Helion wave: ε#5 35η. Peak in 9ι.');
    // dragged back to the right by a quarter cycle and 12 px: no threshold within 6 px, so it stays where it was put
    await dragX(page, 150, 150 + helionPx / 4 + 12, y);
    assert.doesNotMatch(await page.evaluate(STAMP), /27ι 0λ 0ν$/);
    assert.match(await page.evaluate(STAMP), /34η 2[45]ι/, 'the valley (27ι) less 12 px, about two Preons');
    await page.evaluate('document.querySelector(".wave-now").click()');
    await page.settle();

    // thrown: released while moving, the wave coasts on (0.92 per frame) and comes to rest by itself
    await dragX(page, 300, 240, y, { steps: 4, ms: 8, rest: 0 });
    await pause(1600);
    const thrown = await awaySeconds(page);
    assert.ok(thrown > 60 * secondsPerPx * 1.5, `60 px is ${60 * secondsPerPx} s; it coasted to ${thrown}`);
    await pause(400);
    assert.equal(await awaySeconds(page), thrown, 'and it has come to rest');
    // a press stops nothing it should not: NOW returns although the wave was thrown a moment ago
    await dragX(page, 300, 240, y, { steps: 4, ms: 8, rest: 0 });
    await page.evaluate('document.querySelector(".wave-now").click()');
    await pause(500);
    assert.equal(await page.evaluate(STAMP), STAMP_A, 'the coasting ends when the cursor is taken elsewhere');

    // keys on the wave: thresholds, whole cycles, home
    await page.evaluate('document.querySelector(".wave-field").focus()');
    await page.key('ArrowRight');
    assert.equal(await page.evaluate(STAMP), 'α#6 β#4 γ#9 δ#3 ε#5 35η 0ι 0λ 0ν');
    await page.key('ArrowLeft');
    await page.key('ArrowLeft');
    assert.equal(await page.evaluate(STAMP), 'α#6 β#4 γ#9 δ#3 ε#5 34η 18ι 0λ 0ν', 'two thresholds back: the node');
    await page.key('PageDown');
    assert.equal(await page.evaluate(STAMP), 'α#6 β#4 γ#9 δ#3 ε#5 35η 18ι 0λ 0ν', 'one whole Helion on');
    assert.equal(await page.evaluate('document.getElementById("app").dataset.focus'), '6', 'the arrow keys did not change the scale while the wave had the focus');
    await page.key('Home');
    assert.equal(await page.evaluate(STAMP), STAMP_A);

    // the Sun's lane: a click goes to that place of the sync (three quarters along: its valley)
    const lane = await page.evaluate(box('.sun-lane'));
    await page.click(lane.left + 2 + (lane.width - 4) * 0.75, lane.top + 27);
    await page.settle();
    assert.match(await page.evaluate('document.querySelector(".sun-lane").getAttribute("aria-valuetext")'), /^Solar sync 4\u202f820, Pentad III, 5th Helion\. (End|Valley) in /);
    // dragged a whole lane to the right from there: a whole sync later
    await dragX(page, lane.left + 100, lane.left + 100 + (lane.width - 4), lane.top + 27);
    assert.match(await page.evaluate('document.querySelector(".sun-lane").getAttribute("aria-valuetext")'), /^Solar sync 4\u202f821, Pentad III, 5th Helion\./);
    assert.deepEqual(page.problems(), []);
  } finally {
    await page.close();
  }
});

test('reduced motion: a thrown wave does not coast', { skip, timeout: 60000 }, async () => {
  const page = await open(`${VECTOR_A}&mode=pure&screen=wave&focus=6`, { ...PHONE, reducedMotion: true });
  try {
    const field = await page.evaluate(box('.wave-field'));
    const helionPx = helionWidth(field.height);
    await dragX(page, 300, 240, field.top + field.height / 2, { steps: 4, ms: 8, rest: 0 });
    await pause(800);
    const moved = await awaySeconds(page);
    assert.ok(Math.abs(moved - (60 * HELION_SECONDS) / helionPx) < (6.5 * HELION_SECONDS) / helionPx, `60 px and no more (or the threshold beside it): ${moved} s`);
    assert.deepEqual(page.problems(), []);
  } finally {
    await page.close();
  }
});

test('the tumblers, "go to" and NOW: every way of travelling, and the scrubbed moment on every screen', { skip, timeout: 90000 }, async () => {
  const page = await open(`${VECTOR_A}&mode=pure&screen=wave&focus=6`);
  try {
    const focusTerm = (index) => page.evaluate(`document.querySelectorAll('.tumbler.term')[${index}].focus()`);
    // keys: Up is one unit later, Down one earlier; the focused tumbler becomes the selected one
    await focusTerm(5);
    await page.settle();
    assert.deepEqual(await page.evaluate('[...document.querySelectorAll(".tumbler.term.selected")].map((t) => [t.querySelector(".previous").textContent, t.querySelector(".value").textContent, t.querySelector(".next").textContent])'), [['33η', '34η', '35η']]);
    await page.key('ArrowUp');
    assert.equal(await page.evaluate(STAMP), 'α#6 β#4 γ#9 δ#3 ε#5 35η 29ι 21λ 3ν');
    assert.equal(await page.evaluate('document.querySelector(".wave-now .offset").textContent'), '+35ι 64λ', 'one Helion less the part of a Blink the step drops');
    await page.key('ArrowDown');
    await page.key('ArrowDown');
    assert.equal(await page.evaluate(STAMP), 'α#6 β#4 γ#9 δ#3 ε#5 33η 29ι 21λ 3ν');
    await page.key('PageUp');
    assert.equal(await page.evaluate(STAMP), 'α#6 β#4 γ#9 δ#3 ε#5 38η 29ι 21λ 3ν', 'Page Up: five units');
    assert.equal(await page.evaluate('document.getElementById("app").dataset.focus'), '6');
    // the Blinks carry into the Flavon: the core's carry, not the page's
    await focusTerm(8);
    for (let i = 0; i < 22; i++) await page.key('ArrowUp');
    assert.equal(await page.evaluate(STAMP), 'α#6 β#4 γ#9 δ#3 ε#5 38η 29ι 22λ 0ν');
    // time travel stops at the catalogue's edges
    await focusTerm(0);
    for (let i = 0; i < 14; i++) await page.key('ArrowUp');
    assert.match(await page.evaluate(STAMP), /^α#18 /);
    const last = await page.evaluate(STAMP);
    await page.key('ArrowUp');
    assert.equal(await page.evaluate(STAMP), last);
    for (let i = 0; i < 20; i++) await page.key('ArrowDown');
    assert.equal(await page.evaluate(STAMP), 'α#1 β#1 γ#1 δ#1 ε#1 1η 0ι 0λ 0ν');
    assert.deepEqual(await page.evaluate('[...document.querySelectorAll(".tumbler.term.selected")].map((t) => [t.querySelector(".previous").textContent, t.querySelector(".next").textContent])'), [['', 'α#2']], 'nothing lies before the first Alpha');
    await page.evaluate('document.querySelector(".wave-now").click()');
    await page.settle();
    assert.equal(await page.evaluate(STAMP), STAMP_A);

    // a drag turns the drum: up brings the later value (18 px a unit)
    const preon = await page.evaluate(box('.tumbler.term:nth-child(7)'));
    await page.drag(preon.left + preon.width / 2, preon.top + 10, preon.left + preon.width / 2, preon.top + 10 - 40, 8);
    await page.settle();
    assert.equal(await page.evaluate(STAMP), 'α#6 β#4 γ#9 δ#3 ε#5 34η 31ι 21λ 3ν');
    await page.drag(preon.left + preon.width / 2, preon.top + 10, preon.left + preon.width / 2, preon.top + 10 + 60, 8);
    await page.settle();
    assert.equal(await page.evaluate(STAMP), 'α#6 β#4 γ#9 δ#3 ε#5 34η 28ι 21λ 3ν');
    // the wheel too
    await page.evaluate(`document.querySelectorAll('.tumbler.term')[6].dispatchEvent(new WheelEvent('wheel', { deltaY: 100, bubbles: true, cancelable: true }))`);
    await page.settle();
    assert.equal(await page.evaluate(STAMP), 'α#6 β#4 γ#9 δ#3 ε#5 34η 30ι 21λ 3ν');

    // "go to": everything the core's parser reads; a short form is completed from the moment shown
    const go = async (text) => {
      await page.evaluate(`(() => { const input = document.querySelector('.goto-input'); input.focus(); input.value = ${JSON.stringify(text)}; input.form.requestSubmit(); })()`);
      await page.settle();
      return [await page.evaluate(STAMP), await page.evaluate('document.querySelector(".goto-note").textContent'), await page.evaluate('document.querySelector(".goto-input").value')];
    };
    assert.deepEqual(await go('35η'), ['α#6 β#4 γ#9 δ#3 ε#5 35η 0ι 0λ 0ν', '', '']);
    assert.deepEqual(await go('a#6 b#4 g#9 d#3 e#5 34h 29i 21l 3n'), [STAMP_A, '', '']);
    assert.deepEqual(await go('nonsense'), [STAMP_A, 'NOT A MOMENT', 'nonsense']);
    assert.deepEqual(await go('a#99'), [STAMP_A, 'OUT OF CATALOGUE', 'a#99']);
    assert.deepEqual(await go('2030-01-01'), [STAMP_A, 'NOT A MOMENT', '2030-01-01'], 'PURE mode knows no Earth date');
    assert.deepEqual(await go('Delta Tetrafracton Peak ε#2'), ['α#6 β#4 γ#9 δ#4 ε#2 1η 0ι 0λ 0ν', '', '']);
    // Left / Right in the field are for the text, not for the scale
    await page.evaluate('document.querySelector(".goto-input").focus()');
    await page.key('ArrowRight');
    assert.equal(await page.evaluate('document.getElementById("app").dataset.focus'), '6');

    // scrubbing is global: the instrument, the ladder and the lens show the scrubbed moment, and their way back works
    for (const screen of ['now', 'ladder', 'lens']) {
      await page.evaluate(`document.querySelector('.sigil-button[data-screen="${screen}"]').click()`);
      await page.settle();
      assert.equal(await page.evaluate(STAMP), 'α#6 β#4 γ#9 δ#4 ε#2 1η 0ι 0λ 0ν', screen);
      assert.equal(await page.evaluate('document.querySelector(".now-mark").hidden'), false, `${screen}: the NOW mark shows`);
    }
    assert.equal(await page.evaluate('document.querySelector(".now-mark").innerText.replace(/\\s+/g, " ")'), 'NOW +1ε 43η', 'the same distance on every screen');
    await page.evaluate('document.querySelector(".sigil-button[data-screen=\\"wave\\"]").click()');
    await page.settle();
    assert.equal(await page.evaluate('document.querySelector(".wave-now").classList.contains("lit")'), false);
    await page.key('Escape');
    assert.equal(await page.evaluate(STAMP), STAMP_A, 'Escape returns to the present');
    assert.equal(await page.evaluate('document.querySelector(".wave-now").classList.contains("lit")'), true);
    assert.deepEqual(page.problems(), []);
  } finally {
    await page.close();
  }
});

test('the limb re-scales the wave; the default tumbler follows the scale', { skip, timeout: 60000 }, async () => {
  const page = await open(`${VECTOR_A}&mode=pure&screen=wave&focus=6`);
  try {
    const picture = `(async () => { const data = document.querySelector('.wave-field canvas').toDataURL(); const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data)); return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join(''); })()`;
    const helion = await page.evaluate(picture);
    await page.key('ArrowRight'); // from anywhere: one level finer
    await page.settle();
    assert.equal(await page.evaluate('document.getElementById("app").dataset.focus'), '7');
    assert.equal(await page.evaluate('document.querySelector(".field-caption").innerText.replace(/\\s+/g, " ").trim()'), 'THETA WAVE 4 ι · 20 κ');
    assert.equal(await page.evaluate('document.querySelector(".wave-field").getAttribute("aria-valuetext")'), 'Theta wave: ε#5 34η 28ι. Node in 43λ 21ν.');
    assert.notEqual(await page.evaluate(picture), helion, 'another wave is drawn');
    assert.deepEqual(await page.evaluate('[...document.querySelectorAll(".next-row")].map((r) => r.innerText.replace(/\\s+/g, " ").trim()).slice(0, 3)'), ['κ VALLEY 1λ 15ν', 'ι NODE 11λ 9ν', 'θ NODE 43λ 21ν']);
    // the limb itself: Home goes to the Alpha, whose default tumbler is the Beta
    await page.evaluate('document.querySelector(".wave .limb").focus()');
    await page.key('Home');
    await page.settle();
    assert.equal(await page.evaluate('document.getElementById("app").dataset.focus'), '0');
    assert.equal(await page.evaluate('document.querySelector(".field-caption").innerText.replace(/\\s+/g, " ").trim()'), 'ALPHA WAVE 5 β · 65 γ');
    assert.deepEqual(await page.evaluate('[...document.querySelectorAll(".tumbler.term.selected")].map((t) => t.getAttribute("aria-label"))'), ['Beta']);
    await page.key('End');
    await page.settle();
    assert.equal(await page.evaluate('document.querySelector(".field-caption").innerText.replace(/\\s+/g, " ").trim()'), 'XI WAVE 11 ο · 99 π');
    assert.deepEqual(await page.evaluate('[...document.querySelectorAll(".tumbler.term.selected")].map((t) => t.getAttribute("aria-label"))'), ['Blink']);
    await page.key('ArrowLeft');
    await page.key('ArrowLeft');
    for (let i = 0; i < 5; i++) await page.key('ArrowLeft');
    await pause(400);
    assert.equal(await page.evaluate('document.getElementById("app").dataset.focus'), '6');
    assert.equal(await page.evaluate(picture), helion, 'back at the Helion the same wave is drawn');
    assert.deepEqual(page.problems(), []);
  } finally {
    await page.close();
  }
});

test('PURE mode leaves no Earth text on the WAVE at any scale, at home or away; EARTH mode adds it, led by the Earth sign', { skip, timeout: 120000 }, async () => {
  for (const viewport of [PHONE, DESKTOP]) {
    for (const query of ['focus=0', 'focus=3', 'focus=9', 'focus=13', 'focus=6&at=1791470000', 'focus=6&t=32503680000']) {
      const page = await open(`${query.includes('t=') && !query.includes('at=') ? '' : `${VECTOR_A}&`}mode=pure&screen=wave&${query}`, viewport);
      try {
        for (const text of await page.evaluate(REACHABLE)) assert.doesNotMatch(text, EARTH_TEXT, `pure wave at ${viewport.width} px, ${query}: "${text.slice(0, 200)}"`);
        assert.equal(await page.evaluate('[...document.querySelectorAll(".earth")].every((e) => e.hidden && e.textContent === "")'), true);
        assert.equal(await page.evaluate('document.querySelectorAll(".tumbler.civil").length'), 0);
        assert.deepEqual(page.problems(), []);
      } finally {
        await page.close();
      }
    }
  }

  const page = await open(`${VECTOR_A}&mode=earth&screen=wave&focus=6`);
  try {
    // the Earth date-time line under the stamp; its six fields are tumblers
    assert.equal(await page.evaluate('document.querySelector(".wave-earth").innerText.replace(/\\s+/g, " ").trim()'), '⊕ Earth: THU 8 OCT 2026 · 12:00:00 UTC');
    assert.deepEqual(await page.evaluate('[...document.querySelectorAll(".tumbler.civil")].map((t) => [t.getAttribute("role"), t.getAttribute("aria-label"), t.getAttribute("aria-valuetext")])'), [
      ['spinbutton', 'Day', '8'],
      ['spinbutton', 'Month', 'OCT'],
      ['spinbutton', 'Year', '2026'],
      ['spinbutton', 'Hour', '12'],
      ['spinbutton', 'Minute', '00'],
      ['spinbutton', 'Second', '00'],
    ]);
    // the stamp stands as it was (Earth is an annotation), and the list gains its Earth column
    assert.equal(await page.evaluate(STAMP), STAMP_A);
    assert.deepEqual(await page.evaluate('[...document.querySelectorAll(".next-row .earth")].map((e) => e.innerText.replace(/\\s+/g, " ").trim())'), ['⊕ Earth: 12:01:28', '⊕ Earth: 12:05:40', '⊕ Earth: 12:56:12', '⊕ Earth: 21:46:43', '⊕ Earth: 9 OCT 01:34', '⊕ Earth: 9 OCT 11:40', '⊕ Earth: 17 OCT 14:11', '⊕ Earth: 17 DEC 09:05']);
    assert.match(await page.evaluate('document.querySelector(".wave-field").getAttribute("aria-valuetext")'), /^Helion wave: ε#5 34η\. End in 6ι 43λ\. ⊕ THU 8 OCT 2026 · 12:00:00 UTC\.$/);
    const earthBase = await page.evaluate(baseline('.wave-earth'));
    assert.ok(earthBase > 170 && earthBase < 184, `the Earth line stands under the stamp: ${earthBase}`);
    // an Earth tumbler steps its field; the month's neighbours are ghosted while it is selected
    await page.evaluate('document.querySelectorAll(".tumbler.civil")[1].focus()');
    await page.settle();
    assert.deepEqual(await page.evaluate('[...document.querySelectorAll(".tumbler.selected")].map((t) => [t.getAttribute("aria-label"), t.querySelector(".previous").textContent, t.querySelector(".next").textContent])'), [['Month', 'SEP', 'NOV']]);
    await page.key('ArrowUp');
    assert.equal(await page.evaluate('document.querySelector(".wave-earth").textContent.replace(/SEP|OCT(?=NOV)|DEC/g, "").replace(/\\s+/g, " ").trim()'), '⊕Earth: SUN 8 NOV 2026 · 12:00:00 UTC');
    await page.evaluate('document.querySelectorAll(".tumbler.civil")[3].focus()');
    for (let i = 0; i < 13; i++) await page.key('ArrowDown');
    assert.match(await page.evaluate('document.querySelector(".wave-earth").textContent'), /SAT 7 NOV 2026 · 222300:00:00 UTC$/, '13 hours back: the day before, 23 h (22 and 00 ghosted beside it)');
    // "go to" reads an Earth date in this mode
    await page.evaluate(`(() => { const input = document.querySelector('.goto-input'); input.focus(); input.value = '2026-10-08 12:00'; input.form.requestSubmit(); })()`);
    await page.settle();
    assert.equal(await page.evaluate(STAMP), STAMP_A);
    assert.equal(await page.evaluate('document.querySelector(".goto-note").textContent'), '');
    // back to PURE: every Earth element is hidden and empty again, the selection returns to a term
    await page.evaluate('document.querySelector(".mode-toggle").click()');
    await page.settle();
    assert.equal(await page.evaluate('[...document.querySelectorAll(".earth")].every((e) => e.hidden && e.textContent === "")'), true);
    assert.deepEqual(await page.evaluate('[...document.querySelectorAll(".tumbler.selected")].map((t) => t.getAttribute("aria-label"))'), ['Preon']);
    for (const text of await page.evaluate(REACHABLE)) assert.doesNotMatch(text, EARTH_TEXT, `back in pure: "${text.slice(0, 200)}"`);
    assert.deepEqual(page.problems(), []);
  } finally {
    await page.close();
  }
});

test('WAVE on a desktop: the moment and the Sun side by side, the wave across the screen, the list in two columns', { skip, timeout: 60000 }, async () => {
  const page = await open(`${VECTOR_A}&at=1791470000&mode=earth&screen=wave&focus=6`, DESKTOP);
  try {
    const moment = await page.evaluate(box('.wave-moment'));
    const sun = await page.evaluate(box('.wave-sun'));
    assert.ok(sun.left > moment.right && sun.top < moment.bottom, 'the Sun stands beside the moment');
    const field = await page.evaluate(box('.wave-field'));
    assert.deepEqual([field.left, field.right], [88, 1280], 'the wave runs from the rail to the edge');
    assert.ok(field.height > 250, `the wave takes the height left: ${field.height}`);
    // eight rows in two columns of four, none cut
    const rows = await page.evaluate('[...document.querySelectorAll(".next-row")].map((r) => { const b = r.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.bottom)]; })');
    assert.equal(rows.length, 8);
    assert.equal(new Set(rows.map(([left]) => left)).size, 2);
    assert.ok(rows.every(([, bottom]) => bottom <= 800 - 20));
    // both NOW marks tell the distance: the shell's in the rail, the wave's beside MOMENT
    assert.deepEqual(await page.evaluate('[".now-mark", ".wave-now"].map((s) => { const m = document.querySelector(s); return [getComputedStyle(m).display !== "none" && !m.hidden, m.innerText.replace(/\\s+/g, " ").trim()]; })'), [[true, 'NOW +18ι 13λ'], [true, 'NOW +18ι 13λ']]);
    assert.equal(await page.evaluate(STAMP), 'α#6 β#4 γ#9 δ#3 ε#5 35η 11ι 34λ 17ν');
    assert.equal(await page.evaluate('document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight'), true);
    assert.equal(await page.evaluate('(() => { const s = document.querySelector(".wave"); return s.scrollHeight <= s.clientHeight + 1; })()'), true);
    assert.deepEqual(page.problems(), []);
  } finally {
    await page.close();
  }
});

test('outside the catalogue the WAVE says so and is engraved; while frozen it does not repaint; running, at a modest rate', { skip, timeout: 60000 }, async () => {
  const out = await open('t=32503680000&mode=pure&screen=wave&focus=6');
  try {
    assert.equal(await out.evaluate('document.querySelector(".wave-out").textContent'), 'OUT OF CATALOGUE · α#1 – α#18');
    assert.equal(await out.evaluate('document.querySelector(".wave-stamp").hidden'), true);
    assert.equal(await out.evaluate('document.querySelectorAll(".next-row").length'), 0);
    assert.equal(await out.evaluate(lumenPixels('.wave-field canvas')), 0, 'nothing is lit');
    assert.equal(await out.evaluate('document.querySelector(".wave-field").getAttribute("aria-valuetext")'), 'Helion wave. OUT OF CATALOGUE · α#1 – α#18');
    // "go to" leads back into the catalogue
    await out.evaluate(`(() => { const input = document.querySelector('.goto-input'); input.value = 'a#6 b#4 g#9 d#3 e#5 34h 29i 21l 3n'; input.form.requestSubmit(); })()`);
    await out.settle();
    assert.equal(await out.evaluate(STAMP), STAMP_A);
    assert.deepEqual(out.problems(), []);
  } finally {
    await out.close();
  }

  const count = `new Promise((done) => { let n = 0; const ctx = document.querySelector('.wave-field canvas').getContext('2d'); const clear = ctx.clearRect.bind(ctx); ctx.clearRect = (...a) => { if (a[0] === 0 && a[1] === 0) n++; return clear(...a); }; setTimeout(() => done(n), 2000); })`;
  const frozen = await open(`${VECTOR_A}&mode=earth&screen=wave&focus=6`, DESKTOP);
  try {
    assert.equal(await frozen.evaluate(count), 0, 'a frozen instant is drawn once');
  } finally {
    await frozen.close();
  }
  for (const [focus, most] of [[6, 20], [13, 62]]) {
    const live = await open(`mode=pure&screen=wave&focus=${focus}`, DESKTOP);
    try {
      const first = await live.evaluate(STAMP);
      const paints = await live.evaluate(count);
      assert.notEqual(await live.evaluate(STAMP), first, 'the Blink count moved');
      assert.ok(paints >= 2 && paints <= most, `focus ${focus}: ${paints} repaints in two seconds`);
      assert.deepEqual(live.problems(), []);
    } finally {
      await live.close();
    }
  }
});
