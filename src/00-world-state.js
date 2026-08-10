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
  installWorldState(createWorldState(normalizedCols,normalizedRows,{cellSize:normalizedCell}));
  if(source){
    for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){
      restoreResizeCell(r*cols+c,sampleResizeSourceIndex(c,r,source),source);
    }
  }
  return{changed:true,world:currentWorldState(),oldCols:source&&source.cols,oldRows:source&&source.rows};
}
