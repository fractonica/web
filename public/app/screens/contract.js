/**
 * contract.js - what a screen is, and what the shell hands it.
 *
 * A screen is a module at app/screens/<id>/<id>.js that exports
 *
 *     export const screen = { id, mount(host, app) { ...; return { update, unmount }; } };
 *
 * and is listed in shell/shell.js (SCREEN_MODULES). The shell mounts one
 * screen at a time into <main id="screen">, calls `update` on every pass of
 * the scheduler, and `unmount` before the next screen is mounted.
 *
 * THE RULES A SCREEN KEEPS
 *  - It never reads the clock itself: it draws the `frame` it is given
 *    (model/frame.js: every reading of the core at one instant, memoised).
 *    The instant is `frame.t`: the cursor when the user has travelled, else
 *    the present. Outside the catalogue `frame.inCatalogue` is false and
 *    every reading is null: stay engraved, show `outOfCatalogueText`.
 *  - It answers when it needs to be drawn again (see ScreenInstance.update).
 *    No timers of its own for time; requestAnimationFrame only for its own
 *    transitions, and then `animating: true` does the same job.
 *  - State lives in the store. To change the focus, the mode, the screen or
 *    the cursor call the store (store.setFocus, store.setCursor ...); the
 *    change comes back as `changed` in the next `update`.
 *  - In PURE mode it writes no Earth unit, date or clock time anywhere,
 *    aria labels and titles included. Earth text comes only from
 *    model/shim-earth-text.js, behind `store.state.mode === 'earth'`.
 *  - Colours and fonts come from design/tokens.js (`theme()`, CSS variables).
 *
 * WHAT IS THERE TO BUILD WITH
 *  model/frame.js            createFrame, outOfCatalogueText
 *  model/halves.js           halfOf, ringSteps, waveSteps, cycleIndexWithin, cyclesWithin
 *  model/travel.js           stepTerm, stepCivil, stepThreshold, parseMoment: where a step of time travel leads
 *  model/rungs.js            rungFacts, rungEarth: the static facts of a rung of the ladder, as text
 *  drawing/canvas.js         fitCanvas, stroke, fill, disc, ring, line, text, measure, engraved
 *  drawing/arcs.js           ringCarrier, buildNest, nestPath, nowPoint, paintNest, paintNowPoint
 *  drawing/glyphs.js         paintOdometer (canvas), odometerSvg / updateOdometerSvg (DOM)
 *  drawing/seal.js           paintSeal, sealSvgPath, sealGeometry
 *  drawing/counter-ring.js   paintCounterRing, paintEarthRing
 *  drawing/limb.js           paintCurvedLimb, paintStraightLimb (+ hit tests)
 *  drawing/wheel.js          wheelRim, rimPoint, rowOffset, paintRim, paintBandRail (the ladder's great wheel)
 *  drawing/spine.js          paintSpine, spineLevelAt (the whole ladder as a line of ticks)
 *  drawing/live-ring.js      paintLiveRing, paintThresholdMarks (a level's ring drawn small: the lens)
 *  drawing/wave.js           buildWaveCell, fitWaveCell, paintWave (cycles along a line), paintSunLane
 *  drawing/marks.js          sigil, modeRing, pentadMark, beadRow, quarterMark, sunMark
 *  instrument/limb-control.js createLimb: THE control for moving across the scales
 *  instrument/instrument.js  createInstrument: the whole instrument as a component
 *  instrument/reading.js     readInstrument: what a ring shows at a frame
 *  instrument/draw.js        drawInstrument, paintReading
 *  shell/dom.js              h, svg, setText, setWords, setReading, readingNodes
 */

/**
 * What `mount` receives.
 * @typedef {object} App
 * @property {import('../model/store.js').Store} store  state, setters, `subscribe`
 * @property {import('../../lib/fractonica.js').Fractonica} frc  the core
 * @property {import('../../lib/fractonica.js').Catalogue} cat   Saros 141
 * @property {{ add: Function, refresh: () => void, refreshSoon: () => void }} clock  the scheduler; a screen
 *   only needs `refreshSoon()` (ask for a pass after its own box changed)
 * @property {{ set: (centre: { cx: number, cy: number, r0?: number }) => void }} ground  the plate behind
 *   everything: tell it the centre of the screen's main circle (viewport px) and the machining marks follow
 * @property {() => number} insetTop  phone: px to keep free at the top of the screen (status bar and the
 *   corner marks: the mode toggle top right, the NOW return mark top centre)
 */

/**
 * What `mount` returns.
 * @typedef {object} ScreenInstance
 * @property {(frame: import('../model/frame.js').Frame, changed: Set<string> | null) =>
 *            ({ next?: bigint | null, frameMs?: number | null, animating?: boolean } | void)} update
 *   Draw `frame`. `changed`: the store keys that changed since the last pass ('mode', 'focus', 'level',
 *   'cursor', 'layout', 'theme'), or null when only time moved. Return when to be called again:
 *   `next` = the earliest instant at which something shown changes (from the core), `frameMs` = a
 *   delay for continuous arc fill, `animating` = a transition is running (call on the next frame).
 * @property {() => void} unmount  remove everything the screen added and stop what it started
 */

/**
 * @typedef {object} ScreenModule
 * @property {'now' | 'ladder' | 'lens' | 'wave'} id
 * @property {(host: HTMLElement, app: App) => ScreenInstance} mount
 */

export {};
