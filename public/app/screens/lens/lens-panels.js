/**
 * lens-panels.js - the DOM of the LENS around its ring: real text, selectable
 * and readable by assistive technology (DESIGN.md section 7, "Lens").
 *
 *   .lens-head      LENS · RUNG 7 OF 63
 *   .lens-title     the letter (78 px), the name, "DEPTH 7 · LEVEL 6 · UNIT" (the kind in the core's word), a note, the running cycle
 *   .lens-prefix    EXACT P(6)   125 125 = 5 · 13 · 5 · 5 · 7 · 11
 *   .lens-lineage   the seals from the Alpha down to this rung, the factors between them (a canvas;
 *                   a click on a seal inspects that rung)
 *   .lens-rows      MADE OF · SIBLINGS · PERIOD · RATE · BAND (+ the devices of SPEC 16.4 in EARTH mode)
 *   .lens-media     the seven media: a rule, the length as a span of light, in EARTH mode also in metres
 *
 * `build()` makes the tree once; `update(reading)` writes a reading of
 * lens-reading.js into it and touches only what changed. One tree serves
 * both arrangements; styles/lens.css places it. Earth elements are EMPTY AND
 * HIDDEN in PURE mode.
 */
import { canvasFont, theme } from '../../design/tokens.js';
import { fitCanvas, line, text } from '../../drawing/canvas.js';
import { beadRow } from '../../drawing/marks.js';
import { paintSeal } from '../../drawing/seal.js';
import { outOfCatalogueText } from '../../model/frame.js';
import { EARTH_SIGN } from '../../model/earth.js';
import { h, setHidden, setReading, setText, setWords } from '../../shell/dom.js';
import { LINEAGE_MAX } from './lens-reading.js';

/** The lineage strip: its height, where the seals stand in it, and the widest step between two (px). */
const LINEAGE = Object.freeze({ height: 62, seal: 22, edge: 14, extent: 11, maxPitch: 76 });

/** An Earth element: hidden and empty until EARTH mode fills it. */
const earthCell = (className) => h('span', { class: `earth ${className}`, hidden: true });

/** Fill or clear an Earth element, led by the Earth sign unless its column's heading carries it. */
function setEarth(cell, words, sign = true) {
  const key = `${sign ? EARTH_SIGN : ''}${words}`;
  if (cell.dataset.text === key) return;
  cell.dataset.text = key;
  cell.replaceChildren();
  setHidden(cell, words === '');
  if (words === '') return;
  if (sign) cell.append(h('span', { class: 'sign', 'aria-hidden': 'true', text: EARTH_SIGN }), h('span', { class: 'sr-only', text: 'Earth: ' }));
  cell.append(words);
}

/** One data row: an engraved label, an Earth translation beside the value, the value. */
function dataRow(className) {
  const row = { label: h('span', { class: 'caps label' }), earth: earthCell('row-earth'), value: h('span', { class: 'value' }), extra: h('span', { class: 'extra' }) };
  row.element = h('div', { class: `lens-row ${className}` }, row.label, row.earth, h('span', { class: 'values' }, row.value, row.extra));
  return row;
}

/**
 * @param {import('../../../lib/fractonica.js').Fractonica} frc
 * @param {import('../../../lib/fractonica.js').Catalogue} cat
 * @param {(level: number) => void} inspect a seal of the lineage was chosen
 */
