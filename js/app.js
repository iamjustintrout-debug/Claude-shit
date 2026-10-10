import { KITS, DEFAULT_KIT } from './kits.js';
import { FILM_FORMATS, filmGroups, filmLabel, findFilm } from './films.js';
import { putPhoto, getPhoto, deletePhoto, newPhotoId, processImage, blobToDataURL, dataURLToBlob } from './photos.js';
import {
  buildProgram, agitationCues, formatDuration, fmtTemp, fmtTol, fmtVol, mlToFlOz, ML_PER_FL_OZ,
  mixChecklist, totalWater, addWeeks, daysUntil, batchExpiry,
  makeLogEntries, logToCSV, sanitizeLog, settingText, rollStats,
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
  tempUnit: 'C', // 'C' | 'F'
  volUnit: 'ml', // 'ml' | 'oz'
  batches: {}, // kitId -> { mixKey, mixedOn: 'YYYY-MM-DD', rolls }
  kitMeta: {}, // kitId -> { openedOn, portionUsed }
  customFilms: [], // film names typed in with "Other"
  prefs: {
    mixKey: {}, opts: {}, rotary: false, tankMl: 500, agit: 'kit', film: {}, format: '35mm',
    alarm: true, beeps: true, miniTimer: true, awake: 'dev', // awake: 'off' | 'dev' | 'always'
  },
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
// Older versions had one metric/imperial switch; split it into two.
if (state.units) {
  state.tempUnit = state.units === 'imperial' ? 'F' : 'C';
  state.volUnit = state.units === 'imperial' ? 'oz' : 'ml';
  delete state.units;
  save();
}
if (!KITS[state.kitId]) state.kitId = DEFAULT_KIT;
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch { /* ignore */ }
}

const kit = () => KITS[state.kitId];
// The formatters take 'metric' | 'imperial'; temperature and volume are set separately.
const tempUnits = () => (state.tempUnit === 'F' ? 'imperial' : 'metric');
const volUnits = () => (state.volUnit === 'oz' ? 'imperial' : 'metric');
const T = (t) => fmtTemp(t, tempUnits());
const V = (ml) => fmtVol(ml, volUnits());
const TOL = (tol) => fmtTol(tol, tempUnits());
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
  const general = activeTab === 'home' || activeTab === 'rolls' || activeTab === 'settings';
  $('#kit-banner').hidden = kit().verified || !!run || general;
  // The picker only matters on kit-specific pages (Develop, Batch, Mix, Guide).
  $('.kit-pick').hidden = general;
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
  document.querySelectorAll('.tabs button, .icon-btn').forEach((b) => b.classList.toggle('active', b.dataset.go === name));
  $('.home-btn').setAttribute('aria-current', name === 'home' ? 'page' : 'false');
  moveTabIndicator();
  updateMini();
  renderHeader();
  if (name === 'home') renderHome();
  if (name === 'settings') renderSettings();
  $('.gear-btn').setAttribute('aria-current', name === 'settings' ? 'page' : 'false');
  $('.guide-btn').setAttribute('aria-current', name === 'guide' ? 'page' : 'false');
  if (name === 'batch') renderBatch();
  if (name === 'rolls') renderRolls();
  if (name === 'develop' && !run) syncDevFromBatch();
  window.scrollTo(0, 0);
}
document.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.go)));

// The glass lens slides to the active tab (and fades out on the dashboard).
let indicatorTab = null;
function moveTabIndicator() {
  const ind = $('.tab-indicator');
  const btn = document.querySelector(`.tabs .tab-btn[data-go="${activeTab}"]`);
  if (!btn) { ind.classList.remove('on'); indicatorTab = null; return; }
  const moved = indicatorTab && indicatorTab !== activeTab;
  ind.style.width = `${btn.offsetWidth}px`;
  ind.style.transform = `translateX(${btn.offsetLeft}px)`;
  ind.classList.add('on');
  if (moved) { ind.classList.remove('squish'); void ind.offsetWidth; ind.classList.add('squish'); }
  indicatorTab = activeTab;
}
window.addEventListener('resize', moveTabIndicator);
$('.tab-indicator').addEventListener('animationend', (e) => e.currentTarget.classList.remove('squish'));

// A little bounce whenever the home button is pressed.
$('.home-btn').addEventListener('click', (e) => {
  const b = e.currentTarget;
  b.classList.remove('pop');
  void b.offsetWidth; // restart the animation
  b.classList.add('pop');
});
$('.home-btn').addEventListener('animationend', (e) => { if (e.target.classList.contains('home-disc')) e.currentTarget.classList.remove('pop'); });

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

// Ticked mixing steps, kept for the session so switching units or tabs
// doesn't lose your place. Key: kit|mix|bath -> array of step indexes.
const MIX_KEY = 'devapp.mixChecks';
let mixChecks = {};
try { mixChecks = JSON.parse(sessionStorage.getItem(MIX_KEY)) ?? {}; } catch { /* ignore */ }
const saveMixChecks = () => { try { sessionStorage.setItem(MIX_KEY, JSON.stringify(mixChecks)); } catch { /* ignore */ } };
// Which bath sections are open (by key); unset means "open if it's the first unfinished one".
const mixOpen = {};

function mixRow(n, text, amount, checked, onChange) {
  const cb = el('input', { type: 'checkbox', checked });
  cb.addEventListener('change', () => onChange(cb.checked));
  return el('li', {}, el('label', { className: 'check' },
    cb,
    el('span', { className: 'step-no', textContent: n }),
    el('span', { className: 'step-text', textContent: text }),
    el('span', { className: amount === 'see sheet' ? 'amt muted' : 'amt', textContent: amount })));
}

function bathRows(bath) {
  return mixChecklist(bath).map((i) => {
    if (i.kind === 'water') return [i.temp ? `Water (${T(i.temp)})` : 'Water', i.ml == null ? 'see sheet' : V(i.ml)];
    if (i.kind === 'part') {
      const whole = /whole packet/.test(i.name);
      return [`Add ${i.name}, stir`, i.ml != null ? V(i.ml) : whole ? '' : 'see sheet'];
    }
    return [`Top up with water to ${V(i.final)}`, i.ml != null ? V(i.ml) : ''];
  });
}

