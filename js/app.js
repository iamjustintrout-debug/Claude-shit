import { KITS, DEFAULT_KIT } from './kits.js';
import {
  buildProgram, agitationCues, formatDuration, fmtTemp, fmtTol, fmtVol, mlToFlOz, ML_PER_FL_OZ,
  mixChecklist, totalWater, addWeeks, daysUntil, batchExpiry,
} from './logic.js';

const $ = (sel) => document.querySelector(sel);
const el = (tag, props = {}, ...children) => {
  const n = Object.assign(document.createElement(tag), props);
  n.append(...children.filter((c) => c != null));
  return n;
};

// ---------- State (saved in this browser only) ----------

const STORE_KEY = 'filmdev.v1';
const DEFAULT_STATE = {
  v: 2,
  kitId: DEFAULT_KIT,
  units: 'metric',
  batches: {}, // kitId -> { mixKey, mixedOn: 'YYYY-MM-DD', rolls }
  kitMeta: {}, // kitId -> { openedOn, portionUsed }
  prefs: { mixKey: {}, opts: {}, rotary: false, tankMl: 500, agit: 'kit' },
};

// v1 only knew the C-TEC kit and kept its batch at the top level.
function migrate(s) {
  if (s.v === 2) return s;
  const out = structuredClone(DEFAULT_STATE);
  if (s.batch) out.batches.ctec41 = { mixKey: String(s.batch.mixMl), mixedOn: s.batch.mixedOn, rolls: s.batch.rolls };
  if (s.kitOpenedOn) out.kitMeta.ctec41 = { openedOn: s.kitOpenedOn, portionUsed: (s.halvesMixed ?? 0) / 2 };
  if (s.prefs?.mixMl) out.prefs.mixKey.ctec41 = String(s.prefs.mixMl);
  if (s.prefs?.tempC) out.prefs.opts.ctec41 = { temp: String(s.prefs.tempC) };
  out.prefs.rotary = !!s.prefs?.rotary;
  return out;
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY));
    if (saved) {
      const s = migrate(saved);
      return { ...structuredClone(DEFAULT_STATE), ...s, prefs: { ...DEFAULT_STATE.prefs, ...s.prefs } };
    }
  } catch { /* storage unavailable or corrupt */ }
  return structuredClone(DEFAULT_STATE);
}

let state = loadState();
if (!KITS[state.kitId]) state.kitId = DEFAULT_KIT;
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch { /* ignore */ }
}

const kit = () => KITS[state.kitId];
const units = () => state.units;
const T = (t) => fmtTemp(t, units());
const V = (ml) => fmtVol(ml, units());
const today = () => new Date().toLocaleDateString('sv'); // YYYY-MM-DD, local time
const fmtDate = (d) => new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const mixKeys = () => Object.keys(kit().mixes);
const currentMixKey = () => {
  const k = state.prefs.mixKey[state.kitId];
  return kit().mixes[k] ? k : mixKeys().at(-1);
};
const kitOpts = () => {
  const saved = state.prefs.opts[state.kitId] ?? {};
  return Object.fromEntries(kit().options.map((o) => [o.id, o.choices.some((c) => c.value === saved[o.id]) ? saved[o.id] : o.default]));
};
const batch = () => state.batches[state.kitId] ?? null;
const choiceLabel = (l) => (typeof l === 'object' ? T(l) : l);

// ---------- Header: kit + units ----------

$('#kit').append(...Object.values(KITS).map((k) => el('option', { value: k.id, textContent: `${k.name} (${k.process})` })));
$('#kit').addEventListener('change', () => {
  if (run) return;
  state.kitId = $('#kit').value;
  save();
  renderAll();
});

function renderHeader() {
  $('#kit').value = state.kitId;
  $('#kit').disabled = !!run;
  segmented($('#units'), ['metric', 'imperial'], units(), (u) => (u === 'metric' ? '°C · ml' : '°F · oz'), (u) => {
    state.units = u; save(); renderAll();
  });
  $('#kit-banner').hidden = kit().verified || !!run;
}

// ---------- Tabs ----------

let activeTab = 'mix';
function showTab(name) {
  activeTab = name;
  document.querySelectorAll('.tab').forEach((t) => { t.hidden = t.dataset.tab !== name; });
  document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('active', b.dataset.go === name));
  if (name === 'batch') renderBatch();
  if (name === 'develop' && !run) syncDevFromBatch();
  window.scrollTo(0, 0);
}
document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.go)));

