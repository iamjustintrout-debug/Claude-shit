import { KITS, DEFAULT_KIT } from './kits.js';
import { FILM_FORMATS, filmGroups, filmLabel, findFilm } from './films.js';
import {
  buildProgram, agitationCues, formatDuration, fmtTemp, fmtTol, fmtVol, mlToFlOz, ML_PER_FL_OZ,
  mixChecklist, totalWater, addWeeks, daysUntil, batchExpiry,
  makeLogEntries, logToCSV, sanitizeLog, settingText,
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
  customFilms: [], // film names typed in with "Other"
  prefs: { mixKey: {}, opts: {}, rotary: false, tankMl: 500, agit: 'kit', film: {}, format: '35mm' },
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
const kitOpts = (k = kit()) => {
  const saved = state.prefs.opts[k.id] ?? {};
  return Object.fromEntries(k.options.map((o) => [o.id, o.choices.some((c) => c.value === saved[o.id]) ? saved[o.id] : o.default]));
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
  $('#kit-banner').hidden = kit().verified || !!run || activeTab === 'home' || activeTab === 'rolls';
}

// ---------- Tabs ----------

// A fresh launch opens the dashboard; reopening (or a reload) while the app
// is still open returns to the last tab, via sessionStorage.
const TAB_KEY = 'devapp.tab';
let activeTab = 'home';
function showTab(name) {
  activeTab = name;
  try { sessionStorage.setItem(TAB_KEY, name); } catch { /* ignore */ }
  document.querySelectorAll('.tab').forEach((t) => { t.hidden = t.dataset.tab !== name; });
  document.querySelectorAll('.tabs button, .home-btn').forEach((b) => b.classList.toggle('active', b.dataset.go === name));
  $('.home-btn').setAttribute('aria-current', name === 'home' ? 'page' : 'false');
  renderHeader();
  if (name === 'home') renderHome();
  if (name === 'batch') renderBatch();
  if (name === 'rolls') renderRolls();
  if (name === 'develop' && !run) syncDevFromBatch();
  window.scrollTo(0, 0);
}
document.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.go)));

// A little bounce whenever the home button is pressed.
$('.home-btn').addEventListener('click', (e) => {
  const b = e.currentTarget;
  b.classList.remove('pop');
  void b.offsetWidth; // restart the animation
  b.classList.add('pop');
});
$('.home-btn').addEventListener('animationend', (e) => { if (e.target === e.currentTarget) e.currentTarget.classList.remove('pop'); });

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
  renderDevFilms();
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

  $('#dev-program').replaceChildren(...(prog.steps ?? []).map((s, i) => {
    const li = el('li', { className: s.critical ? 'crit' : '' },
      el('span', {}, s.name,
        s.unverified ? el('span', { className: 'badge', textContent: 'check sheet' }) : null,
        el('span', { className: 'sub', textContent: s.manual ? 'Manual step' : stepSub(s) })),
      el('span', { className: 't' }, s.manual ? '—' : formatDuration(s.sec), prog.error ? null : el('span', { className: 'play', textContent: '▶' })));
    if (!prog.error) {
      li.tabIndex = 0;
      li.setAttribute('role', 'button');
      li.setAttribute('aria-label', `Start from ${s.name}`);
      li.addEventListener('click', () => startRun(i));
      li.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); startRun(i); } });
    }
    return li;
  }));
  $('#dev-notes').replaceChildren(...(prog.notes ?? []).map((n) => el('li', { textContent: noteText(n) })));
}

dev.mix.addEventListener('input', renderProgram);
dev.first.addEventListener('input', renderProgram);
dev.rolls.addEventListener('input', () => { renderDevFilms(); renderProgram(); });
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

// ---------- Film picker ----------

const OTHER = '__other';

