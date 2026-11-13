/**
 * reading.js - everything the instrument shows at one instant, asked of the core.
 *
 * `readInstrument(frame, focus, depth, mode)` returns plain data: counts,
 * fractions, glyph states, names and the instants at which they next change.
 * The drawing code (draw.js) turns it into ink and never asks the core about
 * time itself; so one object describes one frame, and a test can check the
 * reading without a canvas.
 *
 * Outside the catalogue `lit` is false and only the static facts are present
 * (how many slots a ring has): the instrument stays engraved (design ruling 7).
 */
import { LevelKind, Quarter } from '../../lib/fractonica.js';
import { cycleIndexWithin, cyclesWithin, ringSteps } from '../model/halves.js';
import { clockMinute, syncHourTicks } from '../model/earth.js';

/** The four thresholds in the order they sit on the bezel: 12, 3, 6 and 9 o'clock. */
export const BEZEL_QUARTERS = Object.freeze([Quarter.END, Quarter.PEAK, Quarter.NODE, Quarter.VALLEY]);
/** Where each sits, as a fraction of the ring from 12 o'clock. */
export const BEZEL_FRACTIONS = Object.freeze({ [Quarter.END]: 0, [Quarter.PEAK]: 0.25, [Quarter.NODE]: 0.5, [Quarter.VALLEY]: 0.75 });

/** Ticks of the civil hours per sync: they change only when the sync or the zone does. */
const hourTickCache = { key: '', ticks: [] };
/** The places in the sync at which a Pentad begins, per sync number (the same for every sync, but asked, not assumed). */
const pentadStartCache = new Map();

/**
 * @param {import('../model/frame.js').Frame} frame
 * @param {number} focus the focused level, 0..13
 * @param {number} depth nested levels drawn (2 or 3)
 * @param {'pure' | 'earth'} mode
 * @returns {InstrumentReading}
 */
