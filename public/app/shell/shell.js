/**
 * shell.js - the app's chrome and the one place where screens are mounted.
 *
 *   #app [data-layout] [data-mode] [data-screen] [data-focus]
 *     .rail            (desktop: the left rail; phone: its children are laid out by the grid)
 *       .mode-toggle   the PURE / EARTH toggle: an empty ring, or the ring with its cross
 *       .now-mark      the way back to the present, shown while the cursor is away, on every screen
 *       nav.sigils     the four sigils: NOW, LADDER, LENS, WAVE (inline SVG, no icon font)
 *     main#screen      the mounted screen
 *
 * The shell registers ONE view with the scheduler: on each pass it reads a
 * frame, keeps the document title and the NOW mark true, and hands the frame
 * to the mounted screen (screens/contract.js).
 *
 * Keyboard: Tab reaches the mode toggle, the sigils, the limb and the centre
 * of the instrument; Left / Right step the focus (on the lens: its level) from anywhere; Escape leaves
 * the lens, or returns to the present when the cursor is away.
 */
import { DateForm, Unit } from '../../lib/fractonica.js';
import { modeRing, sigil } from '../drawing/marks.js';
import { FADE, prefersReducedMotion } from '../instrument/motion.js';
import { createFrame, outOfCatalogueText } from '../model/frame.js';
import { EARTH_SIGN, titleDate } from '../model/earth.js';
import { SCREENS } from '../model/url.js';
import { screen as ladder } from '../screens/ladder/ladder.js';
import { screen as lens } from '../screens/lens/lens.js';
import { screen as now } from '../screens/now/now.js';
import { screen as wave } from '../screens/wave/wave.js';
import { h, setHidden, setReading, setText } from './dom.js';

/** Every screen module, by id. To add a screen: write the module, list it here and in model/url.js SCREENS. */
const SCREEN_MODULES = Object.freeze({ now, ladder, lens, wave });
/** The engraved word of each screen (design ruling 4). */
const SCREEN_WORDS = Object.freeze({ now: 'NOW', ladder: 'LADDER', lens: 'LENS', wave: 'WAVE' });
const MODE_WORDS = Object.freeze({ pure: 'PURE', earth: 'EARTH' });
/** The name in the document title (the same as index.html's and the manifest's). */
const APP_NAME = 'Fractonica';
/** The finest term of the moment in the document title: the Preon, about eight minutes. */
const TITLE_FINEST = Unit.PREON;

/**
 * @param {object} options
 * @param {HTMLElement} options.root the #app element
 * @param {import('../model/store.js').Store} options.store
 * @param {ReturnType<typeof import('../model/clock.js').createClock>} options.clock
 * @param {ReturnType<typeof import('../drawing/ground.js').createGround>} options.ground
 */