function filmPicker(value, process, onChange) {
  const sel = el('select');
  sel.append(el('option', { value: '', textContent: 'Choose film…' }));
  if (state.customFilms.length) {
    sel.append(el('optgroup', { label: 'Your films' },
      ...state.customFilms.map((n) => el('option', { value: `custom:${n}`, textContent: n }))));
  }
  for (const g of filmGroups(process)) {
    sel.append(el('optgroup', { label: g.label }, ...g.films.map((f) => el('option', { value: f.id, textContent: filmLabel(f) }))));
  }
  sel.append(el('option', { value: OTHER, textContent: 'Other (type it in)…' }));
  sel.value = [...sel.options].some((o) => o.value === value) ? value : '';
  const input = el('input', { type: 'text', placeholder: 'Film name', hidden: true, autocomplete: 'off' });
  sel.addEventListener('change', () => {
    input.hidden = sel.value !== OTHER;
    if (!input.hidden) input.focus();
    onChange?.(sel.value);
  });
  return {
    root: el('div', { className: 'film-pick' }, sel, input),
    get() {
      if (sel.value === OTHER) {
        const name = input.value.trim();
        return name ? { id: null, name, custom: true } : null;
      }
      if (sel.value.startsWith('custom:')) return { id: null, name: sel.value.slice(7) };
      const f = findFilm(sel.value);
      return f ? { id: f.id, name: filmLabel(f) } : null;
    },
  };
}

const filmValue = (film) => (film.id ?? `custom:${film.name}`);

function rememberCustomFilms(films) {
  for (const f of films) {
    if (f?.custom && !state.customFilms.includes(f.name)) state.customFilms.push(f.name);
  }
  state.customFilms.sort((a, b) => a.localeCompare(b));
}

function formatSelect(value) {
  const sel = el('select', {}, ...FILM_FORMATS.map((f) => el('option', { value: f, textContent: f })));
  sel.value = FILM_FORMATS.includes(value) ? value : FILM_FORMATS[0];
  return sel;
}

let devFilmPickers = [];
function renderDevFilms() {
  const n = Number(dev.rolls.value) || 1;
  const saved = state.prefs.film[state.kitId] ?? [];
  devFilmPickers = Array.from({ length: n }, (_, i) => filmPicker(saved[i] ?? saved[0] ?? '', kit().process, (v) => {
    (state.prefs.film[state.kitId] ??= [])[i] = v === OTHER ? '' : v;
    save();
  }));
  $('#dev-films').replaceChildren(...devFilmPickers.map((p, i) =>
    (n > 1 ? el('label', { className: 'film-roll' }, `Roll ${i + 1}`, p.root) : p.root)));
  const fmt = $('#dev-format');
  if (!fmt.options.length) {
    fmt.append(...FILM_FORMATS.map((f) => el('option', { value: f, textContent: f })));
    fmt.addEventListener('change', () => { state.prefs.format = fmt.value; save(); });
  }
  fmt.value = state.prefs.format;
}

// ---------- Develop: running ----------

let run = null;

$('#dev-start').addEventListener('click', () => startRun(0));

function startRun(idx) {
  const prog = currentProgram();
  if (prog.error) return;
  run = {
    opts: prog.opts, steps: prog.steps, idx,
    films: devFilmPickers.map((p) => p.get() ?? { id: null, name: 'Unknown film' }),
    format: $('#dev-format').value,
  };
  unlockAudio();
  $('#dev-setup').hidden = true;
  $('#dev-run').hidden = false;
  renderHeader();
  enterStep();
  keepAwake(true);
  window.scrollTo(0, 0);
}

// ---------- Liquid-filled clock ----------

// Digits sit between y=34 (top) and y=120 (baseline) in the SVG viewBox.
const DIGIT_TOP = 34;
const DIGIT_BOTTOM = 120;
const WAVE_AMP = 5;

function wavePath(amp, length, phase) {
  // A sine wave from x=0 to 960 (seamless when shifted by a multiple of `length`),
  // closed downward into a solid body.
  let d = `M0 ${amp * Math.sin(phase)}`;
  for (let x = 10; x <= 960; x += 10) d += ` L${x} ${(amp * Math.sin((x / length) * 2 * Math.PI + phase)).toFixed(2)}`;
  return `${d} L960 200 L0 200 Z`;
}
$('#wave-front').setAttribute('d', wavePath(WAVE_AMP, 120, 0));
$('#wave-back').setAttribute('d', wavePath(WAVE_AMP, 120, Math.PI));