function segmented(container, values, current, label, onPick, sub) {
  container.replaceChildren(...values.map((v) => {
    const b = el('button', { type: 'button' }, el('span', { textContent: label(v) }), sub?.(v) ? el('small', { textContent: sub(v) }) : null);
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(v === current));
    b.addEventListener('click', () => onPick(v));
    return b;
  }));
}

// ---------- Mix ----------

function mixRow(text, amount) {
  return el('li', {}, el('label', { className: 'check' },
    el('input', { type: 'checkbox' }),
    el('span', { textContent: text }),
    el('span', { className: amount === 'see sheet' ? 'amt muted' : 'amt', textContent: amount })));
}

function bathCard(bath) {
  const rows = mixChecklist(bath).map((i) => {
    if (i.kind === 'water') {
      return mixRow(i.temp ? `Water (${T(i.temp)})` : 'Water', i.ml == null ? 'see sheet' : V(i.ml));
    }
    if (i.kind === 'part') {
      const whole = /whole packet/.test(i.name);
      return mixRow(`Add ${i.name}, stir`, i.ml != null ? V(i.ml) : whole ? '' : 'see sheet');
    }
    return mixRow(`Top up with water to ${V(i.final)}`, i.ml != null ? V(i.ml) : '');
  });
  const water = totalWater(bath);
  return el('div', { className: 'card' },
    el('h3', { textContent: bath.name }),
    rows.length ? el('ol', { className: 'steps' }, ...rows) : null,
    ...(bath.notes ?? []).map((n) => el('p', { className: 'hint', textContent: n })),
    bath.final != null ? el('div', { className: 'bath-total' },
      el('span', { textContent: water != null && bath.water ? `Water total: ${V(water)}` : '' }),
      el('span', { textContent: `Working solution: ${V(bath.final)}` })) : null);
}

function renderMix() {
  const k = kit();
  const key = currentMixKey();
  segmented($('#mix-size'), mixKeys(), key, (v) => k.mixes[v].label, (v) => {
    state.prefs.mixKey[state.kitId] = v; save(); renderMix();
  });
  $('#mix-size-hint').textContent = k.mixHint?.(key) ?? '';
  $('#mix-baths').replaceChildren(...k.mixes[key].baths.map(bathCard));

  $('#mix-extras').replaceChildren(...(k.extras ?? []).map((x) => {
    const box = el('div', { hidden: true }, bathCard(x.bath));
    const cb = el('input', { type: 'checkbox' });
    cb.addEventListener('change', () => { box.hidden = !cb.checked; });
    return el('div', { className: 'card' }, el('label', { className: 'check' }, cb, x.label), box);
  }));

  $('#mix-notes').replaceChildren(...(k.mixNotes ?? []).map((n) => el('li', { textContent: n })));
}

$('#mix-done').addEventListener('click', () => {
  const key = currentMixKey();
  if (batch() && !confirm(`Replace the current ${kit().name} batch with this new mix? The roll count restarts at 0.`)) return;
  state.batches[state.kitId] = { mixKey: key, mixedOn: today(), rolls: 0 };
  const meta = (state.kitMeta[state.kitId] ??= { openedOn: null, portionUsed: 0 });
  meta.openedOn ??= today();
  meta.portionUsed = Math.min(1, (meta.portionUsed ?? 0) + (kit().mixes[key].portion ?? 1));
  save();
  document.querySelectorAll('#tab-mix .steps input').forEach((i) => { i.checked = false; });
  showTab('batch');
});

// ---------- Develop: setup ----------

const dev = {
  mix: $('#dev-mix'), first: $('#dev-first'), rolls: $('#dev-rolls'), agit: $('#dev-agit'),
  tank: $('#dev-tank'), rotary: $('#dev-rotary'),
};
const preStepChecks = {};

