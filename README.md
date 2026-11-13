# Fractonica Web

The Fractonica clock in the browser: the C core compiled to WebAssembly, a JavaScript binding, and the clock as a static site.

![The NOW screen on a desktop in EARTH mode: a ring of nested, alternating arcs around two phase glyphs, the full reading ε#5 34η 29ι 21λ 3ν with its Gregorian date, countdowns to the next Helion and θ thresholds, the solar sync and drift, and a list of the next thresholds](docs/hero.jpg)

*The NOW screen at SPEC test vector A (2026-10-08T12:00:00Z), on a desktop in EARTH mode.*

## What it is

Fractonica is an eclipse-anchored harmonic clock. Its anchor is the solar Saros series 141.
It counts time in nested cycles, from the Alpha (about 72 years) down through the Helion to the Blink,
and draws them as nested alternating arcs with phase glyphs.
This repository is the web client, live at [fractonica.com](https://fractonica.com).
The app never computes the clock itself: it asks the core, compiled to one WebAssembly module, and draws what it is told.
It has four screens, NOW, LADDER, LENS and WAVE, and two modes: PURE shows only Fractonica units, and EARTH adds the Gregorian and SI translation beside them, marked ⊕.

## The Fractonica repositories

| Repository | What it is |
|---|---|
| [core](https://github.com/fractonica/core) | The clock itself: a dependency-free C99 library, and the specification |
| [ios](https://github.com/fractonica/ios) | A SwiftUI app for iPhone, iPad and Mac, built on the core |
| **[web](https://github.com/fractonica/web)** (this one) | The core as WebAssembly and the clock as a static site, live at [fractonica.com](https://fractonica.com) |
| [esp32](https://github.com/fractonica/esp32) | ESP-IDF firmware for a small physical clock, with a host simulator; not yet run on hardware |

## Quick start

You need Node 22 or later. Nothing has to be built first: the WebAssembly module is kept in the repository.

```sh
git clone https://github.com/fractonica/web.git
cd web
make serve          # the clock at http://127.0.0.1:8141/
make test           # every suite; a browser suite skips, saying why, without Chrome or Firefox
```

A frozen, repeatable view: `http://127.0.0.1:8141/?t=1791460800`.

To rebuild the module, clone the core beside this repository, so that it sits at `../core`:

```sh
git clone https://github.com/fractonica/core.git ../core
make wasm           # needs clang with the wasm32 target and wasm-ld
make verify-wasm    # proves the kept module is byte for byte what the sources build
```

`CORE=/path/to/core make wasm` builds from a core checkout somewhere else.

## What is in it

- No dependencies: no npm packages, no bundler, no framework, no web fonts, no CDN. The site is plain ES modules, HTML and CSS.
- A small module: `public/fractonica.wasm` is 55,954 bytes (23,852 gzipped) with core 0.2.0. It has no imports and a fixed memory of 192 KiB.
- The whole core API. The module exports all 119 public `frc_*` functions of the core's header. `public/lib/fractonica.js` wraps them for browsers and Node, with types in `fractonica.d.ts`.
- Four screens: NOW, LADDER (all 63 rungs of the catalogue), LENS (one rung in detail) and WAVE (a timeline you can scrub). Phone and desktop layouts, from 320 px wide.
- It works offline and installs as an app: a service worker and a web manifest. Every URL is relative, so the site runs from any static host or sub-path.
- 21 test suites run with `node --test`. They include a byte-for-byte cross-check against a native build of the core, and browser tests in headless Chrome and Firefox.

## Status

Version 0.1.0, built on core 0.2.0.
The site is deployed and live at [fractonica.com](https://fractonica.com).
It is tested in headless Chrome and headless Firefox on macOS.
Safari and real touch devices have not been tried.
A few design details are not done yet; the guide lists them under "Not yet".

## Documentation

- [docs/GUIDE.md](docs/GUIDE.md): the full guide. Hosting, the app and its deep links, the binding, the module, the tests, the layout and the rules.
- [AGENTS.md](AGENTS.md): the guide for coding agents and engineers working in this repository.
- [SPEC.md](https://github.com/fractonica/core/blob/main/docs/SPEC.md): the clock's specification, in the core repository.

## Licence

Licensed under the [Apache License 2.0](LICENSE).
