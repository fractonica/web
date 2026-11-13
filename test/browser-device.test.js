/**
 * The page as a device in a hand, in headless Chrome: what the stage-6 reviews found, held so that it stays
 * found. Touch targets, selection, the browser's Back, links that bring the same moment back, instants no
 * JavaScript Date holds, a wall clock set back, time zones off UTC, the zone named in English under another
 * language, the GO TO messages, the document title, the Content-Security-Policy (any violation is a console
 * error: every page here must have a clean console), nameless Tab stops, the catalogue's closing instant.
 *
 * Skipped, with the reason, when no Chrome is installed (set CHROME=).
 */
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { DateForm, Unit, load } from '../public/lib/fractonica.js';
import { formatSeconds } from '../public/app/model/url.js';
import { CHROME, haveChrome, launchChrome } from '../tools/chrome.mjs';
import { startServer } from '../tools/serve.mjs';

const skip = haveChrome() ? false : `no browser at ${CHROME} (set CHROME=)`;
const PHONE = { width: 393, height: 852, scale: 2, timezone: 'UTC' };
const DESKTOP = { width: 1280, height: 800, scale: 1, timezone: 'UTC' };
/** SPEC vector A. */
const A = 't=1791460800';
const STAMP = 'document.documentElement.dataset.stamp';
const pause = (ms) => new Promise((done) => setTimeout(done, ms));
const flat = (s) => s.replace(/[\s ]+/g, ' ').trim();

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

/** Open a page, run `body`, and require a clean console (a CSP violation is reported there as an error). */
async function withPage(query, viewport, body) {
  const page = await chrome.open(`${server.url}?${query}`, viewport);
  try {
    assert.equal(page.ready, true, `${query}: the page set data-ready`);
    await body(page);
    assert.deepEqual(page.problems(), [], `${query}: the console stayed clean`);
  } finally {
    await page.close();
  }
}

/**
 * The area around a control that a finger lands on: from its box's centre, how far up, down, left and right
 * elementFromPoint still answers the control (or something inside it).
 */
const HIT = (selector, owner = selector) => `(() => {
  const el = document.querySelector(${JSON.stringify(selector)});
  const owner = el.closest(${JSON.stringify(owner)});
  const r = el.getBoundingClientRect();
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  const hits = (x, y) => { const e = document.elementFromPoint(x, y); return !!e && (owner.contains(e) || e === owner); };
  const reach = (dx, dy, max) => { let n = 0; while (n < max && hits(cx + dx * (n + 1), cy + dy * (n + 1))) n++; return n; };
  return { centre: hits(cx, cy), box: [Math.round(r.width), Math.round(r.height)], width: reach(-1, 0, 120) + reach(1, 0, 120) + 1, height: reach(0, -1, 60) + reach(0, 1, 60) + 1 };
})()`;

