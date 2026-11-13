/**
 * earth.js - the EARTH-mode translations, in the core's own wording.
 *
 * The core writes every Earth text the app shows (fractonica.h, "EARTH
 * WORDING": frc_format_civil_text, frc_format_duration, frc_parse_civil).
 * What this file does is choose: which form for which line, at the browser
 * zone's offset for that instant (`frc.utcOffsetSeconds`), and which instants
 * to tick on the Sun's ring. Nothing here composes a date, pads a number,
 * names a month or rounds a duration. Two things are the platform's, not the
 * core's: the zone's abbreviation ("CEST": the core cannot know it, the
 * header says a client appends its platform's) and the clock it schedules by.
 *
 * What the core does not write yet is in shim-earth-text.js (one function).
 *
 * Nothing in this file may be called in PURE mode: every caller is guarded by
 * `mode === 'earth'` (test/browser.test.js reads the pure DOM for Earth text).
 */
import { CivilForm, FractonicaError } from '../../lib/fractonica.js';
import { signedDuration } from './shim-earth-text.js';

/** The Earth sign that leads every translation sharing a block with Fractonica notation (a mark of the design). */
export const EARTH_SIGN = '⊕';

/** Civil fields of an instant in the browser's zone (the offset is the platform's, per instant). */
export function civilAt(frc, t) {
  return frc.civilFromTime(t, frc.utcOffsetSeconds(t));
}

/** An instant in one of the core's Earth forms, in the browser's zone. */
export function civilText(frc, t, form) {
  const offset = frc.utcOffsetSeconds(t);
  return frc.formatCivilText(frc.civilFromTime(t, offset), offset, form);
}

/** "12:56:12" */
export function clockTime(frc, t) {
  return civilText(frc, t, CivilForm.TIME);
}

/** "12:56": the bezel's clock times. */
export function clockMinute(frc, t) {
  return civilText(frc, t, CivilForm.MINUTE);
}

/** "7 OCT 01:34"; with seconds "9 OCT 01:34:05". */
export function dayMonthTime(frc, t, withSeconds = false) {
  return civilText(frc, t, withSeconds ? CivilForm.DAY_MONTH_SECONDS : CivilForm.DAY_MONTH_TIME);
}

/**
 * The zone's short name at an instant, from the platform ("UTC", "CEST",
 * "EST"), else the core's offset form ("UTC+5:30"). Shown once, on the date
 * line (design ruling 6). Asked in English only: the line around it is
 * English, and the browser's own locale would name the same zone "MESZ" in
 * German or not at all in French; the abbreviation must follow the zone,
 * never the reader's language.
 */
export function zoneName(frc, t) {
  const date = frc.toDate(t);
  for (const locale of ['en-GB', 'en-US']) {
    try {
      const part = new Intl.DateTimeFormat(locale, { timeZoneName: 'short' }).formatToParts(date).find((p) => p.type === 'timeZoneName');
      if (part && /^[A-Z]{2,5}$/.test(part.value)) return part.value;
    } catch {
      // an environment without Intl time zones: fall through to the offset
    }
  }
  return frc.formatCivilText(null, frc.utcOffsetSeconds(t), CivilForm.OFFSET);
}

/** "THU 8 OCT 2026 · 12:00:00 UTC": the translation of the reading (the core's date line and the zone's name). */
export function dateLine(frc, t) {
  return `${civilText(frc, t, CivilForm.DATE_TIME)} ${zoneName(frc, t)}`;
}

/** "8 OCT 2026 12:00": the Earth half of the document title. */
export function titleDate(frc, t) {
  return `${civilText(frc, t, CivilForm.DAY_MONTH_YEAR)} ${civilText(frc, t, CivilForm.MINUTE)}`;
}

/**
 * When something happens, as short as the distance allows: the clock time on
 * the same civil day, "9 OCT 01:34" within 300 days, else "8 OCT 2026".
 */
export function when(frc, t, now) {
  if (civilText(frc, t, CivilForm.ISO_DATE) === civilText(frc, now, CivilForm.ISO_DATE)) return clockTime(frc, t);
  const days = (t > now ? t - now : now - t) / frc.constants.US_PER_DAY;
  return civilText(frc, t, days < 300n ? CivilForm.DAY_MONTH_TIME : CivilForm.DAY_MONTH_YEAR);
}

/** "56 min 12 s", "5 h 3 min", "5.41 s": the Earth duration between two instants, as the core words it. */
export function duration(frc, from, to) {
  return frc.formatDuration(to > from ? to - from : from - to);
}

/**
 * When a threshold of a short cycle happens: within a minute of `now` a clock
 * time says nothing ("12:00:00" four times over), so the distance is given,
 * signed ("+5.41 s", "−0.21 s"); further away it is `when`.
 */
export function whenOrOffset(frc, t, now) {
  const micro = t > now ? t - now : now - t;
  if (micro >= 60n * BigInt(frc.constants.US_PER_SECOND)) return when(frc, t, now);
  return signedDuration(frc, t, now);
}

/** Milliseconds until the civil second changes (the core's field): when a clock-time line must be redrawn. */
export function msToNextSecond(frc, t) {
  return Math.max(1, Math.ceil((frc.constants.US_PER_SECOND - civilAt(frc, t).microsecond) / 1000));
}

