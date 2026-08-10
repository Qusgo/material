'use strict';

// Canvas-only presentation for the source layer. The source data and generation
// rules stay in 02-sources.js so they remain testable without a DOM.

function renderSources(world=currentWorldState()){
  if(typeof useWorldState==='function')useWorldState(world);
  ctx.save();
  for(let i=0;i<count;i++){
    const mat=sourceMat[i];
    if(!canSourceMaterial(mat))continue;
    const c=i%cols,r=Math.floor(i/cols),col=materialColor(mat);
    const x=c*cellSize,y=r*cellSize,inset=Math.max(1,Math.floor(cellSize*.22)),size=Math.max(1,cellSize-inset*2);
    ctx.fillStyle=`rgba(${col[0]},${col[1]},${col[2]},.42)`;
    ctx.fillRect(x+inset,y+inset,size,size);
    ctx.strokeStyle=`rgba(${col[0]},${col[1]},${col[2]},.82)`;
    ctx.lineWidth=Math.max(1,cellSize*.18);
    ctx.beginPath();
    ctx.moveTo(x+cellSize*.24,y+cellSize*.24);
    ctx.lineTo(x+cellSize*.76,y+cellSize*.76);
    ctx.moveTo(x+cellSize*.76,y+cellSize*.24);
    ctx.lineTo(x+cellSize*.24,y+cellSize*.76);
    ctx.stroke();
  }
  ctx.restore();
}
