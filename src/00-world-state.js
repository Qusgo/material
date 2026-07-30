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

function createWorldState(worldCols,worldRows,options={}){
  const nextCols=normalizeWorldDimension(worldCols,1),nextRows=normalizeWorldDimension(worldRows,1);
  const world={
    cols:nextCols,
    rows:nextRows,
    count:nextCols*nextRows,
    cellSize:normalizeWorldDimension(options.cellSize,1),
    arrays:createGridArrays(nextCols*nextRows,nextRows),
    tokens:createWaterScratchTokens()
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
  return world;
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
  return currentWorld;
}
