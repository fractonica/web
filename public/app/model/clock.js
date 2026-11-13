/**
 * clock.js - the scheduler: redraw when something visible changes, never poll.
 *
 * Every view registers one function. On each pass the clock calls it with the
 * instant to show (`store.time()`); the view draws and answers WHEN it needs
 * to be called again:
 *
 *   { next: instant | null,   the earliest instant at which something it shows changes
 *                             (the core's next_change / next threshold / cycle end);
 *                             null = nothing later
 *     frameMs: number | null  for continuous arc fill only: redraw after this many
 *                             milliseconds even though no state changes (the view
 *                             derives it from how fast its finest arc moves)
 *     animating: boolean }    a transition is running (zoom, cross-fade): call again
 *                             on the next animation frame, also when time is frozen
 *
 * The clock then sleeps until the earliest of all answers: a timer for an
 * instant (the returned instant already shows the new state, so the delay is
 * `instant - now + 1 ms`), requestAnimationFrame when the wait is a frame or
 * two. At most 30 passes per second (DESIGN.md section 10). No timer at all
 * while the page is hidden, while time is frozen (?t=) or while a cursor is
 * set: then a pass happens only when the state changes.
 */

/** Never more often than this (30 fps). */
const MIN_PASS_MS = 33;
/** setTimeout cannot hold more than 2^31 - 1 ms; a longer sleep is cut and simply re-asked. */
const MAX_SLEEP_MS = 2 ** 31 - 1;

/**
 * @param {import('./store.js').Store} store
 * @param {{ window?: Window }} [options]
 */
export function createClock(store, { window: win = globalThis.window } = {}) {
  const { frc } = store;
  /** @type {Set<(t: bigint, changed: Set<string> | null) => ({ next?: bigint | null, frameMs?: number | null } | void)>} */
  const views = new Set();
  let timer = null;
  let frame = null;
  let lastPass = 0;
  let running = false;
  let inPass = false;
  /** Keys changed since the last pass (null = a pass caused by time alone). */
  let pendingChange = null;
  /** A pass was asked for by refreshSoon while a frame wait was running. */
  let urgent = false;

  const cancel = () => {
    if (timer !== null) win.clearTimeout(timer);
    if (frame !== null) win.cancelAnimationFrame(frame);
    timer = frame = null;
  };

  function pass() {
    if (!running || inPass) return;
    cancel();
    inPass = true;
    const changed = pendingChange;
    pendingChange = null;
    const t = store.time();
    let next = null;
    let frameMs = Infinity;
    let animating = false;
    urgent = false;
    try {
      for (const view of views) {
        const wants = view(t, changed) ?? {};
        if (wants.animating) animating = true;
        if (wants.next !== null && wants.next !== undefined && (next === null || wants.next < next)) next = wants.next;
        if (Number.isFinite(wants.frameMs)) frameMs = Math.min(frameMs, wants.frameMs);
      }
    } finally {
      inPass = false;
      lastPass = win.performance.now();
    }
    if (pendingChange !== null) {
      // a view changed the state while drawing: show it at once
      frame = win.requestAnimationFrame(pass);
      return;
    }
    if (animating && !win.document.hidden) {
      // a transition the user started (zoom, cross-fade) runs at the display's rate, live or not
      frame = win.requestAnimationFrame(pass);
      return;
    }
    if (!store.live || win.document.hidden) return;
    const untilNext = next === null ? Infinity : frc.toDate(next).getTime() + 1 - Date.now();
    const delay = Math.max(MIN_PASS_MS, Math.min(untilNext, frameMs));
    if (!Number.isFinite(delay)) return; // nothing later: the catalogue's closing instant
    if (delay <= 2 * MIN_PASS_MS) {
      const due = lastPass + delay;
      const tick = (stamp) => {
        if (urgent || stamp + 4 >= due) pass();
        else frame = win.requestAnimationFrame(tick);
      };
      frame = win.requestAnimationFrame(tick);
    } else {
      timer = win.setTimeout(pass, Math.min(delay, MAX_SLEEP_MS));
    }
  }

  store.subscribe((changed) => {
    pendingChange = new Set([...(pendingChange ?? []), ...changed]);
    if (!inPass) pass();
  });
  win.document.addEventListener('visibilitychange', () => {
    if (win.document.hidden) cancel();
    else pass();
  });

  return {
    /**
     * Register a view. It is called on every pass with the instant to show and
     * the set of store keys that changed since the last pass (null when only
     * time moved).
     * @returns {() => void} unregister
     */
    add(view) {
      views.add(view);
      return () => views.delete(view);
    },
    /** Run a pass now (a view's own state changed: a resize, an animation step). */
    refresh: () => pass(),
    /** Ask for a pass on the next animation frame (coalesces bursts: resize, drag). */
    refreshSoon() {
      urgent = true;
      if (frame === null && running) frame = win.requestAnimationFrame(pass);
    },
    start() {
      running = true;
      pass();
    },
    stop() {
      running = false;
      cancel();
    },
  };
}
