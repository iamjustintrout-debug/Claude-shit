import { KITS } from './kits.js';
import {
  rollsPerGroup, canPush, buildProgram, agitationCues, formatDuration,
  addWeeks, daysUntil, batchExpiry,
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
  kitId: 'adox-ctec41',
  batch: null, // { mixMl, mixedOn: 'YYYY-MM-DD', rolls }
  kitOpenedOn: null,
  halvesMixed: 0,
  prefs: { mixMl: 1000, tempC: 30, rotary: false },
};

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY));
    if (saved) return { ...DEFAULT_STATE, ...saved, prefs: { ...DEFAULT_STATE.prefs, ...saved.prefs } };
  } catch { /* storage unavailable or corrupt */ }
  return structuredClone(DEFAULT_STATE);
}

let state = loadState();
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch { /* ignore */ }
}

const kit = KITS[state.kitId];
const today = () => new Date().toLocaleDateString('sv'); // YYYY-MM-DD, local time
const fmtDate = (d) => new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const mixSizes = Object.keys(kit.mixes).map(Number);

// ---------- Tabs ----------

function showTab(name) {
  document.querySelectorAll('.tab').forEach((t) => { t.hidden = t.dataset.tab !== name; });
  document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('active', b.dataset.go === name));
  if (name === 'batch') renderBatch();
  if (name === 'develop' && !run) syncDevFromBatch();
  window.scrollTo(0, 0);
}
document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.go)));

function segmented(container, values, current, label, onPick) {
  container.replaceChildren(...values.map((v) => {
    const b = el('button', { type: 'button', textContent: label(v) });
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(v === current));
    b.addEventListener('click', () => onPick(v));
    return b;
  }));
}

// ---------- Mix ----------

function mixStep(text, amount) {
  return el('li', {}, el('label', { className: 'check' },
    el('input', { type: 'checkbox' }),
    el('span', { textContent: text }),
    el('span', { className: 'amt', textContent: `${amount} ml` })));
}

function bathCard(name, water, parts) {
  const final = water + parts.reduce((a, [, v]) => a + v, 0);
  const start = Math.min(water, Math.round(final * kit.startWaterFraction));
  const steps = [mixStep(`Water (${kit.mixWaterTempC[0]}–${kit.mixWaterTempC[1]}°C)`, start)];
  parts.forEach(([part, ml]) => steps.push(mixStep(`Add ${part}, stir`, ml)));
  if (water > start) steps.push(mixStep(`Top up with water to ${final} ml`, water - start));
  return el('div', { className: 'card' },
    el('h3', { textContent: name }),
    el('ol', { className: 'steps' }, ...steps),
    el('div', { className: 'bath-total' },
      el('span', { textContent: `Water total: ${water} ml` }),
      el('span', { textContent: `Working solution: ${final} ml` })));
}

function renderMix() {
  const ml = state.prefs.mixMl;
  segmented($('#mix-size'), mixSizes, ml, (v) => `${v} ml`, (v) => {
    state.prefs.mixMl = v; save(); renderMix();
  });
  const rolls = kit.mixes[ml].rolls;
  $('#mix-size-hint').textContent = ml === Math.max(...mixSizes)
    ? `Uses the whole kit. Develops up to ${rolls} rolls.`
    : `Uses half of each bottle. Develops up to ${rolls} rolls. The remaining concentrate keeps for ${kit.keeping.remainingAfterPartialMix} weeks.`;
  $('#mix-baths').replaceChildren(...kit.mixes[ml].baths.map((b) => bathCard(b.name, b.water, b.parts)));

  const rj = kit.remjet;
  $('#mix-remjet-box').replaceChildren(
    bathCard(`Remjet Remover (${rj.name}, sold separately)`, rj.water, [[rj.name, rj.concentrate]]),
    el('p', { className: 'hint', textContent: 'Reusable. Pour it back into its bottle after use. It darkens over time and keeps for several months.' }));
  $('#mix-remjet-box').hidden = !$('#mix-remjet').checked;

  $('#mix-notes').replaceChildren(...kit.mixNotes.map((n) => el('li', { textContent: n })));
}
$('#mix-remjet').addEventListener('change', () => { $('#mix-remjet-box').hidden = !$('#mix-remjet').checked; });

$('#mix-done').addEventListener('click', () => {
  const ml = state.prefs.mixMl;
  if (state.batch && !confirm('Replace the current batch with this new mix? The roll count restarts at 0.')) return;
  state.batch = { mixMl: ml, mixedOn: today(), rolls: 0 };
  state.kitOpenedOn ??= today();
  state.halvesMixed = Math.min(2, state.halvesMixed + ml / 500);
  save();
  document.querySelectorAll('#tab-mix .steps input').forEach((i) => { i.checked = false; });
  showTab('batch');
});

