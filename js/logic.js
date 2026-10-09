// Pure functions: no DOM, no storage. Covered by tests/logic.test.js.

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// Rolls covered by each column of the time tables (2 for 500 ml, 4 for 1000 ml).
export function rollsPerGroup(kit, mixMl) {
  const mix = kit.mixes[mixMl];
  if (!mix) throw new Error(`Unknown mix size: ${mixMl}`);
  return mix.rolls / kit.times[kit.temperatures[0]].develop.length;
}

// Which table column applies to a run whose first roll is `firstRoll`
// (1-based count of rolls through this batch of chemistry). Null once
// the mix's capacity is used up.
export function rollGroup(kit, mixMl, firstRoll) {
  if (!Number.isInteger(firstRoll) || firstRoll < 1) return null;
  if (firstRoll > kit.mixes[mixMl].rolls) return null;
  return Math.floor((firstRoll - 1) / rollsPerGroup(kit, mixMl));
}

export function canPush(kit, tempC) {
  return kit.pushPerStopSec[tempC] != null;
}

// Develop and bleach-fix times for one run, or { error } if the datasheet
// doesn't cover it.
export function runTimes(kit, { tempC, mixMl, firstRoll, rolls = 1, pushStops = 0 }) {
  const table = kit.times[tempC];
  if (!table) return { error: `No times for ${tempC}°C in the datasheet.` };
  if (!kit.mixes[mixMl]) return { error: `Unknown mix size: ${mixMl} ml.` };
  if (rolls < 1 || rolls > kit.maxRollsPerTank) {
    return { error: `Develop at most ${kit.maxRollsPerTank} rolls at a time.` };
  }
  const capacity = kit.mixes[mixMl].rolls;
  const lastRoll = firstRoll + rolls - 1;
  if (lastRoll > capacity) {
    return {
      error: `This ${mixMl} ml mix is rated for ${capacity} rolls; this run would be roll ${lastRoll}. ` +
        'The datasheet does not cover going beyond that.',
    };
  }
  if (pushStops && !canPush(kit, tempC)) {
    return { error: `Push times are only given for ${Object.keys(kit.pushPerStopSec).join('/')}°C.` };
  }
  const group = rollGroup(kit, mixMl, firstRoll);
  const pushSec = pushStops ? pushStops * kit.pushPerStopSec[tempC] : 0;
  const notes = [];
  if (rollGroup(kit, mixMl, lastRoll) !== group) {
    notes.push('This run spans two columns of the time table; using the times for the first roll.');
  }
  return {
    develop: table.develop[group] + pushSec,
    bleachFix: table.bleachFix[group],
    group,
    pushSec,
    notes,
  };
}

// The full sequence of timed steps for a run.
export function buildProgram(kit, opts) {
  const times = runTimes(kit, opts);
  if (times.error) return times;
  const steps = kit.steps.map((s) => ({
    ...s,
    sec: typeof s.sec === 'string' ? times[s.sec] : s.sec,
    temp: s.temp === 'process' ? `${opts.tempC}°C` : s.temp,
  }));
  return { steps, times };
}

// Seconds (from step start) at which to cue an agitation: continuous for
// the first 30 s, then one gentle tilt every 15 s until the step ends.
export function agitationCues(stepSec, { continuousSec = 30, everySec = 15 } = {}) {
  const cues = [];
  for (let t = continuousSec + everySec; t < stepSec; t += everySec) cues.push(t);
  return cues;
}

export function formatDuration(sec) {
  const s = Math.max(0, Math.ceil(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function addWeeks(date, weeks) {
  return new Date(new Date(date).getTime() + weeks * WEEK_MS);
}

export function daysUntil(date, now = new Date()) {
  return Math.ceil((new Date(date).getTime() - new Date(now).getTime()) / (24 * 60 * 60 * 1000));
}

// Use-by dates for a batch of mixed working solution.
export function batchExpiry(kit, mixedOn) {
  const out = {};
  for (const [bath, weeks] of Object.entries(kit.keeping.mixed)) out[bath] = addWeeks(mixedOn, weeks);
  return out;
}
