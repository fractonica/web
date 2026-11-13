/**
 * One user's journey through the real app, end to end, in headless Chrome,
 * with every figure on the page held against the core asked directly in Node.
 *
 * The other browser suites prove each screen in isolation with literals typed
 * from SPEC. This one proves that the pieces fit: the same page is turned,
 * toggled, navigated, travelled in time and brought back, and after every
 * step the DOM text is compared with what `public/lib/fractonica.js` answers
 * for that instant in this process (so a figure the app composed or cached
 * wrongly fails here, at A, B and C alike). It also shows that the clock runs
 * when time is not frozen, and that an idle NOW page sleeps between the
 * instants the core names (main-thread time from Chrome's Performance domain).
 *
 * Skipped, with the reason, when no Chrome is installed (set CHROME=).
 */
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { DateForm, Unit, load } from '../public/lib/fractonica.js';
import { CHROME, haveChrome, launchChrome } from '../tools/chrome.mjs';
import { measureIdle } from '../tools/idle.mjs';
import { startServer } from '../tools/serve.mjs';

const skip = haveChrome() ? false : `no browser at ${CHROME} (set CHROME=)`;
const PHONE = { width: 393, height: 852, timezone: 'UTC' };
const DESKTOP = { width: 1280, height: 800, timezone: 'UTC' };
/** SPEC 12 A, B, C in Unix seconds. */
const VECTORS = { A: 1791460800n, B: 946684800n, C: 2886085800n };
const pause = (ms) => new Promise((done) => setTimeout(done, ms));
/** Text as a reader sees it: runs of white space (including U+202F inside numbers) as one space. */
const flat = (s) => s.replace(/[\s ]+/g, ' ').trim();
const STATE = '[document.querySelector("#app").dataset.screen, document.querySelector("#app").dataset.mode, Number(document.querySelector("#app").dataset.focus)]';
const STAMP = 'document.documentElement.dataset.stamp';
const COUNTDOWNS = '[...document.querySelectorAll(".countdown")].map((c) => [c.querySelector(".cd-label").textContent, c.querySelector(".cd-span").textContent])';

let frc;
let cat;
let server;
let chrome;

before(async () => {
  frc = await load();
  cat = frc.saros141;
  if (skip) return;
  server = await startServer({ port: 0, quiet: true });
  chrome = await launchChrome();
});

after(async () => {
  await chrome?.close();
  await server?.close();
});

/** What the core says the NOW screen must show at `seconds` for focus F: stamp and the two countdowns. */
function expectedNow(seconds, focus) {
  const t = frc.fromUnixSeconds(seconds);
  const stamp = frc.formatDate(cat.dateAt(t), DateForm.LETTERS, Unit.BLINK);
  const countdown = (level) => {
    const next = cat.nextThreshold(t, level);
    return [`${frc.formatLevelName(level)} ${frc.formatQuarter(next.name).toUpperCase()} IN`, frc.formatSpan(cat.spanBetween(t, next.time))];
  };
  const sync = cat.syncAt(t);
  const digits = cat.syncOdometer(t, 2, 3).digits.join(' ');
  return {
    stamp,
    countdowns: [countdown(focus), countdown(focus + 1)],
    sun: [frc.formatCount(BigInt(sync.sync)), frc.formatSpanInUnit(cat.spanBetween(sync.nominal, sync.start), Unit.FLAVON), frc.formatSpan(cat.spanBetween(t, sync.next.time))],
    digits,
  };
}

