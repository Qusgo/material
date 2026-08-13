'use strict';

// Brush stamps, tinting, erasing, and whole-grid edit commands.
function gridEditHasWorldArg(value){
  return !!(value&&typeof value==='object'&&value.arrays&&Number.isFinite(value.cols));
}
function gridEditIndex(world,c,r){
  return r*world.cols+c;
}
function gridEditInBounds(world,c,r){
  return c>=0&&c<world.cols&&r>=0&&r<world.rows;
}
function gridEditPointToCell(world,x,y){
  const size=Math.max(1,world.cellSize||1);
  return{
    c:clamp(Math.floor(x/size),0,world.cols-1),
    r:clamp(Math.floor(y/size),0,world.rows-1)
  };
}
function forEachGridLinePoint(world,a,b,visit){
  const size=gridEditHasWorldArg(world)?Math.max(1,world.cellSize||1):cellSize;
  const dist=Math.hypot(b.x-a.x,b.y-a.y),n=Math.max(1,Math.ceil(dist/Math.max(1,size*.55)));
  for(let k=0;k<=n;k++){
    const t=k/n;
    visit(a.x+(b.x-a.x)*t,a.y+(b.y-a.y)*t);
  }
}
function clearSimulationState(world){
  if(gridEditHasWorldArg(world)){
    if(typeof currentWorldState==='function'&&currentWorldState()===world){
      if(typeof setAirColorState==='function')setAirColorState();
      else airColor=[255,255,255];
      clearEditableGridState(world);
      if(typeof setBodyRuntimeState==='function')setBodyRuntimeState();
      else bodies=[];
      if(typeof setEditDirtyState==='function')setEditDirtyState(false);
      else editDirty=false;
      return;
    }
    world.airColor=[255,255,255];
    clearEditableGridState(world);
    world.bodies=[];
    world.nextBodyId=1;
    world.editDirty=false;
    return;
  }
  if(typeof setAirColorState==='function')setAirColorState();
  else airColor=[255,255,255];
  clearEditableGridState();
  if(typeof setBodyRuntimeState==='function')setBodyRuntimeState();
  else bodies=[];
  if(typeof setEditDirtyState==='function')setEditDirtyState(false);
  else editDirty=false;
}
function setAllAirColor(worldOrColor,maybeColor){
  if(gridEditHasWorldArg(worldOrColor)){
    const color=maybeColor,next=Array.isArray(color)?color:[255,255,255];
    const normalized=[clampInt(next[0],0,255,255),clampInt(next[1],0,255,255),clampInt(next[2],0,255,255)];
    if(typeof currentWorldState==='function'&&currentWorldState()===worldOrColor&&typeof setAirColorState==='function')setAirColorState(normalized);
    else worldOrColor.airColor=normalized;
    const a=worldOrColor.arrays;
    a.bgTintR.fill(0);
    a.bgTintG.fill(0);
    a.bgTintB.fill(0);
    a.bgTintA.fill(0);
    worldOrColor.editDirty=true;
    return;
  }
  const color=worldOrColor;
  const next=typeof setAirColorState==='function'?setAirColorState(color):(Array.isArray(color)?color:[255,255,255]);
  if(typeof setAirColorState!=='function')airColor=[clampInt(next[0],0,255,255),clampInt(next[1],0,255,255),clampInt(next[2],0,255,255)];
  bgTintR.fill(0);
  bgTintG.fill(0);
  bgTintB.fill(0);
  bgTintA.fill(0);
}
function setTintCell(c,r,color){
  if(!inBounds(c,r))return;
  const i=idx(c,r);
  if(material[i]===EMPTY){
    bgTintR[i]=color[0];
    bgTintG[i]=color[1];
    bgTintB[i]=color[2];
    bgTintA[i]=255;
    clearParticleTint(i);
  }else{
    tintR[i]=color[0];
    tintG[i]=color[1];
    tintB[i]=color[2];
    tintA[i]=255;
  }
}
function setTintCellInWorld(world,c,r,color){
  if(!gridEditInBounds(world,c,r))return;
  const a=world.arrays,i=gridEditIndex(world,c,r);
  if(a.material[i]===EMPTY){
    a.bgTintR[i]=color[0];
    a.bgTintG[i]=color[1];
    a.bgTintB[i]=color[2];
    a.bgTintA[i]=255;
    clearParticleTintInWorld(world,i);
  }else{
    a.tintR[i]=color[0];
    a.tintG[i]=color[1];
    a.tintB[i]=color[2];
    a.tintA[i]=255;
  }
  world.editDirty=true;
}
function normalizeGridStampArgs(worldOrX,xOrY,yOrRad,radOrMat,matOrWakeToken,maybeWakeToken){
  if(gridEditHasWorldArg(worldOrX)){
    return{world:worldOrX,x:xOrY,y:yOrRad,rad:radOrMat,mat:matOrWakeToken,wakeToken:maybeWakeToken};
  }
  return{world:null,x:worldOrX,y:xOrY,rad:yOrRad,mat:radOrMat,wakeToken:matOrWakeToken};
}
function stampAt(worldOrX,xOrY,yOrRad,radOrMat,matOrWakeToken,maybeWakeToken){
  const args=normalizeGridStampArgs(worldOrX,xOrY,yOrRad,radOrMat,matOrWakeToken,maybeWakeToken),x=args.x,y=args.y,rad=args.rad,mat=args.mat,wakeToken=args.wakeToken===undefined?nextWaterWakeToken():args.wakeToken;
  const p=args.world?gridEditPointToCell(args.world,x,y):pointToCell(x,y),r2=rad*rad;
  for(let rr=p.r-rad;rr<=p.r+rad;rr++)for(let cc=p.c-rad;cc<=p.c+rad;cc++){
    if(args.world?!gridEditInBounds(args.world,cc,rr):!inBounds(cc,rr))continue;
    const dx=cc-p.c,dy=rr-p.r;
    if(dx*dx+dy*dy<=r2){
      if(args.world)writeCell(args.world,cc,rr,mat,wakeToken);
      else writeCell(cc,rr,mat,wakeToken);
    }
  }
}
function normalizeGridTintStampArgs(worldOrX,xOrY,yOrRad,radOrColor,maybeColor){
  if(gridEditHasWorldArg(worldOrX))return{world:worldOrX,x:xOrY,y:yOrRad,rad:radOrColor,color:maybeColor};
  return{world:null,x:worldOrX,y:xOrY,rad:yOrRad,color:radOrColor};
}
function stampTintAt(worldOrX,xOrY,yOrRad,radOrColor,maybeColor){
  const args=normalizeGridTintStampArgs(worldOrX,xOrY,yOrRad,radOrColor,maybeColor),x=args.x,y=args.y,rad=args.rad,color=args.color;
  const p=args.world?gridEditPointToCell(args.world,x,y):pointToCell(x,y),r2=rad*rad;
  for(let rr=p.r-rad;rr<=p.r+rad;rr++)for(let cc=p.c-rad;cc<=p.c+rad;cc++){
    if(args.world?!gridEditInBounds(args.world,cc,rr):!inBounds(cc,rr))continue;
    const dx=cc-p.c,dy=rr-p.r;
    if(dx*dx+dy*dy<=r2){
      if(args.world)setTintCellInWorld(args.world,cc,rr,color);
      else setTintCell(cc,rr,color);
    }
  }
}
function forEachLinePoint(a,b,visit){const dist=Math.hypot(b.x-a.x,b.y-a.y),n=Math.max(1,Math.ceil(dist/Math.max(1,cellSize*.55)));for(let k=0;k<=n;k++){const t=k/n;visit(a.x+(b.x-a.x)*t,a.y+(b.y-a.y)*t)}}
function normalizeGridLineArgs(worldOrA,aOrB,bOrRad,radOrMat,matOrWakeToken,maybeWakeToken){
  if(gridEditHasWorldArg(worldOrA)){
    return{world:worldOrA,a:aOrB,b:bOrRad,rad:radOrMat,mat:matOrWakeToken,wakeToken:maybeWakeToken};
  }
  return{world:null,a:worldOrA,b:aOrB,rad:bOrRad,mat:radOrMat,wakeToken:matOrWakeToken};
}
function drawMaterialLine(worldOrA,aOrB,bOrRad,radOrMat,matOrWakeToken,maybeWakeToken){
  const args=normalizeGridLineArgs(worldOrA,aOrB,bOrRad,radOrMat,matOrWakeToken,maybeWakeToken),wakeToken=args.wakeToken===undefined?nextWaterWakeToken():args.wakeToken;
  const visit=(x,y)=>args.world?stampAt(args.world,x,y,args.rad,args.mat,wakeToken):stampAt(x,y,args.rad,args.mat,wakeToken);
  if(args.world)forEachGridLinePoint(args.world,args.a,args.b,visit);
  else forEachLinePoint(args.a,args.b,visit);
}
function normalizeGridTintLineArgs(worldOrA,aOrB,bOrRad,radOrColor,maybeColor){
  if(gridEditHasWorldArg(worldOrA))return{world:worldOrA,a:aOrB,b:bOrRad,rad:radOrColor,color:maybeColor};
  return{world:null,a:worldOrA,b:aOrB,rad:bOrRad,color:radOrColor};
}
function drawTintLine(worldOrA,aOrB,bOrRad,radOrColor,maybeColor){
  const args=normalizeGridTintLineArgs(worldOrA,aOrB,bOrRad,radOrColor,maybeColor);
  const visit=(x,y)=>args.world?stampTintAt(args.world,x,y,args.rad,args.color):stampTintAt(x,y,args.rad,args.color);
  if(args.world)forEachGridLinePoint(args.world,args.a,args.b,visit);
  else forEachLinePoint(args.a,args.b,visit);
}
function drawContinuous(a,b,mat){drawMaterialLine(a,b,getBrushRadius(),mat)}
function drawTintContinuous(a,b,color){drawTintLine(a,b,getBrushRadius(),color)}
function normalizeGridEraseArgs(worldOrX,xOrY,yOrRad,maybeRad){
  if(gridEditHasWorldArg(worldOrX))return{world:worldOrX,x:xOrY,y:yOrRad,rad:maybeRad};
  return{world:null,x:worldOrX,y:xOrY,rad:yOrRad};
}
function eraseAtRadius(worldOrX,xOrY,yOrRad,maybeRad){
  const args=normalizeGridEraseArgs(worldOrX,xOrY,yOrRad,maybeRad),x=args.x,y=args.y,rad=args.rad;
  const p=args.world?gridEditPointToCell(args.world,x,y):pointToCell(x,y),r2=rad*rad,wakeToken=nextWaterWakeToken();
  for(let rr=p.r-rad;rr<=p.r+rad;rr++)for(let cc=p.c-rad;cc<=p.c+rad;cc++){
    if(args.world?!gridEditInBounds(args.world,cc,rr):!inBounds(cc,rr))continue;
    const dx=cc-p.c,dy=rr-p.r;
    if(dx*dx+dy*dy<=r2){
      if(args.world)clearCell(args.world,cc,rr,wakeToken);
      else clearCell(cc,rr,wakeToken);
    }
  }
  const size=args.world?Math.max(1,args.world.cellSize||1):cellSize,er=rad*size;
  const bodyList=args.world?(args.world.bodies||[]):bodies,before=bodyList.length;
  const kept=bodyList.filter(b=>!bodyIntersectsCircle(b,x,y,er));
  if(kept.length!==before){
    if(args.world){
      args.world.bodies=kept;
      args.world.editDirty=true;
    }else{
      bodies=kept;
      if(typeof setBodyRuntimeState==='function')setBodyRuntimeState(bodies,nextBodyId);
      if(typeof setEditDirtyState==='function')setEditDirtyState(true);
      else editDirty=true;
    }
  }
  if(kept.length!==before){
    if(args.world)rebuildBodyMask(args.world);
    else rebuildBodyMask();
  }
}
function eraseAt(x,y){
  eraseAtRadius(x,y,getEraserRadius());
}
function eraseLine(worldOrA,aOrB,bOrRad,maybeRad){
  const args=gridEditHasWorldArg(worldOrA)?{world:worldOrA,a:aOrB,b:bOrRad,rad:maybeRad}:{world:null,a:worldOrA,b:aOrB,rad:bOrRad};
  const visit=(x,y)=>args.world?eraseAtRadius(args.world,x,y,args.rad):eraseAtRadius(x,y,args.rad);
  if(args.world)forEachGridLinePoint(args.world,args.a,args.b,visit);
  else forEachLinePoint(args.a,args.b,visit);
}
