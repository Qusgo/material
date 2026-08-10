'use strict';

// Browser app-shell state. Keeping these values in one plain object makes the
// eventual WebView/miniprogram adapter boundary visible without changing the
// classic-script loading model yet.

const appContext={
  engine:createSimulationEngine({world:currentWorldState()}),
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

function appWorld(){
  return appContext.engine.currentWorld();
}

function applyAppEditCommand(command){
  return appContext.engine.edit(command);
}

function stepAppWorld(iterations=1){
  return appContext.engine.step(iterations);
}

function resizeAppWorld(nextCols,nextRows,options={}){
  return appContext.engine.resize(nextCols,nextRows,options);
}

function serializeAppSnapshot(){
  return appContext.engine.serialize();
}

function restoreAppSnapshot(snapshot){
  return appContext.engine.restore(snapshot);
}

function applyAppMaterialCommand(command){
  return appContext.engine.materialCommand(command);
}

function applyAppRuntimeSettingsCommand(command){
  return appContext.engine.runtimeSettingsCommand(command);
}

function currentAppRuntimeSettings(){
  return appContext.engine.runtimeSettings();
}

function renderApp(){
  render(appWorld(),appContext);
}
