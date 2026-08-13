'use strict';

// Ordered classic-script file lists used by Node smoke tests. Keep this as the
// single test-side source of truth for the portable core boundary.

const PORTABLE_CORE_FILES=[
  'src/00-materials.js',
  'src/00-world-arrays.js',
  'src/00-world-state.js',
  'src/00-core-state.js',
  'src/01-cell-state.js',
  'src/01-grid-editing.js',
  'src/01-fill-editing.js',
  'src/01-body-geometry.js',
  'src/02-sources.js',
  'src/02-flow-and-water.js',
  'src/02-force.js',
  'src/01-runtime-config.js',
  'src/01-edit-commands.js',
  'src/02-erosion.js',
  'src/02-body-runtime.js',
  'src/02-step-world.js',
  'src/04-save-codec.js',
  'src/03-lighting.js',
  'src/03-render-buffer.js',
  'src/03-simulation-engine.js'
];

const BROWSER_ADAPTER_FILES=[
  'src/03-canvas-render-adapter.js',
  'src/03-source-render-adapter.js',
  'src/03-app-dom-refs.js',
  'src/03-dom-refs.js',
  'src/03-app-context.js',
  'src/03-app-ui-state-adapter.js',
  'src/03-material-ui-adapter.js',
  'src/03-settings-sync-adapter.js',
  'src/03-save-ui-adapter.js',
  'src/03-save-storage-adapter.js',
  'src/03-controls-adapter.js',
  'src/03-canvas-input-adapter.js',
  'src/03-app-bootstrap.js'
];

const BROWSER_RUNTIME_FILES=[...PORTABLE_CORE_FILES,...BROWSER_ADAPTER_FILES];

module.exports={
  PORTABLE_CORE_FILES,
  BROWSER_ADAPTER_FILES,
  BROWSER_RUNTIME_FILES
};
