/**
 * store.js - the one state store of the app.
 *
 * WHAT IS STATE: which instant is shown (the cursor), in which mode, on which
 * screen, at which focus level, in which layout. Everything else on screen is
 * a reading of the core at `store.time()` and is never stored.
 *
 *   state.mode     'pure' | 'earth'                 remembered (localStorage), in the URL
 *   state.focus    0..13, the instrument's level    remembered, in the URL
 *   state.screen   'now' | 'ladder' | 'lens' | 'wave'   in the URL
 *   state.level    0..62, the rung looked at: the level the lens shows and the rung the ladder is
 *                  turned to; in the URL on those two screens. The lens sets it with store.setLevel
 *                  (the focus follows it up to level 13), the ladder with store.set({ level })
 *                  (the instrument's focus stays where it is)
 *   state.theme    'astrolabe' | 'basalt'           in the URL when not the default
 *   state.cursor   null = the present, else a scrubbed instant (BigInt microseconds);
 *                  global to all screens, clamped to the catalogue (design ruling 7)
 *   state.layout   'phone' (< 700 CSS px wide) | 'desktop'
 *
 * TIME SOURCE: `store.now()` is the present: the platform clock, or the
 * instant of ?t= when time is frozen. `store.time()` is what every screen
 * draws: the cursor when there is one, else the present. `store.live` says
 * whether that instant moves by itself (no cursor, not frozen); the clock
 * scheduler (clock.js) only runs timers then.
 *
 * Precedence at start: URL > localStorage > default. Every change is written
 * back to the address bar, so it is always a deep link (instants to the
 * microsecond: model/url.js). Only changes made through the setters are
 * remembered (a link someone sent you does not overwrite your preference
 * until you touch the control).
 *
 * HISTORY: a change of screen PUSHES a history entry; every other change
 * (focus, level, mode, cursor) REPLACES the current one. So the browser's Back
 * button and the Android back gesture go back a screen (popstate restores the
 * screen and the rung of the entry) instead of leaving the app, and a scrub
 * does not bury the way back under hundreds of entries. `store.back()` (Escape
 * on the lens) goes back through the same history while it has an entry this
 * page pushed.
 */
import { FOCUS_MAX, FOCUS_MIN, MODES, SCREENS, formatUrlState, parseUrlState } from './url.js';

/** Below this width the phone layout is used (DESIGN.md section 7). */
export const PHONE_MAX_WIDTH = 700;

/** While the cursor is being scrubbed the address bar is written at most this often (ms). */
const URL_WRITE_MS = 250;

const STORAGE_KEYS = Object.freeze({ mode: 'fractonica.mode', focus: 'fractonica.focus' });
const DEFAULTS = Object.freeze({ mode: 'pure', focus: 6, screen: 'now', theme: 'astrolabe' });

/**
 * @param {object} options
 * @param {import('../../lib/fractonica.js').Fractonica} options.frc
 * @param {import('../../lib/fractonica.js').Catalogue} options.cat
 * @param {Window} [options.window] injected in tests
 * @param {readonly string[]} [options.themes] valid theme names
 * @returns {Store}
 */