/**
 * The civil hours of one solar sync, placed on the Sun's ring.
 * Each tick's `fraction` is the sync phase the core gives for that civil
 * hour (`cat.syncAt(hour).fraction`), so the hours sit exactly where the
 * sync's own ring puts them. Midnights carry the day of the month.
 *
 * WHY A WALK: the ticks are the instants at which the zone's own clock reads a
 * whole hour. Stepping whole hours of the offset at the sync's start is wrong
 * as soon as the zone changes its offset inside the sync by a part of an hour
 * (Australia/Lord_Howe moves 30 minutes): every later "hour" would fall on :30.
 * So each step asks for the next whole local hour at the offset in force NOW,
 * and the instant that comes back is read again in the zone: if a change of
 * offset lies between (the hour was skipped, or the clock now reads :30), it is
 * not a tick, and the walk goes on from there with the new offset. A repeated
 * hour (a clock set back by a whole hour) is met twice, and ticked twice.
 * Every instant and every field is the core's; nothing is written here.
 * @param {import('../../lib/fractonica.js').Fractonica} frc
 * @param {import('../../lib/fractonica.js').Catalogue} cat
 * @param {import('../../lib/fractonica.js').Sync} sync
 * @returns {{ instant: bigint, fraction: number, kind: 'hour' | 'six' | 'midnight', label?: string }[]}
 */
export function syncHourTicks(frc, cat, sync) {
  const ticks = [];
  // two steps per local hour at the most (a step that lands on :30 is followed by the whole hour)
  const limit = 2 * 24 * (frc.constants.SYNC_DAYS + 2);
  let at = sync.start;
  for (let step = 0; step < limit; step++) {
    const offset = frc.utcOffsetSeconds(at);
    const here = frc.civilFromTime(at, offset);
    // the next whole hour of the local clock: the hour field may overflow (the header: linear in every field)
    const instant = frc.timeFromCivil({ ...here, hour: here.hour + 1, minute: 0, second: 0, microsecond: 0 }, offset);
    if (instant === null || instant <= at || instant >= sync.end) break;
    at = instant;
    const local = civilAt(frc, instant); // the zone may have changed its offset on the way
    if (local.minute !== 0 || local.second !== 0 || local.microsecond !== 0) continue;
    let fraction;
    try {
      fraction = cat.syncAt(instant).fraction;
    } catch {
      continue;
    }
    const kind = local.hour === 0 ? 'midnight' : local.hour % 6 === 0 ? 'six' : 'hour';
    ticks.push(kind === 'midnight' ? { instant, fraction, kind, label: String(local.day) } : { instant, fraction, kind });
  }
  return ticks;
}

/**
 * The Earth date-time as separate terms, for the Earth tumblers of the WAVE
 * screen: the words of `dateLine`, each field on its own so that it can be
 * stepped (model/travel.js `stepCivil`). The words are the core's forms
 * (WEEKDAY, DAY_MONTH, MONTH, YEAR, TIME), taken apart where the core joins them.
 * @returns {{ weekday: string, zone: string, fields: { field: 'day' | 'month' | 'year' | 'hour' | 'minute' | 'second', label: string, text: string, lead: string }[] }}
 *   `fields` in the order they are written; `lead` is what stands before the term on the line.
 */
export function civilTerms(frc, t) {
  const [day] = civilText(frc, t, CivilForm.DAY_MONTH).split(' ');
  const [hour, minute, second] = civilText(frc, t, CivilForm.TIME).split(':');
  return {
    weekday: civilText(frc, t, CivilForm.WEEKDAY),
    zone: zoneName(frc, t),
    fields: [
      { field: 'day', label: 'Day', text: day, lead: ' ' },
      { field: 'month', label: 'Month', text: civilText(frc, t, CivilForm.MONTH), lead: ' ' },
      { field: 'year', label: 'Year', text: civilText(frc, t, CivilForm.YEAR), lead: ' ' },
      { field: 'hour', label: 'Hour', text: hour, lead: ' · ' },
      { field: 'minute', label: 'Minute', text: minute, lead: ':' },
      { field: 'second', label: 'Second', text: second, lead: ':' },
    ],
  };
}

/**
 * Read an Earth date typed by a person: everything `frc.parseCivil` reads
 * ("2026-10-08", "2026-10-08 12:00", "8 OCT 2026 12:00:30", "THU 8 OCT 2026 ·
 * 12:00:00", "2026-10-08T14:00+02:00"). A text that names no offset is read in
 * the browser's zone: the offset at `reference` first, then the offset in
 * force on that day if it differs.
 * @param {bigint} reference an instant whose zone offset is tried first
 * @returns {bigint | null} null when the text is not such a date, or names a day or a time the calendar does
 *   not have ("31 FEB 2026": the core's FRC_ERR_RANGE)
 */
export function parseEarthDate(frc, text, reference) {
  let parsed;
  try {
    parsed = frc.parseCivil(text);
  } catch (error) {
    if (error instanceof FractonicaError) return null;
    throw error;
  }
  if (parsed.offset !== null) return frc.timeFromCivil(parsed.civil, parsed.offset);
  const offset = frc.utcOffsetSeconds(reference);
  const instant = frc.timeFromCivil(parsed.civil, offset);
  if (instant === null) return null;
  // the zone's offset on that day may differ from today's
  const offsetThere = frc.utcOffsetSeconds(instant);
  return offsetThere === offset ? instant : frc.timeFromCivil(parsed.civil, offsetThere);
}