export function buildPanels(frc, cat, inspect) {
  // --- head and title -------------------------------------------------------------
  const rung = h('div', { class: 'caps sub' });
  const head = h('header', { class: 'lens-head' }, h('div', { class: 'caps title', text: 'LENS' }), rung);
  const letter = h('div', { class: 'lens-letter' });
  const word = h('h1', { class: 'caps lens-word' });
  const kind = h('div', { class: 'caps lens-kind' });
  const note = h('div', { class: 'caps lens-note', hidden: true });
  const cycle = h('div', { class: 'lens-cycle' });
  const title = h('div', { class: 'lens-title' }, letter, word, kind, note, cycle);

  // --- lineage ----------------------------------------------------------------------
  const prefix = dataRow('lens-prefix');
  const lineageCanvas = h('canvas', { class: 'lens-lineage-canvas', role: 'img' });
  const lineage = h('div', { class: 'lens-lineage' }, lineageCanvas);
  /** Where the seals of the strip stand (for the click), and what the strip was last drawn for. */
  let lineageSpots = [];
  let lineageKey = '';
  lineage.addEventListener('click', (event) => {
    const x = event.clientX - lineageCanvas.getBoundingClientRect().left;
    const spot = lineageSpots.find((s) => Math.abs(s.x - x) <= LINEAGE.extent + 5);
    if (spot) inspect(spot.level);
  });

  function drawLineage(reading) {
    const width = lineage.clientWidth;
    if (width < 40) return;
    const key = `${reading.level}|${width}|${theme().name}|${reading.lineage.map((item) => item.visible).join('')}`;
    if (key === lineageKey) return;
    lineageKey = key;
    const { color, glow, font } = theme();
    const ctx = fitCanvas(lineageCanvas, width, LINEAGE.height);
    lineageCanvas.style.width = `${width}px`;
    lineageCanvas.style.height = `${LINEAGE.height}px`;
    const pitch = Math.min(LINEAGE.maxPitch, (width - 2 * LINEAGE.edge) / (LINEAGE_MAX - 1));
    const y = LINEAGE.seal;
    lineageSpots = [];
    // more ancestors than the strip holds: the line comes in from beyond the edge
    if (reading.lineageCut) line(ctx, 0, y, LINEAGE.edge - 13, y, { color: color.etch2, width: 0.75 });
    reading.lineage.forEach((item, i) => {
      const x = LINEAGE.edge + i * pitch;
      const on = item.level === reading.level;
      lineageSpots.push({ x, level: item.level });
      if (!on) {
        line(ctx, x + 15, y, x + pitch - 15, y, { color: color.etch2, width: 0.75 });
        text(ctx, item.factor, x + pitch / 2, y - 6, { font: canvasFont('reading', 9.5, font.earthWeight), color: color.ash, align: 'center' });
      }
      // the one red of the app: the seal of the rung that is visible light
      const ink = item.visible ? color.hAlpha : on ? color.lumen : color.seal;
      paintSeal(ctx, frc, x, y, LINEAGE.extent, item.level, { color: ink, width: on ? 1 : 0.8, glow: on ? { sigma: glow.sigmaPhone * 0.7, alpha: glow.arc } : null });
      text(ctx, item.name, x, y + 26, { font: canvasFont('reading', 12), color: on ? color.bone : color.ash, align: 'center' });
    });
    lineageCanvas.setAttribute('aria-label', `Lineage: ${reading.lineage.map((item) => (item.factor ? `${item.name} × ${item.factor}` : item.name)).join(', ')}`);
  }

  // --- data rows ---------------------------------------------------------------------
  const made = dataRow('lens-made');
  const siblings = dataRow('lens-siblings');
  const beads = beadRow();
  siblings.element.querySelector('.values').append(beads.element);
  const period = dataRow('lens-period');
  const rate = dataRow('lens-rate');
  const band = dataRow('lens-band');
  const devices = [dataRow('lens-device earth-only'), dataRow('lens-device earth-only')].map((row) => {
    row.rate = earthCell('device-rate');
    row.word = h('span', {});
    row.label.append(row.word, row.rate);
    return row;
  });
  setWords(made.label, 'made of');
  setWords(siblings.label, 'siblings');
  setWords(period.label, 'period');
  setWords(rate.label, 'rate');
  setWords(band.label, 'band');
  const rows = h('div', { class: 'lens-rows' }, made.element, siblings.element, period.element, rate.element, band.element, ...devices.map((row) => row.element));

  // --- media ---------------------------------------------------------------------------
  const travel = h('span', { class: 'caps m-title' });
  const lightHead = h('span', { class: 'caps m-head-light' });
  const metresHead = earthCell('caps m-head-metres');
  setWords(lightHead, 'as a span of light');
  const mediaRows = [];
  for (let medium = 0; medium < frc.constants.MEDIUM_COUNT; medium++) {
    const row = { name: h('span', { class: 'm-name' }), fill: h('span', { class: 'm-fill' }), light: h('span', { class: 'm-light' }), metres: earthCell('m-metres') };
    row.element = h('div', { class: 'm-row' }, row.name, h('span', { class: 'm-bar', 'aria-hidden': 'true' }, row.fill), row.light, row.metres);
    mediaRows.push(row);
  }
  const media = h('div', { class: 'lens-media' }, h('div', { class: 'm-heads' }, travel, lightHead, metresHead), ...mediaRows.map((row) => row.element));

  /** The reading last written (the strip is redrawn from it when its box changes). */
  let shown = null;
  const lineageObserver = new ResizeObserver(() => {
    lineageKey = '';
    if (shown) drawLineage(shown);
  });
  lineageObserver.observe(lineage);

  return {
    head,
    title,
    prefix: prefix.element,
    lineage,
    rows,
    media,
    /**
     * Write a reading into the tree.
     * @param {import('./lens-reading.js').LensReading} reading
     */
    update(reading) {
      shown = reading;
      const { facts: rungFacts, band: bandFacts, live } = reading;
      setWords(rung, `rung ${rungFacts.depth} of ${reading.count}`);
      setText(letter, rungFacts.name);
      setWords(word, rungFacts.title);
      setWords(kind, `depth ${rungFacts.depth}  ·  level ${rungFacts.level}  ·  ${rungFacts.kindWords}`);
      setHidden(note, !rungFacts.solar);
      setWords(note, rungFacts.solar ? 'the unit of the solar sync' : '');
      // the running cycle, by its name; outside the catalogue the words of design ruling 7
      if (!reading.lit) setText(cycle, outOfCatalogueText(frc, cat));
      else setReading(cycle, live?.name ?? '');

      setWords(prefix.label, `exact P(${rungFacts.level})`);
      setHidden(prefix.element, reading.prefix === '');
      setReading(prefix.value, reading.prefix);
      drawLineage(reading);

      // the last rung has no rung below it in the ladder: no "made of" row
      setHidden(made.element, reading.madeOf === '');
      setReading(made.value, reading.madeOf);
      setReading(siblings.value, reading.siblings);
      const counter = live?.siblings ?? null;
      beads.element.toggleAttribute('hidden', counter === null); // an SVG element has no `hidden` property, only the attribute
      if (counter) beads.update(counter.count, counter.local, counter.count > 13 ? 6 : 8.2);
      // a rung shorter than a Blink has no period in spans: the row is there only for the Earth figure
      setHidden(period.element, reading.period === '' && reading.earthPeriod === '');
      setReading(period.value, reading.period);
      period.element.classList.toggle('earth-only', reading.period === '');
      setEarth(period.earth, reading.earthPeriod);
      setText(rate.value, rungFacts.rateShort);
      setText(rate.extra, rungFacts.rateShort === rungFacts.rate ? '' : rungFacts.rate);
      setEarth(rate.earth, reading.earthFrequency);
      setText(band.value, bandFacts.bandName);
      band.element.classList.toggle('visible-light', bandFacts.visible);
      devices.forEach((row, i) => {
        const device = reading.devices?.[i] ?? null;
        setHidden(row.element, device === null);
        setWords(row.word, device ? device.label : '');
        setEarth(row.rate, device ? device.rate : '', false);
        setEarth(row.earth, device ? device.value : '');
      });

      setWords(travel, reading.travel);
      setEarth(metresHead, reading.media[0].metres === '' ? '' : 'LENGTH');
      reading.media.forEach((item, i) => {
        const row = mediaRows[i];
        row.element.classList.toggle('first', item.first);
        setText(row.name, item.name);
        row.fill.style.width = `${(item.place * 100).toFixed(1)}%`;
        setReading(row.light, item.light);
        setEarth(row.metres, item.metres, false);
      });
    },
    /** Redraw what is painted from the tokens (the theme changed). */
    retheme() {
      lineageKey = '';
      if (shown) drawLineage(shown);
    },
    destroy() {
      lineageObserver.disconnect();
    },
  };
}
