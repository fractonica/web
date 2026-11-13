/**
 * ladder-rows.js - the DOM of the LADDER: real text for every rung, readable
 * by assistive technology, placed by ladder.js along the rim of the wheel.
 *
 *   .ladder-heads   the column headings (pure: LENGTH · RATE / MADE OF; Earth: ⊕ PERIOD / FREQUENCY / LIGHT IN VACUUM)
 *   .rung x 63      a row at rest: depth, name, "kind · band · n in parent", its values
 *   .rung-focus     the row under the index, large: the same facts, the band rule, the lead value
 *                   (.f-head = name + two caption lines; .f-values = the pure lead and what stands
 *                   under it; .f-madeof = "made of" as a column, wide windows only; .f-earth = the
 *                   three Earth cells, one of them the lead; .f-rule = the band rule)
 *
 * One tree serves every arrangement; styles/ladder.css places the cells:
 *   [data-columns="stack"]  phones and narrow windows: two lines of values at the right; in EARTH
 *                           mode the Earth values stand there instead (DESIGN.md, screen3.png)
 *   [data-columns="side"]   wide windows: pure and Earth values side by side in five columns,
 *                           the Earth ones under one Earth-sign heading
 *
 * Text comes from model/rungs.js (the core's wordings). The pure cells are
 * written once; the Earth cells are written in EARTH mode and are EMPTY AND
 * HIDDEN in PURE mode (test/browser.test.js reads the whole page for that).
 */
import { engraved } from '../../drawing/canvas.js';
import { EARTH_SIGN } from '../../model/earth.js';
import { rungEarth, rungFacts } from '../../model/rungs.js';
import { h, setHidden, setReading, setText, setWords } from '../../shell/dom.js';

/** Words of the interface (engraved by `setWords`). */
const WORDS = Object.freeze({
  pure: 'length  ·  rate',
  made: 'made of',
  period: 'period',
  frequency: 'frequency',
  length: 'light in vacuum',
  perBlink: 'cycles per Blink',
});

/** Frequency and length together longer than this (characters) make a row "wide": its caption is cut to "n in parent". */
const WIDE_FROM_CHARS = 24;

/** An Earth cell: hidden and empty until EARTH mode fills it. */
const earthCell = (className) => h('span', { class: `earth ${className}`, hidden: true });

/** Fill or clear an Earth cell. `sign` leads it with the Earth sign (a value that shares a block with pure notation). */
function setEarth(cell, words, sign = false) {
  const key = `${sign ? EARTH_SIGN : ''}${words}`;
  if (cell.dataset.text === key) return;
  cell.dataset.text = key;
  cell.replaceChildren();
  setHidden(cell, words === '');
  if (words === '') return;
  if (sign) cell.append(h('span', { class: 'sign', 'aria-hidden': 'true', text: EARTH_SIGN }));
  cell.append(words);
}

/**
 * A rung as one sentence for assistive technology. Pure-safe unless `earth`
 * is given: then the Earth figures follow, said to be Earth's.
 * @param {import('../../model/rungs.js').RungFacts} facts
 * @param {import('../../model/rungs.js').RungEarth} band the interval facts (for the band's name)
 * @param {boolean} earth add the Earth figures
 */
export function describeRung(facts, band, earth) {
  const parts = [`${facts.name}, ${facts.title}: depth ${facts.depth}, ${facts.kindWords}, ${band.bandName}`];
  if (facts.inParent) parts.push(facts.inParent);
  if (facts.madeOf) parts.push(`made of ${facts.madeOf}`);
  if (facts.span) parts.push(`length ${facts.span}`);
  parts.push(`rate ${facts.rate}`);
  if (earth) parts.push(`Earth: period ${band.period}, frequency ${band.frequency}, light in vacuum ${band.length}`);
  return `${parts.join('. ')}.`;
}

/**
 * Build the tree.
 * @param {import('../../../lib/fractonica.js').Fractonica} frc
 * @returns {LadderRows}
 */
