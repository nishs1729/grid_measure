# Testing GridMeasure

Two layers of tests check the tool after every change:

- **Unit tests** (Node's built-in test runner, no dependencies, a few seconds): the maths and data logic — homography, coordinates, zoom/pan limits, CSV format, grid overlay, points and state.
- **End-to-end tests** ([Playwright](https://playwright.dev), real Chromium, about 1–2 minutes): the actual page — loading, calibrating, measuring, zoom/pan, loupe, Ctrl-drag edges, overlay, export, the user guide, high-DPI screens, touch and a narrow screen. One test also runs `analysis/ventrum.py` on an exported CSV.

The app itself still has no dependencies; `package.json` exists only for the test tools.

## Running

```bash
npm install                        # once: installs @playwright/test
npx playwright install chromium    # once, if Chromium isn't installed yet
pip install numpy pillow           # once: fixtures and the analysis hand-off test

npm test                 # everything
npm run test:unit        # unit tests only (fast)
npm run test:e2e         # end-to-end tests only
npx playwright test tests/e2e/view.spec.js          # one file
npx playwright test -g "Ctrl \+ drag"               # tests matching a name
npx playwright test --project=touch                 # one browser setup
npx playwright test --headed                        # watch it in a visible browser
npx playwright show-trace test-results/<test>/trace.zip   # step through a failure
```

The end-to-end tests start their own static server on port 8123.

GitHub Actions runs the whole suite on every push and pull request (`.github/workflows/tests.yml`) and uploads the Playwright report when something fails.

## Layout

```
tests/
  fixtures/        grid images with a known grid → pixel mapping, and make_fixtures.py
  helpers/         shared helpers (fixture ground truth, approximate comparisons)
  unit/            *.test.js — node:test
  e2e/             *.spec.js — Playwright; helpers.js has the shared browser helpers
playwright.config.js
```

### Browser setups (Playwright projects)

| Project | Screen | Runs |
| --- | --- | --- |
| `desktop` | 1400 × 900 | all specs except `touch` and `narrow` |
| `hidpi` | 1400 × 900, devicePixelRatio 2 | `hidpi.spec.js` |
| `touch` | 1200 × 800 with a touch screen | `touch.spec.js` (tap, one-finger pan, pinch, drag) |
| `narrow` | 375 × 740 | `narrow.spec.js` (guide fills the screen, no overflow) |

## How the tests know the right answer

`tests/fixtures/make_fixtures.py` draws each grid image through a **known** homography G (grid → pixel) and saves G in `fixtures.json`. Tests click the true pixels of grid corners to calibrate, then compare GridMeasure's grid coordinates with the ground truth. Regenerate the images with `npm run test:fixtures` (only needed if you change the script).

| Fixture | Size | Grid |
| --- | --- | --- |
| `straight.png` | 800 × 600 | straight-on, 50 px per unit, origin at pixel (100, 500) |
| `tilted.png` | 1000 × 800 | strong perspective; a 10×10 block maps to a keystoned quadrilateral |
| `large.png` | 4200 × 3000 | straight-on, 100 px per unit |
| `small.png` | 120 × 90 | straight-on, 20 px per unit |

Files with awkward names, broken TIFFs and text files are created in memory by the tests (such names aren't valid on every OS).

## Test hook

Opening the app with `?test=1` exposes its state as `window.__gm.state`. Tests only **read** it, to check exact numbers (pixel and grid coordinates, the view, calibration) instead of parsing sidebar text. Without `?test=1` nothing is exposed.

## Writing new tests

- Put pure logic in modules without DOM access (like `csvFormat.js`, `view.js`, `homography.js`) and unit-test it directly.
- In end-to-end tests, give positions in **image pixels** and use `clickImage`, `dragImage` and `imageToClient` from `tests/e2e/helpers.js`; they convert through the current zoom and pan, so tests don't depend on window size.
- Use `calibrate(page, fixture, dst)` to place P1–P4 on the true corners.
- Answer `alert` / `confirm` with `handleDialogs(page, { accept })`.
- Read downloads with `page.waitForEvent('download')` (see `export.spec.js`).

### Gotchas learned while building the suite

- **Wheel events carry whole-pixel coordinates.** Hover a rounded screen position before zooming, or the zoom anchor differs from what the test expects.
- **Don't place measurement points on a calibration corner.** A click near an existing point selects it instead of adding one.
- **The point-row × button only appears on hover** — hover the row before clicking it.
- **The user guide animates in** (scale 0.98 → 1). Wait for it before measuring its size.
- **Lines exactly on the image border** can be clipped by floating-point rounding; test interior lines.
- The overlay is 1 px wide; sample a small patch (`canvasPatch`) rather than a single pixel.

## What's covered

| Area | Unit | End-to-end |
| --- | --- | --- |
| Homography | recovery on every fixture, custom P1–P4, rotation, inverse, collinear points at any scale | calibration on straight and tilted grids |
| Coordinates & view | fit, canvas ↔ image round trip, zoom anchor, zoom limits, scroll limits, resize, edge clamp | Ctrl+wheel anchor and limits, wheel / Shift+wheel, edge limits, Space / middle-drag, Fit, per-image view, resize |
| Points | add, move, recalibrate, delete, reset, selection, status line, image navigation | sidebar list, click vs drag threshold, drag, release outside canvas, nudge, delete keys, reset confirm, typing guard |
| Calibration edges | offset clamping | Ctrl/Cmd hover, drag, border clamp, no-ops, grid-off |
| Grid overlay | every segment on a grid line, horizon clipping, thinning, bounds, clipping | overlay pixels on the true lines, toggle with G / button |
| Loading | — | picker, drop, paste, odd names, bad files, remove, large image |
| Loupe | — | off by default, toggle, follows cursor, 2×–16× steps, remembered |
| CSV | header, rows, quoting, parse round trip, merge with old files, file names, timestamps | export contents, skip confirm / cancel, nothing-calibrated alert, append, reject foreign CSV, analysis hand-off |
| User guide | — | open / close (4 ways), tabs, arrow keys, links, remembered tab, sidebar link, shortcuts suspended |
| Screens | — | high-DPI, touch, narrow |
| Settings | storage round trip and failures | unit size / unit remembered |
