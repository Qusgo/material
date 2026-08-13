'use strict';

// Flow-material rules, local movement, optional legacy water basin settling, and grid update order.

const WATER_BASIN_INTAKE_HEIGHT=24,WATER_BASIN_INTAKE_SIDE_PAD=10,WATER_BASIN_INTAKE_PER_PASS=48,WATER_BASIN_SETTLE_PASSES=3;
const WATER_BASIN_OVERFLOW_RUNOUT=26;

function flowGridHasArrays(value){
  return !!(value&&typeof value==='object'&&value.arrays&&Number.isFinite(value.cols)&&Number.isFinite(value.rows));
}

function flowGridIndex(grid,c,r){
  return r*grid.cols+c;
}

function flowGridInBounds(grid,c,r){
  return c>=0&&c<grid.cols&&r>=0&&r<grid.rows;
}

function flowClearMotionTraceInGrid(grid,i){
  const a=grid.arrays;
  a.moveHistory[i]=-1;
  a.moveFlip[i]=0;
  a.horizontalDir[i]=0;
  a.horizontalTurns[i]=0;
  a.escapeDir[i]=0;
  a.escapeTarget[i]=-1;
}

function flowClearCarryStateInGrid(grid,i){
  const a=grid.arrays;
  a.carriedBy[i]=0;
  a.carriedTTL[i]=0;
  a.lastMoveTick[i]=0;
}

function flowClearRestStateInGrid(grid,i){
  const a=grid.arrays;
  a.restAge[i]=0;
  a.stableMask[i]=0;
}

function flowClearParticleTintInGrid(grid,i){
  const a=grid.arrays;
  a.tintR[i]=0;
  a.tintG[i]=0;
  a.tintB[i]=0;
  a.tintA[i]=0;
}

function flowNormalizeMaterialCellInGrid(grid,i){
  const a=grid.arrays;
  if(isKnownMaterial(a.material[i]))return a.material[i];
  a.material[i]=EMPTY;
  a.mass[i]=0;
  a.vx[i]=0;
  a.vy[i]=0;
  a.flowDir[i]=0;
  flowClearParticleTintInGrid(grid,i);
  flowClearMotionTraceInGrid(grid,i);
  flowClearCarryStateInGrid(grid,i);
  flowClearRestStateInGrid(grid,i);
  return EMPTY;
}

function flowWakeAroundCellInGrid(grid,c,r,rad=WAKE_RADIUS){
  const a=grid.arrays;
  for(let rr=r-rad;rr<=r+rad;rr++){
    if(rr<0||rr>=grid.rows)continue;
    for(let cc=c-rad;cc<=c+rad;cc++){
      if(cc<0||cc>=grid.cols)continue;
      const i=flowGridIndex(grid,cc,rr);
      if(isFlowMaterial(a.material[i]))flowClearRestStateInGrid(grid,i);
    }
  }
}

function flowIsBlockedCellInGrid(grid,i){
  const a=grid.arrays;
  return i<0||i>=grid.count||a.bodyMask[i]||isSolidMaterial(flowNormalizeMaterialCellInGrid(grid,i));
}

function flowCanEnterCellInGrid(grid,mat,to){
  const a=grid.arrays;
  if(flowIsBlockedCellInGrid(grid,to))return false;
  const target=flowNormalizeMaterialCellInGrid(grid,to);
  if(target===EMPTY)return true;
  return isFlowMaterial(target)&&materialDensity(mat)>materialDensity(target);
}

function flowDeleteCellInGrid(grid,i){
  const a=grid.arrays,c=i%grid.cols,r=Math.floor(i/grid.cols);
  flowWakeAroundCellInGrid(grid,c,r);
  a.material[i]=EMPTY;
  a.mass[i]=0;
  a.vx[i]=0;
  a.vy[i]=0;
  a.flowDir[i]=0;
  flowClearParticleTintInGrid(grid,i);
  flowClearMotionTraceInGrid(grid,i);
  flowClearCarryStateInGrid(grid,i);
  flowClearRestStateInGrid(grid,i);
  flowWakeAroundCellInGrid(grid,c,r);
}

function flowNoteMoveInGrid(grid,from,to){
  const a=grid.arrays,previous=a.moveHistory[from],backAndForth=previous===to;
  const fromRow=Math.floor(from/grid.cols),toRow=Math.floor(to/grid.cols),movedMat=a.material[to];
  a.moveHistory[to]=from;
  a.moveFlip[to]=backAndForth?Math.min(255,a.moveFlip[from]+1):0;
  if(fromRow===toRow&&isFlowMaterial(movedMat)){
    const dir=to>from?1:-1,lastDir=a.horizontalDir[from];
    a.horizontalDir[to]=dir;
    a.horizontalTurns[to]=lastDir&&lastDir!==dir?Math.min(255,a.horizontalTurns[from]+1):a.horizontalTurns[from];
  }else{
    a.horizontalDir[to]=0;
    a.horizontalTurns[to]=0;
  }
  if(fromRow!==toRow){
    a.escapeDir[to]=0;
    a.escapeTarget[to]=-1;
  }
  a.moveHistory[from]=-1;
  a.moveFlip[from]=0;
  a.horizontalDir[from]=0;
  a.horizontalTurns[from]=0;
  const tick=Number.isFinite(grid.simTick)?grid.simTick:simTick;
  a.lastMoveTick[to]=tick;
  a.lastMoveTick[from]=tick;
}

function flowMoveCellInGrid(grid,from,to){
  const a=grid.arrays,fromC=from%grid.cols,fromR=Math.floor(from/grid.cols),toC=to%grid.cols,toR=Math.floor(to/grid.cols);
  flowWakeAroundCellInGrid(grid,fromC,fromR);
  flowWakeAroundCellInGrid(grid,toC,toR);
  const movingMat=flowNormalizeMaterialCellInGrid(grid,from),oldMat=flowNormalizeMaterialCellInGrid(grid,to),oldMass=a.mass[to],oldVx=a.vx[to],oldVy=a.vy[to],oldFlowDir=a.flowDir[to],oldEscapeDir=a.escapeDir[to],oldEscapeTarget=a.escapeTarget[to],oldCarriedBy=a.carriedBy[to],oldCarriedTTL=a.carriedTTL[to],oldTintR=a.tintR[to],oldTintG=a.tintG[to],oldTintB=a.tintB[to],oldTintA=a.tintA[to];
  const movingCarriedBy=a.carriedBy[from],movingCarriedTTL=a.carriedTTL[from];
  a.material[to]=a.material[from];
  a.mass[to]=defaultMassForMaterial(movingMat);
  a.vx[to]=a.vx[from];
  a.vy[to]=a.vy[from];
  a.flowDir[to]=materialUsesDirectedFlow(movingMat)?(a.flowDir[from]||defaultFlowDirForMaterial(movingMat)):defaultFlowDirForMaterial(movingMat);
  a.escapeDir[to]=isFluidMaterial(movingMat)?a.escapeDir[from]:0;
  a.escapeTarget[to]=isFluidMaterial(movingMat)?a.escapeTarget[from]:-1;
  a.carriedBy[to]=materialCanBeCarried(movingMat)?movingCarriedBy:0;
  a.carriedTTL[to]=materialCanBeCarried(movingMat)?movingCarriedTTL:0;
  a.tintR[to]=a.tintR[from];
  a.tintG[to]=a.tintG[from];
  a.tintB[to]=a.tintB[from];
  a.tintA[to]=a.tintA[from];
  a.material[from]=oldMat;
  a.mass[from]=materialCarriesMass(oldMat)?oldMass:defaultMassForMaterial(oldMat);
  a.vx[from]=oldVx;
  a.vy[from]=oldVy;
  a.flowDir[from]=materialUsesDirectedFlow(oldMat)?(oldFlowDir||defaultFlowDirForMaterial(oldMat)):defaultFlowDirForMaterial(oldMat);
  a.escapeDir[from]=isFluidMaterial(oldMat)?oldEscapeDir:0;
  a.escapeTarget[from]=isFluidMaterial(oldMat)?oldEscapeTarget:-1;
  a.carriedBy[from]=materialCanBeCarried(oldMat)?oldCarriedBy:0;
  a.carriedTTL[from]=materialCanBeCarried(oldMat)?oldCarriedTTL:0;
  a.tintR[from]=oldTintR;
  a.tintG[from]=oldTintG;
  a.tintB[from]=oldTintB;
  a.tintA[from]=oldTintA;
  if(oldMat===EMPTY)flowClearParticleTintInGrid(grid,from);
  flowNoteMoveInGrid(grid,from,to);
  flowClearRestStateInGrid(grid,from);
  flowClearRestStateInGrid(grid,to);
  flowWakeAroundCellInGrid(grid,fromC,fromR);
  flowWakeAroundCellInGrid(grid,toC,toR);
}

function flowTryMoveInGrid(grid,c,r,nc,nr,mat){
  const a=grid.arrays,from=flowGridIndex(grid,c,r);
  if(a.material[from]!==mat)return false;
  if(!flowGridInBounds(grid,nc,nr)){
    flowDeleteCellInGrid(grid,from);
    return true;
  }
  const to=flowGridIndex(grid,nc,nr);
  if(!flowCanEnterCellInGrid(grid,mat,to))return false;
  flowMoveCellInGrid(grid,from,to);
  return true;
}

function wakeFlowAroundCell(c,r,rad=WAKE_RADIUS,grid=null){
  if(grid&&grid.arrays&&Number.isFinite(grid.cols)){
    flowWakeAroundCellInGrid(grid,c,r,rad);
    return;
  }
  // Stable materials wake only when nearby state actually changes. Do not call
  // this from speculative checks; doing so reintroduces surface jitter.
  for(let rr=r-rad;rr<=r+rad;rr++){
    if(rr<0||rr>=rows)continue;
    for(let cc=c-rad;cc<=c+rad;cc++){
      if(cc<0||cc>=cols)continue;
      const i=idx(cc,rr);
      if(isFlowMaterial(material[i]))clearRestState(i);
    }
  }
}

function wakeFlowNearBody(b,rad=WAKE_RADIUS){
  const minC=clamp(Math.floor((b.x-b.radius)/cellSize)-rad,0,cols-1),maxC=clamp(Math.floor((b.x+b.radius)/cellSize)+rad,0,cols-1);
  const minR=clamp(Math.floor((b.y-b.radius)/cellSize)-rad,0,rows-1),maxR=clamp(Math.floor((b.y+b.radius)/cellSize)+rad,0,rows-1);
  for(let r=minR;r<=maxR;r++)for(let c=minC;c<=maxC;c++){
    const i=idx(c,r);
    if(isFlowMaterial(material[i]))clearRestState(i);
  }
}

function nextWaterWakeToken(){
  waterWakeToken++;
  if(waterWakeToken>65000){
    waterWakeMark.fill(0);
    waterWakeToken=1;
  }
  return waterWakeToken;
}

function wakeWaterComponentFrom(start,token){
  if(material[start]!==WATER||waterWakeMark[start]===token)return;
  let head=0,tail=0;
  waterWakeMark[start]=token;
  waterQueue[tail++]=start;
  while(head<tail){
    const i=waterQueue[head++],c=i%cols,r=Math.floor(i/cols);
    clearRestState(i);
    clearMotionTrace(i);
    const ns=[i-1,i+1,i-cols,i+cols];
    for(const ni of ns){
      if(ni<0||ni>=count||waterWakeMark[ni]===token||material[ni]!==WATER)continue;
      const nc=ni%cols,nr=Math.floor(ni/cols);
      if(Math.abs(nc-c)+Math.abs(nr-r)!==1)continue;
      waterWakeMark[ni]=token;
      waterQueue[tail++]=ni;
    }
  }
}

function wakeWaterComponentsAroundCell(c,r,rad=WAKE_RADIUS,token=0){
  // Topology edits can open a formerly closed basin. Wake entire connected
  // water components near the edit, not only the local 3-cell neighborhood.
  const wakeToken=token||nextWaterWakeToken();
  for(let rr=r-rad;rr<=r+rad;rr++){
    if(rr<0||rr>=rows)continue;
    for(let cc=c-rad;cc<=c+rad;cc++){
      if(cc<0||cc>=cols)continue;
      wakeWaterComponentFrom(idx(cc,rr),wakeToken);
    }
  }
}

function isBlockedCell(i,grid=null){
  if(grid&&grid.arrays&&Number.isFinite(grid.cols))return flowIsBlockedCellInGrid(grid,i);
  return i<0||i>=count||bodyMask[i]||isSolidMaterial(normalizeMaterialCell(i));
}

function canEnterCell(mat,to,grid=null){
  if(grid&&grid.arrays&&Number.isFinite(grid.cols))return flowCanEnterCellInGrid(grid,mat,to);
  if(isBlockedCell(to))return false;
  const target=normalizeMaterialCell(to);
  if(target===EMPTY)return true;
  return isFlowMaterial(target)&&materialDensity(mat)>materialDensity(target);
}

function deleteCell(i,grid=null){
  if(grid&&grid.arrays&&Number.isFinite(grid.cols)){
    flowDeleteCellInGrid(grid,i);
    return;
  }
  const c=i%cols,r=Math.floor(i/cols);
  wakeFlowAroundCell(c,r);
  material[i]=EMPTY;
  mass[i]=0;
  vx[i]=0;
  vy[i]=0;
  flowDir[i]=0;
  clearParticleTint(i);
  clearMotionTrace(i);
  clearCarryState(i);
  clearRestState(i);
  wakeFlowAroundCell(c,r);
}

function noteMove(from,to,grid=null){
  if(grid&&grid.arrays&&Number.isFinite(grid.cols)){
    flowNoteMoveInGrid(grid,from,to);
    return;
  }
  const previous=moveHistory[from],backAndForth=previous===to;
  const fromRow=Math.floor(from/cols),toRow=Math.floor(to/cols),movedMat=material[to];
  moveHistory[to]=from;
  moveFlip[to]=backAndForth?Math.min(255,moveFlip[from]+1):0;
  if(fromRow===toRow&&isFlowMaterial(movedMat)){
    const dir=to>from?1:-1,lastDir=horizontalDir[from];
    horizontalDir[to]=dir;
    horizontalTurns[to]=lastDir&&lastDir!==dir?Math.min(255,horizontalTurns[from]+1):horizontalTurns[from];
  }else{
    horizontalDir[to]=0;
    horizontalTurns[to]=0;
  }
  if(fromRow!==toRow){
    escapeDir[to]=0;
    escapeTarget[to]=-1;
  }
  moveHistory[from]=-1;
  moveFlip[from]=0;
  horizontalDir[from]=0;
  horizontalTurns[from]=0;
  lastMoveTick[to]=simTick;
  lastMoveTick[from]=simTick;
}

