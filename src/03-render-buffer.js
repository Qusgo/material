'use strict';

// DOM-free pixel-buffer builder. The browser adapter owns ImageData/canvas; this
// function only resolves material colors, tints, and render-only lighting.

function normalizeRenderBufferArgs(worldOrData,maybeData){
  if(maybeData!==undefined){
    useWorldState(worldOrData);
    return maybeData;
  }
  return worldOrData;
}

function buildRenderBuffer(worldOrData,maybeData){
  const data=normalizeRenderBufferArgs(worldOrData,maybeData);
  buildLightMask();
  for(let i=0;i<count;i++){
    const p=i*4,m=normalizeMaterialCell(i),base=baseRenderColor(i,m);
    const shaded=materialEmissive(m)?base:applySimpleLighting(base[0],base[1],base[2],lightMask[i]);
    data[p]=shaded[0];
    data[p+1]=shaded[1];
    data[p+2]=shaded[2];
    data[p+3]=255;
  }
}