// ---------- Develop: setup ----------

const dev = {
  temp: $('#dev-temp'), mix: $('#dev-mix'), first: $('#dev-first'), rolls: $('#dev-rolls'),
  push: $('#dev-push'), rotary: $('#dev-rotary'), ecn2: $('#dev-ecn2'),
};
dev.mix.append(...mixSizes.map((v) => el('option', { value: v, textContent: `${v} ml` })));

function syncDevFromBatch() {
  if (state.batch) {
    dev.mix.value = state.batch.mixMl;
    dev.first.value = state.batch.rolls + 1;
  } else {
    dev.mix.value = state.prefs.mixMl;
    dev.first.value ||= 1;
  }
  dev.rotary.checked = state.prefs.rotary;
  renderProgram();
}

function devOptions() {
  return {
    tempC: state.prefs.tempC,
    mixMl: Number(dev.mix.value),
    firstRoll: Number(dev.first.value),
    rolls: Number(dev.rolls.value),
    pushStops: Number(dev.push.value),
  };
}

function renderProgram() {
  segmented(dev.temp, kit.temperatures, state.prefs.tempC, (v) => `${v}°C`, (v) => {
    state.prefs.tempC = v; save(); renderProgram();
  });
  const pushable = canPush(kit, state.prefs.tempC);
  if (!pushable) dev.push.value = '0';
  dev.push.disabled = !pushable;

  const opts = devOptions();
  const prog = buildProgram(kit, opts);
  const err = $('#dev-error');
  err.hidden = !prog.error;
  err.textContent = prog.error ?? '';
  $('#dev-start').disabled = !!prog.error;

  const items = [];
  if (dev.ecn2.checked) {
    items.push(el('li', {}, el('span', {}, 'Remjet removal', el('span', { className: 'sub', textContent: 'Soak 10 s, wash 30 s, repeat 3–4×' })), el('span', { className: 't', textContent: 'manual' })));
  }
  for (const s of prog.steps ?? []) {
    items.push(el('li', { className: s.critical ? 'crit' : '' },
      el('span', {}, s.name, el('span', { className: 'sub', textContent: [s.temp, s.tol].filter(Boolean).join(' ') })),
      el('span', { className: 't', textContent: formatDuration(s.sec) })));
  }
  $('#dev-program').replaceChildren(...items);

  const notes = [];
  if (prog.times) {
    const per = rollsPerGroup(kit, opts.mixMl);
    const from = prog.times.group * per + 1;
    notes.push(`Times for roll${per > 1 ? 's' : ''} ${from}–${from + per - 1} of a ${opts.mixMl} ml mix.`);
    if (prog.times.pushSec) notes.push(`Developer includes +${prog.times.pushSec} s for the push.`);
    notes.push(...prog.times.notes);
  }
  if (!pushable) notes.push(`Push times are only given for ${Object.keys(kit.pushPerStopSec).join('/')}°C.`);
  $('#dev-notes').replaceChildren(...notes.map((n) => el('li', { textContent: n })));
}

for (const k of ['mix', 'first', 'rolls', 'push', 'ecn2']) dev[k].addEventListener('input', renderProgram);
dev.rotary.addEventListener('change', () => { state.prefs.rotary = dev.rotary.checked; save(); });

// ---------- Develop: running ----------

let run = null;

const PREP = {
  preheat: 'Fill the tank with warm water from the bath. Coloured water when you empty it is normal.',
  develop: 'Pour in the developer, tap the tank twice to dislodge bubbles, then agitate.',
  wash1: 'Fill with warm water.',
  bleachFix: 'Pour in the bleach fix, tap the tank twice to dislodge bubbles, then agitate.',
  wash2: 'Wash in running or changed water.',
  stab: 'Pour in the stabilizer.',
};

$('#dev-start').addEventListener('click', () => {
  const opts = devOptions();
  const prog = buildProgram(kit, opts);
  if (prog.error) return;
  const steps = [...prog.steps];
  if (dev.ecn2.checked) {
    const rj = kit.remjet;
    steps.unshift({
      id: 'rjr', name: 'Remjet removal', manual: true, temp: `${opts.tempC}°C recommended`,
      text: `Fill with ${rj.name} at process temperature and agitate gently for about 10 s. Pour it back into its bottle, then wash with warm water for about 30 s. Repeat 3–4 times until the water runs clear with no black smudge.`,
    });
  }
  run = { opts, steps, idx: 0, rotary: dev.rotary.checked };
  unlockAudio();
  $('#dev-setup').hidden = true;
  $('#dev-run').hidden = false;
  enterStep();
  keepAwake(true);
});

