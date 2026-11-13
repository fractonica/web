/**
 * dom.js - the few DOM helpers the screens share. No framework: elements are
 * made once and their text is updated in place, only when it changed.
 */
import { engraved } from '../drawing/canvas.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Make an element. `attributes`: `class`, `text`, `dataset`, `on<event>` handlers,
 * anything else is set as an attribute (false / null / undefined are skipped).
 * @param {string} tag
 * @param {Record<string, any>} [attributes]
 * @param {...(Node | string | null | undefined | false)} children
 */
export function h(tag, attributes = {}, ...children) {
  return fill(document.createElement(tag), attributes, children);
}

/** The same for SVG elements. */
export function svg(tag, attributes = {}, ...children) {
  return fill(document.createElementNS(SVG_NS, tag), attributes, children);
}

function fill(element, attributes, children) {
  for (const [name, value] of Object.entries(attributes)) {
    if (value === false || value === null || value === undefined) continue;
    if (name === 'class') element.setAttribute('class', value);
    else if (name === 'text') element.textContent = value;
    else if (name === 'dataset') Object.assign(element.dataset, value);
    else if (name.startsWith('on') && typeof value === 'function') element.addEventListener(name.slice(2), value);
    else element.setAttribute(name, value === true ? '' : String(value));
  }
  for (const child of children) if (child !== null && child !== undefined && child !== false) element.append(child);
  return element;
}

/** Set an element's text only when it differs (the DOM is touched when something changed, not every pass). */
export function setText(element, text) {
  if (element.dataset.text !== text) {
    element.dataset.text = text;
    element.textContent = text;
  }
}

/** Engraved words: capitals, Greek letters left as the symbols they are. */
export function setWords(element, words) {
  setText(element, engraved(words));
}

/**
 * Set a reading: numerals stay in the element's colour (bone), unit letters
 * and '#' are wrapped in <span class="u"> (ash), as DESIGN.md section 3 sets
 * a reading. The text itself is the core's, untouched.
 */
export function setReading(element, reading) {
  if (element.dataset.text === reading) return;
  element.dataset.text = reading;
  element.replaceChildren(...readingNodes(reading));
}

/** The nodes of a reading: text for numerals, span.u for letter runs. */
export function readingNodes(reading) {
  return (reading.match(/[α-ω#]+|[^α-ω#]+/g) ?? []).map((run) => (/[α-ω#]/.test(run) ? h('span', { class: 'u', text: run }) : document.createTextNode(run)));
}

/** Show or hide without changing layout flow rules elsewhere. */
export function setHidden(element, hidden) {
  if (element.hidden !== hidden) element.hidden = hidden;
}

/**
 * Keep a pointer's events coming to an element while it is pressed (a drag
 * that leaves the element). A pointer the browser does not know (a synthetic
 * event, a pointer already gone) cannot be captured: the press then simply
 * works without it.
 */
export function capture(element, pointerId) {
  try {
    element.setPointerCapture(pointerId);
  } catch {
    // not an active pointer
  }
}

/**
 * Say whether a scrolling box holds more below than it shows: toggles `.more-below` on it (app.css fades
 * its bottom edge out, the cue that there is more), on scroll, on a change of its size or its content's,
 * and when `check()` is called. The scroll bars are hidden (an instrument has none), so this is the cue.
 * @param {HTMLElement} box the element that scrolls
 * @returns {{ check: () => void, destroy: () => void }}
 */
export function watchOverflow(box) {
  const check = () => box.classList.toggle('more-below', box.scrollTop + box.clientHeight < box.scrollHeight - 2);
  box.addEventListener('scroll', check, { passive: true });
  const observer = new ResizeObserver(check);
  observer.observe(box);
  for (const child of box.children) observer.observe(child);
  check();
  return {
    check,
    destroy() {
      observer.disconnect();
      box.removeEventListener('scroll', check);
      box.classList.remove('more-below');
    },
  };
}
