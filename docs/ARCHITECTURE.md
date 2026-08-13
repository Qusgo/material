# Architecture Notes

This document is for future agents who need to modify the simulation without
recreating old water bugs.

## Runtime Model

The app uses a fixed cell grid rendered to a canvas. Grid materials live in
parallel typed arrays:

- `material` - cell type id from `src/00-materials.js`.
- `mass` - currently only meaningful for water rendering.
- `vx`, `vy` - approximate per-cell velocity for flow materials.
- `bodyMask` - cells occupied by dynamic rigid bodies.
- `flowDir` - a directed fluid's preferred horizontal direction.
- `restAge`, `stableMask` - sleep state for stable flow material.
- `tintR`, `tintG`, `tintB`, `tintA` - particle tint. It does not change
  material identity, but it must move with the material cell.
- `bgTintR`, `bgTintG`, `bgTintB`, `bgTintA` - background tint for empty air.
  It stays at the canvas location and is hidden whenever material occupies that
  cell.
- `WorldState.airColor` - fallback color for all empty air not covered by
  `bgTint*`; the legacy `airColor` global is a synchronized mirror.
- `sourceMat` - location-based infinite source layer. `0` means no source;
  otherwise the value is a flow material id generated when the cell is empty.
- `carriedBy`, `carriedTTL` - temporary erosion/entrainment state for granular
  particles. The particle's `material` id and render color do not change.
- `lastMoveTick` - most recent frame a cell participated in a move or swap.

Dynamic round/rectangular stones are separate objects in `WorldState.bodies`
with the legacy `bodies` global kept as a synchronized compatibility mirror.
They are not stored as particles. Each frame their shape is rasterized into
`bodyMask`.

`src/00-world-arrays.js` owns allocation and whole-grid clearing for these typed
arrays. The app still exposes the arrays as globals for compatibility with the
existing classic-script code, but new code should allocate with
`createGridArrays()`, install with `installGridArrays()`, and reset editable
state with `clearEditableGridState()` instead of hand-writing long fill blocks.
This keeps resize, clear, and load on one lifecycle path.

`src/00-world-state.js` is the current world boundary. `createWorldState()`
groups dimensions, cell size, view size (`viewW` and `viewH`), typed arrays,
dynamic body state, air color, runtime flags (`simTick` and `editDirty`),
runtime settings (`sourceInterval` and lighting values), custom material
definitions, and water scratch tokens.
`installWorldState()` deliberately installs that world back into the legacy
global bindings (`cols`, `material`, `mass`, `bodies`, and so on) so existing
physics code keeps running unchanged. `currentWorldState()` refreshes the active
shell from the globals. `resizeWorldGrid()` owns DOM-free grid resize resampling
for materials, flow state, tint layers, and source cells, while preserving body
state, view size, air color, runtime flags, runtime settings, and custom
material definitions. It supports both `resizeWorldGrid(cols, rows, options)`
and `resizeWorldGrid(world, cols, rows, options)` while the compatibility bridge
exists. Browser resize code should only supply the new dimensions and rebuild
presentation buffers. Treat this as a bridge toward a real `World` object, not
as permission to mix DOM state into the core.

## Material Configuration

`src/00-materials.js` is the single entry point for material ids, UI names,
colors, densities, stable-frame counts, and flow-rule data. The rest of the app
should call helpers such as `isFlowMaterial()`, `isSolidMaterial()`,
`materialDensity()`, `materialCarriesMass()`, `materialUsesDirectedFlow()`,
`materialBlocksLight()`, `materialEmissive()`, `defaultMassForMaterial()`, and
`defaultFlowDirForMaterial()` instead of adding new id checks.