// One collapsible section per bath, with numbered steps to tick off.
function bathCard(bath, key, { number, nested = false, openByDefault = false } = {}) {
  const rows = bathRows(bath);
  const done = new Set(mixChecks[key] ?? []);
  const meta = el('span', { className: 'summary-meta' });
  const details = el('details', { className: `bath${nested ? '' : ' card'}` });
  const refresh = () => {
    const all = rows.length > 0 && done.size >= rows.length;
    details.classList.toggle('complete', all);
    meta.textContent = rows.length ? (all ? '✓ Done' : `${done.size}/${rows.length} done`) : '';
  };
  const items = rows.map(([text, amount], i) => mixRow(i + 1, text, amount, done.has(i), (on) => {
    if (on) done.add(i); else done.delete(i);
    mixChecks[key] = [...done];
    saveMixChecks();
    refresh();
    // Finished this bath: fold it away and open the next unfinished one.
    if (on && done.size >= rows.length) {
      setTimeout(() => {
        details.open = false;
        mixOpen[key] = false;
        const next = [...document.querySelectorAll('#mix-baths details.bath')].find((d) => !d.classList.contains('complete'));
        if (next) { next.open = true; mixOpen[next.dataset.key] = true; next.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
      }, 350);
    }
  }));
  const water = totalWater(bath);
  details.dataset.key = key;
  details.append(
    el('summary', {},
      number ? el('span', { className: 'bath-no', textContent: number }) : null,
      el('span', { className: 'bath-name', textContent: bath.name }),
      meta),
    rows.length ? el('ol', { className: 'steps' }, ...items) : null,
    ...(bath.notes ?? []).map((n) => el('p', { className: 'hint', textContent: n })),
    bath.final != null ? el('div', { className: 'bath-total' },
      el('span', { textContent: water != null && bath.water ? `Water total: ${V(water)}` : '' }),
      el('span', { textContent: `Working solution: ${V(bath.final)}` })) : null);
  refresh();
  details.open = mixOpen[key] ?? (openByDefault || !rows.length);
  details.addEventListener('toggle', () => { mixOpen[key] = details.open; });
  return details;
}

function renderMix() {
  const k = kit();
  const key = currentMixKey();
  segmented($('#mix-size'), mixKeys(), key, (v) => k.mixes[v].label, (v) => {
    state.prefs.mixKey[state.kitId] = v; save(); renderMix();
  });
  $('#mix-size-hint').textContent = k.mixHint?.(key) ?? '';
  const baths = k.mixes[key].baths;
  const bathKey = (i) => `${state.kitId}|${key}|${i}`;
  const isDone = (b, i) => (mixChecks[bathKey(i)] ?? []).length >= bathRows(b).length;
  const firstOpen = baths.findIndex((b, i) => !isDone(b, i));
  $('#mix-baths').replaceChildren(...baths.map((b, i) => bathCard(b, bathKey(i), {
    number: baths.length > 1 ? i + 1 : null, openByDefault: i === firstOpen,
  })));

  $('#mix-extras').replaceChildren(...(k.extras ?? []).map((x) => {
    const box = el('div', { hidden: true }, bathCard(x.bath, `${state.kitId}|extra|${x.id}`, { nested: true, openByDefault: true }));
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
  // Start the next mix with a clean checklist.
  for (const k of Object.keys(mixChecks)) if (k.startsWith(`${state.kitId}|`)) delete mixChecks[k];
  for (const k of Object.keys(mixOpen)) delete mixOpen[k];
  saveMixChecks();
  renderMix();
  showTab('batch');
});

// ---------- Develop: setup ----------

const dev = {
  mix: $('#dev-mix'), used: $('#dev-used-input'), rolls: $('#dev-rolls'), agit: $('#dev-agit'),
  tank: $('#dev-tank'), rotary: $('#dev-rotary'),
};
const preStepChecks = {};

function syncDevFromBatch() {
  const k = kit();
  dev.mix.replaceChildren(...mixKeys().map((v) => el('option', { value: v, textContent: k.mixes[v].label })));
  dev.rolls.replaceChildren(...Array.from({ length: k.maxRollsPerTank }, (_, i) => el('option', { value: i + 1, textContent: i + 1 })));
  const b = batch();
  dev.mix.value = b?.mixKey ?? currentMixKey();
  dev.used.value = b ? b.rolls : 0;
  $('#dev-used-editor').hidden = true;
  dev.agit.value = state.prefs.agit;
  dev.rotary.checked = state.prefs.rotary;
  $('#dev-rotary-wrap').hidden = !k.rotary;
  $('#dev-tank-wrap').hidden = !k.needsTankVolume;
  $('#dev-tank-label').textContent = `Tank volume (${state.volUnit === 'oz' ? 'fl oz' : 'ml'})`;
  dev.tank.value = state.volUnit === 'oz' ? +mlToFlOz(state.prefs.tankMl).toFixed(1) : state.prefs.tankMl;

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
    // Chemistry weakens with use, so times depend on how many rolls it has already developed.
    firstRoll: Math.max(0, Math.floor(Number(dev.used.value) || 0)) + 1,
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
  // Kits whose sheet gives no pattern still get reminders: 30 s, then every 30 s.
  if (a === 'kit') return step.agitation ?? { initial: 30, every: 30, cue: 'Agitate' };
  return { initial: 0, every: Number(a), cue: 'Agitate' };
}

function stepSub(s) {
  return [T(s.temp), TOL(s.tol)].filter(Boolean).join(' ');
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

function renderUsage() {
  const used = Math.max(0, Math.floor(Number(dev.used.value) || 0));
  const cap = kit().mixes[dev.mix.value]?.rolls;
  const b = batch();
  $('#dev-used').textContent = used;
  $('#dev-used-label').textContent = `roll${used === 1 ? '' : 's'} through this chemistry so far`;
  $('#dev-used-sub').textContent = cap
    ? `This will be roll #${used + 1} of ${cap}. Developer times lengthen as the chemistry is used.`
    : `This will be roll #${used + 1}.`;
  $('#dev-used-help').textContent = b
    ? 'Counted automatically each time you save a roll. Change it if you developed rolls without logging them; your batch count updates too.'
    : 'No batch logged for this kit yet, so this only affects this run. Log your mix on the Mix tab to have it counted automatically.';
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

  renderUsage();

  // Collapsed-program summary: step count, total time, and the developer step.
  const timed = (prog.steps ?? []).filter((x) => !x.manual);
  const total = timed.reduce((a, x) => a + x.sec, 0);
  $('#dev-program-meta').textContent = prog.steps ? `${prog.steps.length} steps · ${formatDuration(total)}` : '';
  const devStep = timed.find((x) => x.critical);
  $('#dev-summary').textContent = devStep ? `${devStep.name} ${formatDuration(devStep.sec)} at ${T(devStep.temp)}` : '';
}

dev.mix.addEventListener('input', renderProgram);
dev.used.addEventListener('input', () => {
  // Correcting the count updates the saved batch, so the dashboard and Batch tab agree.
  const b = batch();
  const n = Math.max(0, Math.floor(Number(dev.used.value) || 0));
  if (b && b.mixKey === dev.mix.value) { b.rolls = n; save(); }
  renderProgram();
});
$('#dev-used-edit').addEventListener('click', () => {
  const ed = $('#dev-used-editor');
  ed.hidden = !ed.hidden;
  $('#dev-used-edit').textContent = ed.hidden ? 'Adjust' : 'Done';
  if (!ed.hidden) dev.used.focus();
});
dev.rolls.addEventListener('input', () => { renderDevFilms(); renderProgram(); });
dev.agit.addEventListener('change', () => { state.prefs.agit = dev.agit.value; save(); renderProgram(); });
dev.rotary.addEventListener('change', () => { state.prefs.rotary = dev.rotary.checked; save(); renderProgram(); });
dev.tank.addEventListener('input', () => {
  const v = Number(dev.tank.value);
  if (v > 0) {
    state.prefs.tankMl = Math.round(state.volUnit === 'oz' ? v * ML_PER_FL_OZ : v);
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

// Remember whether the program list is open.
$('#dev-program-card').open = !!state.prefs.programOpen;
$('#dev-program-card').addEventListener('toggle', (e) => { state.prefs.programOpen = e.currentTarget.open; save(); });

function startRun(idx) {
  const prog = currentProgram();
  if (prog.error) return;
  startTilt();
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
  keepAwake();
  window.scrollTo(0, 0);
}

// ---------- Liquid-filled clock ----------

// Digits sit between y=34 (top) and y=120 (baseline) in the SVG viewBox.
const DIGIT_TOP = 34;
const DIGIT_BOTTOM = 120;
const WAVE_AMP = 5;

function wavePath(amp, length, phase) {
  // A sine wave from x=-600 to 1320 (seamless when shifted by a multiple of `length`),
  // closed downward into a deep body so it still covers the digits when tilted.
  const y = (x) => (amp * Math.sin((x / length) * 2 * Math.PI + phase)).toFixed(2);
  let d = `M-600 ${y(-600)}`;
  for (let x = -590; x <= 1320; x += 10) d += ` L${x} ${y(x)}`;
  return `${d} L1320 700 L-600 700 Z`;
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

// ---------- Tilt: the liquid stays level as you tilt the phone ----------
// Gravity from the accelerometer gives the phone's roll; the surface rotates
// the other way, on a damped spring so it sloshes and settles.

const tilt = { target: 0, angle: 0, vel: 0, upSign: 0, raf: 0, last: 0, on: false };
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

function onMotion(e) {
  const g = e.accelerationIncludingGravity;
  if (!g || g.x == null || g.y == null) return;
  // Browsers disagree on the sign of these axes. Phones are held top-up,
  // so learn the sign from readings where gravity is mostly along y.
  if (Math.abs(g.y) > 6 && Math.abs(g.y) > Math.abs(g.x)) tilt.upSign = Math.sign(g.y);
  const orientation = screen.orientation?.angle ?? window.orientation ?? 0;
  const inPlane = Math.hypot(g.x, g.y);
  if (!tilt.upSign || orientation !== 0 || inPlane < 2.5) { tilt.target = 0; wakeTilt(); return; }
  const deg = (Math.atan2(g.x * tilt.upSign, g.y * tilt.upSign) * 180) / Math.PI;
  tilt.target = Math.max(-40, Math.min(40, deg));
  wakeTilt();
}

// The animation loop sleeps while the liquid is at rest.
function wakeTilt() {
  if (!tilt.on || tilt.raf) return;
  tilt.last = 0;
  tilt.raf = requestAnimationFrame(tiltFrame);
}

function tiltFrame(now) {
  const dt = Math.min(0.05, (now - (tilt.last || now)) / 1000);
  tilt.last = now;
  const acc = 70 * (tilt.target - tilt.angle) - 7 * tilt.vel;
  tilt.vel += acc * dt;
  tilt.angle += tilt.vel * dt;
  const settled = Math.abs(tilt.target - tilt.angle) < 0.05 && Math.abs(tilt.vel) < 0.05;
  if (settled) { tilt.angle = tilt.target; tilt.vel = 0; }
  const slosh = 1 + Math.min(1.6, Math.abs(tilt.vel) / 50);
  $('#tilt').setAttribute('transform', `rotate(${tilt.angle.toFixed(2)} 180 0) scale(1 ${slosh.toFixed(3)})`);
  tilt.raf = settled ? 0 : requestAnimationFrame(tiltFrame);
}

// Must be called from a tap: iOS asks for motion permission.
function startTilt() {
  if (tilt.on || reducedMotion.matches || typeof DeviceMotionEvent === 'undefined') return;
  const attach = () => {
    if (tilt.on) return;
    tilt.on = true;
    window.addEventListener('devicemotion', onMotion);
  };
  if (typeof DeviceMotionEvent.requestPermission === 'function') {
    DeviceMotionEvent.requestPermission().then((r) => { if (r === 'granted') attach(); }).catch(() => {});
  } else {
    attach();
  }
}

function stopTilt() {
  if (!tilt.on) return;
  tilt.on = false;
  window.removeEventListener('devicemotion', onMotion);
  cancelAnimationFrame(tilt.raf);
  Object.assign(tilt, { target: 0, angle: 0, vel: 0, raf: 0 });
  $('#tilt').removeAttribute('transform');
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
  $('#run-temp').textContent = s.manual ? '' : [T(s.temp), TOL(s.tol)].filter(Boolean).join(' · ');
  $('#run-clock').hidden = !!s.manual;
  setClock(s.sec ?? 0, 0, 'ready');
  setCue(s.manual ? s.text : s.prep ?? '', false);
  $('#run-go').textContent = s.manual ? 'Done' : 'Start timer';
  $('#run-go').hidden = false;
  $('#run-pause').hidden = true;
  const next = run.steps[run.idx + 1];
  $('#run-next').textContent = next ? `Next: ${next.name}${next.manual ? '' : ` (${formatDuration(next.sec)})`}` : 'Last step';
}

// Full-screen colour flash so cues are visible from across the darkroom:
// yellow to agitate, red for the 10-second warning and the end of a step.
function screenFlash(kind) {
  const f = $('#flash');
  f.className = '';
  void f.offsetWidth;
  f.className = `flash-${kind}`;
}
$('#flash').addEventListener('animationend', (e) => { e.currentTarget.className = ''; });

function setCue(text, flash = true) {
  const c = $('#run-cue');
  c.textContent = text;
  if (flash) { c.classList.remove('flash'); void c.offsetWidth; c.classList.add('flash'); }
  if (run) {
    run.cue = text;
    if (flash) pulseMini();
  }
  updateMini();
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
    cueBeep(784, 160, 1, 'square', 0.2);
  }
  tick();
}

function tick() {
  if (!run || run.phase !== 'running') return;
  const s = run.steps[run.idx];
  run.remaining = Math.max(0, (run.endAt - Date.now()) / 1000);
  const elapsed = s.sec - run.remaining;
  setClock(run.remaining, elapsed / s.sec, run.remaining <= 10 ? 'warn' : '');
  updateMini();

  const a = run.agit;
  const cues = agitationCues(s.sec, a);
  if (cues.length) {
    let due = -1;
    cues.forEach((t, i) => { if (t <= elapsed) due = i; });
    if (due > run.lastCue && run.remaining > 10) {
      run.lastCue = due;
      persistRun();
      setCue(a.cue ?? 'Agitate');
      agitationChirp(); vibrate(150);
      screenFlash('agitate');
    } else if (!run.midShown && a.initial && elapsed >= a.initial && due === -1) {
      run.midShown = true;
      setCue('Stop. Wait for the next beep');
    }
  }
  if (!run.warned && run.remaining <= 10 && s.sec > 20) {
    run.warned = true;
    persistRun();
    setCue('10 s left. Get ready to drain');
    cueBeep(988, 140, 3, 'square', 0.22); vibrate([100, 80, 100]);
    screenFlash('warn');
  }
  if (run.remaining <= 0) return finishStep();
  run.timer = setTimeout(tick, 200);
}

function finishStep(silent = false) {
  run.phase = 'ended';
  persistRun();
  setClock(0, 1, 'done');
  if (!silent) { startAlarm(); screenFlash('end'); }
  const last = run.idx === run.steps.length - 1;
  setCue(last ? 'Done. Drain the tank' : 'Drain the tank');
  $('#run-pause').hidden = true;
  $('#run-go').hidden = false;
  $('#run-go').textContent = last ? 'Finish' : `Next: ${run.steps[run.idx + 1].name}`;
}

function advance() {
  stopAlarm();
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
  keepAwake();
}

function endRun() {
  if (run) clearTimeout(run.timer);
  run = null;
  stopAlarm();
  persistRun();
  stopTilt();
  keepAwake();
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

// ---------- Floating mini timer ----------
// While a run is in progress and you're on another page, a glass bar at the
// top shows the step and countdown. Tap it to go back; collapse it to a slim
// strip with the chevron.

const MINI_KEY = 'devapp.miniCollapsed';
let miniCollapsed = false;
try { miniCollapsed = sessionStorage.getItem(MINI_KEY) === '1'; } catch { /* ignore */ }

const MINI_ICONS = {
  pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14M16 5v14"/></svg>',
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l12-7.5z"/></svg>',
  next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4.5v15l10-7.5zM19 5v14"/></svg>',
};

function miniState() {
  if (!run) return null;
  if (run.done) return { name: 'Done', sub: 'Tap to save to your roll log', time: '✓', status: 'done', progress: 1 };
  const s = run.steps[run.idx];
  const stepNo = `Step ${run.idx + 1}/${run.steps.length}`;
  if (s.manual) return { name: s.name, sub: `${stepNo} · tap to continue`, time: '—', status: 'ready', progress: 0 };
  const remaining = run.phase === 'running' ? Math.max(0, (run.endAt - Date.now()) / 1000) : run.remaining;
  const progress = s.sec ? 1 - remaining / s.sec : 0;
  const map = {
    ready: { sub: `${stepNo} · ready to start`, status: 'ready', act: 'play', label: 'Start timer' },
    running: { sub: `${stepNo} · ${run.cue || 'running'}`, status: remaining <= 10 ? 'warn' : 'running', act: 'pause', label: 'Pause' },
    paused: { sub: `${stepNo} · paused`, status: 'paused', act: 'play', label: 'Resume' },
    ended: { sub: run.idx === run.steps.length - 1 ? 'Drain the tank. Last step done' : 'Drain the tank', status: 'ended', act: 'next', label: 'Next step' },
  }[run.phase] ?? {};
  return { name: s.name, time: formatDuration(remaining), progress, ...map };
}

function updateMini() {
  const m = $('#mini');
  const st = miniState();
  const show = !!st && activeTab !== 'develop' && state.prefs.miniTimer;
  if (show && m.hidden) { m.classList.remove('pulse'); m.classList.add('enter'); }
  m.hidden = !show;
  document.documentElement.style.setProperty('--mini-h', show ? (miniCollapsed ? '40px' : '70px') : '0px');
  if (!show) return;
  m.classList.toggle('collapsed', miniCollapsed);
  m.dataset.status = st.status;
  $('#mini-step').textContent = st.name;
  $('#mini-sub').textContent = st.sub;
  $('#mini-time').textContent = st.time;
  $('#mini-fill').style.width = `${Math.round(st.progress * 100)}%`;
  const act = $('#mini-act');
  act.hidden = !st.act;
  if (st.act && act.dataset.icon !== st.act) {
    act.innerHTML = MINI_ICONS[st.act];
    act.dataset.icon = st.act;
  }
  act.setAttribute('aria-label', st.label ?? '');
  $('#mini-hide').setAttribute('aria-label', miniCollapsed ? 'Show timer' : 'Hide timer');
}

function pulseMini() {
  const m = $('#mini');
  m.classList.remove('pulse');
  void m.offsetWidth;
  m.classList.add('pulse');
}
$('#mini').addEventListener('animationend', (e) => { if (e.target === e.currentTarget) e.currentTarget.classList.remove('pulse', 'enter'); });

$('#mini-open').addEventListener('click', () => {
  if (miniCollapsed) return setMiniCollapsed(false);
  showTab('develop');
});
// Start / pause / resume / next step, reusing the main timer's controls.
$('#mini-act').addEventListener('click', () => {
  if (!run) return;
  unlockAudio();
  if (run.phase === 'running' || run.phase === 'paused') $('#run-pause').click();
  else $('#run-go').click();
});
$('#mini-hide').addEventListener('click', () => setMiniCollapsed(!miniCollapsed));

function setMiniCollapsed(v) {
  miniCollapsed = v;
  try { sessionStorage.setItem(MINI_KEY, v ? '1' : '0'); } catch { /* ignore */ }
  updateMini();
}

// ---------- Keep a run across app restarts ----------
// iOS may close a backgrounded web app. Save the run so reopening picks up
// where it left off (the countdown continues from its absolute end time).

const RUN_KEY = 'devapp.run';
const RUN_MAX_AGE_MS = 6 * 60 * 60 * 1000;

function persistRun() {
  updateMini();
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
  keepAwake();
  // Audio can only start after a tap.
  document.addEventListener('pointerdown', () => { unlockAudio(); startTilt(); }, { once: true });
  return true;
}

// Timers are throttled in the background; catch up immediately on return.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    if (run?.phase === 'running') { clearTimeout(run.timer); tick(); }
    keepAwake();
  }
});

// ---------- Sound, vibration, wake lock ----------

let audio;
function unlockAudio() {
  try {
    // iOS: play through the silent switch.
    if (navigator.audioSession) navigator.audioSession.type = 'playback';
    audio ??= new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state !== 'running') audio.resume().catch(() => {});
    // iOS unlocks audio only when something actually plays during a tap.
    const b = audio.createBuffer(1, 1, 22050);
    const src = audio.createBufferSource();
    src.buffer = b;
    src.connect(audio.destination);
    src.start(0);
  } catch { /* no audio */ }
}

// iOS can suspend ("interrupt") the audio context when the screen dims, a call
// comes in or another app plays sound. Wake it before every sound.
function audioReady() {
  if (!audio) return false;
  if (audio.state !== 'running') audio.resume().catch(() => {});
  return true;
}

// Any tap keeps the audio unlocked for the rest of the run.
document.addEventListener('pointerdown', () => { if (run || audio) unlockAudio(); }, { passive: true, capture: true });

function beep(freq = 880, ms = 150, count = 1, type = 'sine', vol = 0.5) {
  if (!audioReady()) return;
  const t0 = audio.currentTime + 0.03;
  for (let i = 0; i < count; i++) {
    const start = t0 + i * (ms + 100) / 1000;
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(vol, start + 0.01);
    gain.gain.setValueAtTime(vol, start + ms / 1000 * 0.7);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + ms / 1000);
    osc.connect(gain).connect(audio.destination);
    osc.start(start);
    osc.stop(start + ms / 1000 + 0.02);
  }
}

// Agitation: a bright rising two-tone chirp, played twice so it cuts through.
function agitationChirp() {
  if (!state.prefs.beeps || !audioReady()) return;
  const t0 = audio.currentTime + 0.03;
  [[1047, 0], [1568, 0.11], [1047, 0.32], [1568, 0.43]].forEach(([f, dt]) => {
    const start = t0 + dt;
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = 'square';
    osc.frequency.value = f;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.22, start + 0.008);
    gain.gain.setValueAtTime(0.22, start + 0.08);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.1);
    osc.connect(gain).connect(audio.destination);
    osc.start(start);
    osc.stop(start + 0.11);
  });
}

function vibrate(pattern) {
  try { navigator.vibrate?.(pattern); } catch { /* unsupported */ }
}

// Short beeps for agitation, start and the 10-second warning.
function cueBeep(...args) {
  if (state.prefs.beeps) beep(...args);
}

// End-of-step alarm: bursts of a two-tone chirp that repeat until you tap
// the screen, move on, or a minute passes.
const alarm = { timer: 0, stopAt: 0 };
function alarmBurst() {
  if (!audioReady()) return;
  const t0 = audio.currentTime;
  for (let i = 0; i < 4; i++) {
    const start = t0 + i * 0.16;
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(i % 2 ? 1568 : 1319, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.18, start + 0.01);
    gain.gain.setValueAtTime(0.18, start + 0.1);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.13);
    osc.connect(gain).connect(audio.destination);
    osc.start(start);
    osc.stop(start + 0.15);
  }
}
function startAlarm(maxMs = 60000) {
  stopAlarm();
  vibrate([400, 150, 400, 150, 400]);
  if (!state.prefs.alarm) return;
  alarmBurst();
  alarm.stopAt = Date.now() + maxMs;
  alarm.timer = setInterval(() => {
    if (Date.now() > alarm.stopAt) return stopAlarm();
    alarmBurst();
    vibrate([400, 150, 400]);
  }, 1300);
  // Any tap silences it (on the next tick, so the tap that starts a test isn't counted).
  setTimeout(() => document.addEventListener('pointerdown', stopAlarm, { once: true, capture: true }), 0);
}
function stopAlarm() {
  clearInterval(alarm.timer);
  alarm.timer = 0;
  document.removeEventListener('pointerdown', stopAlarm, { capture: true });
}

