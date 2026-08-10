'use strict';

// Browser-only canvas pointer adapter. It converts pointer gestures into
// edit/force commands and leaves simulation rules in earlier core files.

let pointerDown=false,lastPoint=null,hoverPoint=null,placing=null,forceState=null;

function clearCanvasInteractionState(){
  pointerDown=false;
  lastPoint=null;
  hoverPoint=null;
  placing=null;
  forceState=null;
}

function bindCanvasPointerInput(){
  canvas.addEventListener('pointerdown',e=>{canvas.setPointerCapture(e.pointerId);pointerDown=true;const p=canvasPoint(e);hoverPoint=p;pauseForEdit();const world=currentWorldState();if(tool==='brush'){if(isBodyMaterial())placing={kind:selected,start:p,current:p};else{const mat=MATERIAL_FROM_NAME[selected]||WATER;applyEditCommand(world,{type:'paint',x:p.x,y:p.y,radius:getBrushRadius(),material:mat})}lastPoint=p}else if(tool==='source'){const mat=selectedSourceMaterial();if(mat){applyEditCommand(world,{type:'source',x:p.x,y:p.y,radius:getBrushRadius(),material:mat});lastPoint=p}else setStatus('Source requires a flow material')}else if(tool==='color'){applyEditCommand(world,{type:'tint',x:p.x,y:p.y,radius:getBrushRadius(),color:getTintColor()});lastPoint=p}else if(tool==='fill'){updateFillPreview();applyFill()}else if(tool==='eraser')applyEditCommand(world,{type:'erase',x:p.x,y:p.y,radius:getEraserRadius()});else if(tool==='force'){if(!forceState||forceState.done)forceState={phase:'circle',start:p,current:p};else if(forceState.phase==='arrow')forceState.arrowEnd=p}render()});
  canvas.addEventListener('pointermove',e=>{const p=canvasPoint(e);hoverPoint=p;if(tool==='fill')updateFillPreview();if(!pointerDown){render();return}const world=currentWorldState();if(tool==='brush'){if(placing)placing.current=p;else if(lastPoint){const mat=MATERIAL_FROM_NAME[selected]||WATER;applyEditCommand(world,{type:'paintLine',x1:lastPoint.x,y1:lastPoint.y,x2:p.x,y2:p.y,radius:getBrushRadius(),material:mat})}lastPoint=p}else if(tool==='source'){const mat=selectedSourceMaterial();if(mat&&lastPoint)applyEditCommand(world,{type:'sourceLine',x1:lastPoint.x,y1:lastPoint.y,x2:p.x,y2:p.y,radius:getBrushRadius(),material:mat});lastPoint=p}else if(tool==='color'){if(lastPoint)applyEditCommand(world,{type:'tintLine',x1:lastPoint.x,y1:lastPoint.y,x2:p.x,y2:p.y,radius:getBrushRadius(),color:getTintColor()});lastPoint=p}else if(tool==='eraser')applyEditCommand(world,{type:'erase',x:p.x,y:p.y,radius:getEraserRadius()});else if(tool==='force'&&forceState){if(forceState.phase==='circle')forceState.current=p;else if(forceState.phase==='arrow')forceState.arrowEnd=p}render()});
  canvas.addEventListener('pointerup',e=>{pointerDown=false;const p=canvasPoint(e),world=currentWorldState();if(placing){placing.current=p;if(applyEditCommand(world,{type:'placeBody',kind:placing.kind,start:placing.start,current:placing.current}))setStatus('Dynamic stone placed');placing=null}if(tool==='force'&&forceState){if(forceState.phase==='circle'){const r=Math.max(12,Math.hypot(forceState.current.x-forceState.start.x,forceState.current.y-forceState.start.y));forceState={phase:'arrow',circle:{x:forceState.start.x,y:forceState.start.y,r},arrowEnd:null};setStatus('Force: now drag arrow direction and strength')}else if(forceState.phase==='arrow'&&forceState.arrowEnd){const arrow={x:forceState.arrowEnd.x-forceState.circle.x,y:forceState.arrowEnd.y-forceState.circle.y};if(applyEditCommand(world,{type:'force',circle:forceState.circle,arrow}))setStatus('Force applied');forceState=null}}finishEditAsNewInitialState();lastPoint=null;if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);rebuildBodyMask();updateFillPreview();render()});
  canvas.addEventListener('pointercancel',e=>{clearCanvasInteractionState();finishEditAsNewInitialState();if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);render()});
  canvas.addEventListener('pointerleave',()=>{hoverPoint=null;clearFillPreview();render()});
}

bindCanvasPointerInput();