`src/02-sources.js` owns DOM-free infinite source data, source brush mutation,
and source material generation. `stampSourceAt(world, ...)`,
`drawSourceLine(world, ...)`, `countSourceCells(world, mat)`, and
`applySources(world)` mutate or inspect the supplied world without installing it.
Browser selection of the source brush material belongs to
`src/03-app-ui-state-adapter.js`.
`src/03-source-render-adapter.js` owns only the canvas overlay for those source
cells. `src/02-flow-and-water.js` owns algorithms:
gravity/sliding, slope relaxation, water's surface-jitter escape logic,
stable/wake logic, and the optional legacy basin code. Its frame-level public
entry is `updateGridMaterials(world)`. Its movement primitives
(`tryMove`, `moveCell`, `deleteCell`, and boundary draining) now also accept an
explicit grid/world argument for adapters and tests. Surface, landing, slope
candidate, slope-relaxation, gravity/drop, velocity, escape, and the optional
surface-level/component settling helpers also have explicit grid paths.
Frame-level flow-cell dispatch, material stability, oscillation cleanup, and
carried-particle erosion hooks also accept explicit worlds. Legacy basin
geometry scanning
(`buildWaterBasins(world)`), basin intake/overflow candidate collection, tray
settling, overflow transfer, overflow runout, and the legacy basin pass
scheduler now also accept explicit worlds. `updateGridMaterials(world)` now
steps the supplied world without installing it into the classic global shell.
`src/02-erosion.js` owns lightweight carried-particle erosion.
`tryCarriedMove(world)`, `applyErosionPass(world)`, and
`updateCarryLifetimes(world)` support explicit worlds without installing them.
`src/04-save-codec.js` owns DOM-free snapshot serialization, restore, and
editable-array resampling. `src/03-save-storage-adapter.js` owns only the
browser `localStorage` wrapper and user-facing messages. `src/03-save-ui-adapter.js`
owns the browser-only post-load hook that stops runtime playback, synchronizes
controls, refreshes previews, and renders after a snapshot has been restored.
Keep new material data out of algorithm files unless the material needs a
genuinely new algorithm.
`src/02-force.js` owns DOM-free force application for flow cells and dynamic
bodies, and accepts either `applyForce(circle, arrow)` or
`applyForce(world, circle, arrow)`; the explicit-world form mutates supplied
flow arrays and body objects without installing the world. `src/02-body-runtime.js`
owns dynamic-body physics and grid displacement for non-fixed stone bodies. Its
public entry is `updateBodies(world)`; the explicit-world path now keeps
fixed-hit checks, body/body collision, body-mask rebuild, grid displacement, and
body filtering on the supplied world without installing it. It is called from
`src/02-step-world.js` and should stay free of browser events and drawing.
`src/03-lighting.js` owns DOM-free render preparation such as base material
color, light masks, and simple light/shadow blending. `src/03-render-buffer.js`
converts the current arrays into an RGBA buffer without touching `canvas` or
`document`. `src/03-simulation-engine.js` owns the DOM-free compatibility
facade for future adapters. It groups `createWorldState()`,
`applyEditCommand()`, `pointToCell()`, `computeFill()`, `stepWorld()`,
`buildRenderBuffer()`, `serializeWorldSnapshot()`, `restoreWorldSnapshot()`,
`resizeWorldGrid()`,
`applyMaterialCommand()`, `applyRuntimeSettingsCommand()`,
`currentRuntimeSettings()`, and clear into one engine object. For
`install:false` surfaces, ordinary calls stay world-local and do not select that
world as the active classic-script shell; `currentWorld()` remains the explicit
bridge for legacy helpers that need an installed world.
`src/03-canvas-render-adapter.js` owns the browser-only offscreen grid
canvas/ImageData, visible canvas drawing, and transient overlays such as basin
debug, fill preview, force preview, eraser preview, and body drawing.
It asks `placementPreviewBody(world, appContext)` for dynamic-body placement
preview data instead of reaching directly into placement validation helpers.
`src/03-app-dom-refs.js` owns browser app-shell DOM handles such as the canvas,
status label, play/debug buttons, and brush-size input.
`src/03-app-context.js` owns the browser app-shell state object. This plain
object holds status text, play/pause, debug display, tool/material selection,
material menu/editor state, pointer/hover/placement/force-preview state, frame
timing, browser device-pixel ratio, and the browser-owned simulation engine
facade. Its helpers
(`appWorld()`, `applyAppEditCommand()`, `finishAppEdit()`,
`stepAppWorld()`, `resizeAppWorld()`, `applyAppMaterialCommand()`,
`applyAppRuntimeSettingsCommand()`, `currentAppRuntimeSettings()`,
`rebuildAppBodyMask()`, `placementPreviewBody()`, `appTool()`,
`appSelectedKey()`, `appSelectedMaterialId()`, `appSelectionIsBodyMaterial()`,
`appVisibleMaterialCounts()`, `appSelectableMaterialItems()`,
`appMaterialDefinition()`, `appMaterialUseCount()`, `appMaterialFlowRule()`,
`appRenderBuffer()`, `appDebugBasins()`, and `renderApp()`) are the browser
adapter's preferred path into the engine and core lifecycle helpers. Each helper
defaults to the singleton browser `appContext`, but can also receive an explicit
context object for WebView, mini-program, or native shells. This is adapter
state, not simulation state; core files should not read it.
`currentTool()`, `setCurrentTool()`, `currentSelectedKey()`, and
`setCurrentSelectedKey()` live in `src/03-app-context.js` as browser
classic-script selection mirrors; core files should not define or call them.
Browser adapters that change or restore selection must explicitly copy those
values into their own context object. Browser UI helpers should read selection
through `appTool(context)`, `appSelectedKey(context)`,
`appSelectedMaterialId(context)`, and `appSelectionIsBodyMaterial(context)` so
tests and future adapters can supply another context without accidentally using
the singleton browser state.
`src/03-dom-refs.js` owns browser DOM handles shared by material and controls
adapters.
`src/03-app-ui-state-adapter.js` owns browser-only status display, canvas resize,
canvas coordinate conversion, brush/eraser radius reads, tool/material selection
helpers, transient UI clearing, browser fill-preview status reporting, and
button active-state synchronization. Persistent adapter state comes from
`appContext`; status counts come from `appVisibleMaterialCounts(appContext)`
rather than from direct array scans inside the UI adapter.
`src/03-material-ui-adapter.js` owns browser material menu/editor field
synchronization, reads material lists, definitions, use counts, and flow-rule
display data through app-context query helpers, writes material editor state
through `appContext`, and delegates material mutation through
`applyAppMaterialCommand()`.
`src/03-settings-sync-adapter.js` owns browser form value synchronization for
source-rate and lighting controls, and delegates value clamping/mutation through
`applyAppRuntimeSettingsCommand()` and `currentAppRuntimeSettings()`.
`src/03-controls-adapter.js` owns browser toolbar/settings bindings; it should
wire DOM events to existing commands/helpers without adding simulation rules.
`src/03-canvas-input-adapter.js` owns canvas pointer gestures and routes
gestures to edit/force commands and finalizes completed edits through
`finishAppEdit()`. Pointer, hover, placement, and force-preview state live in
`appContext`; tool and material selection are read through the selection helpers
instead of direct global reads. `src/03-app-bootstrap.js` owns
browser resize binding, the `requestAnimationFrame` loop, and the runtime clock
reset hook used after edits and snapshot loads. The loop stores its timing
fields in `appContext`.
The browser canvas render adapter asks `appRenderBuffer(world, data, context)`
for RGBA bytes, then owns only browser canvas upload, scaling, and transient
overlays such as sources, previews, bodies, and debug basins. Source overlay
drawing reads the supplied world's `sourceMat` array directly and should not
install or switch worlds. Basin debug drawing asks
`appDebugBasins(world, context)` for geometry data instead of calling
`buildWaterBasins()` directly from the canvas adapter.
`src/01-cell-state.js` owns low-level cell mutation, transient motion cleanup,
tint/source clearing, and invalid-material normalization. `writeCell(world, ...)`,
`clearCell(world, ...)`, `resetFlowStateAfterEdit(world)`, and
`finishEditAsNewInitialState(world)` mutate the supplied world without
installing it, while preserving their legacy call forms. `src/01-grid-editing.js`
owns DOM-free brush stamps, tint edits, erasing, whole-grid edit commands, and
edit-state reset. Its paint, tint, erase, fill-air, and clear helpers accept an
explicit world and mutate that supplied world without installing it, while
preserving their legacy browser call forms. Erasing dynamic bodies still depends
on `src/01-body-geometry.js`, but body-mask rebuild itself can now target a
supplied world directly.
`src/01-fill-editing.js` owns connected-region fill selection,
fill calculation, and fill application. `computeFill(world, c, r)` and
`fillAtCell(world, c, r, mat)` read or mutate the supplied world without
installing it. Preview state remains adapter state: browser callers use
`engine.computeFill()` through
`updateBrowserFillPreview(point, context)` and store highlighted cells in the
supplied context.
Browser fill commits use `applyBrowserFill()`, which delegates the actual grid
mutation through `applyAppEditCommand()` and then finalizes the edit through
`finishAppEdit()`.
`src/01-body-geometry.js` owns dynamic-body
construction, shape intersection tests, placement checks, grid clearing under a
placed body, and body-mask rasterization. `canPlaceBody(world, body)`,
`clearGridUnderBody(world, body)`, `addBody(world, body)`, and
`rebuildBodyMask(world)` mutate or inspect the supplied world without installing
it, while preserving their old single-argument/no-argument forms.
`makeBodyFromPlacementForWorld(world, placement, commit)` allocates body ids
from the supplied world instead of the global compatibility counter. Placement
failure is reported by the browser adapter, not by this core helper.
`src/01-edit-commands.js` is the command-style boundary for editor operations:
point/line `paint`, `source`, `tint`, `erase`, plus `fill`, `fillAir`, `clear`,
`force`, and `placeBody`. It accepts both the legacy
`applyEditCommand(command)` form and the explicit
`applyEditCommand(world, command)` form. Point/line `paint`, `source`, `tint`,
`erase`, plus `fill`, `fillAir`, and `clear`, now dispatch to explicit-world
helpers without installing the supplied world. `force` and `placeBody` now do
the same.
The browser pointer handlers now route ordinary strokes and dynamic body
placement commits through `applyAppEditCommand()`, which delegates to the
browser-owned engine facade. The material editor, dynamic body preview, browser
storage wrapper, button synchronization, and runtime loop are still
browser/runtime responsibilities.
`src/02-force.js` owns DOM-free force application for flow cells and dynamic
bodies. `src/02-body-runtime.js` keeps the body physics update DOM-free.
`bodyHitsFixed(world, body)`, `displaceGridUnderBody(world, body)`,
`resolveBodyBodyCollisions(world)`, and `updateBodies(world)` support explicit
world calls without installing the supplied world. The legacy no-world forms
preserve the classic global-backed hot path for the browser script.

