'use strict';

// DOM-free compatibility facade for non-browser adapters. It does not replace
// the classic-script globals yet; each method installs its world before calling
// the existing core boundary functions.

function createSimulationEngine(options={}){
  const engine={
    world:options.world||createWorldState(
      normalizeWorldDimension(options.cols,cols),
      normalizeWorldDimension(options.rows,rows),
      {cellSize:normalizeWorldDimension(options.cellSize,cellSize)}
    )
  };
  if(options.install!==false)useWorldState(engine.world);

  engine.useWorld=function(){
    return useWorldState(engine.world);
  };
  engine.currentWorld=function(){
    engine.world=engine.useWorld();
    return engine.world;
  };
  engine.edit=function(command){
    return applyEditCommand(engine.world,command);
  };
  engine.step=function(iterations=1){
    const steps=clampInt(iterations,1,1000,1);
    for(let i=0;i<steps;i++)engine.world=stepWorld(engine.world);
    return engine.world;
  };
  engine.renderBuffer=function(data){
    engine.useWorld();
    const target=data||new Uint8ClampedArray(engine.world.count*4);
    buildRenderBuffer(engine.world,target);
    return target;
  };
  engine.serialize=function(){
    return serializeWorldSnapshot(engine.world);
  };
  engine.restore=function(snapshot){
    const result=restoreWorldSnapshot(engine.world,snapshot);
    engine.world=currentWorldState();
    return result;
  };
  engine.resize=function(nextCols,nextRows,resizeOptions={}){
    engine.useWorld();
    const result=resizeWorldGrid(nextCols,nextRows,resizeOptions);
    engine.world=result.world;
    return result;
  };
  engine.materialCommand=function(command){
    engine.useWorld();
    return applyMaterialCommand(command);
  };
  engine.runtimeSettingsCommand=function(command){
    engine.useWorld();
    return applyRuntimeSettingsCommand(command);
  };
  engine.runtimeSettings=function(){
    engine.useWorld();
    return currentRuntimeSettings();
  };
  engine.clear=function(){
    return engine.edit({type:'clear'});
  };
  return engine;
}
