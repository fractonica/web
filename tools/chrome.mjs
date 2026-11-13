/**
 * chrome.mjs - drive a headless Chrome from Node with nothing but Node.
 *
 * WHY NOT `chrome --screenshot`: the new headless mode never makes a window
 * narrower than 500 CSS px, so a "393 x 852" screenshot is a 500 px layout
 * cut off at 393: useless for the phone layout (below 700 px). Here the
 * viewport is set through the DevTools protocol (device-metrics override),
 * which gives exactly the size asked for, and the page can be questioned
 * (`evaluate`) as well as photographed.
 *
 * Chrome is started with a remote-debugging port on a throw-away profile and
 * spoken to over Node's built-in WebSocket (Node >= 22). No dependency.
 *
 *   const chrome = await launchChrome();
 *   const page = await chrome.open('http://127.0.0.1:8141/?t=1791460800', { width: 393, height: 852 });
 *   await page.evaluate('document.documentElement.dataset.stamp');
 *   await page.screenshot('build/shots/now.png');
 *   page.problems();          // console errors, warnings and uncaught exceptions so far
 *   await page.click(196, 277); await page.key('ArrowRight'); await page.drag(x0, y0, x1, y1);
 *   await page.close();
 *   await chrome.close();
 *
 * READINESS CONTRACT with the site: the page sets `data-ready="1"` on <html>
 * once its first frame is drawn. `open` waits for that (and then for two
 * animation frames) before it returns.
 *
 * Environment: CHROME = the browser binary (default: Google Chrome on macOS).
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

/** true when there is a browser to launch (tests skip themselves otherwise). */
export const haveChrome = () => existsSync(CHROME);

/** How long to wait for Chrome to start, a page to load, the site to say it is ready (ms). */
const START_TIMEOUT = 20000;
const LOAD_TIMEOUT = 20000;
const READY_TIMEOUT = 8000;

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

/**
 * Start a headless Chrome.
 * @returns {Promise<{ open: (url: string, viewport?: { width?: number, height?: number, scale?: number, timezone?: string | null, locale?: string | null, reducedMotion?: boolean }) => Promise<Page>, close: () => Promise<void> }>}
 *   `timezone` (an IANA id such as "UTC") overrides the browser's zone, so Earth-mode pictures do not
 *   depend on the machine; `locale` ("de-DE") overrides the browser's language; `reducedMotion` emulates
 *   prefers-reduced-motion.
 * @typedef {{ ready: boolean, evaluate: (expression: string) => Promise<any>, screenshot: (file: string) => Promise<void>,
 *             console: { type: string, text: string }[], problems: () => { type: string, text: string }[],
 *             send: (method: string, params?: object) => Promise<any>, click: (x: number, y: number) => Promise<void>,
 *             drag: (x0: number, y0: number, x1: number, y1: number, steps?: number) => Promise<void>,
 *             key: (key: string) => Promise<void>, settle: () => Promise<any>, close: () => Promise<void> }} Page
 */
