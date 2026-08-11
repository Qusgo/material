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

The facade is still a compatibility facade. It installs its world into the
classic-script globals before calling existing core functions. This is expected
for now; do not duplicate physics or rendering in a platform adapter to avoid
that bridge.

## Browser-Owned State

These values are browser adapter state and should not become portable world
state:

- Toolbar selection: `appContext.tool`, `appContext.selected`.
- Runtime UI state: play/pause, status text, debug toggle, material menu/editor.
- Pointer state: pointer down, last point, hover point.
- Preview state: fill preview, placement preview, force preview, eraser preview.
- Frame timing: last frame timestamp and accumulator.

The legacy `tool` and `selected` globals are synchronized through
`currentTool()`, `setCurrentTool()`, `currentSelectedKey()`, and
`setCurrentSelectedKey()` only so old classic-script code and snapshots continue
to work while migration continues.

## Remaining Bridges

- Hot arrays such as `material`, `mass`, `sourceMat`, and `bodyMask` still live
  as globals. `WorldState` owns allocation and installation, but the physics
  code still mutates those globals directly.
- Runtime settings now have a small state/accessor bridge through
  `currentRuntimeSettingsState()` and `applyRuntimeSettingsState()`, but the
  old `sourceInterval`, `lightingEnabled`, and light-strength globals are still
  synchronized mirrors for classic-script compatibility.
- Dynamic body state now lives on `WorldState` as `bodies` and `nextBodyId`.
  Body placement, body-mask, collision, fixed-hit, displacement, and frame-level
  update helpers all accept explicit worlds, but the old globals are still
  synchronized mirrors because the hot body loops run through the compatibility
  shell.
- Canvas air color now lives on `WorldState.airColor`, but the old `airColor`
  global is still a synchronized mirror because render and save/load code are
  still classic scripts.
- Runtime flags now live on `WorldState` as `simTick` and `editDirty`, but the
  old globals are still synchronized mirrors because source generation, motion
  traces, and edit-reset hooks still read classic-script names directly.
- View size now lives on `WorldState` as `viewW` and `viewH`, but the old
  globals are still synchronized mirrors because body bounds, force radius
  clamping, browser coordinate conversion, and canvas rendering still read
  classic-script names directly.
- Some core helpers intentionally keep optional browser hooks, such as
  `resetRuntimeClock()` and optional status reporting. Non-browser adapters may
  leave those hooks as no-ops.

## Next Migration Steps

1. Continue changing hot-path functions to accept `world` or a small runtime
   context explicitly. Source generation, force application, fill computation,
   fill application, body geometry/runtime helpers, frame-level flow update, and
   save/restore now have explicit-world entry points. The next low-risk targets
   are deeper flow-update helpers that still assume the installed global grid.
2. Keep dynamic stones disabled in UI until another pass audits gameplay
   stability, even though the core body helpers now support explicit worlds.
3. Keep browser adapters thin: they should translate platform input into engine
   commands, upload RGBA buffers, and own transient UI state only.
4. After the classic global bridge is small and well tested, consider adding a
   bundler or TypeScript layer. Do not do a wholesale module rewrite before this
   boundary is tighter.

## Regression Gate

Run this before and after every migration slice:

```powershell
node tests/headless-regression.js
```

When a change claims to improve portability, it should either reduce browser API
usage in a core candidate file, move adapter state into `appContext`, or add a
test that proves a facade method works without browser globals. The regression
suite now includes the core browser-API scan, so keep its candidate file list in
sync when files move between portable core and browser adapters.