`src/01-runtime-config.js` is the command-style boundary for custom material
configuration and global runtime settings. It owns use-count checks for custom
materials, `add`/`update`/`delete` material commands, source interval clamping,
and lighting setting clamping. The browser UI still owns input widgets and
status messages, but should not duplicate these rules. Browser adapters should
reach these commands through the app engine helpers rather than calling
runtime-config globals directly; this keeps a future WebView or mini-program
adapter on the same facade. Lower-level tests and custom facades can use
`applyMaterialCommand(world, command)`,
`applyRuntimeSettingsCommand(world, command)`, and
`currentRuntimeSettings(world)` directly. Material use-count helpers also keep
legacy and explicit forms for compatibility; the explicit
`countMaterialUses(world, mat)` form reads supplied material/source arrays
without installing the world. Browser UI should read counts through
`appMaterialUseCount(context)` or `appSelectableMaterialItems(context)` so the
active app world is explicit. Runtime settings live on
`WorldState.runtimeSettings` and are accessed through
`currentRuntimeSettingsState()` and `applyRuntimeSettingsState()` in
`src/00-world-state.js`; `applyRuntimeSettingsCommand(world, command)` and
`currentRuntimeSettings(world)` now read or mutate the supplied world's settings
without installing it. The legacy globals remain synchronized mirrors while
classic-script compatibility remains.