// progress 0 = empty, 1 = full.
function setClock(sec, progress, state = '') {
  const text = formatDuration(sec);
  $('#clock-text').textContent = text;
  $('#clock-clip-text').textContent = text;
  $('#clock-sr').textContent = text;
  const p = Math.min(1, Math.max(0, progress));
  // Margins clear the round digits' overshoot so 0% is truly empty and 100% truly full.
  const empty = DIGIT_BOTTOM + 2 * WAVE_AMP + 4;
  const full = DIGIT_TOP - 2 * WAVE_AMP - 4;
  const y = empty - p * (empty - full);
  $('#liquid').style.transform = `translateY(${y.toFixed(2)}px)`;
  $('#run-clock').className = `clock ${state}`;
}

function enterStep() {
  const s = run.steps[run.idx];
  Object.assign(run, { phase: 'ready', remaining: s.sec, endAt: 0, lastCue: -1, midShown: false, warned: false, agit: effectiveAgitation(s) });
  renderStep();
  persistRun();
}

function renderStep() {
  const s = run.steps[run.idx];
  $('#run-stepno').textContent = `Step ${run.idx + 1} of ${run.steps.length}`;
  $('#run-name').textContent = s.name;
  $('#run-temp').textContent = s.manual ? '' : [T(s.temp), fmtTol(s.tol, units())].filter(Boolean).join(' · ');
  $('#run-clock').hidden = !!s.manual;
  setClock(s.sec ?? 0, 0, 'ready');
  setCue(s.manual ? s.text : s.prep ?? '', false);
  $('#run-go').textContent = s.manual ? 'Done' : 'Start timer';
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
  persistRun();
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
  setClock(run.remaining, elapsed / s.sec, run.remaining <= 10 ? 'warn' : '');

  const a = run.agit;
  const cues = agitationCues(s.sec, a);
  if (cues.length) {
    let due = -1;
    cues.forEach((t, i) => { if (t <= elapsed) due = i; });
    if (due > run.lastCue && run.remaining > 10) {
      run.lastCue = due;
      persistRun();
      setCue(a.cue ?? 'Agitate');
      beep(880, 120); vibrate(150);
    } else if (!run.midShown && a.initial && elapsed >= a.initial && due === -1) {
      run.midShown = true;
      setCue('Stop. Wait for the next beep');
    }
  }
  if (!run.warned && run.remaining <= 10 && s.sec > 20) {
    run.warned = true;
    persistRun();
    setCue('10 s left. Get ready to drain');
    beep(880, 100, 2); vibrate([100, 80, 100]);
  }
  if (run.remaining <= 0) return finishStep();
  run.timer = setTimeout(tick, 200);
}

function finishStep(silent = false) {
  run.phase = 'ended';
  persistRun();
  setClock(0, 1, 'done');
  if (!silent) { beep(1046, 400, 3); vibrate([300, 150, 300, 150, 300]); }
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
    persistRun();
    $('#run-clock').classList.add('paused');
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
  run.done = true;
  persistRun();
  $('#done-film').textContent = `${run.films.map((f) => f.name).join(' + ')} · ${run.format}`;
  $('#done-notes').value = '';
  $('#done-log').textContent = `Save to roll log (${total} of ${kit().mixes[mixKey].rolls} used)`;
  keepAwake(false);
}

function endRun() {
  if (run) clearTimeout(run.timer);
  run = null;
  persistRun();
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
  rememberCustomFilms(run.films);
  rollLog.push(...makeLogEntries({
    kit: kit(), opts: run.opts, steps: run.steps, films: run.films,
    format: run.format, notes: $('#done-notes').value.trim(),
  }));
  saveLog();
  save();
  endRun();
  showTab('rolls');
});
$('#done-back').addEventListener('click', endRun);

// ---------- Keep a run across app restarts ----------
// iOS may close a backgrounded web app. Save the run so reopening picks up
// where it left off (the countdown continues from its absolute end time).