function moveCell(from,to,grid=null){
  if(grid&&grid.arrays&&Number.isFinite(grid.cols)){
    flowMoveCellInGrid(grid,from,to);
    return;
  }
  const fromC=from%cols,fromR=Math.floor(from/cols),toC=to%cols,toR=Math.floor(to/cols);
  wakeFlowAroundCell(fromC,fromR);
  wakeFlowAroundCell(toC,toR);
  const movingMat=normalizeMaterialCell(from),oldMat=normalizeMaterialCell(to),oldMass=mass[to],oldVx=vx[to],oldVy=vy[to],oldFlowDir=flowDir[to],oldEscapeDir=escapeDir[to],oldEscapeTarget=escapeTarget[to],oldCarriedBy=carriedBy[to],oldCarriedTTL=carriedTTL[to],oldTintR=tintR[to],oldTintG=tintG[to],oldTintB=tintB[to],oldTintA=tintA[to];
  const movingCarriedBy=carriedBy[from],movingCarriedTTL=carriedTTL[from];
  material[to]=material[from];
  mass[to]=defaultMassForMaterial(movingMat);
  vx[to]=vx[from];
  vy[to]=vy[from];
  flowDir[to]=materialUsesDirectedFlow(movingMat)?(flowDir[from]||defaultFlowDirForMaterial(movingMat)):defaultFlowDirForMaterial(movingMat);
  escapeDir[to]=isFluidMaterial(movingMat)?escapeDir[from]:0;
  escapeTarget[to]=isFluidMaterial(movingMat)?escapeTarget[from]:-1;
  carriedBy[to]=materialCanBeCarried(movingMat)?movingCarriedBy:0;
  carriedTTL[to]=materialCanBeCarried(movingMat)?movingCarriedTTL:0;
  tintR[to]=tintR[from];
  tintG[to]=tintG[from];
  tintB[to]=tintB[from];
  tintA[to]=tintA[from];
  material[from]=oldMat;
  mass[from]=materialCarriesMass(oldMat)?oldMass:defaultMassForMaterial(oldMat);
  vx[from]=oldVx;
  vy[from]=oldVy;
  flowDir[from]=materialUsesDirectedFlow(oldMat)?(oldFlowDir||defaultFlowDirForMaterial(oldMat)):defaultFlowDirForMaterial(oldMat);
  escapeDir[from]=isFluidMaterial(oldMat)?oldEscapeDir:0;
  escapeTarget[from]=isFluidMaterial(oldMat)?oldEscapeTarget:-1;
  carriedBy[from]=materialCanBeCarried(oldMat)?oldCarriedBy:0;
  carriedTTL[from]=materialCanBeCarried(oldMat)?oldCarriedTTL:0;
  tintR[from]=oldTintR;
  tintG[from]=oldTintG;
  tintB[from]=oldTintB;
  tintA[from]=oldTintA;
  if(oldMat===EMPTY)clearParticleTint(from);
  noteMove(from,to);
  clearRestState(from);
  clearRestState(to);
  wakeFlowAroundCell(fromC,fromR);
  wakeFlowAroundCell(toC,toR);
}

// Local movement rules.
function tryMove(c,r,nc,nr,mat,grid=null){
  if(grid&&grid.arrays&&Number.isFinite(grid.cols))return flowTryMoveInGrid(grid,c,r,nc,nr,mat);
  const from=idx(c,r);
  if(material[from]!==mat)return false;
  if(!inBounds(nc,nr)){
    deleteCell(from);
    return true;
  }
  const to=idx(nc,nr);
  if(!canEnterCell(mat,to))return false;
  moveCell(from,to);
  return true;
}

function isSurfaceCell(c,r,mat,grid=null){
  if(grid&&grid.arrays&&Number.isFinite(grid.cols)){
    const a=grid.arrays;
    return flowGridInBounds(grid,c,r)&&a.material[flowGridIndex(grid,c,r)]===mat&&(!flowGridInBounds(grid,c,r-1)||a.material[flowGridIndex(grid,c,r-1)]!==mat);
  }
  return inBounds(c,r)&&material[idx(c,r)]===mat&&(!inBounds(c,r-1)||material[idx(c,r-1)]!==mat);
}

function columnSurfaceRow(c,mat,grid=null){
  if(grid&&grid.arrays&&Number.isFinite(grid.cols)){
    const a=grid.arrays;
    if(c<0||c>=grid.cols)return -1;
    for(let r=0;r<grid.rows;r++){
      if(a.material[flowGridIndex(grid,c,r)]===mat)return r;
    }
    return -1;
  }
  if(c<0||c>=cols)return -1;
  for(let r=0;r<rows;r++){
    if(material[idx(c,r)]===mat)return r;
  }
  return -1;
}

function columnLandingSurfaceRow(c,mat,grid=null){
  if(grid&&grid.arrays&&Number.isFinite(grid.cols)){
    const waterSurface=columnSurfaceRow(c,mat,grid);
    if(waterSurface>=0)return waterSurface;
    if(c<0||c>=grid.cols)return -1;
    for(let r=0;r<grid.rows;r++){
      const i=flowGridIndex(grid,c,r);
      if(!flowCanEnterCellInGrid(grid,mat,i))return r;
    }
    return grid.rows;
  }
  const waterSurface=columnSurfaceRow(c,mat);
  if(waterSurface>=0)return waterSurface;
  if(c<0||c>=cols)return -1;
  for(let r=0;r<rows;r++){
    const i=idx(c,r);
    if(!canEnterCell(mat,i))return r;
  }
  return rows;
}

function localLandingSurfaceRow(c,fromR,mat,grid=null){
  if(grid&&grid.arrays&&Number.isFinite(grid.cols)){
    const a=grid.arrays;
    if(c<0||c>=grid.cols)return -1;
    for(let r=clamp(fromR,0,grid.rows-1);r<grid.rows;r++){
      const i=flowGridIndex(grid,c,r);
      if(a.material[i]===mat)return r;
      if(!flowCanEnterCellInGrid(grid,mat,i))return r;
    }
    return grid.rows;
  }
  if(c<0||c>=cols)return -1;
  for(let r=clamp(fromR,0,rows-1);r<rows;r++){
    const i=idx(c,r);
    if(material[i]===mat)return r;
    if(!canEnterCell(mat,i))return r;
  }
  return rows;
}

function slopeSurfaceRow(c,fromR,mat,rule,grid=null){
  return rule.localSlopeSurface?localLandingSurfaceRow(c,fromR,mat,grid):columnLandingSurfaceRow(c,mat,grid);
}

function slopeTargetRow(c,r,nc,mat,rule,grid=null){
  return rule.columnSlopePlacement?columnPlacementRow(nc,r,mat,grid):r;
}

function columnPlacementRow(c,fromR,mat,grid=null){
  if(grid&&grid.arrays&&Number.isFinite(grid.cols)){
    const surface=columnLandingSurfaceRow(c,mat,grid);
    if(surface<=fromR||surface>=grid.rows)return -1;
    const targetR=surface-1,target=flowGridIndex(grid,c,targetR);
    if(!flowCanEnterCellInGrid(grid,mat,target))return -1;
    for(let r=fromR;r<=targetR;r++){
      if(!flowCanEnterCellInGrid(grid,mat,flowGridIndex(grid,c,r)))return -1;
    }
    return targetR;
  }
  const surface=columnLandingSurfaceRow(c,mat);
  if(surface<=fromR||surface>=rows)return -1;
  const targetR=surface-1,target=idx(c,targetR);
  if(!canEnterCell(mat,target))return -1;
  for(let r=fromR;r<=targetR;r++){
    if(!canEnterCell(mat,idx(c,r)))return -1;
  }
  return targetR;
}

function orderedSides(c,r,grid=null){
  const tick=grid&&Number.isFinite(grid.simTick)?grid.simTick:simTick;
  return ((c+r+tick)&1)?[1,-1]:[-1,1];
}

function preferredSides(c,r,mat,rule=FLOW_RULES[mat],grid=null){
  if(!materialUsesDirectedFlow(mat)||rule.persistentDirection===false)return orderedSides(c,r,grid);
  if(grid&&grid.arrays&&Number.isFinite(grid.cols)){
    const a=grid.arrays,i=flowGridIndex(grid,c,r),dir=a.flowDir[i]||randDir();
    a.flowDir[i]=dir;
    return[dir,-dir];
  }
  const i=idx(c,r),dir=flowDir[i]||randDir();
  flowDir[i]=dir;
  return[dir,-dir];
}

function tryMoveWithDirection(c,r,nc,nr,mat,dir,grid=null){
  if(grid&&grid.arrays&&Number.isFinite(grid.cols)){
    const from=flowGridIndex(grid,c,r);
    if(materialUsesDirectedFlow(mat))grid.arrays.flowDir[from]=dir<0?-1:1;
    return tryMove(c,r,nc,nr,mat,grid);
  }
  const from=idx(c,r);
  if(materialUsesDirectedFlow(mat))flowDir[from]=dir<0?-1:1;
  return tryMove(c,r,nc,nr,mat);
}

function canSlideFromSlopeBoundary(c,r,mat,rule,dir,grid=null){
  if(isSurfaceCell(c,r,mat,grid))return true;
  if(!rule.slideFromExposedSide)return false;
  const nc=c+dir;
  if(grid&&grid.arrays&&Number.isFinite(grid.cols)){
    return flowGridInBounds(grid,nc,r)&&flowCanEnterCellInGrid(grid,mat,flowGridIndex(grid,nc,r));
  }
  return inBounds(nc,r)&&canEnterCell(mat,idx(nc,r));
}

function canGravitySlideBySlope(c,r,mat,rule,dir,grid=null){
  if(!rule.slideRequiresSlope)return true;
  if(!canSlideFromSlopeBoundary(c,r,mat,rule,dir,grid))return false;
  const nc=c+dir;
  if(grid&&grid.arrays&&Number.isFinite(grid.cols)){
    if(nc<0||nc>=grid.cols)return true;
    const targetSurface=slopeSurfaceRow(nc,r,mat,rule,grid);
    return targetSurface-r>allowedSlopeDiff(rule,1);
  }
  if(nc<0||nc>=cols)return true;
  const targetSurface=slopeSurfaceRow(nc,r,mat,rule);
  return targetSurface-r>allowedSlopeDiff(rule,1);
}

function tryGravity(c,r,mat,rule,grid=null){
  if(grid&&grid.arrays&&Number.isFinite(grid.cols)){
    const a=grid.arrays,i=flowGridIndex(grid,c,r);
    a.vy[i]=Math.min(5,a.vy[i]+rule.gravity);
    if(tryMove(c,r,c,r+1,mat,grid))return true;
    if(!rule.slides)return false;
    const sides=preferredSides(c,r,mat,rule,grid);
    return (canGravitySlideBySlope(c,r,mat,rule,sides[0],grid)&&tryMoveWithDirection(c,r,c+sides[0],r+1,mat,sides[0],grid))
      ||(canGravitySlideBySlope(c,r,mat,rule,sides[1],grid)&&tryMoveWithDirection(c,r,c+sides[1],r+1,mat,sides[1],grid));
  }
  const i=idx(c,r);
  vy[i]=Math.min(5,vy[i]+rule.gravity);
  if(tryMove(c,r,c,r+1,mat))return true;
  if(!rule.slides)return false;
  const sides=preferredSides(c,r,mat,rule);
  return (canGravitySlideBySlope(c,r,mat,rule,sides[0])&&tryMoveWithDirection(c,r,c+sides[0],r+1,mat,sides[0]))
    ||(canGravitySlideBySlope(c,r,mat,rule,sides[1])&&tryMoveWithDirection(c,r,c+sides[1],r+1,mat,sides[1]));
}

function canDropFrom(c,r,mat,grid=null){
  const targets=[[c,r+1],[c-1,r+1],[c+1,r+1]];
  for(const [nc,nr]of targets){
    if(grid&&grid.arrays&&Number.isFinite(grid.cols)){
      if(!flowGridInBounds(grid,nc,nr))return true;
      if(flowCanEnterCellInGrid(grid,mat,flowGridIndex(grid,nc,nr)))return true;
      continue;
    }
    if(!inBounds(nc,nr))return true;
    if(canEnterCell(mat,idx(nc,nr)))return true;
  }
  return false;
}

function canScanEscapeThrough(c,r,mat,grid=null){
  if(grid&&grid.arrays&&Number.isFinite(grid.cols)){
    if(!flowGridInBounds(grid,c,r))return true;
    const a=grid.arrays,i=flowGridIndex(grid,c,r);
    if(flowIsBlockedCellInGrid(grid,i))return false;
    const target=a.material[i];
    return target===EMPTY||target===mat||materialDensity(mat)>materialDensity(target);
  }
  if(!inBounds(c,r))return true;
  const i=idx(c,r);
  if(isBlockedCell(i))return false;
  const target=material[i];
  return target===EMPTY||target===mat||materialDensity(mat)>materialDensity(target);
}

function scanDropEscapeSide(c,r,mat,dir,limit,grid=null){
  for(let d=1;d<=limit;d++){
    const nc=c+dir*d;
    if(grid&&grid.arrays&&Number.isFinite(grid.cols)){
      if(!flowGridInBounds(grid,nc,r))return{dir,targetC:clamp(nc,0,grid.cols-1),distance:d};
      if(!canScanEscapeThrough(nc,r,mat,grid))return null;
      if(canDropFrom(nc,r,mat,grid))return{dir,targetC:nc,distance:d};
      continue;
    }
    if(!inBounds(nc,r))return{dir,targetC:clamp(nc,0,cols-1),distance:d};
    if(!canScanEscapeThrough(nc,r,mat))return null;
    if(canDropFrom(nc,r,mat))return{dir,targetC:nc,distance:d};
  }
  return null;
}

