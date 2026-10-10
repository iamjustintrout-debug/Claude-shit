// Film catalog for the film picker. `process` groups the list:
// C-41 (colour negative), E-6 (slide), ECN-2 (motion picture negative,
// needs remjet removal) and B&W. `disc` marks discontinued stocks people still
// shoot as expired film. Anything missing can be typed in as "Other".

const f = (process, brand, name, iso, extra = {}) => ({
  id: `${brand}-${name}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
  process, brand, name, iso, ...extra,
});

export const FILMS = [
  // ---- C-41 colour negative ----
  f('C-41', 'Kodak', 'Portra 160', 160),
  f('C-41', 'Kodak', 'Portra 400', 400),
  f('C-41', 'Kodak', 'Portra 800', 800),
  f('C-41', 'Kodak', 'Ektar 100', 100),
  f('C-41', 'Kodak', 'Ektacolor Pro 160', 160),
  f('C-41', 'Kodak', 'Gold 200', 200),
  f('C-41', 'Kodak', 'UltraMax 400', 400),
  f('C-41', 'Kodak', 'ColorPlus 200', 200),
  f('C-41', 'Kodak', 'Kodacolor 100', 100),
  f('C-41', 'Kodak', 'Kodacolor 200', 200),
  f('C-41', 'Kodak', 'Pro Image 100', 100),
  f('C-41', 'Fujifilm', 'Fujicolor 200', 200),
  f('C-41', 'Fujifilm', 'Fujicolor 400', 400),
  f('C-41', 'Fujifilm', 'Fujicolor C200', 200),
  f('C-41', 'Fujifilm', 'Superia X-TRA 400', 400),
  f('C-41', 'Fujifilm', 'Superia Premium 400', 400),
  f('C-41', 'Fujifilm', 'Fujicolor 100', 100),
  f('C-41', 'Fujifilm', 'Fujicolor Industrial 100', 100),
  f('C-41', 'CineStill', '50D', 50),
  f('C-41', 'CineStill', '400D', 400),
  f('C-41', 'CineStill', '800T', 800),
  f('C-41', 'Harman', 'Phoenix 200', 200),
  f('C-41', 'Harman', 'Phoenix II 200', 200),
  f('C-41', 'Harman', 'Red 125 (redscale)', 125),
  f('C-41', 'Ilford', 'Ilfocolor 400 Plus', 400),
  f('C-41', 'Lomography', 'Color Negative 100', 100),
  f('C-41', 'Lomography', 'Color Negative 400', 400),
  f('C-41', 'Lomography', 'Color Negative 800', 800),
  f('C-41', 'Lomography', "Color '92 400", 400),
  f('C-41', 'Lomography', 'LomoChrome Purple', 400),
  f('C-41', 'Lomography', 'LomoChrome Metropolis', 400),
  f('C-41', 'Lomography', 'LomoChrome Turquoise', 400),
  f('C-41', 'Lomography', 'LomoChrome Classicolor 200', 200),
  f('C-41', 'Lomography', 'Redscale XR 50-200', 100),
  f('C-41', 'Lucky', 'Color 200', 200),
  f('C-41', 'Wolfen', 'NC200', 200),
  f('C-41', 'Kodak', 'Aerocolor IV 125', 125),
  f('C-41', 'Reflx Lab', 'Pro 100', 100),

  // ---- E-6 colour slide ----
  f('E-6', 'Kodak', 'Ektachrome E100', 100),
  f('E-6', 'Fujifilm', 'Velvia 50', 50),
  f('E-6', 'Fujifilm', 'Velvia 100', 100),
  f('E-6', 'Fujifilm', 'Provia 100F', 100),

  // ---- ECN-2 motion picture (remove remjet first) ----
  f('ECN-2', 'Kodak', 'Vision3 50D (5203)', 50),
  f('ECN-2', 'Kodak', 'Vision3 250D (5207)', 250),
  f('ECN-2', 'Kodak', 'Vision3 200T (5213)', 200),
  f('ECN-2', 'Kodak', 'Vision3 500T (5219)', 500),
  f('ECN-2', 'Kodak', 'Verita 200D (5206)', 200),

  // ---- B&W negative (from the Df96 film rating chart) ----
  f('B&W', 'CineStill', 'BwXX', 250),
  f('B&W', 'Kodak', 'Tri-X 400', 400),
  f('B&W', 'Kodak', 'T-Max 100', 100),
  f('B&W', 'Kodak', 'T-Max 400', 400),
  f('B&W', 'Kodak', 'T-Max P3200', 3200),
  f('B&W', 'Ilford', 'FP4 Plus', 125),
  f('B&W', 'Ilford', 'HP5 Plus', 400),
  f('B&W', 'Ilford', 'Delta 100', 100),
  f('B&W', 'Ilford', 'Delta 400', 400),
  f('B&W', 'Ilford', 'Delta 3200', 3200),
  f('B&W', 'Ilford', 'Pan F Plus', 50),
  f('B&W', 'JCH', 'Street Pan 400', 400),
  f('B&W', 'Adox', 'Silvermax 100', 100),
  f('B&W', 'Adox', 'CHS 100 II', 100),
  f('B&W', 'Adox', 'CMS 20 II', 20),
  f('B&W', 'Kentmere', 'Pan 100', 100),
  f('B&W', 'Kentmere', 'Pan 400', 400),
  f('B&W', 'Rollei', 'RPX 25', 25),
  f('B&W', 'Rollei', 'RPX 100', 100),
  f('B&W', 'Rollei', 'RPX 400', 400),
  f('B&W', 'Rollei', 'Retro 80S', 80),
  f('B&W', 'Rollei', 'Retro 400S', 400),
  f('B&W', 'Foma', 'Retropan 320', 320),
  f('B&W', 'Foma', 'Fomapan 100', 100),
  f('B&W', 'Foma', 'Fomapan 200', 200),
  f('B&W', 'Foma', 'Fomapan 400', 400),
  f('B&W', 'Bergger', 'Pancro 400', 400),
  f('B&W', 'Arista', 'EDU Ultra 100', 100),
  f('B&W', 'Arista', 'EDU Ultra 200', 200),
  f('B&W', 'Arista', 'EDU Ultra 400', 400),

  // ---- Discontinued (expired stock) ----
  f('C-41', 'Fujifilm', 'Pro 400H', 400, { disc: true }),
  f('C-41', 'Fujifilm', 'Superia 200', 200, { disc: true }),
  f('C-41', 'Fujifilm', 'Superia 1600', 1600, { disc: true }),
  f('C-41', 'Fujifilm', 'Natura 1600', 1600, { disc: true }),
  f('C-41', 'Fujifilm', 'Pro 160NS', 160, { disc: true }),
  f('C-41', 'Kodak', 'Portra 160NC', 160, { disc: true }),
  f('C-41', 'Kodak', 'Portra 160VC', 160, { disc: true }),
  f('C-41', 'Kodak', 'Portra 400NC', 400, { disc: true }),
  f('C-41', 'Kodak', 'Max 400', 400, { disc: true }),
  f('C-41', 'Kodak', 'Gold 100', 100, { disc: true }),
  f('B&W', 'Kodak', 'Plus-X 125', 125, { disc: true }),
  f('C-41', 'AgfaPhoto', 'Vista Plus 200', 200, { disc: true }),
  f('C-41', 'AgfaPhoto', 'Vista Plus 400', 400, { disc: true }),
  f('C-41', 'Lomography', 'Color Negative 200', 200, { disc: true }),
  f('E-6', 'Kodak', 'Ektachrome E100G', 100, { disc: true }),
  f('E-6', 'Kodak', 'Ektachrome E100VS', 100, { disc: true }),
  f('E-6', 'Kodak', 'Elite Chrome 100', 100, { disc: true }),
  f('E-6', 'Fujifilm', 'Astia 100F', 100, { disc: true }),
  f('E-6', 'Fujifilm', 'Velvia 100F', 100, { disc: true }),
  f('E-6', 'AgfaPhoto', 'CT Precisa 100', 100, { disc: true }),
];

export const FILM_FORMATS = ['35mm', '120', '220', '4x5 sheet', '110', 'Other'];

export const filmLabel = (film) => `${film.brand} ${film.name}`;

const BY_ID = Object.fromEntries(FILMS.map((x) => [x.id, x]));
export const findFilm = (id) => BY_ID[id] ?? null;

// Groups for the picker, the kit's own process first.
export function filmGroups(process) {
  const order = ['C-41', 'E-6', 'ECN-2', 'B&W'].sort((a, b) => (b === process) - (a === process));
  const groups = order.map((p) => ({
    label: { 'C-41': 'C-41 colour negative', 'E-6': 'E-6 colour slide', 'ECN-2': 'ECN-2 motion picture (remove remjet)', 'B&W': 'Black & white negative' }[p],
    films: FILMS.filter((x) => x.process === p && !x.disc),
  }));
  groups.push({ label: 'Discontinued / expired', films: FILMS.filter((x) => x.disc) });
  return groups;
}