function syncDevFromBatch() {
  const k = kit();
  dev.mix.replaceChildren(...mixKeys().map((v) => el('option', { value: v, textContent: k.mixes[v].label })));
  dev.rolls.replaceChildren(...Array.from({ length: k.maxRollsPerTank }, (_, i) => el('option', { value: i + 1, textContent: i + 1 })));
  const b = batch();
  dev.mix.value = b?.mixKey ?? currentMixKey();
  dev.first.value = b ? b.rolls + 1 : 1;
  dev.agit.value = state.prefs.agit;
  dev.rotary.checked = state.prefs.rotary;
  $('#dev-rotary-wrap').hidden = !k.rotary;
  $('#dev-tank-wrap').hidden = !k.needsTankVolume;
  $('#dev-tank-label').textContent = `Tank volume (${units() === 'imperial' ? 'fl oz' : 'ml'})`;
  dev.tank.value = units() === 'imperial' ? +mlToFlOz(state.prefs.tankMl).toFixed(1) : state.prefs.tankMl;

  $('#dev-presteps').replaceChildren(...(k.preSteps ?? []).map((p) => {
    const cb = (preStepChecks[p.id] = el('input', { type: 'checkbox' }));
    cb.addEventListener('change', renderProgram);
    return el('label', { className: 'check' }, cb, p.label);
  }));
  $('#dev-toggles').hidden = !k.rotary && !(k.preSteps ?? []).length;
  renderProgram();
}

function devOptions() {
  return {
    ...kitOpts(),
    mixKey: dev.mix.value,
    firstRoll: Number(dev.first.value),
    rolls: Number(dev.rolls.value),
    tankMl: state.prefs.tankMl,
  };
}

function renderOptions() {
  const k = kit();
  const opts = kitOpts();
  $('#dev-options').replaceChildren(...k.options.filter((o) => !o.when || o.when(opts)).map((o) => {
    const seg = el('div', { className: 'seg' });
    seg.setAttribute('role', 'radiogroup');
    const byVal = Object.fromEntries(o.choices.map((c) => [c.value, c]));
    segmented(seg, o.choices.map((c) => c.value), opts[o.id], (v) => choiceLabel(byVal[v].label), (v) => {
      (state.prefs.opts[state.kitId] ??= {})[o.id] = v;
      save();
      renderProgram();
    }, (v) => byVal[v].sub);
    return el('div', { className: 'card' }, el('h2', { textContent: o.label }), seg);
  }));
}

// The agitation to use for a step, after the user's reminder setting.
function effectiveAgitation(step) {
  if (step.manual || /wash|rinse|preheat|presoak/.test(step.id)) return null;
  if (kit().rotary && state.prefs.rotary) return { continuous: true, label: 'Rotate continuously' };
  const a = state.prefs.agit;
  if (a === 'off') return null;
  if (a === 'kit') return step.agitation ?? null;
  return { initial: 0, every: Number(a), cue: 'Agitate' };
}

function stepSub(s) {
  return [T(s.temp), fmtTol(s.tol, units())].filter(Boolean).join(' ');
}

function noteText(n) {
  if (typeof n === 'string') return n;
  if (n.d9) return `D9 for your tank (${n.label}): ${V(n.stock)} stock + ${V(n.water)} water. One-shot: discard after use.`;
  return '';
}

function currentProgram() {
  const opts = devOptions();
  const prog = buildProgram(kit(), opts);
  if (prog.error) return prog;
  const pre = (kit().preSteps ?? []).filter((p) => preStepChecks[p.id]?.checked).map((p) => p.step);
  return { ...prog, steps: [...pre, ...prog.steps], opts };
}

function renderProgram() {
  renderOptions();
  const prog = currentProgram();
  const err = $('#dev-error');
  err.hidden = !prog.error;
  err.textContent = prog.error ?? '';
  $('#dev-start').disabled = !!prog.error;

  $('#dev-program').replaceChildren(...(prog.steps ?? []).map((s) => el('li', { className: s.critical ? 'crit' : '' },
    el('span', {}, s.name,
      s.unverified ? el('span', { className: 'badge', textContent: 'check sheet' }) : null,
      el('span', { className: 'sub', textContent: s.manual ? 'Manual step' : stepSub(s) })),
    el('span', { className: 't', textContent: s.manual ? '—' : formatDuration(s.sec) }))));
  $('#dev-notes').replaceChildren(...(prog.notes ?? []).map((n) => el('li', { textContent: noteText(n) })));
}

dev.mix.addEventListener('input', renderProgram);
dev.first.addEventListener('input', renderProgram);
dev.rolls.addEventListener('input', renderProgram);
dev.agit.addEventListener('change', () => { state.prefs.agit = dev.agit.value; save(); renderProgram(); });
dev.rotary.addEventListener('change', () => { state.prefs.rotary = dev.rotary.checked; save(); renderProgram(); });
dev.tank.addEventListener('input', () => {
  const v = Number(dev.tank.value);
  if (v > 0) {
    state.prefs.tankMl = Math.round(units() === 'imperial' ? v * ML_PER_FL_OZ : v);
    save();
    renderProgram();
  }
});

