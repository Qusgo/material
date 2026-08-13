'use strict';

// Canvas-only presentation for the source layer. The source data and generation
// rules stay in 02-sources.js so they remain testable without a DOM.

function renderSources(world=currentWorldState()){
  const active=world||currentWorldState();
  const activeSource=active&&active.arrays&&active.arrays.sourceMat?active.arrays.sourceMat:sourceMat;
  const activeCount=active&&Number.isFinite(active.count)?active.count:count;
  const activeCols=active&&Number.isFinite(active.cols)?active.cols:cols;
  const activeCellSize=active&&Number.isFinite(active.cellSize)?active.cellSize:cellSize;
  ctx.save();
  for(let i=0;i<activeCount;i++){
    const mat=activeSource[i];
    if(!canSourceMaterial(mat))continue;
    const c=i%activeCols,r=Math.floor(i/activeCols),col=materialColor(mat);
    const x=c*activeCellSize,y=r*activeCellSize,inset=Math.max(1,Math.floor(activeCellSize*.22)),size=Math.max(1,activeCellSize-inset*2);
    ctx.fillStyle=`rgba(${col[0]},${col[1]},${col[2]},.42)`;
    ctx.fillRect(x+inset,y+inset,size,size);
    ctx.strokeStyle=`rgba(${col[0]},${col[1]},${col[2]},.82)`;
    ctx.lineWidth=Math.max(1,activeCellSize*.18);
    ctx.beginPath();
    ctx.moveTo(x+activeCellSize*.24,y+activeCellSize*.24);
    ctx.lineTo(x+activeCellSize*.76,y+activeCellSize*.76);
    ctx.moveTo(x+activeCellSize*.76,y+activeCellSize*.24);
    ctx.lineTo(x+activeCellSize*.24,y+activeCellSize*.76);
    ctx.stroke();
  }
  ctx.restore();
}