The Material menu can register up to `MAX_CUSTOM_MATERIALS` temporary materials
per page load. Custom fluid inputs are name, color, and integer density
`1..98`; custom granular inputs are name, color, integer density `1..98`, and
integer `maxSlope` `0..32`, and integer erosion resistance `1..999`. Custom
materials also expose `Blocks Light`; custom fluids default to false and custom
granular materials default to true. Custom materials also expose `Emissive`,
defaulting to false. These runtime materials live on
`WorldState.customMaterials`; the global material tables in `src/00-materials.js`
are synchronized mirrors for the currently installed world. This lets separate
engine surfaces keep separate custom material definitions while preserving the
classic-script helper API. Explicit `applyMaterialCommand(world, command)` calls
temporarily load the supplied world's custom registry, apply the add/update/delete
operation, write the exported definitions back to `world.customMaterials`, and
restore the previously active registry without installing the supplied world.
Built-in `Water`, `Sand`, and `Fixed Stone` are
locked. Custom materials can be edited in place, which changes every cell with
that material id, and can be deleted only when no grid cell or source cell
currently uses that id.

## Persistence

The snapshot format is portable. `serializeWorldSnapshot(world)` creates the
saved payload, and `restoreWorldSnapshot(world, saved)` validates the version,
restores custom material definitions, restores editable arrays, resets
transient runtime state, rebuilds the body mask with the supplied world, and
returns a structured result. The explicit-world forms mutate the supplied world
without installing it. When restoring a non-active world with custom material
definitions, the codec temporarily loads those definitions for id validation and
then restores the active world's material registry so another engine surface is
not polluted. The old
`restoreWorldSnapshot(saved)` form still works through the currently installed
world while classic-script compatibility remains. Browser save/load is
intentionally a one-slot feature: `Save` overwrites `CANVAS_SAVE_KEY` in
`localStorage`; `Load` parses that one snapshot. The browser storage wrapper
must call
`serializeAppSnapshot()` and `restoreAppSnapshot()` from `src/03-app-context.js`
instead of calling the codec directly when it wants browser UI metadata such as
the selected material. Another platform can swap only the storage layer while
keeping the same engine facade.

Saved state includes:

- Canvas dimensions at save time.
- Material ids, compacted with run-length encoding.
- Source-layer material ids, also run-length encoded.
- Sparse particle tint cells and sparse background tint cells.
- Global air color.
- Render-only light toggle, lit strength, side-light multiplier, and shade
  strength.
- Custom material definitions needed by the saved ids.
- Global source interval.

The browser app snapshot wrapper also stores the selected material key. The
portable core codec deliberately does not read or write toolbar selection.

Load is not a physics replay. The portable codec restores the editable canvas
and then clears simulation runtime state: velocity, stable masks, rest ages,
oscillation/escape history, carried-particle state, dynamic bodies, and
`editDirty`. This is deliberate. Loading should behave like drawing that page
again and then starting the simulation from a clean initial state.
Browser-only edit state such as fill previews, placements, force previews,
pointer state, and hover state is cleared by the browser post-load adapter
through `clearTransientEditUiState(appContext)`, not by
`restoreWorldSnapshot()`.

