'use strict';

// Browser-only app UI state helpers for status, resize, tool selection, and
// canvas coordinate conversion.

function countVisibleMaterials(){
  const counts={flow:0,stone:0,sources:0,waterMass:0,byId:{}};
  for(let i=0;i<count;i++){
    if(isKnownMaterial(sourceMat[i])&&isFlowMaterial(sourceMat[i]))counts.sources++;
    const mat=material[i];
    if(mat===EMPTY)continue;
    if(!isKnownMaterial(mat))continue;
    counts.byId[mat]=(counts.byId[mat]||0)+1;
    if(isFlowMaterial(mat))counts.flow++;
    if(isSolidMaterial(mat))counts.stone++;
    if(materialCarriesMass(mat))counts.waterMass+=mass[i];
  }
  return counts;
}
function updateStatus(){
  const c=countVisibleMaterials();
  statusEl.textContent=`${statusText} | Flow ${c.flow} Stone ${c.stone} Source ${c.sources}`;
}
function resize(){
  // Resizing changes the cell size and reallocates all hot arrays. Existing
  // material is resampled by canvas position rather than copied by raw index.
  const rect=canvas.getBoundingClientRect(),nextW=Math.max(320,Math.floor(rect.width)),nextH=Math.max(240,Math.floor(rect.height)); dpr=Math.max(1,Math.min(2,window.devicePixelRatio||1));
  const newCell=Math.max(4,Math.ceil(Math.max(nextW/CELL_MAX_COLS,nextH/CELL_MAX_ROWS))),newCols=Math.max(1,Math.floor(nextW/newCell)),newRows=Math.max(1,Math.floor(nextH/newCell));
  canvas.width=Math.floor(nextW*dpr); canvas.height=Math.floor(nextH*dpr); ctx.setTransform(dpr,0,0,dpr,0,0); viewW=nextW; viewH=nextH;
  const resized=resizeWorldGrid(newCols,newRows,{cellSize:newCell});
  if(!resized.changed){render();return}
  gridCanvas.width=cols; gridCanvas.height=rows; imageData=gridCtx.createImageData(cols,rows);
  rebuildBodyMask(); render();
}
function canvasPoint(e){const r=canvas.getBoundingClientRect();return{x:clamp(e.clientX-r.left,0,viewW),y:clamp(e.clientY-r.top,0,viewH)}}
function getBrushRadius(){return clampInt(brushSizeInput.value,0,10,4)}
function getEraserRadius(){return typeof eraserSizeInput==='undefined'||!eraserSizeInput?getBrushRadius():clampInt(eraserSizeInput.value,0,10,3)}
function syncButtons(){document.querySelectorAll('[data-tool]').forEach(b=>b.classList.toggle('active',b.dataset.tool===tool));document.querySelectorAll('[data-material]').forEach(b=>b.classList.toggle('active',b.dataset.material===selected));playBtn.textContent=running?'Pause':'Play';if(debugBasinsBtn){debugBasinsBtn.classList.toggle('active',debugBasins);debugBasinsBtn.textContent=debugBasins?'Basins On':'Basins'}if(typeof renderMaterialMenu==='function')renderMaterialMenu()}
function setTool(t){tool=t;fillPreview=[];placing=null;forceState=null;if(tool==='eraser'){running=false;setStatus('Erase: time paused; removes material, tint, and source')}else if(tool==='fill'){running=false;setStatus('Fill: replace one connected region')}else if(tool==='force'){running=false;setStatus('Force: draw an area circle, then an arrow')}else if(tool==='color'){setStatus('Color: tint cells without changing material')}else if(tool==='source'){setStatus('Source: paint an infinite flow-material generator')}else setStatus('Brush: paint material directly');syncButtons();updateFillPreview();render()}
function setSelected(s){selected=s;fillPreview=[];const mat=MATERIAL_FROM_NAME[selected]||WATER;setStatus(isSolidMaterial(mat)?'Stone: fixed stone is drawn':'Material changed');syncButtons();updateFillPreview();render()}
function pauseForEdit(){if(running){running=false;accumulator=0;syncButtons()}}