// ---------- Develop: running ----------

let run = null;

$('#dev-start').addEventListener('click', () => {
  const prog = currentProgram();
  if (prog.error) return;
  run = { opts: prog.opts, steps: prog.steps, idx: 0 };
  unlockAudio();
  $('#dev-setup').hidden = true;
  $('#dev-run').hidden = false;
  renderHeader();
  enterStep();
  keepAwake(true);
});

function enterStep() {
  const s = run.steps[run.idx];
  Object.assign(run, { phase: 'ready', remaining: s.sec, endAt: 0, lastCue: -1, midShown: false, warned: false, agit: effectiveAgitation(s) });
  $('#run-stepno').textContent = `Step ${run.idx + 1} of ${run.steps.length}`;
  $('#run-name').textContent = s.name;
  $('#run-temp').textContent = s.manual ? '' : [T(s.temp), fmtTol(s.tol, units())].filter(Boolean).join(' · ');
  $('#run-clock').hidden = !!s.manual;
  $('#run-clock').classList.remove('warn');
  $('#run-clock').textContent = formatDuration(s.sec ?? 0);
  setCue(s.manual ? s.text : s.prep ?? '', false);
  $('#run-go').textContent = s.manual ? 'Done' : 'Start step';
  $('#run-go').hidden = false;
  $('#run-pause').hidden = true;
  const next = run.steps[run.idx + 1];
  $('#run-next').textContent = next ? `Next: ${next.name}${next.manual ? '' : ` (${formatDuration(next.sec)})`}` : 'Last step';
}

function setCue(text, flash = true) {
  const c = $('#run-cue');
  c.textContent = text;
  if (flash) { c.classList.remove('flash'); void c.offsetWidth; c.classList.add('flash'); }
}

function startTimer() {
  const resuming = run.phase === 'paused';
  run.phase = 'running';
  run.endAt = Date.now() + run.remaining * 1000;
  $('#run-go').hidden = true;
  $('#run-pause').hidden = false;
  $('#run-pause').textContent = 'Pause';
  if (!resuming) {
    const a = run.agit;
    if (a?.continuous) setCue(a.label?.startsWith('Rotate') ? 'Rotate continuously' : 'Agitate continuously');
    else if (a?.initial) setCue(`Agitate continuously for ${a.initial} s`);
    else if (a) setCue(`${a.cue ?? 'Agitate'} now, then at each beep`);
    beep(660, 120);
  }
  tick();
}

function tick() {
  if (!run || run.phase !== 'running') return;
  const s = run.steps[run.idx];
  run.remaining = Math.max(0, (run.endAt - Date.now()) / 1000);
  const elapsed = s.sec - run.remaining;
  const clock = $('#run-clock');
  clock.textContent = formatDuration(run.remaining);
  clock.classList.toggle('warn', run.remaining <= 10);

  const a = run.agit;
  const cues = agitationCues(s.sec, a);
  if (cues.length) {
    let due = -1;
    cues.forEach((t, i) => { if (t <= elapsed) due = i; });
    if (due > run.lastCue && run.remaining > 10) {
      run.lastCue = due;
      setCue(a.cue ?? 'Agitate');
      beep(880, 120); vibrate(150);
    } else if (!run.midShown && a.initial && elapsed >= a.initial && due === -1) {
      run.midShown = true;
      setCue('Stop. Wait for the next beep');
    }
  }
  if (!run.warned && run.remaining <= 10 && s.sec > 20) {
    run.warned = true;
    setCue('10 s left. Get ready to drain');
    beep(880, 100, 2); vibrate([100, 80, 100]);
  }
  if (run.remaining <= 0) return finishStep();
  run.timer = setTimeout(tick, 200);
}

function finishStep() {
  run.phase = 'ended';
  beep(1046, 400, 3); vibrate([300, 150, 300, 150, 300]);
  const last = run.idx === run.steps.length - 1;
  setCue(last ? 'Done. Drain the tank' : 'Drain the tank');
  $('#run-pause').hidden = true;
  $('#run-go').hidden = false;
  $('#run-go').textContent = last ? 'Finish' : `Next: ${run.steps[run.idx + 1].name}`;
}

function advance() {
  clearTimeout(run.timer);
  if (run.idx === run.steps.length - 1) return finishRun();
  run.idx += 1;
  enterStep();
}