function enterStep() {
  const s = run.steps[run.idx];
  Object.assign(run, { phase: 'ready', remaining: s.sec, endAt: 0, lastCue: -1, warned: false });
  $('#run-stepno').textContent = `Step ${run.idx + 1} of ${run.steps.length}`;
  $('#run-name').textContent = s.name;
  $('#run-temp').textContent = [s.temp, s.tol].filter(Boolean).join(' · ');
  $('#run-clock').hidden = !!s.manual;
  $('#run-clock').classList.remove('warn');
  $('#run-clock').textContent = formatDuration(s.sec ?? 0);
  setCue(s.manual ? s.text : PREP[s.id] ?? '', false);
  $('#run-go').textContent = s.manual ? 'Done' : 'Start step';
  $('#run-go').hidden = false;
  $('#run-pause').hidden = true;
  const next = run.steps[run.idx + 1];
  $('#run-next').textContent = next ? `Next: ${next.name}${next.sec ? ` (${formatDuration(next.sec)})` : ''}` : 'Last step';
}

function setCue(text, flash = true) {
  const c = $('#run-cue');
  c.textContent = text;
  if (flash) { c.classList.remove('flash'); void c.offsetWidth; c.classList.add('flash'); }
}

function startTimer() {
  run.phase = 'running';
  run.endAt = Date.now() + run.remaining * 1000;
  $('#run-go').hidden = true;
  $('#run-pause').hidden = false;
  $('#run-pause').textContent = 'Pause';
  const s = run.steps[run.idx];
  if (s.agitate) setCue(run.rotary ? 'Rotate continuously' : 'Agitate continuously');
  beep(660, 120);
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

  if (s.agitate && !run.rotary) {
    const cues = agitationCues(s.sec);
    let due = -1;
    cues.forEach((t, i) => { if (t <= elapsed) due = i; });
    if (due > run.lastCue && run.remaining > 10) {
      run.lastCue = due;
      setCue('Tilt once, then back in the bath');
      beep(880, 120); vibrate(150);
    } else if (run.lastCue === -1 && elapsed >= 30 && elapsed < 45) {
      run.lastCue = -0.5; // shown once between the continuous phase and the first tilt
      setCue('Back in the bath. Tilt once every 15 s');
    }
  }
  if (!run.warned && run.remaining <= 10 && s.sec > 20) {
    run.warned = true;
    setCue('10 s left. Get ready to drain');
    beep(880, 100, 2); vibrate([100, 80, 100]);
  }
  if (run.remaining <= 0) return finishStep();
  run.raf = setTimeout(tick, 200);
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
  clearTimeout(run.raf);
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
    clearTimeout(run.raf);
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
  const { firstRoll, rolls, mixMl } = run.opts;
  const total = firstRoll - 1 + rolls;
  $('#done-log').textContent = `Log ${rolls} roll${rolls > 1 ? 's' : ''} (${total} of ${kit.mixes[mixMl].rolls} used)`;
  keepAwake(false);
}

function endRun() {
  if (run) clearTimeout(run.raf);
  run = null;
  keepAwake(false);
  $('#dev-run').hidden = true;
  $('#dev-done').hidden = true;
  $('#dev-setup').hidden = false;
  syncDevFromBatch();
}

$('#done-log').addEventListener('click', () => {
  const { firstRoll, rolls, mixMl } = run.opts;
  state.batch ??= { mixMl, mixedOn: today(), rolls: 0 };
  state.batch.mixMl = mixMl;
  state.batch.rolls = firstRoll - 1 + rolls;
  save();
  endRun();
  showTab('batch');
});
$('#done-back').addEventListener('click', endRun);

// Timers are throttled in the background; catch up immediately on return.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    if (run?.phase === 'running') { clearTimeout(run.raf); tick(); }
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

const BATH_NAMES = { cd: 'Color developer', bx: 'Bleach fix', stab: 'Stabilizer' };

function useByRow(label, date) {
  const days = daysUntil(date);
  return el('tr', {},
    el('td', { textContent: label }),
    el('td', { textContent: fmtDate(date) }),
    el('td', { className: days < 0 ? 'bad' : 'ok', textContent: days < 0 ? 'expired' : `${days} d left` }));
}

