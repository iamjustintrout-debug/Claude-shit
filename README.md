# DevApp

A phone app for mixing film-developing chemistry and timing the process.

It opens to a **dashboard**. New users see the Mix → Develop → Log flow and a button to start.
After that it leads with your chemistry (rolls used and left, use-by date, the next roll's developer
time and a Start button), then three activity counts (this week, 30 days, all time) and your 3 most recent rolls. With
several batches mixed, swipe the chip row to switch between them. Tap the raised Home button in the middle of the tab bar to return to it. Reopening the app
while it's still open returns to where you were, and a timer that was running carries on.

Pick your chemistry kit at the top of Develop, Batch, Mix or Guide (or tap a batch on the dashboard), and
the whole app follows it:

| Kit | Process | Source status |
|---|---|---|
| C-TEC 41 | C-41 colour negative | Checked against the printed sheet (9/2026) |
| CineStill Cs41 (powder 1 L; liquid pint, quart or gallon) | C-41 colour negative | Checked against the 2026 sheets and safety data sheets |
| Unicolor C-41 Powder (1 L) | C-41 colour negative | Compiled from published instructions. Check your sheet |
| CineStill Df96 Monobath (18 oz or 1 L) | B&W | Checked against the 18 oz sheet |
| CineStill Cs6 Creative Slide (D6, T6 or D9) | E-6 slide | Checked against the 2023 sheet |
| Kodak E-6 Processing Kit (350 ml – 5 L) | E-6 slide | Checked against the kit instructions |
| JOBO E-6 Kit #9220 (1 L, 1.25 L, 2.5 L) | E-6 slide | Checked against the kit manual |

Kits with a variable-temperature chart (Cs41, Cs6 D6/T6) let you pick the temperature and push/pull, and
the timer uses the sheet's time and agitation for that combination. Df96 sets the temperature from your
agitation method and push/pull.

- **Mix:** collapsible, numbered tick-off steps for each bath; a finished bath folds away and the next opens. Amounts that couldn't be confirmed show as *see sheet*
  rather than being guessed.
- **Develop:** a step-by-step timer.
  - Times adjust to the kit's options (temperature, push, dilution) and to how many rolls the
    chemistry has already processed.
  - Agitation reminders beep and vibrate. Use the kit's own pattern, or pick every 15/30/60 s.
  - The countdown digits fill with liquid that stays level as you tilt the phone.
  - The screen stays awake while it runs.
  - Leave the Develop tab mid-run and a floating timer bar follows you across the app. Pause,
    resume or start the next step from it, collapse it to a slim strip, or tap it to jump back.
- **Batch:** rolls developed and use-by dates, tracked separately for each kit.
- **Rolls:** a log of every roll you develop, with an activity card on top (rolls per week for the
  last 8 weeks, and your top films and chemistry for the last 30 days).
  - Records the film (picked from a list of C-41, E-6, ECN-2 and B&W stocks, or typed in), format,
    chemistry, settings, developer time and temperature, and your notes.
  - Search, filter, edit or delete entries, and add past rolls by hand.
  - Attach photos from each roll and view them full screen to see how that development turned out.
  - Export it as a CSV spreadsheet or a backup file (photos included), and import the backup on another device.
- **Notifications** (bell, next to the title): a badge counts what needs attention, most urgent
  first: chemistry nearing or past its use-by date, batches running low or used up, leftover
  concentrate about to expire, a finished roll that wasn't saved, snip-test reminders for idle stored
  chemistry, and backup reminders. Each has a shortcut to deal with it, and can be dismissed (it comes
  back if things get worse). Set the warning window, turn reminders off, or show the count on the
  home-screen icon in Settings.
- **Guide** (book, top right), two pages:
  - **Getting started:** the equipment for home developing (changing bag, tank and reels, measuring
    and mixing gear, thermometer and water bath, clips, archival sleeves, scanning and safety gear),
    each marked essential, recommended or optional. Tick off what you have to get a shopping list. Also
    which chemistry to start with and a first-session walkthrough.
  - **Your kit:** processing notes, keeping times, troubleshooting and safety notes for the selected kit.
- **Settings** (gear, top right): choose °C or °F and ml or fl oz independently; turn the end-of-step
  alarm, agitation beeps and floating timer on or off; keep the screen awake while developing, always,
  or never.

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
- `js/gear.js`: the Getting started equipment list.
- `js/logic.js`: pure calculation, unit-formatting and roll-log functions (tested in `tests/`).
- `js/app.js`: UI.
- `sw.js`: offline cache. **Bump `VERSION` whenever any file changes** so installed copies update.
