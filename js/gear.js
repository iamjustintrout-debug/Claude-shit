// "Getting started" page of the Guide: the equipment for developing film at
// home, grouped by job. need: 'essential' | 'recommended' | 'optional'.
// Ids are stored with the user's checklist ticks, so keep them stable.

export const GEAR = [
  {
    title: 'Loading film in the dark',
    intro: 'Film has to go from its cassette onto the reel in total darkness. After that, the lid goes on and you can work in normal light.',
    items: [
      { id: 'bag', name: 'Changing bag (dark bag)', need: 'essential',
        text: 'A light-tight double-zipped bag with arm sleeves, so you can load the tank anywhere. A larger "tent" style keeps the fabric off your hands and reels. A truly dark room works too.' },
      { id: 'tank', name: 'Developing tank with reels', need: 'essential',
        text: 'A light-tight tank you can pour in and out of with the lid on. A Paterson Super System 4 (or AP) 2-reel tank is the usual first tank: it takes two 35 mm rolls or one 120 roll, and the reels adjust between formats. Stainless steel tanks and reels last forever but are harder to load.' },
      { id: 'reels', name: 'Spare reels', need: 'optional',
        text: 'Reels must be bone dry to load, so a spare set lets you develop twice in one session.' },
      { id: 'opener', name: 'Cassette opener or bottle opener', need: 'essential',
        text: 'Pops the end cap off a 35 mm cassette inside the bag. A leader retriever lets you pull out film that was rewound all the way in, so you can cut the leader square in daylight.' },
      { id: 'scissors', name: 'Scissors', need: 'essential',
        text: 'To square off the film leader and cut the film from the spool. Round-tipped ones are kinder to the changing bag.' },
      { id: 'dummy', name: 'A practice roll', need: 'recommended',
        text: 'An expired or junk roll to practise loading the reel with your eyes open, then closed, until it is easy. Most first-roll problems are loading problems.' },
    ],
  },
  {
    title: 'Mixing and measuring',
    intro: 'Colour chemistry needs accurate amounts, and every bath needs its own container so nothing gets cross-contaminated.',
    items: [
      { id: 'jug', name: 'Measuring jugs or graduated cylinders', need: 'essential',
        text: 'A 1 L jug for mixing and a 100 ml cylinder for small parts. Plastic is fine. Mark each one for a single bath (developer, blix…) and never swap them.' },
      { id: 'syringe', name: 'Syringes (10–20 ml)', need: 'recommended',
        text: 'For tiny amounts like stabilizer or wetting agent, and for measuring partial bottles accurately.' },
      { id: 'bottles', name: 'Storage bottles', need: 'essential',
        text: 'One per bath, airtight, ideally brown or opaque. Developer lasts longer with no air in the bottle: fill it to the top, or use collapsible "accordion" bottles. Use bottles that can never be mistaken for drinks.' },
      { id: 'funnel', name: 'Funnel', need: 'essential',
        text: 'For pouring chemistry back into bottles without spills. A separate one for developer avoids contamination.' },
      { id: 'stir', name: 'Stirring rod or paddle', need: 'essential',
        text: 'Plastic or glass. Kits are mixed while stirring continuously.' },
      { id: 'labels', name: 'Labels and a waterproof marker', need: 'essential',
        text: 'Write the bath name and the date mixed on every bottle. DevApp tracks the date too, on the Batch tab.' },
      { id: 'water', name: 'Distilled water', need: 'recommended',
        text: 'For mixing chemistry if your tap water is hard, and for the final rinse so negatives dry without spots.' },
    ],
  },
  {
    title: 'Temperature control',
    intro: 'B&W is forgiving, but colour developer must stay within about half a degree. This is the step most beginners underestimate.',
    items: [
      { id: 'thermo', name: 'Accurate thermometer', need: 'essential',
        text: 'A digital probe thermometer that reads to 0.1°. Check it against a second thermometer if you can: being 1°C out shifts colours visibly.' },
      { id: 'bath', name: 'Water bath', need: 'essential',
        text: 'A tub, bucket or sink deep enough to stand the tank and bottles in, filled with water at process temperature. It keeps the chemistry from cooling between steps.' },
      { id: 'sousvide', name: 'Sous-vide cooker (or a CineStill TCS-1000)', need: 'recommended',
        text: 'Clipped to the water bath, it holds the temperature to a fraction of a degree. The easiest way to get consistent C-41 and E-6.' },
      { id: 'timer', name: 'Timer', need: 'essential',
        text: 'DevApp\'s Develop tab times every step and beeps for agitation, so your phone covers this. Keep it away from splashes.' },
    ],
  },
  {
    title: 'Processing, washing and drying',
    intro: 'After the chemistry, film needs a good wash and a slow, dust-free dry.',
    items: [
      { id: 'wash', name: 'Running water or a wash jug', need: 'essential',
        text: 'Most washes are running water or several fill-and-empty cycles. A hose or film washer that fits the tank makes it easier.' },
      { id: 'wetting', name: 'Wetting agent (Photo-Flo, Ilfotol)', need: 'recommended',
        text: 'A few drops in the final rinse help water sheet off the film so it dries without marks. Use far less than you think: too much leaves streaks.' },
      { id: 'fixer', name: 'Stop bath and fixer (traditional B&W only)', need: 'optional',
        text: 'Needed if you use a separate B&W developer. Not needed with a monobath like Df96, or for colour kits, which have their own baths.' },
      { id: 'clips', name: 'Film clips', need: 'essential',
        text: 'One at the top to hang the film, and a weighted one at the bottom so it dries straight and doesn\'t curl. Clothes pegs work in a pinch.' },
      { id: 'dryspot', name: 'A dust-free place to hang film', need: 'essential',
        text: 'A shower is ideal: run it hot for a minute first so the steam settles the dust. Shut the door and leave the film for 2–3 hours.' },
      { id: 'squeegee', name: 'Film squeegee', need: 'optional',
        text: 'Speeds up drying, but any grit on the blades scratches the whole roll. Many people skip it and rely on wetting agent.' },
      { id: 'cabinet', name: 'Drying cabinet', need: 'optional',
        text: 'Warm, filtered air dries film quickly and cleanly. Worth it if you develop a lot.' },
    ],
  },
  {
    title: 'Archiving your negatives',
    intro: 'Once dry, cut the film into strips and get it into archival sleeves straight away.',
    items: [
      { id: 'sleeves', name: 'Archival negative sleeves', need: 'essential',
        text: 'Acid-free, PVC-free polypropylene or polyester pages that hold cut strips: usually 7 strips of 5–6 frames for 35 mm, and 4 strips of 3 for 120 (6×6). PrintFile and similar brands fit standard ring binders.' },
      { id: 'binder', name: 'Binder or archival box', need: 'recommended',
        text: 'Keeps sleeves flat, dark and dust-free. Store it somewhere cool and dry, away from basements and attics.' },
      { id: 'pen', name: 'Archival pen', need: 'recommended',
        text: 'To write the date, film and roll number on each sleeve header. Matching it to your DevApp roll log makes negatives easy to find later.' },
      { id: 'gloves', name: 'Lint-free cotton or nitrile gloves', need: 'recommended',
        text: 'Fingerprints on negatives are permanent. Handle film by the edges, or wear gloves.' },
      { id: 'cutter', name: 'Negative cutter or sharp scissors', need: 'optional',
        text: 'Cuts cleanly between frames. A light pad helps you see where to cut.' },
    ],
  },
  {
    title: 'Viewing and scanning',
    intro: 'Optional, but most people want to see the pictures on a screen.',
    items: [
      { id: 'lightpad', name: 'Light pad', need: 'optional',
        text: 'A bright, even LED panel to inspect negatives and slides. Also the light source for camera scanning.' },
      { id: 'loupe', name: 'Loupe', need: 'optional',
        text: 'A magnifier to check sharpness and pick your best frames.' },
      { id: 'scanner', name: 'Scanner or camera-scanning setup', need: 'optional',
        text: 'A flatbed with film holders, a dedicated film scanner, or a digital camera with a macro lens and a film holder over a light pad.' },
      { id: 'blower', name: 'Air blower and anti-static brush', need: 'recommended',
        text: 'Removes dust before scanning or sleeving. Never use canned air: it can spray propellant on the film.' },
    ],
  },
  {
    title: 'Safety and clean-up',
    intro: 'Photo chemistry is safe to use at home with a few habits.',
    items: [
      { id: 'safety-gloves', name: 'Nitrile gloves and safety glasses', need: 'essential',
        text: 'Some developers cause skin allergies over time and several parts can damage eyes. Wear both while mixing and pouring.' },
      { id: 'vent', name: 'Good ventilation', need: 'essential',
        text: 'Mix and process with a window open or a fan running.' },
      { id: 'dedicated', name: 'Dedicated utensils', need: 'essential',
        text: 'Anything used for chemistry never goes back to the kitchen. Keep it all in its own box.' },
      { id: 'towels', name: 'Paper towels and a tray', need: 'recommended',
        text: 'Work in a plastic tray to catch drips, and wipe up spills straight away: dried chemistry turns to dust that contaminates everything.' },
      { id: 'waste', name: 'Waste container for spent chemistry', need: 'essential',
        text: 'Used fixer and blix contain silver. Collect spent chemistry in a labelled bottle and take it to a hazardous-waste drop-off instead of pouring it down the drain.' },
    ],
  },
];

