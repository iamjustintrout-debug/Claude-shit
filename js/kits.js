// Kit recipes and processing programs.
//
// `verified: true` means every number was checked against the manufacturer's
// printed instruction sheet. Otherwise the kit was compiled from published
// instructions, reviews and retailer listings: steps marked `unverified` are
// shown with a "check your sheet" badge, and amounts left as null are shown
// as "see sheet" rather than guessed.
//
// Temperatures are { c, f } as printed by the manufacturer (ranges as
// { c: [lo, hi], f: [lo, hi] }); volumes are ml.
//
// Each kit's program(opts) returns { steps, notes } or { error }. opts holds
// the kit's option values plus mix, mixKey, firstRoll, lastRoll, rolls,
// tankMl. Steps: { id, name, sec, temp, tol, agitation, critical, prep,
// unverified, manual, text }.

import { rollGroup, dilute } from './logic.js';

const T = (c, f) => ({ c, f });
const R = (c, f) => ({ c, f }); // range: R([lo, hi], [lo, hi])
const ROOM = 'room temperature';
const packet = (name) => ({ name: `${name} (whole packet)`, ml: null });
const bottle = (name) => ({ name, ml: null });

// ---------------------------------------------------------------------------
// C-TEC 41 (3-bath C-41, 6 × 200 ml concentrates)

const CTEC_MIX_WATER = R([20, 45], [68, 113]);
const ctecBaths = (k) => [
  {
    name: 'Color Developer CD',
    water: { start: 100 * k, temp: CTEC_MIX_WATER },
    parts: [{ name: 'CD Part 1', ml: 100 * k }, { name: 'CD Part 2', ml: 100 * k }, { name: 'CD Part 3', ml: 100 * k }],
    final: 500 * k,
    notes: ['Clear after Part 1, pink after Part 2, yellowish after Part 3.'],
  },
  {
    name: 'Bleach Fix BX',
    water: { start: 100 * k, temp: CTEC_MIX_WATER },
    parts: [{ name: 'BX Part 1', ml: 100 * k }, { name: 'BX Part 2', ml: 100 * k }],
    final: 500 * k,
  },
  {
    name: 'Stabilizer STAB',
    water: { start: 100 * k, temp: CTEC_MIX_WATER },
    parts: [{ name: 'STAB', ml: 100 * k }],
    final: 500 * k,
  },
];

const CTEC_TIMES = {
  30: { develop: [480, 540, 600, 660], bleachFix: [360, 480, 720, 1200] },
  38: { develop: [195, 210, 225, 240], bleachFix: [240, 360, 600, 900] },
};
const CTEC_TEMPS = { 30: T(30, 86), 38: T(38, 100) };
const CTEC_AGITATE = { initial: 30, every: 15, cue: 'Tilt once, then back in the bath', label: 'Continuous for 30 s, then one gentle tilt every 15 s' };

