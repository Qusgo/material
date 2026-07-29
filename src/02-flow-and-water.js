'use strict';

// Flow-material rules, local movement, optional legacy water basin settling, and grid update order.

const WATER_BASIN_INTAKE_HEIGHT=24,WATER_BASIN_INTAKE_SIDE_PAD=10,WATER_BASIN_INTAKE_PER_PASS=48,WATER_BASIN_SETTLE_PASSES=3;
const WATER_BASIN_OVERFLOW_RUNOUT=26;

function wakeFlowAroundCell(c,r,rad=WAKE_RADIUS){
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

function isBlockedCell(i){
  return i<0||i>=count||bodyMask[i]||isSolidMaterial(normalizeMaterialCell(i));
}

function canEnterCell(mat,to){
  if(isBlockedCell(to))return false;
  const target=normalizeMaterialCell(to);
  if(target===EMPTY)return true;
  return isFlowMaterial(target)&&materialDensity(mat)>materialDensity(target);
}

function deleteCell(i){
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

function noteMove(from,to){
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

function moveCell(from,to){
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
function tryMove(c,r,nc,nr,mat){
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

function isSurfaceCell(c,r,mat){
  return inBounds(c,r)&&material[idx(c,r)]===mat&&(!inBounds(c,r-1)||material[idx(c,r-1)]!==mat);
}

function columnSurfaceRow(c,mat){
  if(c<0||c>=cols)return -1;
  for(let r=0;r<rows;r++){
    if(material[idx(c,r)]===mat)return r;
  }
  return -1;
}

function columnLandingSurfaceRow(c,mat){
  const waterSurface=columnSurfaceRow(c,mat);
  if(waterSurface>=0)return waterSurface;
  if(c<0||c>=cols)return -1;
  for(let r=0;r<rows;r++){
    const i=idx(c,r);
    if(!canEnterCell(mat,i))return r;
  }
  return rows;
}

function localLandingSurfaceRow(c,fromR,mat){
  if(c<0||c>=cols)return -1;
  for(let r=clamp(fromR,0,rows-1);r<rows;r++){
    const i=idx(c,r);
    if(material[i]===mat)return r;
    if(!canEnterCell(mat,i))return r;
  }
  return rows;
}

function slopeSurfaceRow(c,fromR,mat,rule){
  return rule.localSlopeSurface?localLandingSurfaceRow(c,fromR,mat):columnLandingSurfaceRow(c,mat);
}

function slopeTargetRow(c,r,nc,mat,rule){
  return rule.columnSlopePlacement?columnPlacementRow(nc,r,mat):r;
}

function columnPlacementRow(c,fromR,mat){
  const surface=columnLandingSurfaceRow(c,mat);
  if(surface<=fromR||surface>=rows)return -1;
  const targetR=surface-1,target=idx(c,targetR);
  if(!canEnterCell(mat,target))return -1;
  for(let r=fromR;r<=targetR;r++){
    if(!canEnterCell(mat,idx(c,r)))return -1;
  }
  return targetR;
}

function orderedSides(c,r){
  return ((c+r+simTick)&1)?[1,-1]:[-1,1];
}

function preferredSides(c,r,mat,rule=FLOW_RULES[mat]){
  if(!materialUsesDirectedFlow(mat)||rule.persistentDirection===false)return orderedSides(c,r);
  const i=idx(c,r),dir=flowDir[i]||randDir();
  flowDir[i]=dir;
  return[dir,-dir];
}

function tryMoveWithDirection(c,r,nc,nr,mat,dir){
  const from=idx(c,r);
  if(materialUsesDirectedFlow(mat))flowDir[from]=dir<0?-1:1;
  return tryMove(c,r,nc,nr,mat);
}

function canSlideFromSlopeBoundary(c,r,mat,rule,dir){
  if(isSurfaceCell(c,r,mat))return true;
  if(!rule.slideFromExposedSide)return false;
  const nc=c+dir;
  return inBounds(nc,r)&&canEnterCell(mat,idx(nc,r));
}

function canGravitySlideBySlope(c,r,mat,rule,dir){
  if(!rule.slideRequiresSlope)return true;
  if(!canSlideFromSlopeBoundary(c,r,mat,rule,dir))return false;
  const nc=c+dir;
  if(nc<0||nc>=cols)return true;
  const targetSurface=slopeSurfaceRow(nc,r,mat,rule);
  return targetSurface-r>allowedSlopeDiff(rule,1);
}

function tryGravity(c,r,mat,rule){
  const i=idx(c,r);
  vy[i]=Math.min(5,vy[i]+rule.gravity);
  if(tryMove(c,r,c,r+1,mat))return true;
  if(!rule.slides)return false;
  const sides=preferredSides(c,r,mat,rule);
  return (canGravitySlideBySlope(c,r,mat,rule,sides[0])&&tryMoveWithDirection(c,r,c+sides[0],r+1,mat,sides[0]))
    ||(canGravitySlideBySlope(c,r,mat,rule,sides[1])&&tryMoveWithDirection(c,r,c+sides[1],r+1,mat,sides[1]));
}

function canDropFrom(c,r,mat){
  const targets=[[c,r+1],[c-1,r+1],[c+1,r+1]];
  for(const [nc,nr]of targets){
    if(!inBounds(nc,nr))return true;
    if(canEnterCell(mat,idx(nc,nr)))return true;
  }
  return false;
}

function canScanEscapeThrough(c,r,mat){
  if(!inBounds(c,r))return true;
  const i=idx(c,r);
  if(isBlockedCell(i))return false;
  const target=material[i];
  return target===EMPTY||target===mat||materialDensity(mat)>materialDensity(target);
}

function scanDropEscapeSide(c,r,mat,dir,limit){
  for(let d=1;d<=limit;d++){
    const nc=c+dir*d;
    if(!inBounds(nc,r))return{dir,targetC:clamp(nc,0,cols-1),distance:d};
    if(!canScanEscapeThrough(nc,r,mat))return null;
    if(canDropFrom(nc,r,mat))return{dir,targetC:nc,distance:d};
  }
  return null;
}

function findDropEscape(c,r,mat,rule){
  const limit=rule.escapeScanDistance||0;
  if(limit<=0)return null;
  const left=scanDropEscapeSide(c,r,mat,-1,limit),right=scanDropEscapeSide(c,r,mat,1,limit);
  if(left&&right){
    if(left.distance!==right.distance)return left.distance<right.distance?left:right;
    return randDir()<0?left:right;
  }
  return left||right;
}

function isIsolatedSurfaceCell(c,r,mat){
  return isFluidMaterial(mat)&&isSurfaceCell(c,r,mat)
    &&(!inBounds(c-1,r)||material[idx(c-1,r)]!==mat)
    &&(!inBounds(c+1,r)||material[idx(c+1,r)]!==mat)
    &&!canDropFrom(c,r,mat);
}

function horizontalEnterDir(c,r,mat,dir){
  const nc=c+dir;
  return inBounds(nc,r)&&canEnterCell(mat,idx(nc,r));
}

function chooseSinglePixelWanderDir(c,r,mat,preferredDir=0){
  const preferred=preferredDir<0?-1:preferredDir>0?1:0;
  if(preferred&&horizontalEnterDir(c,r,mat,preferred))return preferred;
  const left=horizontalEnterDir(c,r,mat,-1),right=horizontalEnterDir(c,r,mat,1);
  if(left&&right)return randDir();
  if(left)return -1;
  if(right)return 1;
  return 0;
}

function armSinglePixelWander(c,r,mat){
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

function tryEscapeMove(c,r,mat,rule){
  if(!rule.escapeScanDistance)return false;
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

function trySinglePixelWanderMove(c,r,mat,rule){
  if(!rule.escapeScanDistance)return false;
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

function tryArmIsolatedSurfaceEscape(c,r,mat,rule){
  if(!rule.escapeScanDistance||!isFluidMaterial(mat))return false;
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

function trySlopeRelax(c,r,mat,rule){
  if(!isSurfaceCell(c,r,mat))return false;
  const sides=preferredSides(c,r,mat,rule);
  const lookahead=rule.slopeLookahead||1;
  let bestDc=0,bestR=r,bestExcess=0,bestDiff=0;
  for(const dc of sides){
    for(let distance=1;distance<=lookahead;distance++){
      const nc=c+dc*distance;
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
  return tryMoveWithDirection(c,r,c+bestDc,bestR,mat,bestDc);
}

function waterSurfaceLevelPass(){
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

function tryVelocityMove(c,r,mat){
  const i=idx(c,r),ax=Math.abs(vx[i]),ay=Math.abs(vy[i]);
  if(ax<.32&&ay<.32)return false;
  if(ax>=ay&&tryMove(c,r,c+Math.sign(vx[i]),r,mat))return true;
  if(ay>ax&&tryMove(c,r,c,r+Math.sign(vy[i]),mat))return true;
  return false;
}

function canMoveToCandidate(mat,nc,nr){
  if(!inBounds(nc,nr))return true;
  return canEnterCell(mat,idx(nc,nr));
}

function hasGravityCandidate(c,r,mat,rule){
  if(canMoveToCandidate(mat,c,r+1))return true;
  if(!rule.slides)return false;
  for(const dc of[-1,1]){
    if(canGravitySlideBySlope(c,r,mat,rule,dc)&&canMoveToCandidate(mat,c+dc,r+1))return true;
  }
  return false;
}

function hasSlopeCandidate(c,r,mat,rule){
  if(!isSurfaceCell(c,r,mat))return false;
  for(const dc of[-1,1]){
    const lookahead=rule.slopeLookahead||1;
    for(let distance=1;distance<=lookahead;distance++){
      const nc=c+dc*distance;
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

function hasVelocityCandidate(c,r,mat){
  const i=idx(c,r),ax=Math.abs(vx[i]),ay=Math.abs(vy[i]);
  if(ax<STABLE_SPEED&&ay<STABLE_SPEED)return false;
  if(ax>=ay&&canMoveToCandidate(mat,c+Math.sign(vx[i]),r))return true;
  if(ay>ax&&canMoveToCandidate(mat,c,r+Math.sign(vy[i])))return true;
  return true;
}

function flowCellHasPotentialAction(c,r,mat){
  const i=idx(c,r);
  if(material[i]!==mat)return false;
  const rule=FLOW_RULES[mat];
  return hasVelocityCandidate(c,r,mat)||hasGravityCandidate(c,r,mat,rule)||hasSlopeCandidate(c,r,mat,rule);
}

function canWaterSleepAt(i){
  return material[i]===WATER&&waterBasinMark[i]&&!waterSleepBlockMark[i];
}

function updateMaterialStability(){
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

function deleteOscillatingCells(){
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

function nextWaterComponentToken(){
  waterComponentToken++;
  if(waterComponentToken>65000){
    waterComponentMark.fill(0);
    waterComponentToken=1;
  }
  return waterComponentToken;
}

function nextWaterBasinToken(){
  waterBasinToken++;
  if(waterBasinToken>65000){
    waterBasinMark.fill(0);
    waterBasinToken=1;
  }
  return waterBasinToken;
}

function nextWaterTargetToken(){
  waterTargetToken++;
  if(waterTargetToken>65000){
    waterTargetMark.fill(0);
    waterTargetToken=1;
  }
  return waterTargetToken;
}

function canWaterSettleThrough(i,componentToken){
  return !isBlockedCell(i)&&(material[i]===EMPTY||waterComponentMark[i]===componentToken);
}

function canReachWaterSettleCell(fromR,nr,ni,componentToken){
  if(!canWaterSettleThrough(ni,componentToken))return false;
  if(nr>=fromR)return true;
  return waterComponentMark[ni]===componentToken;
}

function waterSurfaceLimit(cells){
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

function collectWaterComponent(start){
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

function markReachableWaterSpace(start,topLimit,componentToken,basinToken){
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

function isDrainCell(c,r){
  return r===rows-1||c===0||c===cols-1;
}

function canUseSettledWaterSlot(i,spaceToken,componentToken){
  return waterSpaceMark[i]===spaceToken&&!isBlockedCell(i)&&(material[i]===EMPTY||waterComponentMark[i]===componentToken);
}

function countTargetWaterSlots(r,spaceToken,componentToken){
  const base=r*cols;
  let n=0;
  for(let c=0;c<cols;c++)if(canUseSettledWaterSlot(base+c,spaceToken,componentToken))n++;
  return n;
}

function placeSettledWater(i){
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

function collectWaterRowTargets(r,spaceToken,componentToken,limit,centerC,targetToken,targets){
  const slots=countTargetWaterSlots(r,spaceToken,componentToken);
  if(!slots||limit<=0)return 0;
  const base=r*cols,toPlace=Math.min(slots,limit);
  let placed=0;
  function addTarget(c){
    const i=base+c;
    if(!canUseSettledWaterSlot(i,spaceToken,componentToken)||waterTargetMark[i]===targetToken)return false;
    waterTargetMark[i]=targetToken;
    targets.push(i);
    placed++;
    return true;
  }
  if(toPlace===slots){
    for(let c=0;c<cols;c++){
      if(placed>=toPlace)break;
      addTarget(c);
    }
    return placed;
  }
  const center=clamp(Math.round(centerC),0,cols-1);
  for(let step=0;step<cols&&placed<toPlace;step++){
    const candidates=step===0?[center]:[center-step,center+step];
    for(const c of candidates){
      if(c<0||c>=cols||placed>=toPlace)continue;
      addTarget(c);
    }
  }
  return placed;
}

function collectSettledWaterTargets(region,componentToken,topLimit){
  const targetToken=nextWaterTargetToken(),targets=[];
  let remaining=region.waterCount;
  for(let r=rows-1;r>=topLimit&&remaining>0;r--){
    remaining-=collectWaterRowTargets(r,region.token,componentToken,remaining,region.centerC,targetToken,targets);
  }
  return{targets,targetToken,remaining};
}

function waterRegionAlreadySettled(region,componentToken,targetToken,targets){
  if(targets.length!==region.waterCount)return false;
  for(const i of region.cells){
    if(waterComponentMark[i]===componentToken&&material[i]===WATER&&waterTargetMark[i]!==targetToken)return false;
  }
  for(const i of targets){
    if(!(waterComponentMark[i]===componentToken&&material[i]===WATER))return false;
  }
  return true;
}

function markWaterRegionStable(region,componentToken){
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

function markWaterTargetsStable(targets){
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

function markWaterCellsStable(cells){
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

function collectSurfaceResidue(cells,topLimit){
  const residue=[];
  for(const i of cells){
    if(Math.floor(i/cols)<topLimit)residue.push(i);
  }
  return residue;
}

function deleteSurfaceResidue(residue){
  for(const i of residue){
    if(material[i]===WATER)deleteCell(i);
  }
}

function isWaterTrayBlocker(c,r){
  if(!inBounds(c,r))return false;
  const i=idx(c,r);
  const m=normalizeMaterialCell(i);
  return bodyMask[i]||isSolidMaterial(m)||(m!==EMPTY&&m!==WATER);
}

function isWaterTraySlot(c,r){
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

function collectWaterTrayGroups(){
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

function placeTrayWater(i,stable=true){
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

function buildWaterTrayInfo(intervals){
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

function buildWaterBasins(){
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

function canTraverseBasinIntake(i,basinId){
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

function collectWaterBasinIntake(info){
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

function collectBasinOverflow(info){
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

function basinOverflowSide(info){
  const leftLip=basinSideWallTop(info,-1),rightLip=basinSideWallTop(info,1);
  if(leftLip!==rightLip)return rightLip>leftLip?1:-1;
  let leftScore=0,rightScore=0;
  for(const span of info.intervals){
    if(!isWaterTrayBlocker(span.left-1,span.r))leftScore++;
    if(!isWaterTrayBlocker(span.right+1,span.r))rightScore++;
  }
  if(leftScore||rightScore)return rightScore>=leftScore?1:-1;
  const leftDrop=nearestDropOutsideBasin(info,-1),rightDrop=nearestDropOutsideBasin(info,1);
  if(rightDrop!==leftDrop)return rightDrop<leftDrop?1:-1;
  return info.maxC>cols-1-info.minC?1:-1;
}

function basinSideWallTop(info,dir){
  const sideC=dir>0?info.maxC+1:info.minC-1;
  let top=rows,seen=false;
  const minR=Math.max(0,info.topRow-WATER_BASIN_INTAKE_HEIGHT);
  for(let r=info.bottomRow;r>=minR;r--){
    if(isWaterTrayBlocker(sideC,r)){
      seen=true;
      top=r;
    }else if(seen){
      break;
    }
  }
  return seen?top:rows;
}

function nearestDropOutsideBasin(info,dir){
  const edge=dir>0?info.maxC:info.minC;
  for(let step=1;step<=WATER_BASIN_OVERFLOW_RUNOUT;step++){
    const c=edge+dir*step;
    if(c<0||c>=cols)return step;
    for(let r=info.topRow;r<=info.bottomRow;r++){
      const i=idx(c,r);
      if(isBlockedCell(i))continue;
      const below=inBounds(c,r+1)?idx(c,r+1):-1;
      if(!inBounds(c,r+1)||canEnterCell(WATER,below))return step;
    }
  }
  return Infinity;
}

function pushWaterAlongBasinOverflow(info){
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

function transferBasinOverflow(basins){
  let changed=false;
  const sorted=basins.slice().sort((a,b)=>a.topRow-b.topRow);
  const byTarget=new Map(),usedByBasin=new Map();
  for(const source of sorted){
    const overflow=collectBasinOverflow(source);
    if(!overflow.length)continue;
    for(const i of overflow){
      const target=findDownstreamBasinForCell(i%cols,Math.floor(i/cols),source,basins,usedByBasin);
      if(!target)continue;
      if(!byTarget.has(target.id))byTarget.set(target.id,{info:target,cells:[]});
      byTarget.get(target.id).cells.push(i);
      usedByBasin.set(target.id,(usedByBasin.get(target.id)||0)+1);
    }
  }
  for(const entry of byTarget.values()){
    if(settleWaterTray(entry.info,entry.cells))changed=true;
  }
  return changed;
}

function basinTargetHasOutlet(i,basinId,targetToken){
  const c=i%cols,r=Math.floor(i/cols),ns=[
    [c,r+1],
    [c-1,r+1],
    [c+1,r+1]
  ];
  for(const [nc,nr]of ns){
    if(!inBounds(nc,nr))return true;
    const ni=idx(nc,nr);
    if(waterBasinMark[ni]===basinId||waterTargetMark[ni]===targetToken)continue;
    if(canEnterCell(WATER,ni))return true;
  }
  return false;
}

function basinSlotHasRawOutlet(i,basinId){
  const c=i%cols,r=Math.floor(i/cols),ns=[
    [c,r+1],
    [c-1,r+1],
    [c+1,r+1]
  ];
  for(const [nc,nr]of ns){
    if(!inBounds(nc,nr))return true;
    const ni=idx(nc,nr);
    if(waterBasinMark[ni]===basinId)continue;
    if(canEnterCell(WATER,ni))return true;
  }
  return false;
}

function markTrayTargetsRestState(targets,info,targetToken){
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

function settleWaterTray(info,intake=[]){
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

function waterTraySettlePass(){
  let changed=false;
  for(let pass=0;pass<WATER_BASIN_SETTLE_PASSES;pass++){
    const basins=buildWaterBasins();
    if(!basins.length)break;
    for(const info of basins){
      const intake=collectWaterBasinIntake(info);
      if(settleWaterTray(info,intake))changed=true;
    }
    const refreshed=buildWaterBasins();
    if(refreshed.length&&transferBasinOverflow(refreshed))changed=true;
    const pushed=buildWaterBasins();
    for(const info of pushed)if(pushWaterAlongBasinOverflow(info))changed=true;
  }
  return changed;
}

function settleWaterRegion(region,componentToken,topLimit){
  // Whole-basin rewrites happen here. Always compute targets first, compare
  // against current cells, then write only if the target shape truly changes.
  if(region.touchesDrain)return{closed:false,settled:false};
  if(region.waterCount<2)return{closed:true,settled:false};
  const plan=collectSettledWaterTargets(region,componentToken,topLimit);
  if(plan.remaining>0)return{closed:true,settled:false};
  if(waterRegionAlreadySettled(region,componentToken,plan.targetToken,plan.targets)){
    markWaterRegionStable(region,componentToken);
    return{closed:true,settled:true};
  }
  for(const i of region.cells){
    if(waterComponentMark[i]===componentToken&&material[i]===WATER)deleteCell(i);
  }
  for(const i of plan.targets)placeSettledWater(i);
  markWaterTargetsStable(plan.targets);
  return{closed:true,settled:true};
}

function settleWaterComponent(cells){
  // Local water movement is intentionally overridden by this component pass once
  // a basin can be packed into a stable target shape.
  if(cells.length<2)return;
  let allStable=true;
  for(const i of cells){
    if(!stableMask[i]){
      allStable=false;
      break;
    }
  }
  if(allStable)return;
  const topLimit=waterSurfaceLimit(cells),componentToken=nextWaterComponentToken(),basinToken=nextWaterBasinToken();
  for(const i of cells)waterComponentMark[i]=componentToken;
  const residue=collectSurfaceResidue(cells,topLimit);
  let sawRegion=false,allRegionsClosed=true,allClosedRegionsSettled=true;
  for(const i of cells){
    const r=Math.floor(i/cols);
    if(r<topLimit||waterBasinMark[i]===basinToken)continue;
    sawRegion=true;
    const result=settleWaterRegion(markReachableWaterSpace(i,topLimit,componentToken,basinToken),componentToken,topLimit);
    if(!result.closed)allRegionsClosed=false;
    if(result.closed&&!result.settled)allClosedRegionsSettled=false;
  }
  if(sawRegion&&allRegionsClosed&&allClosedRegionsSettled&&residue.length&&residue.length<=waterResidueLimit(cells.length)){
    deleteSurfaceResidue(residue);
    markWaterCellsStable(cells);
  }
}

function waterSettlePass(){
  waterSeen.fill(0);
  for(let i=0;i<count;i++){
    if(waterSeen[i]||material[i]!==WATER)continue;
    settleWaterComponent(collectWaterComponent(i));
  }
}

function updateFlowCell(c,r,mat){
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
function drainOpenBoundaries(){
  // The canvas is an open boundary for flow materials: edge cells have already
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

function updateGridMaterials(){
  if(typeof applySources==='function')applySources();
  const order=[...Array(cols).keys()];
  for(const mat of FLOW_ORDER){
    const rule=FLOW_RULES[mat];
    for(let pass=0;pass<rule.passes;pass++){
      if(Math.random()<.5)order.reverse();
      for(let r=rows-1;r>=0;r--)for(const c of order)updateFlowCell(c,r,mat);
    }
  }
  // The old basin stabilizer stays available for debug and experiments. The
  // default water rule now uses the shared local low-slope fluid flow.
  if(FLOW_RULES[WATER].useBasinSettle!==false)waterTraySettlePass();
  if(FLOW_RULES[WATER].useSurfaceLevelPass!==false)waterSurfaceLevelPass();
  if(typeof applyErosionPass==='function')applyErosionPass();
  deleteOscillatingCells();
  drainOpenBoundaries();
  updateMaterialStability();
  if(typeof updateCarryLifetimes==='function')updateCarryLifetimes();
}
