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
- `engine.step(iterations)` - advances one or more physics ticks.
- `engine.renderBuffer(data)` - writes RGBA bytes into `data`, or allocates a
  `Uint8ClampedArray`.
- `engine.serialize()` - returns a portable snapshot object.
- `engine.restore(snapshot)` - restores a portable snapshot into the engine.
- `engine.resize(cols, rows, options)` - resizes/resamples the engine world.
- `engine.clear()` - clears editable simulation state.

This is still a compatibility facade. Internally it installs its world into the
classic-script global shell before calling the existing core functions. Platform
adapters should use the facade anyway, because it is the future boundary where the
global shell can later be removed.

## Adapter Responsibilities

A platform adapter owns:

- Touch, mouse, pen, or gesture input.
- Tool selection, material selection, menus, settings, and transient previews.
- The frame loop or timer.
- The final canvas upload from RGBA bytes to the platform renderer.
- Persistent storage for snapshots.

The core owns:

- Material definitions and runtime material config commands.
- Grid allocation and world resize.
- Paint, fill, tint, erase, source, force, and body-placement commands.
- Flow, gravity, erosion, body simulation, and update order.
- Render-buffer preparation and lighting.
- Snapshot serialization and restore.

Keep those roles separate. If a feature can be expressed as a command, add it to
the core command boundary rather than editing grid arrays directly in the
adapter.

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

After direct editing, reset transient motion by calling
`finishEditAsNewInitialState()` if that hook remains part of the core load set.
The browser adapter does this on pointer-up so edited scenes restart cleanly.

## Save And Load

Use the engine snapshot object as the platform storage payload:

```js
const snapshot = engine.serialize();
platformStorage.set('canvas-slot', JSON.stringify(snapshot));

const loaded = JSON.parse(platformStorage.get('canvas-slot'));
const result = engine.restore(loaded);
```

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
- Run `node tests/headless-regression.js` after changing the boundary.
