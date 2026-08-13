'use strict';

// DOM-free compatibility facade for non-browser adapters. It does not replace
// the classic-script globals yet; each method installs its world before calling
// the existing core boundary functions.

function simulationEnginePointToCell(world,x,y){
  const size=Math.max(1,world&&world.cellSize||1);
  return{
    c:clamp(Math.floor(x/size),0,world.cols-1),
    r:clamp(Math.floor(y/size),0,world.rows-1)
  };
}

function createSimulationEngine(options={}){
  const initialCols=normalizeWorldDimension(options.cols,cols);
  const initialRows=normalizeWorldDimension(options.rows,rows);
  const initialCellSize=normalizeWorldDimension(options.cellSize,cellSize);
  const engine={
    autoInstall:options.install!==false,
    world:options.world||createWorldState(
      initialCols,
      initialRows,
      {
        cellSize:initialCellSize,
        viewW:normalizeViewSize(options.viewW,initialCols*initialCellSize),
        viewH:normalizeViewSize(options.viewH,initialRows*initialCellSize)
      }
    )
  };
  if(engine.autoInstall)useWorldState(engine.world);

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
  engine.cellAt=function(xOrPoint,y){
    const point=typeof xOrPoint==='object'&&xOrPoint?xOrPoint:{x:xOrPoint,y};
    if(!Number.isFinite(point.x)||!Number.isFinite(point.y))return null;
    return simulationEnginePointToCell(engine.world,point.x,point.y);
  };
  engine.computeFill=function(xOrPoint,y){
    const cell=engine.cellAt(xOrPoint,y);
    if(!cell)return{cells:[],target:EMPTY,clipped:false,cell:null};
    const result=computeFill(engine.world,cell.c,cell.r);
    return{...result,cell};
  };
  engine.finishEdit=function(){
    finishEditAsNewInitialState(engine.world);
    return engine.world;
  };
  engine.step=function(iterations=1){
    const steps=clampInt(iterations,1,1000,1);
    for(let i=0;i<steps;i++)engine.world=stepWorld(engine.world);
    return engine.world;
  };
  engine.renderBuffer=function(data){
    const target=data||new Uint8ClampedArray(engine.world.count*4);
    buildRenderBuffer(engine.world,target);
    return target;
  };
  engine.serialize=function(){
    return serializeWorldSnapshot(engine.world);
  };
  engine.restore=function(snapshot){
    const result=restoreWorldSnapshot(engine.world,snapshot);
    if(result.ok){
      if(engine.autoInstall)engine.useWorld();
    }else engine.world=currentWorldState();
    return result;
  };
  engine.resize=function(nextCols,nextRows,resizeOptions={}){
    const result=resizeWorldGrid(engine.world,nextCols,nextRows,resizeOptions);
    engine.world=result.world;
    return result;
  };
  engine.materialCommand=function(command){
    const result=applyMaterialCommand(engine.world,command);
    return result;
  };
  engine.runtimeSettingsCommand=function(command){
    const result=applyRuntimeSettingsCommand(engine.world,command);
    return result;
  };
  engine.runtimeSettings=function(){
    return currentRuntimeSettings(engine.world);
  };
  engine.clear=function(){
    return engine.edit({type:'clear'});
  };
  return engine;
}
