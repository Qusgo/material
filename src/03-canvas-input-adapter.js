'use strict';

// Browser-only canvas pointer adapter. It converts pointer gestures into
// edit/force commands and leaves simulation rules in earlier core files.

function clearCanvasInteractionState(){
  appContext.pointerDown=false;
  appContext.lastPoint=null;
  appContext.hoverPoint=null;
  appContext.placing=null;
  appContext.forceState=null;
}

function canvasInputTool(){
  return typeof currentTool==='function'?currentTool():tool;
}

function canvasInputSelectedKey(){
  return typeof currentSelectedKey==='function'?currentSelectedKey():selected;
}

function bindCanvasPointerInput(){
  canvas.addEventListener('pointerdown',e=>{
    canvas.setPointerCapture(e.pointerId);
    appContext.pointerDown=true;
    const p=canvasPoint(e),activeTool=canvasInputTool(),activeSelected=canvasInputSelectedKey();
    appContext.hoverPoint=p;
    pauseForEdit();
    if(activeTool==='brush'){
      if(isBodyMaterial())appContext.placing={kind:activeSelected,start:p,current:p};
      else{
        const mat=MATERIAL_FROM_NAME[activeSelected]||WATER;
        applyAppEditCommand({type:'paint',x:p.x,y:p.y,radius:getBrushRadius(),material:mat});
      }
      appContext.lastPoint=p;
    }else if(activeTool==='source'){
      const mat=selectedSourceMaterial();
      if(mat){
        applyAppEditCommand({type:'source',x:p.x,y:p.y,radius:getBrushRadius(),material:mat});
        appContext.lastPoint=p;
      }else setStatus('Source requires a flow material');
    }else if(activeTool==='color'){
      applyAppEditCommand({type:'tint',x:p.x,y:p.y,radius:getBrushRadius(),color:getTintColor()});
      appContext.lastPoint=p;
    }else if(activeTool==='fill'){
      updateFillPreview(appContext.hoverPoint);
      applyFill(appContext.hoverPoint,applyAppEditCommand);
    }else if(activeTool==='eraser'){
      applyAppEditCommand({type:'erase',x:p.x,y:p.y,radius:getEraserRadius()});
    }else if(activeTool==='force'){
      if(!appContext.forceState||appContext.forceState.done)appContext.forceState={phase:'circle',start:p,current:p};
      else if(appContext.forceState.phase==='arrow')appContext.forceState.arrowEnd=p;
    }
    renderApp();
  });
  canvas.addEventListener('pointermove',e=>{
    const p=canvasPoint(e),activeTool=canvasInputTool(),activeSelected=canvasInputSelectedKey();
    appContext.hoverPoint=p;
    if(activeTool==='fill')updateFillPreview(appContext.hoverPoint);
    if(!appContext.pointerDown){
      renderApp();
      return;
    }
    if(activeTool==='brush'){
      if(appContext.placing)appContext.placing.current=p;
      else if(appContext.lastPoint){
        const mat=MATERIAL_FROM_NAME[activeSelected]||WATER;
        applyAppEditCommand({type:'paintLine',x1:appContext.lastPoint.x,y1:appContext.lastPoint.y,x2:p.x,y2:p.y,radius:getBrushRadius(),material:mat});
      }
      appContext.lastPoint=p;
    }else if(activeTool==='source'){
      const mat=selectedSourceMaterial();
      if(mat&&appContext.lastPoint)applyAppEditCommand({type:'sourceLine',x1:appContext.lastPoint.x,y1:appContext.lastPoint.y,x2:p.x,y2:p.y,radius:getBrushRadius(),material:mat});
      appContext.lastPoint=p;
    }else if(activeTool==='color'){
      if(appContext.lastPoint)applyAppEditCommand({type:'tintLine',x1:appContext.lastPoint.x,y1:appContext.lastPoint.y,x2:p.x,y2:p.y,radius:getBrushRadius(),color:getTintColor()});
      appContext.lastPoint=p;
    }else if(activeTool==='eraser'){
      applyAppEditCommand({type:'erase',x:p.x,y:p.y,radius:getEraserRadius()});
    }else if(activeTool==='force'&&appContext.forceState){
      if(appContext.forceState.phase==='circle')appContext.forceState.current=p;
      else if(appContext.forceState.phase==='arrow')appContext.forceState.arrowEnd=p;
    }
    renderApp();
  });
  canvas.addEventListener('pointerup',e=>{
    appContext.pointerDown=false;
    const p=canvasPoint(e),activeTool=canvasInputTool();
    if(appContext.placing){
      appContext.placing.current=p;
      if(applyAppEditCommand({type:'placeBody',kind:appContext.placing.kind,start:appContext.placing.start,current:appContext.placing.current}))setStatus('Dynamic stone placed');
      appContext.placing=null;
    }
    if(activeTool==='force'&&appContext.forceState){
      if(appContext.forceState.phase==='circle'){
        const r=Math.max(12,Math.hypot(appContext.forceState.current.x-appContext.forceState.start.x,appContext.forceState.current.y-appContext.forceState.start.y));
        appContext.forceState={phase:'arrow',circle:{x:appContext.forceState.start.x,y:appContext.forceState.start.y,r},arrowEnd:null};
        setStatus('Force: now drag arrow direction and strength');
      }else if(appContext.forceState.phase==='arrow'&&appContext.forceState.arrowEnd){
        const arrow={x:appContext.forceState.arrowEnd.x-appContext.forceState.circle.x,y:appContext.forceState.arrowEnd.y-appContext.forceState.circle.y};
        if(applyAppEditCommand({type:'force',circle:appContext.forceState.circle,arrow}))setStatus('Force applied');
        appContext.forceState=null;
      }
    }
    finishEditAsNewInitialState();
    appContext.lastPoint=null;
    if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);
    rebuildBodyMask();
    updateFillPreview(appContext.hoverPoint);
    renderApp();
  });
  canvas.addEventListener('pointercancel',e=>{clearCanvasInteractionState();finishEditAsNewInitialState();if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);renderApp()});
  canvas.addEventListener('pointerleave',()=>{appContext.hoverPoint=null;clearFillPreview();renderApp()});
}

bindCanvasPointerInput();
