'use strict';

// Brush stamps, tinting, erasing, and whole-grid edit commands.
function clearSimulationState(){
  if(typeof setAirColorState==='function')setAirColorState();
  else airColor=[255,255,255];
  clearEditableGridState();
  if(typeof setBodyRuntimeState==='function')setBodyRuntimeState();
  else bodies=[];
  if(typeof clearTransientEditUiState==='function')clearTransientEditUiState();
  if(typeof setEditDirtyState==='function')setEditDirtyState(false);
  else editDirty=false;
}
function setAllAirColor(color){
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
function stampAt(x,y,rad,mat,wakeToken=nextWaterWakeToken()){const p=pointToCell(x,y),r2=rad*rad;for(let rr=p.r-rad;rr<=p.r+rad;rr++)for(let cc=p.c-rad;cc<=p.c+rad;cc++){if(!inBounds(cc,rr))continue;const dx=cc-p.c,dy=rr-p.r;if(dx*dx+dy*dy<=r2)writeCell(cc,rr,mat,wakeToken)}}
function stampTintAt(x,y,rad,color){const p=pointToCell(x,y),r2=rad*rad;for(let rr=p.r-rad;rr<=p.r+rad;rr++)for(let cc=p.c-rad;cc<=p.c+rad;cc++){if(!inBounds(cc,rr))continue;const dx=cc-p.c,dy=rr-p.r;if(dx*dx+dy*dy<=r2)setTintCell(cc,rr,color)}}
function forEachLinePoint(a,b,visit){const dist=Math.hypot(b.x-a.x,b.y-a.y),n=Math.max(1,Math.ceil(dist/Math.max(1,cellSize*.55)));for(let k=0;k<=n;k++){const t=k/n;visit(a.x+(b.x-a.x)*t,a.y+(b.y-a.y)*t)}}
function drawMaterialLine(a,b,rad,mat){const wakeToken=nextWaterWakeToken();forEachLinePoint(a,b,(x,y)=>stampAt(x,y,rad,mat,wakeToken))}
function drawTintLine(a,b,rad,color){forEachLinePoint(a,b,(x,y)=>stampTintAt(x,y,rad,color))}
function drawContinuous(a,b,mat){drawMaterialLine(a,b,getBrushRadius(),mat)}
function drawTintContinuous(a,b,color){drawTintLine(a,b,getBrushRadius(),color)}
function eraseAtRadius(x,y,rad){
  const p=pointToCell(x,y),r2=rad*rad,wakeToken=nextWaterWakeToken();
  for(let rr=p.r-rad;rr<=p.r+rad;rr++)for(let cc=p.c-rad;cc<=p.c+rad;cc++){
    if(!inBounds(cc,rr))continue;
    const dx=cc-p.c,dy=rr-p.r;
    if(dx*dx+dy*dy<=r2)clearCell(cc,rr,wakeToken);
  }
  const er=rad*cellSize,before=bodies.length;
  bodies=bodies.filter(b=>!bodyIntersectsCircle(b,x,y,er));
  if(bodies.length!==before){
    if(typeof setBodyRuntimeState==='function')setBodyRuntimeState(bodies,nextBodyId);
    if(typeof setEditDirtyState==='function')setEditDirtyState(true);
    else editDirty=true;
  }
  rebuildBodyMask();
}
function eraseAt(x,y){
  eraseAtRadius(x,y,getEraserRadius());
}
function eraseLine(a,b,rad){forEachLinePoint(a,b,(x,y)=>eraseAtRadius(x,y,rad))}
