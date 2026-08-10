# Portability Plan

This project should stay easy to run in a browser while becoming easier to move
to a packaged app, WebView shell, WASM core, or native renderer later. The safe
path is incremental: first define a headless simulation boundary, then migrate
files behind that boundary.

## Current Shape

The app is still loaded as ordered classic browser scripts. That keeps the page
simple, but it means core simulation, DOM input, canvas rendering, and local
storage currently share one global scope.

Do not convert everything to modules or TypeScript in one pass. The water and
granular rules are sensitive, and large rewrites make visual regressions hard to
diagnose.

## Target Boundary

The long-term core should be usable without `document`, `canvas`, CSS, pointer
events, or `localStorage`. It should expose commands and buffers:

```txt
createWorld(cols, rows, options)
stepWorld(world)
applyCommand(world, command)
serializeWorld(world)
deserializeWorld(payload, options)
buildLightMask(world)
buildRenderBuffer(world)
```

The browser app should become an adapter:

```txt
DOM pointer/toolbar input -> command objects -> core world -> render buffer -> canvas/WebGL
```

The current branch has started that boundary without changing gameplay:
`src/00-world-arrays.js`, `src/00-world-state.js`, `src/04-save-codec.js`,
`src/03-lighting.js`, `src/03-render-buffer.js`, and the core part of
`src/02-sources.js` are DOM-free. `src/02-force.js` and
`src/02-step-world.js` are DOM-free. `src/01-edit-commands.js` exposes command
wrappers for point/line paint/source/tint/erase, fill/fillAir/clear, force, and
dynamic body placement edits. `stepWorld(world)`,
`applyEditCommand(world, command)`, and `buildRenderBuffer(world, data)` now
accept explicit world shells while keeping their legacy call forms. Browser
step/edit/render call sites now pass `currentWorldState()` explicitly.
`src/01-runtime-config.js` exposes DOM-free
material configuration and runtime setting commands. `src/04-save-codec.js`
exposes portable
`serializeWorldSnapshot()`/`restoreWorldSnapshot()` APIs; `src/04-save-load.js`
is only the browser `localStorage` adapter, and `src/04-save-ui-adapter.js`
contains the browser-only post-load UI sync hook.

## Migration Order

1. Keep `index.html` and `material_sim.html` working with the current script
   order.
2. Add and maintain headless Node regressions for fragile behavior. Start with
   `tests/headless-regression.js`. It now includes a DOM-free core smoke test
   covering `createWorldState()`, `applyEditCommand(world, command)`,
   `stepWorld(world)`, `buildRenderBuffer(world, data)`, snapshot serialize,
   clear, and restore without browser globals.
3. Keep pure material definitions and save/load codecs browser-free. These are
   the easiest to test without a DOM.
4. Move lighting into a core render-prep module. Lighting must remain
   presentation-only and must not mutate physics state. Completed for light-mask
   helpers and RGBA buffer construction.
5. Move grid allocation and command application next. Grid typed-array
   allocation and whole-grid clearing now live in `src/00-world-arrays.js`, and
   a compatibility world shell plus resize resampling now live in
   `src/00-world-state.js`. Dynamic body placement commits now route through
   `applyEditCommand({type:'placeBody'})`.
   Material editing and source/light settings now route through
   `src/01-runtime-config.js`. Save/load post-restore UI synchronization now
   lives in `src/04-save-ui-adapter.js`. Browser DOM refs now live in
   `src/03-dom-refs.js`, material menu/edit-field sync now lives in
   `src/03-material-ui-adapter.js`, and toolbar/settings event binding lives in
   `src/03-controls-adapter.js`. Early browser app-shell DOM refs now live in
   `src/00-app-dom-refs.js`. Canvas pointer binding now lives in
   `src/03-canvas-input-adapter.js`, and resize/animation startup lives in
   `src/03-app-bootstrap.js`. Source-rate and lighting form synchronization now
   lives in `src/03-settings-sync-adapter.js`. Dynamic-body runtime now lives in
   `src/02-body-runtime.js`, while browser canvas drawing and overlays live in
   `src/03-canvas-render-adapter.js`. Browser status, resize, coordinate,
   selection, and button state helpers now live in
   `src/03-app-ui-state-adapter.js`. Browser play/pause and debug-display state
   also live there. Material menu/editor state now lives in
   `src/03-material-ui-adapter.js`; pointer/hover/placement/force-preview state
   now lives in `src/03-canvas-input-adapter.js`; fill preview state now lives in
   `src/01-fill-editing.js`. Browser frame timing now lives behind
   `resetRuntimeClock()` in `src/03-app-bootstrap.js`. Continue by reducing
   direct global state writes inside browser bootstrap and UI adapters. The
   first explicit-world compatibility forms are now in place for step, edit, and
   render buffer calls, and browser adapters now use those forms.
