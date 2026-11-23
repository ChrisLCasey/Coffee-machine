# Franke A600 – hands-on cleaning check

An interactive 3D Franke A600 FoamMaster with SU05 cooling unit. The person taking the test is **not shown any steps**; they have to work out and perform the 13-step cleaning procedure themselves on the touchscreen and on the machine. Wrong or out-of-order actions are blocked and logged silently; there is no timer or on-screen tally, and the test ends with a simple "Process complete" screen.

Static site, no build step.

## Deploy to Vercel

- **Drag and drop:** vercel.com/new → drop this folder.
- **CLI:** `cd` into the folder and run `npx vercel --prod` (accept the defaults; framework = "Other", no build command, output directory = `.`).

three.js is loaded from the jsDelivr CDN (pinned to r170) via the import map in `index.html`. To self-host it instead, run `scripts/vendor-three.sh` (needs npm + network) and follow the printed instructions.

## How the test works

- Drag = orbit, scroll = zoom, right-drag = pan. The view buttons (Touchscreen / Cooling unit / Top / Sink) jump the camera to those areas.
- Everything interactive highlights on hover, including parts that are *not* part of the procedure (drip tray, grounds drawer, outlet, front service door, inside of the cooling chamber). Touching those counts as a misstep.
- Touchscreen steps 1–7 use the on-screen UI. Steps 8–13 are done on the model: cooling-unit door → milk container and lid → suction hose → bean/powder hoppers → wash station (sink) → reassembly.
- Step 11 opens the wash station at the sink. It lists only the items that need washing; tap each one to wash it. Once all are done, a **Reassemble everything** button puts the lid and hose back on and completes the process.
- Opening and closing the cooling-unit door, and stowing the assembled container back in the unit, are neutral (never penalised).
- The cooling unit's door carries a small "SU05" plate. The wash station lists the reversible adapters only on an SU12 (per step 11 of the PDF).

## Facilitator options

Edit `js/config.js`, or use URL parameters:

| Parameter | Effect |
|---|---|
| `?unit=SU12` | Installs the larger SU12 unit; reversible adapters become required in step 11 |
| `?strictpin=1` | PIN must equal `pin` in `config.js` (default `1234`); otherwise any 4 digits work |
| `?hints=0` | Hides the Hint button |
| `?facilitator=1` | Shows a side panel with the step list and current progress |
| `?results=1` | Shows the detailed results at the end (time, missteps per step, hints) instead of the simple completion screen |

Combine with `&`, e.g. `/?facilitator=1&results=1`. Missteps are always logged in the background; `window.__app.proc.summary()` returns them in the browser console.

## About the 3D model

There is no CAD file for the A600 in the PDF, so the machine is built procedurally in Three.js to Franke's published dimensions (machine 340 × ~770 × 600 mm, SU05 270 × 540 × 475 mm, 2 bean hoppers + 1 powder hopper, 8" tilted touchscreen). It is a faithful-in-proportion stand-in, not a manufacturer CAD model; the touchscreen is drawn slightly larger than 8" so it is tappable. The touchscreen UI is modelled on the screenshots in the PDF.

To swap in a real model (GLB), keep the part ids used in `js/scene.js` (`door`, `container`, `lid`, `hose`, `hopper_bean_l`, `hopper_bean_r`, `hopper_powder`, `sink`, plus decoys) and register each with `registerPart(id, object)`.

## Files

```
index.html          page, import map, overlays
css/style.css       styling
js/config.js        facilitator settings
js/procedure.js     the 13 steps, ordering rules, scoring (pure logic)
js/touchscreen.js   the machine's touchscreen UI (canvas)
js/scene.js         3D model, picking, animations
js/panel.js         wash-station overlay (step 11) and Reassemble button
js/main.js          wiring, HUD, results
```
