'use strict';

// Browser-only app UI state helpers for status, resize, tool selection, and
// canvas coordinate conversion.

function countVisibleMaterials(context=appContext){return appVisibleMaterialCounts(context)}
function updateStatus(context=appContext){
  const state=context||appContext,c=countVisibleMaterials(state);
  statusEl.textContent=`${state.statusText} | Flow ${c.flow} Stone ${c.stone} Source ${c.sources}`;
}
function setStatus(t,context=appContext){const state=context||appContext;state.statusText=t;updateStatus(state)}
function setFillPreviewState(cells=[],mat=EMPTY,context=appContext){
  const state=context||appContext;
  state.fillPreview=Array.isArray(cells)?cells:[];
  state.fillPreviewMaterial=mat;
  return state.fillPreview;
}
function clearFillPreview(context=appContext){
  return setFillPreviewState([],EMPTY,context);
}
function currentFillPreview(context=appContext){
  const state=context||appContext;
  return Array.isArray(state.fillPreview)?state.fillPreview:[];
}
function applyBrowserFill(point=appContext.hoverPoint,context=appContext){
  const state=context||appContext;
  const preview=currentFillPreview(state);
  if(!point||!preview.length||appSelectionIsBodyMaterial(state))return 0;
  const mat=appSelectedMaterialId(state),previewCount=preview.length;
  const filled=applyAppEditCommand({type:'fill',x:point.x,y:point.y,material:mat},state)?previewCount:0;
  clearFillPreview(state);
  if(filled>0)finishAppEdit(state);
  return filled;
}
function selectedSourceMaterial(context=appContext){
  const mat=appSelectedMaterialId(context);
  return canSourceMaterial(mat)?mat:EMPTY;
}
function clearTransientEditUiState(context=appContext){
  const state=context||appContext;
  clearFillPreview(state);
  state.pointerDown=false;
  state.lastPoint=null;
  state.hoverPoint=null;
  state.placing=null;
  state.forceState=null;
}
function resize(){
  // Resizing changes the cell size and reallocates all hot arrays. Existing
  // material is resampled by canvas position rather than copied by raw index.
  const rect=canvas.getBoundingClientRect(),nextW=Math.max(320,Math.floor(rect.width)),nextH=Math.max(240,Math.floor(rect.height));
  const nextDpr=Math.max(1,Math.min(2,window.devicePixelRatio||1));
  appContext.dpr=nextDpr;
  const newCell=Math.max(4,Math.ceil(Math.max(nextW/CELL_MAX_COLS,nextH/CELL_MAX_ROWS))),newCols=Math.max(1,Math.floor(nextW/newCell)),newRows=Math.max(1,Math.floor(nextH/newCell));
  canvas.width=Math.floor(nextW*nextDpr); canvas.height=Math.floor(nextH*nextDpr); ctx.setTransform(nextDpr,0,0,nextDpr,0,0); viewW=nextW; viewH=nextH;
  const resized=resizeAppWorld(newCols,newRows,{cellSize:newCell,viewW:nextW,viewH:nextH});
  if(!resized.changed){renderApp();return}
  gridCanvas.width=cols; gridCanvas.height=rows; imageData=gridCtx.createImageData(cols,rows);
  rebuildAppBodyMask(appContext); renderApp();
}
function canvasPoint(e){const r=canvas.getBoundingClientRect();return{x:clamp(e.clientX-r.left,0,viewW),y:clamp(e.clientY-r.top,0,viewH)}}
function getBrushRadius(){return clampInt(brushSizeInput.value,0,10,4)}
function getEraserRadius(){return typeof eraserSizeInput==='undefined'||!eraserSizeInput?getBrushRadius():clampInt(eraserSizeInput.value,0,10,3)}
function updateBrowserFillPreview(point=appContext.hoverPoint,context=appContext){
  const state=context||appContext;
  clearFillPreview(state);
  if(appTool(state)!=='fill'||appSelectionIsBodyMaterial(state)||!point)return null;
  const result=state.engine.computeFill(point);
  setFillPreviewState(result.cells,appSelectedMaterialId(state),state);
  if(result&&result.clipped)setStatus('Fill preview reached the cell limit',state);
  return result;
}
function syncButtons(){const activeTool=appTool(appContext),activeSelected=appSelectedKey(appContext);document.querySelectorAll('[data-tool]').forEach(b=>b.classList.toggle('active',b.dataset.tool===activeTool));document.querySelectorAll('[data-material]').forEach(b=>b.classList.toggle('active',b.dataset.material===activeSelected));playBtn.textContent=appContext.running?'Pause':'Play';if(debugBasinsBtn){debugBasinsBtn.classList.toggle('active',appContext.debugBasins);debugBasinsBtn.textContent=appContext.debugBasins?'Basins On':'Basins'}if(typeof renderMaterialMenu==='function')renderMaterialMenu()}
function setTool(t){const nextTool=setCurrentTool(t);appContext.tool=nextTool;clearTransientEditUiState(appContext);if(nextTool==='eraser'){appContext.running=false;setStatus('Erase: time paused; removes material, tint, and source')}else if(nextTool==='fill'){appContext.running=false;setStatus('Fill: replace one connected region')}else if(nextTool==='force'){appContext.running=false;setStatus('Force: draw an area circle, then an arrow')}else if(nextTool==='color'){setStatus('Color: tint cells without changing material')}else if(nextTool==='source'){setStatus('Source: paint an infinite flow-material generator')}else setStatus('Brush: paint material directly');syncButtons();updateBrowserFillPreview(appContext.hoverPoint,appContext);renderApp()}
function setSelected(s){const nextSelected=setCurrentSelectedKey(s);appContext.selected=nextSelected;clearFillPreview(appContext);const mat=appSelectedMaterialId(appContext);setStatus(isSolidMaterial(mat)?'Stone: fixed stone is drawn':'Material changed');syncButtons();updateBrowserFillPreview(appContext.hoverPoint,appContext);renderApp()}
function pauseForEdit(){if(appContext.running){appContext.running=false;resetRuntimeClock();syncButtons()}}
