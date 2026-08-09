'use strict';

// Browser-only canvas render pipeline and transient drawing overlays.

let gridCanvas=document.createElement('canvas'),gridCtx=gridCanvas.getContext('2d'),imageData=null;

// Rendering is separated from simulation state: the grid draws to a tiny
// offscreen canvas first, then scales up with image smoothing disabled.
function renderGrid(){
  if(!imageData||imageData.width!==cols||imageData.height!==rows)imageData=gridCtx.createImageData(cols,rows);
  const data=imageData.data;
  buildRenderBuffer(data);
  gridCtx.putImageData(imageData,0,0);
  ctx.imageSmoothingEnabled=false;
  ctx.drawImage(gridCanvas,0,0,cols,rows,0,0,cols*cellSize,rows*cellSize);
  ctx.imageSmoothingEnabled=true;
}
function debugBasinColor(id,alpha){
  const hue=(id*57)%360;
  return`hsla(${hue},86%,48%,${alpha})`;
}
function renderBasinDebug(){
  if(!debugBasins)return;
  const basins=buildWaterBasins();
  ctx.save();
  ctx.lineWidth=Math.max(1,cellSize*.35);
  ctx.font='12px Arial, sans-serif';
  ctx.textAlign='center';
  ctx.textBaseline='middle';
  for(const info of basins){
    ctx.fillStyle=debugBasinColor(info.id,.24);
    for(const i of info.cells){
      const c=i%cols,r=Math.floor(i/cols);
      ctx.fillRect(c*cellSize,r*cellSize,cellSize,cellSize);
    }
    ctx.strokeStyle=debugBasinColor(info.id,.9);
    for(const span of info.intervals){
      const x=span.left*cellSize,y=span.r*cellSize,w=(span.right-span.left+1)*cellSize;
      ctx.strokeRect(x+.5,y+.5,Math.max(1,w-1),Math.max(1,cellSize-1));
    }
    const x=(info.minC+info.maxC+1)*cellSize*.5,y=(info.topRow+info.bottomRow+1)*cellSize*.5;
    ctx.fillStyle='rgba(17,24,39,.78)';
    ctx.fillText(`#${info.id} ${info.cells.length}`,x,y);
  }
  ctx.restore();
}
function renderBodies(){for(const b of bodies){ctx.save();ctx.translate(b.x,b.y);ctx.rotate(b.angle);ctx.fillStyle='#4b4b4b';ctx.strokeStyle='#202020';ctx.lineWidth=2;if(b.type==='circle'){ctx.beginPath();ctx.arc(0,0,b.radius,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(b.radius*.82,0);ctx.strokeStyle='rgba(255,255,255,.55)';ctx.stroke()}else{ctx.beginPath();ctx.rect(-b.hw,-b.hh,b.hw*2,b.hh*2);ctx.fill();ctx.stroke();ctx.strokeStyle='rgba(255,255,255,.45)';ctx.beginPath();ctx.moveTo(-b.hw,0);ctx.lineTo(b.hw,0);ctx.moveTo(0,-b.hh);ctx.lineTo(0,b.hh);ctx.stroke()}ctx.restore()}}
function renderFillPreview(){if(!fillPreview.length)return;const col=materialColor(fillPreviewMaterial);ctx.save();ctx.fillStyle=`rgba(${col[0]},${col[1]},${col[2]},.32)`;for(const i of fillPreview){const c=i%cols,r=Math.floor(i/cols);ctx.fillRect(c*cellSize,r*cellSize,cellSize,cellSize)}ctx.restore()}
function renderPlacement(){if(!placing)return;const b=makeBodyFromPlacement(placing);if(!b)return;const ok=canPlaceBody(b);ctx.save();ctx.strokeStyle=ok?'rgba(58,58,58,.85)':'rgba(201,74,74,.9)';ctx.fillStyle=ok?'rgba(58,58,58,.22)':'rgba(201,74,74,.18)';ctx.lineWidth=2;if(b.type==='circle'){ctx.beginPath();ctx.arc(b.x,b.y,b.radius,0,Math.PI*2);ctx.fill();ctx.stroke()}else{ctx.beginPath();ctx.rect(b.x-b.hw,b.y-b.hh,b.hw*2,b.hh*2);ctx.fill();ctx.stroke()}ctx.restore()}
function drawArrow(x1,y1,x2,y2){const a=Math.atan2(y2-y1,x2-x1);ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();ctx.beginPath();ctx.moveTo(x2,y2);ctx.lineTo(x2-Math.cos(a-.55)*14,y2-Math.sin(a-.55)*14);ctx.lineTo(x2-Math.cos(a+.55)*14,y2-Math.sin(a+.55)*14);ctx.closePath();ctx.fillStyle=ctx.strokeStyle;ctx.fill()}
function renderForcePreview(){if(!forceState)return;ctx.save();ctx.strokeStyle='rgba(17,24,39,.78)';ctx.fillStyle='rgba(22,141,226,.1)';ctx.lineWidth=2;if(forceState.circle){ctx.beginPath();ctx.arc(forceState.circle.x,forceState.circle.y,forceState.circle.r,0,Math.PI*2);ctx.fill();ctx.stroke()}else if(forceState.start&&forceState.current){const r=Math.hypot(forceState.current.x-forceState.start.x,forceState.current.y-forceState.start.y);ctx.beginPath();ctx.arc(forceState.start.x,forceState.start.y,r,0,Math.PI*2);ctx.fill();ctx.stroke()}if(forceState.circle&&forceState.arrowEnd)drawArrow(forceState.circle.x,forceState.circle.y,forceState.arrowEnd.x,forceState.arrowEnd.y);ctx.restore()}
function renderEraser(){if(tool!=='eraser'||!hoverPoint)return;const rad=getEraserRadius();ctx.save();ctx.strokeStyle='rgba(201,74,74,.85)';ctx.lineWidth=2;if(rad===0){const p=pointToCell(hoverPoint.x,hoverPoint.y);ctx.strokeRect(p.c*cellSize+.5,p.r*cellSize+.5,Math.max(1,cellSize-1),Math.max(1,cellSize-1))}else{ctx.beginPath();ctx.arc(hoverPoint.x,hoverPoint.y,rad*cellSize,0,Math.PI*2);ctx.stroke()}ctx.restore()}
function render(){ctx.clearRect(0,0,viewW,viewH);ctx.fillStyle=`rgb(${airColor[0]},${airColor[1]},${airColor[2]})`;ctx.fillRect(0,0,viewW,viewH);renderGrid();if(typeof renderSources==='function')renderSources();renderBasinDebug();renderFillPreview();renderBodies();renderPlacement();renderForcePreview();renderEraser();updateStatus()}
