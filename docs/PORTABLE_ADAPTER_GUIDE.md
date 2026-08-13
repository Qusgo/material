# Portable Adapter Guide

This guide describes how a WebView, mini-program, or native shell should use the
current portable boundary without depending on browser DOM code.

The important idea is simple:

```txt
platform input -> command objects -> createSimulationEngine() -> RGBA buffer -> platform canvas
```

Do not port browser files first. Start from the DOM-free core plus
`src/03-simulation-engine.js`, then write a thin platform adapter around it.

## Core Files To Reuse

Load these files in order for a non-browser adapter:

1. `src/00-materials.js`
2. `src/00-world-arrays.js`
3. `src/00-world-state.js`
4. `src/00-core-state.js`
5. `src/01-cell-state.js`
6. `src/01-grid-editing.js`
7. `src/01-fill-editing.js`
8. `src/01-body-geometry.js`
9. `src/02-sources.js`
10. `src/02-flow-and-water.js`
11. `src/02-force.js`
12. `src/01-runtime-config.js`
13. `src/01-edit-commands.js`
14. `src/02-erosion.js`
15. `src/02-body-runtime.js`
16. `src/02-step-world.js`
17. `src/04-save-codec.js`
18. `src/03-lighting.js`
19. `src/03-render-buffer.js`
20. `src/03-simulation-engine.js`

These files should not require `document`, `canvas`, CSS, pointer events, or
`localStorage`.

Browser-only files begin after that boundary. They can be used as examples, but
they should not be required by another platform.
The same ordered portable-core list is maintained for tests in
`tests/portable-core-files.js`; `node tests/verify.js` fails if
this guide's list drifts from that shared list.

## Engine API

Create one engine per simulation surface:

```js
const engine = createSimulationEngine({
  cols: 120,
  rows: 180,
  cellSize: 4
});
```

The facade currently exposes:

- `engine.world` - the active world shell.
- `engine.currentWorld()` - installs and returns the engine world.
- `engine.edit(command)` - applies one edit command.
- `engine.cellAt(point)` or `engine.cellAt(x, y)` - maps platform canvas
  coordinates to a grid cell.
- `engine.computeFill(point)` or `engine.computeFill(x, y)` - returns
  `{ cells, target, clipped, cell }` for a fill preview without storing any UI
  state.
- `engine.finishEdit()` - clears transient motion after a completed draw/erase
  gesture so edited scenes restart cleanly.
- `engine.step(iterations)` - advances one or more physics ticks.
- `engine.materialCommand(command)` - adds, updates, or deletes runtime custom
  material definitions.
- `engine.runtimeSettingsCommand(command)` - changes clamped runtime settings
  such as source rate and lighting.
- `engine.runtimeSettings()` - returns the current runtime settings snapshot.
- `engine.renderBuffer(data)` - writes RGBA bytes into `data`, or allocates a
  `Uint8ClampedArray`.
- `engine.serialize()` - returns a portable snapshot object.
- `engine.restore(snapshot)` - restores a portable snapshot into the engine.
- `engine.resize(cols, rows, options)` - resizes/resamples the engine world.
- `engine.clear()` - clears editable simulation state.

Lower-level tests or custom facades can call
`resizeWorldGrid(world, cols, rows, options)` directly, but platform adapters
should prefer `engine.resize()` so the compatibility world shell stays in one
place.

This is still a compatibility facade, but `install:false` surfaces now keep
ordinary engine calls world-local. Platform adapters should use the facade
because it is the boundary where the remaining classic global mirrors can later
be removed. Only call `currentWorld()` when a legacy helper genuinely needs the
engine world selected as the active compatibility world.

## Adapter Contract

Treat each visible simulation surface as one engine instance. A WebView page,
mini-program canvas, or native view should hold that engine in its own adapter
state and should not share transient UI state between surfaces.

```js
const surface = {
  engine: createSimulationEngine({
    cols,
    rows,
    cellSize,
    install: false
  }),
  frameBuffer: new Uint8ClampedArray(cols * rows * 4),
  running: false,
  pointer: null
};
```

