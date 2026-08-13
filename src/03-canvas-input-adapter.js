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
  return appTool(appContext);
}

function canvasInputSelectedKey(){
  return appSelectedKey(appContext);
}

function bindCanvasPointerInput(){
  canvas.addEventListener('pointerdown',e=>{
    canvas.setPointerCapture(e.pointerId);
    appContext.pointerDown=true;
    const p=canvasPoint(e),activeTool=canvasInputTool(),activeSelected=canvasInputSelectedKey();
    appContext.hoverPoint=p;
    pauseForEdit();
    if(activeTool==='brush'){
      if(appSelectionIsBodyMaterial(appContext))appContext.placing={kind:activeSelected,start:p,current:p};
      else{
        const mat=appSelectedMaterialId(appContext);
        applyAppEditCommand({type:'paint',x:p.x,y:p.y,radius:getBrushRadius(),material:mat},appContext);
      }
      appContext.lastPoint=p;
    }else if(activeTool==='source'){
      const mat=selectedSourceMaterial(appContext);
      if(mat){
        applyAppEditCommand({type:'source',x:p.x,y:p.y,radius:getBrushRadius(),material:mat},appContext);
        appContext.lastPoint=p;
      }else setStatus('Source requires a flow material');
    }else if(activeTool==='color'){
      applyAppEditCommand({type:'tint',x:p.x,y:p.y,radius:getBrushRadius(),color:getTintColor()},appContext);
      appContext.lastPoint=p;
    }else if(activeTool==='fill'){
      updateBrowserFillPreview(appContext.hoverPoint,appContext);
      const filled=applyBrowserFill(appContext.hoverPoint,appContext);
      setStatus(`Filled ${filled} cells`);
    }else if(activeTool==='eraser'){
      applyAppEditCommand({type:'erase',x:p.x,y:p.y,radius:getEraserRadius()},appContext);
    }else if(activeTool==='force'){
      if(!appContext.forceState||appContext.forceState.done)appContext.forceState={phase:'circle',start:p,current:p};
      else if(appContext.forceState.phase==='arrow')appContext.forceState.arrowEnd=p;
    }
    renderApp();
  });
  canvas.addEventListener('pointermove',e=>{
    const p=canvasPoint(e),activeTool=canvasInputTool(),activeSelected=canvasInputSelectedKey();
    appContext.hoverPoint=p;
    if(activeTool==='fill')updateBrowserFillPreview(appContext.hoverPoint,appContext);
    if(!appContext.pointerDown){
      renderApp();
      return;
    }
    if(activeTool==='brush'){
      if(appContext.placing)appContext.placing.current=p;
      else if(appContext.lastPoint){
        const mat=appSelectedMaterialId(appContext);
        applyAppEditCommand({type:'paintLine',x1:appContext.lastPoint.x,y1:appContext.lastPoint.y,x2:p.x,y2:p.y,radius:getBrushRadius(),material:mat},appContext);
      }
      appContext.lastPoint=p;
    }else if(activeTool==='source'){
      const mat=selectedSourceMaterial(appContext);
      if(mat&&appContext.lastPoint)applyAppEditCommand({type:'sourceLine',x1:appContext.lastPoint.x,y1:appContext.lastPoint.y,x2:p.x,y2:p.y,radius:getBrushRadius(),material:mat},appContext);
      appContext.lastPoint=p;
    }else if(activeTool==='color'){
      if(appContext.lastPoint)applyAppEditCommand({type:'tintLine',x1:appContext.lastPoint.x,y1:appContext.lastPoint.y,x2:p.x,y2:p.y,radius:getBrushRadius(),color:getTintColor()},appContext);
      appContext.lastPoint=p;
    }else if(activeTool==='eraser'){
      applyAppEditCommand({type:'erase',x:p.x,y:p.y,radius:getEraserRadius()},appContext);
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
      if(applyAppEditCommand({type:'placeBody',kind:appContext.placing.kind,start:appContext.placing.start,current:appContext.placing.current},appContext))setStatus('Dynamic stone placed');
      else setStatus('Dynamic stones cannot overlap or start outside the canvas');
      appContext.placing=null;
    }
    if(activeTool==='force'&&appContext.forceState){
      if(appContext.forceState.phase==='circle'){
        const r=Math.max(12,Math.hypot(appContext.forceState.current.x-appContext.forceState.start.x,appContext.forceState.current.y-appContext.forceState.start.y));
        appContext.forceState={phase:'arrow',circle:{x:appContext.forceState.start.x,y:appContext.forceState.start.y,r},arrowEnd:null};
        setStatus('Force: now drag arrow direction and strength');
      }else if(appContext.forceState.phase==='arrow'&&appContext.forceState.arrowEnd){
        const arrow={x:appContext.forceState.arrowEnd.x-appContext.forceState.circle.x,y:appContext.forceState.arrowEnd.y-appContext.forceState.circle.y};
        if(applyAppEditCommand({type:'force',circle:appContext.forceState.circle,arrow},appContext))setStatus('Force applied');
        appContext.forceState=null;
      }
    }
    finishAppEdit(appContext);
    appContext.lastPoint=null;
    if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);
    rebuildAppBodyMask(appContext);
    updateBrowserFillPreview(appContext.hoverPoint,appContext);
    renderApp();
  });
  canvas.addEventListener('pointercancel',e=>{clearCanvasInteractionState();finishAppEdit(appContext);if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);renderApp()});
  canvas.addEventListener('pointerleave',()=>{appContext.hoverPoint=null;clearFillPreview(appContext);renderApp()});
}

bindCanvasPointerInput();
