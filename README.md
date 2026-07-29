# Material Force Lab

Material Force Lab is a small browser-only canvas simulation for drawing water,
sand, fixed stone, and temporary custom materials. It intentionally avoids build
tools so the project stays easy to run and edit.

## Run

Open `index.html` in a browser. `material_sim.html` is kept as an equivalent
legacy entry point.

No install step is required.

The `Basins` toolbar button toggles a debug overlay. Each detected geometry
basin is shown with a translucent color, row outlines, and a `#id cellCount`
label. The overlay is read-only; it rebuilds basin marks for display but does
not change material cells or advance the simulation.
Detailed brush, source, tint, and lighting controls live under `Settings` so the
top toolbar stays short and the canvas grid size is less likely to change
between save and load.

## File Map

- `index.html` / `material_sim.html` - HTML shell and ordered script loading.
- `styles.css` - Layout and visual styling.
- `src/00-materials.js` - Material ids, colors, densities, stable-frame counts,
  and flow-rule data.
- `src/00-core-state.js` - DOM handles, runtime constants, global state arrays, resize,
  status text, and basic coordinate helpers.
- `src/01-editing-and-bodies.js` - Brush, erase, fill, grid mutation helpers,
  and rigid body construction/collision helpers.
- `src/02-sources.js` - Infinite source layer painting, rendering, and material
  generation.
- `src/02-flow-and-water.js` - Shared flow movement, water surface-jitter logic,
  legacy water basin settling, stable/wake logic, and grid update order.
- `src/02-erosion.js` - Lightweight carried-particle erosion for granular
  materials.
- `src/04-save-load.js` - One-slot local canvas save/load for editable state.
- `src/03-lighting.js` - DOM-free base color and light-mask helpers.
- `src/03-runtime-render-input.js` - Dynamic body updates, force tool, render
  pipeline, basin debug overlay, pointer input, and app bootstrap.
- `app.js` - Legacy note only. Do not reintroduce runtime code there unless the
  HTML entry points are changed back.
- `docs/ARCHITECTURE.md` - Detailed notes for future agents.

## Development Notes

The JavaScript files are classic browser scripts, not ES modules. They share one
global scope and must be loaded in the order shown in the HTML files.

After edits, run:

```powershell
node -e "const fs=require('fs'); const files=['src/00-materials.js','src/00-core-state.js','src/01-editing-and-bodies.js','src/02-sources.js','src/02-flow-and-water.js','src/02-erosion.js','src/04-save-load.js','src/03-lighting.js','src/03-runtime-render-input.js']; for (const f of files) new Function(fs.readFileSync(f,'utf8')); new Function(files.map(f=>fs.readFileSync(f,'utf8')).join('\n')); console.log('syntax ok')"
```

For behavior that should survive future refactors, run:

```powershell
node tests/headless-regression.js
```

The migration path toward a portable simulation core is documented in
`docs/PORTABILITY_PLAN.md`. Follow that plan instead of doing a large
all-at-once TypeScript or engine rewrite.

When changing water behavior, read `docs/ARCHITECTURE.md` first. Most previous
bugs came from local water rules fighting the component-level water stabilizer.

Built-in selectable materials are `Water`, `Sand`, and `Fixed Stone`. Extra
fluid or granular materials can be added at runtime from the Material menu.
Custom materials are temporary during ordinary page use, but `Save` stores the
custom material definitions that the saved canvas needs. Custom fluids default
to integer density `1`; custom granular materials default to integer density
`2` and integer `maxSlope: 1`. Built-in materials are locked; custom materials
can be edited and can be deleted only while no cells on the canvas or source
layer use them.
Custom fluids default to transparent-to-light, while custom granular materials
default to blocking light. The custom material editor can toggle `Blocks Light`
and `Emissive`.
Granular materials can be temporarily carried by nearby recently moving flow
materials. The material id and color stay unchanged; only `carriedBy` and
`carriedTTL` change.

The `Color` tool paints visual tint without changing material identity. Empty
air receives background tint that stays at that canvas location and is hidden
while material covers it. Existing material receives particle tint that moves
with that material cell. `Fill Air` changes the whole canvas air color to the
current tint color and clears per-cell background tint so hidden/revealed air
stays uniform. Material painting, fill, and erase clear both tint layers in the
edited cells.

The `Light`, `Lit`, `Side`, and `Shade` controls are render-only. Each column is
scanned from top to bottom; the first light-blocking material cell is still lit,
and cells below it are darkened. `Side` is one-cell-only: a directly lit cell can
light its immediate right neighbor only when that neighbor is a shadowed fixed
or granular solid. It does not brighten air or fluid and does not recurse. `Side`
is a multiplier of `Lit`, so `100` means the side light has the same strength as
direct light. Emissive material ignores the system light and shadow pass.

The `Source` tool paints an infinite source layer for the selected flow material.
When a source cell is empty during simulation, it creates one material cell.
`Source` speed is global: `1` means every frame, larger numbers mean every N
frames.

`Save` writes one local browser slot and `Load` restores it. Saving again
overwrites the previous slot. The saved state includes material cells, source
cells, background tint, particle tint, custom material definitions, selected
material, air color, light settings, and source speed. Transient physics state
such as velocity, sleep, oscillation history, and carried-particle timers is
reset on load so the restored scene starts cleanly.
If the browser layout changed and the current grid size differs from the saved
grid, `Load` projects each saved non-empty cell to one current cell instead of
scanning current cells backward. This avoids silently skipping thin layers
without duplicating one-cell stone rows into thicker rows.

Dynamic round/rectangular stones are currently not exposed in the UI. The body
code remains in place so it can be re-enabled or removed in a separate, focused
cleanup.

The default blue `Water` material now uses the same low-slope local flow model.
The older geometry basin stabilizer remains in the source for debugging and
experiments, but it is disabled by the water flow rule.