test('NOW at SPEC vectors A, B and C: every figure is the core\'s', { skip, timeout: 60000 }, async () => {
  for (const [name, seconds] of Object.entries(VECTORS)) {
    for (const focus of [6, 7]) {
      const page = await chrome.open(`${server.url}?t=${seconds}&mode=pure&screen=now&focus=${focus}`, PHONE);
      try {
        const want = expectedNow(seconds, focus);
        assert.equal(await page.evaluate(STAMP), want.stamp, `${name} stamp`);
        assert.deepEqual((await page.evaluate(COUNTDOWNS)).map(([label, span]) => [flat(label), flat(span)]), want.countdowns.map(([label, span]) => [flat(label), flat(span)]), `${name} countdowns at focus ${focus}`);
        assert.deepEqual((await page.evaluate('[...document.querySelectorAll(".sun .value")].map((v) => v.textContent)')).map(flat), want.sun.map(flat), `${name} Sun`);
        assert.equal(await page.evaluate('document.querySelector(".sun .glyphs").dataset.digits'), want.digits, `${name} solar odometer`);
        assert.deepEqual(page.problems(), []);
      } finally {
        await page.close();
      }
    }
  }
});

test('a journey: limb, mode, every screen, a tumbler, a scrub, back to NOW, the keyboard', { skip, timeout: 90000 }, async () => {
  const A = VECTORS.A;
  const page = await chrome.open(`${server.url}?t=${A}&mode=pure&screen=now&focus=6`, PHONE);
  try {
    // 1. turn the limb by keyboard (the limb is a slider): one level finer, the countdowns follow the core
    await page.evaluate('document.querySelector(".limb").focus()');
    await page.key('ArrowRight');
    await pause(350);
    assert.deepEqual(await page.evaluate(STATE), ['now', 'pure', 7]);
    assert.deepEqual((await page.evaluate(COUNTDOWNS)).map(([l, s]) => [flat(l), flat(s)]), expectedNow(A, 7).countdowns.map(([l, s]) => [flat(l), flat(s)]));
    // ... and by dragging it back (the letter under the index one place to the right: one level coarser)
    const limb = { cx: 196.5, cy: 277.9, radius: 209.4, step: 8.2 };
    const at = (letters) => {
      const angle = ((90 - letters * limb.step) * Math.PI) / 180;
      return [limb.cx + limb.radius * Math.cos(angle), limb.cy + limb.radius * Math.sin(angle)];
    };
    await page.drag(...at(0), ...at(1), 10);
    await pause(350);
    assert.deepEqual(await page.evaluate(STATE), ['now', 'pure', 6], 'the limb dragged one letter');

    // 2. the mode toggle: EARTH adds lines led by the Earth sign, the Fractonica text stays
    await page.evaluate('document.querySelector(".mode-toggle").click()');
    await page.settle();
    assert.deepEqual(await page.evaluate(STATE), ['now', 'earth', 6]);
    const earth = await page.evaluate('[...document.querySelectorAll(".earth:not([hidden])")].map((e) => e.innerText.replace(/\\s+/g, " ").trim())');
    assert.ok(earth.length >= 5 && earth.every((line) => line.startsWith('⊕') || line.startsWith('Earth')), `Earth lines: ${earth.join(' | ')}`);
    assert.ok(earth.some((line) => line.includes('THU 8 OCT 2026 · 12:00:00 UTC')), 'the civil date of A in zone UTC');
    assert.equal(await page.evaluate(STAMP), expectedNow(A, 6).stamp, 'the reading is not replaced');
    await page.evaluate('document.querySelector(".mode-toggle").click()');
    await page.settle();
    assert.equal(await page.evaluate('[...document.querySelectorAll(".earth")].every((e) => e.hidden && e.textContent === "")'), true, 'PURE again: every Earth element empty');

    // 3. every screen by its sigil
    for (const screen of ['ladder', 'lens', 'wave']) {
      await page.evaluate(`document.querySelector('.sigil-button[data-screen="${screen}"]').click()`);
      await page.settle();
      assert.equal((await page.evaluate(STATE))[0], screen);
    }
    // the LADDER and the LENS opened on the Helion say the core's words for it
    await page.evaluate('document.querySelector(\'.sigil-button[data-screen="lens"]\').click()');
    await page.settle();
    const lensText = flat(await page.evaluate('document.querySelector(".lens").innerText'));
    for (const want of [frc.formatLevelRate(6), frc.formatLevelInUnit(6, Unit.BLINK), frc.formatLevelInUnit(6, Unit.PREON)]) assert.ok(lensText.includes(flat(want)), `lens shows ${want}`);
    await page.evaluate('document.querySelector(\'.sigil-button[data-screen="wave"]\').click()');
    await page.settle();

    // 4. a tumbler: the Helion term one up, the stamp is the core's date one Helion on
    await page.evaluate('document.querySelectorAll(".tumbler.term")[5].focus()');
    await page.key('ArrowUp');
    await page.settle();
    const date = cat.dateAt(frc.fromUnixSeconds(A));
    const stepped = await page.evaluate(STAMP);
    assert.match(stepped, /^α#6 β#4 γ#9 δ#3 ε#5 35η 29ι 21λ /, `stepped stamp ${stepped}`);
    assert.equal(date.eta, 34, 'the core\'s Helion at A');
    const away = flat(await page.evaluate('document.querySelector(".wave-now").innerText'));
    assert.match(away, /^NOW \+\d+ι \d+λ$/, `the NOW mark shows the offset: ${away}`);

    // 5. a scrub: drag the wave left by a third of its width, the moment moves on
    const field = await page.evaluate('(() => { const r = document.querySelector(".wave-field").getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width }; })()');
    const before = await page.evaluate(STAMP);
    await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: field.x, y: field.y });
    await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: field.x, y: field.y, button: 'left', clickCount: 1 });
    for (let i = 1; i <= 10; i++) {
      await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: field.x - (field.w / 3) * (i / 10), y: field.y, button: 'left', buttons: 1 });
      await pause(12);
    }
    await pause(160);
    await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: field.x - field.w / 3, y: field.y, button: 'left', clickCount: 1 });
    await page.settle();
    const scrubbed = await page.evaluate(STAMP);
    assert.notEqual(scrubbed, before, 'the scrub moved the moment');
    // the scrubbed moment is global: NOW shows it too, with the return mark
    await page.evaluate('document.querySelector(\'.sigil-button[data-screen="now"]\').click()');
    await page.settle();
    assert.equal(await page.evaluate(STAMP), scrubbed);
    assert.equal(await page.evaluate('document.querySelector(".now-mark").hidden'), false, 'the NOW return mark is shown while away');

    // 6. back to NOW: the mark returns the cursor to the present
    await page.evaluate('document.querySelector(".now-mark").click()');
    await page.settle();
    assert.equal(await page.evaluate(STAMP), expectedNow(A, 6).stamp);
    assert.equal(await page.evaluate('document.querySelector(".now-mark").hidden'), true);

    // 7. the keyboard alone: Tab reaches the controls, Enter on a sigil opens its screen, Escape comes back
    await page.evaluate('document.activeElement?.blur()');
    const reached = [];
    for (let i = 0; i < 12; i++) {
      await page.key('Tab');
      reached.push(await page.evaluate('document.activeElement.className || document.activeElement.tagName'));
    }
    assert.ok(reached.some((c) => /limb/.test(c)) && reached.some((c) => /sigil-button/.test(c)) && reached.some((c) => /mode-toggle/.test(c)), `Tab order: ${reached.join(', ')}`);
    await page.evaluate('document.querySelector(\'.sigil-button[data-screen="ladder"]\').focus()');
    await page.key('Enter');
    await page.settle();
    assert.equal((await page.evaluate(STATE))[0], 'ladder', 'Enter on a sigil');
    // the wheel has the keyboard: Down turns it one rung, Enter opens the LENS on that rung, Escape leaves it
    // (only keys the app handles are pressed: headless Chrome stops producing frames after a key nobody takes)
    await page.evaluate('document.querySelector(".ladder-wheel").focus()');
    await page.key('ArrowDown');
    await pause(300);
    await page.key('Enter');
    await page.settle();
    assert.deepEqual(await page.evaluate('[document.querySelector("#app").dataset.screen, new URLSearchParams(location.search).get("level")]'), ['lens', '7']);
    assert.ok(flat(await page.evaluate('document.querySelector(".lens").innerText')).includes(frc.formatLevelWord(7).toUpperCase()), 'the lens names the rung the wheel was turned to');
    await page.key('Escape');
    await page.settle();
    assert.notEqual((await page.evaluate(STATE))[0], 'lens', 'Escape leaves the lens');
    assert.deepEqual(page.problems(), [], 'a clean console through the whole journey');
  } finally {
    await page.close();
  }
});