function findDropEscape(c,r,mat,rule,grid=null){
  const limit=rule.escapeScanDistance||0;
  if(limit<=0)return null;
  const left=scanDropEscapeSide(c,r,mat,-1,limit,grid),right=scanDropEscapeSide(c,r,mat,1,limit,grid);
  if(left&&right){
    if(left.distance!==right.distance)return left.distance<right.distance?left:right;
    return randDir()<0?left:right;
  }
  return left||right;
}

function isIsolatedSurfaceCell(c,r,mat,grid=null){
  if(grid&&grid.arrays&&Number.isFinite(grid.cols)){
    const a=grid.arrays;
    return isFluidMaterial(mat)&&isSurfaceCell(c,r,mat,grid)
      &&(!flowGridInBounds(grid,c-1,r)||a.material[flowGridIndex(grid,c-1,r)]!==mat)
      &&(!flowGridInBounds(grid,c+1,r)||a.material[flowGridIndex(grid,c+1,r)]!==mat)
      &&!canDropFrom(c,r,mat,grid);
  }
  return isFluidMaterial(mat)&&isSurfaceCell(c,r,mat)
    &&(!inBounds(c-1,r)||material[idx(c-1,r)]!==mat)
    &&(!inBounds(c+1,r)||material[idx(c+1,r)]!==mat)
    &&!canDropFrom(c,r,mat);
}

function horizontalEnterDir(c,r,mat,dir,grid=null){
  const nc=c+dir;
  if(grid&&grid.arrays&&Number.isFinite(grid.cols)){
    return flowGridInBounds(grid,nc,r)&&flowCanEnterCellInGrid(grid,mat,flowGridIndex(grid,nc,r));
  }
  return inBounds(nc,r)&&canEnterCell(mat,idx(nc,r));
}

function chooseSinglePixelWanderDir(c,r,mat,preferredDir=0,grid=null){
  const preferred=preferredDir<0?-1:preferredDir>0?1:0;
  if(preferred&&horizontalEnterDir(c,r,mat,preferred,grid))return preferred;
  const left=horizontalEnterDir(c,r,mat,-1,grid),right=horizontalEnterDir(c,r,mat,1,grid);
  if(left&&right)return randDir();
  if(left)return -1;
  if(right)return 1;
  return 0;
}

function armSinglePixelWander(c,r,mat,grid=null){
  if(grid&&grid.arrays&&Number.isFinite(grid.cols)){
    const a=grid.arrays,i=flowGridIndex(grid,c,r);
    const dir=chooseSinglePixelWanderDir(c,r,mat,a.escapeDir[i]||randDir(),grid);
    if(!dir){
      flowDeleteCellInGrid(grid,i);
      return true;
    }
    a.escapeDir[i]=dir;
    a.flowDir[i]=dir;
    return true;
  }
  const i=idx(c,r);
  const dir=chooseSinglePixelWanderDir(c,r,mat,escapeDir[i]||randDir());
  if(!dir){
    deleteCell(i);
    return true;
  }
  escapeDir[i]=dir;
  flowDir[i]=dir;
  return true;
}

function tryEscapeMove(c,r,mat,rule,grid=null){
  if(!rule.escapeScanDistance)return false;
  if(grid&&grid.arrays&&Number.isFinite(grid.cols)){
    const a=grid.arrays,i=flowGridIndex(grid,c,r);
    if(a.escapeTarget[i]<0){
      a.escapeDir[i]=0;
      return false;
    }
    if(!isSurfaceCell(c,r,mat,grid)){
      a.escapeDir[i]=0;
      a.escapeTarget[i]=-1;
      return false;
    }
    let targetC=a.escapeTarget[i],dir=Math.sign(targetC-c)||a.escapeDir[i];
    if(targetC>=0&&targetC<grid.cols&&!canDropFrom(targetC,r,mat,grid)){
      const next=findDropEscape(c,r,mat,rule,grid);
      if(!next){
        a.escapeDir[i]=0;
        a.escapeTarget[i]=-1;
        return false;
      }
      targetC=next.targetC;
      dir=next.dir;
    }
    if(!dir){
      a.escapeDir[i]=0;
      a.escapeTarget[i]=-1;
      return false;
    }
    if(c===targetC){
      a.escapeDir[i]=0;
      a.escapeTarget[i]=-1;
      return false;
    }
    let nc=c+dir;
    if(flowGridInBounds(grid,nc,r)&&!flowCanEnterCellInGrid(grid,mat,flowGridIndex(grid,nc,r))){
      const next=findDropEscape(c,r,mat,rule,grid);
      if(!next){
        a.escapeDir[i]=0;
        a.escapeTarget[i]=-1;
        return false;
      }
      targetC=next.targetC;
      dir=next.dir;
      nc=c+dir;
      if(flowGridInBounds(grid,nc,r)&&!flowCanEnterCellInGrid(grid,mat,flowGridIndex(grid,nc,r))){
        a.escapeDir[i]=0;
        a.escapeTarget[i]=-1;
        return false;
      }
    }
    a.escapeDir[i]=dir;
    a.escapeTarget[i]=targetC;
    return tryMoveWithDirection(c,r,nc,r,mat,dir,grid);
  }
  const i=idx(c,r);
  if(escapeTarget[i]<0){
    escapeDir[i]=0;
    return false;
  }
  if(!isSurfaceCell(c,r,mat)){
    escapeDir[i]=0;
    escapeTarget[i]=-1;
    return false;
  }
  let targetC=escapeTarget[i],dir=Math.sign(targetC-c)||escapeDir[i];
  if(targetC>=0&&targetC<cols&&!canDropFrom(targetC,r,mat)){
    const next=findDropEscape(c,r,mat,rule);
    if(!next){
      escapeDir[i]=0;
      escapeTarget[i]=-1;
      return false;
    }
    targetC=next.targetC;
    dir=next.dir;
  }
  if(!dir){
    escapeDir[i]=0;
    escapeTarget[i]=-1;
    return false;
  }
  if(c===targetC){
    escapeDir[i]=0;
    escapeTarget[i]=-1;
    return false;
  }
  let nc=c+dir;
  if(inBounds(nc,r)&&!canEnterCell(mat,idx(nc,r))){
    const next=findDropEscape(c,r,mat,rule);
    if(!next){
      escapeDir[i]=0;
      escapeTarget[i]=-1;
      return false;
    }
    targetC=next.targetC;
    dir=next.dir;
    nc=c+dir;
    if(inBounds(nc,r)&&!canEnterCell(mat,idx(nc,r))){
      escapeDir[i]=0;
      escapeTarget[i]=-1;
      return false;
    }
  }
  escapeDir[i]=dir;
  escapeTarget[i]=targetC;
  return tryMoveWithDirection(c,r,nc,r,mat,dir);
}

function trySinglePixelWanderMove(c,r,mat,rule,grid=null){
  if(!rule.escapeScanDistance)return false;
  if(grid&&grid.arrays&&Number.isFinite(grid.cols)){
    const a=grid.arrays,i=flowGridIndex(grid,c,r);
    if(a.escapeTarget[i]>=0||!a.escapeDir[i])return false;
    if(!isIsolatedSurfaceCell(c,r,mat,grid)){
      a.escapeDir[i]=0;
      return false;
    }
    const escape=findDropEscape(c,r,mat,rule,grid);
    if(escape){
      a.escapeDir[i]=escape.dir;
      a.escapeTarget[i]=escape.targetC;
      return tryEscapeMove(c,r,mat,rule,grid);
    }
    const dir=a.escapeDir[i]<0?-1:1;
    if(!horizontalEnterDir(c,r,mat,dir,grid)){
      flowDeleteCellInGrid(grid,i);
      return true;
    }
    a.escapeDir[i]=dir;
    a.flowDir[i]=dir;
    return tryMoveWithDirection(c,r,c+dir,r,mat,dir,grid);
  }
  const i=idx(c,r);
  if(escapeTarget[i]>=0||!escapeDir[i])return false;
  if(!isIsolatedSurfaceCell(c,r,mat)){
    escapeDir[i]=0;
    return false;
  }
  const escape=findDropEscape(c,r,mat,rule);
  if(escape){
    escapeDir[i]=escape.dir;
    escapeTarget[i]=escape.targetC;
    return tryEscapeMove(c,r,mat,rule);
  }
  const dir=escapeDir[i]<0?-1:1;
  if(!horizontalEnterDir(c,r,mat,dir)){
    deleteCell(i);
    return true;
  }
  escapeDir[i]=dir;
  flowDir[i]=dir;
  return tryMoveWithDirection(c,r,c+dir,r,mat,dir);
}

function tryArmIsolatedSurfaceEscape(c,r,mat,rule,grid=null){
  if(!rule.escapeScanDistance||!isFluidMaterial(mat))return false;
  if(grid&&grid.arrays&&Number.isFinite(grid.cols)){
    const a=grid.arrays,i=flowGridIndex(grid,c,r);
    if(a.escapeTarget[i]>=0||!isIsolatedSurfaceCell(c,r,mat,grid))return false;
    const escape=findDropEscape(c,r,mat,rule,grid);
    if(!escape)return false;
    a.escapeDir[i]=escape.dir;
    a.escapeTarget[i]=escape.targetC;
    return tryEscapeMove(c,r,mat,rule,grid);
  }
  const i=idx(c,r);
  if(escapeTarget[i]>=0||!isIsolatedSurfaceCell(c,r,mat))return false;
  const escape=findDropEscape(c,r,mat,rule);
  if(!escape)return false;
  escapeDir[i]=escape.dir;
  escapeTarget[i]=escape.targetC;
  return tryEscapeMove(c,r,mat,rule);
}

function allowedSlopeDiff(rule,distance){
  if(rule.slopeRun)return Math.floor(distance*(rule.slopeRise||1)/rule.slopeRun);
  return rule.maxSlope;
}

function trySlopeRelax(c,r,mat,rule,grid=null){
  if(!isSurfaceCell(c,r,mat,grid))return false;
  const sides=preferredSides(c,r,mat,rule,grid);
  const lookahead=rule.slopeLookahead||1;
  let bestDc=0,bestR=r,bestExcess=0,bestDiff=0;
  for(const dc of sides){
    for(let distance=1;distance<=lookahead;distance++){
      const nc=c+dc*distance;
      if(grid&&grid.arrays&&Number.isFinite(grid.cols)){
        if(nc<0||nc>=grid.cols)break;
        const targetSurface=slopeSurfaceRow(nc,r,mat,rule,grid);
        const heightDiff=targetSurface-r;
        const excess=heightDiff-allowedSlopeDiff(rule,distance);
        if(excess<=bestExcess)continue;
        const stepC=c+dc;
        const targetR=slopeTargetRow(c,r,nc,mat,rule,grid);
        if(targetR<0||!flowGridInBounds(grid,stepC,targetR))continue;
        if(!flowCanEnterCellInGrid(grid,mat,flowGridIndex(grid,stepC,targetR)))continue;
        bestExcess=excess;
        bestDiff=heightDiff;
        bestDc=dc;
        bestR=targetR;
        continue;
      }
      if(nc<0||nc>=cols)break;
      const targetSurface=slopeSurfaceRow(nc,r,mat,rule);
      const heightDiff=targetSurface-r;
      const excess=heightDiff-allowedSlopeDiff(rule,distance);
      if(excess<=bestExcess)continue;
      const stepC=c+dc;
      const targetR=slopeTargetRow(c,r,nc,mat,rule);
      if(targetR<0||!inBounds(stepC,targetR))continue;
      if(!canEnterCell(mat,idx(stepC,targetR)))continue;
      bestExcess=excess;
      bestDiff=heightDiff;
      bestDc=dc;
      bestR=targetR;
    }
  }
  if(!bestDc)return false;
  return tryMoveWithDirection(c,r,c+bestDc,bestR,mat,bestDc,grid);
}

function waterSurfaceLevelPass(grid=null){
  if(flowGridHasArrays(grid)){
    const a=grid.arrays,gridCols=grid.cols,gridRows=grid.rows,gridTick=normalizeSimTick(grid.simTick);
    for(let r=0;r<gridRows;r++){
      const start=((r+gridTick)&1)?gridCols-1:0,end=start? -1:gridCols,step=start? -1:1;
      for(let c=start;c!==end;c+=step){
        const i=flowGridIndex(grid,c,r);
        if(a.material[i]!==WATER||a.stableMask[i]||!isSurfaceCell(c,r,WATER,grid))continue;
        let bestDc=0,bestR=r,bestDiff=0;
        for(const dc of preferredSides(c,r,WATER,FLOW_RULES[WATER],grid)){
          const nc=c+dc;
          if(nc<0||nc>=gridCols)continue;
          const targetSurface=columnLandingSurfaceRow(nc,WATER,grid);
          const diff=targetSurface-r;
          if(diff<=bestDiff)continue;
          const targetR=columnPlacementRow(nc,r,WATER,grid);
          if(targetR<0)continue;
          bestDiff=diff;
          bestDc=dc;
          bestR=targetR;
        }
        if(bestDc)tryMoveWithDirection(c,r,c+bestDc,bestR,WATER,bestDc,grid);
      }
    }
    return;
  }
  for(let r=0;r<rows;r++){
    const start=((r+simTick)&1)?cols-1:0,end=start? -1:cols,step=start? -1:1;
    for(let c=start;c!==end;c+=step){
      const i=idx(c,r);
      if(material[i]!==WATER||stableMask[i]||!isSurfaceCell(c,r,WATER))continue;
      let bestDc=0,bestR=r,bestDiff=0;
      for(const dc of preferredSides(c,r,WATER)){
        const nc=c+dc;
        if(nc<0||nc>=cols)continue;
        const targetSurface=columnLandingSurfaceRow(nc,WATER);
        const diff=targetSurface-r;
        if(diff<=bestDiff)continue;
        const targetR=columnPlacementRow(nc,r,WATER);
        if(targetR<0)continue;
        bestDiff=diff;
        bestDc=dc;
        bestR=targetR;
      }
      if(bestDc)tryMoveWithDirection(c,r,c+bestDc,bestR,WATER,bestDc);
    }
  }
}