export function createShell({ root, store, clock, ground }) {
  const { frc, cat } = store;

  // --- chrome -------------------------------------------------------------------
  const modeWord = h('span', { class: 'caps' });
  const modeToggle = h('button', { type: 'button', class: 'mode-toggle', onclick: () => store.toggleMode() }, modeRing(), modeWord);

  const nowOffset = h('span', { class: 'offset' });
  const nowMark = h(
    'button',
    { type: 'button', class: 'now-mark', hidden: true, 'aria-label': 'Return to now', onclick: () => store.returnToNow() },
    h('span', { class: 'ring', 'aria-hidden': 'true' }),
    h('span', { class: 'caps', text: SCREEN_WORDS.now }),
    nowOffset,
  );

  const sigilButtons = Object.fromEntries(
    SCREENS.map((id) => [
      id,
      h('button', { type: 'button', class: 'sigil-button', dataset: { screen: id }, onclick: () => store.setScreen(id) }, sigil(frc, id), h('span', { class: 'caps', text: SCREEN_WORDS[id] })),
    ]),
  );
  const nav = h('nav', { class: 'sigils', 'aria-label': 'Screens' }, ...SCREENS.map((id) => sigilButtons[id]));
  const rail = h('div', { class: 'rail' }, modeToggle, nowMark, nav, h('div', { class: 'rail-rule', 'aria-hidden': 'true' }));
  const host = h('main', { id: 'screen' });
  // a probe that resolves the CSS length --inset-top to px for the canvas layout
  // (styled by the class .inset-probe in app.css: the page's Content-Security-Policy allows no style attribute)
  const insetProbe = h('div', { class: 'inset-probe', 'aria-hidden': 'true' });
  root.replaceChildren(rail, host, insetProbe);

  /** @type {import('../screens/contract.js').App} */
  const app = { store, frc, cat, clock, ground, insetTop: () => insetProbe.offsetHeight };

  let mounted = null;
  let mountedId = '';

  /** Reflect the state on the chrome (attributes that CSS and assistive technology read). */
  function reflect() {
    const { mode, screen, layout, focus } = store.state;
    Object.assign(root.dataset, { mode, screen, layout, focus: String(focus) });
    setText(modeWord, MODE_WORDS[mode]);
    modeToggle.setAttribute('aria-pressed', String(mode === 'earth'));
    modeToggle.setAttribute('aria-label', `Mode: ${MODE_WORDS[mode]}. Switch to ${MODE_WORDS[mode === 'pure' ? 'earth' : 'pure']}`);
    for (const id of SCREENS) {
      if (id === screen) sigilButtons[id].setAttribute('aria-current', 'page');
      else sigilButtons[id].removeAttribute('aria-current');
    }
  }

  /** Mount the screen the state names (cross-fading in, unless motion is reduced or it is the first). */
  function mountScreen() {
    const id = store.state.screen;
    if (id === mountedId) return;
    const first = mounted === null;
    mounted?.unmount();
    host.replaceChildren();
    mounted = SCREEN_MODULES[id].mount(host, app);
    mountedId = id;
    if (!first && !prefersReducedMotion()) {
      host.style.transition = 'none';
      host.classList.add('leaving');
      void host.offsetWidth; // let the hidden state apply before the fade starts
      host.style.transition = `opacity ${FADE.screen}ms linear`;
      host.classList.remove('leaving');
    }
  }

  /**
   * The document title: the app's name, then the moment shown at the Preon's grain ("Fractonica · δ#3 ε#5 34η
   * 29ι", from the core's short letter form), so that the tab names the app and changes about every eight
   * minutes, never with every Blink (nothing blinks, the tab included). EARTH mode adds the civil date and minute.
   */
  function title(frame) {
    const moment = frame.inCatalogue ? frc.formatDate(frame.date(), DateForm.SHORT_LETTERS, TITLE_FINEST) : outOfCatalogueText(frc, cat);
    const pure = `${APP_NAME} · ${moment}`;
    const text = store.state.mode === 'earth' ? `${pure} · ${EARTH_SIGN} ${titleDate(frc, frame.t)}` : pure;
    if (document.title !== text) document.title = text;
    // read by tests and tools: what the page shows, as data (the whole stamp, down to the Blink)
    const html = document.documentElement;
    const shown = frame.inCatalogue ? frame.stamp() : '';
    if (html.dataset.stamp !== shown) html.dataset.stamp = shown;
  }

  /** The NOW mark: shown while away, with how far the cursor is from the present as a span. */
  function nowReturn(frame) {
    setHidden(nowMark, !store.away);
    if (!store.away) return;
    const present = store.now();
    let offset = '';
    if (frame.inCatalogue && cat.contains(present) && present !== frame.t) {
      // the core says the direction: "+18ι 13λ" to a later instant, "−6ι 43λ" to an earlier one
      offset = frc.formatSpanSigned(cat.spanBetween(present, frame.t));
    }
    setReading(nowOffset, offset);
  }

  clock.add((t, changed) => {
    if (changed !== null || mounted === null) {
      reflect();
      mountScreen();
    }
    if (changed?.has('mode')) {
      // the annotations cross-fade in (styles/app.css: #app.mode-fade .earth); the class is the trigger
      root.classList.add('mode-fade');
      setTimeout(() => root.classList.remove('mode-fade'), FADE.mode + 50);
    }
    const frame = createFrame(frc, cat, t);
    title(frame);
    nowReturn(frame);
    // a screen mounted in this pass has seen nothing yet: tell it everything changed
    return mounted.update(frame, changed);
  });

  document.addEventListener('keydown', (event) => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    const tag = event.target instanceof Element ? event.target.tagName : '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (event.key === 'ArrowRight') store.stepScale(1);
    else if (event.key === 'ArrowLeft') store.stepScale(-1);
    else if (event.key === 'Escape') {
      if (store.state.screen === 'lens') store.back();
      else if (store.away) store.returnToNow();
      else return;
    } else return;
    event.preventDefault();
  });

  window.addEventListener('resize', () => {
    ground.draw();
    clock.refreshSoon();
  });

  return { app };
}
