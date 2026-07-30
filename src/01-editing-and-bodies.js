'use strict';

// Drawing, erasing, fill selection, and rigid-body construction/collision helpers.

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
  accumulator=0;
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
function clearSimulationState(){
  airColor=[255,255,255];
  clearEditableGridState();
  bodies=[];
  fillPreview=[];
  placing=null;
  forceState=null;
  editDirty=false;
}
function setAllAirColor(color){
  const next=Array.isArray(color)?color:[255,255,255];
  airColor=[clampInt(next[0],0,255,255),clampInt(next[1],0,255,255),clampInt(next[2],0,255,255)];
  bgTintR.fill(0);
  bgTintG.fill(0);
  bgTintB.fill(0);
  bgTintA.fill(0);
}
function getBrushRadius(){return clampInt(brushSizeInput.value,0,10,4)}
function getEraserRadius(){return typeof eraserSizeInput==='undefined'||!eraserSizeInput?getBrushRadius():clampInt(eraserSizeInput.value,0,10,3)}
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
function drawContinuous(a,b,mat){const rad=getBrushRadius(),dist=Math.hypot(b.x-a.x,b.y-a.y),n=Math.max(1,Math.ceil(dist/Math.max(1,cellSize*.55))),wakeToken=nextWaterWakeToken();for(let k=0;k<=n;k++){const t=k/n;stampAt(a.x+(b.x-a.x)*t,a.y+(b.y-a.y)*t,rad,mat,wakeToken)}}
function drawTintContinuous(a,b,color){const rad=getBrushRadius(),dist=Math.hypot(b.x-a.x,b.y-a.y),n=Math.max(1,Math.ceil(dist/Math.max(1,cellSize*.55)));for(let k=0;k<=n;k++){const t=k/n;stampTintAt(a.x+(b.x-a.x)*t,a.y+(b.y-a.y)*t,rad,color)}}
function eraseAtRadius(x,y,rad){
  const p=pointToCell(x,y),r2=rad*rad,wakeToken=nextWaterWakeToken();
  for(let rr=p.r-rad;rr<=p.r+rad;rr++)for(let cc=p.c-rad;cc<=p.c+rad;cc++){
    if(!inBounds(cc,rr))continue;
    const dx=cc-p.c,dy=rr-p.r;
    if(dx*dx+dy*dy<=r2)clearCell(cc,rr,wakeToken);
  }
  const er=rad*cellSize,before=bodies.length;
  bodies=bodies.filter(b=>!bodyIntersectsCircle(b,x,y,er));
  if(bodies.length!==before)editDirty=true;
  rebuildBodyMask();
}
function eraseAt(x,y){
  eraseAtRadius(x,y,getEraserRadius());
}
function computeFill(c,r){const start=idx(c,r),target=material[start],seen=new Uint8Array(count),queue=new Int32Array(Math.min(count,MAX_FILL_CELLS+1)),out=[];let h=0,t=0;seen[start]=1;queue[t++]=start;while(h<t&&out.length<MAX_FILL_CELLS){const i=queue[h++];out.push(i);const cc=i%cols,rr=Math.floor(i/cols),ns=[i-1,i+1,i-cols,i+cols];for(const ni of ns){if(ni<0||ni>=count||seen[ni])continue;const nc=ni%cols,nr=Math.floor(ni/cols);if(Math.abs(nc-cc)+Math.abs(nr-rr)!==1)continue;if(bodyMask[ni]||material[ni]!==target)continue;seen[ni]=1;if(t<queue.length)queue[t++]=ni}}return{cells:out,target,clipped:h<t||out.length>=MAX_FILL_CELLS}}
function updateFillPreview(){fillPreview=[];if(tool!=='fill'||isBodyMaterial()||!hoverPoint)return;const p=pointToCell(hoverPoint.x,hoverPoint.y),res=computeFill(p.c,p.r);fillPreview=res.cells;fillPreviewMaterial=MATERIAL_FROM_NAME[selected]||WATER;if(res.clipped)setStatus('Fill preview reached the cell limit')}
function fillCells(cells,mat){
  if(!cells.length||!isKnownMaterial(mat)||isBodyMaterial())return 0;
  const wakeToken=nextWaterWakeToken();
  for(const i of cells){
    const c=i%cols,r=Math.floor(i/cols);
    const oldMat=material[i];
    if(oldMat!==mat)editDirty=true;
    if(oldMat!==mat)wakeWaterComponentsAroundCell(c,r,WAKE_RADIUS,wakeToken);
    wakeFlowAroundCell(c,r);
    material[i]=mat;
    mass[i]=defaultMassForMaterial(mat);
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
  return cells.length;
}
function fillAtCell(c,r,mat){
  if(!inBounds(c,r)||!isKnownMaterial(mat)||isBodyMaterial())return 0;
  const res=computeFill(c,r);
  return fillCells(res.cells,mat);
}
function applyFill(){
  if(!fillPreview.length||isBodyMaterial())return;
  const mat=MATERIAL_FROM_NAME[selected]||WATER;
  const filled=fillCells(fillPreview,mat);
  setStatus(`Filled ${filled} cells`);
  fillPreview=[];
  finishEditAsNewInitialState();
}
function makeBodyFromPlacement(p,commit=false){if(!p)return null;const id=commit?nextBodyId++:nextBodyId;if(p.kind==='stoneCircle'){const radius=Math.max(8,Math.hypot(p.current.x-p.start.x,p.current.y-p.start.y)),m=Math.max(1,Math.PI*radius*radius*.012),inertia=.5*m*radius*radius;return{id,type:'circle',x:p.start.x,y:p.start.y,vx:0,vy:0,angle:0,av:0,radius,hw:radius,hh:radius,mass:m,invMass:1/m,inertia,invInertia:1/inertia}}const hw=Math.max(8,Math.abs(p.current.x-p.start.x)/2),hh=Math.max(8,Math.abs(p.current.y-p.start.y)/2),x=(p.current.x+p.start.x)/2,y=(p.current.y+p.start.y)/2,m=Math.max(1,hw*2*hh*2*.012),inertia=m*((hw*2)**2+(hh*2)**2)/12;return{id,type:'rect',x,y,vx:0,vy:0,angle:0,av:0,radius:Math.hypot(hw,hh),hw,hh,mass:m,invMass:1/m,inertia,invInertia:1/inertia}}
function bodyContainsPoint(b,x,y){if(b.type==='circle')return Math.hypot(x-b.x,y-b.y)<=b.radius;const ca=Math.cos(-b.angle),sa=Math.sin(-b.angle),dx=x-b.x,dy=y-b.y,lx=dx*ca-dy*sa,ly=dx*sa+dy*ca;return Math.abs(lx)<=b.hw&&Math.abs(ly)<=b.hh}
function bodyIntersectsCircle(b,x,y,r){if(b.type==='circle')return Math.hypot(x-b.x,y-b.y)<=b.radius+r;const ca=Math.cos(-b.angle),sa=Math.sin(-b.angle),dx=x-b.x,dy=y-b.y,lx=dx*ca-dy*sa,ly=dx*sa+dy*ca,cx=clamp(lx,-b.hw,b.hw),cy=clamp(ly,-b.hh,b.hh);return(lx-cx)**2+(ly-cy)**2<=r*r}
function rectCorners(b){const ca=Math.cos(b.angle),sa=Math.sin(b.angle),pts=[];for(const sx of[-1,1])for(const sy of[-1,1]){const x=sx*b.hw,y=sy*b.hh;pts.push({x:b.x+x*ca-y*sa,y:b.y+x*sa+y*ca})}return pts}
function project(pts,ax,ay){let min=Infinity,max=-Infinity;for(const p of pts){const v=p.x*ax+p.y*ay;min=Math.min(min,v);max=Math.max(max,v)}return{min,max}}
function rectRectOverlap(a,b){const ap=rectCorners(a),bp=rectCorners(b),axes=[];for(const body of[a,b]){const ca=Math.cos(body.angle),sa=Math.sin(body.angle);axes.push({x:ca,y:sa},{x:-sa,y:ca})}for(const axis of axes){const pa=project(ap,axis.x,axis.y),pb=project(bp,axis.x,axis.y);if(pa.max<pb.min||pb.max<pa.min)return false}return true}
function bodiesOverlap(a,b){const broad=a.radius+b.radius,dx=b.x-a.x,dy=b.y-a.y;if(dx*dx+dy*dy>broad*broad)return false;if(a.type==='circle'&&b.type==='circle')return Math.hypot(dx,dy)<broad;if(a.type==='circle'&&b.type==='rect')return bodyIntersectsCircle(b,a.x,a.y,a.radius);if(a.type==='rect'&&b.type==='circle')return bodyIntersectsCircle(a,b.x,b.y,b.radius);return rectRectOverlap(a,b)}
function canPlaceBody(body){if(bodies.length>=BODY_LIMIT)return false;if(body.x-body.radius<0||body.x+body.radius>viewW||body.y-body.radius<0||body.y+body.radius>viewH)return false;return!bodies.some(o=>bodiesOverlap(body,o))}
function clearGridUnderBody(body){const minC=clamp(Math.floor((body.x-body.radius)/cellSize),0,cols-1),maxC=clamp(Math.floor((body.x+body.radius)/cellSize),0,cols-1),minR=clamp(Math.floor((body.y-body.radius)/cellSize),0,rows-1),maxR=clamp(Math.floor((body.y+body.radius)/cellSize),0,rows-1),wakeToken=nextWaterWakeToken();for(let r=minR;r<=maxR;r++)for(let c=minC;c<=maxC;c++){const p=cellCenter(c,r);if(bodyContainsPoint(body,p.x,p.y))clearCell(c,r,wakeToken)}}
function addBody(body){if(!canPlaceBody(body)){setStatus('Dynamic stones cannot overlap or start outside the canvas');return false}clearGridUnderBody(body);bodies.push(body);editDirty=true;rebuildBodyMask();return true}
function rebuildBodyMask(){bodyMask.fill(0);for(const b of bodies){const minC=clamp(Math.floor((b.x-b.radius)/cellSize),0,cols-1),maxC=clamp(Math.floor((b.x+b.radius)/cellSize),0,cols-1),minR=clamp(Math.floor((b.y-b.radius)/cellSize),0,rows-1),maxR=clamp(Math.floor((b.y+b.radius)/cellSize),0,rows-1);for(let r=minR;r<=maxR;r++)for(let c=minC;c<=maxC;c++){const p=cellCenter(c,r);if(bodyContainsPoint(b,p.x,p.y))bodyMask[idx(c,r)]=1}}}