// ---------- Keep the screen awake ----------
// Setting: off, while developing, or always while the app is open.
// Uses the Screen Wake Lock API. Home-screen apps on older iOS ignore it, so
// on iOS a silent, invisible 4-second video also loops while awake is wanted
// (playing video stops the screen from dimming or locking).

const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const AWAKE_VIDEO = 'data:video/mp4;base64,AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAM0bW9vdgAAAGxtdmhkAAAAAAAAAAAAAAAAAAAD6AAAD6AAAQAAAQAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAAl50cmFrAAAAXHRraGQAAAADAAAAAAAAAAAAAAABAAAAAAAAD6AAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAABAAAAAQAAAAAAAkZWR0cwAAABxlbHN0AAAAAAAAAAEAAA+gAAAAAAABAAAAAAHWbWRpYQAAACBtZGhkAAAAAAAAAAAAAAAAAABAAAABAABVxAAAAAAALWhkbHIAAAAAAAAAAHZpZGUAAAAAAAAAAAAAAABWaWRlb0hhbmRsZXIAAAABgW1pbmYAAAAUdm1oZAAAAAEAAAAAAAAAAAAAACRkaW5mAAAAHGRyZWYAAAAAAAAAAQAAAAx1cmwgAAAAAQAAAUFzdGJsAAAAuXN0c2QAAAAAAAAAAQAAAKlhdmMxAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAABAAEABIAAAASAAAAAAAAAABFUxhdmM2MC4zMS4xMDIgbGlieDI2NAAAAAAAAAAAAAAAGP//AAAAL2F2Y0MBQsAe/+EAFmdCwB7ZHsBEAAADAAQAAAMACDxYuSABAAZoy4BlEyAAAAAQcGFzcAAAAAEAAAABAAAAFGJ0cnQAAAAAAAAFTAAABUwAAAAYc3R0cwAAAAAAAAABAAAABAAAQAAAAAAUc3RzcwAAAAAAAAABAAAAAQAAABxzdHNjAAAAAAAAAAEAAAABAAAABAAAAAEAAAAkc3RzegAAAAAAAAAAAAAABAAAAoYAAAALAAAACwAAAAoAAAAUc3RjbwAAAAAAAAABAAADZAAAAGJ1ZHRhAAAAWm1ldGEAAAAAAAAAIWhkbHIAAAAAAAAAAG1kaXJhcHBsAAAAAAAAAAAAAAAALWlsc3QAAAAlqXRvbwAAAB1kYXRhAAAAAQAAAABMYXZmNjAuMTYuMTAwAAAACGZyZWUAAAKubWRhdAAAAnIGBf//btxF6b3m2Ui3lizYINkj7u94MjY0IC0gY29yZSAxNjQgcjMxMDggMzFlMTlmOSAtIEguMjY0L01QRUctNCBBVkMgY29kZWMgLSBDb3B5bGVmdCAyMDAzLTIwMjMgLSBodHRwOi8vd3d3LnZpZGVvbGFuLm9yZy94MjY0Lmh0bWwgLSBvcHRpb25zOiBjYWJhYz0wIHJlZj0zIGRlYmxvY2s9MTotMzotMyBhbmFseXNlPTB4MToweDExMSBtZT1oZXggc3VibWU9NyBwc3k9MSBwc3lfcmQ9Mi4wMDowLjcwIG1peGVkX3JlZj0xIG1lX3JhbmdlPTE2IGNocm9tYV9tZT0xIHRyZWxsaXM9MSA4eDhkY3Q9MCBjcW09MCBkZWFkem9uZT0yMSwxMSBmYXN0X3Bza2lwPTEgY2hyb21hX3FwX29mZnNldD0tNCB0aHJlYWRzPTEgbG9va2FoZWFkX3RocmVhZHM9MSBzbGljZWRfdGhyZWFkcz0wIG5yPTAgZGVjaW1hdGU9MSBpbnRlcmxhY2VkPTAgYmx1cmF5X2NvbXBhdD0wIGNvbnN0cmFpbmVkX2ludHJhPTAgYmZyYW1lcz0wIHdlaWdodHA9MCBrZXlpbnQ9MjUwIGtleWludF9taW49MSBzY2VuZWN1dD00MCBpbnRyYV9yZWZyZXNoPTAgcmNfbG9va2FoZWFkPTQwIHJjPWNyZiBtYnRyZWU9MSBjcmY9NTEuMCBxY29tcD0wLjYwIHFwbWluPTAgcXBtYXg9NjkgcXBzdGVwPTQgaXBfcmF0aW89MS40MCBhcT0xOjEuMjAAgAAAAAxliIQGs5yYoAAiS4AAAAAHQZo4DWc6gAAAAAdBmlQDOc6gAAAABkGaYBjOdQ==';
let wakeLock = null;
let awakeVideo = null;