export function createStore({ frc, cat, window: win = globalThis.window, themes = ['astrolabe', 'basalt'] }) {
  const levelMax = frc.constants.LEVEL_COUNT - 1;
  const storage = safeStorage(win);
  const url = parseUrlState(win.location.search, { levelMax, themes });

  const remembered = {
    mode: MODES.includes(storage.get(STORAGE_KEYS.mode)) ? storage.get(STORAGE_KEYS.mode) : undefined,
    focus: parseFocus(storage.get(STORAGE_KEYS.focus)),
  };
  /** The frozen present of ?t=, or null when the platform clock runs (url.js gives instants, Date-safe). */
  const frozen = url.t ?? null;
  const clamp = (t) => (t < cat.first ? cat.first : t > cat.last ? cat.last : t);

  const focus = url.focus ?? remembered.focus ?? DEFAULTS.focus;
  const state = {
    mode: url.mode ?? remembered.mode ?? DEFAULTS.mode,
    focus,
    screen: url.screen ?? DEFAULTS.screen,
    level: url.level ?? focus,
    theme: url.theme ?? DEFAULTS.theme,
    cursor: url.at !== undefined ? clamp(url.at) : null,
    layout: layoutOf(win),
  };
  /** The screen to go back to with Escape from the lens. */
  let previousScreen = 'now';

  function clampOrNull(t) {
    return t === null ? null : clamp(t);
  }

  const listeners = new Set();
  const emit = (changed) => {
    for (const listener of [...listeners]) listener(changed, state);
  };

  /** How many history entries this page pushed above the one it was opened with (see HISTORY above). */
  let depth = Number(win.history?.state?.fractonicaDepth) || 0; // a reload keeps the entry's state
  /** true while a popstate is being applied: that change is already in the address bar, nothing is pushed. */
  let restoring = false;
  /** true while back() shows the previous screen ahead of the browser's own (asynchronous) step back. */
  let ahead = false;

  /** When a move of the cursor alone last wrote the address bar, and a write that is waiting its turn. */
  let scrubWrittenAt = -Infinity;
  let urlPending = null;

  /**
   * Write the address bar now, or soon. A scrub moves the cursor on every
   * frame, and browsers refuse more than a few history writes a second (and
   * say so in the console): moves of the cursor alone are written at most
   * every URL_WRITE_MS, the last one always. Every other change, the return
   * to the present included, is written at once.
   */
  function writeUrlFor(changed) {
    const scrubbing = changed.size === 1 && changed.has('cursor') && state.cursor !== null;
    if (!scrubbing) {
      writeUrl(changed.has('screen') && !restoring);
      return;
    }
    const waited = Date.now() - scrubWrittenAt;
    if (waited >= URL_WRITE_MS) {
      scrubWrittenAt = Date.now();
      writeUrl();
    } else if (urlPending === null) {
      urlPending = setTimeout(() => {
        scrubWrittenAt = Date.now();
        writeUrl();
      }, URL_WRITE_MS - waited);
    }
  }

  /** @param {boolean} [push] a new history entry (a change of screen) instead of replacing the current one */
  function writeUrl(push = false) {
    if (urlPending !== null) clearTimeout(urlPending);
    urlPending = null;
    const search = formatUrlState(
      {
        t: frozen,
        at: state.cursor,
        mode: state.mode,
        screen: state.screen,
        focus: state.focus,
        level: state.level,
        theme: state.theme,
      },
      win.location.search,
      DEFAULTS.theme,
    );
    const address = `${win.location.pathname}${search}${win.location.hash}`;
    try {
      if (push && typeof win.history.pushState === 'function') {
        depth += 1;
        win.history.pushState({ fractonicaDepth: depth }, '', address);
      } else {
        win.history.replaceState({ fractonicaDepth: depth }, '', address);
      }
    } catch {
      // a sandboxed document may refuse; the state still works without a link
    }
  }

  /**
   * Change state. Invalid values are ignored, numbers are clamped, the cursor
   * is clamped to the catalogue. Listeners hear the set of keys that changed.
   * @param {Partial<typeof state>} patch
   */
  function set(patch) {
    const changed = new Set();
    const put = (key, value) => {
      if (value !== undefined && state[key] !== value) {
        state[key] = value;
        changed.add(key);
      }
    };
    if ('mode' in patch && MODES.includes(patch.mode)) put('mode', patch.mode);
    if ('focus' in patch && Number.isFinite(patch.focus)) put('focus', Math.min(FOCUS_MAX, Math.max(FOCUS_MIN, Math.round(patch.focus))));
    if ('level' in patch && Number.isFinite(patch.level)) put('level', Math.min(levelMax, Math.max(0, Math.round(patch.level))));
    if ('theme' in patch && themes.includes(patch.theme)) put('theme', patch.theme);
    if ('layout' in patch && (patch.layout === 'phone' || patch.layout === 'desktop')) put('layout', patch.layout);
    if ('cursor' in patch && (patch.cursor === null || typeof patch.cursor === 'bigint')) put('cursor', clampOrNull(patch.cursor));
    if ('screen' in patch && SCREENS.includes(patch.screen) && patch.screen !== state.screen) {
      previousScreen = state.screen;
      put('screen', patch.screen);
    }
    if (changed.size === 0) return;
    if (changed.has('mode')) storage.set(STORAGE_KEYS.mode, state.mode);
    if (changed.has('focus')) storage.set(STORAGE_KEYS.focus, String(state.focus));
    if (!ahead) writeUrlFor(changed); // the browser's step back writes the address itself
    emit(changed);
  }

  // Back / Forward: the entry's screen and rung come back (the rest of the state stays as it is now)
  win.addEventListener?.('popstate', (event) => {
    depth = event.state?.fractonicaDepth ?? 0;
    const entry = parseUrlState(win.location.search, { levelMax, themes });
    restoring = true;
    try {
      set({ screen: entry.screen ?? DEFAULTS.screen, ...(entry.level !== undefined ? { level: entry.level } : {}) });
    } finally {
      restoring = false;
    }
  });

  // the layout class follows the window
  const media = win.matchMedia?.(`(max-width: ${PHONE_MAX_WIDTH - 0.02}px)`);
  media?.addEventListener?.('change', () => set({ layout: layoutOf(win) }));

  /** @namespace Store */
  const store = {
    frc,
    cat,
    /** Read-only by convention: change it with `set` or the helpers below. */
    state,
    /** The frozen present of ?t= (BigInt microseconds), or null. */
    frozen,
    /** The present: the platform clock, or the frozen instant. */
    now: () => frozen ?? frc.now(),
    /** The instant every screen shows: the cursor, else the present. */
    time: () => state.cursor ?? frozen ?? frc.now(),
    /** true while the shown instant moves by itself (timers are worth running). */
    get live() {
      return state.cursor === null && frozen === null;
    },
    /** true while the cursor is away from the present (the NOW return mark shows). */
    get away() {
      return state.cursor !== null;
    },
    /** Is an instant inside the clock's domain? Outside it nothing can be read (ruling 7). */
    inCatalogue: (t) => cat.contains(t),
    set,
    setMode: (mode) => set({ mode }),
    toggleMode: () => set({ mode: state.mode === 'pure' ? 'earth' : 'pure' }),
    setFocus: (level) => set({ focus: level }),
    /** One level finer (+1) or coarser (-1). */
    stepFocus: (delta) => set({ focus: state.focus + delta }),
    /**
     * The level the lens shows (0..62). The instrument's focus follows it
     * while the level is one the instrument can focus (0..13); deeper rungs
     * are inspectable only (design ruling 9).
     */
    setLevel: (level) => set(level <= FOCUS_MAX ? { level, focus: level } : { level }),
    /** Left / Right from anywhere: on the lens they step its level, elsewhere the focus. */
    stepScale: (delta) => (state.screen === 'lens' ? store.setLevel(state.level + delta) : store.stepFocus(delta)),
    setScreen: (screen) => set({ screen }),
    /** Scrub to an instant (clamped to the catalogue), or null to follow the present. */
    setCursor: (cursor) => set({ cursor }),
    returnToNow: () => set({ cursor: null }),
    /** Open the lens on a level (default: the focus). */
    openLens: (level = state.focus) => set({ level, screen: 'lens' }),
    /**
     * Leave the lens for the screen it was opened from: through the browser's
     * history while this page pushed an entry (so Back and Escape agree), else directly.
     */
    back() {
      const screen = previousScreen === 'lens' ? 'now' : previousScreen;
      if (depth > 0 && typeof win.history.back === 'function') {
        // shown at once (a key must answer in the same frame), the address left to the browser's step back,
        // whose popstate then restores that entry exactly
        ahead = true;
        try {
          set({ screen });
        } finally {
          ahead = false;
        }
        win.history.back();
      } else set({ screen });
    },
    /**
     * Hear changes. `listener(changed, state)`: `changed` is a Set of the keys
     * that changed in one `set` call.
     * @returns {() => void} unsubscribe
     */
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };

  writeUrl();
  return store;
}

/** 'phone' below PHONE_MAX_WIDTH CSS px of width, else 'desktop'. */
function layoutOf(win) {
  return (win.innerWidth ?? 1280) < PHONE_MAX_WIDTH ? 'phone' : 'desktop';
}

function parseFocus(text) {
  if (typeof text !== 'string' || !/^\d{1,2}$/.test(text)) return undefined;
  const value = Number(text);
  return value >= FOCUS_MIN && value <= FOCUS_MAX ? value : undefined;
}

/** localStorage that never throws (private windows, sandboxed frames, Node). */
function safeStorage(win) {
  return {
    get(key) {
      try {
        return win.localStorage?.getItem(key) ?? null;
      } catch {
        return null;
      }
    },
    set(key, value) {
      try {
        win.localStorage?.setItem(key, value);
      } catch {
        // remembering is a convenience
      }
    },
  };
}

/**
 * @typedef {ReturnType<typeof createStore>} Store
 */