function renderBatch() {
  const cur = $('#batch-current');
  const b = state.batch;
  if (!b) {
    cur.replaceChildren(el('h2', { textContent: 'Current batch' }),
      el('p', { className: 'hint', textContent: 'No batch logged yet. Mix one on the Mix tab and tap "I\'ve mixed this".' }));
  } else {
    const cap = kit.mixes[b.mixMl].rolls;
    const exp = batchExpiry(kit, b.mixedOn);
    cur.replaceChildren(
      el('h2', { textContent: `Current batch: ${b.mixMl} ml, mixed ${fmtDate(b.mixedOn)}` }),
      el('div', { className: 'big-num', textContent: `${b.rolls} / ${cap}` }),
      el('div', { className: 'hint', textContent: b.rolls >= cap ? 'Capacity reached. Mix a new batch.' : `rolls developed. Next is roll ${b.rolls + 1}.` }),
      el('div', { className: 'bar' }, el('div', { style: `width:${Math.min(100, (b.rolls / cap) * 100)}%` })),
      el('table', { className: 'tbl' },
        el('tr', {}, el('th', { textContent: 'Working solution' }), el('th', { textContent: 'Use by' }), el('th')),
        ...Object.entries(exp).map(([k, d]) => useByRow(BATH_NAMES[k], d))));
  }

  const kc = $('#batch-kit');
  const rows = [];
  if (state.kitOpenedOn && state.halvesMixed === 1) {
    rows.push(useByRow('Remaining concentrate', addWeeks(state.kitOpenedOn, kit.keeping.remainingAfterPartialMix)));
  }
  kc.replaceChildren(
    el('h2', { textContent: 'Kit' }),
    el('p', { className: 'hint', textContent: !state.kitOpenedOn ? 'Not opened yet.'
      : `Opened ${fmtDate(state.kitOpenedOn)}. ${state.halvesMixed >= 2 ? 'All concentrate used.' : state.halvesMixed === 1 ? 'Half the concentrate is left (one more 500 ml mix).' : ''}` }),
    rows.length ? el('table', { className: 'tbl' }, ...rows) : null);

  const bm = $('#batch-mix');
  if (!bm.options.length) bm.append(...mixSizes.map((v) => el('option', { value: v, textContent: `${v} ml` })));
  bm.value = b?.mixMl ?? state.prefs.mixMl;
  $('#batch-date').value = b?.mixedOn ?? '';
  $('#batch-rolls').value = b?.rolls ?? 0;
  $('#batch-opened').value = state.kitOpenedOn ?? '';
}

$('#batch-save').addEventListener('click', () => {
  const mixedOn = $('#batch-date').value;
  if (mixedOn) {
    state.batch = {
      mixMl: Number($('#batch-mix').value),
      mixedOn,
      rolls: Math.max(0, Math.floor(Number($('#batch-rolls').value) || 0)),
    };
  }
  state.kitOpenedOn = $('#batch-opened').value || null;
  save();
  renderBatch();
});

$('#batch-reset').addEventListener('click', () => {
  if (!confirm('Clear the batch, kit dates and roll count?')) return;
  state = { ...structuredClone(DEFAULT_STATE), prefs: state.prefs };
  save();
  renderBatch();
});

// ---------- Guide ----------

function renderGuide() {
  const rj = kit.remjet;
  $('#guide-ecn2').replaceChildren(...[
    `Mix ${rj.concentrate} ml ${rj.name} with ${rj.water} ml water to make ${rj.final} ml. Heat it to your process temperature (38°C recommended).`,
    'Fill the tank and agitate gently for about 10 s.',
    'Pour the remover back into its bottle and wash with warm water for about 30 s.',
    'Repeat 3–4 times until the water comes out clear with no black smudge.',
    'Then develop as normal C-41. The remover keeps for several months and can be reused.',
  ].map((t) => el('li', { textContent: t })));

  const k = kit.keeping;
  $('#guide-keeping').replaceChildren(
    el('tr', {}, el('th'), el('th', { textContent: 'Mixed' }), el('th', { textContent: 'Opened conc.' })),
    ...Object.keys(k.mixed).map((b) => el('tr', {},
      el('td', { textContent: BATH_NAMES[b] }),
      el('td', { textContent: `${k.mixed[b]} weeks` }),
      el('td', { textContent: `${k.openedConcentrate[b]} weeks` }))));

  $('#guide-trouble').replaceChildren(...kit.troubleshooting.map(([sym, cause, fix]) =>
    el('div', { className: 'trouble' }, el('b', { textContent: sym }),
      el('span', { textContent: `Cause: ${cause}` }), el('span', { textContent: `Fix: ${fix}` }))));

  $('#guide-source').textContent = `Data from the ${kit.source}. Always double-check against the sheet that came with your kit.`;
}

// ---------- Boot ----------

$('#kit-name').textContent = kit.name;
renderMix();
syncDevFromBatch();
renderGuide();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