function tryVelocityMove(c,r,mat,grid=null){
  if(grid&&grid.arrays&&Number.isFinite(grid.cols)){
    const a=grid.arrays,i=flowGridIndex(grid,c,r),ax=Math.abs(a.vx[i]),ay=Math.abs(a.vy[i]);
    if(ax<.32&&ay<.32)return false;
    if(ax>=ay&&tryMove(c,r,c+Math.sign(a.vx[i]),r,mat,grid))return true;
    if(ay>ax&&tryMove(c,r,c,r+Math.sign(a.vy[i]),mat,grid))return true;
    return false;
  }
  const i=idx(c,r),ax=Math.abs(vx[i]),ay=Math.abs(vy[i]);
  if(ax<.32&&ay<.32)return false;
  if(ax>=ay&&tryMove(c,r,c+Math.sign(vx[i]),r,mat))return true;
  if(ay>ax&&tryMove(c,r,c,r+Math.sign(vy[i]),mat))return true;
  return false;
}

function canMoveToCandidate(mat,nc,nr,grid=null){
  if(grid&&grid.arrays&&Number.isFinite(grid.cols)){
    if(!flowGridInBounds(grid,nc,nr))return true;
    return flowCanEnterCellInGrid(grid,mat,flowGridIndex(grid,nc,nr));
  }
  if(!inBounds(nc,nr))return true;
  return canEnterCell(mat,idx(nc,nr));
}

function hasGravityCandidate(c,r,mat,rule,grid=null){
  if(canMoveToCandidate(mat,c,r+1,grid))return true;
  if(!rule.slides)return false;
  for(const dc of[-1,1]){
    if(canGravitySlideBySlope(c,r,mat,rule,dc,grid)&&canMoveToCandidate(mat,c+dc,r+1,grid))return true;
  }
  return false;
}

function hasSlopeCandidate(c,r,mat,rule,grid=null){
  if(!isSurfaceCell(c,r,mat,grid))return false;
  for(const dc of[-1,1]){
    const lookahead=rule.slopeLookahead||1;
    for(let distance=1;distance<=lookahead;distance++){
      const nc=c+dc*distance;
      if(grid&&grid.arrays&&Number.isFinite(grid.cols)){
        if(nc<0||nc>=grid.cols)break;
        const targetSurface=slopeSurfaceRow(nc,r,mat,rule,grid),heightDiff=targetSurface-r;
        if(heightDiff<=allowedSlopeDiff(rule,distance))continue;
        if(rule.columnSlopePlacement){
          if(columnPlacementRow(nc,r,mat,grid)>=0)return true;
        }else if(flowCanEnterCellInGrid(grid,mat,flowGridIndex(grid,c+dc,r))){
          return true;
        }
        continue;
      }
      if(nc<0||nc>=cols)break;
      const targetSurface=slopeSurfaceRow(nc,r,mat,rule),heightDiff=targetSurface-r;
      if(heightDiff<=allowedSlopeDiff(rule,distance))continue;
      if(rule.columnSlopePlacement){
        if(columnPlacementRow(nc,r,mat)>=0)return true;
      }else if(canEnterCell(mat,idx(c+dc,r))){
        return true;
      }
    }
  }
  return false;
}

function hasVelocityCandidate(c,r,mat,grid=null){
  if(grid&&grid.arrays&&Number.isFinite(grid.cols)){
    const a=grid.arrays,i=flowGridIndex(grid,c,r),ax=Math.abs(a.vx[i]),ay=Math.abs(a.vy[i]);
    if(ax<STABLE_SPEED&&ay<STABLE_SPEED)return false;
    if(ax>=ay&&canMoveToCandidate(mat,c+Math.sign(a.vx[i]),r,grid))return true;
    if(ay>ax&&canMoveToCandidate(mat,c,r+Math.sign(a.vy[i]),grid))return true;
    return true;
  }
  const i=idx(c,r),ax=Math.abs(vx[i]),ay=Math.abs(vy[i]);
  if(ax<STABLE_SPEED&&ay<STABLE_SPEED)return false;
  if(ax>=ay&&canMoveToCandidate(mat,c+Math.sign(vx[i]),r))return true;
  if(ay>ax&&canMoveToCandidate(mat,c,r+Math.sign(vy[i])))return true;
  return true;
}

function flowCellHasPotentialAction(c,r,mat,grid=null){
  if(grid&&grid.arrays&&Number.isFinite(grid.cols)){
    const i=flowGridIndex(grid,c,r);
    if(grid.arrays.material[i]!==mat)return false;
    const rule=FLOW_RULES[mat];
    return hasVelocityCandidate(c,r,mat,grid)||hasGravityCandidate(c,r,mat,rule,grid)||hasSlopeCandidate(c,r,mat,rule,grid);
  }
  const i=idx(c,r);
  if(material[i]!==mat)return false;
  const rule=FLOW_RULES[mat];
  return hasVelocityCandidate(c,r,mat)||hasGravityCandidate(c,r,mat,rule)||hasSlopeCandidate(c,r,mat,rule);
}

function canWaterSleepAt(i,grid=null){
  if(grid&&grid.arrays&&Number.isFinite(grid.cols)){
    const a=grid.arrays;
    return a.material[i]===WATER&&a.waterBasinMark[i]&&!a.waterSleepBlockMark[i];
  }
  return material[i]===WATER&&waterBasinMark[i]&&!waterSleepBlockMark[i];
}

function updateMaterialStability(grid=null){
  if(grid&&grid.arrays&&Number.isFinite(grid.cols)){
    const a=grid.arrays;
    for(let i=0;i<grid.count;i++){
      const mat=a.material[i];
      if(!isFlowMaterial(mat)){
        flowClearRestStateInGrid(grid,i);
        continue;
      }
      const rule=FLOW_RULES[mat];
      if(mat===WATER&&rule.requiresBasinSleep!==false&&!canWaterSleepAt(i,grid)){
        flowClearRestStateInGrid(grid,i);
        continue;
      }
      if(a.carriedBy[i]){
        flowClearRestStateInGrid(grid,i);
        continue;
      }
      if(a.stableMask[i]){
        a.vx[i]=0;
        a.vy[i]=0;
        const c=i%grid.cols,r=Math.floor(i/grid.cols);
        if(hasGravityCandidate(c,r,mat,rule,grid)||hasSlopeCandidate(c,r,mat,rule,grid)){
          flowClearRestStateInGrid(grid,i);
        }
        continue;
      }
      const c=i%grid.cols,r=Math.floor(i/grid.cols);
      if(flowCellHasPotentialAction(c,r,mat,grid)){
        flowClearRestStateInGrid(grid,i);
        continue;
      }
      a.vx[i]*=rule.drag;
      a.vy[i]*=rule.drag;
      if(Math.abs(a.vx[i])<STABLE_SPEED)a.vx[i]=0;
      if(Math.abs(a.vy[i])<STABLE_SPEED)a.vy[i]=0;
      a.restAge[i]=Math.min(255,a.restAge[i]+1);
      if(a.restAge[i]>=STABLE_FRAMES[mat]){
        a.stableMask[i]=1;
        a.vx[i]=0;
        a.vy[i]=0;
      }
    }
    return;
  }
  for(let i=0;i<count;i++){
    const mat=material[i];
    if(!isFlowMaterial(mat)){
      clearRestState(i);
      continue;
    }
    const rule=FLOW_RULES[mat];
    if(mat===WATER&&rule.requiresBasinSleep!==false&&!canWaterSleepAt(i)){
      clearRestState(i);
      continue;
    }
    if(carriedBy[i]){
      clearRestState(i);
      continue;
    }
    if(stableMask[i]){
      vx[i]=0;
      vy[i]=0;
      const c=i%cols,r=Math.floor(i/cols);
      // Sleep is a cache, not a physical constraint. A falling pile can settle
      // in an order where a few surface cells still have a valid slope move;
      // wake those cells here so editing is not the only way to re-check them.
      if(hasGravityCandidate(c,r,mat,rule)||hasSlopeCandidate(c,r,mat,rule)){
        clearRestState(i);
      }
      continue;
    }
    const c=i%cols,r=Math.floor(i/cols);
    if(flowCellHasPotentialAction(c,r,mat)){
      clearRestState(i);
      continue;
    }
    vx[i]*=rule.drag;
    vy[i]*=rule.drag;
    if(Math.abs(vx[i])<STABLE_SPEED)vx[i]=0;
    if(Math.abs(vy[i])<STABLE_SPEED)vy[i]=0;
    restAge[i]=Math.min(255,restAge[i]+1);
    if(restAge[i]>=STABLE_FRAMES[mat]){
      stableMask[i]=1;
      vx[i]=0;
      vy[i]=0;
    }
  }
}

function deleteOscillatingCells(grid=null){
  if(grid&&grid.arrays&&Number.isFinite(grid.cols)){
    const a=grid.arrays;
    for(let i=0;i<grid.count;i++){
      const mat=a.material[i],previous=a.moveHistory[i];
      if(!isFlowMaterial(mat))continue;
      const rule=FLOW_RULES[mat];
      if(!rule.deleteWhenUnstable||previous<0)continue;
      const c=i%grid.cols,r=Math.floor(i/grid.cols);
      if(Math.floor(previous/grid.cols)!==r)continue;
      if(rule.escapeScanDistance&&a.escapeTarget[i]>=0)continue;
      const isolatedTurnJitter=rule.singlePixelTurnThreshold
        && a.horizontalTurns[i]>rule.singlePixelTurnThreshold
        && isIsolatedSurfaceCell(c,r,mat,grid);
      if(rule.escapeScanDistance&&a.escapeTarget[i]<0&&(a.moveFlip[i]>=rule.escapeTriggerFrames||isolatedTurnJitter)){
        if(!isSurfaceCell(c,r,mat,grid))continue;
        const escape=findDropEscape(c,r,mat,rule,grid);
        if(escape){
          a.escapeDir[i]=escape.dir;
          a.escapeTarget[i]=escape.targetC;
        }else if(isIsolatedSurfaceCell(c,r,mat,grid)){
          armSinglePixelWander(c,r,mat,grid);
        }else{
          flowDeleteCellInGrid(grid,i);
        }
        continue;
      }
      if(a.moveFlip[i]<rule.unstableFrames)continue;
      flowDeleteCellInGrid(grid,i);
    }
    return;
  }
  for(let i=0;i<count;i++){
    const mat=material[i],previous=moveHistory[i];
    if(!isFlowMaterial(mat))continue;
    const rule=FLOW_RULES[mat];
    if(!rule.deleteWhenUnstable||previous<0)continue;
    const c=i%cols,r=Math.floor(i/cols);
    if(Math.floor(previous/cols)!==r)continue;
    if(rule.escapeScanDistance&&escapeTarget[i]>=0)continue;
    const isolatedTurnJitter=rule.singlePixelTurnThreshold
      && horizontalTurns[i]>rule.singlePixelTurnThreshold
      && isIsolatedSurfaceCell(c,r,mat);
    if(rule.escapeScanDistance&&escapeTarget[i]<0&&(moveFlip[i]>=rule.escapeTriggerFrames||isolatedTurnJitter)){
      if(!isSurfaceCell(c,r,mat))continue;
      const escape=findDropEscape(c,r,mat,rule);
      if(escape){
        escapeDir[i]=escape.dir;
        escapeTarget[i]=escape.targetC;
      }else if(isIsolatedSurfaceCell(c,r,mat)){
        armSinglePixelWander(c,r,mat);
      }else{
        deleteCell(i);
      }
      continue;
    }
    if(moveFlip[i]<rule.unstableFrames)continue;
    deleteCell(i);
  }
}

// Water gets one extra basin pass: local particles move first, then each visible
// water body is re-packed into the lowest reachable cells below its current surface.
function nextWaterSpaceToken(){
  waterSpaceToken++;
  if(waterSpaceToken>65000){
    waterSpaceMark.fill(0);
    waterSpaceToken=1;
  }
  return waterSpaceToken;
}

function nextWaterSpaceTokenForGrid(grid){
  if(!flowGridHasArrays(grid))return nextWaterSpaceToken();
  const tokens=grid.tokens||(grid.tokens={});
  tokens.waterSpaceToken=(tokens.waterSpaceToken||1)+1;
  if(tokens.waterSpaceToken>65000){
    grid.arrays.waterSpaceMark.fill(0);
    tokens.waterSpaceToken=1;
  }
  return tokens.waterSpaceToken;
}

function nextWaterComponentToken(){
  waterComponentToken++;
  if(waterComponentToken>65000){
    waterComponentMark.fill(0);
    waterComponentToken=1;
  }
  return waterComponentToken;
}

function nextWaterComponentTokenForGrid(grid){
  if(!flowGridHasArrays(grid))return nextWaterComponentToken();
  const tokens=grid.tokens||(grid.tokens={});
  tokens.waterComponentToken=(tokens.waterComponentToken||1)+1;
  if(tokens.waterComponentToken>65000){
    grid.arrays.waterComponentMark.fill(0);
    tokens.waterComponentToken=1;
  }
  return tokens.waterComponentToken;
}

function nextWaterBasinToken(){
  waterBasinToken++;
  if(waterBasinToken>65000){
    waterBasinMark.fill(0);
    waterBasinToken=1;
  }
  return waterBasinToken;
}

function nextWaterBasinTokenForGrid(grid){
  if(!flowGridHasArrays(grid))return nextWaterBasinToken();
  const tokens=grid.tokens||(grid.tokens={});
  tokens.waterBasinToken=(tokens.waterBasinToken||1)+1;
  if(tokens.waterBasinToken>65000){
    grid.arrays.waterBasinMark.fill(0);
    tokens.waterBasinToken=1;
  }
  return tokens.waterBasinToken;
}

function nextWaterTargetToken(){
  waterTargetToken++;
  if(waterTargetToken>65000){
    waterTargetMark.fill(0);
    waterTargetToken=1;
  }
  return waterTargetToken;
}

