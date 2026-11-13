/**
 * tokens.js - THE token table: every colour, typeface, line weight and glow of the app.
 *
 * WHY ONE TABLE: the instrument is drawn by two renderers (Canvas 2D and the
 * DOM / inline SVG). Both must agree, and a theme must be a change of one
 * value. So no colour or font literal exists anywhere else: canvas code reads
 * `theme()`, CSS reads the custom properties that `applyTheme` generates from
 * the same object (styles/app.css contains `var(--c-...)` only).
 *
 * Two themes of the same shape:
 *   astrolabe  design/astrolabe/DESIGN.md sections 2 - 4 (the design; default)
 *   basalt     design/tablet/DESIGN.md sections 2 - 3 (palette and typeface
 *              only: warm stone, bone engraving, gold for the Sun and the
 *              present, verdigris for Earth). Selected by ?theme=basalt.
 *
 * Colours are `#rrggbb` or `#rrggbbaa`. Sizes are CSS px ("points" of the design).
 */

/** @typedef {typeof ASTROLABE} Theme */

const ASTROLABE = Object.freeze({
  name: 'astrolabe',
  color: Object.freeze({
    void: '#040506', //       the screen
    plate: '#0b0e12', //      centre of the vignette
    etch1: '#12161b', //      machining marks, list leaders
    etch2: '#262d36', //      engraved hairline: nested arcs to come, carriers, rules, empty counter slots
    etch3: '#48525e', //      strong engraving: first-level arcs to come, ticks, inactive sigils
    ash: '#8d96a3', //        secondary text, unit letters inside a reading
    bone: '#e9ecf0', //       numerals and names; beads of completed children
    lumen: '#8df3e9', //      the one cold light: elapsed first-level arcs, focus marks
    lumenMid: '#4bb3ab', //   lumen at rest: elapsed nested arcs, lit graduations, current counter slot
    lumenDim: '#245a57', //   elapsed part of a carrier; completed slots on minor counter rings
    lumenEtch: '#1a4543', //  completed slots on major counter rings
    lumenRing: '#35807a', //  the lit part of the current slot on a major counter ring
    now: '#8df3e9', //        the point of now and the next threshold
    nowCore: '#ffffff', //    the white core of the point of now
    sol: '#ffd60a', //        the Sun: sync odometer, sync ring, Pentad mark. Nothing else.
    solDim: '#7d6a12', //     Sun, completed or inactive
    solLabel: '#a08918', //   Sun labels
    solEmpty: '#2a2616', //   empty sync slots
    hAlpha: '#ff4a3a', //     rung zeta1 (656 nm) only
    earth: '#8d96a3', //      every Earth translation (ash in this theme)
    limbBetween: '#5b6572', // limb letters of levels between units
    majorLabel: '#6f7985', // letters on the major counter rings
    majorName: '#b9c0c9', //  major names that are not the innermost (desktop column)
    seal: '#7a8491', //       a level's seal at rest, in a list (ladder rows, the lens's lineage)
  }),
  font: Object.freeze({
    reading: '-apple-system, "SF Pro Display", system-ui, "Helvetica Neue", Helvetica, Arial, sans-serif',
    caps: 'Futura, "Avenir Next", "Century Gothic", "Helvetica Neue", sans-serif',
    readingWeight: 200, // ultralight numerals of the reading
    valueWeight: 300, //   values, level letters
    earthWeight: 400, //   Earth translations
    capsWeight: 500, //    engraved words
    titleWeight: 100, //   the lens title letter
    capsTracking: 0.24, // em
    dateTracking: 0.3, //  em, the date line
    bezelTracking: 0.2, // em, words on the bezel
    earthStyle: 'normal',
  }),
  line: Object.freeze({
    hair: 0.5, //        machining marks, alidade
    engrave: 0.75, //    carriers, rules, nested arcs
    deep: 0.6, //        great-grandchildren
    tick: 0.9, //        ticks, first-level arcs to come
    ringMajor: 0.8, //   counter rings of the majors
    ringMinor: 1.0, //   counter rings of the minors, sigils
    currentSlot: 1.2, // factor on the lit part of the current counter slot
    carrierLit: 0.9, //  elapsed part of the carrier
    heroPhone: 1.4, //   first-level arcs of the focused ring
    heroDesktop: 1.7,
  }),
  glow: Object.freeze({
    sigmaPhone: 2.4, //  Gaussian sigma, px
    sigmaDesktop: 3.2,
    arc: 0.42, //        opacity under first-level elapsed arcs
    glyph: 0.35, //      under glyphs
    now: 0.9, //         under the point of now
    planet: 0.5, //      under a planet
  }),
  alpha: Object.freeze({
    alidade: 0.42,
    nowHalo: 0.55,
    grand: 0.95, //      elapsed grandchildren
    great: 0.6, //       elapsed great-grandchildren
    sealCarrier: 0.35,
  }),
  ground: Object.freeze({
    markSpacing: Object.freeze([19, 26, 33]), // px, repeating
    vignette: 0.7, //    plate -> void over this share of the longer side
  }),
});

