// Pure functions: no DOM, no storage. Covered by tests/logic.test.js.

const DAY_MS = 24 * 60 * 60 * 1000;
export const ML_PER_FL_OZ = 29.5735;

// ---------- Units ----------

// Temperatures are stored as { c, f } (both as printed by the manufacturer),
// ranges as { c: [lo, hi], f: [lo, hi] }, or a plain string like 'room temp'.
export function fmtTemp(t, units) {
  if (t == null) return '';
  if (typeof t === 'string') return t;
  const v = units === 'imperial' ? t.f : t.c;
  const u = units === 'imperial' ? '°F' : '°C';
  return Array.isArray(v) ? `${v[0]}–${v[1]}${u}` : `${v}${u}`;
}

export function fmtTol(tol, units) {
  if (!tol) return '';
  return `±${units === 'imperial' ? tol.f : tol.c}°${units === 'imperial' ? 'F' : 'C'}`;
}

export function mlToFlOz(ml) {
  return ml / ML_PER_FL_OZ;
}

function oneVol(ml, units) {
  if (units !== 'imperial') return `${Math.round(ml)} ml`;
  const oz = mlToFlOz(ml);
  return `${oz >= 10 ? oz.toFixed(1).replace(/\.0$/, '') : oz.toFixed(1)} fl oz`;
}

// ml may be a number or a [lo, hi] range.
export function fmtVol(ml, units) {
  if (ml == null) return '';
  if (Array.isArray(ml)) {
    const [a, b] = ml.map((v) => oneVol(v, units));
    return `${a.split(' ')[0]}–${b}`;
  }
  return oneVol(ml, units);
}