const RUN_KEY = 'devapp.run';
const RUN_MAX_AGE_MS = 6 * 60 * 60 * 1000;

function persistRun() {
  try {
    if (!run) return localStorage.removeItem(RUN_KEY);
    const { timer, ...data } = run;
    localStorage.setItem(RUN_KEY, JSON.stringify({ ...data, kitId: state.kitId, savedAt: Date.now() }));
  } catch { /* ignore */ }
}

function restoreRun() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(RUN_KEY)); } catch { /* ignore */ }
  if (!saved || !KITS[saved.kitId] || !Array.isArray(saved.steps) || !saved.steps[saved.idx]
    || Date.now() - saved.savedAt > RUN_MAX_AGE_MS) {
    try { localStorage.removeItem(RUN_KEY); } catch { /* ignore */ }
    return false;
  }
  const { savedAt, kitId, ...data } = saved;
  state.kitId = kitId;
  run = data;
  $('#dev-setup').hidden = true;
  if (run.done) {
    finishRun();
    return true;
  }
  $('#dev-run').hidden = false;
  renderStep();
  const s = run.steps[run.idx];
  if (run.phase === 'running') {
    $('#run-go').hidden = true;
    $('#run-pause').hidden = false;
    if (run.endAt <= Date.now()) { run.remaining = 0; finishStep(true); } else tick();
  } else if (run.phase === 'paused') {
    setClock(run.remaining, 1 - run.remaining / s.sec, 'paused');
    $('#run-go').hidden = true;
    $('#run-pause').hidden = false;
    $('#run-pause').textContent = 'Resume';
  } else if (run.phase === 'ended') {
    finishStep(true);
  }
  keepAwake(true);
  // Audio can only start after a tap.
  document.addEventListener('pointerdown', unlockAudio, { once: true });
  return true;
}

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

// ---------- Roll log ----------

const LOG_KEY = 'filmdev.log.v1';
let rollLog = loadLog();
let editingId = null;

function loadLog() {
  try { return sanitizeLog(JSON.parse(localStorage.getItem(LOG_KEY)) ?? []); } catch { return []; }
}
function saveLog() {
  try { localStorage.setItem(LOG_KEY, JSON.stringify(rollLog)); } catch { alert('Could not save the roll log on this device.'); }
}
// Ask the browser not to evict our data under storage pressure.
navigator.storage?.persist?.().catch(() => {});

const sortedLog = () => [...rollLog].sort((a, b) => b.date.localeCompare(a.date) || (b.rollNo ?? 0) - (a.rollNo ?? 0));

function renderRollStats() {
  const year = String(new Date().getFullYear());
  const counts = {};
  for (const e of rollLog) counts[e.film.name] = (counts[e.film.name] ?? 0) + 1;
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 3);
  $('#rolls-stats').replaceChildren(
    el('h2', { textContent: 'Roll log' }),
    el('div', { className: 'stat-row' },
      el('div', {}, el('div', { className: 'big-num', textContent: rollLog.length }), el('div', { className: 'hint', textContent: 'rolls logged' })),
      el('div', {}, el('div', { className: 'big-num', textContent: rollLog.filter((e) => e.date.startsWith(year)).length }), el('div', { className: 'hint', textContent: `in ${year}` }))),
    top.length ? el('p', { className: 'hint', textContent: `Most used: ${top.map(([n, c]) => `${n} (${c})`).join(', ')}` }) : null);
}