test('touch targets: every small control answers a finger over 44 px, without taking its neighbour\'s box', { skip, timeout: 90000 }, async () => {
  const away = `${A}&at=1791470000&mode=pure&focus=6`;
  const views = [
    [`${away}&screen=now`, ['.now-mark', '.mode-toggle', '.sigil-button']],
    [`${A}&mode=pure&screen=ladder&level=6&focus=6`, ['.ladder-focus', '.mode-toggle']],
    [`${A}&mode=pure&screen=lens&level=6&focus=6`, ['.mode-toggle']],
  ];
  for (const [query, controls] of views) {
    await withPage(query, PHONE, async (page) => {
      for (const selector of controls) {
        const hit = await page.evaluate(HIT(selector));
        assert.equal(hit.centre, true, `${selector}: its own centre is its own`);
        assert.ok(hit.height >= 44 && hit.width >= 44, `${selector} ${hit.box}: hit area ${hit.width} x ${hit.height}`);
      }
    });
  }
  // the phone's WAVE: the mode, "go to", NOW and the stamp stand within 50 px of height; each keeps its own
  // box, and the areas share the room between them (the way back to the present was an 8 px strip)
  await withPage(`${away}&screen=wave`, PHONE, async (page) => {
    for (const [selector, owner, width, height] of [
      ['.wave-now', '.wave-now', 120, 26],
      ['.mode-toggle', '.mode-toggle', 44, 44],
      ['.goto-input', '.wave-goto', 120, 26],
      ['.tumbler.term', '.tumbler', 36, 44],
    ]) {
      const hit = await page.evaluate(HIT(selector, owner));
      assert.equal(hit.centre, true, `${selector}: its own centre is its own`);
      assert.ok(hit.width >= width && hit.height >= height, `${selector} ${hit.box}: hit area ${hit.width} x ${hit.height}`);
    }
    // a touch in the "go to" area beside the field types into the field
    const box = await page.evaluate('(() => { const r = document.querySelector(".goto-input").getBoundingClientRect(); return [r.left + 20, r.top - 10]; })()');
    await page.click(box[0], box[1]);
    assert.equal(await page.evaluate('document.activeElement === document.querySelector(".goto-input")'), true);
    // and the NOW mark's area brings the present back from 6 px above its box
    const now = await page.evaluate('(() => { const r = document.querySelector(".wave-now").getBoundingClientRect(); return [r.left + r.width / 2, r.top - 5]; })()');
    await page.click(now[0], now[1]);
    await page.settle();
    assert.doesNotMatch(await page.evaluate('location.search'), /at=/);
  });
});

test('an instrument, not a page: nothing is selected by a drag or a double click but the reading', { skip, timeout: 30000 }, async () => {
  await withPage(`${A}&mode=pure&screen=now&focus=6`, PHONE, async (page) => {
    const styles = await page.evaluate('[".date-words", ".cd-label", ".sigil-button .caps", ".reading"].map((s) => { const c = getComputedStyle(document.querySelector(s)); return [c.userSelect, c.cursor]; })');
    assert.deepEqual(styles, [['none', 'default'], ['none', 'default'], ['none', 'pointer'], ['text', 'text']]);
    // a double click on the engraved date selects nothing
    const at = await page.evaluate('(() => { const r = document.querySelector(".date-words").getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()');
    await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: at[0], y: at[1], button: 'left', clickCount: 2 });
    await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: at[0], y: at[1], button: 'left', clickCount: 2 });
    assert.equal(await page.evaluate('String(getSelection())'), '');
    // a selection, where there is one, is in the token colours (lumen-dim behind bone), not the browser's blue
    const selection = await page.evaluate('getComputedStyle(document.querySelector(".reading"), "::selection").backgroundColor');
    assert.equal(selection, 'rgb(36, 90, 87)');
  });
});

test('the browser\'s Back goes back a screen, and Escape on the lens goes back the same way', { skip, timeout: 30000 }, async () => {
  await withPage(`${A}&mode=pure&screen=now&focus=6`, PHONE, async (page) => {
    const screen = 'document.querySelector("#app").dataset.screen';
    const length = await page.evaluate('history.length');
    await page.evaluate('document.querySelector(".sigil-button[data-screen=lens]").click()');
    await page.evaluate('document.querySelector(".sigil-button[data-screen=wave]").click()');
    assert.equal(await page.evaluate('history.length'), length + 2, 'one entry per screen');
    await page.evaluate('history.back()');
    await pause(150);
    assert.equal(await page.evaluate(screen), 'lens');
    await page.key('Escape');
    await pause(150);
    assert.equal(await page.evaluate(screen), 'now');
    assert.equal(await page.evaluate('history.length'), length + 2, 'Escape went back, it did not add an entry');
    await page.evaluate('history.forward()');
    await pause(150);
    assert.equal(await page.evaluate(screen), 'lens');
    assert.match(await page.evaluate('location.href'), new RegExp(`^${server.url}`), 'still in the app');
  });
});