export function formatDuration(sec) {
  const s = Math.max(0, Math.ceil(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// ---------- Mixing ----------

// Expand a bath definition into an ordered checklist.
// bath: { water: { start, temp } | null, parts: [{ name, ml }], final }
export function mixChecklist(bath) {
  const items = [];
  const start = bath.water?.start;
  if (bath.water) items.push({ kind: 'water', ml: start ?? null, temp: bath.water.temp });
  for (const p of bath.parts) items.push({ kind: 'part', name: p.name, ml: p.ml ?? null });
  if (bath.final != null && bath.water) {
    const partsKnown = bath.parts.every((p) => typeof p.ml === 'number');
    const topUp = typeof start === 'number' && partsKnown
      ? bath.final - start - bath.parts.reduce((a, p) => a + p.ml, 0)
      : null;
    if (topUp !== 0) items.push({ kind: 'topup', ml: topUp, final: bath.final });
  }
  return items;
}

// Total water in a bath, when every amount is known.
export function totalWater(bath) {
  if (bath.final == null || !bath.parts.every((p) => typeof p.ml === 'number')) return null;
  return bath.final - bath.parts.reduce((a, p) => a + p.ml, 0);
}

// One-shot dilution "1+n": returns { stock, water } in ml for a tank volume.
export function dilute(tankMl, waterParts) {
  const stock = tankMl / (1 + waterParts);
  return { stock: Math.round(stock), water: Math.round(tankMl - stock) };
}

// ---------- Times ----------

// Index of the time-table column for a run whose first roll is `firstRoll`.
export function rollGroup(firstRoll, rollsPerGroup) {
  return Math.floor((firstRoll - 1) / rollsPerGroup);
}

// Validate a run and ask the kit for its step list.
// opts: { mixKey, firstRoll, rolls, tankMl, ...kit option values }
export function buildProgram(kit, opts) {
  const mix = kit.mixes[opts.mixKey];
  if (!mix) return { error: 'Pick a mix size.' };
  const { firstRoll, rolls = 1 } = opts;
  if (!Number.isInteger(firstRoll) || firstRoll < 1) return { error: 'Enter which roll number this is.' };
  if (rolls < 1 || rolls > kit.maxRollsPerTank) {
    return { error: `Develop at most ${kit.maxRollsPerTank} rolls at a time with this kit.` };
  }
  const lastRoll = firstRoll + rolls - 1;
  if (lastRoll > mix.rolls) {
    return {
      error: `This mix is rated for ${mix.rolls} rolls; this run would be roll ${lastRoll}. ` +
        'The instructions do not cover going beyond that.',
    };
  }
  const out = kit.program({ ...opts, rolls, lastRoll, mix });
  if (out.error) return out;
  return { steps: out.steps.map((s) => ({ ...s, sec: Math.round(s.sec ?? 0) })), notes: out.notes ?? [] };
}

// Seconds (from step start) at which to cue an agitation. spec:
// { initial: s of continuous agitation, every: s } — cues at each multiple
// of `every` after the initial period. Continuous or unknown → no cues.
export function agitationCues(stepSec, spec) {
  if (!spec || spec.continuous || !spec.every) return [];
  const cues = [];
  for (let t = spec.every; t < stepSec; t += spec.every) if (t > (spec.initial ?? 0)) cues.push(t);
  return cues;
}

// ---------- Dates ----------

export function addWeeks(date, weeks) {
  return new Date(new Date(date).getTime() + weeks * 7 * DAY_MS);
}

export function daysUntil(date, now = new Date()) {
  return Math.ceil((new Date(date).getTime() - new Date(now).getTime()) / DAY_MS);
}

// Use-by dates for a batch: [{ name, date, note }].
export function batchExpiry(kit, mixedOn) {
  return (kit.keeping?.mixed ?? []).map((k) => ({ ...k, date: addWeeks(mixedOn, k.weeks) }));
}

// ---------- Roll log ----------

// One log entry per roll in a finished run.
// films: array (one per roll) of { id, name } — id null for typed-in films.
export function makeLogEntries({ kit, opts, steps, films, format, notes, now = new Date() }) {
  const dev = steps.find((s) => s.critical) ?? steps.find((s) => !s.manual);
  const settings = kit.options
    .filter((o) => !o.when || o.when(opts))
    .map((o) => {
      const c = o.choices.find((x) => x.value === opts[o.id]);
      return { label: o.label, value: c?.label ?? opts[o.id], sub: c?.sub };
    });
  return films.map((film, i) => ({
    id: `${now.getTime().toString(36)}-${i}-${Math.random().toString(36).slice(2, 7)}`,
    date: now.toISOString(),
    kitId: kit.id,
    kitName: kit.name,
    process: kit.process,
    mixLabel: kit.mixes[opts.mixKey]?.label ?? opts.mixKey,
    rollNo: opts.firstRoll + i,
    film: { id: film.id ?? null, name: film.name },
    format,
    settings,
    devName: dev?.name ?? '',
    devSec: dev?.sec ?? null,
    devTemp: dev?.temp ?? null,
    notes: notes ?? '',
  }));
}

function csvCell(v) {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function settingText(s, units) {
  const v = typeof s.value === 'object' ? fmtTemp(s.value, units) : s.value;
  return `${s.label}: ${v}${s.sub ? ` (${s.sub})` : ''}`;
}

export function logToCSV(entries, units = 'metric') {
  const head = ['Date', 'Film', 'Format', 'Chemistry', 'Process', 'Mix', 'Roll #', 'Settings', 'Developer step', 'Dev time', 'Dev temp', 'Notes'];
  const rows = entries.map((e) => [
    e.date.slice(0, 10), e.film.name, e.format, e.kitName, e.process, e.mixLabel, e.rollNo,
    e.settings.map((s) => settingText(s, units)).join('; '),
    e.devName, e.devSec != null ? formatDuration(e.devSec) : '', fmtTemp(e.devTemp, units), e.notes,
  ]);
  return [head, ...rows].map((r) => r.map(csvCell).join(',')).join('\n');
}

// Validate imported log data; returns only well-formed entries.
export function sanitizeLog(data) {
  if (!Array.isArray(data)) return [];
  return data.filter((e) => e && typeof e.id === 'string' && typeof e.date === 'string' && !Number.isNaN(Date.parse(e.date))
    && e.film && typeof e.film.name === 'string')
    .map((e) => ({
      settings: [], notes: '', format: '', ...e,
      settings: Array.isArray(e.settings) ? e.settings : [],
      photos: Array.isArray(e.photos) ? e.photos.filter((p) => typeof p === 'string' && /^p-[a-z0-9-]+$/.test(p)) : [],
    }));
}

// ---------- Activity stats for the dashboard ----------

const DAY = 24 * 60 * 60 * 1000;

// Counts from the roll log. Windows are rolling (last 7 / 30 days), and the
// weekly series is 8 rolling 7-day buckets ending today, oldest first.
export function rollStats(entries, now = new Date()) {
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  const t = end.getTime();
  const ageDays = (e) => (t - new Date(e.date).getTime()) / DAY;
  const within = (days) => entries.filter((e) => { const a = ageDays(e); return a >= 0 && a < days; });
  const year = String(now.getFullYear());

  const weeks = Array.from({ length: 8 }, (_, i) => {
    const startDay = new Date(t - (8 - i) * 7 * DAY + 1);
    const n = entries.filter((e) => { const a = ageDays(e); return a >= (7 - i) * 7 && a < (8 - i) * 7; }).length;
    return { start: startDay, count: n };
  });

  const tally = (list, key) => {
    const m = new Map();
    for (const e of list) {
      const k = key(e);
      if (!k) continue;
      const cur = m.get(k) ?? { name: k, count: 0, last: e.date };
      cur.count += 1;
      if (e.date > cur.last) cur.last = e.date;
      m.set(k, cur);
    }
    return [...m.values()].sort((a, b) => b.count - a.count || b.last.localeCompare(a.last));
  };
  const last30 = within(30);
  return {
    last7: within(7).length,
    last30: last30.length,
    year: entries.filter((e) => e.date.startsWith(year)).length,
    total: entries.length,
    weeks,
    films30: tally(last30, (e) => e.film?.name),
    kits30: tally(last30, (e) => e.kitName),
  };
}