function rollCard(e) {
  if (e.id === editingId) return rollEditor(e);
  const dev = e.devSec != null ? `${e.devName} ${formatDuration(e.devSec)}${e.devTemp ? ` at ${T(e.devTemp)}` : ''}` : '';
  const meta = [fmtDate(e.date), e.kitName, e.rollNo ? `roll #${e.rollNo}` : null, e.mixLabel || null].filter(Boolean).join(' · ');
  const edit = el('button', { className: 'btn small', textContent: 'Edit' });
  edit.addEventListener('click', () => { editingId = e.id; renderRolls(); });
  const del = el('button', { className: 'btn small ghost danger', textContent: 'Delete' });
  del.addEventListener('click', () => {
    if (!confirm(`Delete this ${e.film.name} roll from the log?`)) return;
    rollLog = rollLog.filter((x) => x.id !== e.id);
    saveLog();
    renderRolls();
  });
  return el('div', { className: 'card roll' },
    el('div', { className: 'roll-head' }, el('b', { textContent: e.film.name }), e.format ? el('span', { className: 'chip', textContent: e.format }) : null),
    el('div', { className: 'hint', textContent: meta }),
    e.settings.length ? el('div', { className: 'roll-line', textContent: e.settings.map((x) => settingText(x, units())).join(' · ') }) : null,
    dev ? el('div', { className: 'roll-line', textContent: dev }) : null,
    e.notes ? el('p', { className: 'roll-notes', textContent: e.notes }) : null,
    el('div', { className: 'btn-row' }, edit, del));
}

function rollForm({ film, format, date, notes, kitId, withKit }) {
  const picker = filmPicker(film, KITS[kitId]?.process ?? 'C-41');
  const fmt = formatSelect(format);
  const dateIn = el('input', { type: 'date', value: date });
  const notesIn = el('textarea', { rows: 2, value: notes ?? '' });
  const kitSel = withKit ? el('select', {}, ...Object.values(KITS).map((k) => el('option', { value: k.id, textContent: k.name })),
    el('option', { value: '', textContent: 'Other / lab' })) : null;
  if (kitSel) kitSel.value = kitId ?? '';
  const root = el('div', { className: 'roll-form' },
    el('label', {}, 'Film', picker.root),
    el('div', { className: 'grid2' }, el('label', {}, 'Format', fmt), el('label', {}, 'Date', dateIn)),
    kitSel ? el('label', {}, 'Chemistry', kitSel) : null,
    el('label', {}, 'Notes', notesIn));
  return { root, read: () => ({ film: picker.get(), format: fmt.value, date: dateIn.value, notes: notesIn.value.trim(), kitId: kitSel?.value }) };
}

function rollEditor(e) {
  const form = rollForm({ film: filmValue(e.film), format: e.format, date: e.date.slice(0, 10), notes: e.notes, kitId: e.kitId });
  const saveBtn = el('button', { className: 'btn primary small', textContent: 'Save' });
  const cancel = el('button', { className: 'btn small ghost', textContent: 'Cancel' });
  saveBtn.addEventListener('click', () => {
    const v = form.read();
    if (!v.film) return alert('Choose a film or type its name.');
    rememberCustomFilms([v.film]);
    Object.assign(e, {
      film: { id: v.film.id, name: v.film.name }, format: v.format, notes: v.notes,
      date: v.date && v.date !== e.date.slice(0, 10) ? `${v.date}T12:00:00.000Z` : e.date,
    });
    editingId = null;
    saveLog(); save();
    renderRolls();
  });
  cancel.addEventListener('click', () => { editingId = null; renderRolls(); });
  return el('div', { className: 'card roll editing' }, form.root, el('div', { className: 'btn-row' }, saveBtn, cancel));
}

function renderRolls() {
  renderRollStats();
  const kf = $('#rolls-kit');
  if (!kf.options.length) {
    kf.append(el('option', { value: '', textContent: 'All' }), ...Object.values(KITS).map((k) => el('option', { value: k.id, textContent: k.name })));
  }
  const q = $('#rolls-q').value.trim().toLowerCase();
  const list = sortedLog().filter((e) => (!kf.value || e.kitId === kf.value)
    && (!q || `${e.film.name} ${e.notes} ${e.format} ${e.kitName}`.toLowerCase().includes(q)));
  $('#rolls-list').replaceChildren(...(list.length ? list.map(rollCard) : [el('p', { className: 'hint center',
    textContent: rollLog.length ? 'No rolls match.' : 'No rolls yet. Finish a development run and tap "Save to roll log", or add a past roll below.' })]));
  renderAddRoll();
}
$('#rolls-q').addEventListener('input', renderRolls);
$('#rolls-kit').addEventListener('change', renderRolls);