test('the clock runs when time is not frozen, on NOW and on the desktop WAVE', { skip, timeout: 60000 }, async () => {
  for (const [query, size] of [['screen=now&focus=6&mode=pure', PHONE], ['screen=wave&focus=6&mode=earth', DESKTOP]]) {
    const page = await chrome.open(`${server.url}?${query}`, size);
    try {
      const first = await page.evaluate(STAMP);
      const t0 = frc.now();
      await pause(3000);
      const second = await page.evaluate(STAMP);
      assert.notEqual(second, first, `${query}: the stamp moved in 3 s (${first} -> ${second})`);
      // and it is the core's stamp of a moment in those three seconds
      const window = [t0 - 2000000n, frc.now() + 1000000n];
      const candidates = [];
      for (let t = window[0]; t <= window[1]; t += 100000n) candidates.push(frc.formatDate(cat.dateAt(t), DateForm.LETTERS, Unit.BLINK));
      assert.ok(candidates.includes(second), `${second} is the core's stamp of the present`);
      assert.deepEqual(page.problems(), []);
    } finally {
      await page.close();
    }
  }
});

test('an idle NOW page at the Helion sleeps: little main-thread time over ten seconds', { skip, timeout: 60000 }, async () => {
  const page = await chrome.open(`${server.url}?screen=now&focus=6&mode=pure`, PHONE);
  try {
    const m = await measureIdle(page, 10);
    console.log(`# idle NOW, focus 6, 393x852: ${(m.task * 1000).toFixed(0)} ms of main-thread tasks in ${m.wall.toFixed(2)} s (${(m.share * 100).toFixed(2)} %), script ${(m.script * 1000).toFixed(0)} ms, ${m.repaints} canvas clears`);
    assert.ok(m.share < 0.1, `the main thread worked ${(m.share * 100).toFixed(1)} % of the time`);
    // DESIGN.md section 10: at the Helion the finest glyph changes about three times a second; not 60
    assert.ok(m.repaints < 10 * 12, `${m.repaints} clears in 10 s`);
  } finally {
    await page.close();
  }
});

test('the busiest view, the finest focus on a desktop, stays at 30 passes a second and within its budget', { skip, timeout: 60000 }, async () => {
  // DESIGN.md section 10: at most 30 fps while the focus is finer than iota. The budget is tools/idle.mjs's for
  // these views (35 %): Chrome runs here without a GPU, so every pass is rasterised in software
  const page = await chrome.open(`${server.url}?screen=now&focus=13&mode=pure`, { ...DESKTOP, scale: 2 });
  try {
    const m = await measureIdle(page, 5);
    console.log(`# idle NOW, focus 13, 1280x800: ${(m.task * 1000).toFixed(0)} ms of main-thread tasks in ${m.wall.toFixed(2)} s (${(m.share * 100).toFixed(2)} %), ${m.repaints} canvas clears`);
    assert.ok(m.share < 0.35, `the main thread worked ${(m.share * 100).toFixed(1)} % of the time`);
    // the instrument's canvas and its bitmap of settled arcs: two clears a pass at most, 30 passes a second
    assert.ok(m.repaints <= 5 * 31 * 2, `${m.repaints} clears in 5 s`);
  } finally {
    await page.close();
  }
});