6. Only after the command boundary exists, migrate to TypeScript or a bundler
   such as Vite.
7. If more speed is needed later, the headless core can be ported to Rust/WASM
   or another native target while the browser adapter stays mostly unchanged.

## Core Candidates

- `src/00-materials.js`
- `src/00-world-arrays.js` for typed-array allocation and whole-grid clearing
- `src/00-world-state.js` for the compatibility world shell and resize
  resampling
- `src/02-flow-and-water.js`
- `src/02-force.js` for force application
- `src/02-body-runtime.js` for dynamic-body physics and grid displacement
- `src/02-step-world.js` for physics tick order
- `src/02-erosion.js`
- `src/01-cell-state.js` for low-level cell mutation and cleanup
- `src/01-grid-editing.js` for DOM-free grid edit helpers
- `src/01-fill-editing.js` for connected-region fill selection/application and
  fill preview state
- `src/01-body-geometry.js` for dynamic-body construction and body masks
- `src/04-save-codec.js` for portable snapshot serialize/restore and
  editable-array resampling
- `src/03-lighting.js` for light masks, base colors, and simple light/shadow
  blending
- `src/03-render-buffer.js` for DOM-free RGBA buffer construction
- `src/02-sources.js` for source data and generation

## Current Portability Evidence

- `tests/headless-regression.js` has a DOM-free core smoke regression that does
  not define `document`, `canvas`, or `localStorage`.
- That smoke test creates a world shell, applies explicit-world edit commands,
  steps physics, builds a render buffer, serializes the world, clears it, and
  restores the snapshot.
- Browser smoke regression still loads the full ordered script chain with fake
  DOM/canvas handles, so direct browser use remains covered while the headless
  boundary grows.

## Web Adapter Candidates

- `src/04-save-load.js` for localStorage messages and persistence.
- `src/04-save-ui-adapter.js` for post-load browser control/render sync.

- Early app-shell DOM handles in `src/00-app-dom-refs.js`
- Shared browser UI handles in `src/03-dom-refs.js`
- Play/pause state, debug-display state, status text/display, resize, coordinate, brush/eraser radius, selection, and button sync helpers in
  `src/03-app-ui-state-adapter.js`
- Material menu/editor state and field sync in `src/03-material-ui-adapter.js`
- Source-rate and lighting form sync in `src/03-settings-sync-adapter.js`
- Toolbar/settings event binding in `src/03-controls-adapter.js`
- Canvas pointer event binding and pointer/placement/force-preview state in
  `src/03-canvas-input-adapter.js`
- Resize and animation-loop startup in `src/03-app-bootstrap.js`
- Browser frame timing and `resetRuntimeClock()` in `src/03-app-bootstrap.js`
- Offscreen grid canvas, visible canvas drawing, and overlays in
  `src/03-canvas-render-adapter.js`
- Source overlay drawing in `src/03-source-render-adapter.js`
- `localStorage` calls in `src/04-save-load.js`
- CSS and HTML entry points

## Invariants For Future Agents

- Same-size save/load must restore cell arrays exactly.
- Resampled save/load must not duplicate one-cell fixed-stone rows.
- Side light is one cell only: directly lit cells can light their immediate
  right neighbor only when that neighbor is a shadowed fixed or granular solid.
- Air and fluid do not receive side light.
- Lighting never changes material ids, mass, velocity, source cells, tint, or
  stable state.
- Editing and loading reset transient flow state, but ordinary movement must
  move particle tint with the material cell.

Run this before and after each migration step:

```powershell
node tests/headless-regression.js
```
