/**
 * zone-probe.mjs - run by test/zones.test.js in a child process whose TZ (and LANG) the test chose: the
 * platform's zone is fixed when a process starts, so each zone needs a process of its own.
 *
 *   TZ=Australia/Lord_Howe node test/zone-probe.mjs <unix seconds> ...
 *
 * For each instant it prints, as one JSON line, what the app's Earth wording says there (the date line, the
 * zone's name, the civil hour ticks of the solar sync that holds it) and what the platform itself says
 * (an independent oracle: every quarter of an hour of the sync whose LOCAL clock reads a whole hour, by
 * the Date object's own local getters).
 */
import { load } from '../public/lib/fractonica.js';
import { dateLine, syncHourTicks, zoneName } from '../public/app/model/earth.js';

const frc = await load();
const cat = frc.saros141;
const QUARTER_HOUR = 900_000_000n;

for (const seconds of process.argv.slice(2)) {
  const t = frc.fromUnixSeconds(BigInt(seconds));
  const sync = cat.syncAt(t);
  const ticks = syncHourTicks(frc, cat, sync);
  // the oracle: local whole hours, found by the platform (every UTC offset in use is a whole quarter hour)
  const expected = [];
  for (let at = sync.start - (sync.start % QUARTER_HOUR) + QUARTER_HOUR; at < sync.end; at += QUARTER_HOUR) {
    if (at <= sync.start) continue;
    const date = new Date(Number(at / 1000n));
    if (date.getMinutes() === 0 && date.getSeconds() === 0) expected.push({ instant: String(at), hour: date.getHours(), day: date.getDate() });
  }
  console.log(
    JSON.stringify({
      seconds,
      line: dateLine(frc, t),
      zone: zoneName(frc, t),
      ticks: ticks.map((tick) => ({ instant: String(tick.instant), kind: tick.kind, label: tick.label ?? null })),
      expected,
    }),
  );
}
