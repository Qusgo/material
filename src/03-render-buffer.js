'use strict';

// DOM-free pixel-buffer builder. The browser adapter owns ImageData upload; this
// function only resolves material colors, tints, and render-only lighting.

function normalizeRenderBufferArgs(worldOrData,maybeData){
  if(maybeData!==undefined){
    return{world:worldOrData,data:maybeData};
  }
  return{world:null,data:worldOrData};
}

function buildRenderBuffer(worldOrData,maybeData){
  const args=normalizeRenderBufferArgs(worldOrData,maybeData),world=args.world,data=args.data;
  const run=()=>{
    buildLightMask(world);
    const targetCount=world?world.count:count,targetLightMask=world?world.arrays.lightMask:lightMask;
    for(let i=0;i<targetCount;i++){
      const p=i*4,m=world?lightingNormalizeMaterialCell(world,i):normalizeMaterialCell(i),base=world?baseRenderColor(world,i,m):baseRenderColor(i,m);
      const shaded=materialEmissive(m)?base:applySimpleLighting(base[0],base[1],base[2],targetLightMask[i],world);
      data[p]=shaded[0];
      data[p+1]=shaded[1];
      data[p+2]=shaded[2];
      data[p+3]=255;
    }
    return data;
  };
  if(world&&world.arrays&&typeof withMaterialRegistryForWorld==='function')return withMaterialRegistryForWorld(world,run);
  return run();
}
