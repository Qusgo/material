# Portability Audit

This audit records the current migration state for future agents. The goal is
to keep the browser simulator usable while making the simulation boundary easy
to reuse from a WebView, mini-program, or native shell.

## Current Evidence

- `node tests/headless-regression.js` covers syntax, browser bootstrap, the
  DOM-free core smoke path, the simulation engine facade, and the automated
  portability boundary scan.
- The DOM-free smoke creates a world, applies explicit-world edit commands,
  steps physics, builds an RGBA render buffer, serializes, clears, and restores
  without defining `document`, `canvas`, or `localStorage`.
- A portable adapter contract regression creates two `install:false` engine
  surfaces, edits, finalizes, steps, renders, serializes, clears, and restores
  them through the facade, and verifies that the surfaces do not mutate each
  other's world arrays.
- `node tests/portable-adapter-smoke.js` is a compact runnable example for a
  single non-browser surface. It loads only DOM-free core files, then edits,
  previews, steps, renders, serializes, restores, resizes, and renders again.
- A browser smoke test still loads the full ordered script chain with fake DOM
  and canvas handles.
- A real local browser smoke on `http://127.0.0.1:8787/index.html` loaded the
  page without console errors and verified toolbar/canvas drawing after the
  world-shell view-size migration.
- The core candidate scan strips comments and strings, then checks for
  `document`, `window`, `canvas`, `localStorage`, DOM event binding, and
  `ImageData`. It currently finds no real browser API calls inside the reusable
  core files.

## Portable Boundary Today

Use `createSimulationEngine()` as the adapter boundary. It currently exposes:

- World lifecycle: `world`, `currentWorld()`, `resize()`, `clear()`.
- Simulation: `edit(command)`, `finishEdit()`, `step(iterations)`.
- Rendering data: `renderBuffer(data)`.
- Persistence: `serialize()`, `restore(snapshot)`.
- Configuration: `materialCommand(command)`,
  `runtimeSettingsCommand(command)`, `runtimeSettings()`.

The facade is still a compatibility facade, but its common per-frame and
per-gesture methods now avoid installing their world. `edit()`, `finishEdit()`,
`step()`, `renderBuffer()`, `serialize()`, `restore()`, and `resize()` operate
on the engine world directly for `install:false` adapters. `currentWorld()`
intentionally selects the engine world as the active compatibility world, and
auto-install engines keep the legacy behavior of installing after restore. Do
not duplicate physics or rendering in a platform adapter to avoid that bridge.

## Browser-Owned State

These values are browser adapter state and should not become portable world
state:

- Toolbar selection: `appContext.tool`, `appContext.selected`.
- Runtime UI state: play/pause, status text, debug toggle, material menu/editor.
- Pointer state: pointer down, last point, hover point.
- Preview state: fill preview, placement preview, force preview, eraser preview.
- Frame timing: last frame timestamp and accumulator.

The legacy `tool` and `selected` globals are browser classic-script mirrors
owned by `src/03-app-context.js`.
`currentTool()`, `setCurrentTool()`, `currentSelectedKey()`, and
`setCurrentSelectedKey()` should stay out of core files; browser wrappers copy
selection values into `appContext` explicitly when tools, materials, or app
snapshots change. The portable core snapshot codec does not read or write
toolbar selection.
Browser adapters that need to rebuild body masks should call
`rebuildAppBodyMask(appContext)`, which installs the app world and passes that
world to the core mask helper from one central bridge.
Dynamic-body placement preview state also stays behind
`placementPreviewBody(world, appContext)`, so browser rendering can draw the
preview without directly calling placement validation helpers.
Status material counts are exposed through `appVisibleMaterialCounts(appContext)`;
the browser UI adapter only formats those counts for display.

## Remaining Bridges

- Hot arrays such as `material`, `mass`, `sourceMat`, and `bodyMask` still live
  as globals. `WorldState` owns allocation and installation, but the physics
  code still mutates those globals directly.
