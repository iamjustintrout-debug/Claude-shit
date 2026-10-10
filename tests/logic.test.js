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

test('Cs41: variable-temperature chart, push/pull, reuse % by volume', () => {
  const cs = KITS.cs41;
  const dev = (o) => run(cs, { mixKey: 'liquid-qt', firstRoll: 1, ...o }).steps[0].sec;
  assert.equal(dev({}), 210); // 3.5 min at 102°F
  assert.equal(dev({ push: '1' }), 273); // 4.55 min
  assert.equal(dev({ push: '3' }), 525); // 8.75 min
  assert.equal(dev({ push: '-1' }), 165); // 2.75 min
  assert.equal(dev({ temp: '72' }), 3000); // 50 min
  assert.equal(dev({ temp: '85', push: '2' }), 1500); // 25 min
  assert.ok(run(cs, { mixKey: 'liquid-qt', firstRoll: 1, temp: '72', push: '1' }).error);
  assert.ok(run(cs, { mixKey: 'liquid-qt', firstRoll: 1, temp: '80', push: '3' }).error);
  // Weakened developer: +4% pint, +2% quart and powder litre, +0.5% gallon per previous roll.
  assert.equal(run(cs, { mixKey: 'liquid-qt', firstRoll: 5 }).steps[0].sec, Math.round(210 * 1.08));
  assert.equal(run(cs, { mixKey: 'liquid-pt', firstRoll: 5 }).steps[0].sec, Math.round(210 * 1.16));
  assert.equal(run(cs, { mixKey: 'liquid-gal', firstRoll: 5 }).steps[0].sec, Math.round(210 * 1.02));
  assert.equal(run(cs, { mixKey: 'powder-1l', firstRoll: 5 }).steps[0].sec, Math.round(210 * 1.08));
  // Agitation follows the temperature band.
  assert.equal(run(cs, { mixKey: 'liquid-qt', firstRoll: 1 }).steps[0].agitation.every, 30);
  assert.equal(run(cs, { mixKey: 'liquid-qt', firstRoll: 1, temp: '90' }).steps[0].agitation.every, 60);
  assert.equal(run(cs, { mixKey: 'liquid-qt', firstRoll: 1, temp: '75' }).steps[0].agitation.every, 120);
});

test('Cs41 liquid mixing matches the 2026 sheet', () => {
  const amounts = (key) => KITS.cs41.mixes[key].baths.map((b) => [b.water.start, ...b.parts.map((p) => p.ml)]);
  assert.deepEqual(amounts('liquid-pt'), [[296, 118, 30, 30], [266, 118, 30, 59], [444, 30]]);
  assert.deepEqual(amounts('liquid-qt'), [[591, 237, 59, 59], [532, 237, 59, 118], [887, 59]]);
  assert.deepEqual(amounts('liquid-gal'), [[2370, 946, 237, 237], [2130, 946, 236, 473], [3550, 237]]);
  // Concentrate goes into the printed water with no top-up step.
  for (const b of KITS.cs41.mixes['liquid-qt'].baths) assert.ok(!mixChecklist(b).some((i) => i.kind === 'topup'));
});

test('Df96: agitation sets time, push/pull sets temperature, film factor, reuse', () => {
  const df = KITS.df96;
  const step = (o) => run(df, { mixKey: '18oz', firstRoll: 1, ...o }).steps[0];
  assert.equal(step({ mode: '80' }).sec, 180);
  assert.equal(step({ mode: '75' }).sec, 240);
  assert.equal(step({ mode: '70' }).sec, 360);
  assert.deepEqual(step({ mode: '75', push: '1' }).temp, { c: 30, f: 85 });
  assert.deepEqual(step({ mode: '75', push: '1.5' }).temp, { c: 32, f: 90 });
  assert.deepEqual(step({ mode: '70', push: '-0.5' }).temp, { c: 18, f: 65 });
  assert.ok(run(df, { mixKey: '18oz', firstRoll: 1, mode: '80', push: '2' }).error);
  assert.ok(run(df, { mixKey: '18oz', firstRoll: 1, mode: '70', push: '-1' }).error);
  assert.equal(step({ mode: '80', film: 'tgrain' }).sec, 360);
  assert.equal(step({ mode: '80', film: 'pancro' }).sec, 540);
  // 18 oz: +30 s per previous roll until 8 min. 1 L: +15 s.
  assert.equal(run(df, { mixKey: '18oz', mode: '80', firstRoll: 5 }).steps[0].sec, 300);
  assert.equal(run(df, { mixKey: '18oz', mode: '70', firstRoll: 8 }).steps[0].sec, 480);
  assert.equal(run(df, { mixKey: 'liquid', mode: '80', firstRoll: 5 }).steps[0].sec, 240);
});