`install: false` is useful when the adapter creates several surfaces before it
renders or steps any of them. `edit()`, `finishEdit()`, `step()`,
`renderBuffer()`, `serialize()`, `restore()`, and `resize()` operate on the
engine world without making it the global active world. `currentWorld()`
intentionally selects the engine world as the active compatibility world.
Engines created without `install:false` also keep the legacy behavior of
installing after restore.

The adapter contract is:

- Keep one `engine` per surface.
- Keep pointer, menu, preview, timer, and storage handles outside `engine.world`.
- Send edits as command objects with `engine.edit(command)`.
- Add, update, and delete custom materials with `engine.materialCommand()` so
  each surface keeps its own custom material definitions.
- Call `engine.finishEdit()` after a completed draw, erase, tint, fill, source,
  or body-placement gesture.
- Change source-rate and lighting values with `engine.runtimeSettingsCommand()`
  so each surface keeps its own runtime settings.
- Advance time with `engine.step()` only from the platform frame/timer loop.
- Draw only from `engine.renderBuffer(frameBuffer)`.
- Persist only `JSON.stringify(engine.serialize())`, then reload with
  `engine.restore(JSON.parse(raw))`.

The browser classic-script adapter also has `rebuildAppBodyMask(context)` for
legacy UI moments that need a mask refresh after resize, clear, or pointer
completion. New platform adapters should prefer engine methods and only add
their own adapter helper if their UI needs a similar lifecycle hook.
`appRenderBuffer(world, data, context)` is the browser bridge from canvas render
code to the surface engine's `renderBuffer()` method. New platform adapters
should normally call `engine.renderBuffer(frameBuffer)` directly and keep their
own canvas upload code separate.
`appDebugBasins(world, context)` is a browser debug helper for the existing
basin overlay. Platform adapters do not need it unless they want a comparable
debug visualization; in that case, keep the overlay in adapter code and leave
physics rules in the core.
It also has `placementPreviewBody(world, context)` for browser-only placement
preview drawing; platform adapters can keep their own preview state outside the
engine and commit the final placement with `engine.edit({ type: 'placeBody',
... })`.
For browser status text, `appVisibleMaterialCounts(context)` centralizes the
world-array scan. Other platforms can either use their own status counters or
call the engine/core boundary and keep display formatting in adapter state.
Browser selection helpers such as `appTool(context)`, `appSelectedKey(context)`,
`appSelectedMaterialId(context)`, and `appSelectionIsBodyMaterial(context)` keep
tool/material reads tied to the supplied app context. New platform adapters can
store selection however they like, but should pass it through their own adapter
state instead of reading browser globals.
The browser material menu similarly uses app-context helpers such as
`appSelectableMaterialItems(context)`, `appMaterialDefinition(id, context)`,
and `appMaterialUseCount(id, context)` to keep registry reads tied to the
surface's active world. New platform adapters can query the engine/material
command boundary directly, but should keep menu state and labels in adapter
state rather than inside `engine.world`.

`tests/headless-regression.js` includes a portable adapter contract regression
that creates two `install:false` surfaces and verifies that editing, stepping,
rendering, saving, and restoring one surface does not mutate the other.
`tests/portable-adapter-smoke.js` is the smallest runnable example: it loads
only the core files listed above, creates one surface, issues edit/source
commands, computes a fill preview, steps, renders an RGBA buffer, saves,
restores, resizes, and renders again without browser globals.

Run the full project verification with:

```powershell
node tests/verify.js
```

For only the focused non-browser smoke, run:

```powershell
node tests/portable-adapter-smoke.js
```

## Adapter Responsibilities

A platform adapter owns:

- Touch, mouse, pen, or gesture input.
- Tool selection, material selection, menus, settings, and transient previews.
- The frame loop or timer.
- The final canvas upload from RGBA bytes to the platform renderer.
- Persistent storage for snapshots.

The core owns:

- Material definitions, runtime material config commands, and runtime setting
  command validation.
- Grid allocation and world resize.
- Paint, fill, tint, erase, source, force, and body-placement commands.
- Flow, gravity, erosion, body simulation, and update order.
- Render-buffer preparation and lighting.
- Snapshot serialization and restore.

