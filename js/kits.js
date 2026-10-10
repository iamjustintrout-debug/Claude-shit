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
// CineStill Cs41 "Color Simplified" 2-bath C-41 (powder 1 L, liquid pint /
// quart / gallon). Both 2026 sheets (V9-26) share the processing steps and
// the variable-temperature chart.

// Shared by the variable-temperature charts on the CineStill sheets.
const CINE_TEMPS = {
  72: T(22, 72), 75: T(24, 75), 80: T(27, 80), 85: T(29.5, 85), 90: T(32, 90), 95: T(35, 95), 102: T(39, 102), 104: T(40, 104),
};
const tempChoices = (fs) => fs.map((f) => ({ value: String(f), label: CINE_TEMPS[f] }));

const CS41_CHART_TEMPS = [72, 75, 80, 85, 90, 95, 102];
// Developer minutes by push level and temperature column; null = not on the chart.
const CS41_CHART = {
  '-1': [null, 27, 16.25, 10, 6.5, 4.5, 2.75],
  0: [50, 35, 21, 13, 8.5, 5.75, 3.5],
  1: [null, 50, 28, 17, 11, 7.5, 4.55],
  2: [null, null, 37, 25, 14.75, 10, 6.13],
  3: [null, null, null, 35, 21, 14.33, 8.75],
};
const PUSH_LABEL = { '-2': 'Pull −2', '-1': 'Pull −1', 0: 'Normal', 1: 'Push +1', 2: 'Push +2', 3: 'Push +3' };

// Cs41 and Cs6 agitation depends on the developer temperature. `n` is the
// number of inversion cycles printed for the kit (4 for Cs41, 6 for Cs6).
function cineAgitation(f, n) {
  if (f <= 80) return { initial: 60, every: 120, cue: `${n} inversion cycles`, label: `Continuous for the first minute, then ${n} inversion cycles every 2 minutes` };
  if (f <= 90) return { initial: 30, every: 60, cue: `${n} inversion cycles`, label: `Continuous for the first 30 s, then ${n} inversion cycles every minute` };
  return null;
}
const CS41_HOT_AGITATION = { initial: 10, every: 30, cue: '4 inversion cycles', label: 'Continuous for the first 10 s, then 4 inversion cycles every 30 s' };
const CS41_ROOM_TO_HOT = R([24, 40], [75, 105]);
const CS41_MIX_WATER = T(38, 100);

const cs41Liquid = (label, rolls, reuse, d, b, s) => ({
  label, rolls, portion: 1, reuse,
  baths: [
    { name: 'Developer', water: { start: d[0], temp: T(49, 120) },
      parts: [{ name: 'Developer Part A', ml: d[1] }, { name: 'Developer Part B', ml: d[2] }, { name: 'Developer Part C', ml: d[3] }],
      final: d.reduce((a, x) => a + x, 0),
      notes: ['Stir continuously and mix well after each part. 120°F (49°C) water brings room-temperature concentrate to about 101.5°F (38.6°C).'] },
    { name: 'Blix', water: { start: b[0], temp: T(51.7, 125) },
      parts: [{ name: 'Blix Part A', ml: b[1] }, { name: 'Blix Part B', ml: b[2] }, { name: 'Blix Part C', ml: b[3] }],
      final: b.reduce((a, x) => a + x, 0),
      notes: ['Stir continuously and mix well after each part. 125°F (51.7°C) water brings room-temperature concentrate to about 101.5°F (38.6°C).'] },
    { name: 'Stabilizer / final rinse (optional)', water: { start: s[0], temp: null },
      parts: [{ name: 'Stabilizer', ml: s[1] }], final: s[0] + s[1] },
  ],
});