const ctec41 = {
  id: 'ctec41',
  name: 'C-TEC 41',
  process: 'C-41',
  verified: true,
  source: 'C-TEC 41 instruction sheet, version 9/2026',
  maxRollsPerTank: 2,
  rotary: true,
  mixes: {
    500: { label: '500 ml', rolls: 8, portion: 0.5, baths: ctecBaths(1) },
    1000: { label: '1000 ml', rolls: 16, portion: 1, baths: ctecBaths(2) },
  },
  mixHint: (key) => key === '1000'
    ? 'Uses the whole kit. Develops up to 16 rolls.'
    : 'Uses half of each bottle. Develops up to 8 rolls. The remaining concentrate keeps for 12 weeks.',
  mixNotes: [
    'Pour about a fifth of the final volume as water, add each part in order and stir after each, then top up.',
    'To start right away, use water about 10°C (18°F) above your processing temperature and let it cool.',
    'Store in airtight, brown, completely full bottles. Reheat in a water bath and measure the temperature inside the bottle.',
  ],
  extras: [{
    id: 'remjet',
    label: "I'm also developing ECN-2 (motion picture) film",
    bath: { name: 'Remjet Remover RJR (sold separately)', water: { start: 200, temp: null }, parts: [{ name: 'RJR', ml: 200 }], final: 1000,
      notes: ['Reusable. Pour it back into its bottle after use. It darkens over time and keeps for several months.'] },
  }],
  options: [
    { id: 'temp', label: 'Process temperature', choices: [
      { value: '30', label: CTEC_TEMPS[30] },
      { value: '38', label: CTEC_TEMPS[38] },
    ], default: '30' },
    { id: 'push', label: 'Push', when: (o) => o.temp === '38', choices: [
      { value: '0', label: 'None' }, { value: '1', label: '+1' }, { value: '2', label: '+2' }, { value: '3', label: '+3' },
    ], default: '0' },
  ],
  preSteps: [{
    id: 'ecn2', label: 'ECN-2 film: remove remjet first',
    step: { id: 'rjr', name: 'Remjet removal', manual: true,
      text: 'Fill with RJR at process temperature (38°C / 100°F recommended) and agitate gently for about 10 s. Pour it back into its bottle, then wash with warm water for about 30 s. Repeat 3–4 times until the water runs clear with no black smudge.' },
  }],
  program(o) {
    const temp = CTEC_TEMPS[o.temp];
    const perGroup = o.mix.rolls / 4;
    const g = rollGroup(o.firstRoll, perGroup);
    const push = o.temp === '38' ? Number(o.push || 0) : 0;
    const notes = [`Times for rolls ${g * perGroup + 1}–${(g + 1) * perGroup} of this mix.`];
    if (rollGroup(o.lastRoll, perGroup) !== g) notes.push('This run spans two columns of the time table; using the times for the first roll.');
    if (push) notes.push(`Developer includes +${push * 30} s for the push.`);
    if (o.temp !== '38') notes.push('Push times are only given for 38°C.');
    notes.push('Times include 10 s for filling and emptying the tank. Start the timer as you begin pouring.');
    return {
      notes,
      steps: [
        { id: 'preheat', name: 'Preheat tank with warm water', sec: 300, temp, tol: T(1, 2),
          prep: 'Fill the tank with warm water from the bath. Coloured water when you empty it is normal.' },
        { id: 'dev', name: 'Color developer', sec: CTEC_TIMES[o.temp].develop[g] + push * 30, temp, tol: T(1, 2), critical: true,
          agitation: CTEC_AGITATE, prep: 'Pour in the developer, tap the tank twice to dislodge bubbles, then agitate.' },
        { id: 'wash1', name: 'Wash with warm water', sec: 30, temp, tol: T(5, 9) },
        { id: 'bx', name: 'Bleach fix', sec: CTEC_TIMES[o.temp].bleachFix[g], temp, tol: T(2, 4),
          agitation: CTEC_AGITATE, prep: 'Pour in the bleach fix, tap the tank twice to dislodge bubbles, then agitate.' },
        { id: 'wash2', name: 'Final wash', sec: 360, temp: R([30, 40], [86, 104]) },
        { id: 'stab', name: 'Stabilizer', sec: 60, temp: R([20, 40], [68, 104]) },
      ],
    };
  },
  agitationGuide: [
    'Develop at most two rolls per tank.',
    'Preheat the tank with water from the bath first.',
    'After filling with developer or bleach fix, tap the tank on the table twice to dislodge air bubbles.',
    'Agitate continuously for the first 30 s, then gently tilt once every 15 s. Put the tank back in the water bath after each agitation. Or rotate continuously in a rotary processor.',
    'Development time is critical. Wash, bleach fix and stabilizer times are minimums and may be extended by up to 50%.',
  ],
  keeping: {
    mixed: [
      { name: 'Color developer', weeks: 6 },
      { name: 'Bleach fix', weeks: 24 },
      { name: 'Stabilizer', weeks: 24 },
    ],
    table: [['Color developer', '6 weeks', '12 weeks'], ['Bleach fix', '24 weeks', '24 weeks'], ['Stabilizer', '24 weeks', '24 weeks']],
    leftoverConcentrateWeeks: 12,
  },
  troubleshooting: [
    ['Insufficient colour density', 'Underexposed film', 'Check camera and light meter'],
    ['Low colour density and contrast, mask too light', 'Underdeveloped: time too short and/or temperature too low', 'Increase developer time by 15–30 s and keep to the processing conditions'],
    ['Mask is brownish', 'Bleach-fix time too short', 'Bleach-fix the film again and rinse'],
    ['Milky streaks or patches after drying', 'Not enough bleaching, or film not wetted evenly', 'Treat again in bleach fix'],
    ['White spots on dry film', 'Calcium spots: water too hard', 'Mix stabiliser with 1/3 tap water + 2/3 demineralised (boiled) water and bathe the film again'],
    ['Unusual mask colour, minimum density too high, maximum too low', 'Developer contaminated with bleach fix', 'Mix fresh colour developer'],
  ],
};