`restoreWorldSnapshot()` must call `restoreEditableArrays()`, and
`restoreEditableArrays()` must call `clearEditableGridState()` before writing
saved cells. Do not duplicate the clearing sequence in browser storage code;
otherwise future typed-array additions will be easy to miss.

If `cols` or `rows` differ between save and load, `restoreEditableArrays()` in
`src/04-save-codec.js` must project each saved non-empty cell to one current
cell. Target-to-source sampling can miss one-cell walls when only center points
are used, while covered-cell sampling can duplicate a one-cell wall into a
two-cell wall when the current grid has more rows. Source-to-target projection
keeps exact copies for same-size loads and preserves discrete cells during
resampled loads without inventing extra material rows.

When changing material registration, keep `exportCustomMaterials()` and
`restoreCustomMaterials()` in sync with the fields needed by the corresponding
flow rule. When changing a location overlay or particle property, decide
explicitly whether it belongs in snapshots. `sourceMat`, particle tint, and
background tint do; motion history does not.

## Editing Layer

Brush and eraser sizes use integer cell radii. Radius `0` means one cell. The
eraser has its own radius so fine cleanup can be one-cell wide without changing
the brush radius.

The Color tool writes visual tint without changing material identity. If the
target cell is empty, it writes `bgTint*`; that color stays at the canvas
location, is hidden by material, and reappears when the material leaves. If the
target cell contains material, it writes `tint*`; that color belongs to the
particle and must move or swap in `moveCell()` with the material arrays. Physics
deletion clears particle tint only. Direct material edits (`writeCell`, fill,
and user erase) clear both tint layers in the affected cells.

`Fill Air` changes `WorldState.airColor` to the current tint color and clears
all `bgTint*` overrides. This is a canvas background operation, not a material
edit: covered cells do not need individual background tint to reveal the new air
color later. Use `setAirColorState()` and `currentAirColorState()` rather than
assigning the legacy `airColor` mirror directly.

## Rendering And Lighting

Rendering must stay a presentation layer. The simple light controls do not
modify material ids, tint arrays, velocity, stability, or erosion state.

`buildRenderBuffer(data)` is the legacy render-prep entry point, and
`buildRenderBuffer(world, data)` is the explicit-world form for future adapters.
Both rebuild the light mask and write one RGBA pixel per grid cell into `data`;
the explicit-world form reads and writes only the supplied world's arrays and
does not install it. The browser adapter is responsible only for putting that
buffer into `ImageData` and drawing it. `buildLightMask(world)` and
`baseRenderColor(world, index, material)` are the matching explicit-world helper
forms used by render preparation while the classic global bridge still exists.
The browser canvas adapter now also accepts
`render(world, appContext)` while keeping the old `render()` convenience form.
The explicit-world render path now uses the supplied world's dimensions, cell
size, air color, bodies, source overlay, basin overlay, fill preview, placement
preview, and eraser preview without installing it. Browser source overlays also
receive the same explicit world from `render()`, so platform render code should
not read a different active grid than the main render buffer.

`createSimulationEngine()` is the preferred non-browser entry point. It is a
facade, not a second implementation of the simulation. Do not duplicate physics,
editing, rendering, or snapshot logic inside it; add capabilities to the
underlying core boundary functions and expose them through the facade only after
the core function exists. Adapter helpers such as `engine.cellAt()`,
`engine.computeFill()`, `engine.step()`, `engine.renderBuffer(data)`, and
`engine.finishEdit()`, plus `engine.resize()` and `engine.restore()`, now use
the engine world without installing it and return data for platform previews
without storing transient UI state. `currentWorld()` intentionally selects the
engine world as the active compatibility world. Engines created without
`install:false` also keep the legacy behavior of installing after restore.

`buildLightMask()` scans each column from top to bottom with a boolean `lit`
flag. When `lightingEnabled` is false, colors are drawn directly. When it is
true, a directly lit cell blends toward white by `lightStrength`; a shadowed
cell blends toward black by `shadowStrength`. Empty air never blocks light.
Materials block light only when their material definition has
`blocksLight: true`. The blocking cell itself is still rendered as directly lit,
then the cells below it are shadowed. This keeps the first surface of sand,
stone, or an opaque custom fluid visible while darkening what sits underneath.

After direct light is marked, side light is a one-cell neighbor pass: a directly
lit cell can mark its immediate right neighbor with one side-light bit only when
that neighbor is a shadowed fixed or granular solid. This is a simple solid-only
edge light. It does not brighten air, fluid, already directly lit cells, or cells
more than one step away from direct light. Side light uses
`lightStrength * sideLightStrength`, where `sideLightStrength` is a multiplier
and defaults to `1`. The side pass reads only the direct-light bit, so a side-lit
cell must not create more side light.

