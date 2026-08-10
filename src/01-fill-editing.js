'use strict';

// Connected-region fill selection, preview state, and fill application.

let fillPreview=[],fillPreviewMaterial=EMPTY;

function clearFillPreview(){
  fillPreview=[];
  fillPreviewMaterial=EMPTY;
}

function clearTransientEditUiState(){
  clearFillPreview();
  if(typeof clearCanvasInteractionState==='function')clearCanvasInteractionState();
}

function computeFill(c,r){const start=idx(c,r),target=material[start],seen=new Uint8Array(count),queue=new Int32Array(Math.min(count,MAX_FILL_CELLS+1)),out=[];let h=0,t=0;seen[start]=1;queue[t++]=start;while(h<t&&out.length<MAX_FILL_CELLS){const i=queue[h++];out.push(i);const cc=i%cols,rr=Math.floor(i/cols),ns=[i-1,i+1,i-cols,i+cols];for(const ni of ns){if(ni<0||ni>=count||seen[ni])continue;const nc=ni%cols,nr=Math.floor(ni/cols);if(Math.abs(nc-cc)+Math.abs(nr-rr)!==1)continue;if(bodyMask[ni]||material[ni]!==target)continue;seen[ni]=1;if(t<queue.length)queue[t++]=ni}}return{cells:out,target,clipped:h<t||out.length>=MAX_FILL_CELLS}}
function updateFillPreview(hoverPoint=null){clearFillPreview();if(tool!=='fill'||isBodyMaterial()||!hoverPoint)return;const p=pointToCell(hoverPoint.x,hoverPoint.y),res=computeFill(p.c,p.r);fillPreview=res.cells;fillPreviewMaterial=MATERIAL_FROM_NAME[selected]||WATER;if(res.clipped)setStatus('Fill preview reached the cell limit')}
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
  clearFillPreview();
  finishEditAsNewInitialState();
}
