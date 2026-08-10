'use strict';

// DOM-free world shell. It groups dimensions and grid arrays without forcing
// the existing classic-script runtime to stop using shared globals yet.

let currentWorld=null;

function normalizeWorldDimension(value,fallback=1){
  const n=Math.floor(Number(value));
  return Number.isFinite(n)&&n>0?n:fallback;
}

function createWaterScratchTokens(){
  return{
    waterSpaceToken:1,
    waterComponentToken:1,
    waterBasinToken:1,
    waterTargetToken:1,
    waterWakeToken:1
  };
}

function normalizeBodyId(value){
  return normalizeWorldDimension(value,1);
}

function captureBodyRuntimeState(world=currentWorld){
  try{
    if(typeof bodies!=='undefined'&&Array.isArray(bodies)){
      return{bodies,nextBodyId:normalizeBodyId(nextBodyId)};
    }
  }catch(e){}
  return{
    bodies:world&&Array.isArray(world.bodies)?world.bodies:[],
    nextBodyId:normalizeBodyId(world&&world.nextBodyId)
  };
}

function installBodyRuntimeState(world){
  const state=captureBodyRuntimeState(world);
  world.bodies=Array.isArray(world.bodies)?world.bodies:state.bodies;
  world.nextBodyId=normalizeBodyId(world.nextBodyId||state.nextBodyId);
  try{
    if(typeof bodies!=='undefined'){
      bodies=world.bodies;
      nextBodyId=world.nextBodyId;
    }
  }catch(e){}
}

function setBodyRuntimeState(nextBodies=[],nextId=1){
  const state={
    bodies:Array.isArray(nextBodies)?nextBodies:[],
    nextBodyId:normalizeBodyId(nextId)
  };
  try{
    if(typeof bodies!=='undefined'){
      bodies=state.bodies;
      nextBodyId=state.nextBodyId;
    }
  }catch(e){}
  if(currentWorld){
    currentWorld.bodies=state.bodies;
    currentWorld.nextBodyId=state.nextBodyId;
  }
  return state;
}

function normalizeAirColorState(color){
  const source=Array.isArray(color)?color:[255,255,255];
  return[
    clampInt(source[0],0,255,255),
    clampInt(source[1],0,255,255),
    clampInt(source[2],0,255,255)
  ];
}

function captureAirColorState(world=currentWorld){
  try{
    if(typeof airColor!=='undefined'&&Array.isArray(airColor))return normalizeAirColorState(airColor);
  }catch(e){}
  return normalizeAirColorState(world&&world.airColor);
}

function installAirColorState(world){
  world.airColor=normalizeAirColorState(world.airColor);
  try{
    if(typeof airColor!=='undefined')airColor=world.airColor;
  }catch(e){}
}

function setAirColorState(color=[255,255,255]){
  const next=normalizeAirColorState(color);
  try{
    if(typeof airColor!=='undefined')airColor=next;
  }catch(e){}
  if(currentWorld)currentWorld.airColor=next;
  return next;
}

function currentAirColorState(){
  const next=captureAirColorState(currentWorld);
  if(currentWorld)currentWorld.airColor=next;
  return next;
}

function normalizeSimTick(value){
  const n=Math.floor(Number(value));
  return Number.isFinite(n)&&n>=0?n:0;
}

function captureRuntimeFlagsState(world=currentWorld){
  try{
    if(typeof simTick!=='undefined'&&typeof editDirty!=='undefined'){
      return{simTick:normalizeSimTick(simTick),editDirty:!!editDirty};
    }
  }catch(e){}
  return{
    simTick:normalizeSimTick(world&&world.simTick),
    editDirty:!!(world&&world.editDirty)
  };
}

function installRuntimeFlagsState(world){
  const state=captureRuntimeFlagsState(world);
  world.simTick=normalizeSimTick(world.simTick===undefined?state.simTick:world.simTick);
  world.editDirty=world.editDirty===undefined?state.editDirty:!!world.editDirty;
  try{
    if(typeof simTick!=='undefined'){
      simTick=world.simTick;
      editDirty=world.editDirty;
    }
  }catch(e){}
}