function nextWaterTargetTokenForGrid(grid){
  if(!flowGridHasArrays(grid))return nextWaterTargetToken();
  const tokens=grid.tokens||(grid.tokens={});
  tokens.waterTargetToken=(tokens.waterTargetToken||1)+1;
  if(tokens.waterTargetToken>65000){
    grid.arrays.waterTargetMark.fill(0);
    tokens.waterTargetToken=1;
  }
  return tokens.waterTargetToken;
}

function canWaterSettleThrough(i,componentToken,grid=null){
  if(flowGridHasArrays(grid)){
    const a=grid.arrays;
    return !flowIsBlockedCellInGrid(grid,i)&&(a.material[i]===EMPTY||a.waterComponentMark[i]===componentToken);
  }
  return !isBlockedCell(i)&&(material[i]===EMPTY||waterComponentMark[i]===componentToken);
}

function canReachWaterSettleCell(fromR,nr,ni,componentToken,grid=null){
  if(!canWaterSettleThrough(ni,componentToken,grid))return false;
  if(nr>=fromR)return true;
  if(flowGridHasArrays(grid))return grid.arrays.waterComponentMark[ni]===componentToken;
  return waterComponentMark[ni]===componentToken;
}

function waterSurfaceLimit(cells,grid=null){
  if(flowGridHasArrays(grid)){
    const a=grid.arrays,usedRows=[];
    for(const i of cells){
      const r=Math.floor(i/grid.cols);
      if(a.rowCounts[r]===0)usedRows.push(r);
      a.rowCounts[r]++;
    }
    const threshold=cells.length<80?1:Math.ceil(cells.length*.015);
    let acc=0,top=grid.rows-1;
    for(let r=0;r<grid.rows;r++){
      acc+=a.rowCounts[r];
      if(acc>=threshold){
        top=r;
        break;
      }
    }
    for(const r of usedRows)a.rowCounts[r]=0;
    return top;
  }
  // Split a water component into main body and tiny top residue. Residue is only
  // deleted later if every main basin is closed and successfully settled.
  const usedRows=[];
  for(const i of cells){
    const r=Math.floor(i/cols);
    if(rowCounts[r]===0)usedRows.push(r);
    rowCounts[r]++;
  }
  const threshold=cells.length<80?1:Math.ceil(cells.length*.015);
  let acc=0,top=rows-1;
  for(let r=0;r<rows;r++){
    acc+=rowCounts[r];
    if(acc>=threshold){
      top=r;
      break;
    }
  }
  for(const r of usedRows)rowCounts[r]=0;
  return top;
}

function collectWaterComponent(start,grid=null){
  if(flowGridHasArrays(grid)){
    const a=grid.arrays,cells=[];
    let head=0,tail=0;
    a.waterSeen[start]=1;
    a.waterQueue[tail++]=start;
    while(head<tail){
      const i=a.waterQueue[head++],c=i%grid.cols,r=Math.floor(i/grid.cols);
      cells.push(i);
      const ns=[i-1,i+1,i-grid.cols,i+grid.cols];
      for(const ni of ns){
        if(ni<0||ni>=grid.count||a.waterSeen[ni]||a.material[ni]!==WATER)continue;
        const nc=ni%grid.cols,nr=Math.floor(ni/grid.cols);
        if(Math.abs(nc-c)+Math.abs(nr-r)!==1)continue;
        a.waterSeen[ni]=1;
        a.waterQueue[tail++]=ni;
      }
    }
    return cells;
  }
  const cells=[];
  let head=0,tail=0;
  waterSeen[start]=1;
  waterQueue[tail++]=start;
  while(head<tail){
    const i=waterQueue[head++],c=i%cols,r=Math.floor(i/cols);
    cells.push(i);
    const ns=[i-1,i+1,i-cols,i+cols];
    for(const ni of ns){
      if(ni<0||ni>=count||waterSeen[ni]||material[ni]!==WATER)continue;
      const nc=ni%cols,nr=Math.floor(ni/cols);
      if(Math.abs(nc-c)+Math.abs(nr-r)!==1)continue;
      waterSeen[ni]=1;
      waterQueue[tail++]=ni;
    }
  }
  return cells;
}

function markReachableWaterSpace(start,topLimit,componentToken,basinToken,grid=null){
  if(flowGridHasArrays(grid)){
    const a=grid.arrays;
    const token=nextWaterSpaceTokenForGrid(grid),cells=[];
    let head=0,tail=0,touchesDrain=false,waterCount=0,sumC=0;
    a.waterSpaceMark[start]=token;
    a.waterBasinMark[start]=basinToken;
    a.waterQueue[tail++]=start;
    while(head<tail){
      const i=a.waterQueue[head++],c=i%grid.cols,r=Math.floor(i/grid.cols);
      cells.push(i);
      if(a.waterComponentMark[i]===componentToken&&a.material[i]===WATER){
        waterCount++;
        sumC+=c;
      }
      if(isDrainCell(c,r,grid))touchesDrain=true;
      const ns=[i-1,i+1,i-grid.cols,i+grid.cols];
      for(const ni of ns){
        if(ni<0||ni>=grid.count||a.waterBasinMark[ni]===basinToken)continue;
        const nc=ni%grid.cols,nr=Math.floor(ni/grid.cols);
        if(nr<topLimit||Math.abs(nc-c)+Math.abs(nr-r)!==1||!canReachWaterSettleCell(r,nr,ni,componentToken,grid))continue;
        a.waterSpaceMark[ni]=token;
        a.waterBasinMark[ni]=basinToken;
        a.waterQueue[tail++]=ni;
      }
    }
    return{token,cells,touchesDrain,waterCount,centerC:waterCount?sumC/waterCount:0};
  }
  // Flood-fill the empty/water cells reachable by one water component below the
  // surface limit. Upward movement is only allowed through existing component
  // water, which prevents the basin fill from leaking into open air.
  const token=nextWaterSpaceToken(),cells=[];
  let head=0,tail=0,touchesDrain=false,waterCount=0,sumC=0;
  waterSpaceMark[start]=token;
  waterBasinMark[start]=basinToken;
  waterQueue[tail++]=start;
  while(head<tail){
    const i=waterQueue[head++],c=i%cols,r=Math.floor(i/cols);
    cells.push(i);
    if(waterComponentMark[i]===componentToken&&material[i]===WATER){
      waterCount++;
      sumC+=c;
    }
    if(isDrainCell(c,r))touchesDrain=true;
    const ns=[i-1,i+1,i-cols,i+cols];
    for(const ni of ns){
      if(ni<0||ni>=count||waterBasinMark[ni]===basinToken)continue;
      const nc=ni%cols,nr=Math.floor(ni/cols);
      if(nr<topLimit||Math.abs(nc-c)+Math.abs(nr-r)!==1||!canReachWaterSettleCell(r,nr,ni,componentToken))continue;
      waterSpaceMark[ni]=token;
      waterBasinMark[ni]=basinToken;
      waterQueue[tail++]=ni;
    }
  }
  return{token,cells,touchesDrain,waterCount,centerC:waterCount?sumC/waterCount:0};
}

function isDrainCell(c,r,grid=null){
  if(flowGridHasArrays(grid))return r===grid.rows-1||c===0||c===grid.cols-1;
  return r===rows-1||c===0||c===cols-1;
}

function canUseSettledWaterSlot(i,spaceToken,componentToken,grid=null){
  if(flowGridHasArrays(grid)){
    const a=grid.arrays;
    return a.waterSpaceMark[i]===spaceToken&&!flowIsBlockedCellInGrid(grid,i)&&(a.material[i]===EMPTY||a.waterComponentMark[i]===componentToken);
  }
  return waterSpaceMark[i]===spaceToken&&!isBlockedCell(i)&&(material[i]===EMPTY||waterComponentMark[i]===componentToken);
}

function countTargetWaterSlots(r,spaceToken,componentToken,grid=null){
  if(flowGridHasArrays(grid)){
    const base=r*grid.cols;
    let n=0;
    for(let c=0;c<grid.cols;c++)if(canUseSettledWaterSlot(base+c,spaceToken,componentToken,grid))n++;
    return n;
  }
  const base=r*cols;
  let n=0;
  for(let c=0;c<cols;c++)if(canUseSettledWaterSlot(base+c,spaceToken,componentToken))n++;
  return n;
}

function placeSettledWater(i,grid=null){
  if(flowGridHasArrays(grid)){
    const a=grid.arrays;
    a.material[i]=WATER;
    a.mass[i]=WATER_MAX_MASS;
    a.vx[i]=0;
    a.vy[i]=0;
    a.flowDir[i]=a.flowDir[i]||randDir();
    flowClearMotionTraceInGrid(grid,i);
    flowClearRestStateInGrid(grid,i);
    a.waterSeen[i]=1;
    return;
  }
  const c=i%cols,r=Math.floor(i/cols);
  wakeFlowAroundCell(c,r);
  material[i]=WATER;
  mass[i]=WATER_MAX_MASS;
  vx[i]=0;
  vy[i]=0;
  flowDir[i]=flowDir[i]||randDir();
  clearMotionTrace(i);
  clearRestState(i);
  waterSeen[i]=1;
  wakeFlowAroundCell(c,r);
}

function collectWaterRowTargets(r,spaceToken,componentToken,limit,centerC,targetToken,targets,grid=null){
  const gridCols=flowGridHasArrays(grid)?grid.cols:cols;
  const targetMark=flowGridHasArrays(grid)?grid.arrays.waterTargetMark:waterTargetMark;
  const slots=countTargetWaterSlots(r,spaceToken,componentToken,grid);
  if(!slots||limit<=0)return 0;
  const base=r*gridCols,toPlace=Math.min(slots,limit);
  let placed=0;
  function addTarget(c){
    const i=base+c;
    if(!canUseSettledWaterSlot(i,spaceToken,componentToken,grid)||targetMark[i]===targetToken)return false;
    targetMark[i]=targetToken;
    targets.push(i);
    placed++;
    return true;
  }
  if(toPlace===slots){
    for(let c=0;c<gridCols;c++){
      if(placed>=toPlace)break;
      addTarget(c);
    }
    return placed;
  }
  const center=clamp(Math.round(centerC),0,gridCols-1);
  for(let step=0;step<gridCols&&placed<toPlace;step++){
    const candidates=step===0?[center]:[center-step,center+step];
    for(const c of candidates){
      if(c<0||c>=gridCols||placed>=toPlace)continue;
      addTarget(c);
    }
  }
  return placed;
}

function collectSettledWaterTargets(region,componentToken,topLimit,grid=null){
  const targetToken=nextWaterTargetTokenForGrid(grid),targets=[];
  let remaining=region.waterCount;
  const gridRows=flowGridHasArrays(grid)?grid.rows:rows;
  for(let r=gridRows-1;r>=topLimit&&remaining>0;r--){
    remaining-=collectWaterRowTargets(r,region.token,componentToken,remaining,region.centerC,targetToken,targets,grid);
  }
  return{targets,targetToken,remaining};
}

function waterRegionAlreadySettled(region,componentToken,targetToken,targets,grid=null){
  if(flowGridHasArrays(grid)){
    const a=grid.arrays;
    if(targets.length!==region.waterCount)return false;
    for(const i of region.cells){
      if(a.waterComponentMark[i]===componentToken&&a.material[i]===WATER&&a.waterTargetMark[i]!==targetToken)return false;
    }
    for(const i of targets){
      if(!(a.waterComponentMark[i]===componentToken&&a.material[i]===WATER))return false;
    }
    return true;
  }
  if(targets.length!==region.waterCount)return false;
  for(const i of region.cells){
    if(waterComponentMark[i]===componentToken&&material[i]===WATER&&waterTargetMark[i]!==targetToken)return false;
  }
  for(const i of targets){
    if(!(waterComponentMark[i]===componentToken&&material[i]===WATER))return false;
  }
  return true;
}

function markWaterRegionStable(region,componentToken,grid=null){
  if(flowGridHasArrays(grid)){
    const a=grid.arrays;
    for(const i of region.cells){
      if(a.waterComponentMark[i]!==componentToken||a.material[i]!==WATER)continue;
      if(!canWaterSleepAt(i,grid)){
        flowClearRestStateInGrid(grid,i);
        continue;
      }
      a.restAge[i]=STABLE_FRAMES[WATER];
      a.stableMask[i]=1;
      a.vx[i]=0;
      a.vy[i]=0;
      flowClearMotionTraceInGrid(grid,i);
    }
    return;
  }
  for(const i of region.cells){
    if(waterComponentMark[i]!==componentToken||material[i]!==WATER)continue;
    if(!canWaterSleepAt(i)){
      clearRestState(i);
      continue;
    }
    restAge[i]=STABLE_FRAMES[WATER];
    stableMask[i]=1;
    vx[i]=0;
    vy[i]=0;
    clearMotionTrace(i);
  }
}

function markWaterTargetsStable(targets,grid=null){
  if(flowGridHasArrays(grid)){
    const a=grid.arrays;
    for(const i of targets){
      if(a.material[i]!==WATER)continue;
      if(!canWaterSleepAt(i,grid)){
        flowClearRestStateInGrid(grid,i);
        continue;
      }
      a.restAge[i]=STABLE_FRAMES[WATER];
      a.stableMask[i]=1;
      a.vx[i]=0;
      a.vy[i]=0;
      flowClearMotionTraceInGrid(grid,i);
    }
    return;
  }
  for(const i of targets){
    if(material[i]!==WATER)continue;
    if(!canWaterSleepAt(i)){
      clearRestState(i);
      continue;
    }
    restAge[i]=STABLE_FRAMES[WATER];
    stableMask[i]=1;
    vx[i]=0;
    vy[i]=0;
    clearMotionTrace(i);
  }
}

function markWaterCellsStable(cells,grid=null){
  if(flowGridHasArrays(grid)){
    const a=grid.arrays;
    for(const i of cells){
      if(a.material[i]!==WATER)continue;
      if(!canWaterSleepAt(i,grid)){
        flowClearRestStateInGrid(grid,i);
        continue;
      }
      a.restAge[i]=STABLE_FRAMES[WATER];
      a.stableMask[i]=1;
      a.vx[i]=0;
      a.vy[i]=0;
      flowClearMotionTraceInGrid(grid,i);
    }
    return;
  }
  for(const i of cells){
    if(material[i]!==WATER)continue;
    if(!canWaterSleepAt(i)){
      clearRestState(i);
      continue;
    }
    restAge[i]=STABLE_FRAMES[WATER];
    stableMask[i]=1;
    vx[i]=0;
    vy[i]=0;
    clearMotionTrace(i);
  }
}

