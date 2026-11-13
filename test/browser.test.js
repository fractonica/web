/**
 * The app in a real browser: headless Chrome loads public/ from
 * tools/serve.mjs and the page is asked what it shows, clicked, dragged and
 * typed at. Readings are checked at SPEC vector A (?t=1791460800).
 *
 * What only a browser can prove: the core loads over HTTP (fetch, streaming
 * compilation, BigInt across the wasm boundary), the two layouts, that PURE
 * mode leaves no Earth text anywhere a user or a screen reader can reach,
 * the input of DESIGN.md section 8, and a clean console.
 *
 * Skipped, with the reason, when no Chrome is installed (set CHROME= to the
 * binary). The page sets `data-ready` on <html> when its first frame is
 * drawn; tools/chrome.mjs waits for it.
 */
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { CHROME, haveChrome, launchChrome } from '../tools/chrome.mjs';
import { startServer } from '../tools/serve.mjs';

const skip = haveChrome() ? false : `no browser at ${CHROME} (set CHROME=)`;
const VECTOR_A = 't=1791460800';
const STAMP_A = 'α#6 β#4 γ#9 δ#3 ε#5 34η 29ι 21λ 3ν';
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

const state = `(() => { const app = document.getElementById('app').dataset; return [app.screen, app.mode, app.layout, Number(app.focus)]; })()`;
/** The instrument's centre and limb radius in viewport px (phone reference: 196.5, 277, 209). */
const LIMB = { cx: 196.5, cy: 277.9, radius: 209.4, step: 8.2 };
const limbPoint = (letters) => {
  const angle = ((90 - letters * LIMB.step) * Math.PI) / 180;
  return [LIMB.cx + LIMB.radius * Math.cos(angle), LIMB.cy + LIMB.radius * Math.sin(angle)];
};
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

