/**
 * tools/serve.mjs: the right MIME types (a browser refuses a module or a
 * streamed .wasm with the wrong one), nothing outside the root, and the
 * binding loading over HTTP the way a browser loads it.
 */
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { load } from '../public/lib/fractonica.js';
import { startServer } from '../tools/serve.mjs';

let server;
before(async () => {
  server = await startServer({ port: 0, quiet: true });
});
after(() => server.close());

test('serves the module as application/wasm and scripts as text/javascript', async () => {
  const wasm = await fetch(new URL('fractonica.wasm', server.url));
  assert.equal(wasm.status, 200);
  assert.equal(wasm.headers.get('content-type'), 'application/wasm');
  assert.equal(Number(wasm.headers.get('content-length')), (await wasm.arrayBuffer()).byteLength);

  const script = await fetch(new URL('lib/fractonica.js', server.url));
  assert.equal(script.status, 200);
  assert.equal(script.headers.get('content-type'), 'text/javascript; charset=utf-8');
  assert.match(await script.text(), /export async function load/);

  const head = await fetch(new URL('fractonica.wasm', server.url), { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal((await head.arrayBuffer()).byteLength, 0);
});

test('answers 404 for a missing file and never leaves the root', async () => {
  assert.equal((await fetch(new URL('no-such-file.js', server.url))).status, 404);
  // encoded so that the URL parser does not resolve the dots away first
  assert.equal((await fetch(`${server.url}%2e%2e/package.json`)).status, 404);
  assert.equal((await fetch(`${server.url}..%2fpackage.json`)).status, 404);
  assert.equal((await fetch(new URL('fractonica.wasm', server.url), { method: 'POST' })).status, 405);
});

test('the binding loads over HTTP (streaming compilation) and reads the clock', async () => {
  const frc = await load(new URL('fractonica.wasm', server.url));
  const helion = frc.saros141.odometerAt(frc.fromUnixSeconds(1791460800), 6, 2, 2);
  assert.deepEqual([...helion.digits], [13, 0]);
  // a Response and a promise of one work as well
  const fromResponse = await load(fetch(new URL('fractonica.wasm', server.url)));
  assert.equal(fromResponse.version, frc.version);
});
