import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KITS } from '../js/kits.js';
import { rollGroup, runTimes, buildProgram, agitationCues, formatDuration, batchExpiry } from '../js/logic.js';

const kit = KITS['adox-ctec41'];

test('mix volumes add up to the final volume', () => {
  for (const [ml, mix] of Object.entries(kit.mixes)) {
    for (const bath of mix.baths) {
      const total = bath.water + bath.parts.reduce((a, [, v]) => a + v, 0);
      assert.equal(total, Number(ml), `${bath.name} @ ${ml}`);
    }
  }
});

test('a full mix uses exactly one bottle of each concentrate', () => {
  for (const bath of kit.mixes[1000].baths) {
    for (const [, v] of bath.parts) assert.equal(v, kit.concentrateBottleMl);
  }
});

test('roll groups: 2 rolls per column at 500 ml, 4 at 1000 ml', () => {
  assert.deepEqual([1, 2, 3, 4, 7, 8].map((r) => rollGroup(kit, 500, r)), [0, 0, 1, 1, 3, 3]);
  assert.deepEqual([1, 4, 5, 12, 13, 16].map((r) => rollGroup(kit, 1000, r)), [0, 0, 1, 2, 3, 3]);
  assert.equal(rollGroup(kit, 500, 9), null);
  assert.equal(rollGroup(kit, 1000, 17), null);
});

test('times match the datasheet tables', () => {
  assert.deepEqual(
    [1, 3, 5, 7].map((r) => runTimes(kit, { tempC: 30, mixMl: 500, firstRoll: r })).map((t) => [t.develop, t.bleachFix]),
    [[480, 360], [540, 480], [600, 720], [660, 1200]],
  );
  assert.deepEqual(
    [1, 5, 9, 13].map((r) => runTimes(kit, { tempC: 38, mixMl: 1000, firstRoll: r })).map((t) => [t.develop, t.bleachFix]),
    [[195, 240], [210, 360], [225, 600], [240, 900]],
  );
});

test('push adds 30 s per stop at 38°C and is refused at 30°C', () => {
  assert.equal(runTimes(kit, { tempC: 38, mixMl: 1000, firstRoll: 1, pushStops: 2 }).develop, 255);
  assert.ok(runTimes(kit, { tempC: 30, mixMl: 1000, firstRoll: 1, pushStops: 1 }).error);
});

test('refuses runs past capacity or more than two rolls', () => {
  assert.ok(runTimes(kit, { tempC: 38, mixMl: 500, firstRoll: 8, rolls: 2 }).error);
  assert.ok(runTimes(kit, { tempC: 38, mixMl: 1000, firstRoll: 1, rolls: 3 }).error);
  assert.ok(!runTimes(kit, { tempC: 38, mixMl: 500, firstRoll: 7, rolls: 2 }).error);
});

test('flags a run that straddles two table columns', () => {
  const t = runTimes(kit, { tempC: 30, mixMl: 1000, firstRoll: 4, rolls: 2 });
  assert.equal(t.develop, 480);
  assert.equal(t.notes.length, 1);
});

test('program resolves step times and temperatures', () => {
  const { steps } = buildProgram(kit, { tempC: 38, mixMl: 1000, firstRoll: 1 });
  assert.deepEqual(steps.map((s) => s.sec), [300, 195, 30, 240, 360, 60]);
  assert.equal(steps[1].temp, '38°C');
});

test('agitation cues every 15 s after the first 30 s', () => {
  assert.deepEqual(agitationCues(90), [45, 60, 75]);
  assert.deepEqual(agitationCues(30), []);
});

test('formatDuration', () => {
  assert.equal(formatDuration(195), '3:15');
  assert.equal(formatDuration(1200), '20:00');
  assert.equal(formatDuration(4.2), '0:05');
});

test('working-solution shelf life', () => {
  const e = batchExpiry(kit, '2026-01-01T00:00:00Z');
  assert.equal(e.cd.toISOString().slice(0, 10), '2026-02-12');
  assert.equal(e.bx.toISOString().slice(0, 10), '2026-06-18');
});