$('#run-go').addEventListener('click', () => {
  const s = run.steps[run.idx];
  if (s.manual || run.phase === 'ended') return advance();
  if (run.phase === 'ready') startTimer();
});

$('#run-pause').addEventListener('click', () => {
  if (run.phase === 'running') {
    clearTimeout(run.timer);
    run.remaining = Math.max(0, (run.endAt - Date.now()) / 1000);
    run.phase = 'paused';
    $('#run-pause').textContent = 'Resume';
  } else if (run.phase === 'paused') {
    startTimer();
  }
});

$('#run-skip').addEventListener('click', () => {
  if (run.phase === 'running' && !confirm('Skip the rest of this step?')) return;
  advance();
});

$('#run-abort').addEventListener('click', () => {
  if (!confirm('Stop processing and go back to setup?')) return;
  endRun();
});

function finishRun() {
  $('#dev-run').hidden = true;
  $('#dev-done').hidden = false;
  const { firstRoll, rolls, mixKey } = run.opts;
  const total = firstRoll - 1 + rolls;
  $('#done-log').textContent = `Log ${rolls} roll${rolls > 1 ? 's' : ''} (${total} of ${kit().mixes[mixKey].rolls} used)`;
  keepAwake(false);
}

function endRun() {
  if (run) clearTimeout(run.timer);
  run = null;
  keepAwake(false);
  $('#dev-run').hidden = true;
  $('#dev-done').hidden = true;
  $('#dev-setup').hidden = false;
  renderHeader();
  syncDevFromBatch();
}

$('#done-log').addEventListener('click', () => {
  const { firstRoll, rolls, mixKey } = run.opts;
  const b = (state.batches[state.kitId] ??= { mixKey, mixedOn: today(), rolls: 0 });
  b.mixKey = mixKey;
  b.rolls = firstRoll - 1 + rolls;
  save();
  endRun();
  showTab('batch');
});
$('#done-back').addEventListener('click', endRun);

// Timers are throttled in the background; catch up immediately on return.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    if (run?.phase === 'running') { clearTimeout(run.timer); tick(); }
    if (run) keepAwake(true);
  }
});

// ---------- Sound, vibration, wake lock ----------

let audio;
function unlockAudio() {
  try {
    // iOS: play through the silent switch.
    if (navigator.audioSession) navigator.audioSession.type = 'playback';
    audio ??= new (window.AudioContext || window.webkitAudioContext)();
    audio.resume();
  } catch { /* no audio */ }
}

function beep(freq = 880, ms = 150, count = 1) {
  if (!audio) return;
  const t0 = audio.currentTime;
  for (let i = 0; i < count; i++) {
    const start = t0 + i * (ms + 100) / 1000;
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.4, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + ms / 1000);
    osc.connect(gain).connect(audio.destination);
    osc.start(start);
    osc.stop(start + ms / 1000 + 0.02);
  }
}

function vibrate(pattern) {
  try { navigator.vibrate?.(pattern); } catch { /* unsupported */ }
}