function wantAwake() {
  const mode = state.prefs.awake;
  return mode === 'always' || (mode === 'dev' && !!run && !run.done);
}

// Callers used to pass on/off; the setting and run state now decide.
function keepAwake() {
  applyAwake(wantAwake());
}

async function applyAwake(on) {
  try {
    if (on && !wakeLock && 'wakeLock' in navigator && document.visibilityState === 'visible') {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } else if (!on && wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch { /* denied or unsupported */ }
  if (!isIOS) return;
  if (on) {
    if (!awakeVideo) {
      awakeVideo = el('video', { src: AWAKE_VIDEO, muted: true, loop: true, playsInline: true });
      awakeVideo.setAttribute('playsinline', '');
      awakeVideo.setAttribute('muted', '');
      awakeVideo.setAttribute('aria-hidden', 'true');
      awakeVideo.style.cssText = 'position:fixed;left:0;bottom:0;width:1px;height:1px;opacity:.01;pointer-events:none';
      document.body.append(awakeVideo);
    }
    if (awakeVideo.paused) awakeVideo.play().catch(() => { /* needs a tap first; retried on the next one */ });
  } else if (awakeVideo && !awakeVideo.paused) {
    awakeVideo.pause();
  }
}

// iOS only starts video after a tap, so retry on taps while awake is wanted.
document.addEventListener('pointerdown', () => { if (wantAwake()) keepAwake(); }, { passive: true });

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
      el('div', { className: b.rolls >= cap ? 'bar full' : 'bar' }, el('div', { style: `width:${Math.min(100, (b.rolls / cap) * 100)}%` })),
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
    for (const id of e.photos ?? []) deletePhoto(id).catch(() => {});
    renderRolls();
  });
  return el('div', { className: 'card roll' },
    el('div', { className: 'roll-head' }, el('b', { textContent: e.film.name }), e.format ? el('span', { className: 'chip', textContent: e.format }) : null),
    el('div', { className: 'hint', textContent: meta }),
    e.settings.length ? el('div', { className: 'roll-line', textContent: e.settings.map((x) => settingText(x, tempUnits())).join(' · ') }) : null,
    dev ? el('div', { className: 'roll-line', textContent: dev }) : null,
    e.notes ? el('p', { className: 'roll-notes', textContent: e.notes }) : null,
    photoStrip(e),
    el('div', { className: 'btn-row' }, edit, del));
}