test('a link to a scrubbed moment brings the same moment back, to the Blink', { skip, timeout: 30000 }, async () => {
  let link = '';
  let shown = '';
  await withPage(`${A}&mode=pure&screen=wave&focus=6`, PHONE, async (page) => {
    // the Blink tumbler up once: the stamp moves by one Blink, less than a second
    await page.evaluate('document.querySelectorAll(".tumbler.term")[8].focus()');
    await page.key('ArrowUp');
    await pause(350); // the address bar follows a moving cursor at most four times a second
    shown = await page.evaluate(STAMP);
    assert.match(shown, / 4ν$/);
    link = await page.evaluate('location.search');
    assert.match(link, /[?&]at=1791460800\.\d+&/);
  });
  await withPage(link.slice(1), PHONE, async (page) => {
    assert.equal(await page.evaluate(STAMP), shown, 'the reopened link shows the moment that was shown');
  });
  // and any instant written by the app reads back as itself
  const t = cat.cycleAt(frc.fromUnixSeconds(1791460800n), 12).end + 77n;
  await withPage(`${A}&at=${formatSeconds(t)}&mode=pure&screen=now&focus=6`, PHONE, async (page) => {
    assert.equal(await page.evaluate(STAMP), frc.formatDate(cat.dateAt(t), DateForm.LETTERS, Unit.BLINK));
  });
});

test('an instant no JavaScript Date holds: the clock runs instead (?t=), or the page says OUT OF CATALOGUE', { skip, timeout: 60000 }, async () => {
  for (const query of ['t=9000000000000', 't=-9000000000000', 't=9223372036854&mode=earth', 't=8640000000001&at=9000000000000']) {
    await withPage(`${query}&screen=now&focus=6`, PHONE, async (page) => {
      // the value is dropped like any malformed one: the live clock, inside the catalogue
      assert.notEqual(await page.evaluate(STAMP), '', query);
      assert.doesNotMatch(await page.evaluate('location.search'), /[?&]t=/, query);
    });
  }
  for (const mode of ['pure', 'earth']) {
    await withPage(`t=8640000000000&mode=${mode}&screen=now&focus=6`, PHONE, async (page) => {
      assert.equal(await page.evaluate('document.querySelector(".reading").textContent'), 'OUT OF CATALOGUE · α#1 – α#18');
      assert.match(await page.evaluate('location.search'), /^\?t=8640000000000&/);
    });
  }
});

test('a wall clock set back: the NOW panels and the LENS text follow it at once', { skip, timeout: 60000 }, async () => {
  const stepBack = '(() => { const real = Date.now.bind(Date); Date.now = () => real() - 5000; })()';
  // NOW: the reading under the instrument is the stamp's last five terms, written in the same pass
  await withPage('screen=now&focus=3&mode=pure', PHONE, async (page) => {
    const pair = async () => [(await page.evaluate(STAMP)).split(' ').slice(4).join(' '), await page.evaluate('document.querySelector(".reading").getAttribute("aria-label")')];
    await pause(400);
    const [stamp, reading] = await pair();
    assert.equal(reading, stamp);
    await page.evaluate(stepBack); // an ordinary NTP step
    await pause(1200);
    const [after, shown] = await pair();
    assert.equal(shown, after, 'the panels show the instant the instrument shows, not the later one');
  });
  // LENS on the Preon: its spans to the thresholds count Blinks; they keep counting after the step
  await withPage('screen=lens&level=8&mode=pure', PHONE, async (page) => {
    const text = 'document.querySelector(".lens").innerText';
    await pause(400);
    await page.evaluate(stepBack);
    await pause(300);
    const first = flat(await page.evaluate(text));
    await pause(1500);
    assert.notEqual(flat(await page.evaluate(text)), first, 'the text moves on within five Blinks of the step back');
  });
});

