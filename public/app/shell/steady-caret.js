/**
 * steady-caret.js - a text caret that does not blink, for the one text field of the app ("go to").
 *
 * WHY: nothing blinks (design ruling 11, DESIGN.md section 10), and a browser's own caret blinks. Engines
 * with CSS `caret-animation: manual` (wave.css sets it) draw a steady caret themselves: then this module
 * does nothing. Elsewhere it hides the platform caret (`caret-color: transparent`) and draws a 1 px bar
 * (`.steady-caret`, wave.css) where the caret is: after the typed text up to the selection's start, measured
 * in the field's own font, less the field's horizontal scroll, times the field's drawn scale.
 *
 *   steadyCaret(input, host, scale) -> () => void (undo)
 *
 * `host` is the positioned element the bar is placed in (the field's form), `scale()` the field's drawn
 * scale (wave.css draws 16 px type scaled down; see .goto-input).
 */
import { h } from './dom.js';

/** True when the engine draws a caret that does not blink. */
export const ENGINE_STEADY_CARET = typeof CSS !== 'undefined' && CSS.supports?.('caret-animation', 'manual') === true;

/**
 * @param {HTMLInputElement} input
 * @param {HTMLElement} host positioned ancestor of the input that the bar is drawn in
 * @param {() => number} scale the field's drawn scale (1 when it is not scaled)
 * @returns {() => void} removes the drawn caret and its listeners
 */
export function steadyCaret(input, host, scale) {
  if (ENGINE_STEADY_CARET) return () => {};
  input.style.caretColor = 'transparent';
  const bar = h('span', { class: 'steady-caret', 'aria-hidden': 'true', hidden: true });
  host.append(bar);
  const measure = document.createElement('canvas').getContext('2d');

  const place = () => {
    const focused = document.activeElement === input;
    const collapsed = input.selectionStart === input.selectionEnd;
    bar.hidden = !focused || !collapsed || measure === null;
    if (bar.hidden) return;
    const style = getComputedStyle(input);
    measure.font = style.font;
    measure.letterSpacing = style.letterSpacing;
    const before = input.value.slice(0, input.selectionStart ?? input.value.length);
    const x = parseFloat(style.paddingLeft) + measure.measureText(before).width - input.scrollLeft;
    bar.style.left = `${input.offsetLeft + x * scale()}px`;
  };
  const events = ['focus', 'blur', 'input', 'keyup', 'pointerup', 'select', 'scroll'];
  for (const name of events) input.addEventListener(name, place);
  document.addEventListener('selectionchange', place);
  return () => {
    for (const name of events) input.removeEventListener(name, place);
    document.removeEventListener('selectionchange', place);
    bar.remove();
    input.style.caretColor = '';
  };
}
