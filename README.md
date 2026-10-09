# DevApp

A phone app for mixing film-developing chemistry and timing the process.

It opens to a **dashboard** of your mixed chemistry: rolls developed, rolls left, mix date, use-by
date and the next roll's developer time. Tap the DevApp logo to return to it. Reopening the app
while it's still open returns to where you were, and a timer that was running carries on.

Pick your chemistry at the top, and the whole app follows it:

| Kit | Process | Source status |
|---|---|---|
| C-TEC 41 | C-41 colour negative | Checked against the printed sheet (9/2026) |
| CineStill Cs41 (liquid quart or powder 1 L) | C-41 colour negative | Compiled from published instructions. Check your sheet |
| Unicolor C-41 Powder (1 L) | C-41 colour negative | Compiled from published instructions. Check your sheet |
| CineStill Df96 Monobath | B&W | Compiled from published instructions. Check your sheet |
| CineStill Cs6 Creative Slide | E-6 slide | Compiled from published instructions. Check your sheet |

- **Mix:** a tick-off checklist for each bath. Amounts that couldn't be confirmed show as *see sheet*
  rather than being guessed.
- **Develop:** a step-by-step timer.
  - Times adjust to the kit's options (temperature, push, dilution) and to how many rolls the
    chemistry has already processed.
  - Agitation reminders beep and vibrate. Use the kit's own pattern, or pick every 15/30/60 s.
  - The countdown digits fill with liquid that stays level as you tilt the phone.
  - The screen stays awake while it runs.
- **Batch:** rolls developed and use-by dates, tracked separately for each kit.
- **Rolls:** a log of every roll you develop.
  - Records the film (picked from a list of colour C-41, E-6 and ECN-2 stocks, or typed in), format,
    chemistry, settings, developer time and temperature, and your notes.
  - Search, filter, edit or delete entries, and add past rolls by hand.
  - Export it as a CSV spreadsheet or a backup file, and import the backup on another device.
- **Guide:** processing notes, keeping times and troubleshooting for the selected kit.
- **Units:** the header toggle switches between °C/ml and °F/fl oz.

Steps marked **check sheet** are the least certain. Always follow the sheet that came with your kit.
Data is stored only on your device, and the app works offline once loaded.

## Installing on your phone (no App Store)

It's a Progressive Web App served by GitHub Pages:

- **iPhone:** open the site in Safari → Share → **Add to Home Screen**.
- **Android:** open it in Chrome → ⋮ menu → **Install app**.

## Development

```sh
npm start   # serves on http://localhost:8000
npm test    # unit tests for mixing/time logic and every kit
```

- `js/kits.js`: every kit's recipes and processing program. Add a kit by adding an entry. Mark it
  `verified: true` only once checked against the printed sheet.
- `js/films.js`: the film catalog for the picker.
- `js/logic.js`: pure calculation, unit-formatting and roll-log functions (tested in `tests/`).
- `js/app.js`: UI.
- `sw.js`: offline cache. **Bump `VERSION` whenever any file changes** so installed copies update.
