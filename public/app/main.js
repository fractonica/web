/**
 * main.js - the entry point: load the core, build the store, the ground, the
 * shell and the scheduler, and start.
 *
 * Order matters once: the theme is applied before anything is drawn (CSS
 * reads the generated custom properties), and `data-ready="1"` is set on
 * <html> only after the first pass has painted, so that a screenshot tool or
 * a test never sees a half-drawn page (tools/chrome.mjs waits for it).
 *
 * There is no build step: this file is loaded as an ES module by index.html
 * and imports everything else relatively.
 */
import { load } from '../lib/fractonica.js';
import { THEMES, applyTheme } from './design/tokens.js';
import { createGround } from './drawing/ground.js';
import { iconSvg } from './drawing/icon.js';
import { createClock } from './model/clock.js';
import { createStore } from './model/store.js';
import { keepForOffline } from './shell/offline.js';
import { createShell } from './shell/shell.js';

const root = document.getElementById('app');

try {
  const frc = await load();
  const store = createStore({ frc, cat: frc.saros141, themes: Object.keys(THEMES) });
  const tokens = applyTheme(document.documentElement, store.state.theme);
  setIcon(frc, tokens);

  const ground = createGround(document.getElementById('ground'));
  ground.draw();
  const clock = createClock(store);
  createShell({ root, store, clock, ground });
  store.subscribe((changed) => {
    if (changed.has('theme')) {
      setIcon(frc, applyTheme(document.documentElement, store.state.theme));
      ground.draw();
    }
  });
  clock.start();
  // the first pass has drawn; one more frame lets the layout observers settle
  requestAnimationFrame(() => {
    document.documentElement.dataset.ready = '1';
    keepForOffline();
  });
} catch (error) {
  // no core, no clock: say so plainly instead of showing an empty plate
  root.textContent = `The clock could not start: ${error?.message ?? error}`;
  root.setAttribute('role', 'alert');
  document.documentElement.dataset.ready = '1';
  throw error;
}

/**
 * The page icon in the theme of the moment: the same picture as the shipped
 * public/icons/icon.svg (drawing/icon.js draws both from the core's arcs and
 * the token table), so a Basalt page gets a Basalt icon. The address bar's
 * colour is the plate, the centre of the instrument's ground.
 */
function setIcon(frc, tokens) {
  let link = document.querySelector('link[rel="icon"][type="image/svg+xml"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    link.type = 'image/svg+xml';
    document.head.append(link);
  }
  link.href = `data:image/svg+xml,${encodeURIComponent(iconSvg(frc, tokens.color))}`;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', tokens.color.plate);
}
