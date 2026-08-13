'use strict';

// Infinite material sources live on a separate location layer. They do not
// block movement or change material cells until their location becomes empty.

function canSourceMaterial(mat){
  return mat!==EMPTY&&isKnownMaterial(mat)&&isFlowMaterial(mat);
}

function sourceHasWorldArg(value){
  return !!(value&&typeof value==='object'&&value.arrays&&Number.isFinite(value.cols)&&Number.isFinite(value.rows));
}

function sourceIndex(world,c,r){
  return r*world.cols+c;
}

function sourceInBounds(world,c,r){
  return c>=0&&c<world.cols&&r>=0&&r<world.rows;
}

function sourcePointToCell(world,x,y){
  const size=Math.max(1,world.cellSize||1);
  return{
    c:Math.max(0,Math.min(world.cols-1,Math.floor(x/size))),
    r:Math.max(0,Math.min(world.rows-1,Math.floor(y/size)))
  };
}

function forEachSourceLinePoint(world,a,b,visit){
  const size=sourceHasWorldArg(world)?Math.max(1,world.cellSize||1):cellSize;
  const dist=Math.hypot(b.x-a.x,b.y-a.y),n=Math.max(1,Math.ceil(dist/Math.max(1,size*.55)));
  for(let k=0;k<=n;k++){
    const t=k/n;
    visit(a.x+(b.x-a.x)*t,a.y+(b.y-a.y)*t);
  }
}

function countSourceCells(worldOrMat,maybeMat){
  if(maybeMat!==undefined&&sourceHasWorldArg(worldOrMat)){
    const mat=maybeMat;
    let total=0;
    const source=worldOrMat.arrays.sourceMat;
    for(let i=0;i<worldOrMat.count;i++)if(source[i]===mat)total++;
    return total;
  }
  const mat=maybeMat!==undefined?maybeMat:worldOrMat;
  let total=0;
  for(let i=0;i<count;i++)if(sourceMat[i]===mat)total++;
  return total;
}

function setSourceCell(worldOrC,cOrR,rOrMat,maybeMat){
  if(maybeMat!==undefined&&sourceHasWorldArg(worldOrC)){
    const world=worldOrC,c=cOrR,r=rOrMat,mat=maybeMat;
    if(!sourceInBounds(world,c,r)||!canSourceMaterial(mat))return false;
    world.arrays.sourceMat[sourceIndex(world,c,r)]=mat;
    return true;
  }
  const c=worldOrC,r=cOrR,mat=rOrMat;
  if(!inBounds(c,r)||!canSourceMaterial(mat))return false;
  sourceMat[idx(c,r)]=mat;
  return true;
}

function normalizeSourceStampArgs(worldOrX,xOrY,yOrRad,radOrMat,maybeMat){
  if(maybeMat!==undefined){
    return{world:sourceHasWorldArg(worldOrX)?worldOrX:null,x:xOrY,y:yOrRad,rad:radOrMat,mat:maybeMat};
  }
  return{world:null,x:worldOrX,y:xOrY,rad:yOrRad,mat:radOrMat};
}

function stampSourceAt(worldOrX,xOrY,yOrRad,radOrMat,maybeMat){
  const args=normalizeSourceStampArgs(worldOrX,xOrY,yOrRad,radOrMat,maybeMat),x=args.x,y=args.y,rad=args.rad,mat=args.mat,world=args.world;
  const p=world?sourcePointToCell(world,x,y):pointToCell(x,y),r2=rad*rad;
  let painted=0;
  for(let rr=p.r-rad;rr<=p.r+rad;rr++)for(let cc=p.c-rad;cc<=p.c+rad;cc++){
    if(world?!sourceInBounds(world,cc,rr):!inBounds(cc,rr))continue;
    const dx=cc-p.c,dy=rr-p.r;
    if(dx*dx+dy*dy<=r2&&(world?setSourceCell(world,cc,rr,mat):setSourceCell(cc,rr,mat)))painted++;
  }
  return painted;
}

function normalizeSourceLineArgs(worldOrA,aOrB,bOrRad,radOrMat,maybeMat){
  if(maybeMat!==undefined){
    return{world:sourceHasWorldArg(worldOrA)?worldOrA:null,a:aOrB,b:bOrRad,rad:radOrMat,mat:maybeMat};
  }
  return{world:null,a:worldOrA,b:aOrB,rad:bOrRad,mat:radOrMat};
}

function drawSourceLine(worldOrA,aOrB,bOrRad,radOrMat,maybeMat){
  const args=normalizeSourceLineArgs(worldOrA,aOrB,bOrRad,radOrMat,maybeMat),a=args.a,b=args.b,rad=args.rad,mat=args.mat;
  let painted=0;
  const lineVisitor=(x,y)=>{painted+=args.world?stampSourceAt(args.world,x,y,rad,mat):stampSourceAt(x,y,rad,mat)};
  if(args.world)forEachSourceLinePoint(args.world,a,b,lineVisitor);
  else forEachLinePoint(a,b,lineVisitor);
  return painted;
}

function drawSourceContinuous(a,b,mat){
  return drawSourceLine(a,b,getBrushRadius(),mat);
}

function sourceIntervalReady(world=null){
  if(sourceHasWorldArg(world)){
    const settings=world.runtimeSettings||{sourceInterval:1};
    const interval=Math.max(1,settings.sourceInterval|0);
    return (world.simTick||0)%interval===0;
  }
  const settings=typeof currentRuntimeSettingsState==='function'?currentRuntimeSettingsState():{sourceInterval};
  const interval=Math.max(1,settings.sourceInterval|0);
  return simTick%interval===0;
}

function placeSourceMaterial(i,mat,world=null){
  if(sourceHasWorldArg(world)){
    const a=world.arrays;
    a.material[i]=mat;
    a.mass[i]=materialCarriesMass(mat)?defaultMassForMaterial(mat):0;
    a.vx[i]=0;
    a.vy[i]=0;
    a.flowDir[i]=defaultFlowDirForMaterial(mat);
    a.tintR[i]=0;
    a.tintG[i]=0;
    a.tintB[i]=0;
    a.tintA[i]=0;
    a.moveHistory[i]=-1;
    a.moveFlip[i]=0;
    a.horizontalDir[i]=0;
    a.horizontalTurns[i]=0;
    a.escapeDir[i]=0;
    a.escapeTarget[i]=-1;
    a.carriedBy[i]=0;
    a.carriedTTL[i]=0;
    a.lastMoveTick[i]=0;
    a.restAge[i]=0;
    a.stableMask[i]=0;
    return;
  }
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
  if(sourceHasWorldArg(world)){
    const a=world.arrays;
    if(!sourceIntervalReady(world))return;
    for(let i=0;i<world.count;i++){
      const mat=a.sourceMat[i];
      if(mat===EMPTY)continue;
      if(!canSourceMaterial(mat)){
        a.sourceMat[i]=EMPTY;
        continue;
      }
      if(a.bodyMask[i]||a.material[i]!==EMPTY)continue;
      placeSourceMaterial(i,mat,world);
    }
    return;
  }
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