function waterResidueLimit(totalCells){
  return Math.min(WATER_RESIDUE_MAX_CELLS,Math.max(1,Math.floor(totalCells*WATER_RESIDUE_MAX_FRACTION)));
}

function collectSurfaceResidue(cells,topLimit,grid=null){
  const width=flowGridHasArrays(grid)?grid.cols:cols;
  const residue=[];
  for(const i of cells){
    if(Math.floor(i/width)<topLimit)residue.push(i);
  }
  return residue;
}

function deleteSurfaceResidue(residue,grid=null){
  if(flowGridHasArrays(grid)){
    const a=grid.arrays;
    for(const i of residue){
      if(a.material[i]===WATER)deleteCell(i,grid);
    }
    return;
  }
  for(const i of residue){
    if(material[i]===WATER)deleteCell(i);
  }
}

function isWaterTrayBlocker(c,r,grid=null){
  if(grid&&grid.arrays&&Number.isFinite(grid.cols)){
    if(!flowGridInBounds(grid,c,r))return false;
    const i=flowGridIndex(grid,c,r);
    const m=flowNormalizeMaterialCellInGrid(grid,i);
    return grid.arrays.bodyMask[i]||isSolidMaterial(m)||(m!==EMPTY&&m!==WATER);
  }
  if(!inBounds(c,r))return false;
  const i=idx(c,r);
  const m=normalizeMaterialCell(i);
  return bodyMask[i]||isSolidMaterial(m)||(m!==EMPTY&&m!==WATER);
}

function isWaterTraySlot(c,r,grid=null){
  if(grid&&grid.arrays&&Number.isFinite(grid.cols)){
    if(!flowGridInBounds(grid,c,r))return false;
    const i=flowGridIndex(grid,c,r),m=flowNormalizeMaterialCellInGrid(grid,i);
    return !grid.arrays.bodyMask[i]&&(m===EMPTY||m===WATER);
  }
  if(!inBounds(c,r))return false;
  const i=idx(c,r),m=normalizeMaterialCell(i);
  return !bodyMask[i]&&(m===EMPTY||m===WATER);
}

function findTrayParent(parent,id){
  while(parent[id]!==id){
    parent[id]=parent[parent[id]];
    id=parent[id];
  }
  return id;
}

function unionTrayParent(parent,a,b){
  const pa=findTrayParent(parent,a),pb=findTrayParent(parent,b);
  if(pa!==pb)parent[pb]=pa;
  return pa;
}

function collectWaterTrayGroups(grid=null){
  if(grid&&grid.arrays&&Number.isFinite(grid.cols)){
    const a=grid.arrays,parent=[0],intervals=[];
    function newGroup(){
      const id=parent.length;
      parent.push(id);
      return id;
    }
    function belowSupportGroups(left,right,r){
      const groups=[];
      for(let c=left;c<=right;c++){
        if(isWaterTrayBlocker(c,r+1,grid))continue;
        const below=flowGridIndex(grid,c,r+1),group=a.waterBasinMark[below];
        if(!group)return null;
        const root=findTrayParent(parent,group);
        if(!groups.includes(root))groups.push(root);
      }
      return groups;
    }
    a.waterBasinMark.fill(0);
    for(let r=grid.rows-2;r>=0;r--){
      let c=0;
      while(c<grid.cols){
        while(c<grid.cols&&!isWaterTraySlot(c,r,grid))c++;
        const left=c;
        while(c<grid.cols&&isWaterTraySlot(c,r,grid))c++;
        const right=c-1,width=right-left+1;
        if(width<1||left<=0||right>=grid.cols-1)continue;
        if(!isWaterTrayBlocker(left-1,r,grid)||!isWaterTrayBlocker(right+1,r,grid))continue;
        const supportGroups=belowSupportGroups(left,right,r);
        if(!supportGroups)continue;
        let group=supportGroups.length?supportGroups[0]:newGroup();
        for(const other of supportGroups)group=unionTrayParent(parent,group,other);
        group=findTrayParent(parent,group);
        const interval={r,left,right,group};
        intervals.push(interval);
        for(let cc=left;cc<=right;cc++){
          a.waterBasinMark[flowGridIndex(grid,cc,r)]=group;
        }
      }
    }
    const grouped=new Map();
    for(const interval of intervals){
      const root=findTrayParent(parent,interval.group);
      if(!grouped.has(root))grouped.set(root,[]);
      grouped.get(root).push(interval);
    }
    return [...grouped.values()];
  }
  const parent=[0],intervals=[];
  function newGroup(){
    const id=parent.length;
    parent.push(id);
    return id;
  }
  function belowSupportGroups(left,right,r){
    const groups=[];
    for(let c=left;c<=right;c++){
      if(isWaterTrayBlocker(c,r+1))continue;
      const below=idx(c,r+1),group=waterBasinMark[below];
      if(!group)return null;
      const root=findTrayParent(parent,group);
      if(!groups.includes(root))groups.push(root);
    }
    return groups;
  }
  waterBasinMark.fill(0);
  for(let r=rows-2;r>=0;r--){
    let c=0;
    while(c<cols){
      while(c<cols&&!isWaterTraySlot(c,r))c++;
      const left=c;
      while(c<cols&&isWaterTraySlot(c,r))c++;
      const right=c-1,width=right-left+1;
      if(width<1||left<=0||right>=cols-1)continue;
      if(!isWaterTrayBlocker(left-1,r)||!isWaterTrayBlocker(right+1,r))continue;
      const supportGroups=belowSupportGroups(left,right,r);
      if(!supportGroups)continue;
      let group=supportGroups.length?supportGroups[0]:newGroup();
      for(const other of supportGroups)group=unionTrayParent(parent,group,other);
      group=findTrayParent(parent,group);
      const interval={r,left,right,group};
      intervals.push(interval);
      for(let cc=left;cc<=right;cc++){
        waterBasinMark[idx(cc,r)]=group;
      }
    }
  }
  const grouped=new Map();
  for(const interval of intervals){
    const root=findTrayParent(parent,interval.group);
    if(!grouped.has(root))grouped.set(root,[]);
    grouped.get(root).push(interval);
  }
  return [...grouped.values()];
}

function placeTrayWater(i,stable=true,grid=null){
  if(flowGridHasArrays(grid)){
    const a=grid.arrays;
    a.material[i]=WATER;
    a.mass[i]=WATER_MAX_MASS;
    a.vx[i]=0;
    a.vy[i]=0;
    a.flowDir[i]=a.flowDir[i]||randDir();
    flowClearMotionTraceInGrid(grid,i);
    if(stable&&canWaterSleepAt(i,grid)){
      a.restAge[i]=STABLE_FRAMES[WATER];
      a.stableMask[i]=1;
    }else{
      flowClearRestStateInGrid(grid,i);
    }
    return;
  }
  material[i]=WATER;
  mass[i]=WATER_MAX_MASS;
  vx[i]=0;
  vy[i]=0;
  flowDir[i]=flowDir[i]||randDir();
  clearMotionTrace(i);
  if(stable&&canWaterSleepAt(i)){
    restAge[i]=STABLE_FRAMES[WATER];
    stableMask[i]=1;
  }else{
    clearRestState(i);
  }
}

function buildWaterTrayInfo(intervals,grid=null){
  if(grid&&grid.arrays&&Number.isFinite(grid.cols)){
    const a=grid.arrays,cells=[],rowsByR=new Map();
    let waterCount=0,sumC=0,maxWidth=0,bottomRow=-1,topRow=grid.rows,minC=grid.cols,maxC=0;
    for(const span of intervals){
      bottomRow=Math.max(bottomRow,span.r);
      topRow=Math.min(topRow,span.r);
      minC=Math.min(minC,span.left);
      maxC=Math.max(maxC,span.right);
      maxWidth=Math.max(maxWidth,span.right-span.left+1);
      if(!rowsByR.has(span.r))rowsByR.set(span.r,[]);
      rowsByR.get(span.r).push(span);
      for(let c=span.left;c<=span.right;c++){
        const i=flowGridIndex(grid,c,span.r);
        cells.push(i);
        if(a.material[i]===WATER){
          waterCount++;
          sumC+=c;
        }
      }
    }
    let floorSupport=0;
    let floorLeak=false;
    for(const span of intervals){
      if(span.r!==bottomRow)continue;
      for(let c=span.left;c<=span.right;c++){
        if(isWaterTrayBlocker(c,span.r+1,grid))floorSupport++;
        else floorLeak=true;
      }
    }
    return{intervals,cells,rowsByR,waterCount,sumC,maxWidth,bottomRow,topRow,minC,maxC,floorSupport,floorLeak,id:0};
  }
  const cells=[],rowsByR=new Map();
  let waterCount=0,sumC=0,maxWidth=0,bottomRow=-1,topRow=rows,minC=cols,maxC=0;
  for(const span of intervals){
    bottomRow=Math.max(bottomRow,span.r);
    topRow=Math.min(topRow,span.r);
    minC=Math.min(minC,span.left);
    maxC=Math.max(maxC,span.right);
    maxWidth=Math.max(maxWidth,span.right-span.left+1);
    if(!rowsByR.has(span.r))rowsByR.set(span.r,[]);
    rowsByR.get(span.r).push(span);
    for(let c=span.left;c<=span.right;c++){
      const i=idx(c,span.r);
      cells.push(i);
      if(material[i]===WATER){
        waterCount++;
        sumC+=c;
      }
    }
  }
  let floorSupport=0;
  let floorLeak=false;
  for(const span of intervals){
    if(span.r!==bottomRow)continue;
    for(let c=span.left;c<=span.right;c++){
      if(isWaterTrayBlocker(c,span.r+1))floorSupport++;
      else floorLeak=true;
    }
  }
  return{intervals,cells,rowsByR,waterCount,sumC,maxWidth,bottomRow,topRow,minC,maxC,floorSupport,floorLeak,id:0};
}

function isUsableWaterTray(info){
  return info.cells.length>0&&info.maxWidth>0&&info.floorSupport>0;
}

function buildWaterBasins(grid=null){
  if(grid&&grid.arrays&&Number.isFinite(grid.cols)){
    const a=grid.arrays,basins=[];
    a.waterBasinMark.fill(0);
    a.waterSleepBlockMark.fill(0);
    for(const group of collectWaterTrayGroups(grid)){
      const info=buildWaterTrayInfo(group,grid);
      if(!isUsableWaterTray(info))continue;
      info.id=basins.length+1;
      basins.push(info);
    }
    for(const info of basins){
      for(const i of info.cells)a.waterBasinMark[i]=info.id;
    }
    for(const info of basins){
      for(const i of info.cells){
        if(info.floorLeak||basinSlotHasRawOutlet(i,info.id,grid))a.waterSleepBlockMark[i]=1;
      }
    }
    return basins;
  }
  const basins=[];
  waterBasinMark.fill(0);
  waterSleepBlockMark.fill(0);
  for(const group of collectWaterTrayGroups()){
    const info=buildWaterTrayInfo(group);
    if(!isUsableWaterTray(info))continue;
    info.id=basins.length+1;
    basins.push(info);
  }
  for(const info of basins){
    for(const i of info.cells)waterBasinMark[i]=info.id;
  }
  for(const info of basins){
    for(const i of info.cells){
      if(info.floorLeak||basinSlotHasRawOutlet(i,info.id))waterSleepBlockMark[i]=1;
    }
  }
  return basins;
}

function canTraverseBasinIntake(i,basinId,grid=null){
  if(flowGridHasArrays(grid)){
    const a=grid.arrays;
    if(flowIsBlockedCellInGrid(grid,i))return false;
    const owner=a.waterBasinMark[i];
    if(owner&&owner!==basinId)return false;
    const mat=a.material[i];
    if(owner===basinId)return mat===EMPTY||mat===WATER;
    return mat===WATER;
  }
  if(isBlockedCell(i))return false;
  const owner=waterBasinMark[i];
  if(owner&&owner!==basinId)return false;
  const mat=material[i];
  if(owner===basinId)return mat===EMPTY||mat===WATER;
  return mat===WATER;
}

function isInsideBasinIntakeBounds(c,r,info){
  return c>=info.minC-WATER_BASIN_INTAKE_SIDE_PAD&&c<=info.maxC+WATER_BASIN_INTAKE_SIDE_PAD&&r>=info.topRow-WATER_BASIN_INTAKE_HEIGHT&&r<=info.bottomRow;
}

function collectWaterBasinIntake(info,grid=null){
  if(flowGridHasArrays(grid)){
    const a=grid.arrays,gridCols=grid.cols,gridCount=grid.count;
    const capacity=info.cells.length-info.waterCount;
    if(capacity<=0)return[];
    const limit=Math.min(capacity,Math.max(WATER_BASIN_INTAKE_PER_PASS,info.maxWidth*2));
    const token=nextWaterSpaceTokenForGrid(grid);
    const intake=[];
    let head=0,tail=0;
    for(const i of info.cells){
      a.waterSpaceMark[i]=token;
      a.waterQueue[tail++]=i;
    }
    while(head<tail&&intake.length<limit){
      const i=a.waterQueue[head++],c=i%gridCols,r=Math.floor(i/gridCols);
      const ns=[i-1,i+1,i-gridCols,i+gridCols];
      for(const ni of ns){
        if(ni<0||ni>=gridCount||a.waterSpaceMark[ni]===token)continue;
        const nc=ni%gridCols,nr=Math.floor(ni/gridCols);
        if(Math.abs(nc-c)+Math.abs(nr-r)!==1||!isInsideBasinIntakeBounds(nc,nr,info)||!canTraverseBasinIntake(ni,info.id,grid))continue;
        a.waterSpaceMark[ni]=token;
        a.waterQueue[tail++]=ni;
        if(a.waterBasinMark[ni]===0&&a.material[ni]===WATER){
          intake.push(ni);
          if(intake.length>=limit)break;
        }
      }
    }
    return intake;
  }
  const capacity=info.cells.length-info.waterCount;
  if(capacity<=0)return[];
  const limit=Math.min(capacity,Math.max(WATER_BASIN_INTAKE_PER_PASS,info.maxWidth*2));
  const token=nextWaterSpaceToken();
  const intake=[];
  let head=0,tail=0;
  for(const i of info.cells){
    waterSpaceMark[i]=token;
    waterQueue[tail++]=i;
  }
  while(head<tail&&intake.length<limit){
    const i=waterQueue[head++],c=i%cols,r=Math.floor(i/cols);
    const ns=[i-1,i+1,i-cols,i+cols];
    for(const ni of ns){
      if(ni<0||ni>=count||waterSpaceMark[ni]===token)continue;
      const nc=ni%cols,nr=Math.floor(ni/cols);
      if(Math.abs(nc-c)+Math.abs(nr-r)!==1||!isInsideBasinIntakeBounds(nc,nr,info)||!canTraverseBasinIntake(ni,info.id))continue;
      waterSpaceMark[ni]=token;
      waterQueue[tail++]=ni;
      if(waterBasinMark[ni]===0&&material[ni]===WATER){
        intake.push(ni);
        if(intake.length>=limit)break;
      }
    }
  }
  return intake;
}