Materials with `emissive: true` skip `applySimpleLighting()` and draw their base
or particle-tinted color directly. Emissive currently does not illuminate
neighbors.

The light pass happens after base material color, particle tint, and background
tint have been resolved. This means tint is visible but still participates in
the same lit/shadowed presentation as normal material color unless the material
is emissive.

The Source tool writes only to `sourceMat`. Source cells are also location
overlays: they do not block movement, do not move with particles, and do not
overwrite occupied material cells. `applySources()` runs only during simulation;
if `simTick % currentRuntimeSettingsState().sourceInterval === 0`, each empty
source cell creates one cell of its stored flow material. The legacy
`sourceInterval` global is still synchronized and clamped to `1..60`; `1` means
every frame. Brush, fill, and user erase clear source cells they edit, while
normal physics deletion and movement leave source cells intact.

## Update Order

`src/02-step-world.js` owns the current `stepWorld(world)` wrapper. It uses the
supplied world directly and passes that same world to body-mask rebuild,
dynamic-body update, and flow update stages without installing it into the
classic global shell. During the tick it temporarily uses the supplied world's
custom material registry, then restores the previous registry. This gives
browser and future non-browser adapters a single physics-tick entry point
without pretending the whole engine is object-pure yet.
`simulationStep()` is now only a browser-compatible convenience wrapper around
`stepWorld(currentWorldState())`.
One simulation step is:

1. Rebuild the dynamic body mask.
2. Update dynamic bodies.
3. Rebuild the body mask again.
4. Update flow materials.
5. Rebuild the body mask again.

Inside `updateGridMaterials(world)`, the wrapper passes the supplied world to
source generation, local flow, optional basin/surface passes, erosion,
oscillation cleanup, open-boundary draining, stability, and carry-lifetime
helpers without installing it into the classic global shell. The order is:

1. Source cells generate material when the world source interval allows it.
2. Local flow rules run in density order from `FLOW_ORDER`.
3. Optional legacy water basin passes run only if the water flow rule enables
   them.
4. The erosion pass may arm exposed granular cells as temporarily carried by
   nearby recently moving flow cells.
5. Oscillating flow cells may be deleted if their material rule allows it.
6. Edge cells drain out of the open viewport.
7. Stable/rest state is updated, and carried TTLs decay.

Do not casually reorder these steps. Local movement must finish before optional
cleanup and stability checks.

## Water Design

Water is deliberately not a pressure solver. The current default water behavior
uses a simple local low-slope rule:

1. Water falls and slides as local particles.
2. Its slope rule is `slopeRise: 1`, `slopeRun: 2`, with a small lookahead.
3. `localSlopeSurface: true` makes slope checks ignore same-material cells above
   the current cell, so an upper reservoir cannot hide a lower pile/surface.
4. Legacy basin settling is disabled by default through the water flow rule:
   `useBasinSettle: false` and `useSurfaceLevelPass: false`.
5. Tiny surface jitter uses a strict same-row escape detector. A-B-A-B flips at
   `escapeTriggerFrames` scan left and right on the current row for the nearest
   drop slot within `escapeScanDistance`. If a slot is found, `escapeDir` and
   `escapeTarget` move the surface cell toward that target one frame at a time
   while gravity still runs first. Escape scanning may look through empty cells
   and same-material cells, but actual movement still uses `canEnterCell`, so two
   cells never occupy the same pixel. If the path fails, the target is rescanned.
   If no drop slot is reachable, the jittering surface cell is deleted.
   One narrow exception is an isolated one-pixel water bump on a supported
   surface: instead of deleting it immediately, the cell keeps a horizontal
   `escapeDir` and walks one way until it finds a drop, joins other water, or
   hits a solid dead end. The same isolated-cell check also arms `escapeTarget`
   early when a drop is already visible, so a one-pixel bump does not need to
   wait for several strict A-B-A-B flips before moving toward an outlet.
   For bumps that do not make strict A-B-A-B moves, `horizontalDir` and
   `horizontalTurns` count same-row direction changes. Only isolated water bumps
   use `singlePixelTurnThreshold`; normal falling streams and multi-pixel water
   bodies are left to the regular flow rules.

The legacy basin code is still present for comparison, debugging, and possible
future experiments. A basin is a geometry object: a flat-topped empty/water space
below its lowest spill lip. It must be side-bounded by solid blockers and have
enough supported bottom cells to hold water.

Stable water no longer requires a basin in the default rule. If legacy basin
settling is re-enabled, water stability must again be gated by `canWaterSleepAt()`
or an equivalent stricter check.

Important functions:

- `buildWaterTrayInfo()` records tray geometry, current water count, and support.
- `buildWaterBasins()` marks all geometry basins before any intake happens.
  It must first assign `waterBasinMark` for every basin, then compute
  `waterSleepBlockMark`; doing both in one pass can mistake a later basin for
  open air.
