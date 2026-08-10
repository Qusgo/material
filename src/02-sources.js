'use strict';

// Infinite material sources live on a separate location layer. They do not
// block movement or change material cells until their location becomes empty.

function canSourceMaterial(mat){
  return mat!==EMPTY&&isKnownMaterial(mat)&&isFlowMaterial(mat);
}

function countSourceCells(mat){
  let total=0;
  for(let i=0;i<count;i++)if(sourceMat[i]===mat)total++;
  return total;
}

function selectedSourceMaterial(){
  const key=typeof currentSelectedKey==='function'?currentSelectedKey():selected;
  const mat=MATERIAL_FROM_NAME[key]||WATER;
  return canSourceMaterial(mat)?mat:EMPTY;
}

function setSourceCell(c,r,mat){
  if(!inBounds(c,r)||!canSourceMaterial(mat))return false;
  sourceMat[idx(c,r)]=mat;
  return true;
}

function stampSourceAt(x,y,rad,mat){
  const p=pointToCell(x,y),r2=rad*rad;
  let painted=0;
  for(let rr=p.r-rad;rr<=p.r+rad;rr++)for(let cc=p.c-rad;cc<=p.c+rad;cc++){
    if(!inBounds(cc,rr))continue;
    const dx=cc-p.c,dy=rr-p.r;
    if(dx*dx+dy*dy<=r2&&setSourceCell(cc,rr,mat))painted++;
  }
  return painted;
}

function drawSourceLine(a,b,rad,mat){
  let painted=0;
  forEachLinePoint(a,b,(x,y)=>{painted+=stampSourceAt(x,y,rad,mat)});
  return painted;
}

function drawSourceContinuous(a,b,mat){
  return drawSourceLine(a,b,getBrushRadius(),mat);
}

function sourceIntervalReady(){
  const settings=typeof currentRuntimeSettingsState==='function'?currentRuntimeSettingsState():{sourceInterval};
  const interval=Math.max(1,settings.sourceInterval|0);
  return simTick%interval===0;
}

function placeSourceMaterial(i,mat){
  const c=i%cols,r=Math.floor(i/cols);
  wakeFlowAroundCell(c,r);
  material[i]=mat;
  mass[i]=materialCarriesMass(mat)?defaultMassForMaterial(mat):0;
  vx[i]=0;
  vy[i]=0;
  flowDir[i]=defaultFlowDirForMaterial(mat);
  clearParticleTint(i);
  clearMotionTrace(i);
  clearCarryState(i);
  clearRestState(i);
  wakeFlowAroundCell(c,r);
}

function applySources(world){
  if(world&&typeof useWorldState==='function')useWorldState(world);
  if(!sourceIntervalReady())return;
  for(let i=0;i<count;i++){
    const mat=sourceMat[i];
    if(mat===EMPTY)continue;
    if(!canSourceMaterial(mat)){
      sourceMat[i]=EMPTY;
      continue;
    }
    if(bodyMask[i]||material[i]!==EMPTY)continue;
    placeSourceMaterial(i,mat);
  }
}
