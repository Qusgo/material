'use strict';

// Browser app-shell state. Keeping these values in one plain object makes the
// eventual WebView/miniprogram adapter boundary visible without changing the
// classic-script loading model yet.

const appContext={
  statusText:'Brush: paint material directly',
  running:false,
  debugBasins:false,
  materialMenuOpen:false,
  materialEditorMode:null,
  materialEditorTarget:0,
  pointerDown:false,
  lastPoint:null,
  hoverPoint:null,
  placing:null,
  forceState:null,
  lastFrame:0,
  accumulator:0
};