- `waterSleepBlockMark` marks routing cells that are useful for guiding water
  but are not allowed to sleep. This includes floor-leaking spaces.
- `canWaterSleepAt()` is the legacy basin gate for water stability. The default
  low-slope water rule bypasses it with `requiresBasinSleep: false`.
- `collectWaterTrayGroups()` scans row intervals from bottom to top. A row
  interval becomes basin space only when its left and right neighbors are solid
  blockers and every cell below it is either solid or already accepted basin
  space. This makes one-cell-wide intervals valid while rejecting open shafts.
- `collectWaterBasinIntake()` finds connected non-basin water streams that can
  feed the basin. It can move through empty cells inside the basin inventory, but
  outside the basin it only follows actual water cells.
- `basinTargetHasOutlet()` keeps water above floor leaks awake so it can drain to
  the next basin instead of becoming permanently stable.
- `basinSlotHasRawOutlet()` makes partial rows prefer drain slots. This prevents
  a leaking basin from stabilizing a tiny leftover puddle away from its leak.
- `pushWaterAlongBasinOverflow()` gives a full basin an explicit runout direction
  so overflow moves off the lip instead of piling into a sloped plug.
- `transferBasinOverflow()` groups all source overflows by target basin before
  settling. A target basin must be rewritten at most once per transfer pass, or
  a second stale rewrite can erase water transferred by the first source.
- `settleWaterTray()` rewrites the tray with the current water plus the accepted
  intake cells.
- `waterTraySettlePass()` identifies bounded horizontal tray intervals, accepts
  connected intake water, and settles each basin independently from narrow
  connecting streams.
- `renderBasinDebug()` is a read-only debug overlay. It may call
  `buildWaterBasins()` to display current geometry, but it must not mutate
  material cells, wake water, or become part of the simulation update order.

### Tray/Reservoir Invariant

Do not rely on connected water components to decide whether water can settle. A
leaking upper reservoir, a falling stream, and a lower reservoir can all be one
connected water component, but the reservoirs must remain separate basins.

The tray pass treats fixed stone, dynamic body masks, and all non-water
materials as water blockers. It uses a bottom-up support scan instead of water connectivity
or overlap thresholds. For each row, a continuous empty/water interval is
accepted only when both side cells are blockers and each cell below is either a
blocker or basin space accepted on a lower row. There is no minimum interval
width: a one-cell-wide slot is a valid basin layer if it satisfies the same
support and side-boundary rule.

The intake step must stay conservative: only delete an intake water cell if the
same pass places one extra water cell inside the basin. Do not traverse through
open air outside a basin; otherwise an upper reservoir can teleport into a lower
one instead of visibly leaking.

Do not let a basin re-absorb water that has already fallen below its bottom row.
That water is outflow and should be handled by lower basins or by the open canvas
boundary. Reabsorbing it recreates the old "leak fights the stabilizer" slope.

For cascades, prefer side overflow geometry when an intermediate basin should
retain water. A floor leak should eventually drain that basin completely; a side
lip keeps the water below the lip and lets only overflow continue downward.

Unsupported holes are not basins because the cell below the interval is neither
solid nor previously accepted basin space. Keep this bottom-up invariant intact:
weakening it makes the row under a leaking tank look like a basin bottom and can
recreate sloped water in connected cascades.

Even a single water cell in a basin must be repacked. Otherwise the last pixel
in a leaking tank can remain stable on a supported floor cell instead of moving
back toward the drain.

If a tank floor has a hole, that tank may be a routing candidate but not stable
storage. The stable basin is the lower flat-topped space whose shortest side or
spill lip determines the final water height.

When a basin is full, overflow must be pushed along the selected spill side.
Do not rely on local slope relaxation alone at a lip: if the next basin is full
or no lower basin is available, local water can form a sloped plug and block the
runout. Explicit overflow runout keeps the lip clear and lets extra water either
reach a lower basin or leave the canvas.

When multiple sources feed the same basin, collect all intake cells first and
settle that target once. Repeated target rewrites in the same pass use stale
`waterCount` and can break visible water conservation.

The older connected-component water functions are left in the file for reference
and possible future experiments, but they are not called from the frame loop.
Re-enabling them can recreate the old bug where a tank connected to the first
basin forms one long sloped water body.

### Stable/Wake Invariant

Stable water must stay asleep until something nearby truly changes. Wake events
should go through:

- `wakeFlowAroundCell()`
- `wakeWaterComponentsAroundCell()`
- `wakeFlowNearBody()`
- `clearRestState()`

Call these when drawing, erasing, filling, applying force, moving a material cell,
or displacing material with a dynamic body.

Topology edits such as erasing stone from a closed basin must wake whole nearby
water components, not only the local edit radius. Otherwise a few cells near the
new opening will move while the rest of the water remains stable, producing edge
jitter. Use one shared wake token for a brush stroke, fill operation, or body
displacement so the same water component is flood-filled at most once.

