import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KITS } from '../js/kits.js';
import { buildNotifications } from '../js/logic.js';

const now = new Date('2026-10-10T12:00:00');
const notes = (o) => buildNotifications({ kits: KITS, now, ...o });

test('nothing to report for fresh chemistry', () => {
  assert.deepEqual(notes({ batches: { ctec41: { mixKey: '1000', mixedOn: '2026-10-08', rolls: 2 } } }), []);
});

test('chemistry expiry: warning ahead, critical in the last 2 days and once expired', () => {
  // C-TEC developer keeps 6 weeks: mixed Sep 3 → use by Oct 15 (5 days away).
  const soon = notes({ batches: { ctec41: { mixKey: '1000', mixedOn: '2026-09-03', rolls: 2 } } });
  assert.equal(soon.length, 1);
  assert.equal(soon[0].level, 'warning');
  assert.match(soon[0].title, /color developer expires in 5 days/);
  const close = notes({ batches: { ctec41: { mixKey: '1000', mixedOn: '2026-08-30', rolls: 2 } } });
  assert.equal(close[0].level, 'critical');
  assert.notEqual(close[0].id, soon[0].id); // escalation re-notifies after a dismissal
  const gone = notes({ batches: { ctec41: { mixKey: '1000', mixedOn: '2026-08-01', rolls: 2 } } });
  assert.equal(gone[0].level, 'critical');
  assert.match(gone[0].title, /past its use-by/);
  // A shorter warning window is respected.
  assert.deepEqual(notes({ batches: { ctec41: { mixKey: '1000', mixedOn: '2026-09-03', rolls: 2 } }, prefs: { leadDays: 3 } }), []);
});

test('short-lived chemistry only warns in the last third of its life', () => {
  // Kodak E-6 keeps 1 week: no warning right after mixing.
  assert.equal(notes({ batches: { kodake6: { mixKey: '1000', mixedOn: '2026-10-09', rolls: 0 } } }).filter((n) => n.kind === 'expiry').length, 0);
  assert.equal(notes({ batches: { kodake6: { mixKey: '1000', mixedOn: '2026-10-05', rolls: 0 } } }).filter((n) => n.kind === 'expiry').length, 1);
});

test('capacity: low and used up', () => {
  const low = notes({ batches: { ctec41: { mixKey: '1000', mixedOn: '2026-10-08', rolls: 13 } } });
  assert.equal(low[0].kind, 'capacity');
  assert.equal(low[0].level, 'warning');
  assert.match(low[0].title, /3 rolls left/);
  const full = notes({ batches: { ctec41: { mixKey: '1000', mixedOn: '2026-10-08', rolls: 16 } } });
  assert.equal(full[0].level, 'critical');
  assert.equal(full[0].action.go, 'mix');
});

test('snip-test reminder for idle stored chemistry', () => {
  const batches = { df96: { mixKey: '18oz', mixedOn: '2026-09-01', rolls: 2 } };
  const log = [{ kitId: 'df96', date: '2026-09-20T10:00:00Z' }];
  const n = notes({ batches, log });
  assert.equal(n.find((x) => x.kind === 'snip').level, 'info');
  assert.ok(!notes({ batches, log: [{ kitId: 'df96', date: '2026-10-05T10:00:00Z' }] }).some((x) => x.kind === 'snip'));
  assert.ok(!notes({ batches, log, prefs: { snip: false } }).some((x) => x.kind === 'snip'));
});

test('leftover concentrate and unsaved runs', () => {
  const conc = notes({ kitMeta: { ctec41: { openedOn: '2026-07-20', portionUsed: 0.5 } } });
  assert.equal(conc[0].kind, 'concentrate');
  const r = notes({ run: { done: true, kitId: 'cs41', firstRoll: 3, films: 'Kodak Portra 400' } });
  assert.equal(r[0].kind, 'run');
  assert.match(r[0].body, /Portra 400/);
});

test('backup reminder after 5+ new rolls and 30 days', () => {
  const log = Array.from({ length: 6 }, (_, i) => ({ kitId: 'ctec41', date: `2026-10-0${i + 1}T10:00:00Z` }));
  assert.equal(notes({ log }).find((n) => n.kind === 'backup').level, 'info');
  assert.ok(!notes({ log, lastBackup: '2026-09-25T00:00:00Z' }).some((n) => n.kind === 'backup'));
  assert.ok(notes({ log, lastBackup: '2026-08-25T00:00:00Z' }).some((n) => n.kind === 'backup'));
  assert.ok(!notes({ log, prefs: { backup: false } }).some((n) => n.kind === 'backup'));
});

test('critical first', () => {
  const n = notes({
    batches: { ctec41: { mixKey: '1000', mixedOn: '2026-10-08', rolls: 16 }, cs41: { mixKey: 'liquid-qt', mixedOn: '2026-10-01', rolls: 20 } },
    log: Array.from({ length: 6 }, () => ({ kitId: 'x', date: '2026-10-01T00:00:00Z' })),
  });
  assert.deepEqual(n.map((x) => x.level), ['critical', 'warning', 'info']);
});
