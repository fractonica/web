/**
 * EARTH mode away from UTC: the app's own offset, per instant, in zones with a half-hour offset, across a
 * change of offset by a whole hour and by half an hour, and under a browser language that is not English.
 *
 * Every other Node suite runs in TZ=UTC, where a sign-flipped or a forgotten offset changes nothing. Here
 * each zone gets a child process (test/zone-probe.mjs; a process's zone is fixed when it starts), and its
 * answers are held against literals (SPEC vector A in that zone) and against the platform's own clock.
 * The same is done in a browser by test/browser-device.test.js.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const PROBE = fileURLToPath(new URL('./zone-probe.mjs', import.meta.url));
/** SPEC vector A, 2026-10-08T12:00:00Z. */
const A = '1791460800';

/** What the app says in a zone at some instants (one JSON object per instant). */
function probe(zone, seconds, lang = 'en_GB.UTF-8') {
  const out = execFileSync(process.execPath, [PROBE, ...seconds], { env: { ...process.env, TZ: zone, LANG: lang, LC_ALL: lang }, encoding: 'utf8' });
  return out.trim().split('\n').map((line) => JSON.parse(line));
}

/** The ticks the app made, held against the platform's own whole local hours, one by one. */
function holdTicks({ ticks, expected }, zone) {
  assert.deepEqual(
    ticks.map((tick) => tick.instant),
    expected.map((hour) => hour.instant),
    `${zone}: a tick at every instant the local clock reads a whole hour, and nowhere else`,
  );
  ticks.forEach((tick, i) => {
    const { hour, day } = expected[i];
    const kind = hour === 0 ? 'midnight' : hour % 6 === 0 ? 'six' : 'hour';
    assert.equal(tick.kind, kind, `${zone}: the tick at ${tick.instant} (local ${hour}:00)`);
    if (kind === 'midnight') assert.equal(tick.label, String(day));
  });
}

test('vector A in zones off UTC: the date line uses the offset of that zone, with the right sign', () => {
  const lines = {
    // English names the platform has no letters for are written as the offset (shim-earth-text.js zoneName)
    'Asia/Kolkata': 'THU 8 OCT 2026 · 17:30:00 UTC+5:30',
    'America/New_York': 'THU 8 OCT 2026 · 08:00:00 EDT',
    'America/St_Johns': 'THU 8 OCT 2026 · 09:30:00 UTC−2:30',
    'Pacific/Chatham': 'FRI 9 OCT 2026 · 01:45:00 UTC+13:45',
    'Australia/Lord_Howe': 'THU 8 OCT 2026 · 23:00:00 UTC+11',
  };
  for (const [zone, line] of Object.entries(lines)) assert.equal(probe(zone, [A])[0].line, line, zone);
});

test('the zone is named in English whatever the language of the platform ("CEST", never "MESZ")', () => {
  for (const lang of ['de_DE.UTF-8', 'fr_FR.UTF-8', 'ru_RU.UTF-8', 'en_US.UTF-8']) {
    assert.equal(probe('Europe/Berlin', [A], lang)[0].zone, 'CEST', lang);
  }
});

test('civil hour ticks on the Sun\'s ring follow the local clock across a change of offset', () => {
  // America/New_York, 2026-11-01: back by a whole hour (01:00 happens twice: both are hours of the clock)
  const york = probe('America/New_York', ['1793500000'])[0];
  holdTicks(york, 'America/New_York');
  assert.ok(york.expected.filter((hour) => hour.hour === 1).length >= 2, 'the repeated hour is in this sync');
  // Australia/Lord_Howe: half an hour forward (2026-10-04) and back (2026-04-05): the finding's two syncs
  for (const seconds of ['1791126000', '1775300000']) holdTicks(probe('Australia/Lord_Howe', [seconds])[0], `Australia/Lord_Howe at ${seconds}`);
  // half-hour and three-quarter offsets all the way through a sync
  for (const zone of ['Asia/Kolkata', 'Pacific/Chatham', 'America/St_Johns']) holdTicks(probe(zone, [A])[0], zone);
});