test('Cs6: D6/T6 chart with stock pushing, D9 dilutions', () => {
  const cs = KITS.cs6;
  const fd = (o) => run(cs, { mixKey: 'd6', firstRoll: 1, ...o });
  assert.equal(fd({}).steps[0].sec, 360); // 6 min 1+1 at 104°F
  assert.equal(fd({ strength: '0' }).steps[0].sec, 270); // stock = pull −1 column: 4.5 min
  assert.equal(fd({ push: '1' }).steps[0].sec, 480);
  assert.equal(fd({ push: '1', strength: '0' }).steps[0].sec, 360); // push +1 with stock is 6 min
  assert.equal(fd({ push: '3', strength: '0' }).steps[0].sec, 630);
  assert.ok(fd({ push: '3' }).error); // +3 needs stock
  assert.equal(fd({ temp: '72' }).steps[0].sec, 26 * 60);
  assert.ok(fd({ temp: '75', push: '1' }).error);
  assert.equal(run(cs, { mixKey: 't6', firstRoll: 1, temp: '85', push: '-2' }).steps[0].sec, 510);
  assert.deepEqual(fd({ tankMl: 500 }).notes.find((n) => n.d9), { d9: true, name: 'D6', stock: 250, water: 250, label: '1+1' });
  assert.deepEqual(fd({ tankMl: 500, strength: '0' }).notes.find((n) => n.d9), { d9: true, name: 'D6', stock: 500, water: 0, label: 'stock' });

  assert.deepEqual(dilute(500, 1), { stock: 250, water: 250 });
  assert.deepEqual(dilute(600, 2), { stock: 200, water: 400 });
  const p = run(cs, { mixKey: '1l', firstRoll: 1, dil: '3', tankMl: 480 });
  assert.equal(p.steps[0].sec, 780);
  assert.deepEqual(p.notes.find((n) => n.d9), { d9: true, name: 'D9', stock: 120, water: 360, label: '1+3' });
  const d9 = cs.options.find((o) => o.id === 'dil');
  assert.ok(d9.when({ mixKey: '1l' }) && !d9.when({ mixKey: 'd6' }));
});

test('Kodak E-6: working solutions add up, small tank and rotary programs', () => {
  const k = KITS.kodake6;
  for (const [key, mix] of Object.entries(k.mixes)) {
    assert.equal(mix.baths.length, 7);
    for (const b of mix.baths) {
      const items = mixChecklist(b);
      assert.equal(Math.round(items.reduce((a, i) => a + (i.ml ?? 0), 0) * 10) / 10, Number(key), `${key} ${b.name}`);
    }
  }
  assert.deepEqual(k.mixes[1000].baths[2].parts.map((p) => p.ml), [200, 71]);
  const tank = run(k, { mixKey: '1000', firstRoll: 1 });
  assert.deepEqual(times(tank).slice(0, 9), [360, 120, 120, 360, 120, 360, 240, 360, 60]);
  assert.equal(run(k, { mixKey: '1000', firstRoll: 1, fd: '420' }).steps[0].sec, 420);
  const rot = run(k, { mixKey: '1000', firstRoll: 1, method: 'rotary' });
  assert.equal(rot.steps.find((s) => s.id === 'cd').sec, 240);
  assert.ok(rot.steps.find((s) => s.id === 'fd').agitation.continuous);
});

test('JOBO E-6: mixing tables and roll-group times', () => {
  const j = KITS.joboe6;
  const amounts = (key) => j.mixes[key].baths.map((b) => [b.water.start, ...b.parts.map((p) => p.ml)]);
  assert.deepEqual(amounts(1000), [[800, 200], [950, 50], [780, 200, 20], [900, 100], [480, 520], [870, 130], [990, 10]]);
  assert.deepEqual(amounts(2500), [[2000, 500], [2375, 125], [1950, 500, 50], [2250, 250], [1200, 1300], [2175, 325], [2475, 25]]);
  assert.deepEqual(amounts(1250)[1], [1187.5, 62.5]);
  const step = (mixKey, firstRoll, id) => run(j, { mixKey, firstRoll }).steps.find((s) => s.id === id).sec;
  assert.deepEqual([1, 5, 9, 13].map((r) => step('1000', r, 'fd')), [375, 390, 405, 420]);
  assert.deepEqual([1, 5, 9, 13].map((r) => step('1000', r, 'cd')), [360, 420, 480, 540]);
  assert.deepEqual([1, 5, 9, 13].map((r) => step('1000', r, 'bl')), [360, 390, 420, 450]);
  assert.equal(step('2500', 11, 'fd'), 390);
  assert.ok(run(j, { mixKey: '1000', firstRoll: 17 }).error);
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
  assert.deepEqual(batchExpiry(KITS.unicolor, '2026-01-01'), []);
});