// ---------- Roll photos ----------

const thumbURLs = new Map(); // photo id -> object URL of its thumbnail

async function thumbURL(id) {
  if (thumbURLs.has(id)) return thumbURLs.get(id);
  const rec = await getPhoto(id);
  if (!rec) return null;
  const url = URL.createObjectURL(rec.thumb);
  thumbURLs.set(id, url);
  return url;
}

function photoStrip(e) {
  const ids = e.photos ?? [];
  const thumbs = ids.map((id, i) => {
    const btn = el('button', { type: 'button', className: 'thumb', ariaLabel: `Photo ${i + 1} of ${e.film.name}` });
    thumbURL(id).then((url) => { if (url) btn.style.backgroundImage = `url("${url}")`; else btn.classList.add('missing'); }).catch(() => btn.classList.add('missing'));
    btn.addEventListener('click', () => openViewer(e, i));
    return btn;
  });
  const input = el('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true });
  input.addEventListener('change', () => addPhotos(e, [...input.files]));
  const add = el('label', { className: 'thumb add', ariaLabel: 'Add photos' },
    el('span', { textContent: '+' }), el('small', { textContent: ids.length ? 'Add' : 'Add photo' }), input);
  return el('div', { className: 'photos' }, ...thumbs, add);
}

async function addPhotos(e, files) {
  if (!files.length) return;
  let failed = 0;
  for (const file of files) {
    try {
      const rec = await processImage(file);
      const id = newPhotoId();
      await putPhoto(id, rec);
      (e.photos ??= []).push(id);
    } catch {
      failed += 1;
    }
  }
  saveLog();
  renderRolls();
  if (failed) alert(`${failed} photo${failed === 1 ? '' : 's'} couldn't be added.`);
}

// Full-screen viewer
const viewer = { roll: null, idx: 0, url: null };

async function showViewerPhoto() {
  const { roll, idx } = viewer;
  const id = roll.photos[idx];
  if (viewer.url) URL.revokeObjectURL(viewer.url);
  viewer.url = null;
  $('#viewer-img').removeAttribute('src');
  const rec = await getPhoto(id).catch(() => null);
  if (rec) {
    viewer.url = URL.createObjectURL(rec.full);
    $('#viewer-img').src = viewer.url;
  }
  $('#viewer-caption').textContent = `${roll.film.name} · ${fmtDate(roll.date)}${roll.devSec != null ? ` · ${roll.devName} ${formatDuration(roll.devSec)}` : ''}`;
  $('#viewer-count').textContent = `${idx + 1} / ${roll.photos.length}`;
  $('#viewer-prev').disabled = idx === 0;
  $('#viewer-next').disabled = idx === roll.photos.length - 1;
}

function openViewer(roll, idx) {
  Object.assign(viewer, { roll, idx });
  $('#viewer').hidden = false;
  document.body.classList.add('no-scroll');
  showViewerPhoto();
}

function closeViewer() {
  $('#viewer').hidden = true;
  document.body.classList.remove('no-scroll');
  if (viewer.url) URL.revokeObjectURL(viewer.url);
  viewer.url = null;
  viewer.roll = null;
}

$('#viewer-close').addEventListener('click', closeViewer);
$('#viewer-prev').addEventListener('click', () => { if (viewer.idx > 0) { viewer.idx -= 1; showViewerPhoto(); } });
$('#viewer-next').addEventListener('click', () => { if (viewer.idx < viewer.roll.photos.length - 1) { viewer.idx += 1; showViewerPhoto(); } });
$('#viewer-delete').addEventListener('click', async () => {
  const { roll, idx } = viewer;
  if (!confirm('Remove this photo from the roll?')) return;
  const [id] = roll.photos.splice(idx, 1);
  saveLog();
  deletePhoto(id).catch(() => {});
  URL.revokeObjectURL(thumbURLs.get(id));
  thumbURLs.delete(id);
  if (!roll.photos.length) closeViewer();
  else { viewer.idx = Math.min(idx, roll.photos.length - 1); showViewerPhoto(); }
  renderRolls();
});
// Swipe left/right between photos.
let swipeX = null;
$('#viewer').addEventListener('touchstart', (ev) => { swipeX = ev.touches[0].clientX; }, { passive: true });
$('#viewer').addEventListener('touchend', (ev) => {
  if (swipeX == null) return;
  const dx = ev.changedTouches[0].clientX - swipeX;
  swipeX = null;
  if (Math.abs(dx) > 50) $(dx < 0 ? '#viewer-next' : '#viewer-prev').click();
});
document.addEventListener('keydown', (ev) => {
  if ($('#viewer').hidden) return;
  if (ev.key === 'Escape') closeViewer();
  if (ev.key === 'ArrowLeft') $('#viewer-prev').click();
  if (ev.key === 'ArrowRight') $('#viewer-next').click();
});

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

$('#rolls-csv').addEventListener('click', () => download(`devapp-rolls-${today()}.csv`, logToCSV(sortedLog(), tempUnits()), 'text/csv'));
$('#rolls-json').addEventListener('click', async () => {
  // Photos go in the backup as data URLs so a restore brings them back.
  const photos = {};
  for (const id of rollLog.flatMap((e) => e.photos ?? [])) {
    const rec = await getPhoto(id).catch(() => null);
    if (rec) photos[id] = { full: await blobToDataURL(rec.full), thumb: await blobToDataURL(rec.thumb), w: rec.w, h: rec.h, added: rec.added };
  }
  download(`devapp-backup-${today()}.json`,
    JSON.stringify({ app: 'DevApp', version: 2, rolls: rollLog, customFilms: state.customFilms, photos }), 'application/json');
});
$('#rolls-import').addEventListener('change', async (ev) => {
  const file = ev.target.files?.[0];
  ev.target.value = '';
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    const incoming = sanitizeLog(Array.isArray(data) ? data : data.rolls);
    const have = new Set(rollLog.map((e) => e.id));
    const added = incoming.filter((e) => !have.has(e.id));
    // Restore photos for the new rolls (only image data URLs are accepted).
    const photos = data && typeof data.photos === 'object' ? data.photos : {};
    for (const e of added) {
      const kept = [];
      for (const id of e.photos) {
        const p = photos[id];
        if (!p || !/^data:image\//.test(p.full ?? '') || !/^data:image\//.test(p.thumb ?? '')) continue;
        try {
          await putPhoto(id, { full: await dataURLToBlob(p.full), thumb: await dataURLToBlob(p.thumb), w: p.w, h: p.h, added: p.added });
          kept.push(id);
        } catch { /* skip a bad photo */ }
      }
      e.photos = kept;
    }
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
    el('div', { className: left === 0 ? 'bar full' : 'bar' }, el('div', { style: `width:${cap ? Math.min(100, (b.rolls / cap) * 100) : 0}%` })),
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

// Section heading with a one-line explanation underneath.
function sectionHead(title, sub) {
  return el('div', { className: 'section-head' },
    el('h2', { className: 'section-title', textContent: title }),
    sub ? el('p', { className: 'section-sub', textContent: sub }) : null);
}

// Reuse the tab bar's icons so the dashboard and tabs match.
const tabIcon = (tab) => document.querySelector(`.tabs [data-go="${tab}"] svg`)?.cloneNode(true) ?? null;

const FLOW = [
  { tab: 'mix', title: 'Mix', text: 'Make up working chemistry from your kit, with every amount worked out.' },
  { tab: 'develop', title: 'Develop', text: 'A step-by-step timer for each bath that beeps when to agitate.' },
  { tab: 'rolls', title: 'Log', text: 'Save each roll\'s film, times and photos to look back on.' },
];

function flowSteps(compact) {
  return el('ol', { className: `flow${compact ? ' compact' : ''}` }, ...FLOW.map((f, i) => {
    const b = el('button', { type: 'button', className: 'flow-step' },
      el('span', { className: 'flow-icon' }, tabIcon(f.tab)),
      el('span', { className: 'flow-text' },
        el('b', {}, el('span', { className: 'flow-no', textContent: i + 1 }), f.title),
        compact ? null : el('small', { textContent: f.text })));
    b.addEventListener('click', () => showTab(f.tab));
    return el('li', {}, b);
  }));
}

function introCard(isNew) {
  if (isNew) {
    const go = el('button', { className: 'btn primary wide', textContent: 'Get started: mix your chemistry' });
    go.addEventListener('click', () => showTab('mix'));
    return el('div', { className: 'card intro' },
      el('h2', { textContent: 'Develop film at home, step by step' }),
      el('p', { textContent: 'DevApp guides you through developing your own film: mixing the chemistry, timing every step, and keeping a record of each roll.' }),
      flowSteps(false),
      el('p', { className: 'hint', textContent: 'Tap Get started, choose the chemistry kit you have at the top of the Mix page, and follow the steps.' }),
      go);
  }
  return el('div', { className: 'card intro slim' },
    el('p', { className: 'intro-tag', textContent: 'Your home film lab: mix, develop and log every roll.' }),
    flowSteps(true));
}

// The most useful next action, from your active chemistry.
function nextUpCard(active) {
  if (!active) return null;
  const [id, b] = active;
  const k = KITS[id];
  const prog = buildProgram(k, { ...kitOpts(k), mixKey: b.mixKey, firstRoll: b.rolls + 1, rolls: 1, tankMl: state.prefs.tankMl });
  const d = prog.steps?.find((x) => x.critical);
  const go = el('button', { className: 'btn primary', textContent: 'Start developing' });
  go.addEventListener('click', () => { selectKit(id); showTab('develop'); });
  return el('div', { className: 'card next-up' },
    el('span', { className: 'next-label', textContent: 'Next up' }),
    el('b', { textContent: `Roll #${b.rolls + 1} in ${k.name}` }),
    d ? el('span', { className: 'hint', textContent: `${d.name} ${formatDuration(d.sec)} at ${T(d.temp)}` }) : null,
    go);
}

function statTile(value, label) {
  return el('div', { className: 'stat' }, el('span', { className: 'stat-num', textContent: value }), el('span', { className: 'stat-label', textContent: label }));
}

const shortDate = (d) => new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

// Rolls per week (last 8 weeks): one series, so one colour and no legend.
// Tap a bar to read its exact count.
function weekChart(weeks) {
  const max = Math.max(1, ...weeks.map((w) => w.count));
  const readout = el('p', { className: 'chart-readout' });
  const show = (i) => {
    const w = weeks[i];
    readout.textContent = `${i === weeks.length - 1 ? 'This week' : `Week of ${shortDate(w.start)}`}: ${w.count} roll${w.count === 1 ? '' : 's'}`;
    bars.forEach((b, j) => b.classList.toggle('sel', j === i));
  };
  const bars = weeks.map((w, i) => {
    const b = el('button', { type: 'button', className: 'wk-bar', ariaLabel: `Week of ${shortDate(w.start)}: ${w.count} roll${w.count === 1 ? '' : 's'}` },
      w.count ? el('span', { className: 'wk-val', textContent: w.count }) : null,
      el('span', { className: 'wk-fill', style: `height:${w.count ? Math.max(6, (w.count / max) * 82) : 0}%` }));
    b.addEventListener('click', () => show(i));
    return b;
  });
  const labels = weeks.map((w, i) => el('span', { textContent: i === weeks.length - 1 ? 'Now' : shortDate(w.start) }));
  const chart = el('div', { className: 'chart' },
    el('div', { className: 'chart-head' }, el('b', { textContent: 'Rolls per week' }), el('span', { className: 'hint', textContent: 'last 8 weeks' })),
    el('div', { className: 'wk-plot' }, ...bars),
    el('div', { className: 'wk-axis' }, ...labels),
    readout);
  show(weeks.length - 1);
  return chart;
}

function countTable(title, rows, noun) {
  return el('table', { className: 'tbl count-tbl' },
    el('thead', {}, el('tr', {}, el('th', { textContent: title }), el('th', { className: 'num', textContent: 'Rolls' }))),
    el('tbody', {}, ...rows.slice(0, 5).map((r) => el('tr', {},
      el('td', {}, r.name, el('span', { className: 'sub', textContent: `last ${shortDate(r.last)}` })),
      el('td', { className: 'num', textContent: r.count }))),
    rows.length > 5 ? el('tr', {}, el('td', { className: 'sub', textContent: `+${rows.length - 5} more ${noun}` }), el('td')) : null));
}

function activitySection() {
  const st = rollStats(rollLog);
  const items = [sectionHead('Your activity', 'Rolls you\'ve developed and saved to your log.')];
  if (!st.total) {
    items.push(el('div', { className: 'card' }, el('p', { className: 'hint', textContent: 'Nothing logged yet. When you finish developing, tap "Save to roll log" and your counts show up here.' })));
    return items;
  }
  items.push(el('div', { className: 'card activity' },
    el('div', { className: 'stats' },
      statTile(st.last7, 'last 7 days'), statTile(st.last30, 'last 30 days'),
      statTile(st.year, `in ${new Date().getFullYear()}`), statTile(st.total, 'all time')),
    weekChart(st.weeks),
    st.last30
      ? el('div', { className: 'count-tables' },
        el('p', { className: 'chart-head' }, el('b', { textContent: 'Last 30 days' })),
        countTable('Film', st.films30, 'films'),
        countTable('Chemistry', st.kits30, 'kits'))
      : el('p', { className: 'hint', textContent: 'No rolls in the last 30 days.' })));
  return items;
}

// Chips for switching between mixed chemistries; picking one also selects
// that kit for Develop, Batch, Mix and Guide.
function chemSwitcher(entries, shownId, rank) {
  return el('div', { className: 'chem-switch', role: 'radiogroup', ariaLabel: 'Chemistry to show' }, ...entries.map((e) => {
    const [id, b] = e;
    const k = KITS[id];
    const cap = k.mixes[b.mixKey].rolls;
    const chip = el('button', { type: 'button', className: `chem-chip${rank(e) ? ' used' : ''}` },
      el('span', { className: 'chip-dot', ariaHidden: 'true' }),
      el('span', { className: 'chip-name', textContent: k.name }),
      el('span', { className: 'chip-count', textContent: `${b.rolls}/${cap}` }));
    chip.setAttribute('role', 'radio');
    chip.setAttribute('aria-checked', String(id === shownId));
    chip.addEventListener('click', () => { if (id !== state.kitId) selectKit(id); });
    return chip;
  }));
}

function renderHome() {
  const entries = Object.entries(state.batches).filter(([id, b]) => KITS[id] && b && KITS[id].mixes[b.mixKey]);
  const rank = ([id, b]) => (b.rolls >= KITS[id].mixes[b.mixKey].rolls ? 1 : 0);
  entries.sort((a, b) => rank(a) - rank(b) || b[1].mixedOn.localeCompare(a[1].mixedOn));
  const isNew = !entries.length && !rollLog.length;
  // Which chemistry the dashboard is about: the selected kit if it has a batch,
  // otherwise the first active one.
  const shown = entries.find(([id]) => id === state.kitId) ?? entries.find((e) => rank(e) === 0) ?? entries[0];
  const shownActive = shown && rank(shown) === 0 ? shown : null;

  const items = [introCard(isNew), nextUpCard(shownActive)];

  items.push(sectionHead('Chemistry in use', entries.length > 1
    ? 'You have more than one batch mixed. Pick one to see its details.'
    : 'Your mixed batch: rolls developed, rolls left, and when it expires.'));
  if (entries.length > 1) items.push(chemSwitcher(entries, shown[0], rank));
  if (shown) {
    items.push(chemCard(KITS[shown[0]], shown[1]));
  } else {
    const mixBtn = el('button', { className: 'btn primary wide', textContent: 'Mix chemistry' });
    mixBtn.addEventListener('click', () => showTab('mix'));
    items.push(el('div', { className: 'card' },
      el('p', { textContent: 'No chemistry mixed yet. On the Mix page, choose your kit and mix a batch.' }), mixBtn));
  }

  if (!isNew) items.push(...activitySection());

  if (!isNew) {
    const recent = sortedLog().slice(0, 3);
    const all = el('button', { className: 'btn small', textContent: 'All rolls' });
    all.addEventListener('click', () => showTab('rolls'));
    items.push(sectionHead('Recent rolls', 'The last rolls you saved, newest first.'),
      el('div', { className: 'card' },
        recent.length
          ? el('ul', { className: 'recent' }, ...recent.map((e) => el('li', {},
            el('b', { textContent: e.film.name }),
            el('span', { className: 'hint', textContent: ` ${e.format ? `${e.format} · ` : ''}${fmtDate(e.date)} · ${e.kitName}` }))))
          : el('p', { className: 'hint', textContent: 'No rolls logged yet.' }),
        el('div', { className: 'btn-row' }, el('span', { className: 'hint', textContent: `${rollLog.length} roll${rollLog.length === 1 ? '' : 's'} in your log` }), all)));
  }
  $('#tab-home').replaceChildren(...items.filter(Boolean));
}

// ---------- Settings ----------

function setUnits(temp, vol) {
  if (temp) state.tempUnit = temp;
  if (vol) state.volUnit = vol;
  save();
  renderAll();
}

function renderSettings() {
  $('#set-alarm').checked = state.prefs.alarm;
  $('#set-beeps').checked = state.prefs.beeps;
  $('#set-mini').checked = state.prefs.miniTimer;
  segmented($('#set-awake'), ['off', 'dev', 'always'], state.prefs.awake,
    (v) => ({ off: 'Off', dev: 'Developing', always: 'Always' })[v], (v) => {
      state.prefs.awake = v;
      save();
      keepAwake();
      renderSettings();
    }, (v) => ({ off: 'Normal lock', dev: 'During a run', always: 'While open' })[v]);
  segmented($('#set-temp'), ['C', 'F'], state.tempUnit, (u) => (u === 'C' ? '°C' : '°F'), (u) => setUnits(u, null),
    (u) => (u === 'C' ? 'Celsius' : 'Fahrenheit'));
  segmented($('#set-vol'), ['ml', 'oz'], state.volUnit, (u) => (u === 'ml' ? 'ml' : 'fl oz'), (u) => setUnits(null, u),
    (u) => (u === 'ml' ? 'Millilitres' : 'US fluid ounces'));
  $('#set-example').textContent = `Example: mix ${V(200)} of developer, process at ${T({ c: 38, f: 100 })}.`;
}
for (const [id, key] of [['#set-alarm', 'alarm'], ['#set-beeps', 'beeps'], ['#set-mini', 'miniTimer']]) {
  $(id).addEventListener('change', (e) => {
    state.prefs[key] = e.currentTarget.checked;
    save();
    if (key === 'alarm' && !state.prefs.alarm) stopAlarm();
    updateMini();
  });
}
$('#set-test-alarm').addEventListener('click', () => {
  unlockAudio();
  if (!state.prefs.alarm) return alert('The alarm is turned off. Switch it on to hear it.');
  startAlarm(4000);
});
$('#set-all-metric').addEventListener('click', () => setUnits('C', 'ml'));
$('#set-all-imperial').addEventListener('click', () => setUnits('F', 'oz'));

// The gear gives a quarter turn when tapped.
$('.gear-btn').addEventListener('click', (e) => {
  const b = e.currentTarget;
  b.classList.remove('spin');
  void b.offsetWidth;
  b.classList.add('spin');
});
$('.gear-btn').addEventListener('animationend', (e) => e.currentTarget.classList.remove('spin'));

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

// ---------- iOS home-screen viewport fix ----------
// Launched from the home screen, iOS sometimes lays a page that doesn't
// scroll out in a viewport shorter than the screen (by the status-bar
// height), so the bottom tab bar floats too high. Measure the missing strip
// and move the bar down by it. Elsewhere the gap is 0.
function fixViewportGap() {
  const standalone = navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
  const portrait = window.innerHeight > window.innerWidth;
  const missing = screen.height - window.innerHeight;
  const gap = standalone && portrait && missing > 0 && missing < 120 ? missing : 0;
  document.documentElement.style.setProperty('--viewport-gap', `${gap}px`);
}
fixViewportGap();
window.addEventListener('resize', fixViewportGap);
window.visualViewport?.addEventListener('resize', fixViewportGap);
window.addEventListener('scroll', fixViewportGap, { passive: true });
window.addEventListener('pageshow', fixViewportGap);
document.addEventListener('visibilitychange', fixViewportGap);

// ---------- Boot ----------

function renderAll() {
  renderHeader();
  renderMix();
  if (!run) syncDevFromBatch();
  renderGuide();
  if (activeTab === 'home') renderHome();
  if (activeTab === 'settings') renderSettings();
  if (activeTab === 'batch') renderBatch();
  if (activeTab === 'rolls') renderRolls();
}

const restored = restoreRun();
let lastTab = null;
try { lastTab = sessionStorage.getItem(TAB_KEY); } catch { /* ignore */ }
renderAll();
keepAwake();
showTab(restored ? 'develop' : document.querySelector(`.tab[data-tab="${lastTab}"]`) ? lastTab : 'home');

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
