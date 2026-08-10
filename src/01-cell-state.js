'use strict';

// Low-level grid cell mutation, transient motion cleanup, and cell normalization.

function writeCell(c,r,mat,wakeToken=0){
  if(!inBounds(c,r))return;
  const i=idx(c,r);
  if(bodyMask[i])return;
  const oldMat=material[i];
  if(oldMat!==mat)editDirty=true;
  if(oldMat!==mat)wakeWaterComponentsAroundCell(c,r,WAKE_RADIUS,wakeToken);
  wakeFlowAroundCell(c,r);
  material[i]=mat;
  mass[i]=materialCarriesMass(mat)?Math.max(mass[i],defaultMassForMaterial(mat)):0;
  vx[i]=0;
  vy[i]=0;
  flowDir[i]=defaultFlowDirForMaterial(mat);
  clearTint(i);
  clearSource(i);
  clearMotionTrace(i);
  clearCarryState(i);
  clearRestState(i);
  wakeFlowAroundCell(c,r);
  if(oldMat!==mat)wakeWaterComponentsAroundCell(c,r,WAKE_RADIUS,wakeToken);
}
function clearMotionTrace(i){moveHistory[i]=-1;moveFlip[i]=0;horizontalDir[i]=0;horizontalTurns[i]=0;escapeDir[i]=0;escapeTarget[i]=-1}
function clearCarryState(i){carriedBy[i]=0;carriedTTL[i]=0;lastMoveTick[i]=0}
function clearRestState(i){restAge[i]=0;stableMask[i]=0}
function clearParticleTint(i){tintR[i]=0;tintG[i]=0;tintB[i]=0;tintA[i]=0}
function clearBackgroundTint(i){bgTintR[i]=0;bgTintG[i]=0;bgTintB[i]=0;bgTintA[i]=0}
function clearTint(i){clearParticleTint(i);clearBackgroundTint(i)}
function clearSource(i){sourceMat[i]=EMPTY}
function normalizeMaterialCell(i){
  if(isKnownMaterial(material[i]))return material[i];
  material[i]=EMPTY;
  mass[i]=0;
  vx[i]=0;
  vy[i]=0;
  flowDir[i]=0;
  clearTint(i);
  clearMotionTrace(i);
  clearCarryState(i);
  clearRestState(i);
  return EMPTY;
}
function resetFlowStateAfterEdit(){
  for(let i=0;i<count;i++){
    const mat=material[i];
    if(!isFlowMaterial(mat))continue;
    vx[i]=0;
    vy[i]=0;
    mass[i]=defaultMassForMaterial(mat);
    flowDir[i]=defaultFlowDirForMaterial(mat);
    clearMotionTrace(i);
    clearCarryState(i);
    clearRestState(i);
  }
  for(const b of bodies){
    b.vx=0;
    b.vy=0;
    b.av=0;
  }
}
function finishEditAsNewInitialState(){
  if(!editDirty)return;
  resetFlowStateAfterEdit();
  resetRuntimeClock();
  editDirty=false;
}
function clearCell(c,r,wakeToken=0,clearTintFlag=true,clearSourceFlag=clearTintFlag){
  if(!inBounds(c,r))return;
  const i=idx(c,r);
  const oldMat=material[i];
  if(oldMat!==EMPTY)editDirty=true;
  if(oldMat!==EMPTY)wakeWaterComponentsAroundCell(c,r,WAKE_RADIUS,wakeToken);
  wakeFlowAroundCell(c,r);
  material[i]=EMPTY;
  mass[i]=0;
  vx[i]=0;
  vy[i]=0;
  flowDir[i]=0;
  if(clearTintFlag)clearTint(i);
  if(clearSourceFlag)clearSource(i);
  clearMotionTrace(i);
  clearCarryState(i);
  clearRestState(i);
  wakeFlowAroundCell(c,r);
  if(oldMat!==EMPTY)wakeWaterComponentsAroundCell(c,r,WAKE_RADIUS,wakeToken);
}