const BASALT = Object.freeze({
  name: 'basalt',
  color: Object.freeze({
    void: '#0b0907', //       basalt0
    plate: '#241e18', //      basalt2
    etch1: '#15120f', //      basalt1
    etch2: '#2e2821', //      seam
    etch3: '#6a5e4d', //      uncut
    ash: '#9d917b', //        dim
    bone: '#ece2cc', //       bone
    lumen: '#ece2cc', //      carved = bone: what has elapsed
    lumenMid: '#9d917b', //   dim
    lumenDim: '#857a67', //   faint
    lumenEtch: '#6a5e4d', //  uncut
    lumenRing: '#857a67', //  faint
    now: '#e6b54e', //        gold: the present
    nowCore: '#ece2cc',
    sol: '#e6b54e', //        gold: the Sun
    solDim: '#e6b54e73', //   gold, withdrawn
    solLabel: '#e6b54eb3',
    solEmpty: '#2e2821', //   seam
    hAlpha: '#ff4a2e', //     red
    earth: '#6cbcaa', //      verd: the gloss
    limbBetween: '#857a67', // faint
    majorLabel: '#857a67',
    majorName: '#9d917b',
    seal: '#857a67', //       faint
  }),
  font: Object.freeze({
    reading: '"Iowan Old Style", Palatino, "Palatino Linotype", Georgia, serif',
    // Optima has no Greek: the reading face follows it in the stack for the letters
    caps: 'Optima, Candara, "Gill Sans", "Iowan Old Style", Palatino, Georgia, serif',
    readingWeight: 400, // "no bold anywhere; hierarchy is size and colour"
    valueWeight: 400,
    earthWeight: 400,
    capsWeight: 400,
    titleWeight: 400,
    capsTracking: 0.26,
    dateTracking: 0.3,
    bezelTracking: 0.2,
    earthStyle: 'italic',
  }),
  line: ASTROLABE.line,
  glow: ASTROLABE.glow,
  alpha: ASTROLABE.alpha,
  ground: ASTROLABE.ground,
});

/** Every theme, by its ?theme= name. */
export const THEMES = Object.freeze({ astrolabe: ASTROLABE, basalt: BASALT });
export const DEFAULT_THEME = 'astrolabe';

let current = ASTROLABE;

/** The theme in force. Canvas code reads colours, fonts and weights from here at draw time. */
export function theme() {
  return current;
}

/**
 * A token colour with an opacity, for canvas fills, strokes and shadows.
 * @param {string} hex `#rrggbb` or `#rrggbbaa` (a token, never a literal)
 * @param {number} opacity 0..1, multiplied with the token's own alpha
 * @returns {string} `rgba(r, g, b, a)`
 */
export function withAlpha(hex, opacity) {
  const value = Number.parseInt(hex.slice(1, 7), 16);
  const own = hex.length === 9 ? Number.parseInt(hex.slice(7, 9), 16) / 255 : 1;
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${+(own * opacity).toFixed(4)})`;
}

/** camelCase -> kebab-case: `lumenMid` -> `lumen-mid`. */
const kebab = (name) => name.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`);

/**
 * Select a theme and write it to CSS custom properties on `root`:
 *   --c-<colour>       every colour            (lumenMid -> --c-lumen-mid, etch2 -> --c-etch2)
 *   --font-reading, --font-caps, --w-<weight>, --track-<name>, --earth-style
 *   --glow-<name>      opacities, --glow-sigma-phone / -desktop
 * styles/app.css uses these and nothing else for colour and type.
 * @param {HTMLElement} root usually document.documentElement
 * @param {string} name a key of THEMES (unknown names fall back to the default)
 * @returns {Theme}
 */
export function applyTheme(root, name) {
  current = THEMES[name] ?? THEMES[DEFAULT_THEME];
  const set = (key, value) => root.style.setProperty(key, String(value));
  for (const [key, value] of Object.entries(current.color)) set(`--c-${kebab(key)}`, value);
  set('--font-reading', current.font.reading);
  set('--font-caps', current.font.caps);
  set('--w-reading', current.font.readingWeight);
  set('--w-value', current.font.valueWeight);
  set('--w-earth', current.font.earthWeight);
  set('--w-caps', current.font.capsWeight);
  set('--w-title', current.font.titleWeight);
  set('--track-caps', `${current.font.capsTracking}em`);
  set('--track-date', `${current.font.dateTracking}em`);
  set('--earth-style', current.font.earthStyle);
  set('--glow-sigma-phone', `${current.glow.sigmaPhone}px`);
  set('--glow-sigma-desktop', `${current.glow.sigmaDesktop}px`);
  set('--c-glow-sol', withAlpha(current.color.sol, current.glow.glyph));
  set('--c-glow-lumen', withAlpha(current.color.lumen, current.glow.glyph));
  root.dataset.theme = current.name;
  return current;
}

/**
 * A canvas font string from the token faces.
 * @param {'reading' | 'caps'} face
 * @param {number} size px
 * @param {number} [weight] defaults to the face's usual weight
 */
export function canvasFont(face, size, weight) {
  const font = current.font;
  const family = face === 'caps' ? font.caps : font.reading;
  return `${weight ?? (face === 'caps' ? font.capsWeight : font.valueWeight)} ${size}px ${family}`;
}