function collectBasinOverflow(info,grid=null){
  if(flowGridHasArrays(grid)){
    const a=grid.arrays,gridCols=grid.cols,gridCount=grid.count;
    if(info.waterCount<info.cells.length)return[];
    const token=nextWaterSpaceTokenForGrid(grid),overflow=[];
    let head=0,tail=0;
    for(const i of info.cells){
      a.waterSpaceMark[i]=token;
      a.waterQueue[tail++]=i;
    }
    while(head<tail&&overflow.length<WATER_BASIN_INTAKE_PER_PASS){
      const i=a.waterQueue[head++],c=i%gridCols,r=Math.floor(i/gridCols);
      const ns=[i-1,i+1,i-gridCols,i+gridCols];
      for(const ni of ns){
        if(ni<0||ni>=gridCount||a.waterSpaceMark[ni]===token)continue;
        const nc=ni%gridCols,nr=Math.floor(ni/gridCols),owner=a.waterBasinMark[ni];
        if(Math.abs(nc-c)+Math.abs(nr-r)!==1||!isInsideBasinIntakeBounds(nc,nr,info)||owner&&owner!==info.id||flowIsBlockedCellInGrid(grid,ni))continue;
        const mat=a.material[ni];
        if(owner===info.id){
          a.waterSpaceMark[ni]=token;
          a.waterQueue[tail++]=ni;
        }else if(mat===WATER){
          a.waterSpaceMark[ni]=token;
          a.waterQueue[tail++]=ni;
          overflow.push(ni);
          if(overflow.length>=WATER_BASIN_INTAKE_PER_PASS)break;
        }
      }
    }
    return overflow;
  }
  if(info.waterCount<info.cells.length)return[];
  const token=nextWaterSpaceToken(),overflow=[];
  let head=0,tail=0;
  for(const i of info.cells){
    waterSpaceMark[i]=token;
    waterQueue[tail++]=i;
  }
  while(head<tail&&overflow.length<WATER_BASIN_INTAKE_PER_PASS){
    const i=waterQueue[head++],c=i%cols,r=Math.floor(i/cols);
    const ns=[i-1,i+1,i-cols,i+cols];
    for(const ni of ns){
      if(ni<0||ni>=count||waterSpaceMark[ni]===token)continue;
      const nc=ni%cols,nr=Math.floor(ni/cols),owner=waterBasinMark[ni];
      if(Math.abs(nc-c)+Math.abs(nr-r)!==1||!isInsideBasinIntakeBounds(nc,nr,info)||owner&&owner!==info.id||isBlockedCell(ni))continue;
      const mat=material[ni];
      if(owner===info.id){
        waterSpaceMark[ni]=token;
        waterQueue[tail++]=ni;
      }else if(mat===WATER){
        waterSpaceMark[ni]=token;
        waterQueue[tail++]=ni;
        overflow.push(ni);
        if(overflow.length>=WATER_BASIN_INTAKE_PER_PASS)break;
      }
    }
  }
  return overflow;
}

function basinOverflowSide(info,grid=null){
  const gridCols=flowGridHasArrays(grid)?grid.cols:cols;
  const leftLip=basinSideWallTop(info,-1,grid),rightLip=basinSideWallTop(info,1,grid);
  if(leftLip!==rightLip)return rightLip>leftLip?1:-1;
  let leftScore=0,rightScore=0;
  for(const span of info.intervals){
    if(!isWaterTrayBlocker(span.left-1,span.r,grid))leftScore++;
    if(!isWaterTrayBlocker(span.right+1,span.r,grid))rightScore++;
  }
  if(leftScore||rightScore)return rightScore>=leftScore?1:-1;
  const leftDrop=nearestDropOutsideBasin(info,-1,grid),rightDrop=nearestDropOutsideBasin(info,1,grid);
  if(rightDrop!==leftDrop)return rightDrop<leftDrop?1:-1;
  return info.maxC>gridCols-1-info.minC?1:-1;
}

function basinSideWallTop(info,dir,grid=null){
  const gridRows=flowGridHasArrays(grid)?grid.rows:rows;
  const sideC=dir>0?info.maxC+1:info.minC-1;
  let top=gridRows,seen=false;
  const minR=Math.max(0,info.topRow-WATER_BASIN_INTAKE_HEIGHT);
  for(let r=info.bottomRow;r>=minR;r--){
    if(isWaterTrayBlocker(sideC,r,grid)){
      seen=true;
      top=r;
    }else if(seen){
      break;
    }
  }
  return seen?top:gridRows;
}

function nearestDropOutsideBasin(info,dir,grid=null){
  const gridCols=flowGridHasArrays(grid)?grid.cols:cols;
  const edge=dir>0?info.maxC:info.minC;
  for(let step=1;step<=WATER_BASIN_OVERFLOW_RUNOUT;step++){
    const c=edge+dir*step;
    if(c<0||c>=gridCols)return step;
    for(let r=info.topRow;r<=info.bottomRow;r++){
      if(flowGridHasArrays(grid)){
        const i=flowGridIndex(grid,c,r);
        if(flowIsBlockedCellInGrid(grid,i))continue;
        if(!flowGridInBounds(grid,c,r+1)||flowCanEnterCellInGrid(grid,WATER,flowGridIndex(grid,c,r+1)))return step;
      }else{
        const i=idx(c,r);
        if(isBlockedCell(i))continue;
        const below=inBounds(c,r+1)?idx(c,r+1):-1;
        if(!inBounds(c,r+1)||canEnterCell(WATER,below))return step;
      }
    }
  }
  return Infinity;
}

function pushWaterAlongBasinOverflow(info,grid=null){
  if(flowGridHasArrays(grid)){
    const a=grid.arrays,gridCols=grid.cols;
    if(info.waterCount<info.cells.length)return false;
    const dir=basinOverflowSide(info,grid);
    let changed=false,pushed=0;
    const rowKeys=[...info.rowsByR.keys()].sort((a,b)=>a-b);
    for(const r of rowKeys){
      const spans=info.rowsByR.get(r).slice().sort((a,b)=>dir>0?b.right-a.right:a.left-b.left);
      for(const span of spans){
        const edge=dir>0?span.right:span.left;
        for(let step=0;step<=WATER_BASIN_OVERFLOW_RUNOUT&&pushed<WATER_BASIN_INTAKE_PER_PASS;step++){
          const c=edge+dir*step;
          if(c<0||c>=gridCols)break;
          const i=flowGridIndex(grid,c,r);
          if(a.material[i]!==WATER||a.stableMask[i])continue;
          const downR=r+1,sideC=c+dir;
          if(flowGridInBounds(grid,c,downR)&&flowCanEnterCellInGrid(grid,WATER,flowGridIndex(grid,c,downR))){
            if(tryMoveWithDirection(c,r,c,downR,WATER,dir,grid)){
              changed=true;
              pushed++;
            }
          }else if(flowGridInBounds(grid,sideC,r)&&flowCanEnterCellInGrid(grid,WATER,flowGridIndex(grid,sideC,r))){
            if(tryMoveWithDirection(c,r,sideC,r,WATER,dir,grid)){
              changed=true;
              pushed++;
            }
          }else if(flowGridInBounds(grid,sideC,downR)&&flowCanEnterCellInGrid(grid,WATER,flowGridIndex(grid,sideC,downR))){
            if(tryMoveWithDirection(c,r,sideC,downR,WATER,dir,grid)){
              changed=true;
              pushed++;
            }
          }
        }
      }
    }
    return changed;
  }
  if(info.waterCount<info.cells.length)return false;
  const dir=basinOverflowSide(info);
  let changed=false,pushed=0;
  const rowKeys=[...info.rowsByR.keys()].sort((a,b)=>a-b);
  for(const r of rowKeys){
    const spans=info.rowsByR.get(r).slice().sort((a,b)=>dir>0?b.right-a.right:a.left-b.left);
    for(const span of spans){
      const edge=dir>0?span.right:span.left;
      for(let step=0;step<=WATER_BASIN_OVERFLOW_RUNOUT&&pushed<WATER_BASIN_INTAKE_PER_PASS;step++){
        const c=edge+dir*step;
        if(c<0||c>=cols)break;
        const i=idx(c,r);
        if(material[i]!==WATER||stableMask[i])continue;
        const downR=r+1,sideC=c+dir;
        if(inBounds(c,downR)&&canEnterCell(WATER,idx(c,downR))){
          if(tryMoveWithDirection(c,r,c,downR,WATER,dir)){
            changed=true;
            pushed++;
          }
        }else if(inBounds(sideC,r)&&canEnterCell(WATER,idx(sideC,r))){
          if(tryMoveWithDirection(c,r,sideC,r,WATER,dir)){
            changed=true;
            pushed++;
          }
        }else if(inBounds(sideC,downR)&&canEnterCell(WATER,idx(sideC,downR))){
          if(tryMoveWithDirection(c,r,sideC,downR,WATER,dir)){
            changed=true;
            pushed++;
          }
        }
      }
    }
  }
  return changed;
}

function lowerBasinScoreForCell(info,c,r){
  if(info.topRow<=r)return Infinity;
  const dx=c<info.minC?info.minC-c:c>info.maxC?c-info.maxC:0;
  if(dx>Math.max(WATER_BASIN_INTAKE_SIDE_PAD*4,info.maxWidth*2))return Infinity;
  return(info.topRow-r)*4+dx;
}

function findDownstreamBasinForCell(c,r,source,basins,usedByBasin){
  let best=null,bestScore=Infinity;
  for(const info of basins){
    if(info.id===source.id)continue;
    const remaining=info.cells.length-info.waterCount-(usedByBasin.get(info.id)||0);
    if(remaining<=0)continue;
    const score=lowerBasinScoreForCell(info,c,r);
    if(score<bestScore){
      bestScore=score;
      best=info;
    }
  }
  return best;
}

function transferBasinOverflow(basins,grid=null){
  let changed=false;
  const gridCols=flowGridHasArrays(grid)?grid.cols:cols;
  const sorted=basins.slice().sort((a,b)=>a.topRow-b.topRow);
  const byTarget=new Map(),usedByBasin=new Map();
  for(const source of sorted){
    const overflow=collectBasinOverflow(source,grid);
    if(!overflow.length)continue;
    for(const i of overflow){
      const target=findDownstreamBasinForCell(i%gridCols,Math.floor(i/gridCols),source,basins,usedByBasin);
      if(!target)continue;
      if(!byTarget.has(target.id))byTarget.set(target.id,{info:target,cells:[]});
      byTarget.get(target.id).cells.push(i);
      usedByBasin.set(target.id,(usedByBasin.get(target.id)||0)+1);
    }
  }
  for(const entry of byTarget.values()){
    if(settleWaterTray(entry.info,entry.cells,grid))changed=true;
  }
  return changed;
}

function basinTargetHasOutlet(i,basinId,targetToken,grid=null){
  const width=flowGridHasArrays(grid)?grid.cols:cols;
  const c=i%width,r=Math.floor(i/width),ns=[
    [c,r+1],
    [c-1,r+1],
    [c+1,r+1]
  ];
  if(flowGridHasArrays(grid)){
    const a=grid.arrays;
    for(const [nc,nr]of ns){
      if(!flowGridInBounds(grid,nc,nr))return true;
      const ni=flowGridIndex(grid,nc,nr);
      if(a.waterBasinMark[ni]===basinId||a.waterTargetMark[ni]===targetToken)continue;
      if(flowCanEnterCellInGrid(grid,WATER,ni))return true;
    }
    return false;
  }
  for(const [nc,nr]of ns){
    if(!inBounds(nc,nr))return true;
    const ni=idx(nc,nr);
    if(waterBasinMark[ni]===basinId||waterTargetMark[ni]===targetToken)continue;
    if(canEnterCell(WATER,ni))return true;
  }
  return false;
}

function basinSlotHasRawOutlet(i,basinId,grid=null){
  const width=grid&&grid.arrays&&Number.isFinite(grid.cols)?grid.cols:cols;
  const c=i%width,r=Math.floor(i/width),ns=[
    [c,r+1],
    [c-1,r+1],
    [c+1,r+1]
  ];
  for(const [nc,nr]of ns){
    if(grid&&grid.arrays&&Number.isFinite(grid.cols)){
      if(!flowGridInBounds(grid,nc,nr))return true;
      const ni=flowGridIndex(grid,nc,nr);
      if(grid.arrays.waterBasinMark[ni]===basinId)continue;
      if(flowCanEnterCellInGrid(grid,WATER,ni))return true;
      continue;
    }
    if(!inBounds(nc,nr))return true;
    const ni=idx(nc,nr);
    if(waterBasinMark[ni]===basinId)continue;
    if(canEnterCell(WATER,ni))return true;
  }
  return false;
}