const cs41 = {
  id: 'cs41',
  name: 'CineStill Cs41',
  process: 'C-41',
  verified: true,
  source: 'CineStill Cs41 powder and liquid instruction sheets (2026, V9-26) and safety data sheets',
  maxRollsPerTank: 2,
  rotary: true,
  defaultMix: 'liquid-qt',
  mixes: {
    'powder-1l': {
      label: 'Powder, 1 L', rolls: 24, portion: 1, reuse: 0.02,
      baths: [
        { name: 'Color Developer', water: { start: [600, 700], temp: CS41_MIX_WATER }, parts: [packet('Color Developer')], final: 1000,
          notes: ['Use water at about 100°F (38°C) or warmer, for the developer and for topping up.'] },
        { name: 'Bleach & Fix', water: { start: [600, 700], temp: CS41_MIX_WATER }, parts: [packet('Part A'), packet('Part B')], final: 1000,
          notes: [
            'After Part A has dissolved, pour the solution into the 1000 ml storage bottle, then add Part B.',
            'Part B is endothermic: the solution gets cold while it dissolves (about 5 min). Pour it back and forth between the pitcher and the bottle until dissolved, then top up with ~100°F (38°C) water.',
          ] },
        { name: 'Stabilizer / final rinse (optional)', water: null, parts: [], final: null,
          notes: [
            'Optional. Use distilled water, Hexamine (fungicide) and/or Photo-Flo (surfactant).',
            'Modern colour films release their own stabilizers in the 2-bath process. Film more than 20 years old may need a formalin- or formaldehyde-based stabilizer.',
          ] },
      ],
    },
    'liquid-pt': cs41Liquid('Liquid, 1 pint (473 ml)', 12, 0.04, [296, 118, 30, 30], [266, 118, 30, 59], [444, 30]),
    'liquid-qt': cs41Liquid('Liquid, 1 quart (946 ml)', 24, 0.02, [591, 237, 59, 59], [532, 237, 59, 118], [887, 59]),
    'liquid-gal': cs41Liquid('Liquid, 1 gallon (3.78 L)', 96, 0.005, [2370, 946, 237, 237], [2130, 946, 236, 473], [3550, 237]),
  },
  mixHint: (key) => ({
    'powder-1l': 'One-shot: 8 rolls of 135-36 or 120 per litre. Reused, up to 24 rolls: developer time +2% per roll already processed.',
    'liquid-pt': 'One-shot: 4 rolls of 135-36 or 120. Reused: developer time +4% per roll already processed.',
    'liquid-qt': 'One-shot: 8 rolls of 135-36 or 120. Reused, up to 24 rolls: developer time +2% per roll already processed.',
    'liquid-gal': 'One-shot: about 32 rolls of 135-36 or 120. Reused: developer time +0.5% per roll already processed.',
  })[key] ?? '',
  mixNotes: [
    'Use water at the temperature you want to develop at, so it warms up faster. Stir continuously while mixing.',
    'Keep everything very clean. A few drops of blix, soap or other contaminants can destroy the developer.',
    'Mark your containers clearly so you never process out of order.',
    'Wear safety glasses, rubber gloves and a lab coat or other protective clothing. Final volumes may vary slightly with no effect on processing.',
  ],
  options: [
    { id: 'temp', label: 'Developer temperature', choices: tempChoices(CS41_CHART_TEMPS), default: '102' },
    { id: 'push', label: 'Push / pull', choices: ['-1', '0', '1', '2', '3'].map((v) => ({
      value: v, label: { '-1': 'Pull −1', 0: 'Normal', 1: '+1', 2: '+2', 3: '+3' }[v],
      sub: { '-1': '½× ISO', 0: 'Box speed', 1: '2× ISO', 2: '4× ISO', 3: '8× ISO' }[v],
    })), default: '0' },
  ],
  preSteps: [
    { id: 'presoak', label: 'Pre-soak first (optional, 1 min)',
      step: { id: 'presoak', name: 'Pre-soak', sec: 60, temp: 'developer temperature',
        prep: 'Fill the tank with water at the developer temperature to warm the film and tank. No agitation needed.' } },
    { id: 'ecn2', label: 'ECN-2 film: remove remjet first',
      step: { id: 'rjr', name: 'Remjet removal', manual: true,
        text: 'In the dark, soak the film in a remjet removal bath, then wash the backing off by hand under running water. Do not rub the emulsion. Use one-shot chemistry: do not process remjet film in the same solutions as other films (CineStill films have no remjet and are fine).' } },
  ],
  program(o) {
    const col = CS41_CHART_TEMPS.indexOf(Number(o.temp));
    const temp = CINE_TEMPS[o.temp];
    const push = Number(o.push || 0);
    const min = CS41_CHART[push][col];
    if (min == null) {
      return { error: `${PUSH_LABEL[push]} isn't on the Cs41 chart at this temperature. Pick a warmer one.` };
    }
    const prev = o.firstRoll - 1;
    const reuse = o.mix.reuse ?? 0.02;
    const sec = min * 60 * (1 + reuse * prev);
    const agitation = cineAgitation(Number(o.temp), 4) ?? CS41_HOT_AGITATION;
    const notes = [`${PUSH_LABEL[push]}: ${min} min from the chart for this temperature.`];
    if (prev) notes.push(`Weakened developer: +${reuse * 100}% per roll already processed (${prev} so far).`);
    if (prev && push > 0) notes.push('CineStill does not recommend reused developer for push processing.');
    if (prev && Number(o.temp) < 102) notes.push('Reused developer is less effective at lower temperatures.');
    notes.push('Without a temperature-control bath, warm the developer 2°F (1°C) more before you start.');
    notes.push(`Agitation: ${agitation.label.toLowerCase()}. One cycle is one back-and-forth rotation or inversion, changing direction.`);
    return {
      notes,
      steps: [
        { id: 'dev', name: 'Developer', sec, temp, critical: true, agitation,
          prep: 'Pour in the developer and start agitating.' },
        { id: 'blix', name: 'Bleach & fix', sec: 480, temp: CS41_ROOM_TO_HOT, agitation,
          prep: 'Pour in the blix. The remaining steps can be done in room light with the lid off.' },
        { id: 'wash', name: 'Wash', sec: 180, temp: CS41_ROOM_TO_HOT,
          prep: 'Running water, or fill and empty the tank 7 times.' },
        { id: 'stab', name: 'Stabilizer / final rinse (optional)', sec: 60, temp: ROOM,
          agitation: { initial: 15, every: 0, label: 'Agitate for the first 15 s' },
          prep: '½ to 1 min. Agitate for the first 15 s. Skip it if you are not using one.' },
        { id: 'dry', name: 'Dry', manual: true, text: 'Hang to dry below 140°F (60°C).' },
      ],
    };
  },
  agitationGuide: [
    'Agitation depends on developer temperature. 72–80°F (22–27°C): continuous for the first minute, then 4 inversion cycles every 2 minutes. 85–90°F (29.5–32°C): continuous for 30 s, then 4 cycles every minute. 95–102°F (35–39°C): continuous for 10 s, then 4 cycles every 30 s.',
    'One inversion cycle is one back-and-forth rotation or inversion, changing direction. Rotary drums can use constant agitation with lower chemical volumes.',
    'Variation in agitation causes slight colour shifts: too little shifts toward red, too much toward cyan.',
    'Only the developer is critical. Blix and wash work anywhere from 75°F to 105°F (24–40°C).',
    'Push: 1 stop under is 1.30× the time, 2 stops 1.75×, 3 stops 2.50×. Pushing costs quality, so start with the fastest film you can.',
    'Capacity per litre, one-shot: 8 rolls of 135-36, 120 or 8x10 sheets; 12 of 135-24; 4 of 220; 16 of 126; 36 of 110; 32 sheets of 4x5. Half that for 500 ml, a quarter for 250 ml.',
    'Reuse: pour used developer back with the unused developer. Raise the time by 4% per roll for a pint (or 500 ml), 2% for a quart (or 1 L), 1% for 2 L, 0.5% for a gallon. Reusing blix does not change its time.',
    'Ignore the roll count limits at your own risk: results drift gradually, so process until you no longer like them, and do it within a few days of mixing.',
  ],
  keeping: {
    mixed: [
      { name: 'Developer', weeks: 2, note: 'up to 6 weeks in a full, tightly capped bottle' },
      { name: 'Bleach & fix', weeks: 8, note: 'up to 12 weeks' },
    ],
    table: [['Developer (powder)', '2–6 weeks', '—'], ['Bleach & fix (powder)', '8–12 weeks', '—']],
  },
  troubleshooting: [
    ['Thin negatives', 'Low development temperature, underexposure, or exhausted developer', 'Reread the instructions and check temperature, solution capacity and exposure'],
    ['Magenta, dense negatives near the sprocket holes', 'Developer too warm, or overly vigorous agitation', 'Follow the temperature and agitation instructions'],
    ['Black specks', 'Remjet from motion-picture film', 'Remove remjet before processing, and use one-shot chemistry for that film'],
    ['Flat prints, lost shadow or highlight detail', 'Too little development', 'Increase development time'],
  ],
  safety: [
    'Developer (powder): harmful or toxic if swallowed; can cause an allergic skin reaction and serious eye damage; suspected of causing cancer; damages organs with repeated exposure; very toxic to aquatic life; corrosive to metals.',
    'Developer (liquid): Part A harmful if swallowed and irritating to skin, eyes and airways. Part B can cause allergic skin reactions, is suspected of causing cancer and is corrosive to metals. Part C (Danger) is toxic if swallowed and causes severe skin burns and eye damage.',
    'Blix: Part B (powder, Danger) causes serious eye damage and is suspected of damaging fertility. Liquid Part B (Danger) causes severe burns and is a flammable liquid; Parts A and C irritate skin and eyes.',
    'Stabilizer (liquid): harmful if swallowed, may cause an allergic skin reaction, flammable solid.',
    'In case of eye contact, flush with water for 15 minutes and contact a physician. Do not breathe vapour or mist.',
  ],
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

// Agitation method sets the native temperature and time. Values are the
// native °F, kept from earlier versions so saved settings still match.
const DF96_MODES = {
  80: { sec: 180, label: 'Constant', agitation: { continuous: true, label: 'Constant: fluid inversions or rotations, changing direction' } },
  75: { sec: 240, label: 'Intermittent', agitation: { initial: 30, every: 60, cue: 'Agitate for 10 s', label: '30 s constant, then 10 s every minute' } },
  70: { sec: 360, label: 'Minimal', agitation: { initial: 10, every: 60, cue: 'Gentle agitation for 5 s', label: '10 s gentle, then 5 s every minute' } },
};
// Push/pull moves the temperature 10°F (6°C) per stop. The chart covers 65–95°F.
const DF96_TEMPS = { 65: T(18, 65), 70: T(21, 70), 75: T(24, 75), 80: T(27, 80), 85: T(30, 85), 90: T(32, 90), 95: T(35, 95) };
const DF96_PUSH = [
  { value: '-1', label: 'Pull −1' }, { value: '-0.5', label: '−½' }, { value: '0', label: 'Box', sub: 'speed' },
  { value: '0.5', label: '+½' }, { value: '1', label: '+1' }, { value: '1.5', label: '3200', sub: 'film' }, { value: '2', label: '+2' },
];
const DF96_FILM = { std: 1, tgrain: 2, pancro: 3 };

const df96 = {
  id: 'df96',
  name: 'CineStill Df96 Monobath',
  process: 'B&W',
  verified: true,
  source: 'CineStill Df96 "Developer & Fix" 18 oz complete instructions',
  maxRollsPerTank: 2,
  rotary: false,
  defaultMix: '18oz',
  mixes: {
    '18oz': {
      label: '18 oz (532 ml)', rolls: 8, portion: 1, perRoll: 30,
      baths: [{ name: 'Df96', water: null, parts: [], final: null,
        notes: ['Ready to use. No mixing needed. Pour it back into its bottle after each use.'] }],
    },
    liquid: {
      label: '1 L', rolls: 16, portion: 1, perRoll: 15,
      baths: [{ name: 'Df96', water: null, parts: [], final: null,
        notes: ['Ready to use. No mixing needed. Pour it back into its bottle after each use.'] }],
    },
  },
  mixHint: (key) => key === '18oz'
    ? 'Processes 8+ rolls. Add 30 s for each roll already processed, until you reach 8 min.'
    : 'About twice the 18 oz bottle: 16+ rolls, adding 15 s per roll already processed, until you reach 8 min.',
  mixNotes: [
    'Bring it to temperature in a water bath before use.',
    'Shelf life is 1 year from purchase. Once used, reuse it within 2 months. Store it tightly capped in a full container.',
    'It turns yellow as it exhausts and dark amber when it has perished.',
  ],
  options: [
    { id: 'mode', label: 'Agitation', choices: Object.entries(DF96_MODES).map(([value, m]) => ({ value, label: m.label, sub: `${m.sec / 60} min` }))
      .reverse(), default: '75' },
    { id: 'push', label: 'Push / pull', choices: DF96_PUSH, default: '0' },
    { id: 'film', label: 'Film', choices: [
      { value: 'std', label: 'Most films' },
      { value: 'tgrain', label: 'T-Max, Delta', sub: '2× time' },
      { value: 'pancro', label: 'Bergger Pancro', sub: '3× time' },
    ], default: 'std' },
  ],
  program(o) {
    const m = DF96_MODES[o.mode];
    const push = Number(o.push || 0);
    const f = Number(o.mode) + push * 10;
    const temp = DF96_TEMPS[f];
    const pushName = DF96_PUSH.find((p) => p.value === o.push)?.label ?? o.push;
    if (!temp) {
      return { error: `${pushName === 'Box' ? 'Box speed' : pushName} with ${m.label.toLowerCase()} agitation is off the Df96 chart (65–95°F). Try another agitation method.` };
    }
    const base = m.sec * DF96_FILM[o.film ?? 'std'];
    const prev = o.firstRoll - 1;
    const per = o.mix.perRoll ?? 30;
    const sec = base >= 480 ? base : Math.min(480, base + per * prev);
    const notes = [`${m.label} agitation: ${m.agitation.label}.`];
    if (push) notes.push(`${push > 0 ? 'Push' : 'Pull'}: ${pushName}. Push or pull by changing temperature, about 10°F (6°C) per stop.`);
    if (o.push === '1.5') notes.push('For P3200 and Delta 3200 shot at 3200. Their native speed in Df96 is ISO 1000–1600.');
    if (o.film !== 'std') notes.push(`${o.film === 'tgrain' ? 'Tabular-grain films' : 'Bergger Pancro'} need ${DF96_FILM[o.film]}× the time to clear the dyes${o.film === 'pancro' ? ' and the anti-halation layer' : ''}.`);
    if (prev && base < 480) notes.push(`+${per} s per roll already processed (${prev}), up to 8 min.`);
    notes.push('Times are minimums. Extra time only fixes more fully; it does not add development. Don\'t let the tank stand still for more than a minute: it can cause bromide drag.');
    return {
      notes,
      steps: [
        { id: 'df96', name: 'Df96 develop + fix', sec, temp, tol: T(1, 2), critical: true, agitation: m.agitation,
          unverified: prev > 0 && o.mixKey !== '18oz' },
        { id: 'wash', name: 'Wash', sec: 300, temp: ROOM,
          prep: '5 min in running water, or fill and empty the tank 10 times.' },
        { id: 'rinse', name: 'Final rinse', manual: true,
          text: 'Rinse one last time, optionally with a few drops of wetting agent. Distilled water prevents water spots.' },
      ],
    };
  },
  agitationGuide: [
    'Temperature drives development. Agitation reduces the time needed. Times are minimums, and longer only fixes more fully.',
    'Native speed: 80°F (27°C) with constant agitation for 3+ min, 75°F (24°C) intermittent for 4+ min, or 70°F (21°C) minimal for 6+ min. Hold within ±2°F (1°C).',
    'Constant: fluid inversions or rotations, changing direction. Intermittent: 30 s constant, then 10 s every minute. Minimal: 10 s gentle, then 5 s every minute.',
    'Push or pull by changing temperature: about 10°F (6°C) per stop. Above 82°F you get pushed density; below 68°F, pulled density.',
    'Tabular-grain films (T-Max, Delta) need double the time to clear the pink/purple dyes. Bergger Pancro needs triple.',
    'Snip test before reusing: process a light-struck leader snip in a little Df96. It should come out opaque black. If it\'s thin, raise the temperature and retest, or retire the chemistry.',
    'If a film doesn\'t look fully cleared, put it back in Df96 for longer. It will not add development.',
    'Wash 5 min in running water, or fill and empty 10 times. Low-water wash: fill with water within 10°F (6°C) of the process temperature, invert 5×, drain; refill, invert 10×, drain; refill, invert 20×, drain.',
  ],
  keeping: {
    mixed: [{ name: 'Df96 (opened)', weeks: 8, note: 'reuse within 2 months of first use' }],
    table: [['Df96', 'Reuse within 2 months', '1 year from purchase']],
  },
  troubleshooting: [
    ['Thin negatives', 'Low processing temperature, underexposure, or exhausted developer', 'Increase exposure or temperature. Do a snip test'],
    ['Negatives not fully cleared', 'Colour-dye technology (T-Max, Delta), or not enough agitation', 'Process longer with more agitation'],
    ['Bromide drag', 'Tank left standing too long', 'Increase agitation'],
  ],
  safety: [
    'May be hazardous if misused. Wear safety glasses, rubber gloves and protective clothing.',
    'Don\'t take internally, and avoid contact with eyes and skin.',
  ],
};

// ---------------------------------------------------------------------------
// CineStill Cs6 "Creative Slide" 3-bath E-6 (2023 sheet). Three first
// developers: D6 DaylightChrome, T6 TungstenChrome, D9 DynamicChrome.

const CS6_CHART_TEMPS = [72, 75, 80, 85, 90, 95, 104];
// D6/T6 first-developer minutes by level (push at 1+1; stock is one stop more).
const CS6_CHART = {
  '-2': [17, 14, 11, 8.5, 7, 5.5, 3.5],
  '-1': [22, 18, 14, 11, 9, 7, 4.5],
  0: [26, 23, 19, 15, 12, 9, 6],
  1: [null, null, 25, 20, 16, 12, 8],
  2: [null, null, null, 26.5, 21.25, 16, 10.5],
};
const CS6_D9 = {
  1: { label: '1+1', sub: 'Warm tone', sec: 555 },
  2: { label: '1+2', sub: 'Neutral tone', sec: 660 },
  3: { label: '1+3', sub: 'Soft tone', sec: 780 },
};
const CS6_HOT_AGITATION = { initial: 0, every: 30, cue: '15 s: 6 inversion cycles', label: 'Continuous, or 15 s (6 lifts or inversion cycles) every 30 s' };
const isD9 = (o) => !o.mixKey || o.mixKey === '1l';

const CS6_FD_NOTES = ['Stock solution. Dilute it fresh for each run (the Develop tab shows amounts) and discard after use.',
  'Yellows with age and turns dark amber when perished.'];
const cs6Baths = (fd) => [
  fd,
  { name: 'Cr6 Color & Reversal', water: { start: 650, temp: R([29, 46], [85, 115]) }, parts: [bottle('Part A (whole bottle)'), bottle('Part B (whole bottle)')], final: null,
    notes: ['Use a clean 1 quart (1 L) container. Concentrates drop the temperature to about 104°F (40°C).',
      'Reusable for 16+ rolls. Turns dark brown or opaque when its oxidation protection is exhausted.'] },
  { name: 'Bf6 Bleaches & Fixer', water: { start: 414, temp: R([29, 60], [85, 140]) },
    parts: [bottle('Part A (whole bottle)'), bottle('Part B (whole bottle)'), bottle('Part C (whole bottle)')], final: null,
    notes: ['Use a clean 1 quart (1 L) container. Reusable for 24+ rolls.',
      'Store with air inside the bottle and aerate it often: oxidation keeps the bleach active. Retire it when film won\'t clear after 10 min, and re-fix that film.'] },
];

const cs6 = {
  id: 'cs6',
  name: 'CineStill Cs6 Creative Slide',
  process: 'E-6',
  verified: true,
  source: 'CineStill Cs6 Creative Slide instruction sheet (2023)',
  maxRollsPerTank: 2,
  rotary: true,
  needsTankVolume: true,
  defaultMix: 'd6',
  mixes: {
    d6: {
      label: 'D6 DaylightChrome kit', rolls: 16, portion: 1,
      baths: cs6Baths({ name: 'D6 DaylightChrome 1st Developer (stock)', water: { start: 470, temp: R([29, 60], [85, 140]) },
        parts: [bottle('D6 concentrate (whole bottle)')], final: 1000, notes: [...CS6_FD_NOTES, 'Neutral-tone 5500K slides. The concentrate drops the temperature to about 104°F (40°C).'] }),
    },
    t6: {
      label: 'T6 TungstenChrome kit', rolls: 16, portion: 1,
      baths: cs6Baths({ name: 'T6 TungstenChrome 1st Developer (stock)', water: { start: [600, 700], temp: R([29, 44], [85, 111]) },
        parts: [packet('T6 powder')], final: 1000, notes: [...CS6_FD_NOTES, 'Cool-tone 3200K slides, for tungsten-balanced film such as E100T. The powder drops the temperature to about 104°F (40°C).'] }),
    },
    '1l': {
      label: 'D9 DynamicChrome kit', rolls: 16, portion: 1,
      baths: cs6Baths({ name: 'D9 DynamicChrome 1st Developer (stock)', water: { start: [600, 700], temp: R([29, 44], [85, 111]) },
        parts: [packet('D9 powder')], final: 1000, notes: [...CS6_FD_NOTES, 'Warm-tone dynamic slides. The powder drops the temperature to about 104°F (40°C).'] }),
    },
  },
  mixHint: () => 'The 1st developer is single-use: 1 L of stock makes 2 L at 1+1, enough for 16 rolls of 135-36 or 120. Cr6 (16+ rolls) and Bf6 (24+ rolls) are reusable.',
  mixNotes: [
    'If a concentrate has floating crystals or powder, warm the whole bottle to at least 85°F (29°C) and shake until dissolved.',
    'Use a clean plastic stir stick and stir continuously. Keep everything very clean: a few drops of chemistry, soap or other contaminants can destroy the developers.',
    'Use water at the temperature you want to develop at. It shortens warm-up time.',
  ],
  options: [
    { id: 'temp', label: '1st developer temperature', when: (o) => !isD9(o), choices: tempChoices(CS6_CHART_TEMPS), default: '104' },
    { id: 'push', label: 'Push / pull', when: (o) => !isD9(o), choices: ['-2', '-1', '0', '1', '2', '3'].map((v) => ({
      value: v, label: { '-2': 'Pull −2', '-1': '−1', 0: 'Normal', 1: '+1', 2: '+2', 3: '+3' }[v],
    })), default: '0' },
    { id: 'strength', label: '1st developer strength', when: (o) => !isD9(o), choices: [
      { value: '1', label: '1+1', sub: 'Diluted' }, { value: '0', label: 'Stock', sub: 'Undiluted (+1 stop)' },
    ], default: '1' },
    { id: 'dil', label: 'D9 dilution', when: isD9, choices: Object.entries(CS6_D9).map(([value, d]) => ({ value, label: d.label, sub: d.sub })), default: '1' },
  ],
  preSteps: [
    { id: 'presoak', label: 'Pre-soak first (optional)',
      step: { id: 'presoak', name: 'Pre-soak', sec: 60, temp: 'developer temperature',
        prep: 'Fill with tempered water to pre-warm the film and tank to the developer temperature.' } },
  ],
  program(o) {
    const d9 = isD9(o);
    const fdName = { d6: 'D6', t6: 'T6' }[o.mixKey] ?? 'D9';
    let sec;
    let temp;
    let dil;
    let agitation;
    const notes = [];
    if (d9) {
      const d = CS6_D9[o.dil] ?? CS6_D9[1];
      sec = d.sec;
      temp = CINE_TEMPS[104];
      dil = { waterParts: Number(o.dil), label: d.label };
      agitation = CS6_HOT_AGITATION;
      notes.push(`D9 ${d.label} (${d.sub.toLowerCase()}): ${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')} at 40°C / 104°F.`);
      if (o.dil === '3') notes.push('1+3 (soft tone) is for inversion agitation only.');
    } else {
      const col = CS6_CHART_TEMPS.indexOf(Number(o.temp));
      const push = Number(o.push || 0);
      const stock = o.strength === '0';
      const level = push - (stock ? 1 : 0);
      const min = CS6_CHART[level]?.[col];
      if (min == null) {
        const hint = level > 2 ? 'Use stock (undiluted) for bigger pushes.'
          : level < -2 ? 'Use the 1+1 dilution to pull.' : 'Pick a warmer temperature.';
        return { error: `${PUSH_LABEL[push]} with ${stock ? 'stock' : '1+1'} ${fdName} isn't on the chart at this temperature. ${hint}` };
      }
      sec = min * 60;
      temp = CINE_TEMPS[o.temp];
      dil = stock ? { waterParts: 0, label: 'stock' } : { waterParts: 1, label: '1+1' };
      agitation = cineAgitation(Number(o.temp), 6) ?? CS6_HOT_AGITATION;
      notes.push(`${fdName} ${dil.label}, ${PUSH_LABEL[push].toLowerCase()}: ${min} min from the chart for this temperature. Adjust ±1–2 min for density.`);
    }
    const { stock, water } = dilute(o.tankMl, dil.waterParts);
    notes.unshift({ d9: true, name: fdName, stock, water, label: dil.label });
    notes.push('Without a water bath, preheat the 1st developer 2–4°F (1–2°C) warmer.');
    notes.push(`Agitation: ${agitation.label.toLowerCase()}. One cycle is one back-and-forth rotation or inversion, changing direction.`);
    const hot = Number(o.temp) === 104 || d9;
    return {
      notes,
      steps: [
        { id: 'fd', name: `${fdName} 1st developer (${dil.label})`, sec, temp, critical: true, agitation,
          prep: `Pour in freshly ${dil.label === 'stock' ? 'measured' : 'diluted'} ${fdName} and start agitating.` },
        { id: 'rinse1', name: 'Rinse', sec: 60, temp: hot ? T(39, 102) : temp,
          prep: 'Running water, or fill and empty the tank 6 times. Above 106°F (41°C) the rinse pushes the film.' },
        { id: 'cr6', name: 'Cr6 Color & Reversal', sec: 360, temp: R([26, 40], [80, 104]), agitation,
          prep: '6 minutes or more. Agitate as for the developer.' },
        { id: 'rinse2', name: 'Rinse', sec: 60, temp: R([24, 40], [75, 104]),
          prep: 'From here on you can work in room light with the lid off. Running water, or fill and empty 6 times. Rinse well: a poor rinse after Cr6 leaves a colour cast in the highlights.' },
        { id: 'bf6', name: 'Bf6 Bleaches & Fixer', sec: 360, temp: R([24, 40], [75, 104]), agitation,
          prep: '6 to 10 minutes. Agitate as for the developer.' },
        { id: 'wash', name: 'Final wash', sec: 360, temp: 'below 60°C / 140°F',
          prep: '6 minutes or more in running water, or fill and empty the tank more than 10 times.' },
        { id: 'final', name: 'Final rinse (optional)', manual: true,
          text: 'Distilled water, Hexamine (fungicide) and/or Photo-Flo (surfactant). Modern films need no separate stabilizer: the Bf6 bath releases it.' },
      ],
    };
  },
  agitationGuide: [
    'Only the 1st developer is critical for time and temperature. Cr6 and Bf6 process to completion.',
    'Agitation at 104°F (40°C): continuous, or 15 s (6 lifts or inversion cycles) every 30 s. At 85–90°F: continuous for 30 s, then 6 cycles every minute. At 72–80°F: continuous for the first minute, then 6 cycles every 2 minutes.',
    'D6 and T6 push/pull: change the 1st developer time from the chart, or push one stop by using stock instead of 1+1. A good starting point is 6 min at 104°F; up to 8 min for normal processing.',
    'D9 tones: 1+1 warm (9:15), 1+2 neutral (11:00), 1+3 soft (13:00, inversion only), all at 104°F (40°C).',
    'Find your temperature drop: pour 104°F water into the tank, run through the steps, then measure. Add half the drop to 104°F for your developer.',
    'Capacity per litre at 1+1: 8 rolls of 135-36 or 120, 12 of 135-24, 4 of 220, 16 of 126, 36 of 110, 32 sheets of 4x5. Stock doubles the volume needed. Cr6: 16 rolls per litre. Bf6: 24.',
    'Reusing Cr6 and Bf6 within a few days, you can often get 25–50% more rolls. Process until you no longer like the results, and snip-test after a week or more.',
  ],
  keeping: {
    mixed: [
      { name: '1st developer stock', weeks: 2, note: 'up to 6 weeks in a full, tightly capped bottle' },
      { name: 'Cr6 Color & Reversal', weeks: 6, note: 'up to 12 weeks' },
      { name: 'Bf6 Bleaches & Fixer', weeks: 8, note: 'up to 4 months, with air in the bottle' },
    ],
    table: [['D6 / T6 / D9 stock', '2–6 weeks', '—'], ['Cr6', '6–12 weeks', '—'], ['Bf6', '2–4 months', '—']],
  },
  troubleshooting: [
    ['Slides too dark', 'Underexposure, outdated film, 1st developer too cool, too short, contaminated, over-diluted or exhausted', 'Check exposure; hold 104°F; lengthen the 1st developer; mix fresh 1st developer'],
    ['Mask over highlights (high Dmin)', 'Bf6 exhausted or inactive', 'Aerate Bf6. If film won\'t clear after 10 min, retire it and re-fix the film'],
    ['Slides too thin', 'Overexposure, light or heat fogging, 1st developer too warm or too long, rinse above 106°F (41°C), or Cr6 too short', 'Check exposure and temperatures; shorten the 1st developer; give Cr6 its full 6+ min'],
    ['Blue or cyan cast with overall fog', '1st developer contaminated with fixer', 'Mix fresh 1st developer; keep bottles and tools separate'],
    ['Red cast in the blacks', '1st developer contaminated with Cr6', 'Mix fresh 1st developer'],
    ['Off-colour slides', 'Low processing temperature, 1st developer exhausted or contaminated, Cr6 temperature/time or pH, poor rinse after Cr6, inactive Bf6, uneven agitation', 'Hold temperatures; rinse well after Cr6; aerate Bf6 before use; agitate consistently'],
    ['Dirty, streaky or milky film', 'Silver residue or exhausted fixer', 'Return the film to Bf6 for 5 min; aerate Bf6; retire it if film won\'t clear in 10 min'],
    ['White dots', 'Sulfur precipitation in Bf6 from too much air', 'Mix fresh Bf6'],
    ['Black spots', 'Air bubbles, dirt in the solutions or tank, dust while drying', 'Tap the tank after pouring; keep the tank clean; dry in a clean space'],
    ['Scum on film', 'Wash-water residue', 'Rinse in distilled water and squeegee'],
    ['Opaque blank film', 'Processed out of order, or the 1st or 3rd bath was skipped', 'Follow the steps in order'],
    ['Clear blank film', 'Fogged, processed out of order, or Cr6 skipped', 'Follow the steps in order'],
    ['Blank sections', 'Film loaded wrong, or not enough chemistry for the tank', 'Check the reel and fill volume'],
  ],
  safety: [
    'D6, T6 and D9 contain hydroquinone compounds. Cr6 Part B contains a colour developing agent. Bf6 contains ammonium thiosulfate, EDTA and acetic acid (Part C can cause burns).',
    'All may cause irritation. Avoid skin contact; in case of contact, flush with water. Don\'t allow eye contact: flush for 15 minutes and contact a physician.',
  ],
};

// ---------------------------------------------------------------------------
// Kodak E-6 Film Processing Kit (7 baths, makes 5 L; Photo Systems, 2023)

const E6_38 = T(38, 100.4);
const E6_HOT = R([35, 40], [95, 104]);
const KODAK_FULL = { initial: 15, every: 30, cue: '2–3 inversions in 10 s, tap', label: 'Initial: turn the tank over 7–8 times in 15 s and tap. Then every 30 s: 2–3 inversions in 10 s, tap' };
const KODAK_INITIAL = { initial: 15, every: 0, label: 'Initial agitation only: turn the tank over 7–8 times in 15 s and tap' };
const ROTATE = { continuous: true, label: 'Constant rotation in the processor' };

// [first dev, reversal, colour dev A, colour dev B, pre-bleach, bleach, fixer, final rinse]
const kodakBaths = (water, c, final) => [
  ['First Developer', [['First Developer (bottle 1)', c[0]]]],
  ['Reversal Bath', [['Reversal Bath (bottle 2)', c[1]]]],
  ['Color Developer', [['Color Developer Part A (bottle 3A)', c[2]], ['Color Developer Part B (bottle 3B)', c[3]]],
    ['Start with the water, add Part A and stir, then add Part B and top up.']],
  ['Pre-Bleach', [['Pre-Bleach (bottle 4)', c[4]]]],
  ['Bleach', [['Bleach (bottle 5)', c[5]]]],
  ['Fixer', [['Fixer (bottle 6)', c[6]]]],
  ['Final Rinse', [['Final Rinse (bottle 7)', c[7]]]],
].map(([name, parts, notes]) => ({
  name, water: { start: water, temp: R([20, 40], [68, 104]) }, parts: parts.map(([n, ml]) => ({ name: n, ml })), final, notes,
}));

const kodake6 = {
  id: 'kodake6',
  name: 'Kodak E-6 Processing Kit',
  process: 'E-6',
  verified: true,
  source: 'Kodak Color Reversal E-6 Film Processing Kit instructions (Photo Systems, 2023)',
  maxRollsPerTank: 4,
  rotary: false,
  defaultMix: '1000',
  mixes: {
    350: { label: '350 ml', rolls: 1, portion: 0.07, baths: kodakBaths(150, [70, 14, 70, 24.8, 35, 182, 35, 3.5], 350) },
    500: { label: '500 ml', rolls: 2, portion: 0.1, baths: kodakBaths(230, [100, 20, 100, 35.5, 50, 260, 50, 5], 500) },
    1000: { label: '1 L', rolls: 4, portion: 0.2, baths: kodakBaths(460, [200, 40, 200, 71, 100, 520, 100, 10], 1000) },
    2000: { label: '2 L', rolls: 8, portion: 0.4, baths: kodakBaths(920, [400, 80, 400, 142, 200, 1040, 200, 20], 2000) },
    5000: { label: '5 L (whole kit)', rolls: 20, portion: 1, baths: kodakBaths(2000, [1000, 200, 1000, 355, 500, 2600, 500, 50], 5000) },
  },
  mixHint: (key) => `One-shot chemistry: use each bath once and discard it. Roll count assumes about 250 ml of each bath per 35 mm roll (the sheet gives no figure), so ${({ 350: 'this mix does 1 roll', 500: 'this does about 2 rolls', 1000: 'this does about 4 rolls', 2000: 'this does about 8 rolls', 5000: 'the whole kit does about 20 rolls' })[key] ?? ''}. Use your tank's fill volume.`,
  mixNotes: [
    'Each bath is mixed separately: start with water at 20–40°C (68–104°F), add the concentrate, then top up to the final volume.',
    'Use a separate, clearly labelled container for each bath. Even a trace of another bath in the first or colour developer ruins it.',
    'Store at 5–29°C (40–85°F). Do a snip test before processing full rolls with stored chemistry.',
  ],
  options: [
    { id: 'method', label: 'Processing method', choices: [
      { value: 'tank', label: 'Small tank', sub: 'Inversion' }, { value: 'rotary', label: 'Rotary processor', sub: 'Tube' },
    ], default: 'tank' },
    { id: 'fd', label: 'First developer time', choices: ['360', '390', '420'].map((v) => ({
      value: v, label: `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`,
    })), default: '360' },
  ],
  program(o) {
    const fd = Number(o.fd);
    const notes = [
      'Total darkness until the end of the reversal bath. Keep the tank closed throughout if you can, to avoid heat loss.',
      'Times include 10–20 s to drain. Start each step as you begin pouring.',
      'The first developer can be anywhere from 5:00 to 8:30 for your setup; once chosen, hold it within ±5 s and ±0.3°C (0.5°F). Adjust in 15 s steps for density.',
    ];
    if (o.method === 'rotary') {
      notes.push('Do not pre-wet the film: warm the tube from outside instead. Use your processor maker\'s warm-up, and the wash mode most like a continuous wash.');
      return {
        notes,
        steps: [
          { id: 'preheat', name: 'Processor warm-up', sec: 360, temp: E6_38, tol: T(1, 1.8),
            prep: 'Warm the processor with running water, warm air or a water jacket, as its maker recommends.' },
          { id: 'filmwarm', name: 'Film warm-up', sec: 240, temp: E6_38,
            prep: 'Load the tube with film and put it in the processor. No pre-wet.' },
          { id: 'fd', name: 'First developer', sec: fd, temp: E6_38, tol: T(0.3, 0.5), critical: true, agitation: ROTATE },
          { id: 'wash1', name: 'Wash', sec: 120, temp: E6_38, tol: T(1, 1.8) },
          { id: 'rev', name: 'Reversal bath', sec: 120, temp: E6_38, tol: T(1, 1.8), agitation: ROTATE },
          { id: 'cd', name: 'Color developer', sec: 240, temp: E6_38, tol: T(1, 1.8), agitation: ROTATE },
          { id: 'prebleach', name: 'Pre-bleach', sec: 120, temp: E6_HOT, agitation: ROTATE,
            prep: 'The remaining steps can be done in room light.' },
          { id: 'bleach', name: 'Bleach', sec: 360, temp: E6_HOT, agitation: ROTATE },
          { id: 'fix', name: 'Fixer', sec: 240, temp: E6_HOT, agitation: ROTATE },
          { id: 'wash2', name: 'Wash 1 of 3', sec: 60, temp: E6_HOT },
          { id: 'wash3', name: 'Wash 2 of 3', sec: 60, temp: E6_HOT },
          { id: 'wash4', name: 'Wash 3 of 3', sec: 120, temp: E6_HOT },
          { id: 'final', name: 'Final rinse', sec: 60, temp: 'ambient',
            prep: 'In the tube or in a separate tank outside the processor.' },
          { id: 'dry', name: 'Dry', manual: true, text: 'Dry as needed, up to 60°C (140°F).' },
          { id: 'post', name: 'Post-cycle wash', manual: true,
            text: 'Rinse the tray, tube and film holders thoroughly, especially of fixer: 5 min at 24°C (75°F). Let a hot-air-dried processor cool to room temperature before the next run.' },
        ],
      };
    }
    return {
      notes,
      steps: [
        { id: 'fd', name: 'First developer', sec: fd, temp: E6_38, tol: T(0.3, 0.5), critical: true, agitation: KODAK_FULL,
          prep: 'Pour in the first developer, then agitate: turn the tank over 7–8 times in 15 s and tap it.' },
        { id: 'wash1', name: 'Wash', sec: 120, temp: E6_HOT,
          prep: 'Flowing water, or 3–4 short washes over the 2 minutes, with initial and subsequent agitation.' },
        { id: 'rev', name: 'Reversal bath', sec: 120, temp: E6_HOT, agitation: KODAK_INITIAL },
        { id: 'cd', name: 'Color developer', sec: 360, temp: E6_38, tol: T(1, 2), agitation: KODAK_FULL },
        { id: 'prebleach', name: 'Pre-bleach', sec: 120, temp: E6_HOT, agitation: KODAK_INITIAL,
          prep: 'The remaining steps can be done in room light.' },
        { id: 'bleach', name: 'Bleach', sec: 360, temp: E6_HOT, agitation: KODAK_FULL },
        { id: 'fix', name: 'Fixer', sec: 240, temp: E6_HOT, agitation: KODAK_FULL },
        { id: 'wash2', name: 'Wash', sec: 360, temp: E6_HOT,
          prep: 'Flowing water, or several short washes, with initial and subsequent agitation.' },
        { id: 'final', name: 'Final rinse', sec: 60, temp: 'ambient', agitation: KODAK_INITIAL },
        { id: 'dry', name: 'Dry', manual: true, text: 'Dry as needed, up to 60°C (140°F).' },
      ],
    };
  },
  agitationGuide: [
    'Use a temperature-controlled water bath. First developer: 38.0 ±0.3°C (100.4 ±0.5°F). Colour developer: 38 ±1°C. Everything else: 35–40°C (95–104°F).',
    'Invertible tanks. Initial agitation: lift the tank from the bath, turn it over 7–8 times in 15 s, tap it to dislodge bubbles, and put it back. Subsequent agitation (first developer, colour developer, bleach, fixer, washes): every 30 s, turn it over 2–3 times in 10 s and tap. Reversal bath, pre-bleach and final rinse get initial agitation only.',
    'Non-invertible tanks: rotate the reels back and forth 7–8 times in 15 s, then 4–5 times in 10 s every 30 s.',
    'Rotary processors: the tube rotation provides agitation. Follow the processor maker\'s recommendations, but don\'t pre-wet the film: it can shift speed and colour balance with some emulsions.',
  ],
  keeping: {
    mixed: [{ name: 'Working solutions', weeks: 1, note: 'in partly filled bottles; up to 4 weeks stored under nitrogen' }],
    table: [['All working solutions', '1 week (4 under nitrogen)', '—']],
  },
  troubleshooting: [
    ['Fast speed (properly exposed slides look light)', 'First developer too active', 'Shorten the first developer in 15 s steps until density is right, but not below 5 min'],
    ['Slow speed (properly exposed slides look dark)', 'Not enough development', 'One at a time: give the processor 2 min more warm-up; give the film 1 min more warm-up; check you use enough first and colour developer; lengthen the first developer in 15 s steps'],
    ['Variable speed (too dark one run, too light the next)', 'Inconsistent conditions or mixing of the first developer', 'If the first run after a long idle is slow, add 2 min of processor warm-up for it. If it\'s random, add 2 min to both processor and film warm-up'],
    ['Yellow stain (streaks and patches, mostly in low-density areas)', 'Pre-bleach too short or exhausted, or oxidised colour developer', 'One at a time: pre-bleach for 4 min; mix fresh pre-bleach; mix fresh colour developer; use 50% more pre-bleach. Then check for mixing, storage or contamination errors'],
    ['Poor colour balance (blue or yellow)', 'Colour developer pH off: too little solution, or mixed wrong', 'Check the colour developer was mixed correctly and that you use the right volumes'],
  ],
  safety: [
    'Consult each bottle\'s safety data sheet: First Developer CAT 106 0920, Reversal Bath 106 0953, Color Developer 106 0995, Pre-Bleach 106 1068, Bleach 106 1100, Fixer 154 5466, Final Rinse 106 1258.',
  ],
};

// ---------------------------------------------------------------------------
// JOBO E-6 Color Positive Developing Kit #9220 (7 baths, 2.5 L, rotary)

const JOBO_MIX_WATER = R([25, 35], [77, 95]);
const JOBO_36 = R([33, 39], [91, 102]);
// [name, water, concentrate parts...]
const joboBaths = (k) => [
  ['First Developer FD', 800, [['R1 FD', 200]], ['Always mix the first developer first, and close it before opening any other bottle.']],
  ['Reversal Bath RV', 950, [['R2 RV', 50]]],
  ['Color Developer CD', 780, [['R3 CD Part A', 200], ['R3 CD Part B', 20]], ['Stir Part A into a clear solution (about 30 s) before adding Part B.']],
  ['Conditioner CT', 900, [['R4 CT', 100]]],
  ['Bleach BL', 480, [['R5 BL', 520]], k === 2.5 ? ['Uses both 650 ml bottles.'] : undefined],
  ['Fixer FX', 870, [['R6 FX', 130]]],
  ['Stabilizer STB', 990, [['R7 STB', 10]], ['Stir gently.']],
].map(([name, water, parts, notes]) => ({
  name, water: { start: water * k, temp: JOBO_MIX_WATER }, parts: parts.map(([n, ml]) => ({ name: n, ml: ml * k })), final: 1000 * k, notes,
}));

// Rotary times for 1 L, by rolls already through it: 1–4, 5–8, 9–12, 13–16.
const JOBO_TIMES = { fd: [375, 390, 405, 420], cd: [360, 420, 480, 540], bl: [360, 390, 420, 450] };

const joboe6 = {
  id: 'joboe6',
  name: 'JOBO E-6 Kit #9220',
  process: 'E-6',
  verified: true,
  source: 'JOBO E-6 Color Positive Developing Kit #9220 manual (2022.10)',
  maxRollsPerTank: 4,
  rotary: false,
  defaultMix: '1000',
  mixes: {
    1000: { label: '1 L', rolls: 16, portion: 0.4, baths: joboBaths(1) },
    1250: { label: '1.25 L (half kit)', rolls: 20, portion: 0.5, baths: joboBaths(1.25) },
    2500: { label: '2.5 L (whole kit)', rolls: 40, portion: 1, baths: joboBaths(2.5) },
  },
  mixHint: (key) => ({
    1000: '8 rolls of 135-36 or 120 one-shot, or up to 16 reused with longer times.',
    1250: '10 rolls one-shot, or up to 20 reused. The rest of the concentrate keeps in its original bottles.',
    2500: '20 rolls in best quality, about 30 in good quality, up to 40 before the chemistry is exhausted.',
  })[key] ?? '',
  mixNotes: [
    'Measure the water exactly and warm it to 30 ±5°C (86 ±9°F). Always put the water in first, then the concentrate.',
    'Never mix chemicals with each other: it can release toxic gas and heat. Even a trace of another bath in the first or colour developer causes density loss and colour shifts.',
    'If a concentrate has a deposit, stand the closed bottle in warm water until it dissolves.',
    'Store working solutions in airtight bottles. Never let the chemistry freeze: keep it between 5°C and 30°C.',
  ],
  options: [],
  program(o) {
    const per = o.mix.rolls / 4;
    const g = rollGroup(o.firstRoll, per);
    const notes = [`Rotary processing times for rolls ${g * per + 1}–${(g + 1) * per} of this mix.`];
    if (o.mixKey !== '1000') notes.push(`The manual prints times for 1 L (groups of 4 rolls). For ${o.mix.label} the groups scale to ${per} rolls.`);
    if (rollGroup(o.lastRoll, per) !== g) notes.push('This run spans two columns of the time table; using the times for the first roll.');
    if (g >= 2) notes.push('These are the reuse times: expect somewhat lower quality than one-shot.');
    notes.push('Times include 10 s between steps. Change the wash water every 30–45 s.');
    notes.push('Not using a rotary processor? You may need to adjust the first developer time, and work in total darkness until the end of the reversal bath.');
    const scaled = o.mixKey !== '1000';
    return {
      notes,
      steps: [
        { id: 'preheat', name: 'Preheat', sec: 300, temp: E6_38, tol: T(0.6, 1),
          prep: 'Warm the drum, reel and film to the first developer temperature.' },
        { id: 'fd', name: 'First developer FD', sec: JOBO_TIMES.fd[g], temp: E6_38, tol: T(0.3, 0.5), critical: true, agitation: ROTATE, unverified: scaled },
        { id: 'wash1', name: 'First wash', sec: 150, temp: E6_38, tol: T(0.6, 1) },
        { id: 'rev', name: 'Reversal bath RV', sec: 120, temp: E6_38, tol: T(0.6, 1), agitation: ROTATE },
        { id: 'cd', name: 'Color developer CD', sec: JOBO_TIMES.cd[g], temp: E6_38, tol: T(0.6, 1), agitation: ROTATE, unverified: scaled },
        { id: 'ct', name: 'Conditioner CT', sec: 120, temp: JOBO_36, agitation: ROTATE },
        { id: 'bl', name: 'Bleach BL', sec: JOBO_TIMES.bl[g], temp: JOBO_36, agitation: ROTATE, unverified: scaled },
        { id: 'fx', name: 'Fixer FX', sec: 240, temp: JOBO_36, agitation: ROTATE },
        { id: 'wash2', name: 'Second wash', sec: 180, temp: R([24, 41], [75, 106]) },
        { id: 'stb', name: 'Stabilizer STB', sec: 60, temp: R([24, 26], [75, 79]), agitation: { initial: 0, every: 0, label: 'No rotation: keep the whole film submerged' },
          prep: 'In a separate tray, not in the drum: stabilizer contaminates the lift, drum and reel. Take the film off the reel and submerge it fully for 1 minute.' },
      ],
    };
  },
  agitationGuide: [
    'Designed for rotary processing with constant rotation and precise temperature control. Use manual processing only if you can control both.',
    'First developer at 38.0 ±0.3°C. Preheat, washes, reversal and colour developer at 38.0 ±0.6°C. Conditioner, bleach and fixer at 36 ±3°C.',
    'For the most reliable results, use the first and colour developers one-shot. With about 120 ml per film in a JOBO drum, 2.5 L gives 20 films in best quality using the 1–4 and 5–8 roll times; the 9–12 and 13–16 times are for reused chemistry.',
    'Fill the first and colour developers quickly to avoid uneven colour and streaks.',
  ],
  keeping: {
    mixed: [
      { name: 'First developer, reversal, colour developer, conditioner', weeks: 1 },
      { name: 'Bleach, fixer, stabilizer', weeks: 24 },
    ],
    table: [
      ['First developer FD', '1 week', '12 weeks'], ['Reversal RV', '1 week', '12 weeks'], ['Color developer CD', '1 week', '12 weeks'],
      ['Conditioner CT', '1 week', '12 weeks'], ['Bleach BL', '24 weeks', '24 weeks'], ['Fixer FX', '24 weeks', '24 weeks'], ['Stabilizer STB', '24 weeks', '24 weeks'],
    ],
    leftoverConcentrateWeeks: 12,
  },
  troubleshooting: [
    ['Slides too light', 'Overexposure, first developer too long, or first developer contaminated with bleach or fixer', 'Check camera and exposure; shorten the first developer by 15–30 s; clean the processor and reels thoroughly'],
    ['Slides too dark', 'Underexposure, no preheat, or first developer too short', 'Check camera and exposure; add the preheat step; lengthen the first developer by 15–30 s'],
    ['Uneven colour, stripes, streaks', 'Fill volume too low, or first/colour developer poured in too slowly', 'Check the fill volume; preheat; pour the developers in quickly'],
    ['Colour fog', 'Dirty mixing containers or processor, or developers contaminated', 'Use a separate container for each bath; keep working-solution bottles tightly closed and apart'],
    ['Lime spots on dry film', 'Hard tap water in the stabilizer', 'Mix the stabilizer with 1 part tap water to 2 parts distilled or demineralised water'],
    ['Green maximum densities', 'Colour or first developer contaminated with stabilizer', 'Never pour stabilizer through the processor lift; dip the film in stabilizer off the reel'],
    ['Blue, too-light maximum densities', 'First developer contaminated with colour developer', 'Use a separate container for each bath; keep bottles closed and apart'],
  ],
  safety: [
    'Keep out of reach of children. In case of eye contact, rinse thoroughly with water and see a doctor if needed.',
    'Precautions for each bath are printed on its bottle label. Ask your local environmental authority how to dispose of used chemistry.',
  ],
};

export const KITS = Object.fromEntries([ctec41, cs41, unicolor, df96, cs6, kodake6, joboe6].map((k) => [k.id, k]));
export const DEFAULT_KIT = 'ctec41';