function setRuntimeFlagsState(patch={}){
  const current=captureRuntimeFlagsState();
  const state={
    simTick:Object.prototype.hasOwnProperty.call(patch,'simTick')?normalizeSimTick(patch.simTick):current.simTick,
    editDirty:Object.prototype.hasOwnProperty.call(patch,'editDirty')?!!patch.editDirty:current.editDirty
  };
  try{
    if(typeof simTick!=='undefined'){
      simTick=state.simTick;
      editDirty=state.editDirty;
    }
  }catch(e){}
  if(currentWorld){
    currentWorld.simTick=state.simTick;
    currentWorld.editDirty=state.editDirty;
  }
  return state;
}

function incrementSimTickState(){
  const state=captureRuntimeFlagsState();
  return setRuntimeFlagsState({simTick:state.simTick+1}).simTick;
}

function setEditDirtyState(value=true){
  return setRuntimeFlagsState({editDirty:value}).editDirty;
}

function createWorldState(worldCols,worldRows,options={}){
  const nextCols=normalizeWorldDimension(worldCols,1),nextRows=normalizeWorldDimension(worldRows,1);
  const world={
    cols:nextCols,
    rows:nextRows,
    count:nextCols*nextRows,
    cellSize:normalizeWorldDimension(options.cellSize,1),
    arrays:createGridArrays(nextCols*nextRows,nextRows),
    tokens:createWaterScratchTokens(),
    bodies:Array.isArray(options.bodies)?options.bodies:[],
    nextBodyId:normalizeBodyId(options.nextBodyId),
    airColor:normalizeAirColorState(options.airColor),
    simTick:normalizeSimTick(options.simTick),
    editDirty:!!options.editDirty
  };
  return world;
}

function installWaterScratchTokens(tokens){
  const next=tokens||createWaterScratchTokens();
  waterSpaceToken=next.waterSpaceToken||1;
  waterComponentToken=next.waterComponentToken||1;
  waterBasinToken=next.waterBasinToken||1;
  waterTargetToken=next.waterTargetToken||1;
  waterWakeToken=next.waterWakeToken||1;
}

function captureWaterScratchTokens(world=currentWorld){
  if(!world)return null;
  world.tokens={
    waterSpaceToken,
    waterComponentToken,
    waterBasinToken,
    waterTargetToken,
    waterWakeToken
  };
  return world.tokens;
}

function installWorldState(world){
  if(!world||!world.arrays)throw new Error('Invalid world state');
  currentWorld=world;
  cols=world.cols;
  rows=world.rows;
  count=world.count;
  cellSize=world.cellSize;
  installGridArrays(world.arrays);
  installWaterScratchTokens(world.tokens);
  installBodyRuntimeState(world);
  installAirColorState(world);
  installRuntimeFlagsState(world);
  return world;
}

function useWorldState(world){
  if(world)return installWorldState(world);
  return currentWorldState();
}

function currentWorldState(){
  if(!currentWorld)return null;
  currentWorld.cols=cols;
  currentWorld.rows=rows;
  currentWorld.count=count;
  currentWorld.cellSize=cellSize;
  currentWorld.arrays={
    material,mass,vx,vy,bodyMask,flowDir,restAge,stableMask,
    tintR,tintG,tintB,tintA,bgTintR,bgTintG,bgTintB,bgTintA,
    sourceMat,lightMask,moveHistory,moveFlip,horizontalDir,horizontalTurns,
    escapeDir,escapeTarget,carriedBy,carriedTTL,lastMoveTick,
    waterSeen,waterSpaceMark,waterComponentMark,waterBasinMark,
    waterSleepBlockMark,waterTargetMark,waterWakeMark,waterQueue,rowCounts
  };
  captureWaterScratchTokens(currentWorld);
  const bodyState=captureBodyRuntimeState(currentWorld);
  currentWorld.bodies=bodyState.bodies;
  currentWorld.nextBodyId=bodyState.nextBodyId;
  currentWorld.airColor=currentAirColorState();
  const flags=captureRuntimeFlagsState(currentWorld);
  currentWorld.simTick=flags.simTick;
  currentWorld.editDirty=flags.editDirty;
  return currentWorld;
}