// ---------------------------------------------------------------------------
// CineStill Cs41 "Color Simplified" 2-bath C-41 (liquid quart or powder 1 L)

const CS41_DEV_TEMP = T(39, 102);
const CS41_PUSH = { 0: 1, 1: 1.3, 2: 1.75, 3: 2.5 };
const CS41_ROOM_TO_HOT = R([24, 40], [75, 104]);

const cs41 = {
  id: 'cs41',
  name: 'CineStill Cs41',
  process: 'C-41',
  verified: false,
  source: 'CineStill Cs41 liquid and powder instructions (via published copies and reviews)',
  maxRollsPerTank: 2,
  rotary: true,
  mixes: {
    'powder-1l': {
      label: 'Powder, 1 L', rolls: 24, portion: 1,
      baths: [
        { name: 'Developer', water: { start: [600, 700], temp: T(38, 100) }, parts: [packet('Developer powder')], final: 1000 },
        { name: 'Blix', water: { start: [600, 700], temp: T(38, 100) }, parts: [packet('Blix Part A'), packet('Blix Part B')], final: 1000,
          notes: ['Part B changes the solution temperature sharply as it dissolves. Check with a thermometer before use.'] },
      ],
    },
    'liquid-qt': {
      label: 'Liquid, 1 quart', rolls: 24, portion: 1,
      baths: [
        { name: 'Developer', water: { start: null, temp: T(49, 120) }, parts: [bottle('Developer Part A'), bottle('Developer Part B'), bottle('Developer Part C')], final: 946,
          notes: ['Use the water amount printed on your sheet. Add each part while stirring and mix well after each.'] },
        { name: 'Blix', water: { start: null, temp: T(52, 125) }, parts: [bottle('Blix parts, in order (A, B, …)')], final: 946,
          notes: ['Use the water amount printed on your sheet. Add each part while stirring and mix well after each.'] },
      ],
    },
  },
  mixHint: () => 'Reusable for up to 24 rolls. Developer time increases with each roll (handled on the Develop tab).',
  mixNotes: [
    'Keep everything very clean. A few drops of blix in the developer will ruin it.',
    'Store in full, airtight bottles.',
  ],
  options: [
    { id: 'push', label: 'Push', choices: [
      { value: '0', label: 'None' }, { value: '1', label: '+1' }, { value: '2', label: '+2' }, { value: '3', label: '+3' },
    ], default: '0' },
  ],
  program(o) {
    const prev = o.firstRoll - 1;
    const push = Number(o.push || 0);
    const sec = 210 * (1 + 0.02 * prev) * CS41_PUSH[push];
    const notes = [`Developer: 3:30 at ${'102°F / 39°C'}, +2% per roll already processed (${prev} so far).`];
    if (push) notes.push(`Push +${push}: developer time × ${CS41_PUSH[push]}.`);
    notes.push('Lower temperatures (down to about 75°F / 24°C) work with much longer times. Use the chart on your sheet for those.');
    return {
      notes,
      steps: [
        { id: 'dev', name: 'Developer', sec, temp: CS41_DEV_TEMP, critical: true,
          prep: 'Pour in the developer and start agitating.' },
        { id: 'blix', name: 'Blix', sec: 480, temp: CS41_ROOM_TO_HOT, unverified: true },
        { id: 'wash', name: 'Wash', sec: 180, temp: CS41_ROOM_TO_HOT, unverified: true,
          prep: 'Running water, or fill and empty the tank about 7 times.' },
        { id: 'rinse', name: 'Final rinse (wetting agent)', sec: 60, temp: ROOM, unverified: true,
          prep: 'Optional stabilizer or wetting agent, 30–60 s.' },
      ],
    };
  },
  agitationGuide: [
    'Agitation patterns differ between versions of the Cs41 sheet. Follow yours, and set a reminder interval on the Develop tab.',
    'Too little agitation shifts colour toward red; too much shifts toward cyan.',
    'Only the developer is critical for time and temperature. Blix and wash are flexible (75–104°F / 24–40°C).',
  ],
  keeping: {
    mixed: [
      { name: 'Developer', weeks: 2, note: 'up to 6 weeks in a full, sealed bottle' },
      { name: 'Blix', weeks: 8, note: 'up to 12 weeks' },
    ],
    table: [['Developer (powder kit)', '2–6 weeks', '—'], ['Blix (powder kit)', '8–12 weeks', '—']],
  },
};