export async function launchChrome() {
  if (!haveChrome()) throw new Error(`no browser at ${CHROME} (set CHROME=)`);
  // a profile of its own, so a Chrome the user has open is neither used nor disturbed
  const profile = mkdtempSync(join(tmpdir(), 'fractonica-chrome-'));
  const child = spawn(
    CHROME,
    ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--hide-scrollbars', 'about:blank'],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  );

  // Chrome prints "DevTools listening on ws://127.0.0.1:PORT/devtools/browser/ID" on stderr
  const endpoint = await new Promise((found, fail) => {
    let log = '';
    const timer = setTimeout(() => fail(new Error(`Chrome did not start within ${START_TIMEOUT} ms:\n${log}`)), START_TIMEOUT);
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => {
      log += chunk;
      const match = log.match(/DevTools listening on (ws:\/\/\S+)/);
      if (match) {
        clearTimeout(timer);
        found(match[1]);
      }
    });
    child.once('exit', (code) => {
      clearTimeout(timer);
      fail(new Error(`Chrome exited with ${code}:\n${log}`));
    });
  });

  const socket = new WebSocket(endpoint);
  await new Promise((opened, fail) => {
    socket.addEventListener('open', opened, { once: true });
    socket.addEventListener('error', () => fail(new Error('could not connect to Chrome')), { once: true });
  });

  /** Requests waiting for their answer, and listeners for protocol events, by session. */
  const pending = new Map();
  const listeners = new Set();
  let nextId = 1;
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.id !== undefined) {
      const request = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) request?.fail(new Error(`${request.method}: ${message.error.message}`));
      else request?.done(message.result);
    } else {
      for (const listener of listeners) listener(message);
    }
  });

  /** One protocol command; `sessionId` addresses a page. */
  const send = (method, params = {}, sessionId) =>
    new Promise((done, fail) => {
      const id = nextId++;
      pending.set(id, { done, fail, method });
      socket.send(JSON.stringify({ id, method, params, sessionId }));
    });

  /** Resolve when the session emits `method`. */
  const once = (sessionId, method, timeout) =>
    new Promise((done, fail) => {
      const timer = setTimeout(() => {
        listeners.delete(listener);
        fail(new Error(`no ${method} within ${timeout} ms`));
      }, timeout);
      const listener = (message) => {
        if (message.sessionId === sessionId && message.method === method) {
          clearTimeout(timer);
          listeners.delete(listener);
          done(message.params);
        }
      };
      listeners.add(listener);
    });

  async function open(url, { width = 1280, height = 800, scale = 2, timezone = null, locale = null, reducedMotion = false } = {}) {
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    const call = (method, params) => send(method, params, sessionId);
    const evaluate = async (expression) => {
      const { result, exceptionDetails } = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (exceptionDetails) throw new Error(`evaluate: ${exceptionDetails.exception?.description ?? exceptionDetails.text}`);
      return result.value;
    };

    // everything the page says or throws, and every failed request, for the caller to judge
    const messages = [];
    const describe = (arg) => arg.value !== undefined ? String(arg.value) : (arg.description ?? arg.type);
    const listener = (message) => {
      if (message.sessionId !== sessionId) return;
      if (message.method === 'Runtime.consoleAPICalled') {
        messages.push({ type: message.params.type, text: message.params.args.map(describe).join(' ') });
      } else if (message.method === 'Runtime.exceptionThrown') {
        const details = message.params.exceptionDetails;
        messages.push({ type: 'exception', text: details.exception?.description ?? details.text });
      } else if (message.method === 'Log.entryAdded') {
        const entry = message.params.entry;
        messages.push({ type: entry.level, text: `${entry.text}${entry.url ? ` (${entry.url})` : ''}` });
      }
    };
    listeners.add(listener);

    await call('Page.enable');
    await call('Runtime.enable');
    await call('Log.enable');
    await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: scale, mobile: false });
    if (timezone) await call('Emulation.setTimezoneOverride', { timezoneId: timezone });
    if (locale) await call('Emulation.setLocaleOverride', { locale });
    if (reducedMotion) await call('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    const loaded = once(sessionId, 'Page.loadEventFired', LOAD_TIMEOUT);
    await call('Page.navigate', { url });
    await loaded;

    // the site's readiness contract; a page without it is photographed as it is after the wait
    const deadline = Date.now() + READY_TIMEOUT;
    let ready = false;
    while (!ready && Date.now() < deadline) {
      ready = await evaluate("document.documentElement.dataset.ready === '1'");
      if (!ready) await sleep(50);
    }
    await evaluate('new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => done(true))))');

    return {
      /** false when the page never set data-ready. */
      ready,
      evaluate,
      /** Console calls, uncaught exceptions and browser log entries so far: [{ type, text }]. */
      console: messages,
      /** The entries of `console` that mean something is wrong. */
      problems: () => messages.filter((m) => m.type === 'error' || m.type === 'exception' || m.type === 'assert' || m.type === 'warning'),
      /** Any DevTools protocol command on this page (Input.dispatchMouseEvent, Input.dispatchKeyEvent ...). */
      send: call,
      /** A real mouse click at viewport coordinates. */
      async click(x, y) {
        await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
        await call('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
        await call('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
      },
      /** A mouse drag in `steps` moves. */
      async drag(x0, y0, x1, y1, steps = 8) {
        await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x0, y: y0 });
        await call('Input.dispatchMouseEvent', { type: 'mousePressed', x: x0, y: y0, button: 'left', clickCount: 1 });
        for (let i = 1; i <= steps; i++) {
          await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x0 + ((x1 - x0) * i) / steps, y: y0 + ((y1 - y0) * i) / steps, button: 'left', buttons: 1 });
        }
        await call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: x1, y: y1, button: 'left', clickCount: 1 });
      },
      /** Press and release a key ("ArrowRight", "Escape", "Tab" ...). */
      async key(key) {
        const codes = { ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40, Escape: 27, Tab: 9, Enter: 13, Home: 36, End: 35, PageUp: 33, PageDown: 34 };
        const event = { key, code: key, windowsVirtualKeyCode: codes[key] ?? 0, nativeVirtualKeyCode: codes[key] ?? 0 };
        // Enter types a character: as a bare rawKeyDown Chrome waits for the "char" that would follow and
        // stops producing frames until it comes, so it is sent as a keyDown that carries its text (a button
        // then gets its click, as from a keyboard)
        const down = key === 'Enter' ? { type: 'keyDown', text: '\r', unmodifiedText: '\r' } : { type: 'rawKeyDown' };
        await call('Input.dispatchKeyEvent', { ...down, ...event });
        await call('Input.dispatchKeyEvent', { type: 'keyUp', ...event });
      },
      /** Wait for the page's next two animation frames (after an input that redraws). */
      settle: () => evaluate('new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => done(true))))'),
      async screenshot(file) {
        const { data } = await call('Page.captureScreenshot', { format: 'png' });
        writeFileSync(file, Buffer.from(data, 'base64'));
      },
      close: () => {
        listeners.delete(listener);
        return send('Target.closeTarget', { targetId });
      },
    };
  }

  async function close() {
    const exited = new Promise((done) => child.once('exit', done));
    try {
      await send('Browser.close');
    } catch {
      child.kill();
    }
    await Promise.race([exited, sleep(3000).then(() => child.kill())]);
    socket.close();
    await rm(profile, { recursive: true, force: true, maxRetries: 3 }).catch(() => {});
  }

  return { open, close };
}
