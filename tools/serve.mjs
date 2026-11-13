#!/usr/bin/env node
/**
 * serve.mjs - a static file server for public/, with nothing but Node.
 *
 * WHY NOT `python -m http.server`: ES modules and WebAssembly are strict
 * about MIME types. A browser refuses a module served as text/plain, and
 * WebAssembly.compileStreaming needs application/wasm. This server sends the
 * right type for every kind of file the site has, and "no-cache" so that an
 * edit shows on reload.
 *
 * Usage:
 *   node tools/serve.mjs [--port 8141] [--host 127.0.0.1] [--root public]
 *   PORT=9000 node tools/serve.mjs
 *   make serve
 * `--port 0` takes any free port; the address is printed on stdout as
 * "serving <root> at http://host:port/".
 *
 * `startServer` is exported for the tests and for tools/shoot (screenshots).
 */
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** Every kind of file the site serves. Anything else goes out as bytes. */
export const MIME_TYPES = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.ts': 'text/plain; charset=utf-8', // fractonica.d.ts, for a human who opens it
});

const DEFAULT_ROOT = resolve(fileURLToPath(new URL('../public', import.meta.url)));
const DEFAULT_PORT = 8141; // Saros 141

/**
 * The file a request path names inside `root`, or null when the path tries to
 * leave it. A directory is answered with its index.html.
 */
async function locate(root, urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  const path = normalize(join(root, decoded));
  if (path !== root && !path.startsWith(root + sep)) return null;
  try {
    const info = await stat(path);
    if (info.isDirectory()) {
      const index = join(path, 'index.html');
      return (await stat(index)).isFile() ? { path: index, size: (await stat(index)).size } : null;
    }
    return info.isFile() ? { path, size: info.size } : null;
  } catch {
    return null;
  }
}

/**
 * Start serving `root`.
 * @param {{ root?: string, port?: number, host?: string, quiet?: boolean }} [options]
 * @returns {Promise<{ url: string, port: number, close: () => Promise<void> }>}
 */
export async function startServer({ root = DEFAULT_ROOT, port = DEFAULT_PORT, host = '127.0.0.1', quiet = false } = {}) {
  const base = resolve(root);
  const server = createServer(async (request, response) => {
    const { pathname } = new URL(request.url ?? '/', 'http://localhost');
    const send = (status, body, type = 'text/plain; charset=utf-8') => {
      response.writeHead(status, { 'Content-Type': type, 'Content-Length': Buffer.byteLength(body) });
      response.end(request.method === 'HEAD' ? undefined : body);
    };
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      send(405, 'method not allowed\n');
      return;
    }
    const file = await locate(base, pathname);
    if (!quiet) console.log(`${file ? 200 : 404} ${request.method} ${pathname}`);
    if (!file) {
      send(404, 'not found\n');
      return;
    }
    response.writeHead(200, {
      'Content-Type': MIME_TYPES[extname(file.path).toLowerCase()] ?? 'application/octet-stream',
      'Content-Length': file.size,
      'Cache-Control': 'no-cache',
    });
    if (request.method === 'HEAD') {
      response.end();
      return;
    }
    createReadStream(file.path).on('error', () => response.destroy()).pipe(response);
  });
  await new Promise((done, fail) => {
    server.once('error', fail);
    server.listen(port, host, done);
  });
  const actualPort = server.address().port;
  return {
    url: `http://${host}:${actualPort}/`,
    port: actualPort,
    close: () =>
      new Promise((done) => {
        server.close(() => done());
        server.closeAllConnections();
      }),
  };
}

/** `--port 8141` / `--port=8141` from the command line. */
function option(name, fallback) {
  const args = process.argv.slice(2);
  const at = args.indexOf(`--${name}`);
  if (at >= 0 && args[at + 1] !== undefined) return args[at + 1];
  const joined = args.find((arg) => arg.startsWith(`--${name}=`));
  return joined ? joined.slice(name.length + 3) : fallback;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const port = Number(option('port', process.env.PORT ?? DEFAULT_PORT));
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    console.error(`serve: not a port: ${option('port', process.env.PORT)}`);
    process.exit(2);
  }
  const root = resolve(option('root', DEFAULT_ROOT));
  try {
    const server = await startServer({ root, port, host: option('host', '127.0.0.1') });
    console.log(`serving ${root} at ${server.url}`);
  } catch (error) {
    console.error(`serve: ${error.code === 'EADDRINUSE' ? `port ${port} is in use (try --port 0)` : error.message}`);
    process.exit(1);
  }
}