// ---------------------------------------------------------------------------
// Unicolor C-41 powder kit (1 L)

const UNI_TEMP = T(38, 102);
const UNI_PUSH = { 0: 1, 1: 1.25, 2: 1.5 };

const unicolor = {
  id: 'unicolor',
  name: 'Unicolor C-41 Powder',
  process: 'C-41',
  verified: false,
  source: 'Unicolor C-41 powder 1 L instructions (via published walkthroughs and retailer listings)',
  maxRollsPerTank: 2,
  rotary: true,
  mixes: {
    '1l': {
      label: '1 L', rolls: 8, portion: 1,
      baths: [
        { name: 'Developer', water: { start: 800, temp: T(43, 110) }, parts: [packet('Developer')], final: 1000 },
        { name: 'Blix', water: { start: 800, temp: T(43, 110) }, parts: [packet('Blix A'), packet('Blix B')], final: 1000,
          notes: ['Blix cools noticeably as it dissolves.'] },
        { name: 'Stabilizer', water: { start: 900, temp: ROOM }, parts: [packet('Stabilizer')], final: 1000,
          notes: ['Stabilizer mixing is from a third-party walkthrough. Check your sheet.'] },
      ],
    },
  },
  mixHint: () => 'Rated for about 8 rolls of 36 exposures. The sheet explains how to reuse it for more.',
  mixNotes: [
    "Mix whole packets. Don't split the powder: the components settle unevenly.",
    'Stir continuously and keep everything very clean. A few drops of blix or soap can ruin the developer.',
    'Mixing with water warmer than your process temperature gets you started sooner.',
  ],
  options: [
    { id: 'push', label: 'Push', choices: [
      { value: '0', label: 'None' }, { value: '1', label: '+1' }, { value: '2', label: '+2' },
    ], default: '0' },
  ],
  program(o) {
    const push = Number(o.push || 0);
    const notes = [];
    if (push) notes.push(`Push +${push}: developer time × ${UNI_PUSH[push]}.`);
    notes.push('Reusing beyond the rated rolls needs longer times. Use the reuse table on your sheet.');
    return {
      notes,
      steps: [
        { id: 'presoak', name: 'Pre-soak', sec: 60, temp: UNI_TEMP },
        { id: 'dev', name: 'Developer', sec: 210 * UNI_PUSH[push], temp: UNI_TEMP, critical: true },
        { id: 'blix', name: 'Blix', sec: 390, temp: UNI_TEMP },
        { id: 'wash', name: 'Wash', sec: 180, temp: R([35, 41], [95, 105]) },
        { id: 'stab', name: 'Stabilizer', sec: 60, temp: ROOM, prep: '30 s to 1 min.' },
      ],
    };
  },
  agitationGuide: [
    'Follow the agitation pattern on your Unicolor sheet, and set a reminder interval on the Develop tab.',
    'Hold the developer at 102°F (38°C). There is only a small margin for drift.',
    'Dry for 2+ hours below 140°F (60°C).',
  ],
};

