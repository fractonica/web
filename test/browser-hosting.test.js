/**
 * The site as a static host serves it: under a sub-path, and on after the
 * network has gone.
 *
 * public/ must run from any directory of any static host (GitHub Pages under
 * /<repository>/, a folder of a company site ...): every URL it asks for is
 * relative. Here tools/serve.mjs is put behind a prefix (/a/deep/sub/path/),
 * the page is loaded through it, and every request Chrome made is listed:
 * all must be under the prefix and none may fail.
 *
 * Once loaded the app needs nothing more from the network (no lazy module, no
 * font, no second fetch of the core): the network is then switched off with
 * the DevTools protocol, and every screen and both modes are opened. Not one request may be made, and
 * the clock keeps reading. Then the page is loaded again, still offline: the
 * service worker (public/sw.js) answers from what it kept, and the clock opens.
 *
 * Skipped, with the reason, when no Chrome is installed (set CHROME=).
 */
import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { after, before, test } from 'node:test';

import { CHROME, haveChrome, launchChrome } from '../tools/chrome.mjs';
import { startServer } from '../tools/serve.mjs';

const skip = haveChrome() ? false : `no browser at ${CHROME} (set CHROME=)`;
const PREFIX = '/a/deep/sub/path/';
const STAMP_A = 'α#6 β#4 γ#9 δ#3 ε#5 34η 29ι 21λ 3ν';

let inner;
let outer;
let base;
let chrome;

before(async () => {
  if (skip) return;
  inner = await startServer({ port: 0, quiet: true });
  // the host: only PREFIX exists; it is the site's root
  outer = createServer((req, res) => {
    if (!req.url.startsWith(PREFIX)) {
      res.writeHead(404).end('not under the prefix');
      return;
    }
    const target = new URL(req.url.slice(PREFIX.length - 1), inner.url);
    const forward = request(target, { method: req.method, headers: req.headers }, (answer) => {
      res.writeHead(answer.statusCode, answer.headers);
      answer.pipe(res);
    });
    req.pipe(forward);
  });
  await new Promise((done) => outer.listen(0, '127.0.0.1', done));
  base = `http://127.0.0.1:${outer.address().port}${PREFIX}`;
  chrome = await launchChrome();
});

after(async () => {
  await chrome?.close();
  await inner?.close();
  await new Promise((done) => (outer ? outer.close(done) : done()));
});

test('under a sub-path every request is relative and answered; offline, every screen still works', { skip, timeout: 60000 }, async () => {
  const page = await chrome.open('about:blank', { width: 393, height: 852, timezone: 'UTC' });
  const requests = [];
  const failed = [];
  try {
    await page.send('Network.enable');
    // what was asked for is read back from the page's own resource timing
    await page.send('Page.navigate', { url: `${base}?t=1791460800&mode=pure&screen=now&focus=6` });
    for (let i = 0; i < 100 && (await page.evaluate("document.documentElement.dataset.ready === '1'")) !== true; i++) await new Promise((done) => setTimeout(done, 50));
    assert.equal(await page.evaluate('document.documentElement.dataset.stamp'), STAMP_A, 'the clock runs under the prefix');
    for (const entry of await page.evaluate('performance.getEntriesByType("resource").map((e) => [e.name, e.responseStatus ?? 0])')) requests.push(entry);
    requests.push([await page.evaluate('location.href'), 200]);
    assert.ok(requests.length >= 10, `the page loaded its modules, styles, core and icons (${requests.length} requests)`);
    for (const [url, status] of requests) {
      assert.ok(url.startsWith(base) || url.startsWith('data:'), `${url} is under ${PREFIX}`);
      if (status && status >= 400) failed.push(`${status} ${url}`);
    }
    assert.ok(requests.some(([url]) => url.endsWith('fractonica.wasm')), 'the core came from the prefix');
    assert.deepEqual(failed, []);

    // once ready, the page hands the service worker (public/sw.js) the list of what it loaded, to keep
    const kept = await page.evaluate(`(async () => {
      for (let i = 0; i < 100; i++) {
        const keys = await (await caches.open('fractonica')).keys();
        if (keys.some((r) => r.url.endsWith('fractonica.wasm')) && keys.some((r) => r.url.endsWith('app/main.js'))) return keys.length;
        await new Promise((done) => setTimeout(done, 50));
      }
      return 0;
    })()`);
    assert.ok(kept >= 10, `the service worker kept the site (${kept} files)`);
    // the network goes away
    await page.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    const before = await page.evaluate('performance.getEntriesByType("resource").length');
    for (const screen of ['ladder', 'lens', 'wave', 'now']) {
      await page.evaluate(`document.querySelector('.sigil-button[data-screen="${screen}"]').click()`);
      await page.settle();
      assert.equal(await page.evaluate('document.querySelector("#app").dataset.screen'), screen);
    }
    await page.evaluate('document.querySelector(".mode-toggle").click()');
    await page.settle();
    assert.ok((await page.evaluate('document.querySelector(".earth-line").textContent')).includes('THU 8 OCT 2026'), 'EARTH mode offline');
    assert.deepEqual(await page.evaluate(`performance.getEntriesByType("resource").slice(${before}).map((e) => e.name)`), [], 'not one request after the load');
    assert.equal(await page.evaluate('document.documentElement.dataset.stamp'), STAMP_A);
    // and a new visit without a network: the service worker gives what it kept
    await page.send('Page.reload', { ignoreCache: false });
    let ready = false;
    for (let i = 0; i < 100 && !ready; i++) {
      await new Promise((done) => setTimeout(done, 50));
      ready = await page.evaluate("document.documentElement.dataset.ready === '1'").catch(() => false);
    }
    assert.equal(ready, true, 'the page opened again offline');
    assert.equal(await page.evaluate('navigator.serviceWorker.controller !== null'), true, 'answered by the service worker');
    assert.equal(await page.evaluate('document.documentElement.dataset.stamp'), STAMP_A, 'and the clock reads');
    assert.deepEqual(page.problems().filter((p) => !/favicon/.test(p.text)), []);
  } finally {
    await page.close();
  }
});
