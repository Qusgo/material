'use strict';

// Low-level grid cell mutation, transient motion cleanup, and cell normalization.

function cellStateHasWorldArg(value){
  return !!(value&&typeof value==='object'&&value.arrays&&Number.isFinite(value.cols));
}
function cellStateIndex(world,c,r){
  return r*world.cols+c;
}
function cellStateInBounds(world,c,r){
  return c>=0&&c<world.cols&&r>=0&&r<world.rows;
}
function clearMotionTraceInWorld(world,i){
  const a=world.arrays;
  a.moveHistory[i]=-1;
  a.moveFlip[i]=0;
  a.horizontalDir[i]=0;
  a.horizontalTurns[i]=0;
  a.escapeDir[i]=0;
  a.escapeTarget[i]=-1;
}
function clearCarryStateInWorld(world,i){
  const a=world.arrays;
  a.carriedBy[i]=0;
  a.carriedTTL[i]=0;
  a.lastMoveTick[i]=0;
}
function clearRestStateInWorld(world,i){
  const a=world.arrays;
  a.restAge[i]=0;
  a.stableMask[i]=0;
}
function clearParticleTintInWorld(world,i){
  const a=world.arrays;
  a.tintR[i]=0;
  a.tintG[i]=0;
  a.tintB[i]=0;
  a.tintA[i]=0;
}
function clearBackgroundTintInWorld(world,i){
  const a=world.arrays;
  a.bgTintR[i]=0;
  a.bgTintG[i]=0;
  a.bgTintB[i]=0;
  a.bgTintA[i]=0;
}
function clearTintInWorld(world,i){
  clearParticleTintInWorld(world,i);
  clearBackgroundTintInWorld(world,i);
}
function clearSourceInWorld(world,i){
  world.arrays.sourceMat[i]=EMPTY;
}
function normalizeWriteCellArgs(worldOrC,cOrR,rOrMat,matOrWakeToken,maybeWakeToken){
  if(cellStateHasWorldArg(worldOrC))return{world:worldOrC,c:cOrR,r:rOrMat,mat:matOrWakeToken,wakeToken:maybeWakeToken};
  return{world:null,c:worldOrC,r:cOrR,mat:rOrMat,wakeToken:matOrWakeToken};
}
function writeCell(worldOrC,cOrR,rOrMat,matOrWakeToken,maybeWakeToken){
  const args=normalizeWriteCellArgs(worldOrC,cOrR,rOrMat,matOrWakeToken,maybeWakeToken),c=args.c,r=args.r,mat=args.mat,wakeToken=args.wakeToken===undefined?0:args.wakeToken;
  if(args.world){
    const world=args.world,a=world.arrays;
    if(!cellStateInBounds(world,c,r))return;
    const i=cellStateIndex(world,c,r);
    if(a.bodyMask[i])return;
    const oldMat=a.material[i];
    if(oldMat!==mat)world.editDirty=true;
    a.material[i]=mat;
    a.mass[i]=materialCarriesMass(mat)?Math.max(a.mass[i],defaultMassForMaterial(mat)):0;
    a.vx[i]=0;
    a.vy[i]=0;
    a.flowDir[i]=defaultFlowDirForMaterial(mat);
    clearTintInWorld(world,i);
    clearSourceInWorld(world,i);
    clearMotionTraceInWorld(world,i);
    clearCarryStateInWorld(world,i);
    clearRestStateInWorld(world,i);
    return;
  }
  if(!inBounds(c,r))return;
  const i=idx(c,r);
  if(bodyMask[i])return;
  const oldMat=material[i];
  if(oldMat!==mat){
    if(typeof setEditDirtyState==='function')setEditDirtyState(true);
    else editDirty=true;
  }
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
function resetFlowStateAfterEdit(world){
  if(cellStateHasWorldArg(world)){
    const a=world.arrays;
    for(let i=0;i<world.count;i++){
      const mat=a.material[i];
      if(!isFlowMaterial(mat))continue;
      a.vx[i]=0;
      a.vy[i]=0;
      a.mass[i]=defaultMassForMaterial(mat);
      a.flowDir[i]=defaultFlowDirForMaterial(mat);
      clearMotionTraceInWorld(world,i);
      clearCarryStateInWorld(world,i);
      clearRestStateInWorld(world,i);
    }
    for(const b of world.bodies||[]){
      b.vx=0;
      b.vy=0;
      b.av=0;
    }
    return;
  }
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
function finishEditAsNewInitialState(world){
  if(cellStateHasWorldArg(world)){
    const worldWasDirty=!!world.editDirty;
    if(typeof currentWorldState==='function'&&currentWorldState()===world&&typeof captureRuntimeFlagsState==='function')captureRuntimeFlagsState(world);
    if(worldWasDirty)world.editDirty=true;
    if(!world.editDirty)return;
    resetFlowStateAfterEdit(world);
    world.editDirty=false;
    if(typeof currentWorldState==='function'&&currentWorldState()===world&&typeof setRuntimeFlagsState==='function')setRuntimeFlagsState({editDirty:false});
    return;
  }
  if(!editDirty)return;
  resetFlowStateAfterEdit(world);
  if(typeof setEditDirtyState==='function')setEditDirtyState(false);
  else editDirty=false;
}
function normalizeClearCellArgs(worldOrC,cOrR,rOrWakeToken,wakeTokenOrClearTintFlag,clearTintOrClearSourceFlag,maybeClearSourceFlag){
  if(cellStateHasWorldArg(worldOrC)){
    return{world:worldOrC,c:cOrR,r:rOrWakeToken,wakeToken:wakeTokenOrClearTintFlag,clearTintFlag:clearTintOrClearSourceFlag,clearSourceFlag:maybeClearSourceFlag};
  }
  return{world:null,c:worldOrC,r:cOrR,wakeToken:rOrWakeToken,clearTintFlag:wakeTokenOrClearTintFlag,clearSourceFlag:clearTintOrClearSourceFlag};
}
function clearCell(worldOrC,cOrR,rOrWakeToken,wakeTokenOrClearTintFlag,clearTintOrClearSourceFlag,maybeClearSourceFlag){
  const args=normalizeClearCellArgs(worldOrC,cOrR,rOrWakeToken,wakeTokenOrClearTintFlag,clearTintOrClearSourceFlag,maybeClearSourceFlag),c=args.c,r=args.r,wakeToken=args.wakeToken===undefined?0:args.wakeToken,clearTintFlag=args.clearTintFlag===undefined?true:args.clearTintFlag,clearSourceFlag=args.clearSourceFlag===undefined?clearTintFlag:args.clearSourceFlag;
  if(args.world){
    const world=args.world,a=world.arrays;
    if(!cellStateInBounds(world,c,r))return;
    const i=cellStateIndex(world,c,r),oldMat=a.material[i];
    if(oldMat!==EMPTY)world.editDirty=true;
    a.material[i]=EMPTY;
    a.mass[i]=0;
    a.vx[i]=0;
    a.vy[i]=0;
    a.flowDir[i]=0;
    if(clearTintFlag)clearTintInWorld(world,i);
    if(clearSourceFlag)clearSourceInWorld(world,i);
    clearMotionTraceInWorld(world,i);
    clearCarryStateInWorld(world,i);
    clearRestStateInWorld(world,i);
    return;
  }
  if(!inBounds(c,r))return;
  const i=idx(c,r);
  const oldMat=material[i];
  if(oldMat!==EMPTY){
    if(typeof setEditDirtyState==='function')setEditDirtyState(true);
    else editDirty=true;
  }
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