// ---------------------------------------------------------------------------
// CineStill Df96 monobath (B&W, ready-to-use liquid)

const DF96_MODES = {
  80: { t: T(27, 80), sec: 180, label: 'Constant', agitation: { continuous: true, label: 'Constant: fluid inversions or rotations, changing direction' } },
  75: { t: T(24, 75), sec: 240, label: 'Intermittent', agitation: { initial: 30, every: 60, cue: 'Agitate for 10 s', label: '30 s constant, then 10 s every minute' } },
  70: { t: T(21, 70), sec: 360, label: 'Minimal', agitation: { initial: 10, every: 60, cue: 'Gentle agitation for 5 s', label: '10 s gentle, then 5 s every minute' } },
};

const df96 = {
  id: 'df96',
  name: 'CineStill Df96 Monobath',
  process: 'B&W',
  verified: false,
  source: 'CineStill Df96 complete instructions (via published copies and retailer listings)',
  maxRollsPerTank: 2,
  rotary: false,
  mixes: {
    liquid: {
      label: '1 L liquid', rolls: 16, portion: 1,
      baths: [{ name: 'Df96', water: null, parts: [], final: null,
        notes: ['Ready to use. No mixing needed. Pour it back into its bottle after each use.'] }],
    },
  },
  mixHint: () => 'Processes 16+ rolls per liter.',
  mixNotes: ['Bring it to temperature in a water bath before use.'],
  options: [
    { id: 'mode', label: 'Temperature & agitation', choices: [
      { value: '80', label: T(27, 80), sub: 'Constant' },
      { value: '75', label: T(24, 75), sub: 'Intermittent' },
      { value: '70', label: T(21, 70), sub: 'Minimal' },
    ], default: '75' },
  ],
  program(o) {
    const m = DF96_MODES[o.mode];
    const prev = o.firstRoll - 1;
    const sec = Math.min(Math.max(480, m.sec), m.sec + 15 * prev);
    const notes = [`${m.label} agitation: ${m.agitation.label}.`, 'Times are minimums. Extra time only fixes more fully; it does not add development.'];
    if (prev) notes.push(`+15 s per roll already processed (${prev}), up to 8 min.`);
    return {
      notes,
      steps: [
        { id: 'df96', name: 'Df96 develop + fix', sec, temp: m.t, tol: T(1, 2), critical: true, agitation: m.agitation,
          unverified: prev > 0 },
        { id: 'wash', name: 'Wash', sec: 300, temp: ROOM,
          prep: 'Running water, or fill and empty the tank at least 10 times.' },
        { id: 'rinse', name: 'Final rinse', manual: true,
          text: 'Rinse one last time, optionally with a few drops of wetting agent. Distilled water prevents water spots.' },
      ],
    };
  },
  agitationGuide: [
    'Temperature drives development. Agitation reduces it. Times are minimums.',
    'Push or pull by changing temperature: about 10°F (6°C) per stop. See the chart on your sheet.',
    'Low-water wash: fill with water within 10°F (6°C) of the process temperature, invert 5×, drain; refill, invert 10×, drain; refill, invert 20×, drain.',
  ],
};

// ---------------------------------------------------------------------------
// CineStill Cs6 "Creative Slide" 3-bath E-6