test('NOW on a phone reads vector A, in a viewport of exactly the size asked', { skip, timeout: 60000 }, async () => {
  const page = await chrome.open(`${server.url}?${VECTOR_A}&mode=pure&focus=6`, PHONE);
  try {
    assert.equal(page.ready, true, 'the page set data-ready');
    assert.deepEqual(await page.evaluate('[innerWidth, innerHeight, devicePixelRatio]'), [393, 852, 2]);
    assert.deepEqual(await page.evaluate(state), ['now', 'pure', 'phone', 6]);
    assert.equal(await page.evaluate('document.documentElement.dataset.stamp'), STAMP_A);
    // the tab names the app and the moment at the Preon's grain (it changes every eight minutes, not every Blink)
    assert.equal(await page.evaluate('document.title'), 'Fractonica · δ#3 ε#5 34η 29ι', 'pure mode: the name and the short stamp');
    assert.equal(await page.evaluate('document.querySelector(".reading").textContent'), 'ε#534η29ι21λ3ν');
    assert.equal(await page.evaluate('document.querySelector(".reading").getAttribute("aria-label")'), 'ε#5 34η 29ι 21λ 3ν');
    assert.equal(await page.evaluate('document.querySelector(".date-words").textContent'), 'DELTA TRIFRACTON  ·  END');
    assert.deepEqual(await page.evaluate('[...document.querySelectorAll(".countdown")].map((c) => [c.querySelector(".cd-label").textContent, c.querySelector(".cd-span").textContent, c.querySelectorAll(".bead").length, c.querySelectorAll(".bead.lit").length])'), [
      ['η  END  IN', '6ι 43λ', 11, 1],
      ['θ  NODE  IN', '43λ 21ν', 9, 8],
    ]);
    assert.deepEqual(await page.evaluate('[...document.querySelectorAll(".sun .value")].map((v) => v.textContent)'), ['4 820', '−6 235λ', '2η 24ι']);
    // glyphs in the DOM are the core's outlines: the sync odometer [5, 11, 13], ink 0.3 u at 3.7 px per unit
    assert.equal(await page.evaluate('document.querySelector(".sun .glyphs").dataset.digits'), '5 11 13');
    assert.equal(await page.evaluate('document.querySelector(".sun .glyphs path").getAttribute("stroke-width")'), String(0.3 * 3.7));
    assert.equal(await page.evaluate('document.querySelector(".pentad").getAttribute("aria-label")'), 'Pentad II, Helion 2 of 5');
    assert.equal(await page.evaluate('document.querySelectorAll(".pentad-mark .vertex").length + "/" + document.querySelectorAll(".pentad-mark .vertex.lit").length'), '5/2');
    // the instrument: a canvas with something drawn on it, described in words
    assert.match(await page.evaluate('document.querySelector(".instrument-canvas").getAttribute("aria-label")'), /^Instrument, focus Eta: ε#5 34η\. End in 6ι 43λ\. Zeta ring: /);
    assert.ok((await page.evaluate('(() => { const c = document.querySelector(".instrument-canvas"); const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++; return n; })()')) > 20000, 'the instrument canvas has ink');
    // the colour of light is the token, generated into CSS
    assert.equal(await page.evaluate('getComputedStyle(document.documentElement).getPropertyValue("--c-lumen")'), '#8df3e9');
    assert.equal(await page.evaluate('getComputedStyle(document.body).backgroundColor'), 'rgb(4, 5, 6)');
    // nothing fits badly: the page does not scroll sideways, the screen does not scroll at the reference size
    assert.equal(await page.evaluate('document.documentElement.scrollWidth <= innerWidth'), true);
    assert.equal(await page.evaluate('(() => { const s = document.getElementById("screen"); return s.scrollHeight <= s.clientHeight; })()'), true);
    assert.deepEqual(page.problems(), [], 'the console is clean');
  } finally {
    await page.close();
  }
});

test('the binding itself, called in the page: BigInt in, a frozen struct out', { skip, timeout: 60000 }, async () => {
  const page = await chrome.open(`${server.url}?${VECTOR_A}`, PHONE);
  try {
    const reading = await page.evaluate(`import('./lib/fractonica.js').then(async ({ load }) => {
      const frc = await load();
      const helion = frc.saros141.odometerAt(1791460800000000n, 6, 2, 2);
      return { digits: [...helion.digits], next: String(helion.nextChange), frozen: Object.isFrozen(helion), size: frc.memory.buffer.byteLength };
    })`);
    assert.deepEqual(reading, { digits: [13, 0], next: '1791460833051680', frozen: true, size: 196608 });
  } finally {
    await page.close();
  }
});

test('PURE mode leaves no Earth text anywhere a user can reach; EARTH mode adds it, led by the Earth sign', { skip, timeout: 120000 }, async () => {
  for (const viewport of [PHONE, DESKTOP]) {
    for (const screen of ['now', 'ladder', 'lens', 'wave']) {
      for (const focus of screen === 'now' ? [0, 6, 13] : [6]) {
        const page = await chrome.open(`${server.url}?${VECTOR_A}&mode=pure&screen=${screen}&focus=${focus}`, viewport);
        try {
          for (const text of await page.evaluate(REACHABLE)) assert.doesNotMatch(text, EARTH_TEXT, `pure ${screen} at ${viewport.width} px, focus ${focus}: "${text.slice(0, 200)}"`);
          assert.equal(await page.evaluate('[...document.querySelectorAll(".earth")].every((e) => e.hidden && e.textContent === "")'), true);
          assert.deepEqual(page.problems(), []);
        } finally {
          await page.close();
        }
      }
    }
  }
  const page = await chrome.open(`${server.url}?${VECTOR_A}&mode=earth&screen=now&focus=6`, DESKTOP);
  try {
    assert.deepEqual(await page.evaluate(state), ['now', 'earth', 'desktop', 6]);
    // the title's Earth half in the core's forms (frc_format_civil_text DAY_MONTH_YEAR + MINUTE: capitals)
    assert.equal(await page.evaluate('document.title'), 'Fractonica · δ#3 ε#5 34η 29ι · ⊕ 8 OCT 2026 12:00');
    const lines = await page.evaluate('[...document.querySelectorAll(".earth:not([hidden])")].map((e) => e.innerText.replace(/\\s+/g, " ").replace("Earth: ", "").trim())');
    // (each line also carries a visually hidden "Earth: " for screen readers, removed above)
    assert.equal(lines[0], '⊕ THU 8 OCT 2026 · 12:00:00 UTC');
    assert.ok(lines.length >= 11 && lines.every((line) => line.startsWith('⊕')), 'every translation is led by the Earth sign');
    assert.ok(lines.includes('⊕ 12:56:12') && lines.includes('⊕ 7 OCT 01:34') && lines.includes('⊕ −48 469.99 s') /* the narrow space of the grouping was collapsed with the others above */ && lines.includes('⊕ 17 DEC 09:05'), lines.join(' | '));
    // toggling back removes every one of them again
    await page.evaluate('document.querySelector(".mode-toggle").click()');
    await page.settle();
    for (const text of await page.evaluate(REACHABLE)) assert.doesNotMatch(text, EARTH_TEXT, `after toggling back to pure: "${text.slice(0, 200)}"`);
    assert.equal(await page.evaluate('localStorage.getItem("fractonica.mode")'), 'pure', 'the mode is remembered');
    assert.deepEqual(page.problems(), []);
  } finally {
    await page.close();
  }
});

test('no percentage and nothing that blinks, in either mode', { skip, timeout: 60000 }, async () => {
  const page = await chrome.open(`${server.url}?${VECTOR_A}&mode=earth&screen=now&focus=6`, DESKTOP);
  try {
    for (const text of await page.evaluate(REACHABLE)) assert.doesNotMatch(text, /%|per ?cent/i);
    // no animation that repeats: every CSS animation on the page runs once
    assert.deepEqual(await page.evaluate('document.getAnimations().filter((a) => a.effect?.getTiming().iterations !== 1).length'), 0);
  } finally {
    await page.close();
  }
});

test('navigation: keys, the limb, the wheel, the centre, the sigils, Escape', { skip, timeout: 60000 }, async () => {
  const page = await chrome.open(`${server.url}?${VECTOR_A}&mode=pure&screen=now&focus=6`, PHONE);
  const focus = async () => (await page.evaluate(state))[3];
  try {
    await page.key('ArrowRight');
    assert.equal(await focus(), 7, 'Right: one level finer');
    await page.key('ArrowLeft');
    await page.key('ArrowLeft');
    assert.equal(await focus(), 5, 'Left: coarser');
    assert.match(await page.evaluate('location.search'), /focus=5/, 'the URL follows');
    assert.equal(await page.evaluate('localStorage.getItem("fractonica.focus")'), '5', 'the focus is remembered');
    // tap the letter two places to the right of the index: straight there (once the scale has settled)
    await pause(300);
    await page.click(...limbPoint(2));
    await pause(300);
    assert.equal(await focus(), 7, 'tap a letter');
    // drag the letter under the index two places to the right: the scale turns, two levels coarser
    await page.drag(...limbPoint(0), ...limbPoint(2), 10);
    await pause(300);
    assert.equal(await focus(), 5, 'drag the limb');
    // the limb is a slider for assistive technology
    assert.deepEqual(await page.evaluate('(() => { const l = document.querySelector(".limb"); return [l.getAttribute("role"), l.getAttribute("aria-valuenow"), l.getAttribute("aria-valuetext"), l.tabIndex]; })()'), ['slider', '5', 'ζ Zeta', 0]);
    // the wheel on the instrument: rolling away goes in
    await page.evaluate('document.querySelector(".instrument").dispatchEvent(new WheelEvent("wheel", { deltaY: -100, bubbles: true, cancelable: true }))');
    assert.equal(await focus(), 6, 'wheel');
    // pinch: two fingers spreading
    await page.evaluate(`(() => { const el = document.querySelector('.instrument'); const send = (type, id, x) => el.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', clientX: x, clientY: 250, bubbles: true }));
      send('pointerdown', 1, 150); send('pointerdown', 2, 250); send('pointermove', 1, 120); send('pointerup', 1, 120); send('pointerup', 2, 250); })()`);
    assert.equal(await focus(), 7, 'pinch out: finer');
    await page.key('ArrowLeft');
    // click the centre: the lens opens on the focus; Escape goes back
    await page.click(LIMB.cx, LIMB.cy);
    await page.settle();
    assert.deepEqual(await page.evaluate(state), ['lens', 'pure', 'phone', 6]);
    assert.match(await page.evaluate('location.search'), /screen=lens&focus=6&level=6/);
    await page.key('Escape');
    assert.deepEqual(await page.evaluate(state), ['now', 'pure', 'phone', 6]);
    // the four sigils, by their words
    for (const screen of ['ladder', 'lens', 'wave', 'now']) {
      await page.evaluate(`document.querySelector('.sigil-button[data-screen="${screen}"]').click()`);
      await page.settle();
      assert.equal((await page.evaluate(state))[0], screen);
      assert.equal(await page.evaluate('document.querySelector(".sigil-button[aria-current]").textContent'), screen.toUpperCase());
    }
    assert.deepEqual(await page.evaluate('[...document.querySelectorAll(".sigil-button")].map((b) => b.textContent)'), ['NOW', 'LADDER', 'LENS', 'WAVE']);
    // everything interactive can be reached with Tab and shows a focus ring
    const reached = new Set();
    for (let i = 0; i < 12; i++) {
      await page.key('Tab');
      reached.add(await page.evaluate('document.activeElement?.className?.split?.(" ")[0] ?? ""'));
    }
    for (const name of ['mode-toggle', 'sigil-button', 'instrument-centre', 'limb']) assert.ok(reached.has(name), `Tab reaches .${name} (reached: ${[...reached].join(', ')})`);
    await page.evaluate('document.querySelector(".mode-toggle").focus()');
    await page.key('Tab');
    assert.notEqual(await page.evaluate('getComputedStyle(document.activeElement).outlineStyle'), 'none', 'a focus ring is drawn');
    assert.deepEqual(page.problems(), []);
  } finally {
    await page.close();
  }
});

test('a change of focus repaints the instrument, also while time is frozen (the zoom runs to its end)', { skip, timeout: 60000 }, async () => {
  // what the instrument canvas holds, as a digest: the same picture gives the same text
  const picture = `(async () => {
    const data = document.querySelector('.instrument-canvas').toDataURL();
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data));
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  })()`;
  const fresh = await chrome.open(`${server.url}?${VECTOR_A}&mode=pure&screen=now&focus=7`, PHONE);
  const stepped = await chrome.open(`${server.url}?${VECTOR_A}&mode=pure&screen=now&focus=6`, PHONE);
  try {
    const helion = await stepped.evaluate(picture);
    const theta = await fresh.evaluate(picture);
    assert.notEqual(helion, theta);
    await stepped.key('ArrowRight');
    await pause(700); // the zoom takes 320 ms
    assert.equal(await stepped.evaluate(picture), theta, 'after the zoom the canvas is the picture of the new focus');
    await stepped.key('ArrowLeft');
    await pause(700);
    assert.equal(await stepped.evaluate(picture), helion, 'and back');
    assert.deepEqual([...stepped.problems(), ...fresh.problems()], []);
  } finally {
    await stepped.close();
    await fresh.close();
  }
});

test('the cursor: away from the present every screen shows the way back', { skip, timeout: 60000 }, async () => {
  for (const screen of ['now', 'ladder', 'lens', 'wave']) {
    const page = await chrome.open(`${server.url}?${VECTOR_A}&at=1791470000&mode=pure&screen=${screen}&focus=6`, screen === 'now' ? PHONE : DESKTOP);
    try {
      assert.equal(await page.evaluate('document.documentElement.dataset.stamp'), 'α#6 β#4 γ#9 δ#3 ε#5 35η 11ι 34λ 17ν', 'the scrubbed instant is shown');
      assert.deepEqual(await page.evaluate('(() => { const m = document.querySelector(".now-mark"); return [m.hidden, m.innerText.replace(/\\s+/g, " ").trim(), getComputedStyle(m).display !== "none"]; })()'), [false, 'NOW +18ι 13λ', true]);
      await page.evaluate('document.querySelector(".now-mark").click()');
      await page.settle();
      assert.equal(await page.evaluate('document.documentElement.dataset.stamp'), STAMP_A);
      assert.equal(await page.evaluate('document.querySelector(".now-mark").hidden'), true);
      assert.doesNotMatch(await page.evaluate('location.search'), /at=/);
      assert.deepEqual(page.problems(), []);
    } finally {
      await page.close();
    }
  }
});

test('outside the catalogue the page says so, stays engraved and shows no reading', { skip, timeout: 60000 }, async () => {
  // the year 3000: after the last eclipse of Saros 141
  const page = await chrome.open(`${server.url}?t=32503680000&mode=pure&focus=6`, DESKTOP);
  try {
    assert.equal(await page.evaluate('document.querySelector(".reading").textContent'), 'OUT OF CATALOGUE · α#1 – α#18');
    assert.equal(await page.evaluate('document.title'), 'Fractonica · OUT OF CATALOGUE · α#1 – α#18');
    assert.equal(await page.evaluate('document.documentElement.dataset.stamp'), '');
    assert.equal(await page.evaluate('[...document.querySelectorAll(".countdowns, .sun, .pentad, .majors, .upcoming")].every((e) => getComputedStyle(e).visibility === "hidden")'), true);
    assert.equal(await page.evaluate('document.querySelector(".instrument-canvas").getAttribute("aria-label")'), 'Instrument, focus Eta. Nothing lit.');
    // no lumen anywhere on the instrument: nothing is lit
    assert.equal(await page.evaluate('(() => { const c = document.querySelector(".instrument-canvas"); const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; let lit = 0; for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 200 && d[i + 1] > 200 && d[i + 2] > 180 && d[i] < 180) lit++; return lit; })()'), 0);
    for (const text of await page.evaluate(REACHABLE)) assert.doesNotMatch(text, EARTH_TEXT);
    assert.deepEqual(page.problems(), []);
  } finally {
    await page.close();
  }
});

test('a running clock: the stamp moves on by itself, at a modest rate, and reduced motion is honoured', { skip, timeout: 60000 }, async () => {
  const page = await chrome.open(`${server.url}?mode=pure&screen=now&focus=6`, { ...DESKTOP, reducedMotion: true });
  try {
    const first = await page.evaluate('document.documentElement.dataset.stamp');
    // count repaints of the instrument for two seconds: the Helion's arcs move slowly, so a few per second at most
    const paints = await page.evaluate(`new Promise((done) => { let n = 0; const ctx = document.querySelector('.instrument-canvas').getContext('2d'); const clear = ctx.clearRect.bind(ctx); ctx.clearRect = (...a) => { n++; return clear(...a); }; setTimeout(() => done(n), 2000); })`);
    const second = await page.evaluate('document.documentElement.dataset.stamp');
    assert.notEqual(second, first, 'the Blink count moved');
    assert.ok(paints >= 2 && paints <= 30, `${paints} repaints in two seconds: driven by next-change instants, not a busy loop`);
    assert.doesNotMatch(await page.evaluate('location.search'), /[?&]t=/);
    // reduced motion: a change of focus is a cut (no zoom frames pending afterwards)
    await page.key('ArrowRight');
    await page.settle();
    assert.equal(await page.evaluate('matchMedia("(prefers-reduced-motion: reduce)").matches'), true);
    assert.deepEqual(page.problems(), []);
  } finally {
    await page.close();
  }
});

test('the themes: ?theme=basalt changes the tokens and nothing else', { skip, timeout: 60000 }, async () => {
  const page = await chrome.open(`${server.url}?${VECTOR_A}&mode=earth&theme=basalt&focus=6`, PHONE);
  try {
    assert.equal(await page.evaluate('document.documentElement.dataset.theme'), 'basalt');
    assert.equal(await page.evaluate('getComputedStyle(document.body).backgroundColor'), 'rgb(11, 9, 7)');
    assert.equal(await page.evaluate('getComputedStyle(document.querySelector(".earth-line")).color'), 'rgb(108, 188, 170)', 'Earth is verdigris in this theme');
    assert.equal(await page.evaluate('document.querySelector(".reading").getAttribute("aria-label")'), 'ε#5 34η 29ι 21λ 3ν');
    assert.deepEqual(page.problems(), []);
  } finally {
    await page.close();
  }
});
