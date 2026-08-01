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
dynamic body placement edits. `src/04-save-codec.js` exposes portable
`serializeWorldSnapshot()`/`restoreWorldSnapshot()` APIs; `src/04-save-load.js`
is only the browser `localStorage` adapter.

## Migration Order

1. Keep `index.html` and `material_sim.html` working with the current script
   order.
2. Add and maintain headless Node regressions for fragile behavior. Start with
   `tests/headless-regression.js`.
3. Keep pure material definitions and save/load codecs browser-free. These are
   the easiest to test without a DOM.
4. Move lighting into a core render-prep module. Lighting must remain
   presentation-only and must not mutate physics state. Completed for light-mask
   helpers and RGBA buffer construction.
5. Move grid allocation and command application next. Grid typed-array
   allocation and whole-grid clearing now live in `src/00-world-arrays.js`, and
   a compatibility world shell now lives in `src/00-world-state.js`. Dynamic
   body placement commits now route through `applyEditCommand({type:'placeBody'})`.
   Continue by moving material editing or runtime settings behind portable APIs.
6. Only after the command boundary exists, migrate to TypeScript or a bundler
   such as Vite.
7. If more speed is needed later, the headless core can be ported to Rust/WASM
   or another native target while the browser adapter stays mostly unchanged.

## Core Candidates

- `src/00-materials.js`
- `src/00-world-arrays.js` for typed-array allocation and whole-grid clearing
- `src/00-world-state.js` for the compatibility world shell
- `src/02-flow-and-water.js`
- `src/02-force.js` for force application
- `src/02-step-world.js` for physics tick order
- `src/02-erosion.js`
- The non-DOM parts of `src/01-editing-and-bodies.js`
- `src/04-save-codec.js` for portable snapshot serialize/restore and
  editable-array resampling
- `src/03-lighting.js` for light masks, base colors, and simple light/shadow
  blending
- `src/03-render-buffer.js` for DOM-free RGBA buffer construction
- `src/02-sources.js` for source data and generation, with source canvas
  presentation isolated in `src/02-source-render.js`

## Web Adapter Candidates

- DOM handles in `src/00-core-state.js`
- Toolbar state and material editor UI in `src/03-runtime-render-input.js`
- Canvas drawing and overlays in `src/03-runtime-render-input.js`
- Source overlay drawing in `src/02-source-render.js`
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