let wakeLock = null;
async function keepAwake(on) {
  try {
    if (on && !wakeLock && 'wakeLock' in navigator) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } else if (!on && wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch { /* denied or unsupported */ }
}

// ---------- Batch ----------

function useByRow(label, date, note) {
  const days = daysUntil(date);
  return el('tr', {},
    el('td', {}, label, note ? el('span', { className: 'sub', textContent: note }) : null),
    el('td', { textContent: fmtDate(date) }),
    el('td', { className: days < 0 ? 'bad' : 'ok', textContent: days < 0 ? 'expired' : `${days} d left` }));
}

function renderBatch() {
  const k = kit();
  const cur = $('#batch-current');
  const b = batch();
  if (!b || !k.mixes[b.mixKey]) {
    cur.replaceChildren(el('h2', { textContent: `${k.name}: current batch` }),
      el('p', { className: 'hint', textContent: 'No batch logged yet. Mix one on the Mix tab and tap "I\'ve mixed this".' }));
  } else {
    const cap = k.mixes[b.mixKey].rolls;
    const exp = batchExpiry(k, b.mixedOn);
    cur.replaceChildren(
      el('h2', { textContent: `${k.name}: ${k.mixes[b.mixKey].label}, mixed ${fmtDate(b.mixedOn)}` }),
      el('div', { className: 'big-num', textContent: `${b.rolls} / ${cap}` }),
      el('div', { className: 'hint', textContent: b.rolls >= cap ? 'Capacity reached. Mix a new batch.' : `rolls developed. Next is roll ${b.rolls + 1}.` }),
      el('div', { className: 'bar' }, el('div', { style: `width:${Math.min(100, (b.rolls / cap) * 100)}%` })),
      exp.length
        ? el('table', { className: 'tbl' },
          el('tr', {}, el('th', { textContent: 'Working solution' }), el('th', { textContent: 'Use by' }), el('th')),
          ...exp.map((e) => useByRow(e.name, e.date, e.note)))
        : el('p', { className: 'hint', textContent: 'See your sheet for how long the mixed chemistry keeps.' }));
  }

  const meta = state.kitMeta[state.kitId] ?? {};
  const rows = [];
  const leftover = k.keeping?.leftoverConcentrateWeeks;
  if (leftover && meta.openedOn && meta.portionUsed > 0 && meta.portionUsed < 1) {
    rows.push(useByRow('Remaining concentrate', addWeeks(meta.openedOn, leftover)));
  }
  const status = !meta.openedOn ? 'Not opened yet.'
    : `Opened ${fmtDate(meta.openedOn)}. ${meta.portionUsed >= 1 ? 'All concentrate used.' : meta.portionUsed > 0 ? `${Math.round((1 - meta.portionUsed) * 100)}% of the concentrate is left.` : ''}`;
  $('#batch-kit').replaceChildren(
    el('h2', { textContent: 'Kit' }),
    el('p', { className: 'hint', textContent: status }),
    rows.length ? el('table', { className: 'tbl' }, ...rows) : null);

  const bm = $('#batch-mix');
  bm.replaceChildren(...mixKeys().map((v) => el('option', { value: v, textContent: k.mixes[v].label })));
  bm.value = b?.mixKey ?? currentMixKey();
  $('#batch-date').value = b?.mixedOn ?? '';
  $('#batch-rolls').value = b?.rolls ?? 0;
  $('#batch-opened').value = meta.openedOn ?? '';
}

$('#batch-save').addEventListener('click', () => {
  const mixedOn = $('#batch-date').value;
  if (mixedOn) {
    state.batches[state.kitId] = {
      mixKey: $('#batch-mix').value,
      mixedOn,
      rolls: Math.max(0, Math.floor(Number($('#batch-rolls').value) || 0)),
    };
  }
  (state.kitMeta[state.kitId] ??= { portionUsed: 0 }).openedOn = $('#batch-opened').value || null;
  save();
  renderBatch();
});

$('#batch-reset').addEventListener('click', () => {
  if (!confirm(`Clear the ${kit().name} batch, kit dates and roll count?`)) return;
  delete state.batches[state.kitId];
  delete state.kitMeta[state.kitId];
  save();
  renderBatch();
});

// ---------- Guide ----------

function renderGuide() {
  const k = kit();
  $('#guide-process').replaceChildren(...(k.agitationGuide ?? []).map((t) => el('li', { textContent: t })));

  const ecn2 = (k.preSteps ?? []).find((p) => p.id === 'ecn2');
  $('#guide-ecn2-card').hidden = !ecn2;
  if (ecn2) $('#guide-ecn2').textContent = `${ecn2.step.text} Then develop as normal C-41.`;

  const kt = k.keeping?.table;
  $('#guide-keeping-card').hidden = !kt;
  if (kt) {
    $('#guide-keeping').replaceChildren(
      el('tr', {}, el('th'), el('th', { textContent: 'Mixed' }), el('th', { textContent: 'Opened conc.' })),
      ...kt.map((row) => el('tr', {}, ...row.map((c) => el('td', { textContent: c })))));
  }

  const tr = k.troubleshooting;
  $('#guide-trouble-card').hidden = !tr;
  if (tr) {
    $('#guide-trouble').replaceChildren(...tr.map(([sym, cause, fix]) =>
      el('div', { className: 'trouble' }, el('b', { textContent: sym }),
        el('span', { textContent: `Cause: ${cause}` }), el('span', { textContent: `Fix: ${fix}` }))));
  }

  $('#guide-source').textContent = k.verified
    ? `Checked against the ${k.source}. Always follow the sheet that came with your kit.`
    : `Compiled from the ${k.source}. Not checked against the printed sheet. Always follow the sheet that came with your kit.`;
}

// ---------- Boot ----------

function renderAll() {
  renderHeader();
  renderMix();
  if (!run) syncDevFromBatch();
  renderGuide();
  if (activeTab === 'batch') renderBatch();
}

renderAll();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
