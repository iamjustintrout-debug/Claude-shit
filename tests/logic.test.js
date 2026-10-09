import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KITS } from '../js/kits.js';
import {
  buildProgram, agitationCues, formatDuration, batchExpiry, mixChecklist, totalWater,
  fmtTemp, fmtVol, fmtTol, dilute,
} from '../js/logic.js';

const ctec = KITS.ctec41;
const times = (p) => p.steps.map((s) => s.sec);
const run = (kit, o) => buildProgram(kit, { rolls: 1, tankMl: 500, ...Object.fromEntries(kit.options.map((x) => [x.id, x.default])), ...o });

test('every kit builds a program for its first roll', () => {
  for (const kit of Object.values(KITS)) {
    for (const mixKey of Object.keys(kit.mixes)) {
      const p = run(kit, { mixKey, firstRoll: 1 });
      assert.ok(!p.error, `${kit.id}/${mixKey}: ${p.error}`);
      assert.ok(p.steps.length >= 3);
      for (const s of p.steps) assert.ok(s.manual || s.sec > 0, `${kit.id} ${s.id}`);
    }
  }
});

test('C-TEC mix volumes add up and a full mix uses one bottle of each', () => {
  for (const [key, mix] of Object.entries(ctec.mixes)) {
    for (const bath of mix.baths) {
      const items = mixChecklist(bath);
      const sum = items.reduce((a, i) => a + (i.ml ?? 0), 0);
      assert.equal(sum, Number(key), bath.name);
    }
  }
  assert.deepEqual(ctec.mixes[1000].baths.map(totalWater), [400, 600, 800]);
  assert.deepEqual(ctec.mixes[500].baths.map(totalWater), [200, 300, 400]);
  for (const b of ctec.mixes[1000].baths) for (const p of b.parts) assert.equal(p.ml, 200);
});

test('C-TEC times match the datasheet tables', () => {
  assert.deepEqual([1, 3, 5, 7].map((r) => times(run(ctec, { mixKey: '500', temp: '30', firstRoll: r })).slice(1, 4)),
    [[480, 30, 360], [540, 30, 480], [600, 30, 720], [660, 30, 1200]]);
  assert.deepEqual([1, 5, 9, 13].map((r) => times(run(ctec, { mixKey: '1000', temp: '38', firstRoll: r }))),
    [[300, 195, 30, 240, 360, 60], [300, 210, 30, 360, 360, 60], [300, 225, 30, 600, 360, 60], [300, 240, 30, 900, 360, 60]]);
});

test('C-TEC push: +30 s per stop at 38°C only', () => {
  assert.equal(run(ctec, { mixKey: '1000', temp: '38', push: '2', firstRoll: 1 }).steps[1].sec, 255);
  assert.equal(run(ctec, { mixKey: '1000', temp: '30', push: '2', firstRoll: 1 }).steps[1].sec, 480);
});

test('refuses runs past capacity or over the tank limit', () => {
  assert.ok(run(ctec, { mixKey: '500', firstRoll: 8, rolls: 2 }).error);
  assert.ok(run(ctec, { mixKey: '1000', firstRoll: 1, rolls: 3 }).error);
  assert.ok(!run(ctec, { mixKey: '500', firstRoll: 7, rolls: 2 }).error);
  assert.ok(run(KITS.cs41, { mixKey: 'powder-1l', firstRoll: 25 }).error);
});

test('C-TEC flags a run that straddles two table columns', () => {
  const p = run(ctec, { mixKey: '1000', temp: '30', firstRoll: 4, rolls: 2 });
  assert.equal(p.steps[1].sec, 480);
  assert.ok(p.notes.some((n) => /two columns/.test(n)));
});