test('EARTH mode off UTC in a browser: the zone\'s own offset, its English name, and the countdown times', { skip, timeout: 60000 }, async () => {
  const cases = [
    ['Asia/Kolkata', 'en-IN', '⊕ THU 8 OCT 2026 · 17:30:00 UTC+5:30', ['⊕ 18:26:12 · 56 min 12 s']],
    ['America/New_York', 'en-US', '⊕ THU 8 OCT 2026 · 08:00:00 EDT', ['⊕ 08:56:12 · 56 min 12 s']],
    ['Europe/Berlin', 'de-DE', '⊕ THU 8 OCT 2026 · 14:00:00 CEST', ['⊕ 14:56:12 · 56 min 12 s']],
  ];
  for (const [timezone, locale, line, countdown] of cases) {
    await withPage(`${A}&mode=earth&screen=now&focus=6`, { ...PHONE, timezone, locale }, async (page) => {
      const lines = await page.evaluate('[...document.querySelectorAll(".earth:not([hidden])")].map((e) => e.innerText.replace(/\\s+/g, " ").replace("Earth: ", "").trim())');
      assert.equal(lines[0], line, `${timezone}, ${locale}`);
      const first = await page.evaluate('document.querySelector(".countdown .earth").innerText.replace(/\\s+/g, " ").replace("Earth: ", "").trim()');
      assert.equal(first, countdown[0], `${timezone}: the Helion's END, 6ι 43λ after vector A, on the zone's clock`);
    });
  }
});

test('GO TO: the messages say what is wrong; the field is 16 px type drawn small, with a caret that does not blink', { skip, timeout: 30000 }, async () => {
  await withPage(`${A}&mode=earth&screen=wave&focus=6`, PHONE, async (page) => {
    const go = async (text) => {
      await page.evaluate(`(() => { const input = document.querySelector('.goto-input'); input.focus(); input.value = ${JSON.stringify(text)}; input.form.requestSubmit(); })()`);
      return page.evaluate('document.querySelector(".goto-note").textContent');
    };
    assert.equal(await go('α#6 β#4 γ#9 δ#3 ε#6'), 'NOT A MOMENT');
    assert.equal(await go('α#0'), 'NOT A MOMENT');
    assert.equal(await go('31 FEB 2026'), 'NOT A MOMENT');
    assert.equal(await go('a#18 b#5'), 'OUT OF CATALOGUE');
    assert.equal(await go('x'.repeat(6000)), 'NOT A MOMENT');
    assert.equal(await page.evaluate('document.querySelector(".goto-input").maxLength'), 200);
    const style = await page.evaluate('(() => { const c = getComputedStyle(document.querySelector(".goto-input")); return [c.fontSize, c.caretAnimation ?? "", parseFloat(getComputedStyle(document.querySelector(".goto-note")).fontSize)]; })()');
    assert.equal(style[0], '16px', 'mobile Safari zooms into a field under 16 px');
    assert.equal(style[1], 'manual', 'a steady caret (design ruling 11: nothing blinks)');
    assert.ok(style[2] >= 7, 'the notes are at least 7 px');
    const drawn = await page.evaluate('document.querySelector(".goto-input").getBoundingClientRect().height');
    assert.ok(Math.abs(drawn - 18) < 0.5, `drawn ${drawn} px tall, as designed`);
  });
});

test('the tab names the app; a Tab stop always has a name; the closing instant has no word without a span', { skip, timeout: 60000 }, async () => {
  await withPage(`${A}&mode=pure&screen=lens&level=6&focus=6`, PHONE, async (page) => {
    assert.equal(await page.evaluate('document.title'), 'Fractonica · δ#3 ε#5 34η 29ι');
    // walk the Tab order: every stop has an accessible name (the scrolling body of the lens is a named region)
    const names = [];
    for (let i = 0; i < 14; i++) {
      await page.key('Tab');
      names.push(await page.evaluate('(() => { const e = document.activeElement; return e === document.body ? "" : e.tagName + ":" + (e.getAttribute("aria-label") || e.innerText.trim() || e.getAttribute("role") || ""); })()'));
    }
    for (const name of names.filter(Boolean)) assert.doesNotMatch(name, /^[A-Z]+:$/, `a nameless Tab stop: ${names.join(' | ')}`);
  });
  const last = formatSeconds(cat.last);
  await withPage(`t=${last}&mode=pure&screen=now&focus=6`, PHONE, async (page) => {
    const labels = await page.evaluate('[...document.querySelectorAll(".countdown")].map((c) => [c.querySelector(".cd-label").textContent, c.querySelector(".cd-span").textContent])');
    assert.deepEqual(labels, [['', ''], ['', '']]);
  });
});