After a real edit finishes, call `finishEditAsNewInitialState()`. This keeps the
current material positions but clears velocities, water direction preferences,
oscillation history, and stable/rest state for all flow cells. Dynamic bodies are
also stopped in place. The force tool is the exception because its purpose is to
inject velocity.
Portable adapters should call `engine.finishEdit()` instead of reaching for that
low-level hook directly; the facade finalizes its engine world without installing
it.
Browser adapters should call `finishAppEdit()`, which delegates to
`engine.finishEdit()` and then resets browser frame timing through
`resetRuntimeClock()` when that browser hook is available. The core edit path
does not know about RAF accumulator state.

Avoid waking stable water from purely theoretical local movement candidates.
That was the cause of persistent one-cell surface jitter.

### Boundary Invariant

The canvas is not a wall for flow materials. Any flow-material cell that reaches
the left, right, or bottom edge is deleted by `drainOpenBoundaries()`.
This matches `isDrainCell()` and prevents edge water from becoming neither
stable nor drained.

## Adding Materials

To add another built-in flow material:

1. Add a material id, metadata, density, stable-frame value, and flow rule in
   `src/00-materials.js`.
2. Let `registerMaterial()` derive `FLOW_RULES`, `FLOW_MATERIALS`,
   `FLOW_ORDER`, colors, and stable-frame tables.
3. Add any special render or interaction logic only if the shared flow rules are
   insufficient.

Keep material ids small integers because the grid arrays are hot paths.

Custom fluid materials reuse the water-like local flow rule. Custom granular
materials reuse the sand-like local flow rule with an editable integer
`maxSlope`. Runtime-added materials are ordinary page state until `Save` stores
them with the canvas snapshot.

Granular `maxSlope` gates both slope relaxation and diagonal gravity slides.
Without `slideRequiresSlope`, `tryGravity()` would move grains diagonally before
`trySlopeRelax()` runs, forcing every granular material toward a one-cell slope
regardless of its configured `maxSlope`.
Granular slope checks also use `localSlopeSurface`, so trays or ceilings above
the current particle do not block spreading in a lower basin. Side-exposed
grains may slide diagonally when the local slope exceeds the material limit;
otherwise a continuous same-material stream through a small hole can behave like
a rigid vertical column.

Granular erosion is intentionally state-based rather than material-changing.
When an exposed granular cell is next to a different flow material that moved in
the last few frames, `src/02-erosion.js` may set `carriedBy` and `carriedTTL`
based on `erosionResistance` and density. A carried cell tries to follow the
carrier's recent movement vector before its normal granular gravity/slope rules
run. Its `material` id, density, and color stay unchanged, so rendering and
density ordering remain predictable. Fixed Stone is not carryable.

Round and rectangular dynamic stones are currently disabled at the UI level.
Fixed Stone remains the only selectable stone. The body code remains available
for future work, but new UI should not expose it until that feature is revisited.

## Adding Gameplay

Prefer component-level rules for large-scale behavior and local rules for motion.
For example, a future U-tube approximation should extend the water basin pass,
not add per-cell pressure forces. Local pressure-like rules are likely to
reintroduce jitter, non-conservation, and wall leakage.

## Known Tradeoffs

## Test Gates

Run `node tests/verify.js` before and after each migration step. That suite
includes both a full browser-load smoke with fake DOM/canvas handles, a DOM-free
core smoke, and the focused portable adapter smoke. The DOM-free smoke is the
portability guard: it must continue to create a world, apply explicit-world edit
commands, step, render to an RGBA buffer, serialize, clear, and restore without
browser globals.

- Water is visually stable and cheap, not physically exact.
- Tiny top-surface water can be deleted in closed basins if it is below the
  configured residue thresholds.
- Dynamic stones are approximate rigid bodies and interact with the grid through
  rasterized masks.
- The code uses classic scripts to avoid build tooling. Respect the load order.
  `src/02-body-runtime.js` must load before `src/02-step-world.js`.
  `src/03-simulation-engine.js` must load after `src/03-render-buffer.js` and
  `src/04-save-codec.js`. `src/03-canvas-render-adapter.js` must load after
  `src/03-render-buffer.js` and before UI adapters that call `render()`.
  `src/03-app-dom-refs.js` and `src/03-dom-refs.js` must load before browser
  UI adapters that read DOM handles.
  `src/03-app-context.js` must load before `src/03-app-ui-state-adapter.js` and
  other material/control/input/bootstrap adapters that read `appContext`.
  `src/03-settings-sync-adapter.js` must load before
  `src/03-controls-adapter.js` because controls bind to those helper functions.
  `src/03-canvas-input-adapter.js` and `src/03-app-bootstrap.js` load after the
  UI adapters.
