'use strict';

// DOM-free grid array lifecycle helpers. The simulation still uses shared
// globals today, but allocation and clearing now live behind one stable shape.

function createGridArrays(cellCount,rowCount){
  const arrays={
    material:new Uint8Array(cellCount),
    mass:new Float32Array(cellCount),
    vx:new Float32Array(cellCount),
    vy:new Float32Array(cellCount),
    bodyMask:new Uint8Array(cellCount),
    flowDir:new Int8Array(cellCount),
    restAge:new Uint8Array(cellCount),
    stableMask:new Uint8Array(cellCount),
    tintR:new Uint8Array(cellCount),
    tintG:new Uint8Array(cellCount),
    tintB:new Uint8Array(cellCount),
    tintA:new Uint8Array(cellCount),
    bgTintR:new Uint8Array(cellCount),
    bgTintG:new Uint8Array(cellCount),
    bgTintB:new Uint8Array(cellCount),
    bgTintA:new Uint8Array(cellCount),
    sourceMat:new Uint8Array(cellCount),
    lightMask:new Uint8Array(cellCount),
    moveHistory:new Int32Array(cellCount),
    moveFlip:new Uint8Array(cellCount),
    horizontalDir:new Int8Array(cellCount),
    horizontalTurns:new Uint8Array(cellCount),
    escapeDir:new Int8Array(cellCount),
    escapeTarget:new Int16Array(cellCount),
    carriedBy:new Uint8Array(cellCount),
    carriedTTL:new Uint16Array(cellCount),
    lastMoveTick:new Int32Array(cellCount),
    waterSeen:new Uint8Array(cellCount),
    waterSpaceMark:new Uint16Array(cellCount),
    waterComponentMark:new Uint16Array(cellCount),
    waterBasinMark:new Uint16Array(cellCount),
    waterSleepBlockMark:new Uint8Array(cellCount),
    waterTargetMark:new Uint16Array(cellCount),
    waterWakeMark:new Uint16Array(cellCount),
    waterQueue:new Int32Array(cellCount),
    rowCounts:new Uint16Array(rowCount)
  };
  arrays.moveHistory.fill(-1);
  arrays.escapeTarget.fill(-1);
  return arrays;
}

function installGridArrays(arrays){
  material=arrays.material;
  mass=arrays.mass;
  vx=arrays.vx;
  vy=arrays.vy;
  bodyMask=arrays.bodyMask;
  flowDir=arrays.flowDir;
  restAge=arrays.restAge;
  stableMask=arrays.stableMask;
  tintR=arrays.tintR;
  tintG=arrays.tintG;
  tintB=arrays.tintB;
  tintA=arrays.tintA;
  bgTintR=arrays.bgTintR;
  bgTintG=arrays.bgTintG;
  bgTintB=arrays.bgTintB;
  bgTintA=arrays.bgTintA;
  sourceMat=arrays.sourceMat;
  lightMask=arrays.lightMask;
  moveHistory=arrays.moveHistory;
  moveFlip=arrays.moveFlip;
  horizontalDir=arrays.horizontalDir;
  horizontalTurns=arrays.horizontalTurns;
  escapeDir=arrays.escapeDir;
  escapeTarget=arrays.escapeTarget;
  carriedBy=arrays.carriedBy;
  carriedTTL=arrays.carriedTTL;
  lastMoveTick=arrays.lastMoveTick;
  waterSeen=arrays.waterSeen;
  waterSpaceMark=arrays.waterSpaceMark;
  waterComponentMark=arrays.waterComponentMark;
  waterBasinMark=arrays.waterBasinMark;
  waterSleepBlockMark=arrays.waterSleepBlockMark;
  waterTargetMark=arrays.waterTargetMark;
  waterWakeMark=arrays.waterWakeMark;
  waterQueue=arrays.waterQueue;
  rowCounts=arrays.rowCounts;
}

function resetWaterScratchTokens(){
  waterSpaceToken=1;
  waterComponentToken=1;
  waterBasinToken=1;
  waterTargetToken=1;
  waterWakeToken=1;
  if(typeof currentWorld!=='undefined'&&currentWorld&&currentWorld.tokens){
    currentWorld.tokens.waterSpaceToken=1;
    currentWorld.tokens.waterComponentToken=1;
    currentWorld.tokens.waterBasinToken=1;
    currentWorld.tokens.waterTargetToken=1;
    currentWorld.tokens.waterWakeToken=1;
  }
}

function resetWaterScratchTokensForWorld(world){
  if(!world||!world.tokens)return resetWaterScratchTokens();
  world.tokens.waterSpaceToken=1;
  world.tokens.waterComponentToken=1;
  world.tokens.waterBasinToken=1;
  world.tokens.waterTargetToken=1;
  world.tokens.waterWakeToken=1;
}

function clearTransientGridState(world){
  if(world&&world.arrays){
    const a=world.arrays;
    a.vx.fill(0);
    a.vy.fill(0);
    a.flowDir.fill(0);
    a.restAge.fill(0);
    a.stableMask.fill(0);
    a.moveHistory.fill(-1);
    a.moveFlip.fill(0);
    a.horizontalDir.fill(0);
    a.horizontalTurns.fill(0);
    a.escapeDir.fill(0);
    a.escapeTarget.fill(-1);
    a.carriedBy.fill(0);
    a.carriedTTL.fill(0);
    a.lastMoveTick.fill(0);
    a.lightMask.fill(0);
    resetWaterScratchTokensForWorld(world);
    return;
  }
  vx.fill(0);
  vy.fill(0);
  flowDir.fill(0);
  restAge.fill(0);
  stableMask.fill(0);
  moveHistory.fill(-1);
  moveFlip.fill(0);
  horizontalDir.fill(0);
  horizontalTurns.fill(0);
  escapeDir.fill(0);
  escapeTarget.fill(-1);
  carriedBy.fill(0);
  carriedTTL.fill(0);
  lastMoveTick.fill(0);
  lightMask.fill(0);
  resetWaterScratchTokens();
}

function clearEditableGridState(world){
  if(world&&world.arrays){
    const a=world.arrays;
    a.material.fill(EMPTY);
    a.mass.fill(0);
    a.bodyMask.fill(0);
    a.sourceMat.fill(EMPTY);
    a.tintR.fill(0);
    a.tintG.fill(0);
    a.tintB.fill(0);
    a.tintA.fill(0);
    a.bgTintR.fill(0);
    a.bgTintG.fill(0);
    a.bgTintB.fill(0);
    a.bgTintA.fill(0);
    clearTransientGridState(world);
    return;
  }
  material.fill(EMPTY);
  mass.fill(0);
  bodyMask.fill(0);
  sourceMat.fill(EMPTY);
  tintR.fill(0);
  tintG.fill(0);
  tintB.fill(0);
  tintA.fill(0);
  bgTintR.fill(0);
  bgTintG.fill(0);
  bgTintB.fill(0);
  bgTintA.fill(0);
  clearTransientGridState();
}
