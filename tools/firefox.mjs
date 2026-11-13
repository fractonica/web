/**
 * firefox.mjs - drive a headless Firefox from Node with nothing but Node.
 *
 * The second engine: tools/chrome.mjs speaks Chrome's DevTools protocol, this
 * file speaks WebDriver BiDi (Firefox's `--remote-debugging-port`) over
 * Node's built-in WebSocket. It gives the same kind of page for the things a
 * cross-browser check needs: an exact viewport, `evaluate`, a screenshot, the
 * console, keys and clicks. It does NOT emulate a time zone, a pixel ratio or
 * reduced motion (BiDi has no command for them here): readings are compared
 * in PURE mode or in the machine's own zone.
 *
 *   const firefox = await launchFirefox();
 *   const page = await firefox.open('http://127.0.0.1:8141/?t=1791460800', { width: 393, height: 852 });
 *   await page.evaluate('document.documentElement.dataset.stamp');
 *   await page.screenshot('build/shots-firefox/now.png');
 *   await page.key('ArrowRight'); await page.click(196, 277);
 *   page.problems();
 *   await page.close();
 *   await firefox.close();
 *
 * The readiness contract is the site's (`data-ready="1"` on <html>), as in
 * chrome.mjs. Environment: FIREFOX = the browser binary (default: Firefox on
 * macOS). Used by test/browser-firefox.test.js, which skips itself, saying
 * why, where there is no Firefox.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const FIREFOX = process.env.FIREFOX ?? '/Applications/Firefox.app/Contents/MacOS/firefox';

/** true when there is a Firefox to launch. */
export const haveFirefox = () => existsSync(FIREFOX);

const START_TIMEOUT = 30000;
const READY_TIMEOUT = 10000;
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

/** WebDriver's code points for the keys the app listens to. */
const KEYS = { ArrowLeft: '', ArrowUp: '', ArrowRight: '', ArrowDown: '', Escape: '', Enter: '', Tab: '', Home: '', End: '', PageUp: '', PageDown: '' };

/**
 * Start a headless Firefox on a throw-away profile.
 * @returns {Promise<{ open: (url: string, viewport?: { width?: number, height?: number }) => Promise<FirefoxPage>, close: () => Promise<void> }>}
 * @typedef {{ ready: boolean, evaluate: (expression: string) => Promise<any>, screenshot: (file: string) => Promise<void>,
 *             problems: () => { type: string, text: string }[], key: (key: string) => Promise<void>,
 *             click: (x: number, y: number) => Promise<void>, send: (method: string, params?: object) => Promise<any>,
 *             close: () => Promise<void> }} FirefoxPage
 */
export async function launchFirefox() {
  if (!haveFirefox()) throw new Error(`no Firefox at ${FIREFOX} (set FIREFOX=)`);
  const profile = mkdtempSync(join(tmpdir(), 'fractonica-firefox-'));
  const child = spawn(FIREFOX, ['--headless', '--remote-debugging-port=0', '--profile', profile, '--no-remote', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });

  // Firefox prints "WebDriver BiDi listening on ws://127.0.0.1:PORT" on stderr
  const endpoint = await new Promise((found, fail) => {
    let log = '';
    const timer = setTimeout(() => fail(new Error(`Firefox did not start within ${START_TIMEOUT} ms:\n${log}`)), START_TIMEOUT);
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => {
      log += chunk;
      const match = log.match(/WebDriver BiDi listening on (ws:\/\/\S+)/);
      if (match) {
        clearTimeout(timer);
        found(match[1]);
      }
    });
    child.once('exit', (code) => {
      clearTimeout(timer);
      fail(new Error(`Firefox exited with ${code}:\n${log}`));
    });
  });

  const socket = new WebSocket(`${endpoint}/session`);
  await new Promise((opened, fail) => {
    socket.addEventListener('open', opened, { once: true });
    socket.addEventListener('error', () => fail(new Error('could not connect to Firefox')), { once: true });
  });
  const pending = new Map();
  const events = [];
  let nextId = 1;
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.id === undefined) {
      events.push(message);
      return;
    }
    const request = pending.get(message.id);
    pending.delete(message.id);
    if (message.type === 'error') request?.fail(new Error(`${request.method}: ${message.error}: ${message.message}`));
    else request?.done(message.result);
  });
  /** One BiDi command. */
  const send = (method, params = {}) =>
    new Promise((done, fail) => {
      const id = nextId++;
      pending.set(id, { done, fail, method });
      socket.send(JSON.stringify({ id, method, params }));
    });
  await send('session.new', { capabilities: {} });
  await send('session.subscribe', { events: ['log.entryAdded'] });

  async function open(url, { width = 1280, height = 800 } = {}) {
    const { context } = await send('browsingContext.create', { type: 'tab' });
    await send('browsingContext.setViewport', { context, viewport: { width, height } });
    await send('browsingContext.navigate', { context, url, wait: 'complete' });
    /** The value of an expression (a promise is awaited); it travels as JSON, so BigInt and DOM nodes do not. */
    const evaluate = async (expression) => {
      const answer = await send('script.evaluate', { expression: `(async () => JSON.stringify(await (${expression})))()`, target: { context }, awaitPromise: true });
      if (answer.type === 'exception') throw new Error(`evaluate: ${answer.exceptionDetails.text}`);
      return answer.result.value === undefined ? undefined : JSON.parse(answer.result.value);
    };
    const deadline = Date.now() + READY_TIMEOUT;
    let ready = false;
    while (!ready && Date.now() < deadline) {
      ready = await evaluate("document.documentElement.dataset.ready === '1'");
      if (!ready) await sleep(50);
    }
    await evaluate('new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => done(true))))');
    return {
      ready,
      evaluate,
      send,
      /** Console errors and warnings of this page so far. */
      problems: () =>
        events
          .filter((event) => event.method === 'log.entryAdded' && event.params.source?.context === context && (event.params.level === 'error' || event.params.level === 'warn'))
          .map((event) => ({ type: event.params.level, text: event.params.text })),
      async screenshot(file) {
        const { data } = await send('browsingContext.captureScreenshot', { context });
        writeFileSync(file, Buffer.from(data, 'base64'));
      },
      /** Press and release a key ("ArrowRight", "Escape" ... or a character). */
      async key(key) {
        const value = KEYS[key] ?? key;
        await send('input.performActions', { context, actions: [{ type: 'key', id: 'keyboard', actions: [{ type: 'keyDown', value }, { type: 'keyUp', value }] }] });
      },
      /** A real mouse click at viewport coordinates. */
      async click(x, y) {
        const actions = [{ type: 'pointerMove', x: Math.round(x), y: Math.round(y) }, { type: 'pointerDown', button: 0 }, { type: 'pointerUp', button: 0 }];
        await send('input.performActions', { context, actions: [{ type: 'pointer', id: 'mouse', parameters: { pointerType: 'mouse' }, actions }] });
      },
      close: () => send('browsingContext.close', { context }),
    };
  }

  async function close() {
    const exited = new Promise((done) => child.once('exit', done));
    try {
      await send('browser.close');
    } catch {
      child.kill();
    }
    await Promise.race([exited, sleep(3000).then(() => child.kill())]);
    socket.close();
    await rm(profile, { recursive: true, force: true, maxRetries: 3 }).catch(() => {});
  }

  return { open, close };
}
