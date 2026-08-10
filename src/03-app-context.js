'use strict';

// Browser app-shell state. Keeping these values in one plain object makes the
// eventual WebView/miniprogram adapter boundary visible without changing the
// classic-script loading model yet.

const appContext={
  engine:createSimulationEngine({world:currentWorldState()}),
  statusText:'Brush: paint material directly',
  running:false,
  debugBasins:false,
  tool:typeof tool==='undefined'?'brush':tool,
  selected:typeof selected==='undefined'?'water':selected,
  materialMenuOpen:false,
  materialEditorMode:null,
  materialEditorTarget:0,
  pointerDown:false,
  lastPoint:null,
  hoverPoint:null,
  fillPreview:[],
  fillPreviewMaterial:0,
  placing:null,
  forceState:null,
  lastFrame:0,
  accumulator:0
};
if(typeof globalThis!=='undefined')globalThis.appContext=appContext;

function resolveAppContext(context=appContext){
  return context||appContext;
}

function appWorld(context=appContext){
  return resolveAppContext(context).engine.currentWorld();
}

function applyAppEditCommand(command,context=appContext){
  return resolveAppContext(context).engine.edit(command);
}

function stepAppWorld(iterations=1,context=appContext){
  return resolveAppContext(context).engine.step(iterations);
}

function resizeAppWorld(nextCols,nextRows,options={},context=appContext){
  return resolveAppContext(context).engine.resize(nextCols,nextRows,options);
}

function serializeAppSnapshot(context=appContext){
  return resolveAppContext(context).engine.serialize();
}

function restoreAppSnapshot(snapshot,context=appContext){
  return resolveAppContext(context).engine.restore(snapshot);
}

function applyAppMaterialCommand(command,context=appContext){
  return resolveAppContext(context).engine.materialCommand(command);
}

function applyAppRuntimeSettingsCommand(command,context=appContext){
  return resolveAppContext(context).engine.runtimeSettingsCommand(command);
}

function currentAppRuntimeSettings(context=appContext){
  return resolveAppContext(context).engine.runtimeSettings();
}

function renderApp(context=appContext){
  const active=resolveAppContext(context);
  render(appWorld(active),active);
}