function clampWorldNumber(value,min,max){
  return Math.max(min,Math.min(max,value));
}

function captureResizeSource(){
  return{
    cols,
    rows,
    cellSize,
    material,
    mass,
    vx,
    vy,
    flowDir,
    tintR,
    tintG,
    tintB,
    tintA,
    bgTintR,
    bgTintG,
    bgTintB,
    bgTintA,
    sourceMat
  };
}

function sampleResizeSourceIndex(c,r,source){
  const x=(c+.5)*cellSize,y=(r+.5)*cellSize;
  const oldC=clampWorldNumber(Math.floor(x/source.cellSize),0,source.cols-1);
  const oldR=clampWorldNumber(Math.floor(y/source.cellSize),0,source.rows-1);
  return oldR*source.cols+oldC;
}

function restoreResizeCell(targetIndex,sourceIndex,source){
  const mat=isKnownMaterial(source.material[sourceIndex])?source.material[sourceIndex]:EMPTY;
  const src=isKnownMaterial(source.sourceMat[sourceIndex])?source.sourceMat[sourceIndex]:EMPTY;
  material[targetIndex]=mat;
  mass[targetIndex]=materialCarriesMass(mat)?source.mass[sourceIndex]:defaultMassForMaterial(mat);
  vx[targetIndex]=source.vx[sourceIndex]||0;
  vy[targetIndex]=source.vy[sourceIndex]||0;
  flowDir[targetIndex]=materialUsesDirectedFlow(mat)
    ?(source.flowDir[sourceIndex]||defaultFlowDirForMaterial(mat))
    :defaultFlowDirForMaterial(mat);
  tintR[targetIndex]=source.tintR[sourceIndex]||0;
  tintG[targetIndex]=source.tintG[sourceIndex]||0;
  tintB[targetIndex]=source.tintB[sourceIndex]||0;
  tintA[targetIndex]=source.tintA[sourceIndex]||0;
  bgTintR[targetIndex]=source.bgTintR[sourceIndex]||0;
  bgTintG[targetIndex]=source.bgTintG[sourceIndex]||0;
  bgTintB[targetIndex]=source.bgTintB[sourceIndex]||0;
  bgTintA[targetIndex]=source.bgTintA[sourceIndex]||0;
  sourceMat[targetIndex]=isFlowMaterial(src)?src:EMPTY;
}

function resizeWorldGrid(nextCols,nextRows,options={}){
  const normalizedCols=normalizeWorldDimension(nextCols,cols);
  const normalizedRows=normalizeWorldDimension(nextRows,rows);
  const normalizedCell=normalizeWorldDimension(options.cellSize,cellSize);
  if(normalizedCols===cols&&normalizedRows===rows&&normalizedCell===cellSize){
    return{changed:false,world:currentWorldState()};
  }
  const source=material&&material.length?captureResizeSource():null;
  const bodyState=captureBodyRuntimeState();
  const nextAirColor=currentAirColorState();
  const flags=captureRuntimeFlagsState();
  installWorldState(createWorldState(normalizedCols,normalizedRows,{cellSize:normalizedCell,bodies:bodyState.bodies,nextBodyId:bodyState.nextBodyId,airColor:nextAirColor,simTick:flags.simTick,editDirty:flags.editDirty}));
  if(source){
    for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){
      restoreResizeCell(r*cols+c,sampleResizeSourceIndex(c,r,source),source);
    }
  }
  return{changed:true,world:currentWorldState(),oldCols:source&&source.cols,oldRows:source&&source.rows};
}
