/**
 * The cross-check: fractonica.wasm + the binding against a NATIVE build of
 * the same core, byte for byte.
 *
 * test/native/dump.c is compiled here with the host compiler and prints every
 * kind of answer the core gives (static facts, then a block per instant).
 * test/crosscheck-lines.js prints the same through the binding. If one field
 * of one struct were read at the wrong offset, sign-extended wrongly, or one
 * argument passed in the wrong slot, a line would differ.
 *
 * Needs the core checkout and a C compiler (CC, default `cc`); skipped with
 * the reason when either is missing.
 */
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';

import { A, ANCHOR_PLUS_1S, B, C, cat, CORE, frc, HAVE_CORE, makeRandom, NO_CORE, WEB } from './helpers.js';
import { CUSTOM_MS, instantLines, staticLines } from './crosscheck-lines.js';

const CC = process.env.CC ?? 'cc';
const haveCompiler = spawnSync(CC, ['--version'], { stdio: 'ignore' }).status === 0;
const skip = !HAVE_CORE ? NO_CORE : !haveCompiler ? `no C compiler (${CC})` : false;

/** How many random instants, beside the edges and the SPEC's vectors. */
const RANDOM_INSTANTS = 300;

/** Build test/native/dump.c against the core's sources; returns the program's path. */
function buildDump() {
  const out = resolve(WEB, 'build/native');
  mkdirSync(out, { recursive: true });
  const program = resolve(out, 'dump');
  const sources = readdirSync(resolve(CORE, 'src')).filter((name) => name.endsWith('.c')).map((name) => resolve(CORE, 'src', name));
  execFileSync(
    CC,
    [
      '-std=c11', '-O2',
      // WebAssembly has no fused multiply-add: the native build must not fuse either
      '-ffp-contract=off',
      `-I${resolve(CORE, 'include')}`, resolve(WEB, 'test/native/dump.c'), ...sources, '-o', program,
    ],
    { stdio: ['ignore', 'inherit', 'inherit'] },
  );
  return program;
}

/** The instants of the test: edges of the catalogue, eclipses, the SPEC's vectors, and random ones. */
function instants() {
  const random = makeRandom(141n);
  const list = [
    cat.first - 1n, cat.first, cat.first + 1n, cat.last - 1n, cat.last, cat.last + 1n,
    cat.instant(1) - 1n, cat.instant(1), cat.instant(20), cat.instant(68), cat.instant(69) - 1n,
    A, B, C, ANCHOR_PLUS_1S, 0n, -1n,
  ];
  for (let i = 0; i < RANDOM_INSTANTS; i++) list.push(random.between(cat.first, cat.last));
  // a few close together, so that spans shorter than a Blink are compared too
  for (let i = 0; i < 12; i++) list.push(A + random.between(0n, 400000n));
  return list;
}

test(`wasm + binding == native core, byte for byte (static facts and ${RANDOM_INSTANTS}+ instants)`, { skip }, (t) => {
  const program = buildDump();
  const list = instants();
  const native = execFileSync(program, { input: `${list.join('\n')}\n`, maxBuffer: 1 << 30, encoding: 'utf8' }).split('\n');
  assert.equal(native.pop(), '', 'the dump ends with a newline');

  const custom = frc.catalogue(CUSTOM_MS, 999);
  const ours = staticLines(frc, custom);
  const staticCount = ours.length;
  let previous = null;
  for (const instant of list) {
    ours.push(...instantLines(frc, cat, 'saros141', instant, previous, true));
    previous = instant;
  }

  // compare line by line, so that a failure names the first fact that differs
  const length = Math.min(native.length, ours.length);
  for (let i = 0; i < length; i++) {
    if (native[i] !== ours[i]) {
      assert.fail(`line ${i + 1} differs\n  native: ${native[i]}\n  wasm:   ${ours[i]}\n  (after: ${ours[i - 1] ?? 'the start'})`);
    }
  }
  assert.equal(ours.length, native.length, 'the same number of lines');
  // the comparison must have had something to compare
  assert.ok(staticCount > 3000, `${staticCount} static lines`);
  assert.ok(native.some((line) => line.includes('FRC_ERR_RANGE')) && native.some((line) => line.includes('none')));
  t.diagnostic(`${native.length} lines compared (${staticCount} static, ${native.length - staticCount} at ${list.length} instants)`);
});