test('Cs41: 3:30, +2% per previous roll, push multipliers', () => {
  const cs = KITS.cs41;
  assert.equal(run(cs, { mixKey: 'liquid-qt', firstRoll: 1 }).steps[0].sec, 210);
  assert.equal(run(cs, { mixKey: 'liquid-qt', firstRoll: 5 }).steps[0].sec, Math.round(210 * 1.08));
  assert.equal(run(cs, { mixKey: 'liquid-qt', firstRoll: 1, push: '1' }).steps[0].sec, 273); // 4:33
  assert.equal(run(cs, { mixKey: 'liquid-qt', firstRoll: 1, push: '3' }).steps[0].sec, 525); // 8:45
});

test('Df96: time by temperature, +15 s per roll capped at 8 min', () => {
  const df = KITS.df96;
  assert.equal(run(df, { mixKey: 'liquid', mode: '80', firstRoll: 1 }).steps[0].sec, 180);
  assert.equal(run(df, { mixKey: 'liquid', mode: '70', firstRoll: 1 }).steps[0].sec, 360);
  assert.equal(run(df, { mixKey: 'liquid', mode: '80', firstRoll: 5 }).steps[0].sec, 240);
  assert.equal(run(df, { mixKey: 'liquid', mode: '70', firstRoll: 16 }).steps[0].sec, 480);
});

test('Cs6 one-shot D9 dilution for the tank', () => {
  assert.deepEqual(dilute(500, 1), { stock: 250, water: 250 });
  assert.deepEqual(dilute(600, 2), { stock: 200, water: 400 });
  const p = run(KITS.cs6, { mixKey: '1l', firstRoll: 1, dil: '3', tankMl: 480 });
  assert.equal(p.steps[0].sec, 780);
  assert.deepEqual(p.notes.find((n) => n.d9), { d9: true, stock: 120, water: 360, label: '1+3' });
});

test('mix checklist leaves unknown amounts as null instead of guessing', () => {
  const items = mixChecklist(KITS.cs41.mixes['liquid-qt'].baths[0]);
  assert.equal(items[0].ml, null);
  assert.equal(items.at(-1).kind, 'topup');
  assert.equal(items.at(-1).final, 946);
});

test('agitation cues', () => {
  assert.deepEqual(agitationCues(90, { initial: 30, every: 15 }), [45, 60, 75]);
  assert.deepEqual(agitationCues(240, { initial: 30, every: 60 }), [60, 120, 180]);
  assert.deepEqual(agitationCues(90, { continuous: true }), []);
  assert.deepEqual(agitationCues(90, null), []);
});

test('unit formatting', () => {
  assert.equal(fmtTemp({ c: 38, f: 100 }, 'metric'), '38°C');
  assert.equal(fmtTemp({ c: 38, f: 100 }, 'imperial'), '100°F');
  assert.equal(fmtTemp({ c: [24, 40], f: [75, 104] }, 'imperial'), '75–104°F');
  assert.equal(fmtTol({ c: 1, f: 2 }, 'imperial'), '±2°F');
  assert.equal(fmtVol(200, 'metric'), '200 ml');
  assert.equal(fmtVol(200, 'imperial'), '6.8 fl oz');
  assert.equal(fmtVol(946, 'imperial'), '32 fl oz');
  assert.equal(fmtVol(414, 'imperial'), '14 fl oz');
  assert.equal(fmtVol([600, 700], 'metric'), '600–700 ml');
  assert.equal(fmtVol([600, 700], 'imperial'), '20.3–23.7 fl oz');
});

test('formatDuration', () => {
  assert.equal(formatDuration(195), '3:15');
  assert.equal(formatDuration(1200), '20:00');
  assert.equal(formatDuration(4.2), '0:05');
});

test('working-solution shelf life', () => {
  const e = batchExpiry(ctec, '2026-01-01T00:00:00Z');
  assert.equal(e[0].date.toISOString().slice(0, 10), '2026-02-12');
  assert.equal(e[1].date.toISOString().slice(0, 10), '2026-06-18');
  assert.deepEqual(batchExpiry(KITS.df96, '2026-01-01'), []);
});
