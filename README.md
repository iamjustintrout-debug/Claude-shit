# Film Dev Mixer

A phone app for mixing and processing the **ADOX C-TEC 41** colour negative (C-41) kit, built from the
manufacturer's datasheet (version 9/2026).

- **Mix:** a tick-off checklist for 500 ml (8 rolls) or 1000 ml (16 rolls) of developer, bleach fix and
  stabilizer, plus the optional Remjet Remover for ECN-2 film.
- **Develop:** a step-by-step timer for 30°C or 38°C. Development and bleach-fix times lengthen
  automatically as the chemistry is used, push processing at 38°C adds 30 s per stop, and the app beeps
  and vibrates for agitation. It keeps the screen awake while running.
- **Batch:** tracks rolls developed and shows use-by dates for each working solution and for leftover
  concentrate.
- **Guide:** agitation, ECN-2 remjet removal, keeping times, troubleshooting, safety and disposal.

It works offline once loaded. Data is stored only on your device.

## Installing on your phone (no App Store)

This is a Progressive Web App: host it once over HTTPS, then add it to your home screen. It opens
full-screen with its own icon, like a native app.

1. Publish it with GitHub Pages: in the repository go to **Settings → Pages**, set *Source* to
   **Deploy from a branch**, pick the branch and `/ (root)`, and save. The site appears at
   `https://<user>.github.io/<repo>/`.
2. **iPhone:** open that URL in Safari → Share → **Add to Home Screen**.
   **Android:** open it in Chrome → ⋮ menu → **Install app**.

To hear the beeps on iPhone, turn the volume up. Recent iOS versions play them even with the silent
switch on.

## Development

```sh
npm start   # serves on http://localhost:8000
npm test    # unit tests for the mixing/time logic
```

- `js/kits.js`: all kit data (amounts, times, keeping). Add another kit here.
- `js/logic.js`: pure calculation functions (tested in `tests/`).
- `js/app.js`: UI.
- `sw.js`: offline cache. **Bump `VERSION` when you change any file** so installed copies update.

Always double-check against the instruction sheet that came with your kit.
