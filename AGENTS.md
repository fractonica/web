# AGENTS.md — working on fractonica-web

The guide for a coding agent (or engineer) picking this repository up. It tells you where everything is, what you
must not break, and how to do the common changes. Read section 1, then the part you need.

- **What it is:** the web client of the Fractonica clock. The C core (`../core`, read its `AGENTS.md` and
  `include/fractonica.h`) compiled to WebAssembly, a JavaScript binding, and the clock app.
- **Sources of truth, in order:** `../SPEC.md` (the clock) → `../core/include/fractonica.h` (the API) →
  `../design/README.md` (rulings) and `../design/astrolabe/DESIGN.md` (the look) → the tests here.
- **Status:** all six stages are done: the module, the binding, tests, tools; the app shell, the token table,
  the store and scheduler, the drawing primitives, the instrument; all four screens, NOW, LADDER, LENS and WAVE
  (both layouts, both modes), and time travel (a cursor shared by every screen); integration: an end-to-end journey
  test, sizes from 320 px to 1920 px, Firefox, sub-path hosting, offline (service worker), icons and manifest;
  review fixes (stage 6): links to the microsecond, Back between screens, touch targets, zones off UTC, a
  Content-Security-Policy, GO TO messages, a calm title (`test/browser-device.test.js`, `test/zones.test.js`).
  The core's client round (2026-11): every new function is wrapped, typed and cross-checked; the Earth wording,
  band edges, scrub inverse, signs, stamp terms, kind words, "9 θ" / "11 in ζ", prefix factors, glyph at a
  quarter, `sync.helion` and `pentad.first` come from the core; three shims are deleted, one is left (rule 1).
  Core 0.2.0 (2026-11-13): the module is rebuilt; `spanNextChangeSince` is wrapped, typed, cross-checked and used
  (every span to a threshold is rewritten at the core's next change, `frame.spanChange`); `PREFIX_FACTORS_SIZE`
  sizes the prefix-factors buffer; the Sun's DRIFT (NOW and WAVE) is `formatSpanInUnit(drift, Unit.FLAVON)`,
  "−6 235λ" at vector A (the core cuts toward zero; the design's "−6 236λ" is rounded: the core's text wins).
- **Before you say something works:** `make check` (it rebuilds the module, compares it with the kept one, and runs
  every suite). For anything visible: `make shoot`, then LOOK at the PNGs (it also fails on any console error).
- **In a hurry?** Section 4 is the app: where every screen, drawing primitive and piece of state lives.

## 1. The rules (they are not negotiable)

1. **No Fractonica arithmetic in JavaScript.** Every number, name, symbol, phase, boundary, span, date, glyph state
   and formatted quantity comes from the wasm core through `public/lib/fractonica.js`. Arc geometry comes from
   `arcChild` / `arcPoint` / `arcWaveRoot`; glyph outlines from `glyphPath`. If the core lacks something, do not
   improvise it: ask for it (exact C signature and the reason). Only if you cannot go on without it, put a clearly
   marked temporary shim in ONE file named `shim-*.js`. There is one: `app/model/shim-earth-text.js`, two Earth
   texts the core does not write yet: `driftSeconds` (the sync's drift in seconds with hundredths, "−48 469.99 s";
   `frc_format_duration` words it "−13 h 28 min"; requested: `int frc_format_seconds(int64_t microseconds,
   uint8_t decimals, char *buf, size_t size)`) and `signedDuration` (the plus in front of an Earth duration
   ahead, "+5.41 s": the core writes the minus of a negative duration, never a plus; requested: a signed form of
   `frc_format_duration`, as `frc_format_span_signed` is of `frc_format_span`). Every other Earth text is the
   core's (`frc_format_civil_text`, `frc_format_duration`, `frc_parse_civil`), chosen in `app/model/earth.js`,
   which is not a shim. Deleted when the core covered them: `shim-band-edges.js` (`frc_band_edges`),
   `shim-scrub.js` (`frc_time_at_phase`, `frc_time_at_sync_phase`), `shim-signs.js` (`frc_format_count_signed`,
   `frc_format_span_signed`). `test/app.test.js` lists the shims by name (another needs a line there) and fails
   on a sign composed anywhere else.
   What JavaScript may do: place and scale what the core returns (pixels), choose what to show, schedule, and
   the index bookkeeping the header itself prescribes for half-cycles (`app/model/halves.js`, nowhere else; a
   core function for it, `frc_half_cycle_at`, is still requested). A place on screen becomes a phase with
   `frc.fracFromDouble` (the binding's inverse of `fracToDouble`, a change of container like `toDate`).
   `test/app.test.js` holds this: no `Math.sin / cos / tan`, no colour or font literal outside the token table.
2. **Never edit** `../core`, `../design`, `../reference`, `../ios`, `../esp32` or `../SPEC.md`. Work inside `web/`.
3. **Zero third-party dependencies.** No npm packages, bundler, framework, web fonts or CDN. Plain ES modules, HTML,
   CSS, Canvas 2D / SVG, served as static files. Node only for tools and tests. `package.json` exists for one
   reason: `"type": "module"`, so that Node reads `.js` as ES modules.
4. **PURE mode shows only Fractonica:** no Gregorian date, weekday, month, year, hour / minute / second, time zone,
   Hz, metre, SI prefix or per cent anywhere, including aria labels, `title` attributes, the document title and any
   text a user can reach. **EARTH** mode adds the translations exactly where DESIGN.md section 9 says, led by ⊕.
   No percentages in either mode. Nothing blinks or pulses. Words: NOW, LADDER, LENS, WAVE; PURE / EARTH.
5. **Time is BigInt microseconds** (`frc_time_t`). Redraw when something visible changes, at the instants the core
   returns (`nextChange`, `nextThreshold().time`, a cycle's `end`); `null` means nothing comes later. A continuous
   arc fill may animate with `requestAnimationFrame` at a modest rate (DESIGN.md section 10), paused while the page
   is hidden. Never a busy loop, never polling.
6. **Outside the catalogue** (`!cat.contains(t)`): the instrument stays engraved, the reading is replaced by
   `OUT OF CATALOGUE · α#1 – α#18`, time travel clamps to `[cat.first, cat.last]` (design ruling 7).
7. **Earth-mode zone** is the browser's: `frc.utcOffsetSeconds(t)` per instant, then `frc.civilFromTime(t, offset)`
   and `frc.formatCivil` for fields and text.
8. **Report honestly.** Say what you ran and what it printed. Look at your screenshots before calling a screen right.

## 2. Commands

| Command | Does |
|---|---|
| `make serve` | serves `public/` at `http://127.0.0.1:8141/` (`PORT=`), correct MIME types, no cache |
| `make test` | `node --test 'test/*.test.js'`: every suite (about 40 s; the browser suites are most of it) |
| `node --test test/binding.test.js` | one suite |
| `make shoot` | PNGs of every view into `build/shots/` (76 views); `make shoot SHOTS="now pure phone"` picks views; exits 1 on any console error |
| `make audit` | every screen x mode at 320 / 375 / 393 phones, a phone on its side, 768 / 1024 / 1280 / 1920 windows, 200 % zoom, reduced motion into `build/sizes/`; exits 1 on text cut by the window's edge or by a box that hides its overflow, type under 6.2 px, a box that scrolls without the `.more-below` fade, sideways scroll or a console error |
| `make idle` | main-thread time of live pages over 10 s each (Chrome's Performance domain; `DEFAULT_VIEWS` in tools/idle.mjs: the Helion on a phone and a desktop, budget 20 %; foci 9 and 13 on a desktop, NOW, WAVE and LENS, budget 35 % because headless Chrome rasterises without a GPU); exits 1 over a budget |
| `make icons` | rewrites `public/icons/` (favicon SVG, touch icon, manifest PNGs) from `app/drawing/icon.js` |
| `node tools/measure.mjs "mode=earth&screen=now" --width 1280 --height 800 .reading ".sun .value"` | where elements are (box, baseline), to compare with DESIGN.md section 7 |
| `make wasm` | rebuilds `public/fractonica.wasm` from `../core/src` + `wasm/glue.c` (`CORE=` for another checkout) |
| `make verify-wasm` | rebuilds into `build/` and fails unless the kept module is byte for byte the same |
| `make check` | `verify-wasm` + `test` |
| `make size` | the module's size, raw and gzipped |
| `make clean` | removes `build/` |

Toolchain for `make wasm` only: a clang with the wasm32 target and a wasm-ld that runs. On this machine:
`/opt/homebrew/opt/llvm/bin/clang` (22.1.5) and `/opt/homebrew/opt/emscripten/libexec/llvm/bin/wasm-ld` (the
Homebrew `wasm-ld` on PATH is broken). `wasm/build.sh` finds them; `CLANG=` / `WASM_LD=` override.

## 3. File map

```
web/
  README.md  AGENTS.md  Makefile  package.json  .gitignore
  wasm/
    glue.c              the C side of the binding: scratch + keep memory, struct layout and constant tables
                        (generated from the header by the compiler), pointer forms of by-value functions,
                        sink adapters for glyph outlines. Exports are named frcw_*. No clock arithmetic.
    build.sh            compile + link + verify; writes exports.txt and public/fractonica.wasm
    exports.txt         every function fractonica.h declares (generated; kept so API changes show in a diff)
    check-module.mjs    reads a .wasm: no imports, exact export set, fixed memory, stripped
  public/                         THE SITE ROOT (served as it is)
    index.html                    the page: a ground canvas, #app, one module script; <meta theme-color> = the plate
    manifest.webmanifest          name, display, icons; mirrors the void and the plate (a test holds them to the tokens)
    sw.js                         the service worker: network first, its cache only when offline (keeps the site usable)
    icons/                        icon.svg (favicon), apple-touch-icon.png, icon-192/512(-maskable).png: written by
                                  tools/icons.mjs from app/drawing/icon.js, kept in the repository
    styles/app.css                layout and type of the shell and NOW; colours and fonts ONLY as var(--c-*) / var(--font-*)
    styles/ladder.css  lens.css  wave.css   where the parts of the LADDER, the LENS and the WAVE stand (same rule)
    fractonica.wasm               the built module, kept in the repository
    lib/fractonica.js             THE BINDING (one file, usable alone in browsers and Node)
    lib/fractonica.d.ts           its types, hand-written
    app/main.js                   entry: load the core, store, theme, ground, shell, scheduler; sets data-ready
    app/design/tokens.js          THE token table: colours, faces, weights, glow; themes astrolabe + basalt
    app/model/
      url.js                      the URL contract: parseUrlState / formatUrlState, SCREENS, MODES, FOCUS_MIN/MAX
      store.js                    the state store (mode, focus, screen, level, theme, cursor, layout) + time source
      clock.js                    the scheduler: one pass, then sleep until the earliest instant a view named
      frame.js                    one instant read from the core, memoised: cycle / threshold / stamp / sync ...
      halves.js                   half-cycles from cycles, by the header's rule (the ONLY index bookkeeping)
      rungs.js                    a rung's static facts as the core words them: rungFacts (pure), rungEarth (per interval)
      travel.js                   time travel by whole steps: stepTerm (a tumbler), stepCivil, stepThreshold, parseMoment ("go to")
      earth.js                    Earth-mode wording, the core's forms chosen per line (dateLine, clockTime, when,
                                  duration, civilTerms, zoneName, titleDate, parseEarthDate), the Sun's hour ticks
      shim-earth-text.js          SHIM: driftSeconds ("−48 469.99 s"), signedDuration ("+5.41 s"): not in the core yet
    app/drawing/                  primitives; know nothing about screens
      canvas.js                   fitCanvas, stroke (+ glow), fill, disc, ring, line, text (tracking, knock-out)
      arcs.js                     ringCarrier, buildNest, nestPath, nowPoint, paintNest, paintNowPoint
      glyphs.js                   paintOdometer (canvas), odometerSvg / updateOdometerSvg (DOM), crispUnit
      seal.js                     a level's seal: sealGeometry, paintSeal, sealSvgPath
      counter-ring.js             paintCounterRing (ancestors, the Sun), paintEarthRing (civil hours)
      limb.js                     paintCurvedLimb, paintStraightLimb and their hit tests
      wheel.js                    the LADDER's great wheel: wheelRim, rimPoint, rowOffset / rowAtOffset, paintRim, paintBandRail
      spine.js                    the whole ladder as 63 ticks: paintSpine, spineLevelAt
      live-ring.js                a level's ring drawn small (the LENS): paintLiveRing, paintThresholdMarks
      wave.js                     cycles laid along a line (the WAVE): buildWaveCell, fitWaveCell, paintWave; the
                                  Sun's lane: paintSunLane, sunLaneBox
      marks.js                    inline SVG: sigil, modeRing, pentadMark, beadRow, quarterMark, sunMark
      icon.js                     iconSvg: the app icon (the Helion's ring from the core's arcs, token colours)
      ground.js                   the plate: vignette + machining marks on a fixed canvas
    app/instrument/
      geometry.js                 fitInstrument (R and centre for a box), ringRadii, heroShape; REFERENCE sizes
      reading.js                  readInstrument(frame, focus, depth, mode): everything a ring shows, as data
      draw.js                     drawInstrument: paints a reading; paintReading
      motion.js                   FADE durations, createTweens (cross-fades), prefersReducedMotion, easeInOut
      limb-control.js             createLimb: THE control across the scales (curved / straight, pointer + keys)
      instrument.js               createInstrument: canvas + limb + centre button + wheel / pinch + zoom + a11y
    app/shell/
      shell.js                    chrome (mode toggle, NOW return mark, sigils), mounts screens, title, keyboard
      dom.js                      h, svg, setText, setWords, setReading, readingNodes, setHidden, capture,
                                  watchOverflow (the .more-below fade of a box that scrolls)
      steady-caret.js             steadyCaret: a text caret that does not blink (CSS caret-animation, else drawn)
      offline.js                  keepForOffline: registers sw.js and hands it the list of what the page loaded
    app/screens/
      contract.js                 WHAT A SCREEN IS (typedefs App, ScreenInstance) + the list of primitives
      now/now.js                  the NOW screen (instrument + panels); now-reading.js (its text, as data);
                                  panels.js (its DOM)
      ladder/ladder.js            the LADDER screen: geometry of the wheel, input, the canvas (seals, rim, band rail)
        ladder-rows.js            its DOM and text: 63 rows, the large row, headings; describeRung (the a11y sentence)
        spine-control.js          createSpine: the scrubber at the edge (a vertical slider)
      lens/lens.js                the LENS screen: arrangement, the two rhythms (ring / text), limb, swipe down
        lens-reading.js           readLens(frame, level, mode): everything the lens says, as data
        lens-panels.js            its DOM: head, title, EXACT P, lineage strip (canvas), data rows, media
        lens-ring.js              createLensRing: the live ring R 54 + the four threshold labels
      wave/wave.js                the WAVE screen: mounts the parts, one pass = read, paint, write
        wave-reading.js           readWave(frame, focus, mode, view): everything it says and lights, as data
        wave-panels.js            its DOM: the tumblers (stamp and Earth line), "go to", NOW, captions, the list
        wave-field.js             createWaveField: the wave's canvas and scrubbing (drag, inertia, snap, wheel, keys)
        wave-sun.js               createSunLane: the Sun's lane and coarse moves
  tools/
    serve.mjs           static server (exports startServer; `--port 0` for any free port)
    chrome.mjs          headless Chrome over the DevTools protocol: exact viewport, zone, evaluate, click / drag /
                        key, screenshot, the console
    shoot.mjs           screenshots of every screen x layout x mode, NOW at eight focus levels, the LADDER turned
                        to three more rungs, the LENS on five more, the WAVE at two more scales and with a
                        scrubbed cursor
    measure.mjs         boxes and text baselines of elements, for holding a layout against DESIGN.md
    audit.mjs           every screen x mode at eleven viewports: PNGs + text cut by the edge, scrolling, console
    idle.mjs            measureIdle(page, seconds): main-thread time and canvas clears of an idle page
    firefox.mjs         headless Firefox over WebDriver BiDi: open, evaluate, screenshot, key, click, problems
    icons.mjs           writes public/icons/ (the PNGs through headless Chrome)
  test/
    helpers.js          one loaded core, SPEC's instants A B C, rounding helpers, a seeded generator
    *.test.js           the suites (section 8)
    crosscheck-lines.js the binding's side of the cross-check (mirror of native/dump.c)
    zone-probe.mjs      run by zones.test.js in a child process per time zone (TZ / LANG are fixed at start)
    native/dump.c       the native side: prints what the core answers, compiled with the host cc at test time
  docs/screens/         curated final pictures (README.md shows them); refresh from build/shots after a visible change
  build/                everything built or captured (ignored by git)
```

## 4. The app: `public/app/`

No build step: `index.html` loads `app/main.js` as an ES module; everything imports relatively. One data flow:

```
store (state + which instant) ──► clock (when to draw) ──► shell ──► frame (the core, read once) ──► screen.update(frame, changed)
                                                                                                      └► reading (data) ──► draw (ink) / DOM text
```

### 4.1 URL state and the store (`model/url.js`, `model/store.js`)

`?t=<unix s>` freezes the present · `&at=<unix s>` the cursor (extension, written by the app while away). Both are
seconds with an optional fraction of up to six digits (`at=1791460800.3125`: a Blink is 0.31 s, so a link keeps the
microseconds); `parseUrlState` returns them as instants (BigInt µs), `formatSeconds(t)` writes one back, and an
instant beyond what a JavaScript Date holds (±8.64e15 ms) is dropped like any malformed value ·
`&mode=pure|earth` · `&screen=now|ladder|lens|wave` · `&focus=0..13` · `&level=0..62` (the rung the LENS inspects and
the LADDER is turned to; kept in the link on those two screens) ·
`&theme=astrolabe|basalt`. Precedence at start: URL > localStorage (`fractonica.mode`, `fractonica.focus`) > default
(pure, 6, now). A change of SCREEN is written with `history.pushState` (Back and the Android back gesture go back a
screen; `popstate` restores the entry's screen and rung); every other change replaces the entry
(`history.replaceState`); `store.back()` (Escape on the lens) goes back through the same history while the page
pushed an entry. While the cursor is scrubbed (it moves on every frame) the link follows at most four times a
second, the place where it stops always (browsers refuse a flood of history writes, and say so in the console).

| Member | |
|---|---|
| `store.state` | `{ mode, focus, screen, level, theme, cursor: instant \| null, layout: 'phone' \| 'desktop' }`; read it, change it only with the setters |
| `store.frc`, `store.cat` | the core and Saros 141 |
| `store.frozen` | the instant of `?t=`, or null |
| `store.now()` | the present (frozen or the platform clock) |
| `store.time()` | **the instant every screen shows**: the cursor, else the present |
| `store.live` | true while that instant moves by itself (no cursor, not frozen): only then do timers run |
| `store.away` | true while a cursor is set (the NOW return mark shows) |
| `store.set(patch)` | validates, clamps (focus 0..13, level 0..62, cursor to `[cat.first, cat.last]`), remembers mode / focus, writes the URL, emits |
| `setMode(m)`, `toggleMode()`, `setFocus(L)`, `stepFocus(±1)`, `setScreen(id)`, `setCursor(t \| null)`, `returnToNow()`, `openLens(level = focus)`, `back()` | shorthands for `set` |
| `setLevel(L)` | the lens's level 0..62; the focus follows it while L ≤ 13. The ladder turns with `set({ level })`, which leaves the focus alone, and focuses the instrument with `set({ level, focus })` |
| `stepScale(±1)` | what Left / Right do from anywhere: the lens's level on the lens, else the focus |
| `store.subscribe((changed: Set<string>, state) => …)` → unsubscribe | `changed` = keys changed in one `set`: `'mode' 'focus' 'screen' 'level' 'theme' 'cursor' 'layout'` |

`layout` is `'phone'` below 700 CSS px of width (`PHONE_MAX_WIDTH`), else `'desktop'`; it follows the window. The
shell mirrors `mode`, `screen`, `layout`, `focus` as `data-*` on `#app`, so CSS selects with
`#app[data-layout='phone'][data-mode='earth'] …` and never disagrees with JavaScript.

### 4.2 The scheduler and the frame (`model/clock.js`, `model/frame.js`)

`clock.add(view)` registers `view(t, changed) → { next, frameMs, animating }`. The clock runs a pass, then sleeps
until the earliest answer: `next` = an instant from the core at which something shown changes (`nextChange`, a
threshold's `time`, a cycle's `end`); `frameMs` = a delay for continuous arc fill (never under 33 ms: 30 passes a
second at most); `animating` = a user-started transition (the zoom) wants the next animation frame. No timer while
the page is hidden, time is frozen or a cursor is set: then a pass happens only when the store changes.
`clock.refreshSoon()` asks for a pass (a screen's own box changed). Screens never call `add`: the shell does.

`createFrame(frc, cat, t)` → everything at one instant, asked once: `frame.t`, `inCatalogue`, `cycle(L)`,
`threshold(L)`, `points(L)` (start, peak, node, valley, end), `odometer(L, strokes = 2, digits = 2)`, `date()`,
`stamp()`, `terms()` (the stamp's nine terms, `frc.formatDateTerm`), `sync()` (null in a partial sync),
`syncOdometer()`, `pentad()`, `spanTo(instant, parts = 0)` ("6ι 43λ"), `signedSpanTo(instant, parts = 0)` ("+6ι 43λ"),
`spanChange(instant, parts = 0)` (when that span's text next changes: `cat.spanNextChange` before the instant,
`cat.spanNextChangeSince` from it on; push it into a reading's `changes` wherever a span is shown),
`interval()` (the Saros interval the ladder is laid from: the one that holds t; outside the catalogue the mean one).
Outside the catalogue every other one is null: use `outOfCatalogueText(frc, cat)`. `driftFlavons(frame, sync)` →
the sync's drift in Flavons ("−6 235λ"), the DRIFT figure of NOW and the WAVE.

`model/rungs.js`: `rungFacts(frc, L)` → the pure facts of a rung, kept per rung (`depth`, `name`, `word`, `title`,
`kind`, `kindShort` / `kindWords` (the core's "major" "unit" "between" "sub-Blink"), `focusable`, `solar`,
`children` "9 θ" ('' for level 62: the core refuses it), `inParent` "11 in ζ", `inUnits` ["36ι", "2 340λ",
"58 500ν"], `madeOf`, `span`, `rate`, `rateShort`, `lengthOrRate`, `prefix`, `prefixFactors` "125 125 = 5 · 13 ...");
`rungEarth(frc, L, interval)` → `band`, `bandName` (the core's "no band" for none), `rule` (the band rule: `place`
0..1 between the core's edges `frc.bandEdges`, `below` / `above` band names, `low` / `high` edge texts; null for
no band), `visible`, `period`, `frequency`, `length`.
Both screens of the catalogue read these; nothing in them is computed in JavaScript.

`model/halves.js`: `halfOf(frc, cycle)` → `{ index: BigInt, second, progress }`; `halfInSync(frc, sync, helion)` →
`{ index 0..37, progress }` (on the core's `sync.helion`); `ringSteps(frame, focus, depth)` →
the path to now for `nestPath`; `waveSteps(frame, focus, depth)` → `{ half, progress, steps }`, the same path for the
wave's two half-cycle carriers; `cycleIndexWithin(frame, ancestor, level)`; `cyclesWithin(frc, ancestor, level)`.

`model/travel.js`: where a step of time travel leads, every destination an instant the core returned.
`stepTerm(frc, cat, t, index, delta)` steps one term of the stamp (`TERMS[index]`, 0 = Alpha .. 8 = Blink) by whole
units and keeps the finer terms: the neighbouring cycle is `cycleByIndex(index ± n)`, its date `dateAt(start)` (the
core carries), the finer fields are copied in, `dateToTime` gives the instant; it stops at the catalogue's edges.
`stepCivil(frc, t, field, delta)` steps a field of the Earth date (EARTH mode). `stepThreshold(frc, cat, t, level,
±1)` → the next / previous threshold. `parseMoment(frc, cat, text, t, earth)` → `{ instant }` or `{ error: 'empty' |
'parse' | 'range' }`: `frc.parseDate` with the moment shown as context, then, in EARTH mode only, an Earth date.

### 4.3 Tokens and themes (`design/tokens.js`)

`THEMES.astrolabe` / `THEMES.basalt` have one shape: `color` (void plate etch1 etch2 etch3 ash bone lumen lumenMid
lumenDim lumenEtch lumenRing now nowCore sol solDim solLabel solEmpty hAlpha earth limbBetween majorLabel
majorName), `font` (reading, caps, weights, tracking, earthStyle), `line`, `glow`, `alpha`, `ground`.
- Canvas code: `theme()` at draw time; `withAlpha(hex, opacity)`; `canvasFont('reading' | 'caps', size, weight?)`.
- CSS: `applyTheme(root, name)` generates `--c-<colour>` (`lumenMid` → `--c-lumen-mid`, `etch2` → `--c-etch2`),
  `--font-reading`, `--font-caps`, `--w-reading|value|earth|caps|title`, `--track-caps|date`, `--earth-style`,
  `--glow-sigma-phone|desktop`, `--c-glow-lumen|sol`. `styles/app.css` uses only these.
- Earth translations use `color.earth` (ash in Astrolabe, verdigris in Basalt); the present uses `color.now`.
- A new colour: add it to BOTH themes (a test compares the shapes), then use `theme().color.x` / `var(--c-x)`.
- `color.seal` is a seal at rest in a list; `color.hAlpha` is used for ONE rung only, the one `rungEarth().visible`
  names (its seal, its band, its mark on the band rule, its tick on the spine, the halo behind its large row).
- Engraved words are uppercased in JavaScript (`engraved()` / `setWords()`), not with `text-transform`: Greek
  letters inside caps must stay lowercase.

### 4.4 Drawing primitives (`drawing/`)

All take a `CanvasRenderingContext2D` from `fitCanvas` (units are CSS px; `ctx.ratio` = devicePixelRatio).
Positions on circles come from the core: a ring is `ringCarrier(frc, cx, cy, r)` and a point on it
`frc.arcPoint(carrier, fraction)` with fraction 0..1 clockwise from 12 o'clock (a fraction IS a phase).

| Call | Does |
|---|---|
| `fitCanvas(canvas, width, height, ratio?)` → ctx | size for the pixel ratio, clear, scale; `ctx.ratio` |
| `stroke(ctx, path2d, { color, width, alpha?, glow?: { sigma, alpha } })`, `fill(ctx, path2d, { color, alpha?, glow? })` | round caps and joins; glow = the same path blurred under the stroke |
| `disc(ctx, x, y, r, style)`, `ring(ctx, x, y, r, style)`, `line(ctx, x0, y0, x1, y1, style)`, `circlePath(x, y, r)` | |
| `text(ctx, string, x, y, { font, color, tracking?, align?, rotate?, alpha?, knock?: { color, width } })` | y is the baseline; `measure(ctx, string, font, tracking?)` |
| `engraved(words)` | capitals, Greek untouched; `snapToPixelCentre(v, ratio)` |
| `ringCarrier(frc, cx, cy, radius)` → Arc | a whole cycle as a closed ring from 12 o'clock |
| `buildNest(frc, carrier, level, { depth = 2, ring = true, parity = 0, minRadius = 3 })` → Nest | `layers[d] = { level, m, arcs[], odd }`, flat and in time order. `ring: false` + `parity: half & 1` for a half-cycle carrier (`frc.arcWaveRoot(half)`) |
| `nestPath(nest, steps)` → `[{ index, progress }]` | steps from `ringSteps(frame, focus, depth)` |
| `nowPoint(frc, nest, path)` → `{ x, y }` | on the deepest arc drawn |
| `paintNest(ctx, frc, nest, path \| null, { heroWidth?, sigma?, allElapsed?, part? })` | DESIGN.md section 5 style table; `path: null` = all engraved; `part: 'settled' \| 'current'` splits a pass for a caller that keeps the settled arcs in a bitmap (the instrument) |
| `paintNowPoint(ctx, point, radius, sigma?)` | |
| `paintOdometer(ctx, frc, digits, { x, y, u, strokes = 2, pitch = PAIR_PITCH, snap? }, { color, alpha?, glow? })` | glyphs centred on (x, y); `crispUnit(frc, u, ratio)`; `SUN_PITCH`; `odometerExtent(frc, count, { strokes, pitch, dy })` = how far the ink can reach, per u (from `frc.glyphBounds`) |
| `odometerSvg(frc, digits, { u, strokes?, pitch? })` → `<svg class="glyphs">`, `updateOdometerSvg(frc, svg, digits, place)` | DOM glyphs, coloured by CSS (`.glyphs`, `.glyphs.sol`) |
| `paintSeal(ctx, frc, cx, cy, extent, level, { color?, width?, alpha?, glow? })` → carrier radius; `sealSvgPath(frc, extent, level)` → `{ radius, d }`; `sealGeometry(...)` | the icon of a level: 11 px in lists, 30 px focused |
| `paintCounterRing(ctx, frc, cx, cy, { radius, slots, current, slotFraction, fraction, letter, kind: 'major' \| 'minor' \| 'sun', groups? }, { big?, sigma?, scale? })` | one ancestor's ring with its planet |
| `paintEarthRing(ctx, frc, cx, cy, radius, ticks, { big? })` | civil hours on the Sun's ring (ticks from `syncHourTicks`) |
| `paintCurvedLimb(ctx, frc, { cx, cy, radius, step, span, big, value, min, max, scale? })`, `paintStraightLimb(ctx, frc, { cx, y, width, pitch?, value, min, max })` | drawing only; use `createLimb` for the control |
| `wheelRim(frc, x, cy, radius = 1150)` → Arc, `rimPoint(frc, rim, offset)`, `rowOffset(rows)` / `rowAtOffset(px)`, `paintRim(ctx, frc, rim, reach)`, `paintBandRail(ctx, frc, rim, runs)`, `WHEEL` | the LADDER's great wheel: the rim is an arc of the core running DOWN from its leftmost point, so a row `offset` px along it is `frc.arcPoint`; rows are 92 px from the index, then 47 px apart |
| `paintSpine(ctx, { x, top, bottom, count, turn, before, after, focus, rung })`, `spineLevelAt(spine, y)` | the whole ladder as ticks; the control is `screens/ladder/spine-control.js` |
| `buildWaveCell(frc, level, radius, depth)` → `{ level, radius, width, reach, halves: [Nest, Nest] }`, `fitWaveCell(frc, level, radius, reach, depth)`, `paintWave(ctx, frc, cell, { originX, axisY, left, right, first, last }, now, { heroWidth?, sigma? })` → the point of now | one cycle of a level as two nests on the core's wave roots (`frc.arcWaveRoot(0 | 1)`, x 0 .. 4 r, axis y 0), painted wherever a cycle stands: before the instant all lit, after it engraved, the cycle that holds it split by `waveSteps` (model/halves.js) |
| `paintSunLane(ctx, frc, { x0, x1, y, halves, scale? }, sun, window, sigma?)`, `sunLaneBox(width, halves, scale?)` → `{ axis, height }` | one solar sync as 38 half-Helions in a row, the Pentads bracketed above, the quarters below, the wave's window marked; `sun` is `readWave().sun` |
| `paintLiveRing(ctx, frc, { cx, cy, nest, reading, scale?, unit? })`, `paintThresholdMarks(ctx, frc, { cx, cy, radius, tick, unit, items })` | a level's ring drawn small (carrier, nest, beads, now, odometer) and the four thresholds with their glyph states; `reading` is a `readInstrument` result |
| `sigil(frc, id)`, `modeRing()`, `pentadMark(frc)` → `{ element, update(pentad, numeral) }`, `beadRow()` → `{ element, update(count, lit, pitch?) }`, `quarterMark(frc, fraction)`, `sunMark()` | inline SVG marks, coloured by CSS |
| `createGround(canvas)` → `{ set({ cx, cy, r0? }), draw() }` | the plate; a screen calls `app.ground.set(...)` with the centre of its main circle (viewport px) |

### 4.5 The instrument and the limb (`instrument/`)

- **`createInstrument({ store, topInset?, onCentre?, requestDraw? })`** → `{ element, update(frame, changed), layout(),
  geometry(), destroy() }`. Append `element` into a box with a size; it fills it and re-fits on resize. `update`
  paints the frame for `store.state.focus` and returns `{ next, frameMs, animating }`. It owns the curved limb, the
  centre button (→ `store.openLens(focus)`), wheel and pinch (→ `store.stepFocus`), the zoom of a focus change, the
  fades, and the canvas `aria-label`. `geometry()` → `{ cx, cy, R, hero, carrier, bezel, outer, limbRadius }` (px in
  the element).
- **`readInstrument(frame, focus, depth, mode)`** → data: `lit`, `letter`, `fraction`, `steps`, `beads { count, lit }`,
  `graduations { count, every, lit }`, `thresholds [{ quarter, word, time }]` (order `BEZEL_QUARTERS`; places
  `BEZEL_FRACTIONS`), `next`, `digits`, `name`, `ancestors [{ level, letter, major, slots, current, slotFraction,
  fraction }]`, `sun { slots, current, slotFraction, fraction, groups } | null`, `hourTicks`, `changes [instants]`.
  `describeInstrument(frame, focus)` → pure-safe words.
- **`drawInstrument(ctx, frc, { fit, radii, nest, reading, motion?, settled? })`** paints it (`settled` = `{ canvas,
  key }` kept by the caller: the nest's settled arcs are painted into it only when an arc is completed, and each
  pass lays the lit part of the running arcs over it). The centre odometer is u = 0.086 R (0.074 R desktop), or
  as large as the circle inside the threshold ticks holds where the bezel is smaller (θ, γ, λ); the cycle's name
  above it only while it fits. To draw a ring elsewhere (the
  lens): `fit = fitInstrument({...})` or your own `{ cx, cy, big, markScale }`, `radii = { ...ringRadii(frc, F, fit),
  ...heroShape(frc, F, depth, hero, tick) }`, `nest = buildNest(frc, ringCarrier(frc, cx, cy, radii.carrier), F,
  { depth: radii.depth, minRadius: 0 })`. For a bare ring use `buildNest` + `paintNest` + `paintOdometer` directly.
- **Geometry** (`geometry.js`): `REFERENCE.phone` (R 102, gaps 9.5 / 6.5, limb 209) and `.desktop` (R 172, 13 / 10.5,
  limb 352). `fitInstrument({ layout, width, height, viewportWidth, viewportHeight, topInset })` → `{ cx, cy, R, k,
  big, markScale, depth }`. `ringRadii(frc, focus, fit)` → `{ hero, rings [{ level | 'sun', radius, major }], outer,
  limbRadius, ringScale, heroScale }` (gaps tighten for foci finer than the Helion). `heroShape(frc, focus, depth,
  hero, tick)` → `{ carrier, bezel, depth, centre }`: a level with few, large arcs (θ has 8) is drawn on a smaller
  carrier with a smaller bezel so that its arcs stay between them; the Helion gets exactly the design.
- **`createLimb({ frc, shape: 'curved' | 'straight', min, max, get, set, describe, label? })`** → `{ element,
  place(circle), update(), draw(), destroy() }`. THE control across the scales: `role="slider"`, drag (mouse, touch,
  pen), tap a letter, Left / Right / Home / End. Straight: `host.append(limb.element)` (it fills the width, 64 px
  tall), call `limb.update()` when the bound value changed. Curved: also `limb.place({ cx, cy, radius, step, span,
  big, scale })`. Bound to the focus: `get: () => store.state.focus, set: (L) => store.setFocus(L)`.
- **Motion** (`motion.js`): `FADE` (threshold 600, bead 400, glyph 120, zoom 320, screen 240, mode 200 ms),
  `createTweens(enabled)` → `follow(key, value, ms)` → `{ from, to, mix }`, `prefersReducedMotion()`. Nothing repeats.

### 4.6 Screens (`screens/contract.js` is the contract; read it)

```js
export const screen = {
  id: 'wave',
  mount(host, app) {            // app = { store, frc, cat, clock, ground, insetTop() }
    …build DOM / canvases inside host…
    return {
      update(frame, changed) {  // frame: model/frame.js; changed: Set of store keys, or null (only time moved)
        …draw frame…
        return { next, frameMs, animating };   // when to be called again (4.2)
      },
      unmount() { … },
    };
  },
};
```

- The shell (`shell/shell.js`) lists the modules in `SCREEN_MODULES`, mounts the one `store.state.screen` names into
  `<main id="screen">`, and calls `update` on every pass. A screen mounted in a pass gets that pass's `changed`.
- The chrome is the shell's: the mode toggle (phone: top right, y ≈ `--inset-top` − 9; desktop: top of the rail), the
  NOW return mark (phone: top centre; desktop: rail), the sigils (phone: bottom centre, about 100 px; desktop: the
  88 px rail). Phone screens keep `app.insetTop()` px free at the top (CSS: `var(--inset-top)`).
- Text helpers (`shell/dom.js`): `h(tag, attrs, ...children)`, `svg(...)`, `setText(el, text)` (touches the DOM only
  when changed), `setWords(el, words)` (engraved caps), `setReading(el, "6ι 43λ")` (letters in `<span class="u">`),
  `watchOverflow(box)` → `{ check, destroy }` (a box that scrolls gets `.more-below`, a fade at its bottom edge, while
  it holds more than it shows: scroll bars are hidden, this is the cue; NOW and the LENS use it).
- The page is an instrument, not a document: `#app` has `user-select: none` and the default cursor; only the NOW
  `.reading` and inputs can be selected, in the token colours (`::selection`, app.css).
- Touch targets (app.css): `.mode-toggle .now-mark .sigil-button .wave-now .tumbler .ladder-focus .wave-goto` get
  an invisible `::before` of at least 44 × 44 px; where controls stand closer, `--hit-top/-bottom/-left/-right`
  set its sides (the phone's WAVE, wave.css). A new small control: add it to that list and to
  `test/browser-device.test.js`.
- The document title is `Fractonica · δ#3 ε#5 34η 29ι` (the short letter form down to the Preon: it changes about
  every eight minutes), plus `· ⊕ 8 OCT 2026 12:00` in EARTH mode (the core's DAY_MONTH_YEAR and MINUTE forms).
  The whole stamp is `<html data-stamp>`.
- CSS classes ready to use: `.caps` (engraved words), `.u`, `.earth` (+ `.sign`), `.sr-only`, `.rule`, `.glyphs`,
  `.beads`, `.limb-straight`.
- Earth text: `model/earth.js` (`dateLine`, `clockTime`, `clockMinute`, `dayMonthTime`, `when`, `duration`,
  `whenOrOffset`, `zoneName`, `titleDate`, `syncHourTicks`, `msToNextSecond`, `civilTerms`, `parseEarthDate`,
  `civilText`, `EARTH_SIGN`: every text is `frc.formatCivilText` / `frc.formatDuration`) and the shim
  `model/shim-earth-text.js` (`driftSeconds`, `signedDuration`), only behind
  `store.state.mode === 'earth'`. An Earth element in pure mode is `hidden` AND empty (`test/browser.test.js` reads
  every text, aria-label and title of all four screens in pure mode).
- **Another view in the pictures:** `tools/shoot.mjs` takes its screens from `model/url.js` `SCREENS`; more views
  (another focus, a cursor, a theme) are one line in its `views()`, or `--query "at=1791470000&theme=basalt"`.
- **A screen's own stylesheet** is `styles/<screen>.css`, linked in `index.html`; a CSS custom property it defines
  for itself goes into the `local` list of the token test in `test/app.test.js`.

### 4.7 The NOW screen (`screens/now/`)


`now.js` mounts the instrument and the panels; `now-reading.js` `readNow(frame, focus, mode)` is all of its text as
data (stamp, majors, reading, the two countdowns of the focus and its child, Pentad, Sun, next thresholds, and the
Earth lines when `mode === 'earth'`); `panels.js` is its DOM. One DOM tree serves both layouts; `styles/app.css`
places it at the positions of DESIGN.md section 7 (held with `tools/measure.mjs`). The block is scaled as a whole
(`--column-scale`, CSS `zoom`) on narrow phones and in narrow or very wide desktop columns.

### 4.8 The LADDER screen (`screens/ladder/`, `styles/ladder.css`)

All 63 rungs on the rim of a great wheel (DESIGN.md sections 7 - 9, renders screen3.png / screen3_pure.png). Static:
nothing on it moves with time; it redraws on a change of state, a turn, or when the cursor crosses an eclipse.

- **State:** `store.state.level` is the rung under the index. `shown` (in `ladder.js`) is the same while the wheel
  turns: fractional. `place()` puts every row for `shown`: each row element gets `transform: translateY(...)`, `--rx`
  (the x of the rim there) and an opacity; the canvas gets the rim, the band rail, the seals, the halo.
- **DOM** (`ladder-rows.js`): `.ladder-heads` (column headings) · `.rung` x 63 (`role="option"`, id `rung-<level>`;
  cells `.r-depth .r-name .r-facts(.r-kind .r-band .r-parent) .r-pure .r-made .r-period .r-freq .r-length`) ·
  `.rung-focus` (the large row: `.f-depth .f-head(.f-name .f-line1 .f-line2) .f-values(.f-pure .f-sub) .f-madeof
  .f-earth(.f-period .f-freq .f-length, one of them `.lead`) .f-rule(.f-mark .f-low .f-high .f-edge)`) ·
  `.ladder-focus` (the instrument-focus mark, a button) · `.spine`. `tree.write(mode, interval, key, narrow)` fills
  what depends on mode and interval; `tree.writeFocus(level, mode, interval)` the large row.
- **Arrangements** (`data-columns` on `.ladder`, set in `layout()`): `stack` (width < 1040: two lines of values at the
  right; in EARTH mode the Earth values replace the pure ones, as in screen3.png) and `side` (five columns: pure and
  Earth side by side, the Earth ones under one ⊕ heading; column right edges are `--c1..--c5` in ladder.css; in
  PURE mode the two pure columns take the places of the last two, by the spine).
  A row whose two Earth figures are long, or any row on a screen under 372 px, is `.wide`: its caption keeps only
  "n in parent".
- **Pure values:** the length as a span down to the Blink, the rate in pB below it (`rungFacts().lengthOrRate`: in
  full up to 22 characters, then four digits); "made of" from `frc.formatLevelInUnit`. **Earth values:**
  `frc.formatPeriod / formatFrequency / formatLength` at `frame.interval()`. The rung in the visible band leads with
  its wavelength. The band rule (any rung in a band, when large): `rungEarth().rule`, from the core's `frc.bandEdges`.
- **Input:** drag (62 px per rung), wheel, Up / Down / Page / Home / End on `.ladder-wheel`, the spine; Enter / a
  click on the large row → `store.openLens(level)` (a click waits 280 ms when the rung could take the instrument's
  focus: a second click means that); long press 500 ms / double click / F / `.ladder-focus` →
  `store.set({ level, focus: level })` for levels 0..13.
- **Phone geometry:** the index at `cy = (inset + 60 + height) / 2` (451 on the reference phone; the design says 452),
  rim x 46, values right edge 51 px in, spine 18 px in from y inset + 37. The screen's box is extended below itself
  (see "Things that will bite you": the sigils).

### 4.9 The LENS screen (`screens/lens/`, `styles/lens.css`)

Everything about one rung (renders screen4.png / screen4_pure.png). `store.state.level` (0..62), set with
`store.setLevel` (the limb, a seal of the lineage, Left / Right).

- **`readLens(frame, level, mode)`** (`lens-reading.js`) → `{ facts, band, lit, live, media, devices, lineage,
  lineageCut, prefix, period, madeOf, siblings, travel, earthPeriod, earthFrequency, changes }`.
  `live` is null for levels deeper than 13 (design ruling 9); else `{ ring (a readInstrument result), name,
  siblings { count, local }, thresholds [{ quarter, word, fraction, glyph, next, span "+6ι 43λ", earth }] }`.
  `media[i]` = `{ name, place (0..1 on a logarithmic rule of the seven speeds), light (frc.formatLightSpan), metres }`.
  `devices` (EARTH mode, rungs below the Blink): SPEC 16.4 for a 1 MHz timer and a 32-bit phase at 48 kHz.
- **Two rhythms** (`lens.js`): `ring.paint(frame, level)` every pass (it answers `{ next, frameMs }`);
  `readLens` + `panels.update` + `ring.write` only when a text may have changed (a change of state, `textDue`, a
  civil second in EARTH mode, every 100 ms for levels 9..13 whose spans carry decimals).
- **The ring** (`lens-ring.js`): R 54 in a 250 px box (x 1.3 side by side, down to x 0.68 on narrow phones);
  `heroShape` gives the carrier on which a level's arcs stay inside the threshold ticks (at `FIRST_RING` x R). Glyph
  states at the thresholds are `frc.glyphIndexOfPhase` of 0, a quarter, a half, three quarters. Levels deeper than 13
  get the same nest engraved (a large seal) and no labels.
- **Arrangements** (`data-arrangement` on `.lens`): `column` (phones, windows under 900 px: the positions of DESIGN.md
  section 7, `--top` = where the content begins) and `side` (two blocks side by side). When the body holds more than
  the screen (EARTH rows on a phone, the Alpha's eight-unit period) it scrolls and gets `.more-below` (a fade).
- **Earth is beside, never instead:** the spans of light stay and the metres stand in a second column (the rule
  gives way on a phone); period and rate rows get `.row-earth` cells; thresholds get `.th-earth` (above the glyph
  for peak and valley, on the span's line for end and node).
- **Back:** Escape (the shell: `store.back()`), or a touch dragged 90 px down from the top of the content.

### 4.10 The WAVE screen (`screens/wave/`, `styles/wave.css`)

The timeline, headed WAVE (design ruling 4; the renders screen5.png / screen5_greg.png say TIMELINE): time moves
under a fixed hairline. State: `store.state.cursor`
(null = the present) and `store.state.focus` (the level of the wave). EVERY way of travelling ends in
`store.setCursor(instant)`; the store clamps to the catalogue, and the other screens show that instant.

- **One rhythm** (`wave.js`): every pass reads the instant afresh (`readWave`, about sixty core calls), repaints the
  two canvases and writes the texts that changed. It answers `next` = the end of the running Blink or an earlier
  threshold, `frameMs` = when the wave has moved half a pixel (and a civil second in EARTH mode). Frozen or away,
  nothing is repainted until the state changes.
- **`readWave(frame, focus, mode, { selected, present, away })`** (`wave-reading.js`) → `{ lit, out, title "Helion
  wave", caption "9 θ · 36 ι", stamp, terms [{ name, text, previous, next }] (neighbours only for the selected
  tumbler), earth { weekday, zone, fields [{ field, label, text, lead, previous, next }] } | null, offset "+18ι 13λ",
  atNow, wave { cycle, count, fraction, millis, name, nextWord, nextSpan, thresholds [{ quarter, fraction, word,
  time, next, earth }], points }, sun { number, drift, sync, half, progress, pentads [{ index, first, count,
  numeral, on }], pentadName, quarters [{ word, time, next, earth }], nextWord, nextSpan } | null, upcoming [{ sun,
  level, symbol, quarter, fraction, time, span, earth }], changes }`. `sun` is null in the catalogue's partial syncs.
  `defaultTerm(frc, focus)` → the tumbler selected by default (the first unit finer than the focus);
  `describeWave(reading)` → the pure-safe sentence of the canvas.
- **The wave** (`wave-field.js`, `drawing/wave.js`): a cell (one cycle, `4 × radius` wide) is fitted to the band
  between the cycle names and the threshold rule (`fitWaveCell`; radius 52 on the reference phone, depth 2, on a
  desktop 3). The instant under the hairline lies `fraction × cell.width` after the start of its cycle; everything
  else is whole cells left and right. Cycle names are `frc.formatCycleName(level, cycle, true)`. When the four
  threshold labels would collide (a small wave) only the next one keeps its word and time.
- **Scrubbing** (`wave-field.js`): a drag moves the cursor by `px / cell.width` cycles from where it was grabbed
  (`cat.timeAtPhase(level, cycle, frc.fracFromDouble(fraction))`, the core's first microsecond at that phase;
  the Sun lane `cat.timeAtSyncPhase`), one `setCursor` per animation frame; released while moving it coasts
  (velocity × 0.92 per frame; not under reduced motion) and where it rests within 6 px of a threshold it takes
  `cat.cyclePoints(...)` of that threshold exactly. A cursor changed by anyone else ends the coasting. Horizontal
  wheel = scrub, vertical wheel = scale. Keys on the focused wave: Left / Right = `stepThreshold`, Page Up / Down =
  one cycle, Home = now.
- **The Sun's lane** (`wave-sun.js`): always the whole sync that holds the instant; drag = a sync per width (into
  the neighbouring syncs through `cat.syncByNumber`), click = that place, Left / Right = one Helion, Page = one sync.
  Its height follows its width (`sunLaneBox`): the marks keep their distance from arcs of any size.
- **Tumblers** (`wave-panels.js` `makeTumbler`): `role="spinbutton"`; drag (18 px a unit, up = later), wheel, Up /
  Down, Page Up / Down (five); a focused or touched tumbler becomes `selected` (its neighbours are ghosted). The nine
  terms step with `stepTerm`, the six Earth fields (EARTH mode: the date-time line itself) with `stepCivil`.
- **NOW** (`.wave-now`, beside MOMENT): lit while `store.away` is false, else the signed span from `store.now()`
  and `store.returnToNow()`. On a phone the shell's own `.now-mark` is hidden on this screen (wave.css); on a
  desktop it stays in the rail.
- **GO TO** (`.goto-input`): Enter → `parseMoment`; `OUT OF CATALOGUE` only for `FRC_ERR_RANGE`; everything else
  the core or the binding refuses (`PARSE`, `ARG` "ε#6", "α#0", a NUL, `BUFFER`), text over `MOMENT_MAX_LENGTH`
  (200, also the field's `maxlength`) and an Earth day the calendar does not have ("31 FEB") is `NOT A MOMENT`.
  The field is set in 16 px type and drawn scaled (`--goto-scale`: mobile Safari zooms into a field under 16 px);
  its caret does not blink (`caret-animation: manual`, else `shell/steady-caret.js` draws one).
- **Arrangements:** phone = the positions of DESIGN.md section 7 (held by `test/browser-wave.test.js`), except the
  MOMENT caption, 10 px higher than the render so that the ghost above any selected tumbler is clear of it; a short
  screen takes rows from the list first (`fitRows`), then height from the wave. Desktop = the moment and the Sun
  side by side (`.wave-top`, wrapping when narrow), the wave across the whole screen, the list in two columns.

## 5. The binding: `public/lib/fractonica.js`

```js
import { load, Unit, Quarter, DateForm, PentadForm, Medium, Band, Quantity, PathOp, LevelKind, CivilForm, Status,
         FractonicaError, Fractonica, Catalogue } from './lib/fractonica.js';
const frc = await load();          // one per page; no state between calls
const cat = frc.saros141;          // everything read at an instant hangs off a Catalogue
```

**Conventions**

- **Naming:** `frc_foo_bar(cat, ...)` is `cat.fooBar(...)`; without a catalogue it is `frc.fooBar(...)`.
  `frc_format_x` is `formatX` and returns a string.
- **Instants:** BigInt Unix microseconds. `FRC_TIME_NONE` is `null` in every result. A Number passed as an instant
  is refused (it is nearly always seconds or milliseconds by mistake).
- **Levels:** zero-based, 0 = Alpha. Clock readings exist for 0..21 (`frc.constants.CLOCK_MAX_LEVEL`), static facts
  for 0..62. `depth = level + 1` is display only.
- **64-bit values** are BigInt in results; a 64-bit argument may also be a safe integer Number.
- **Structs** are plain frozen objects, fields in camelCase. Renamed: `trit` → `trits`, `digit` → `digits`,
  `quarter[4]` → `quarters`, `next_change` → `nextChange`, `drift_us` → `driftUs`. Flags are booleans.
- **Phases:** `phase` is the exact `frc_frac_t` (uint32, 0.32 fixed point); `fraction` beside it is the same as a
  Number in [0, 1) (by `frc_frac_to_double`). Draw with `fraction`; decide with `quarter`, indices and instants.
- **Errors:** a negative status is thrown as `FractonicaError` with `.status` (`"FRC_ERR_RANGE"`, `"FRC_ERR_ARG"`,
  `"FRC_ERR_OVERFLOW"`, `"FRC_ERR_BUFFER"`, `"FRC_ERR_PARSE"`, `"FRC_ERR_REFUSED"`), `.code` and `.call` (the C
  function, or `"fractonica.js"` for an argument refused before the call). Outside the catalogue every reading
  throws `FRC_ERR_RANGE`: test `cat.contains(t)` first.
- **Grouped numbers** in the core's text use U+202F NARROW NO-BREAK SPACE (`"58 500"` is `58 500`); minus is
  U+2212. Show the text as it comes.

**Module exports**

| Export | |
|---|---|
| `load(source?)` → `Promise<Fractonica>` | no argument: `../fractonica.wasm` beside the file (fetch in a browser, file read in Node). Also takes a URL, string, bytes, `WebAssembly.Module`, `Response` or a promise of one |
| `Fractonica`, `Catalogue` | the two classes (made by `load` / `frc.catalogue`, not with `new`) |
| `FractonicaError` | `{ status, code, call }` |
| `Status`, `LevelKind { MAJOR, UNIT, BETWEEN, SUB }`, `Unit { ALPHA, BETA, GAMMA, DELTA, NUCLIDE, HELION, PREON, FLAVON, BLINK }`, `Quarter { PEAK, NODE, VALLEY, END }`, `PentadForm { FULL, SHORT, ASCII, NUMERAL }`, `DateForm { FULL, SHORT, LETTERS, SHORT_LETTERS }`, `Medium { VACUUM, BOUNDED, DIAMOND, WATER, AIR, NERVE, CHEMICAL }`, `Band { NONE, AUDIBLE, RADIO, MICROWAVE, INFRARED, VISIBLE, ULTRAVIOLET, XRAY, GAMMA }`, `Quantity { TIME, FREQUENCY, LENGTH }`, `PathOp { MOVE, LINE, CUBIC, DOT }`, `CivilForm { DATE_TIME, DATE, TIME, MINUTE, DAY_MONTH, DAY_MONTH_TIME, MONTH_YEAR, OFFSET, DAY_MONTH_YEAR, DAY_MONTH_SECONDS, ISO_DATE, WEEKDAY, MONTH, YEAR }` | frozen enum objects, numbers; checked against the module at load |

**`frc` properties:** `version` ("0.2.0"), `specVersion` ("2.2.0"), `saros141` (Catalogue), `referenceInterval`
(`{ num: 568972877000n, den: 1n }`, the scale SPEC's tables use), `constants` (`LEVEL_COUNT` 63, `CLOCK_MAX_LEVEL`
21, `SEQUENCE_LENGTH`, `LEVEL_NONE`, `MAX_STROKES` 5, `MAX_DIGITS` 4, `SYNC_LEVEL` 6, `SYNC_CYCLES` 19, `SYNC_DAYS`
4, `UNIT_COUNT` 9, `RATE_COUNT` 11, `MEDIUM_COUNT` 7, `SCI_DIGITS`, `PREFIX_FACTORS_SIZE` 429, `GLYPH_UNIT` 100, `GLYPH_INK` 30,
`GLYPH_DOT_RADIUS`, `GLYPH_DOT_Y`, `FRAC_HALF`, `FRAC_QUARTER`, `US_PER_SECOND`, `VERSION_*`, `PI` (float32);
BigInt: `US_PER_DAY`, `INTERVAL_REFERENCE_MS`, `GREGORIAN_REFORM_MS`), `layout`, `raw` (the module's exports),
`memory`.

### I need X → call Y

`t` is an instant, `L` a level, `→` the result. Shapes are in section 5.1.

| I need | Call |
|---|---|
| **Time** | |
| the present | `frc.now()` → instant (millisecond grain) |
| an instant from seconds / ms / a Date | `frc.fromUnixSeconds(s)`, `frc.fromUnixMs(ms)`, `frc.fromDate(date)` → instant or null |
| a Date for a timer or the platform zone | `frc.toDate(t)` (microseconds cut) |
| the browser zone's offset at `t` (EARTH) | `frc.utcOffsetSeconds(t)` → seconds east |
| **Catalogue** | |
| is `t` in the clock's domain | `cat.contains(t)`; `cat.first`, `cat.last`, `cat.count`, `cat.series`, `cat.anchor` |
| instant of eclipse k | `cat.instant(k)` → instant or null |
| exact position | `cat.positionAt(t)` → Position; `frc.positionToDouble(position)`; `cat.timeAtPosition(n, d)` |
| another series | `frc.catalogue(instantsMs, series = 0)` → Catalogue (kept for the module's life; make it once) |
| **Hierarchy and names** | |
| children per cycle / cycles per parent | `frc.factor(L)` / `frc.siblings(L)` (a Helion, L 6: 9 children, 11 siblings) |
| P(L) | `frc.prefix(L)` → BigInt or null above 22; `frc.formatPrefix(L)` |
| major / unit / between / sub-Blink | `frc.levelKind(L)` → LevelKind |
| "η" / "Eta" | `frc.formatLevelName(L)` / `frc.formatLevelWord(L)` |
| unit ↔ level | `frc.unitLevel(unit)` → L or null; `frc.unitOfLevel(L)` → Unit or null |
| a unit in Blinks, parts per unit | `frc.unitBlinks(unit)` → BigInt; `frc.unitParts(unit)` |
| "η" / "Helion(s)" | `frc.formatUnitSymbol(unit)` / `frc.formatUnitName(unit, plural = false)` |
| "Peak" / "peak" | `frc.formatQuarter(quarter, lower = false)` |
| **Cycles** | |
| the cycle of L running at `t` | `cat.cycleAt(t, L)` → Cycle (`local` of `siblings` is the sibling counter) |
| a cycle by global index, how many | `cat.cycleByIndex(L, cycle)`, `cat.cycleCount(L)` → BigInt |
| start, peak, node, valley, end | `cat.cyclePoints(L, cycle)` → 5 instants (null beyond the catalogue) |
| the next quarter boundary | `cat.nextThreshold(t, L)` → Threshold `{ name: Quarter, time }` |
| the instant at a phase of a cycle (a scrub) | `cat.timeAtPhase(L, cycle, phase)` → first microsecond at it, or null; a place on screen → phase: `frc.fracFromDouble(fraction)` |
| which of its siblings, "8 of 9" | `frc.formatCyclePlace(cycle)` |
| parent / first child of a cycle | index arithmetic the header allows: `c / siblings(L)`, `c * factor(L)` (BigInt) |
| **Glyphs and odometer** | |
| glyph state of L at `t` | `cat.glyphAt(t, L, strokes)` → Glyph |
| k glyphs and when to redraw | `cat.odometerAt(t, L, strokes, digits)` → Odometer (`digits[]`, `nextChange`) |
| decode a digit to a glyph | `frc.glyphFromIndex(index, strokes)` → Glyph |
| M, number of states | `frc.glyphExtreme(strokes)`, `frc.glyphStates(strokes)` |
| other family / of a bare phase | `frc.glyphIndexDescending(index, strokes)`, `frc.glyphIndexOfPhase(phase, strokes)`, `frc.odometerOfPhase(phase, strokes, digits)` |
| the state shown from a threshold on | `frc.glyphAtQuarter(quarter, strokes)` → Glyph (2 strokes: Peak 4, Node 8, Valley 12, End 0) |
| outline: path operations | `frc.glyphPath(glyph)` → `[{ op: PathOp, points }]`, hundredths of a design unit, y down, origin at the stem's top |
| outline: straight segments | `frc.glyphSegments(glyph, curveSteps = 8)` → `[[x0, y0, x1, y1]]` (no dot) |
| ink bounds | `frc.glyphBounds(strokes)` → `{ minX, minY, maxX, maxY }` |
| **ready to draw** (SVG / canvas) | `frc.glyphSvgPath(glyph, { scale, x, y })` → `{ stroke, fill, lineWidth }`; `frc.glyphPath2D(...)` → Path2D pair. `scale` = px per design unit; stroke `stroke` with `lineWidth`, round caps and joins; fill `fill` (the dot, `""` / `null` if none) |
| **Sun** | |
| the sync at `t` | `cat.syncAt(t)` → Sync (`FRC_ERR_RANGE` in the first / last partial sync too); `helion` = the running Helion's place 0..18 |
| the instant at a phase of a sync | `cat.timeAtSyncPhase(sync, phase)` → first microsecond at it, or null |
| a sync by number | `cat.syncByNumber(n)` |
| sync phase as digits | `cat.syncOdometer(t, strokes, digits)` (reference: 2 strokes, 3 digits) |
| the Pentad | `cat.pentadAt(t)`, `cat.pentadByNumber(sync, index)` → Pentad (`index` 3 is the Hypopentad) |
| "Pentad II", "⬠II·3", "P2.3", "II" | `frc.formatPentad(pentad, form = FULL, withHelion = false)` (`NUMERAL`: "" for the Hypopentad); `pentad.first` = 0 5 10 15 |
| **Notation** | |
| the date at `t` | `cat.dateAt(t)` → FrcDate |
| the instant a date names | `cat.dateToTime(date)` → first microsecond of that Blink |
| write a date; the stamp | `frc.formatDate(date, form = FULL, finest = Unit.BLINK)`; stamp = `DateForm.LETTERS`, `Unit.BLINK` |
| one term of the stamp | `frc.formatDateTerm(date, unit)` → "α#6", "34η", "3ν" |
| read a date | `frc.parseDate(text, context = null)` → `{ date, finest }` (`FRC_ERR_PARSE`) |
| "Trifracton" | `frc.formatOrdinal(n)` |
| the name of a cycle | `frc.formatCycleName(L, cycle, shortForm = false)`: "Delta Trifracton", "ε#5 34η", short "δ#3", "34η" |
| **Spans and rates** | |
| a span between two instants | `cat.spanBetween(t1, t2)` → Span |
| the length of a level's cycle | `frc.spanOfLevel(L)` → Span |
| a span as text / as counts | `frc.formatSpan(span, maxParts = 0)` ("6ι 43λ"; 0 means 2 parts; counted greedily, never rounded up; "<0.001ν" for any non-zero span under a thousandth of a Blink), `frc.spanParts(span, maxParts = 9, keepZeros = false)` → `[{ unit, count }]` |
| a span with its direction / in one unit | `frc.formatSpanSigned(span, maxParts = 0)` ("+6ι 43λ", "−20ι 21λ"), `frc.formatSpanInUnit(span, unit)` ("−6 235λ": the drift at vector A, cut toward zero) |
| when a countdown's text changes | `cat.spanNextChange(t, boundary, maxParts = 0)` → instant, or null when t >= boundary |
| when an elapsed span's text changes (a signed span past zero) | `cat.spanNextChangeSince(origin, t, maxParts = 0)` → instant (origin + 1 at the origin), or null when t < origin or nothing changes before the catalogue ends; in the app `frame.spanChange(instant)` picks one of the two |
| time-lapse presets | `frc.ratePreset(i)` → Rate, `frc.formatRate(rate)` |
| cycles per Blink | `frc.levelPerBlink(L)` → `{ num, den }` (to level 35), `frc.formatPerBlink(num, den)` |
| **Pure wording** (no Earth unit) | |
| a grouped count | `frc.formatCount(n)` → "58 500"; signed `frc.formatCountSigned(n)` → "−3" |
| what a level is | `frc.formatLevelKind(kind)` → "major", "unit", "between", "sub-Blink" |
| "9 θ", "11 in ζ", "77 in ε" | `frc.formatLevelChildren(L)` (L ≤ 61), `frc.formatLevelInParent(L)` (L ≥ 1), `frc.formatUnitInParent(unit)` |
| P(L) and its factors | `frc.formatPrefixFactors(L)` → "125 125 = 5 · 13 · 5 · 5 · 7 · 11" (every level; 62 is 428 bytes) |
| a cycle counted in a unit | `frc.formatLevelInUnit(L, unit)` → "58 500ν", "36ι" (L ≤ 12, unit not coarser than L) |
| a rung's rate | `frc.formatLevelRate(L, digits = 0)` → "2 772 pB", "1.420 × 10¹⁴ pB" (digits 4), "1 per 58 500 Blinks" |
| a length as a span of light | `frc.formatLightSpan(L, speed, withWord = false)` → "24ι 1λ", "6.15χ light"; the word alone `frc.formatLightWord()` |
| **Ladder** (EARTH figures) | |
| the scale to lay the ladder from | `cat.intervalAt(t)`, `cat.intervalMean()`, `frc.intervalOfAlphaMs(ms)`, `frc.referenceInterval` → `{ num, den }` ms |
| period / frequency / length, exact digits | `frc.period(L, interval)`, `frc.frequency(L, interval)`, `frc.length(L, interval, speed)` → Sci |
| the same as text | `frc.formatPeriod(L, interval, digits = 0)`, `frc.formatFrequency(...)`, `frc.formatLength(L, interval, speed, digits = 0)`, `frc.formatQuantity(sci, Quantity, digits = 0)` (0 means 4 digits) |
| the same as a Number | `frc.periodSeconds(L, interval)`, `frc.frequencyHz(L, interval)`, `frc.lengthMetres(L, interval, speed)`, `frc.sciToDouble(sci)` |
| a medium | `frc.mediumSpeed(medium)` → `{ num, den }` m/s; `frc.formatMediumId / Name / Phase(medium)` |
| the band of a level | `frc.band(L, interval)` → Band; `frc.formatBand(band)` ("no band" for NONE); the edges `frc.bandEdges(band)` → `{ low, high }` Sci hertz (FRC_ERR_ARG for NONE) |
| device ticks / phase step | `frc.deviceTicks(L, interval, rate)`, `frc.deviceStep(L, interval, rate, bits)` → BigInt (`FRC_ERR_REFUSED`) |
| **Arcs** | |
| a child arc of a carrier | `frc.arcChild(parent, m, local, odd)` → Arc |
| a point on an arc | `frc.arcPoint(arc, fraction)` → `{ x, y }` |
| the wave's root half-cycles | `frc.arcWaveRoot(half)` → Arc |
| trace part of an arc on a canvas path | `frc.traceArc(ctxOrPath2D, arc, from = 0, to = 1, move = true)` |
| part of an arc as SVG path data | `frc.arcSvgPath(arc, from = 0, to = 1)` |
| the core's sine / cosine | `frc.sin(radians)`, `frc.cos(radians)`; `frc.constants.PI` |
| **Earth** | |
| civil fields at an offset | `frc.civilFromTime(t, utcOffsetSeconds = 0)` → Civil (`weekday` 0 = Monday) |
| fields → instant | `frc.timeFromCivil(civil, utcOffsetSeconds = 0)` → instant or null |
| ISO 8601 text | `frc.formatCivil(civil, utcOffsetSeconds = 0)` → "2026-10-08T12:00:00.000Z" |
| Earth wording | `frc.formatCivilText(civil, utcOffsetSeconds, CivilForm.X)` → "THU 8 OCT 2026 · 12:00:00", "12:56", "9 OCT 01:34", "UTC+5:30" (civil may be null for OFFSET; an offset of ±86 400 s or more is `FRC_ERR_ARG`; a negative year is "−0044" in every form but ISO_DATE's "-0044-03-15"); `frc.formatDuration(us, maxParts = 0)` → "23 min 53 s" (rounded once, half up) |
| a typed Earth date | `frc.parseCivil(text)` → `{ civil, offset \| null }` (`FRC_ERR_PARSE`, also for a tab or newline, "THU8 OCT 2026" and a 'T' after a worded date; `FRC_ERR_RANGE` for "31 FEB"; "THU , 8 OCT 2026" is taken); `frc.civilValidate(civil)` → boolean |
| **Text** | |
| plain ASCII of any core text | `frc.toAscii(text)` |
| table building only | `frc.julianFieldsToUnixMs(ms)`, `frc.fracToDouble(phase)` |

### 5.1 Shapes

```
Cycle     { level, quarter, clipped: bool, local, siblings, cycle: BigInt, phase: uint32, fraction: 0..1, start, end }
Threshold { name: Quarter, time: instant | null }
Glyph     { index, value, derivative: -1|0|1, dotted: bool, strokes, trits: number[strokes] }   trits[0] is drawn at the top
Odometer  { count, strokes, states, digits: number[count], nextChange: instant | null }
Sync      { sync, quarter, helion: 0..18 (0 by number), phase, fraction, start, end, nominal, driftUs: BigInt, next: Threshold }
Pentad    { sync, index: 0..3, helion: 1..5 (0 by number), helions: 5|4, first: 0|5|10|15, start, end }
FrcDate   { alpha, beta, gamma, delta, epsilon, eta, iota, lambda, nu, quarters: number[4] }
          ordinals from 1 for alpha..epsilon and eta; counts from 0 for iota, lambda, nu
Position  { ordinal, num: BigInt, den: BigInt }
Span      { negative: bool, blinks: BigInt, frac: uint32 }       SpanPart { unit: Unit, count: BigInt }
Rate      { unit: Unit, count, factor: BigInt }
Interval, Speed  { num: BigInt, den: BigInt }                    Sci { mantissa: BigInt, exp10 }
Arc       { cx, cy, radius, start, sweep }     radians, like atan2 with y DOWN; negative sweep = counter-clockwise
Civil     { year, month, day, hour, minute, second, weekday, microsecond }
```

### 5.2 Recipes for the app

**The ring of a focused level F (DESIGN.md section 5).**

```js
const pi = frc.constants.PI;
const carrier = { cx, cy, radius: R, start: -pi / 2, sweep: 2 * pi };     // 12 o'clock, clockwise
const slots = 2 * frc.factor(F);                                          // half-cycles of level F+1
const child = (j) => frc.arcChild(carrier, slots, j, j % 2);              // even bulge outward, odd inward
const grandchild = (j, k) => frc.arcChild(child(j), frc.factor(F + 1), k, (j * frc.factor(F + 1) + k) % 2);
```

The geometry depends on the focus and the size only, not on time: compute it once per focus (about 0.4 µs per
`arcChild`) and keep it. What changes with time is the fill. The elapsed half-cycle and how far it is come from
the core: `const c = cat.cycleAt(t, F + 1)`; its half index inside the carrier is
`2 * c.local + (c.phase >= frc.constants.FRAC_HALF ? 1 : 0)` and its progress `(c.phase << 1) >>> 0` as a
`frc_frac_t` (the header's rule for half-cycles; `frc.fracToDouble` turns it into the Number for `traceArc`).
Draw elapsed with `frc.traceArc(ctx, arc, 0, f)` and to-come with `frc.traceArc(ctx, arc, f, 1)`.
In the app this is `buildNest` + `ringSteps` + `nestPath` + `paintNest` (section 4.4); do not write it again.

**A glyph.** `const g = frc.glyphSvgPath(frc.glyphFromIndex(digit, 2), { scale: u, x, y })`, then on a canvas
`ctx.lineWidth = g.lineWidth; ctx.lineCap = ctx.lineJoin = 'round'; ctx.stroke(new Path2D(g.stroke)); if (g.fill)
ctx.fill(new Path2D(g.fill));` (or `frc.glyphPath2D`). Cache by `(digit, strokes, scale)`.

**When to redraw.** Collect the instants the core gave for what is on screen and sleep until the earliest:
`odometerAt(...).nextChange` for each odometer shown, `nextThreshold(t, L).time` for bezel words and countdowns,
`cycleAt(t, 12).end` for the Blink count of the stamp, `syncAt(t).next.time`. A returned instant already shows the
new state. `null` means nothing comes later (the catalogue's closing instant). For the timer:
`setTimeout(draw, frc.toDate(next).getTime() + 1 - Date.now())`. In the app `model/clock.js` does this: a screen
only returns `{ next }` from `update` (section 4.2).

**A countdown.** `frc.formatSpan(cat.spanBetween(t, cat.nextThreshold(t, L).time))`. At vector A: `η END IN 6ι 43λ`.

**Earth translation of an instant.** `const off = frc.utcOffsetSeconds(t); const c = frc.civilFromTime(t, off);`
then `frc.formatCivilText(c, off, CivilForm.DATE_TIME)` (or another form; the zone's abbreviation is the
platform's, appended by the app). In the app: `model/earth.js` chooses the forms; never compose a date.

## 6. The wasm module and `wasm/glue.c`

- **Freestanding:** `--target=wasm32 -ffreestanding -nostdlib`, `-Os`, sections garbage-collected, stripped. The
  feature set is pinned (`mvp` + mutable-globals, sign-ext, nontrapping-fptoint, bulk-memory). Linked WITHOUT
  `--allow-undefined`: a missing symbol is a link error, never an import. `check-module.mjs` then proves: no import
  section, the exact export set, fixed memory, no custom sections.
- **Memory:** fixed at 3 pages. The stack (64 KiB) sits below the data, so overflowing it traps. There is no heap.
  `frcw_alloc` bumps inside a 16 KiB scratch block that the binding resets at the start of every call
  (`Machine.begin`); `frcw_keep` bumps inside a 32 KiB block that is never reset (custom catalogues: about 44
  series of 90 eclipses).
- **Layout table:** `FRCW_LAYOUT` in glue.c lists every field of every public struct; the compiler turns it into
  offsets, sizes and type letters (`_Generic`) plus the names. The binding reads it at load (`Machine.#readLayout`)
  and names the fields it needs (`this.S = { cycle: need(...), ... }`). Nothing about a layout is typed into
  JavaScript except field names.
- **Constant table:** `FRCW_CONSTANTS` carries every macro and enumerator the binding uses. The enum objects written
  in fractonica.js are compared with it at load.
- **By-value structs:** functions that take or return `frc_interval_t`, `frc_speed_t`, `frc_arc_t` by value have a
  pointer form `frcw_<name>` in glue.c section 4; the binding calls those.
- **Sinks:** `frcw_glyph_path` / `frcw_glyph_segments` collect the callbacks of `frc_glyph_path` /
  `frc_glyph_segments` into a buffer (callbacks cannot be imports).
- **`FRCW_ABI`** in glue.c and `GLUE_ABI` in fractonica.js must match; bump both when a table format, a record size
  or the meaning of an `frcw_*` export changes.

### Recipe: the core gained (or changed) a function

1. `make wasm`. `wasm/exports.txt` updates itself from the header. If the function takes or returns a struct by
   value, add its pointer form to glue.c section 4 first.
2. Wrap it in `public/lib/fractonica.js` (on `Catalogue` if it takes a catalogue, else on `Fractonica`), with a
   JSDoc line; declare it in `fractonica.d.ts`.
3. Add it to `test/native/dump.c` AND `test/crosscheck-lines.js` (same line, same format), and a literal example to
   the suite it belongs to.
4. `make check`. `module.test.js` fails until steps 1 and 2 are done ("fractonica.js calls every function of the
   header", "d.ts declares exactly the methods").

### Recipe: the core changed a struct or an enum

1. Update `FRCW_LAYOUT` / `FRCW_CONSTANTS` in glue.c (a field of a new C type needs a letter in `FRCW_TYPE` and a
   case in `Machine.get` / `Machine.set`). `make wasm`.
2. Update the reader / writer of that struct in fractonica.js section 4, the `need(...)` list, the enum object, the
   d.ts, and the snapshot in `test/layout.test.js`.
3. `make check`. `layout.test.js` compares the tables with the header's text, so a forgotten field fails there.

## 7. Tools

- **`tools/serve.mjs`**: `startServer({ root, port, host, quiet })` → `{ url, port, close }`. MIME types for html,
  js, css, json, wasm, svg, png, ico, webmanifest. Never serves outside its root. `Cache-Control: no-cache`.
- **`tools/chrome.mjs`**: `launchChrome()` → `{ open(url, { width, height, scale, timezone, reducedMotion }), close }`;
  a page has `ready`, `evaluate(expression)`, `screenshot(file)`, `console` / `problems()` (errors, warnings,
  uncaught exceptions, failed requests), `click(x, y)`, `drag(x0, y0, x1, y1, steps)`, `key('ArrowRight')` (arrows, Escape, Tab, Enter, Home, End, Page Up / Down),
  `send(method, params)` (any DevTools command), `settle()`, `close()`. It exists because `chrome --headless
  --screenshot --window-size=393,852` lays the page out 500 px wide (the new headless mode has a minimum window
  width) and crops it: phone layouts must be shot through the DevTools protocol's device-metrics override.
- **Readiness contract:** the page sets `data-ready="1"` on `<html>` when its first frame is drawn. `chrome.mjs`
  waits for it (8 s at most), `shoot.mjs` reports it when it never comes. `app/main.js` sets it after the first pass.
- **`tools/shoot.mjs`**: `<screen>-<layout>-<mode>.png` for every screen × layout (phone 393 × 852 at 3×, desktop
  1280 × 800 at 2×) × mode, plus `now-<layout>-pure-f<NN>.png` at focus 0 3 5 6 7 9 12 13,
  `ladder-<layout>-<mode>-l<NN>.png` turned to rungs 0 29 62 and `lens-<layout>-<mode>-l<NN>.png` on levels 0 12 13
  30 62 (the plain ladder and lens views are at the Helion), `wave-<layout>-<mode>-f<NN>.png` at focus 3 and 9 and
  `wave-<layout>-<mode>-away.png` with a scrubbed cursor (`&at=`, 9 200 s after the frozen present: the NOW mark
  shows `+18ι 13λ`), all at `?t=1791460800` in zone UTC. Options `--t`, `--scale`, `--out`, `--tz <IANA | local>`, `--query "theme=basalt"`; other words
  filter (`now phone` = names with both parts; a full name picks one view). Console errors, warnings and uncaught
  exceptions are printed and make it exit 1.
- **`tools/measure.mjs`**: prints left / right / top / bottom / centre / text baseline of elements by selector at a
  given viewport. DESIGN.md section 7 gives baselines; this is how the NOW screen was held to them.

## 8. Tests: what each proves

| Suite | Proves |
|---|---|
| `spec-vectors.test.js` | SPEC 12 A, B, C, anchor: indices, digits, cycles, thresholds, sync, drift, typed in literally |
| `notation.test.js` | SPEC 15.6 literally; 15.2 – 15.5 examples; Pentad forms (NUMERAL, `first`, `sync.helion`); the pure wordings (kind, signed count, "8 of 9", "9 θ", "11 in ζ", "77 in ε", prefix factors, rates "1 per 25 Blinks"); stamp terms, signed spans, spans in a unit, `spanNextChange` and `spanNextChangeSince`; glyph at a quarter, `timeAtPhase`, `timeAtSyncPhase`; no Earth unit in pure text |
| `ladder.test.js` | SPEC 16.5: exact rationals rounded to 17 digits with BigInt and compared; 16.1 rows ("no band" where SPEC prints a dash); 16.2 band edges; media; devices |
| `roundtrip.test.js` | date ↔ instant, stamp ↔ date, civil ↔ instant, cycles / points / thresholds agree, 400 instants each |
| `crosscheck.test.js` | **the marshalling proof**: `native/dump.c` (host cc, `-ffp-contract=off`) and `crosscheck-lines.js` print every kind of answer for the static facts and ~330 instants; the outputs must be equal byte for byte (floats as IEEE bits) |
| `layout.test.js` | layout and enum tables = the header's text; the wasm32 snapshot; fields aligned and inside |
| `module.test.js` | no imports, fixed memory, stripped, under 64 KiB; exports = header; binding wraps all; d.ts = js |
| `memory.test.js` | 10,000 mixed calls: memory, scratch and keep unchanged; memory cannot grow; clean failure when scratch is short |
| `binding.test.js` | error shape, argument checks, `null` for no-instant, frozen results, time helpers, glyph / arc helpers, the Earth wording (civil text forms, a negative year with U+2212, the offset's ±1 day limit, durations, validation, `parseCivil` with what 0.2.0 refuses and takes) |
| `serve.test.js` | MIME types, 404 / 405, no path escape, the binding loading over HTTP (streaming) |
| `app.test.js` | the app without a browser: URL contract (instants to the microsecond, the Date range), store (precedence, clamping, cursor, the history: push per screen, popstate, Back), the Content-Security-Policy and its script hash, no sign composed outside a shim, the one shim by name, the closing instant's countdowns, token table (two themes, one shape; CSS variables), **no colour / font literal and no trigonometry outside their one place**, what the instrument and NOW READ at vector A (beads 8 of 9, ζ 1 of 11, the Sun's slot, the path to now), geometry (the design's radii; arcs of every focus stay between bezel and rings), Earth wording, every focus at the catalogue's edges, outside the catalogue |
| `catalogue.test.js` | the LADDER and the LENS without a browser: `rungFacts` / `rungEarth` against SPEC 16.1 and the pure wordings; **the band rule from `frc.bandEdges` against `frc.band` for every rung of four intervals**; `describeRung` and `readLens` pure-safe for all 63 rungs; the lens at vector A (thresholds `+6ι 43λ`, `−20ι 21λ` ..., glyph states 0 4 8 12, the seven light spans of the header); SPEC 16.4 devices; outside the catalogue; the wheel's geometry |
| `wave.test.js` | the WAVE and time travel without a browser: `readWave` at vector A (the nine terms and the selected one's neighbours, the Helion's thresholds, the Sun's lane: sync 4 820, half-Helion 13 of 38, the Pentads with the Hypopentad's four, the list of screen5.png) and pure-safe at every focus; EARTH wordings; away and outside the catalogue; **`stepTerm`: every term up and down as literals, carries, the catalogue's edges, and forth-and-back at 300 instants**; `stepCivil`, `stepThreshold`, `parseMoment` (Earth dates only in EARTH mode); **the scrub read back through the core** (`cycleAt(timeAtPhase(fracFromDouble(f))).fraction` is `f`, a microsecond late at most) at eight levels; `waveSteps` against `floor(progress × arcs)`; a wave cell joined end to end with the right parities and fitted to its band |
| `browser-wave.test.js` | headless Chrome: the WAVE at the design's positions on the phone; scrubbing with a pointer (20 px = 20 px of time, a release 3 px from the Helion's END takes the END exactly, a thrown wave coasts and rests, NOW ends the coasting, none under reduced motion), keys on the wave and the Sun's lane; tumblers by key, drag and wheel with the core's carries and the catalogue's edges; GO TO; the scrubbed moment on NOW, LADDER and LENS; the limb re-scaling the wave (same picture back at the Helion); **pure mode at focus 0 3 9 13, away and outside the catalogue, on both layouts**; EARTH tumblers; the desktop arrangement; repaints (frozen: none) |
| `browser-catalogue.test.js` | headless Chrome: the ladder's rows and positions at zeta-1, turning it by keys / wheel / drag / a row / the spine, Enter and Escape, the instrument-focus mark, F, double click, long press; EARTH replacing (phone) and beside (desktop) without columns colliding; the lens at the design's positions, its limb over 63 rungs, the lineage, swipe down; pure mode at every kind of rung on both screens and layouts; EARTH rows and devices; repaint rates (the ladder: none) |
| `browser-journey.test.js` | headless Chrome, one connected session (also: the finest focus on a desktop within 30 passes a second and 35 %): NOW at A, B, C with every figure compared with the core asked in Node (not literals); limb by key and drag, mode toggle and back, every sigil, the lens's words, a tumbler step, a wave scrub, the scrubbed moment on NOW, the return mark, Tab order, Enter on a sigil and on the ladder's wheel, Escape; a live clock moves (NOW phone, WAVE desktop); an idle NOW at the Helion under 10 % main-thread time (prints the figure) |
| `browser-hosting.test.js` | the site behind a sub-path (`/a/deep/sub/path/`): every request under it and answered; then offline: every screen and EARTH mode with no request, and a reload answered by the service worker |
| `browser-firefox.test.js` | headless Firefox: every screen x layout x mode ready, vector A, no console problem, nothing cut by the edge; keys, toggle, sigil. Skips without Firefox |
| `zones.test.js` | EARTH mode off UTC, one child process per zone (`zone-probe.mjs`): vector A's date line in Kolkata, New York, St John's, Chatham, Lord Howe; the zone named in English under German, French, Russian; **the civil hour ticks of a sync held against the platform's own whole local hours** across a whole-hour and a half-hour change of offset |
| `browser-device.test.js` | headless Chrome, the stage-6 review findings: touch targets by `elementFromPoint` (44 px, or shared where controls stand closer), no selection but the reading, Back and Escape through the history, a link that brings the same Blink back, `?t=` beyond a Date, a wall clock set back 5 s (NOW and LENS text follow), EARTH in Kolkata / New York / Berlin (de-DE), GO TO messages and the 16 px field, the title, named Tab stops, the closing instant; every page with a clean console (a CSP violation is a console error) |
| `browser.test.js` | headless Chrome: NOW at 393 × 852 reads vector A; **pure mode leaves no Earth text in any text, aria-label or title of any screen**; Earth mode's lines; keys, limb tap and drag, wheel, pinch, centre → lens, Escape, sigils, Tab order and focus ring; the cursor and the NOW mark on every screen; out of catalogue (nothing lit); a running clock (repaints per second); Basalt; a clean console |

Tests may do arithmetic (they hold the core against SPEC's figures). Nothing under `public/` may.
Do not weaken a test to make it pass; when the core's behaviour changes on purpose, change the literal and say why.

## 9. Things that will bite you

- **`factor` vs `siblings`.** A Helion (level 6) has `factor(6)` = 9 children (θ) and is one of `siblings(6)` = 11
  in its parent (ζ). The ring of a focus F has `2 * factor(F)` first-level arcs.
- **Spans are never rounded up.** At vector A the θ node is `43λ 21ν` away (`43λ` with one part). The design
  brief's "44λ" is that figure rounded; the core does not round a count up (SPEC 15.4), and neither do we.
- **U+202F.** Grouped numbers contain NARROW NO-BREAK SPACE, not a space. In tests write ` `.
- **`frc_sync_at` is not defined everywhere:** in the first and last partial sync it throws `FRC_ERR_RANGE` while
  `pentadAt` still answers.
- **A Number is not an instant.** `cat.cycleAt(1791460800, 6)` throws; use `frc.fromUnixSeconds`.
- **Dates before 1970 and `toDate`.** The microseconds are cut towards the past (floor), not towards zero.
- **`Path2D` does not exist in Node.** `glyphPath2D` throws there; tests use `glyphSvgPath`.
- **Levels 19..21** have cycles shorter than a microsecond: `start` may equal `end` (read the note on `frc_cycle_t`).
- **`node --test test/`** would run the helper files too; the Makefile passes `'test/*.test.js'`.
- **The custom-catalogue store is finite** (32 KiB, never freed). Make a catalogue once, not per frame.
- **`text-transform: uppercase` capitalises Greek** (η becomes Η). Engraved words are uppercased with `engraved()` /
  `setWords()`, which leave Greek alone.
- **localStorage survives between pages of one Chrome run.** A browser test that relies on the default focus or mode
  must say `&focus=6&mode=pure` in its URL.
- **Canvas shadows ignore the canvas transform.** Glow is `shadowBlur = 2 σ × devicePixelRatio` (`drawing/canvas.js`).
- **A tap on the limb is read against what is drawn**, and the letters glide for 180 ms after a change: wait before
  a synthetic tap in a test.
- **An arc's "odd" flag is the parity of its GLOBAL half index**; `buildNest` carries it down the layers. Passing
  `j % 2` by hand is right only for the children of a ring.
- **The reference instrument is the Helion's.** `heroShape` shrinks the carrier and the bezel for levels with few,
  large arcs; do not hard-code 0.71 R or 1.37 R outside `geometry.js`.
- **CSS `zoom` scales the NOW text block** (`--column-scale`). Lengths measured inside it with
  `getBoundingClientRect` are already scaled; lengths you set in CSS inside it are not.
- **The phone's screen box ends above where the design draws.** `#screen` ends where the sigils' box begins (y 725
  in PURE mode, 744 in EARTH mode: app.css gives the sigils less padding there, their marks stay at y 772). The
  ladder's last row, the lens's limb and the last rows of the wave's list stand lower, so those three screens set
  `#screen { overflow: visible }` and a negative `bottom` (two values, one per mode) in their stylesheets.
- **A scrub sets the cursor on every frame.** Anything that reacts to `'cursor'` in `changed` runs sixty times a
  second while the wave is dragged: keep it cheap. The address bar is written at most four times a second then
  (`model/store.js` `writeUrlFor`): a test that reads `at=` from `location.search` after a scrub waits 350 ms.
- **A released drag coasts.** In a browser test, a drag whose last move is immediately followed by the release is a
  throw; rest 160 ms before the release for a plain drag (`dragX` in `test/browser-wave.test.js`).
- **The civil fields of the core are unsigned.** `frc.timeFromCivil` takes day 0 and month 0 (and any overflow
  upward) but no negative field: `stepCivil` steps hours, minutes and seconds as elapsed time for that reason.
- **A wave carrier is a HALF-cycle.** `buildNest(..., { ring: false, parity: half })`; the second half of a cycle
  with an odd factor begins on an odd arc (`nest.lead`), which `paintNest` needs to pair arcs into child cycles.
- **An SVG element has no `hidden` property.** `setHidden(svgElement, true)` does nothing visible; use
  `toggleAttribute('hidden', ...)` (the `[hidden]` rule of app.css then applies).
- **`engraved()` / `setWords()` uppercase units too** ("MHz" becomes "MHZ"). An Earth figure inside engraved words
  goes into its own element, written as it comes (`.f-edge`, `.device-rate`).
- **A synthetic PointerEvent cannot be captured.** `capture(element, pointerId)` of `shell/dom.js` tolerates it;
  a bare `setPointerCapture` throws in a test that dispatches its own events.
- **`Object.keys` of an object keyed by enum numbers** comes back in numeric order (peak, node, valley, end), not in
  the order written: the lens's four threshold labels are in that order in the DOM.
- **The ladder's rows lie at equal distances ALONG the rim**, not at equal heights: 280 px of rim is 277 px down.
- **Headless Chrome stops producing frames after a key the page does not take** (an Escape nobody handles, an
  Enter sent as a bare rawKeyDown): every later `settle()` or animation-frame promise then hangs until the test
  times out. `tools/chrome.mjs` sends Enter as a keyDown with its text; in a test, press only keys the app handles.
- **The service worker** (`public/sw.js`) is registered on every http page, tests included. It is network first,
  so it never serves a stale file while the server answers; to see what it kept: `caches.open('fractonica')`.
  Each test Chrome uses a fresh profile, so nothing carries over between runs.
- **Labels on a canvas** that can sit near its edge are clamped inside (`place` in `wave-field.js`), and when the
  clamped labels of one cycle would touch, only the next threshold keeps its label.
- **At the catalogue's closing instant** every `nextThreshold().time` is null: lists drop those rows rather than
  show a quarter word with no span.
- **The Content-Security-Policy** (`<meta>` in index.html) allows no style attribute and no inline script but the
  one `file://` notice, by its hash: set styles through CSS classes or CSSOM (`element.style.x = ...`), never
  `setAttribute('style', ...)` or `h(..., { style: '...' })`. Change that inline script and `test/app.test.js`
  prints the new hash to put in `script-src`. A violation is a console error, so `make shoot` fails on it.
- **History:** only a change of screen pushes an entry. A test that counts `history.length` after a screen change
  expects one more; a fake window without `pushState` (test/app.test.js `fakeWindow`) gets replaceState only.
- **Wall clock steps:** a screen that rewrites text only when `frame.t` reaches a due instant must also rewrite it
  when `frame.t` is EARLIER than the instant it last wrote for (now.js `panelsFor`, lens.js `textFor`).