// Which chemistry to start with, by what you shoot.
export const START_PATHS = [
  { title: 'Black & white, easiest', text: 'A monobath like CineStill Df96: one bottle, ready to use, works at room temperature. No mixing, no stop or fix, and temperature only changes the time.' },
  { title: 'Colour negative (C-41)', text: 'A 2- or 3-bath kit like CineStill Cs41 or C-TEC 41. Needs a water bath and an accurate thermometer; a sous-vide makes it easy.' },
  { title: 'Colour slide (E-6)', text: 'CineStill Cs6, or a 7-bath Kodak or JOBO kit. The most demanding on temperature. Get comfortable with C-41 first.' },
];

// The first session, in order.
export const FIRST_SESSION = [
  'Practise loading a junk roll onto the reel in daylight, then with your eyes closed.',
  'Pick your kit at the top of the Mix tab and mix the chemistry, ticking off each step. Tap "I\'ve mixed this" so DevApp tracks its age and roll count.',
  'Bring the bottles to temperature in the water bath.',
  'In the changing bag, load the film onto the reel, put it in the tank and close the lid.',
  'On the Develop tab, choose your film and settings, then tap Start Dev. DevApp times each step and beeps when to agitate.',
  'Wash, add a drop of wetting agent to the final rinse, and hang the film to dry.',
  'Save the roll to your log, then sleeve the negatives once dry.',
];