Keep those roles separate. If a feature can be expressed as a command, add it to
the core command boundary rather than editing grid arrays directly in the
adapter.

Cell indexes are world-size dependent. Prefer point-based commands such as
`paint`, `paintLine`, `fill`, and `eraseLine` from adapters. If a lower-level
test or tool passes raw cell indexes to helpers such as `fillCells(world, cells,
material)`, compute those indexes from the target `world.cols` and `world.rows`,
not from whichever world is currently installed in the compatibility globals.

## Minimal Loop

```js
const engine = createSimulationEngine({ cols, rows, cellSize });
const frameBuffer = new Uint8ClampedArray(cols * rows * 4);
let running = false;
let accumulator = 0;
let lastTime = 0;

function frame(now) {
  const dt = Math.min(50, now - lastTime);
  lastTime = now;

  if (running) {
    accumulator += dt;
    let steps = 0;
    while (accumulator >= SIM_STEP_MS && steps < 4) {
      engine.step();
      accumulator -= SIM_STEP_MS;
      steps++;
    }
  } else {
    accumulator = 0;
  }

  engine.renderBuffer(frameBuffer);
  uploadRgbaToPlatformCanvas(frameBuffer, engine.world.cols, engine.world.rows);
  requestNextFrame(frame);
}
```

Use the same frame cap as the browser adapter: at most four physics steps per
rendered frame.

## Input Mapping

Convert platform coordinates to canvas pixels, then issue commands:

```js
engine.edit({
  type: 'paintLine',
  x1: previous.x,
  y1: previous.y,
  x2: current.x,
  y2: current.y,
  radius: brushRadius,
  material: WATER
});
```

For fill previews, keep the highlighted cells in adapter state:

```js
surface.preview = engine.computeFill(currentPoint);
drawPreview(surface.preview.cells);

engine.edit({
  type: 'fill',
  x: currentPoint.x,
  y: currentPoint.y,
  material: selectedMaterial
});
engine.finishEdit();
surface.preview = null;
```

Common commands:

- `paint`, `paintLine`
- `source`, `sourceLine`
- `tint`, `tintLine`
- `erase`, `eraseLine`
- `fill`
- `fillAir`
- `clear`
- `force`
- `placeBody`

After direct editing, reset transient motion by calling `engine.finishEdit()`.
The browser adapter does this on pointer-up so edited scenes restart cleanly.

## Save And Load

Use the engine snapshot object as the platform storage payload:

```js
const snapshot = engine.serialize();
platformStorage.set('canvas-slot', JSON.stringify(snapshot));

const loaded = JSON.parse(platformStorage.get('canvas-slot'));
const result = engine.restore(loaded);
```

For lower-level tests or a custom engine wrapper, the codec also supports
`serializeWorldSnapshot(world)` and `restoreWorldSnapshot(world, snapshot)`.
Prefer the engine methods in platform code so the compatibility world shell
stays in one place.

Snapshots are data, not replay logs. Restore clears transient velocity, sleep,
oscillation, body motion, and carried-particle timers.

## Rendering

`engine.renderBuffer()` returns one RGBA pixel per simulation cell. The platform
renderer should scale this tiny grid up with nearest-neighbor sampling. Do not
reimplement material colors, tint, or lighting in the adapter unless the core
render-buffer API is intentionally replaced.

For WebView and mini-program canvases, the usual path is:

1. Write the RGBA buffer into the platform image-data object.
2. Put that image data onto a small offscreen or backing canvas.
3. Draw the backing canvas scaled up with image smoothing disabled.
4. Draw platform-specific previews or UI overlays above it.

## Invariants

- Do not make core files depend on `document`, `canvas`, `window`,
  `localStorage`, CSS, or platform UI objects.
- Do not duplicate physics or water rules in the adapter.
- Do not write typed arrays directly from UI code when an edit command exists.
- Keep transient UI state in the adapter, not in `world`.
- Keep snapshot storage platform-specific, but keep snapshot encoding in
  `src/04-save-codec.js`.
- Run `node tests/verify.js` after changing the boundary.
