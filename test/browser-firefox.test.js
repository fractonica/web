/**
 * The second engine: the same site in headless Firefox (Gecko), driven over
 * WebDriver BiDi by tools/firefox.mjs.
 *
 * The Chrome suites hold the details; this one proves that nothing in the
 * site is Chrome-only: the core loads (BigInt across the wasm boundary, bulk
 * memory, private class fields), all four screens draw in both layouts and
 * both modes without a console error and without text cut by the window's
 * edge, the stamp is SPEC vector A's, and the keyboard and the mode toggle
 * work. Firefox's time zone cannot be set from here, so Earth mode is read in
 * the machine's own zone and only its shape is checked.
 *
 * Skipped, with the reason, when Firefox is not installed (set FIREFOX=).
 * Safari has no headless mode and is not tested.
 */
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { AUDIT } from '../tools/audit.mjs';
import { FIREFOX, haveFirefox, launchFirefox } from '../tools/firefox.mjs';
import { startServer } from '../tools/serve.mjs';

const skip = haveFirefox() ? false : `no Firefox at ${FIREFOX} (set FIREFOX=)`;
const STAMP_A = 'α#6 β#4 γ#9 δ#3 ε#5 34η 29ι 21λ 3ν';
const STATE = '[document.querySelector("#app").dataset.screen, document.querySelector("#app").dataset.mode, Number(document.querySelector("#app").dataset.focus)]';

let server;
let firefox;

before(async () => {
  if (skip) return;
  server = await startServer({ port: 0, quiet: true });
  firefox = await launchFirefox();
});

after(async () => {
  await firefox?.close();
  await server?.close();
});

test('every screen, layout and mode draws in Firefox: ready, vector A, a clean console, nothing cut', { skip, timeout: 120000 }, async () => {
  for (const [layout, width, height] of [['phone', 393, 852], ['desktop', 1280, 800]]) {
    for (const screen of ['now', 'ladder', 'lens', 'wave']) {
      for (const mode of ['pure', 'earth']) {
        const view = `${screen} ${layout} ${mode}`;
        const page = await firefox.open(`${server.url}?t=1791460800&mode=${mode}&screen=${screen}&focus=6&level=6`, { width, height });
        try {
          assert.equal(page.ready, true, `${view}: data-ready`);
          assert.deepEqual(await page.evaluate(STATE), [screen, mode, 6], view);
          assert.equal(await page.evaluate('document.documentElement.dataset.stamp'), STAMP_A, view);
          assert.deepEqual(await page.evaluate(AUDIT), [], view);
          assert.deepEqual(page.problems(), [], `${view}: console`);
          if (mode === 'earth' && screen === 'now') assert.match(await page.evaluate('document.querySelector(".earth-line").textContent'), /^⊕\s*(Earth: )?THU 8 OCT 2026 · \d\d:\d\d:\d\d \S+$/, 'the Earth line, in the machine\'s zone');
        } finally {
          await page.close();
        }
      }
    }
  }
});

test('Firefox: the keyboard turns the focus, the toggle changes the mode, a sigil changes the screen', { skip, timeout: 60000 }, async () => {
  const page = await firefox.open(`${server.url}?t=1791460800&mode=pure&screen=now&focus=6`, { width: 393, height: 852 });
  try {
    await page.key('ArrowRight');
    assert.deepEqual(await page.evaluate(STATE), ['now', 'pure', 7]);
    await page.evaluate('document.querySelector(".mode-toggle").click()');
    assert.deepEqual(await page.evaluate(STATE), ['now', 'earth', 7]);
    await page.evaluate('document.querySelector(\'.sigil-button[data-screen="wave"]\').click()');
    assert.deepEqual(await page.evaluate(STATE), ['wave', 'earth', 7]);
    assert.equal(await page.evaluate('document.querySelectorAll(".tumbler.term").length'), 9);
    assert.deepEqual(page.problems(), []);
  } finally {
    await page.close();
  }
});
