#!/usr/bin/env node
/**
 * check-module.mjs - the facts a built fractonica.wasm must have, read from
 * the binary itself (no toolchain needed, so the tests run it too):
 *
 *   - it has NO import section, so it runs on an empty import object;
 *   - it exports the memory, every function of wasm/exports.txt (the core's
 *     public API) and the glue's frcw_* helpers, and nothing else;
 *   - its memory cannot grow.
 *
 * Usage:  node wasm/check-module.mjs <module.wasm> <exports.txt>
 * Prints one summary line; exits 1 with the reason when a fact does not hold.
 *
 * `inspectModule` is exported for test/module.test.js.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/** The names of the sections we look at (WebAssembly core spec, binary format). */
const SECTION = { IMPORT: 2, MEMORY: 5 };

/**
 * Walk the module's sections. The standard API hides two things we must know
 * (whether an import SECTION exists at all, and the memory's maximum), so the
 * few bytes of framing are read by hand.
 * @param {Uint8Array} bytes
 * @returns {{ sections: Map<number, Uint8Array>, customNames: string[] }}
 */
function readSections(bytes) {
  let at = 8; // "\0asm" + version
  const leb = () => {
    let value = 0;
    let shift = 0;
    for (;;) {
      const byte = bytes[at++];
      value |= (byte & 0x7f) << shift;
      if ((byte & 0x80) === 0) return value >>> 0;
      shift += 7;
    }
  };
  const sections = new Map();
  const customNames = [];
  while (at < bytes.length) {
    const id = bytes[at++];
    const size = leb();
    const body = bytes.subarray(at, at + size);
    if (id === 0) {
      const nameLength = body[0]; // custom section names here are short
      customNames.push(new TextDecoder().decode(body.subarray(1, 1 + nameLength)));
    } else {
      sections.set(id, body);
    }
    at += size;
  }
  return { sections, customNames };
}

/**
 * Everything the checks and the tests want to know about a module.
 * @param {Uint8Array} bytes the module
 * @returns {{
 *   size: number, sha256: string, imports: WebAssembly.ModuleImportDescriptor[],
 *   hasImportSection: boolean, functions: string[], others: string[],
 *   memory: { initialPages: number, maximumPages: number | null }, customSections: string[]
 * }}
 */
export function inspectModule(bytes) {
  const module = new WebAssembly.Module(bytes);
  const { sections, customNames } = readSections(bytes);
  const exports = WebAssembly.Module.exports(module);

  // memory section: count, then limits = flags, initial[, maximum]
  const memory = sections.get(SECTION.MEMORY);
  let at = 1;
  const leb = () => {
    let value = 0;
    let shift = 0;
    for (;;) {
      const byte = memory[at++];
      value |= (byte & 0x7f) << shift;
      if ((byte & 0x80) === 0) return value >>> 0;
      shift += 7;
    }
  };
  const flags = leb();
  const initialPages = leb();
  const maximumPages = flags & 1 ? leb() : null;

  return {
    size: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    imports: WebAssembly.Module.imports(module),
    hasImportSection: sections.has(SECTION.IMPORT),
    functions: exports.filter((e) => e.kind === 'function').map((e) => e.name).sort(),
    others: exports.filter((e) => e.kind !== 'function').map((e) => `${e.kind} ${e.name}`).sort(),
    memory: { initialPages, maximumPages },
    customSections: customNames,
  };
}

/**
 * The reasons a module is not acceptable (empty when it is).
 * @param {ReturnType<typeof inspectModule>} facts
 * @param {string[]} coreFunctions the names of wasm/exports.txt
 * @returns {string[]}
 */
export function moduleProblems(facts, coreFunctions) {
  const problems = [];
  if (facts.hasImportSection || facts.imports.length > 0) {
    problems.push(`the module imports: ${facts.imports.map((i) => `${i.module}.${i.name}`).join(', ') || '(empty import section)'}`);
  }
  const exported = new Set(facts.functions);
  const missing = coreFunctions.filter((name) => !exported.has(name));
  if (missing.length > 0) problems.push(`core functions not exported: ${missing.join(', ')}`);
  const wanted = new Set(coreFunctions);
  const foreign = facts.functions.filter((name) => !wanted.has(name) && !name.startsWith('frcw_'));
  if (foreign.length > 0) problems.push(`unexpected exports: ${foreign.join(', ')}`);
  if (facts.others.join() !== 'memory memory') {
    problems.push(`the only non-function export must be the memory, found: ${facts.others.join(', ')}`);
  }
  if (facts.memory.maximumPages !== facts.memory.initialPages) {
    problems.push(`the memory must be fixed, found ${facts.memory.initialPages} pages growing to ${facts.memory.maximumPages ?? 'no limit'}`);
  }
  if (facts.customSections.length > 0) {
    problems.push(`not stripped: custom sections ${facts.customSections.join(', ')}`);
  }
  return problems;
}

/** One name per line; blank lines ignored. */
export function readExportList(path) {
  return readFileSync(path, 'utf8').split('\n').map((line) => line.trim()).filter(Boolean);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [modulePath, listPath] = process.argv.slice(2);
  if (!modulePath || !listPath) {
    console.error('usage: node wasm/check-module.mjs <module.wasm> <exports.txt>');
    process.exit(2);
  }
  const facts = inspectModule(readFileSync(modulePath));
  const coreFunctions = readExportList(listPath);
  const problems = moduleProblems(facts, coreFunctions);
  if (problems.length > 0) {
    for (const problem of problems) console.error(`check-module: FAIL: ${problem}`);
    process.exit(1);
  }
  const glue = facts.functions.filter((name) => name.startsWith('frcw_')).length;
  console.log(
    `check-module: ok  ${facts.size} bytes, no imports, ${coreFunctions.length} frc_* + ${glue} frcw_* functions, ` +
      `memory fixed at ${facts.memory.initialPages} pages, sha256 ${facts.sha256.slice(0, 16)}`,
  );
}