- Runtime settings now live on `WorldState.runtimeSettings` and are accessed
  through `currentRuntimeSettingsState()` and `applyRuntimeSettingsState()`.
  `applyRuntimeSettingsCommand(world, command)` and
  `currentRuntimeSettings(world)` now read or mutate supplied worlds without
  installing them, while the old `sourceInterval`, `lightingEnabled`, and
  light-strength globals are still synchronized mirrors for classic-script
  compatibility.
- Custom material definitions now live on `WorldState.customMaterials`. The
  global material registry remains a synchronized mirror of the active world so
  existing material helpers keep working while separate engine surfaces can
  carry separate custom materials. `applyMaterialCommand(world, command)` now
  updates the supplied world's custom material state directly, and
  `countMaterialUses(world, mat)` / `countSourceCells(world, mat)` can inspect a
  supplied world without relying on the currently installed one. Browser
  material menus reach list/definition/use-count data through app-context query
  helpers, so ordinary DOM adapters do not need to call those registry helpers
  directly.
- Dynamic body state now lives on `WorldState` as `bodies` and `nextBodyId`.
  Body placement and body-mask geometry now mutate supplied worlds without
  installing them. Collision, fixed-hit, displacement, and frame-level update
  helpers all accept explicit worlds. `stepWorld(world)` and
  `updateBodies(world)` now pass the same world through their body-mask,
  collision, fixed-hit, displacement, and flow stages without installing that
  world. The old globals remain synchronized mirrors for the legacy no-world
  browser path.
- Canvas air color now lives on `WorldState.airColor`, but the old `airColor`
  global is still a synchronized mirror for legacy browser paths. Explicit
  render-buffer and save/load codec paths now read or write the supplied world
  directly.
- Runtime flags now live on `WorldState` as `simTick` and `editDirty`, but the
  old globals are still synchronized mirrors because source generation and
  motion traces still read classic-script names directly. Low-level edit reset
  helpers now accept explicit worlds.
- View size now lives on `WorldState` as `viewW` and `viewH`, but the old
  globals are still synchronized mirrors because body bounds, force radius
  clamping, browser coordinate conversion, and canvas rendering still read
  classic-script names directly.
- Core edit/fill/body helpers no longer report browser status text directly.
  Browser adapters own user-facing messages such as fill counts, clipped-fill
  warnings, and dynamic-body placement failures.

## Next Migration Steps

1. Treat the current `install:false` engine contract as the portable baseline:
   `edit`, `finishEdit`, `step`, `renderBuffer`, `serialize`, `restore`,
   `resize`, material commands, runtime settings, fill previews, and cell
   coordinate mapping are expected to operate on `engine.world` without
   installing that world. The contract regression and smoke test cover this
   behavior across multiple surfaces.
2. Keep reducing direct reads of legacy globals inside core algorithms when a
   small explicit context can replace them cleanly. The main remaining globals
   are synchronized mirrors for hot arrays, view size, runtime flags/settings,
   custom material registry, and dynamic body state.
3. Only use `engine.currentWorld()` or `useWorldState(world)` at an intentional
   compatibility boundary. New platform adapters should not call either during
   normal pointer, timer, render, save, load, resize, or settings flows.
4. Keep dynamic stones disabled in UI until another pass audits gameplay
   stability, even though the core body helpers now support explicit worlds.
5. Keep browser adapters thin: they should translate platform input into engine
   commands, upload RGBA buffers, and own transient UI state only.
6. After the classic global bridge is small and well tested, consider adding a
   bundler or TypeScript layer. Do not do a wholesale module rewrite before this
   boundary is tighter.

## Regression Gate

Run this before and after every migration slice:

```powershell
node tests/verify.js
```

When a change claims to improve portability, it should either reduce browser API
usage in a core candidate file, move adapter state into `appContext`, or add a
test that proves a facade method works without browser globals. The regression
suite now includes the core browser-API scan, so keep its candidate file list in
sync when files move between portable core and browser adapters.
