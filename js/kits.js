// Kit recipes. Every number here comes from the manufacturer's datasheet;
// to add another kit, add another entry with the same shape.

export const KITS = {
  'adox-ctec41': {
    name: 'ADOX C-TEC 41',
    process: 'C-41',
    source: 'ADOX C-TEC 41 datasheet, version 9/2026',
    capacityRolls: 16, // 35mm or 120
    maxRollsPerTank: 2,
    concentrateBottleMl: 200,

    // Partial-mix table. Water is the total water for the batch; the
    // datasheet diagrams start with 200 ml, add the parts, then top up.
    mixes: {
      500: {
        rolls: 8,
        baths: [
          { id: 'cd', name: 'Color Developer CD', water: 200, parts: [['CD Part 1', 100], ['CD Part 2', 100], ['CD Part 3', 100]] },
          { id: 'bx', name: 'Bleach Fix BX', water: 300, parts: [['BX Part 1', 100], ['BX Part 2', 100]] },
          { id: 'stab', name: 'Stabilizer STAB', water: 400, parts: [['STAB', 100]] },
        ],
      },
      1000: {
        rolls: 16,
        baths: [
          { id: 'cd', name: 'Color Developer CD', water: 400, parts: [['CD Part 1', 200], ['CD Part 2', 200], ['CD Part 3', 200]] },
          { id: 'bx', name: 'Bleach Fix BX', water: 600, parts: [['BX Part 1', 200], ['BX Part 2', 200]] },
          { id: 'stab', name: 'Stabilizer STAB', water: 800, parts: [['STAB', 200]] },
        ],
      },
    },
    // Diagrams: pour 1/5 of the final volume as water first, add the parts,
    // then top up with the rest of the water.
    startWaterFraction: 0.2,
    mixWaterTempC: [20, 45],
    mixNotes: [
      'Developer colour check: clear after Part 1, pink after Part 2, yellowish after Part 3.',
      'To start right away, use water about 10°C above your processing temperature and let it cool.',
      'Store in airtight, brown, completely full bottles. Reheat in a water bath and measure the temperature inside the bottle.',
    ],

    // Optional Remjet Remover (sold separately) for ECN-2 motion picture film.
    remjet: { name: 'C-TEC RJR', concentrate: 200, water: 800, final: 1000 },

    temperatures: [30, 38],

    // Development and bleach-fix times in seconds, indexed by roll-group.
    // A group is 2 rolls for the 500 ml mix and 4 rolls for the 1000 ml mix.
    times: {
      30: { develop: [480, 540, 600, 660], bleachFix: [360, 480, 720, 1200] },
      38: { develop: [195, 210, 225, 240], bleachFix: [240, 360, 600, 900] },
    },
    // Push development is only specified at 38°C: +30 s per stop.
    pushPerStopSec: { 38: 30 },

    // Fixed steps. Times include 10 s for filling and emptying the tank.
    steps: [
      { id: 'preheat', name: 'Preheat tank with warm water', temp: 'process', tol: '±1°C', sec: 300 },
      { id: 'develop', name: 'Color developer', temp: 'process', tol: '±1°C', sec: 'develop', agitate: true, critical: true },
      { id: 'wash1', name: 'Wash with warm water', temp: 'process', tol: '±5°C', sec: 30 },
      { id: 'bleachFix', name: 'Bleach fix', temp: 'process', tol: '±2°C', sec: 'bleachFix', agitate: true },
      { id: 'wash2', name: 'Final wash', temp: '30–40°C', sec: 360 },
      { id: 'stab', name: 'Stabilizer', temp: '20–40°C', sec: 60 },
    ],

    // Shelf life in weeks.
    keeping: {
      mixed: { cd: 6, bx: 24, stab: 24 },
      openedConcentrate: { cd: 12, bx: 24, stab: 24 },
      remainingAfterPartialMix: 12,
    },

    troubleshooting: [
      ['Insufficient colour density', 'Underexposed film', 'Check camera and light meter'],
      ['Low colour density and contrast, mask too light', 'Underdeveloped: time too short and/or temperature too low', 'Increase developer time by 15–30 s and keep to the processing conditions'],
      ['Mask is brownish', 'Bleach-fix time too short', 'Bleach-fix the film again and rinse'],
      ['Milky streaks or patches after drying', 'Not enough bleaching, or film not wetted evenly', 'Treat again in bleach fix'],
      ['White spots on dry film', 'Calcium spots: water too hard', 'Mix stabiliser with 1/3 tap water + 2/3 demineralised (boiled) water and bathe the film again'],
      ['Unusual mask colour, minimum density too high, maximum too low', 'Developer contaminated with bleach fix', 'Mix fresh colour developer'],
    ],
  },
};
