import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KITS } from '../js/kits.js';
import { FILMS, filmGroups, findFilm, filmLabel } from '../js/films.js';
import { buildProgram, makeLogEntries, logToCSV, sanitizeLog } from '../js/logic.js';

test('film catalog: unique ids, known processes, sensible ISO', () => {
  const ids = FILMS.map((f) => f.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const f of FILMS) {
    assert.ok(['C-41', 'E-6', 'ECN-2', 'B&W'].includes(f.process), f.id);
    assert.ok(f.iso > 0 && f.iso <= 3200, f.id);
  }
  assert.equal(filmLabel(findFilm('kodak-portra-400')), 'Kodak Portra 400');
});

test('film groups put the kit process first and cover every film once', () => {
  const g = filmGroups('E-6');
  assert.match(g[0].label, /E-6/);
  assert.equal(g.reduce((a, x) => a + x.films.length, 0), FILMS.length);
});

test('log entries: one per roll with dev step, settings and numbering', () => {
  const kit = KITS.ctec41;
  const opts = { mixKey: '1000', firstRoll: 5, rolls: 2, temp: '38', push: '1', tankMl: 500 };
  const { steps } = buildProgram(kit, opts);
  const entries = makeLogEntries({
    kit, opts, steps, format: '35mm', notes: 'test, "quoted"',
    films: [{ id: 'kodak-portra-400', name: 'Kodak Portra 400' }, { id: null, name: 'Mystery film' }],
    now: new Date('2026-10-09T12:00:00Z'),
  });
  assert.equal(entries.length, 2);
  assert.deepEqual(entries.map((e) => e.rollNo), [5, 6]);
  assert.equal(entries[0].devSec, 240); // 3:30 + 30 s push
  assert.deepEqual(entries[0].devTemp, { c: 38, f: 100 });
  assert.equal(entries[1].film.id, null);
  assert.deepEqual(entries[0].settings.map((s) => s.label), ['Process temperature', 'Push']);

  const csv = logToCSV(entries, 'imperial').split('\n');
  assert.equal(csv.length, 3);
  assert.match(csv[1], /^2026-10-09,Kodak Portra 400,35mm,C-TEC 41,C-41,1000 ml,5,Process temperature: 100°F; Push: \+1,Color developer,4:00,100°F,"test, ""quoted"""$/);
});

test('sanitizeLog drops malformed imports', () => {
  const ok = { id: 'a', date: '2026-01-01T00:00:00Z', film: { name: 'X' } };
  const out = sanitizeLog([ok, null, { id: 1 }, { id: 'b', date: 'nope', film: { name: 'Y' } }, { id: 'c', date: '2026-01-01', film: {} }]);
  assert.equal(out.length, 1);
  assert.deepEqual(out[0].settings, []);
  assert.deepEqual(sanitizeLog({}), []);
});

test('rollStats: rolling windows, weekly buckets and 30-day tallies', async () => {
  const { rollStats } = await import('../js/logic.js');
  const now = new Date('2026-10-10T12:00:00');
  const day = (n, film, kit = 'C-TEC 41') => ({ date: new Date(now.getTime() - n * 864e5).toISOString(), film: { name: film }, kitName: kit });
  const log = [day(0, 'Portra 400'), day(1, 'Portra 400'), day(6, 'Gold 200'), day(8, 'Portra 400', 'Cs41'), day(29, 'Ektar 100'), day(40, 'Gold 200'), day(400, 'Portra 400')];
  const s = rollStats(log, now);
  assert.equal(s.last7, 3);
  assert.equal(s.last30, 5);
  assert.equal(s.total, 7);
  assert.equal(s.year, 6);
  assert.equal(s.weeks.length, 8);
  assert.equal(s.weeks.at(-1).count, 3);   // this week
  assert.equal(s.weeks.at(-2).count, 1);   // 8 days ago
  assert.equal(s.weeks.reduce((a, w) => a + w.count, 0), 6); // 400-day-old roll excluded, 40 days included
  assert.deepEqual(s.films30.map((f) => [f.name, f.count]), [['Portra 400', 3], ['Gold 200', 1], ['Ektar 100', 1]]);
  assert.deepEqual(s.kits30.map((k) => [k.name, k.count]), [['C-TEC 41', 4], ['Cs41', 1]]);
});