const D9_TEMP = T(40, 104);
const CS6_DILUTION = {
  '1': { label: '1+1', sub: 'Warm tone', sec: 555 },
  '2': { label: '1+2', sub: 'Highlight latitude', sec: 660 },
  '3': { label: '1+3', sub: 'Pull −1', sec: 780 },
};

const cs6 = {
  id: 'cs6',
  name: 'CineStill Cs6 Creative Slide',
  process: 'E-6',
  verified: false,
  source: 'CineStill Cs6 / D9 product pages and published reviews',
  maxRollsPerTank: 2,
  rotary: true,
  needsTankVolume: true,
  mixes: {
    '1l': {
      label: '1 L kit', rolls: 16, portion: 1,
      baths: [
        { name: 'D9 1st Developer (stock)', water: { start: [600, 700], temp: T(44, 111) }, parts: [packet('D9 powder')], final: 1000,
          notes: ['This is a stock solution. Dilute it fresh for each run (the Develop tab shows amounts) and discard after use.'] },
        { name: 'Cr6 Color & Reversal', water: { start: null, temp: null }, parts: [bottle('Cr6 concentrate')], final: null,
          notes: ['Follow the amounts on your sheet. Reusable for 16+ rolls.'] },
        { name: 'Bf6 Bleaches & Fixer', water: { start: 414, temp: T(60, 140) }, parts: [bottle('Bf6 Part A'), bottle('Bf6 Part B')], final: null,
          notes: ['Add Part A then Part B while stirring, then top up as your sheet says. Reusable for 24+ rolls. Aerate it regularly.'] },
      ],
    },
  },
  mixHint: () => 'D9 makes 2 L of one-shot working solution (16 rolls at 1+1). Cr6 and Bf6 are reusable.',
  mixNotes: ['Only the first developer is critical for time and temperature.'],
  options: [
    { id: 'dil', label: 'D9 dilution', choices: Object.entries(CS6_DILUTION).map(([value, d]) => ({ value, label: d.label, sub: d.sub })), default: '1' },
  ],
  program(o) {
    const d = CS6_DILUTION[o.dil];
    const { stock, water } = dilute(o.tankMl, Number(o.dil));
    return {
      notes: [
        { d9: true, stock, water, label: d.label },
        'Without a water bath, preheat the D9 2°F (1°C) warmer.',
        'D9 times vary slightly between versions of the instructions. Check yours.',
      ],
      steps: [
        { id: 'd9', name: `D9 1st developer (${d.label})`, sec: d.sec, temp: D9_TEMP, critical: true,
          agitation: { initial: 0, every: 15, cue: 'Invert', label: 'Inversions every 15 s' }, agitationUnverified: true,
          prep: 'Pour in freshly diluted D9 and start agitating.' },
        { id: 'rinse1', name: 'Rinse', sec: 60, temp: 'warm water', unverified: true },
        { id: 'cr6', name: 'Cr6 Color & Reversal', sec: 360, temp: R([27, 40], [80, 104]) },
        { id: 'rinse2', name: 'Rinse', sec: 60, temp: 'warm water', unverified: true,
          prep: 'Rinse well: a poor wash after Cr6 leaves a colour cast in the highlights.' },
        { id: 'bf6', name: 'Bf6 Bleaches & Fixer', sec: 360, temp: R([23, 40], [75, 104]),
          prep: '6 minutes minimum; up to 10 is fine.' },
        { id: 'wash', name: 'Final wash', sec: 360, temp: 'running water, below 140°F / 60°C', unverified: true },
      ],
    };
  },
  agitationGuide: [
    'Only the D9 first developer is critical for time and temperature.',
    'Cr6: 6+ min at 80–104°F (27–40°C). Bf6: 6–10 min at 75–104°F (23–40°C), runs to completion.',
    'Wash well after Cr6 to avoid a colour cast in the highlights.',
  ],
};

export const KITS = Object.fromEntries([ctec41, cs41, unicolor, df96, cs6].map((k) => [k.id, k]));
export const DEFAULT_KIT = 'ctec41';