export function buildRows(frc) {
  const count = frc.constants.LEVEL_COUNT;

  // --- column headings ----------------------------------------------------------
  const heads = {
    pure: h('span', { class: 'caps h-pure' }),
    made: h('span', { class: 'caps h-made' }),
    period: earthCell('caps h-period'),
    frequency: earthCell('caps h-freq'),
    length: earthCell('caps h-length'),
  };
  setWords(heads.pure, WORDS.pure);
  setWords(heads.made, WORDS.made);
  const headRow = h('div', { class: 'ladder-heads', 'aria-hidden': 'true' }, heads.pure, heads.made, heads.period, heads.frequency, heads.length);

  // --- the rows at rest ---------------------------------------------------------
  const rows = [];
  for (let level = 0; level < count; level++) {
    const facts = rungFacts(frc, level);
    const row = {
      level,
      facts,
      kind: h('span', { class: 'r-kind' }),
      band: h('span', { class: 'r-band' }),
      parent: h('span', { class: 'r-parent' }),
      period: earthCell('r-period'),
      frequency: earthCell('r-freq'),
      length: earthCell('r-length'),
    };
    const pure = h('span', { class: 'r-pure' });
    const made = h('span', { class: 'r-made' });
    setReading(pure, facts.lengthOrRate);
    setReading(made, facts.madeOf);
    setWords(row.kind, facts.kindShort);
    setWords(row.parent, facts.inParent);
    row.element = h(
      'div',
      { class: 'rung', role: 'option', id: `rung-${level}`, 'aria-selected': 'false', 'aria-posinset': level + 1, 'aria-setsize': count, dataset: { level: String(level) }, hidden: true },
      h('span', { class: 'r-depth', text: String(facts.depth) }),
      h('span', { class: 'r-name', text: facts.name }),
      h('span', { class: 'caps r-facts' }, facts.kindShort ? row.kind : null, row.band, facts.inParent ? row.parent : null),
      pure,
      made,
      row.period,
      h('span', { class: 'r-earth2' }, row.frequency, row.length),
    );
    rows.push(row);
  }

  // --- the row under the index --------------------------------------------------
  const focus = {
    depth: h('span', { class: 'f-depth' }),
    name: h('span', { class: 'f-name' }),
    kind: h('span', { class: 'f-kind' }),
    band: h('span', { class: 'f-band' }),
    parent: h('span', { class: 'f-parent' }),
    made: h('span', { class: 'f-made' }),
    madeOf: h('span', { class: 'f-madeof' }),
    pure: h('span', { class: 'f-pure' }),
    sub: h('span', { class: 'f-sub' }),
    period: earthCell('f-period'),
    frequency: earthCell('f-freq'),
    length: earthCell('f-length'),
    rule: h('span', { class: 'f-rule', 'aria-hidden': 'true', hidden: true }),
    mark: h('span', { class: 'f-mark' }),
    low: h('span', { class: 'f-low' }),
    lowEdge: earthCell('f-edge'),
    high: h('span', { class: 'f-high' }),
    highEdge: earthCell('f-edge'),
  };
  focus.rule.append(focus.mark, h('span', { class: 'caps f-end f-end-low' }, focus.low, focus.lowEdge), h('span', { class: 'caps f-end f-end-high' }, focus.highEdge, focus.high));
  focus.element = h(
    'div',
    { class: 'rung-focus', role: 'option', id: 'rung-focus', 'aria-selected': 'true', 'aria-setsize': count },
    focus.depth,
    h(
      'span',
      { class: 'f-head' },
      focus.name,
      h('span', { class: 'f-lines' }, h('span', { class: 'caps f-line f-line1' }, focus.kind, focus.band), h('span', { class: 'caps f-line f-line2' }, focus.parent, focus.made)),
    ),
    h('span', { class: 'f-values' }, focus.pure, focus.sub),
    focus.madeOf,
    h('span', { class: 'f-earth' }, focus.period, focus.frequency, focus.length),
    focus.rule,
  );

  /** What the Earth cells were last written for. */
  let earthKey = '';
  let focusKey = '';

  /** @namespace LadderRows */
  return {
    headRow,
    rows,
    focus,
    /**
     * Write what depends on the mode and on the interval: band names (both
     * modes), the Earth cells (EARTH mode; cleared in PURE mode), headings.
     * Cheap when nothing changed.
     * @param {'pure' | 'earth'} mode
     * @param {{ num: bigint, den: bigint }} interval
     * @param {string} key changes with the interval and the width class
     * @param {boolean} narrow a screen too narrow for a whole caption beside two Earth figures
     */
    write(mode, interval, key, narrow = false) {
      const next = `${mode}|${key}`;
      if (next === earthKey) return;
      earthKey = next;
      focusKey = '';
      const earth = mode === 'earth';
      setEarth(heads.period, earth ? engraved(WORDS.period) : '', true);
      setEarth(heads.frequency, earth ? engraved(WORDS.frequency) : '');
      setEarth(heads.length, earth ? engraved(WORDS.length) : '');
      for (const row of rows) {
        const facts = rungEarth(frc, row.level, interval);
        setWords(row.band, facts.bandName);
        setEarth(row.period, earth ? facts.period : '');
        setEarth(row.frequency, earth ? facts.frequency : '');
        setEarth(row.length, earth ? facts.length : '');
        // two long Earth figures side by side leave no room for the whole caption beside them (stack arrangement)
        row.element.classList.toggle('wide', earth && (narrow || facts.frequency.length + facts.length.length > WIDE_FROM_CHARS));
        row.element.setAttribute('aria-label', describeRung(row.facts, facts, earth));
      }
    },
    /**
     * Fill the large row for a rung.
     * @param {number} level
     * @param {'pure' | 'earth'} mode
     * @param {{ num: bigint, den: bigint }} interval
     */
    writeFocus(level, mode, interval) {
      const next = `${level}|${earthKey}`;
      if (next === focusKey) return;
      focusKey = next;
      const facts = rungFacts(frc, level);
      const band = rungEarth(frc, level, interval);
      const earth = mode === 'earth';
      focus.element.dataset.level = String(level);
      focus.element.classList.toggle('visible-light', band.visible);
      focus.element.setAttribute('aria-posinset', String(facts.depth));
      focus.element.setAttribute('aria-label', describeRung(facts, band, earth));
      setText(focus.depth, String(facts.depth));
      setText(focus.name, facts.name);
      setWords(focus.kind, facts.kindShort);
      setHidden(focus.kind, facts.kindShort === '');
      setWords(focus.band, band.bandName);
      setWords(focus.parent, facts.inParent);
      setHidden(focus.parent, facts.inParent === '');
      setWords(focus.made, facts.children ? `made of ${facts.children}` : '');
      setHidden(focus.made, facts.children === '');
      setReading(focus.madeOf, facts.madeOf);
      // the lead: the length down to the Blink with the rate under it; below the Blink the rate itself
      setReading(focus.pure, facts.span || facts.rateShort);
      if (facts.span) {
        focus.sub.className = 'f-sub';
        setText(focus.sub, facts.rate);
      } else {
        focus.sub.className = 'f-sub caps';
        setWords(focus.sub, WORDS.perBlink);
      }
      // EARTH: the rung that is visible light leads with its wavelength, every other with its period
      const lead = band.visible ? focus.length : focus.period;
      for (const cell of [focus.period, focus.frequency, focus.length]) cell.classList.toggle('lead', cell === lead);
      setEarth(focus.period, earth ? band.period : '', lead === focus.period);
      setEarth(focus.frequency, earth ? band.frequency : '');
      setEarth(focus.length, earth ? band.length : '', lead === focus.length);
      // the band rule: where the rung sits in its band, the neighbouring bands at its ends
      const { rule } = band;
      setHidden(focus.rule, rule === null);
      if (rule) {
        focus.mark.style.left = `${(rule.place * 100).toFixed(2)}%`;
        setWords(focus.low, rule.below);
        setWords(focus.high, rule.above);
        setEarth(focus.lowEdge, earth ? rule.low : '');
        setEarth(focus.highEdge, earth ? rule.high : '');
      } else {
        setEarth(focus.lowEdge, '');
        setEarth(focus.highEdge, '');
      }
    },
  };
}