function renderAddRoll() {
  const form = rollForm({ film: '', format: state.prefs.format, date: today(), notes: '', kitId: state.kitId, withKit: true });
  const add = el('button', { className: 'btn primary wide', textContent: 'Add roll' });
  add.addEventListener('click', () => {
    const v = form.read();
    if (!v.film) return alert('Choose a film or type its name.');
    const k = KITS[v.kitId];
    rememberCustomFilms([v.film]);
    rollLog.push({
      id: `${Date.now().toString(36)}-m-${Math.random().toString(36).slice(2, 7)}`,
      date: `${v.date || today()}T12:00:00.000Z`,
      kitId: k?.id ?? '', kitName: k?.name ?? 'Other / lab', process: k?.process ?? '', mixLabel: '', rollNo: null,
      film: { id: v.film.id, name: v.film.name }, format: v.format, settings: [], devName: '', devSec: null, devTemp: null, notes: v.notes,
    });
    saveLog(); save();
    renderRolls();
  });
  $('#rolls-add').replaceChildren(form.root, add);
}

function download(name, text, type) {
  const blob = new Blob([text], { type });
  const file = new File([blob], name, { type });
  if (navigator.canShare?.({ files: [file] })) {
    navigator.share({ files: [file], title: name }).catch(() => {});
    return;
  }
  const a = el('a', { href: URL.createObjectURL(blob), download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

$('#rolls-csv').addEventListener('click', () => download(`devapp-rolls-${today()}.csv`, logToCSV(sortedLog(), units()), 'text/csv'));
$('#rolls-json').addEventListener('click', () => download(`devapp-backup-${today()}.json`,
  JSON.stringify({ app: 'DevApp', version: 1, rolls: rollLog, customFilms: state.customFilms }, null, 2), 'application/json'));
$('#rolls-import').addEventListener('change', async (ev) => {
  const file = ev.target.files?.[0];
  ev.target.value = '';
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    const incoming = sanitizeLog(Array.isArray(data) ? data : data.rolls);
    const have = new Set(rollLog.map((e) => e.id));
    const added = incoming.filter((e) => !have.has(e.id));
    rollLog.push(...added);
    if (Array.isArray(data.customFilms)) {
      rememberCustomFilms(data.customFilms.filter((n) => typeof n === 'string').map((name) => ({ name, custom: true })));
    }
    saveLog(); save();
    renderRolls();
    alert(`Imported ${added.length} roll${added.length === 1 ? '' : 's'}${incoming.length > added.length ? ` (${incoming.length - added.length} already in the log)` : ''}.`);
  } catch {
    alert("That file isn't a DevApp backup.");
  }
});

// ---------- Home dashboard ----------

function chemCard(k, b) {
  const mix = k.mixes[b.mixKey];
  const cap = mix?.rolls ?? 0;
  const left = Math.max(0, cap - b.rolls);
  const ageDays = -daysUntil(b.mixedOn);
  const exp = batchExpiry(k, b.mixedOn).sort((x, y) => x.date - y.date)[0];
  const expDays = exp ? daysUntil(exp.date) : null;
  const status = left === 0 ? { text: 'Used up', cls: 'bad' }
    : expDays != null && expDays < 0 ? { text: 'Expired', cls: 'bad' }
      : expDays != null && expDays <= 7 ? { text: 'Expiring soon', cls: 'warn-text' }
        : { text: 'Active', cls: 'ok' };

  let next = null;
  if (left > 0) {
    const prog = buildProgram(k, { ...kitOpts(k), mixKey: b.mixKey, firstRoll: b.rolls + 1, rolls: 1, tankMl: state.prefs.tankMl });
    const d = prog.steps?.find((x) => x.critical);
    if (d) next = `Next: roll #${b.rolls + 1} · ${d.name} ${formatDuration(d.sec)} at ${T(d.temp)}`;
  }

  const go = el('button', { className: 'btn primary small', textContent: left > 0 ? 'Develop' : 'Mix new batch' });
  go.addEventListener('click', () => { selectKit(k.id); showTab(left > 0 ? 'develop' : 'mix'); });
  const details = el('button', { className: 'btn small', textContent: 'Batch details' });
  details.addEventListener('click', () => { selectKit(k.id); showTab('batch'); });

  return el('div', { className: `card chem${k.id === state.kitId ? ' selected' : ''}` },
    el('div', { className: 'chem-head' },
      el('div', {}, el('b', { textContent: k.name }), el('span', { className: 'chip', textContent: k.process })),
      el('span', { className: `status ${status.cls}`, textContent: status.text })),
    el('div', { className: 'hint', textContent: `${mix?.label ?? b.mixKey} · mixed ${fmtDate(b.mixedOn)} (${ageDays === 0 ? 'today' : `${ageDays} day${ageDays === 1 ? '' : 's'} ago`})` }),
    el('div', { className: 'chem-count' },
      el('span', { className: 'big-num', textContent: b.rolls }),
      el('span', { className: 'hint', textContent: ` of ${cap} rolls developed · ${left} left` })),
    el('div', { className: 'bar' }, el('div', { style: `width:${cap ? Math.min(100, (b.rolls / cap) * 100) : 0}%` })),
    exp ? el('div', { className: 'roll-line', textContent: expDays < 0
      ? `${exp.name} expired ${-expDays} day${expDays === -1 ? '' : 's'} ago`
      : `Use ${exp.name.toLowerCase()} by ${fmtDate(exp.date)} (${expDays} day${expDays === 1 ? '' : 's'})` }) : null,
    next ? el('div', { className: 'roll-line', textContent: next }) : null,
    el('div', { className: 'btn-row' }, go, details));
}

function selectKit(id) {
  if (run || !KITS[id]) return;
  state.kitId = id;
  save();
  renderAll();
}

function renderHome() {
  const entries = Object.entries(state.batches).filter(([id, b]) => KITS[id] && b && KITS[id].mixes[b.mixKey]);
  const rank = ([id, b]) => (b.rolls >= KITS[id].mixes[b.mixKey].rolls ? 1 : 0);
  entries.sort((a, b) => rank(a) - rank(b) || b[1].mixedOn.localeCompare(a[1].mixedOn));

  const items = [el('h2', { className: 'section-title', textContent: 'Your chemistry' })];
  if (entries.length) {
    items.push(...entries.map(([id, b]) => chemCard(KITS[id], b)));
  } else {
    const mixBtn = el('button', { className: 'btn primary wide', textContent: 'Mix chemistry' });
    mixBtn.addEventListener('click', () => showTab('mix'));
    items.push(el('div', { className: 'card' },
      el('p', { textContent: 'No chemistry mixed yet. Pick your kit at the top, then mix a batch.' }), mixBtn));
  }

  const recent = sortedLog().slice(0, 3);
  const all = el('button', { className: 'btn small', textContent: 'All rolls' });
  all.addEventListener('click', () => showTab('rolls'));
  items.push(el('h2', { className: 'section-title', textContent: 'Recent rolls' }),
    el('div', { className: 'card' },
      recent.length
        ? el('ul', { className: 'recent' }, ...recent.map((e) => el('li', {},
          el('b', { textContent: e.film.name }),
          el('span', { className: 'hint', textContent: ` ${e.format ? `${e.format} · ` : ''}${fmtDate(e.date)} · ${e.kitName}` }))))
        : el('p', { className: 'hint', textContent: 'No rolls logged yet.' }),
      el('div', { className: 'btn-row' }, el('span', { className: 'hint', textContent: `${rollLog.length} roll${rollLog.length === 1 ? '' : 's'} in your log` }), all)));
  $('#tab-home').replaceChildren(...items);
}

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
  if (activeTab === 'home') renderHome();
  if (activeTab === 'batch') renderBatch();
  if (activeTab === 'rolls') renderRolls();
}

const restored = restoreRun();
let lastTab = null;
try { lastTab = sessionStorage.getItem(TAB_KEY); } catch { /* ignore */ }
renderAll();
showTab(restored ? 'develop' : document.querySelector(`.tab[data-tab="${lastTab}"]`) ? lastTab : 'home');

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