function markTrayTargetsRestState(targets,info,targetToken,grid=null){
  if(flowGridHasArrays(grid)){
    const a=grid.arrays;
    for(const i of targets){
      if(a.material[i]!==WATER)continue;
      if(info.floorLeak||!canWaterSleepAt(i,grid)||basinTargetHasOutlet(i,info.id,targetToken,grid)){
        flowClearRestStateInGrid(grid,i);
      }else{
        a.restAge[i]=STABLE_FRAMES[WATER];
        a.stableMask[i]=1;
        a.vx[i]=0;
        a.vy[i]=0;
        flowClearMotionTraceInGrid(grid,i);
      }
    }
    return;
  }
  for(const i of targets){
    if(material[i]!==WATER)continue;
    if(info.floorLeak||!canWaterSleepAt(i)||basinTargetHasOutlet(i,info.id,targetToken)){
      clearRestState(i);
    }else{
      restAge[i]=STABLE_FRAMES[WATER];
      stableMask[i]=1;
      vx[i]=0;
      vy[i]=0;
      clearMotionTrace(i);
    }
  }
}

function settleWaterTray(info,intake=[],grid=null){
  if(flowGridHasArrays(grid)){
    const a=grid.arrays,gridCols=grid.cols;
    if(!info||!isUsableWaterTray(info))return false;
    const totalWater=info.waterCount+intake.length;
    if(totalWater<1)return false;
    let intakeSumC=0;
    for(const i of intake)intakeSumC+=i%gridCols;
    const targetToken=nextWaterTargetTokenForGrid(grid),targets=[];
    const centerC=totalWater?(info.sumC+intakeSumC)/totalWater:(gridCols*.5);
    let remaining=totalWater;
    const rowKeys=[...info.rowsByR.keys()].sort((a,b)=>b-a);
    for(const r of rowKeys){
      const spans=info.rowsByR.get(r).sort((a,b)=>a.left-b.left);
      const rowSlots=[];
      for(const span of spans)for(let c=span.left;c<=span.right;c++)rowSlots.push(flowGridIndex(grid,c,r));
      const toPlace=Math.min(rowSlots.length,remaining);
      if(toPlace<=0)break;
      if(toPlace===rowSlots.length){
        for(const i of rowSlots){
          a.waterTargetMark[i]=targetToken;
          targets.push(i);
        }
      }else{
        rowSlots.sort((a,b)=>{
          const leakDiff=(basinSlotHasRawOutlet(b,info.id,grid)?1:0)-(basinSlotHasRawOutlet(a,info.id,grid)?1:0);
          if(leakDiff)return leakDiff;
          return Math.abs((a%gridCols)-centerC)-Math.abs((b%gridCols)-centerC);
        });
        for(let n=0;n<toPlace;n++){
          a.waterTargetMark[rowSlots[n]]=targetToken;
          targets.push(rowSlots[n]);
        }
      }
      remaining-=toPlace;
    }
    if(remaining>0||targets.length!==totalWater)return false;
    let alreadySettled=!intake.length;
    for(const i of info.cells){
      if(a.material[i]===WATER&&a.waterTargetMark[i]!==targetToken){
        alreadySettled=false;
        break;
      }
    }
    if(alreadySettled){
      markTrayTargetsRestState(targets,info,targetToken,grid);
      return false;
    }
    for(const i of info.cells){
      if(a.material[i]===WATER)deleteCell(i,grid);
    }
    for(const i of intake)deleteCell(i,grid);
    for(const i of targets)placeTrayWater(i,!(info.floorLeak||a.waterSleepBlockMark[i]||basinTargetHasOutlet(i,info.id,targetToken,grid)),grid);
    return true;
  }
  if(!info||!isUsableWaterTray(info))return false;
  const totalWater=info.waterCount+intake.length;
  if(totalWater<1)return false;
  let intakeSumC=0;
  for(const i of intake)intakeSumC+=i%cols;
  const targetToken=nextWaterTargetToken(),targets=[];
  const centerC=totalWater?(info.sumC+intakeSumC)/totalWater:(cols*.5);
  let remaining=totalWater;
  const rowKeys=[...info.rowsByR.keys()].sort((a,b)=>b-a);
  for(const r of rowKeys){
    const spans=info.rowsByR.get(r).sort((a,b)=>a.left-b.left);
    const rowSlots=[];
    for(const span of spans)for(let c=span.left;c<=span.right;c++)rowSlots.push(idx(c,r));
    const toPlace=Math.min(rowSlots.length,remaining);
    if(toPlace<=0)break;
    if(toPlace===rowSlots.length){
      for(const i of rowSlots){
        waterTargetMark[i]=targetToken;
        targets.push(i);
      }
    }else{
      rowSlots.sort((a,b)=>{
        const leakDiff=(basinSlotHasRawOutlet(b,info.id)?1:0)-(basinSlotHasRawOutlet(a,info.id)?1:0);
        if(leakDiff)return leakDiff;
        return Math.abs((a%cols)-centerC)-Math.abs((b%cols)-centerC);
      });
      for(let n=0;n<toPlace;n++){
        waterTargetMark[rowSlots[n]]=targetToken;
        targets.push(rowSlots[n]);
      }
    }
    remaining-=toPlace;
  }
  if(remaining>0||targets.length!==totalWater)return false;
  let alreadySettled=!intake.length;
  for(const i of info.cells){
    if(material[i]===WATER&&waterTargetMark[i]!==targetToken){
      alreadySettled=false;
      break;
    }
  }
  if(alreadySettled){
    markTrayTargetsRestState(targets,info,targetToken);
    return false;
  }
  for(const i of info.cells){
    if(material[i]===WATER)deleteCell(i);
  }
  for(const i of intake)deleteCell(i);
  for(const i of targets)placeTrayWater(i,!(info.floorLeak||waterSleepBlockMark[i]||basinTargetHasOutlet(i,info.id,targetToken)));
  return true;
}

function waterTraySettlePass(grid=null){
  let changed=false;
  for(let pass=0;pass<WATER_BASIN_SETTLE_PASSES;pass++){
    const basins=buildWaterBasins(grid);
    if(!basins.length)break;
    for(const info of basins){
      const intake=collectWaterBasinIntake(info,grid);
      if(settleWaterTray(info,intake,grid))changed=true;
    }
    const refreshed=buildWaterBasins(grid);
    if(refreshed.length&&transferBasinOverflow(refreshed,grid))changed=true;
    const pushed=buildWaterBasins(grid);
    for(const info of pushed)if(pushWaterAlongBasinOverflow(info,grid))changed=true;
  }
  return changed;
}

function settleWaterRegion(region,componentToken,topLimit,grid=null){
  // Whole-basin rewrites happen here. Always compute targets first, compare
  // against current cells, then write only if the target shape truly changes.
  if(region.touchesDrain)return{closed:false,settled:false};
  if(region.waterCount<2)return{closed:true,settled:false};
  const plan=collectSettledWaterTargets(region,componentToken,topLimit,grid);
  if(plan.remaining>0)return{closed:true,settled:false};
  if(waterRegionAlreadySettled(region,componentToken,plan.targetToken,plan.targets,grid)){
    markWaterRegionStable(region,componentToken,grid);
    return{closed:true,settled:true};
  }
  const a=flowGridHasArrays(grid)?grid.arrays:null;
  for(const i of region.cells){
    if(a){
      if(a.waterComponentMark[i]===componentToken&&a.material[i]===WATER)deleteCell(i,grid);
    }else if(waterComponentMark[i]===componentToken&&material[i]===WATER)deleteCell(i);
  }
  for(const i of plan.targets)placeSettledWater(i,grid);
  markWaterTargetsStable(plan.targets,grid);
  return{closed:true,settled:true};
}

function settleWaterComponent(cells,grid=null){
  // Local water movement is intentionally overridden by this component pass once
  // a basin can be packed into a stable target shape.
  if(cells.length<2)return;
  let allStable=true;
  const a=flowGridHasArrays(grid)?grid.arrays:null;
  for(const i of cells){
    if(!(a?a.stableMask[i]:stableMask[i])){
      allStable=false;
      break;
    }
  }
  if(allStable)return;
  const width=flowGridHasArrays(grid)?grid.cols:cols;
  const topLimit=waterSurfaceLimit(cells,grid),componentToken=nextWaterComponentTokenForGrid(grid),basinToken=nextWaterBasinTokenForGrid(grid);
  for(const i of cells)(a?a.waterComponentMark:waterComponentMark)[i]=componentToken;
  const residue=collectSurfaceResidue(cells,topLimit,grid);
  let sawRegion=false,allRegionsClosed=true,allClosedRegionsSettled=true;
  for(const i of cells){
    const r=Math.floor(i/width);
    if(r<topLimit||(a?a.waterBasinMark[i]:waterBasinMark[i])===basinToken)continue;
    sawRegion=true;
    const result=settleWaterRegion(markReachableWaterSpace(i,topLimit,componentToken,basinToken,grid),componentToken,topLimit,grid);
    if(!result.closed)allRegionsClosed=false;
    if(result.closed&&!result.settled)allClosedRegionsSettled=false;
  }
  if(sawRegion&&allRegionsClosed&&allClosedRegionsSettled&&residue.length&&residue.length<=waterResidueLimit(cells.length)){
    deleteSurfaceResidue(residue,grid);
    markWaterCellsStable(cells,grid);
  }
}

function waterSettlePass(grid=null){
  if(flowGridHasArrays(grid)){
    const a=grid.arrays;
    a.waterSeen.fill(0);
    for(let i=0;i<grid.count;i++){
      if(a.waterSeen[i]||a.material[i]!==WATER)continue;
      settleWaterComponent(collectWaterComponent(i,grid),grid);
    }
    return;
  }
  waterSeen.fill(0);
  for(let i=0;i<count;i++){
    if(waterSeen[i]||material[i]!==WATER)continue;
    settleWaterComponent(collectWaterComponent(i));
  }
}

function updateFlowCell(c,r,mat,grid=null){
  if(grid&&grid.arrays&&Number.isFinite(grid.cols)){
    const a=grid.arrays,i=flowGridIndex(grid,c,r);
    if(a.material[i]!==mat)return;
    const rule=FLOW_RULES[mat];
    if(a.stableMask[i])return;
    if(typeof tryCarriedMove==='function'&&tryCarriedMove(c,r,mat,grid))return;
    if(rule.slopeBeforeGravity&&trySlopeRelax(c,r,mat,rule,grid))return;
    if(tryGravity(c,r,mat,rule,grid))return;
    if(tryArmIsolatedSurfaceEscape(c,r,mat,rule,grid))return;
    if(trySinglePixelWanderMove(c,r,mat,rule,grid))return;
    if(tryEscapeMove(c,r,mat,rule,grid))return;
    if(!rule.slopeBeforeGravity&&trySlopeRelax(c,r,mat,rule,grid))return;
    if(tryVelocityMove(c,r,mat,grid))return;
    if(a.material[i]===mat){
      a.vx[i]*=rule.drag;
      a.vy[i]*=rule.drag;
    }
    return;
  }
  const i=idx(c,r);
  if(material[i]!==mat)return;
  const rule=FLOW_RULES[mat];
  if(stableMask[i])return;
  if(typeof tryCarriedMove==='function'&&tryCarriedMove(c,r,mat))return;
  if(rule.slopeBeforeGravity&&trySlopeRelax(c,r,mat,rule))return;
  if(tryGravity(c,r,mat,rule))return;
  if(tryArmIsolatedSurfaceEscape(c,r,mat,rule))return;
  if(trySinglePixelWanderMove(c,r,mat,rule))return;
  if(tryEscapeMove(c,r,mat,rule))return;
  if(!rule.slopeBeforeGravity&&trySlopeRelax(c,r,mat,rule))return;
  if(tryVelocityMove(c,r,mat))return;
  if(material[i]===mat){
    vx[i]*=rule.drag;
    vy[i]*=rule.drag;
  }
}

// Frame-level flow update.
function drainOpenBoundaries(grid=null){
  if(grid&&grid.arrays&&Number.isFinite(grid.cols)){
    const a=grid.arrays;
    for(let c=0;c<grid.cols;c++){
      const i=flowGridIndex(grid,c,grid.rows-1);
      if(isFlowMaterial(a.material[i]))flowDeleteCellInGrid(grid,i);
    }
    for(let r=0;r<grid.rows;r++){
      for(const c of[0,grid.cols-1]){
        const i=flowGridIndex(grid,c,r);
        if(isFlowMaterial(a.material[i]))flowDeleteCellInGrid(grid,i);
      }
    }
    return;
  }
  // The viewport is an open boundary for flow materials: edge cells have already
  // left the frame and should not be treated as walls.
  for(let c=0;c<cols;c++){
    const i=idx(c,rows-1);
    if(isFlowMaterial(material[i])){
      deleteCell(i);
    }
  }
  for(let r=0;r<rows;r++){
    for(const c of[0,cols-1]){
      const i=idx(c,r);
      if(isFlowMaterial(material[i])){
        deleteCell(i);
      }
    }
  }
}

function updateGridMaterials(world){
  if(typeof applySources==='function')applySources(world);
  const grid=world&&world.arrays?world:null;
  const gridCols=grid?grid.cols:cols,gridRows=grid?grid.rows:rows;
  const order=[...Array(gridCols).keys()];
  for(const mat of FLOW_ORDER){
    const rule=FLOW_RULES[mat];
    for(let pass=0;pass<rule.passes;pass++){
      if(Math.random()<.5)order.reverse();
      for(let r=gridRows-1;r>=0;r--)for(const c of order)updateFlowCell(c,r,mat,grid);
    }
  }
  // The old basin stabilizer stays available for debug and experiments. The
  // default water rule now uses the shared local low-slope fluid flow.
  if(FLOW_RULES[WATER].useBasinSettle!==false)waterTraySettlePass(grid);
  if(FLOW_RULES[WATER].useSurfaceLevelPass!==false)waterSurfaceLevelPass(grid);
  if(typeof applyErosionPass==='function')applyErosionPass(world);
  deleteOscillatingCells(grid);
  drainOpenBoundaries(world);
  updateMaterialStability(grid);
  if(typeof updateCarryLifetimes==='function')updateCarryLifetimes(world);
}
