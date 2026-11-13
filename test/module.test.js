/**
 * The module as shipped (public/fractonica.wasm) and its two wrappers:
 *
 *   - freestanding: no imports, fixed memory, stripped, small;
 *   - complete: it exports every function fractonica.h declares, and
 *     fractonica.js calls every one of them (the whole public header is
 *     wrapped), and fractonica.d.ts declares what fractonica.js defines.
 *
 * A failure of "the header's functions" after the core gained a function
 * means: run `make wasm`, then wrap the new function in fractonica.js and
 * fractonica.d.ts.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';

import { Catalogue, Fractonica, load } from '../public/lib/fractonica.js';
import { inspectModule, moduleProblems, readExportList } from '../wasm/check-module.mjs';
import { CORE, HAVE_CORE, NO_CORE, WASM_PATH, WEB } from './helpers.js';

const bytes = readFileSync(WASM_PATH);
const facts = inspectModule(bytes);
const exportList = readExportList(resolve(WEB, 'wasm/exports.txt'));
const bindingSource = readFileSync(resolve(WEB, 'public/lib/fractonica.js'), 'utf8');
const typesSource = readFileSync(resolve(WEB, 'public/lib/fractonica.d.ts'), 'utf8');

/** The module must stay a small download; it was 45 KiB when this was written. */
const SIZE_BUDGET = 64 * 1024;

test('the module imports nothing and its memory cannot grow', (t) => {
  assert.deepEqual(moduleProblems(facts, exportList), []);
  assert.equal(facts.hasImportSection, false);
  assert.deepEqual(facts.imports, []);
  assert.equal(facts.memory.maximumPages, facts.memory.initialPages);
  assert.deepEqual(facts.customSections, [], 'stripped: no name, producers or debug section');
  t.diagnostic(`fractonica.wasm: ${facts.size} bytes, sha256 ${facts.sha256}`);
});

test(`the module is under ${SIZE_BUDGET} bytes`, () => {
  assert.ok(facts.size < SIZE_BUDGET, `${facts.size} bytes`);
});

test('it instantiates on an empty import object, from bytes, a Module, a path and a file URL', async () => {
  const instance = await WebAssembly.instantiate(new WebAssembly.Module(bytes), {});
  assert.ok(instance.exports.memory instanceof WebAssembly.Memory);
  for (const source of [bytes, new Uint8Array(bytes).buffer, new WebAssembly.Module(bytes), WASM_PATH, new URL(`file://${WASM_PATH}`), `file://${WASM_PATH}`]) {
    const frc = await load(source);
    assert.ok(frc instanceof Fractonica);
    assert.equal(frc.saros141.count, 70);
  }
});

test('wasm/exports.txt is the list of functions fractonica.h declares', { skip: !HAVE_CORE && NO_CORE }, () => {
  // the header without comments; function-like macros are upper case and do not match
  const header = readFileSync(resolve(CORE, 'include/fractonica.h'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const declared = [...new Set([...header.matchAll(/\b(frc_[a-z0-9_]+)\s*\(/g)].map((match) => match[1]))].sort();
  assert.deepEqual(exportList, declared, 'the core\'s API changed: run `make wasm`');
});

test('the module exports every function of wasm/exports.txt', () => {
  const exported = new Set(facts.functions);
  assert.deepEqual(exportList.filter((name) => !exported.has(name)), []);
  assert.ok(exportList.length >= 98);
});

test('fractonica.js calls every function of the header', () => {
  // frc_foo is wrapped when the binding calls it, or its pointer form frcw_foo of wasm/glue.c
  const missing = exportList.filter((name) => {
    const direct = new RegExp(`\\.${name}\\(`).test(bindingSource);
    const glue = new RegExp(`\\.frcw_${name.slice(4)}\\(`).test(bindingSource);
    return !direct && !glue;
  });
  assert.deepEqual(missing, [], 'wrap these in public/lib/fractonica.js and declare them in fractonica.d.ts');
});

test('every frcw_* export of the glue is used by the binding', () => {
  const unused = facts.functions.filter((name) => name.startsWith('frcw_') && !bindingSource.includes(`.${name}(`));
  // read by this suite, not by the binding
  assert.deepEqual(unused, ['frcw_scratch_used']);
});

/** The method names a `declare class` body of fractonica.d.ts lists. */
function declaredMethods(className) {
  const body = typesSource.match(new RegExp(`export declare class ${className} \\{([\\s\\S]*?)\\n\\}`))[1];
  return [...body.matchAll(/^ {2}(\w+)\(/gm)].map((match) => match[1]).filter((name) => name !== 'constructor').sort();
}

function definedMethods(constructor) {
  return Object.getOwnPropertyNames(constructor.prototype).filter((name) => name !== 'constructor').sort();
}

test('fractonica.d.ts declares exactly the methods fractonica.js defines', () => {
  assert.deepEqual(declaredMethods('Fractonica'), definedMethods(Fractonica));
  assert.deepEqual(declaredMethods('Catalogue'), definedMethods(Catalogue));
});

test('fractonica.d.ts declares exactly the exports of fractonica.js', async () => {
  const exported = Object.keys(await import('../public/lib/fractonica.js')).sort();
  const declared = [...typesSource.matchAll(/^export declare (?:const|class|function) (\w+)/gm)].map((match) => match[1]).sort();
  assert.deepEqual(declared, exported);
});
