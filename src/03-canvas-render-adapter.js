'use strict';

// Browser-only canvas render pipeline and transient drawing overlays.

let gridCanvas=document.createElement('canvas'),gridCtx=gridCanvas.getContext('2d'),imageData=null;

function renderAdapterWorld(world){
  return world||currentWorldState();
}

function renderAdapterCellSize(world){
  return Math.max(1,world&&world.cellSize||cellSize||1);
}

function renderAdapterCols(world){
  return world&&Number.isFinite(world.cols)?world.cols:cols;
}

function renderAdapterViewW(world){
  return world&&Number.isFinite(world.viewW)?world.viewW:renderAdapterCols(world)*renderAdapterCellSize(world);
}

function renderAdapterViewH(world){
  return world&&Number.isFinite(world.viewH)?world.viewH:(world&&Number.isFinite(world.rows)?world.rows:rows)*renderAdapterCellSize(world);
}

function renderAdapterPointToCell(world,x,y){
  if(world){
    const size=renderAdapterCellSize(world);
    return{
      c:clamp(Math.floor(x/size),0,world.cols-1),
      r:clamp(Math.floor(y/size),0,world.rows-1)
    };
  }
  return pointToCell(x,y);
}

// Rendering is separated from simulation state: the grid draws to a tiny
// offscreen canvas first, then scales up with image smoothing disabled.
function renderGrid(world=currentWorldState(),context=appContext){
  const active=renderAdapterWorld(world);
  if(gridCanvas.width!==active.cols)gridCanvas.width=active.cols;
  if(gridCanvas.height!==active.rows)gridCanvas.height=active.rows;
  if(!imageData||imageData.width!==active.cols||imageData.height!==active.rows)imageData=gridCtx.createImageData(active.cols,active.rows);
  const data=imageData.data;
  appRenderBuffer(active,data,context);
  gridCtx.putImageData(imageData,0,0);
  ctx.imageSmoothingEnabled=false;
  ctx.drawImage(gridCanvas,0,0,active.cols,active.rows,0,0,active.cols*active.cellSize,active.rows*active.cellSize);
  ctx.imageSmoothingEnabled=true;
}
function debugBasinColor(id,alpha){
  const hue=(id*57)%360;
  return`hsla(${hue},86%,48%,${alpha})`;
}
function renderBasinDebug(world=currentWorldState(),context=appContext){
  if(!context.debugBasins)return;
  const active=renderAdapterWorld(world);
  const basins=appDebugBasins(active,context);
  const activeCols=renderAdapterCols(active),activeCellSize=renderAdapterCellSize(active);
  ctx.save();
  ctx.lineWidth=Math.max(1,activeCellSize*.35);
  ctx.font='12px Arial, sans-serif';
  ctx.textAlign='center';
  ctx.textBaseline='middle';
  for(const info of basins){
    ctx.fillStyle=debugBasinColor(info.id,.24);
    for(const i of info.cells){
      const c=i%activeCols,r=Math.floor(i/activeCols);
      ctx.fillRect(c*activeCellSize,r*activeCellSize,activeCellSize,activeCellSize);
    }
    ctx.strokeStyle=debugBasinColor(info.id,.9);
    for(const span of info.intervals){
      const x=span.left*activeCellSize,y=span.r*activeCellSize,w=(span.right-span.left+1)*activeCellSize;
      ctx.strokeRect(x+.5,y+.5,Math.max(1,w-1),Math.max(1,activeCellSize-1));
    }
    const x=(info.minC+info.maxC+1)*activeCellSize*.5,y=(info.topRow+info.bottomRow+1)*activeCellSize*.5;
    ctx.fillStyle='rgba(17,24,39,.78)';
    ctx.fillText(`#${info.id} ${info.cells.length}`,x,y);
  }
  ctx.restore();
}
function renderBodies(world=currentWorldState()){
  const active=renderAdapterWorld(world);
  const activeBodies=active&&Array.isArray(active.bodies)?active.bodies:bodies;
  for(const b of activeBodies){
    ctx.save();
    ctx.translate(b.x,b.y);
    ctx.rotate(b.angle);
    ctx.fillStyle='#4b4b4b';
    ctx.strokeStyle='#202020';
    ctx.lineWidth=2;
    if(b.type==='circle'){
      ctx.beginPath();
      ctx.arc(0,0,b.radius,0,Math.PI*2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0,0);
      ctx.lineTo(b.radius*.82,0);
      ctx.strokeStyle='rgba(255,255,255,.55)';
      ctx.stroke();
    }else{
      ctx.beginPath();
      ctx.rect(-b.hw,-b.hh,b.hw*2,b.hh*2);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle='rgba(255,255,255,.45)';
      ctx.beginPath();
      ctx.moveTo(-b.hw,0);
      ctx.lineTo(b.hw,0);
      ctx.moveTo(0,-b.hh);
      ctx.lineTo(0,b.hh);
      ctx.stroke();
    }
    ctx.restore();
  }
}
function renderFillPreview(world=currentWorldState(),context=appContext){
  const active=renderAdapterWorld(world),activeCols=renderAdapterCols(active),activeCellSize=renderAdapterCellSize(active);
  const preview=context&&Array.isArray(context.fillPreview)?context.fillPreview:[];
  if(!preview.length)return;
  const previewMaterial=context&&Object.prototype.hasOwnProperty.call(context,'fillPreviewMaterial')?context.fillPreviewMaterial:EMPTY;
  const col=materialColor(previewMaterial);
  ctx.save();
  ctx.fillStyle=`rgba(${col[0]},${col[1]},${col[2]},.32)`;
  for(const i of preview){
    const c=i%activeCols,r=Math.floor(i/activeCols);
    ctx.fillRect(c*activeCellSize,r*activeCellSize,activeCellSize,activeCellSize);
  }
  ctx.restore();
}
function renderPlacement(world=currentWorldState(),context=appContext){
  if(!context.placing)return;
  const active=renderAdapterWorld(world);
  const preview=typeof placementPreviewBody==='function'?placementPreviewBody(active,context):null;
  if(!preview)return;
  const b=preview.body,ok=preview.canPlace;
  ctx.save();
  ctx.strokeStyle=ok?'rgba(58,58,58,.85)':'rgba(201,74,74,.9)';
  ctx.fillStyle=ok?'rgba(58,58,58,.22)':'rgba(201,74,74,.18)';
  ctx.lineWidth=2;
  if(b.type==='circle'){
    ctx.beginPath();
    ctx.arc(b.x,b.y,b.radius,0,Math.PI*2);
    ctx.fill();
    ctx.stroke();
  }else{
    ctx.beginPath();
    ctx.rect(b.x-b.hw,b.y-b.hh,b.hw*2,b.hh*2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}
function drawArrow(x1,y1,x2,y2){const a=Math.atan2(y2-y1,x2-x1);ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();ctx.beginPath();ctx.moveTo(x2,y2);ctx.lineTo(x2-Math.cos(a-.55)*14,y2-Math.sin(a-.55)*14);ctx.lineTo(x2-Math.cos(a+.55)*14,y2-Math.sin(a+.55)*14);ctx.closePath();ctx.fillStyle=ctx.strokeStyle;ctx.fill()}
function renderForcePreview(context=appContext){const forceState=context.forceState;if(!forceState)return;ctx.save();ctx.strokeStyle='rgba(17,24,39,.78)';ctx.fillStyle='rgba(22,141,226,.1)';ctx.lineWidth=2;if(forceState.circle){ctx.beginPath();ctx.arc(forceState.circle.x,forceState.circle.y,forceState.circle.r,0,Math.PI*2);ctx.fill();ctx.stroke()}else if(forceState.start&&forceState.current){const r=Math.hypot(forceState.current.x-forceState.start.x,forceState.current.y-forceState.start.y);ctx.beginPath();ctx.arc(forceState.start.x,forceState.start.y,r,0,Math.PI*2);ctx.fill();ctx.stroke()}if(forceState.circle&&forceState.arrowEnd)drawArrow(forceState.circle.x,forceState.circle.y,forceState.arrowEnd.x,forceState.arrowEnd.y);ctx.restore()}
function renderEraser(world=currentWorldState(),context=appContext){if(appTool(context)!=='eraser'||!context.hoverPoint)return;const active=renderAdapterWorld(world),activeCellSize=renderAdapterCellSize(active),rad=getEraserRadius();ctx.save();ctx.strokeStyle='rgba(201,74,74,.85)';ctx.lineWidth=2;if(rad===0){const p=renderAdapterPointToCell(active,context.hoverPoint.x,context.hoverPoint.y);ctx.strokeRect(p.c*activeCellSize+.5,p.r*activeCellSize+.5,Math.max(1,activeCellSize-1),Math.max(1,activeCellSize-1))}else{ctx.beginPath();ctx.arc(context.hoverPoint.x,context.hoverPoint.y,rad*activeCellSize,0,Math.PI*2);ctx.stroke()}ctx.restore()}
function render(world=currentWorldState(),context=appContext){
  const active=renderAdapterWorld(world);
  const canvasAirColor=active&&Array.isArray(active.airColor)?active.airColor:(typeof currentAirColorState==='function'?currentAirColorState():airColor);
  const activeViewW=renderAdapterViewW(active),activeViewH=renderAdapterViewH(active);
  ctx.clearRect(0,0,activeViewW,activeViewH);
  ctx.fillStyle=`rgb(${canvasAirColor[0]},${canvasAirColor[1]},${canvasAirColor[2]})`;
  ctx.fillRect(0,0,activeViewW,activeViewH);
  renderGrid(active,context);
  if(typeof renderSources==='function')renderSources(active);
  renderBasinDebug(active,context);
  renderFillPreview(active,context);
  renderBodies(active);
  renderPlacement(active,context);
  renderForcePreview(context);
  renderEraser(active,context);
  updateStatus();
}