export function readInstrument(frame, focus, depth, mode) {
  const { frc, cat } = frame;
  const lit = frame.inCatalogue;
  const earth = mode === 'earth';
  const children = frc.factor(focus);
  const grandPerChild = frc.factor(focus + 1);

  /** @namespace InstrumentReading */
  const reading = {
    lit,
    focus,
    letter: frc.formatLevelName(focus),
    /** Phase of the focused cycle, 0..1: the carrier's lit part and the alidade's angle. */
    fraction: 0,
    /** The path to now for drawing/arcs.js nestPath; null when nothing is lit. */
    steps: null,
    /** Beads: one per child cycle, lit through `lit`. */
    beads: { count: children, lit: -1 },
    /** Bezel graduations: one per grandchild cycle, a long one at each child cycle. */
    graduations: { count: cyclesWithin(frc, focus, focus + 2), every: grandPerChild, lit: -1 },
    /** The four bezel words, in BEZEL_QUARTERS order; `time` only in Earth mode. */
    thresholds: BEZEL_QUARTERS.map((quarter) => ({ quarter, word: frc.formatQuarter(quarter), time: '' })),
    /** Which threshold comes next (a Quarter), or -1. */
    next: -1,
    /** The focused level's odometer (two 2-stroke glyph states), or null. */
    digits: null,
    /** The focused cycle's own name in the reading style ("34η"). */
    name: '',
    /** Counter rings of the ancestors, outward: parent first. */
    ancestors: [],
    /** The Sun's ring, or null (focus coarser than the Helion, or no whole sync here). */
    sun: null,
    /** Earth mode: the civil hours of the sync on the Sun's ring. */
    hourTicks: null,
    /** Instants at which something above changes state (for the scheduler). */
    changes: [],
  };

  for (let level = focus - 1; level >= 0; level--) {
    const child = lit ? frame.cycle(level + 1) : null;
    reading.ancestors.push({
      level,
      letter: frc.formatLevelName(level),
      major: frc.levelKind(level) === LevelKind.MAJOR,
      slots: frc.factor(level),
      current: child ? child.local : -1, // the running child's place in this level's cycle
      slotFraction: child ? child.fraction : 0, // how far that child has run
      fraction: lit ? frame.cycle(level).fraction : null, // the planet
    });
  }
  const sunWanted = focus >= frc.constants.SYNC_LEVEL;
  if (sunWanted) reading.sun = { slots: frc.constants.SYNC_CYCLES, current: -1, slotFraction: 0, fraction: null, groups: [] };

  if (!lit) return reading;

  const cycle = frame.cycle(focus);
  reading.fraction = cycle.fraction;
  reading.steps = ringSteps(frame, focus, depth);
  reading.beads.lit = frame.cycle(focus + 1).local;
  reading.graduations.lit = cycleIndexWithin(frame, focus, focus + 2);
  const threshold = frame.threshold(focus);
  reading.next = threshold.name;
  const odometer = frame.odometer(focus);
  reading.digits = odometer.digits;
  reading.name = frc.formatCycleName(focus, cycle.cycle, true);
  reading.changes.push(odometer.nextChange, threshold.time, frame.cycle(focus + 1).end, frame.cycle(focus + 2).end);

  if (earth) {
    const points = frame.points(focus); // start, peak, node, valley, end
    const at = { [Quarter.PEAK]: points[1], [Quarter.NODE]: points[2], [Quarter.VALLEY]: points[3], [Quarter.END]: points[4] };
    for (const item of reading.thresholds) {
      if (at[item.quarter] !== null) item.time = clockMinute(frc, at[item.quarter]);
    }
  }

  const sync = sunWanted ? frame.sync() : null;
  if (sync) {
    const helion = frame.cycle(frc.constants.SYNC_LEVEL);
    reading.sun = {
      slots: frc.constants.SYNC_CYCLES,
      current: sync.helion, // the running Helion's place in the sync, the core's
      slotFraction: helion.fraction,
      fraction: sync.fraction,
      groups: pentadStarts(cat, sync),
    };
    reading.changes.push(sync.next.time);
    if (earth) {
      const key = `${sync.sync}@${frc.utcOffsetSeconds(sync.start)}/${frc.utcOffsetSeconds(sync.end)}`;
      if (hourTickCache.key !== key) {
        hourTickCache.key = key;
        hourTickCache.ticks = syncHourTicks(frc, cat, sync);
      }
      reading.hourTicks = hourTickCache.ticks;
    }
  } else if (sunWanted) {
    reading.sun = null; // the catalogue's first or last partial sync: the core has no sync here
  }
  return reading;
}

/** The slots of the Sun's ring at which a Pentad begins (wider gaps): 0, 5, 10, 15, the core's `pentad.first`. */
function pentadStarts(cat, sync) {
  let found = pentadStartCache.get(sync.sync);
  if (!found) {
    found = [];
    for (let index = 0; index < 4; index++) {
      try {
        found.push(cat.pentadByNumber(sync.sync, index).first);
      } catch {
        // a Pentad wholly outside the catalogue has no slot to mark
      }
    }
    if (pentadStartCache.size > 16) pentadStartCache.clear();
    pentadStartCache.set(sync.sync, found);
  }
  return found;
}

/**
 * The instrument as words, for assistive technology: the focus, its cycle,
 * the next threshold and every ring's reading. Pure-safe: only core
 * notation, no Earth unit (the Earth line is added by the caller in Earth mode).
 * @param {import('../model/frame.js').Frame} frame
 * @param {number} focus
 * @returns {string}
 */
export function describeInstrument(frame, focus) {
  const { frc } = frame;
  const word = frc.formatLevelWord(focus);
  if (!frame.inCatalogue) return `Instrument, focus ${word}. Nothing lit.`;
  const parts = [`Instrument, focus ${word}: ${frc.formatCycleName(focus, frame.cycle(focus).cycle)}`];
  const threshold = frame.threshold(focus);
  parts.push(`${frc.formatQuarter(threshold.name)} in ${frame.spanTo(threshold.time)}`);
  for (let level = focus - 1; level >= 0; level--) {
    const cycle = frame.cycle(level);
    parts.push(`${frc.formatLevelWord(level)} ring: ${frc.formatCycleName(level, cycle.cycle)}, ${frc.formatQuarter(cycle.quarter, true)} quarter`);
  }
  return `${parts.join('. ')}.`;
}
