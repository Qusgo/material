'use strict';

// DOM-free render preparation helpers. These functions read the current world
// arrays and material metadata, then produce lighting bits or per-cell colors.

function blendChannel(a,b,t){
  return Math.floor(a+(b-a)*t);
}

function lightingRuntimeSettings(world){
  if(world&&world.runtimeSettings){
    return typeof normalizeRuntimeSettingsState==='function'
      ?normalizeRuntimeSettingsState(world.runtimeSettings)
      :world.runtimeSettings;
  }
  return typeof currentRuntimeSettingsState==='function'
    ?currentRuntimeSettingsState()
    :{
      lightingEnabled:typeof lightingEnabled==='undefined'?true:lightingEnabled,
      lightStrength:typeof lightStrength==='undefined'?.18:lightStrength,
      sideLightStrength:typeof sideLightStrength==='undefined'?1:sideLightStrength,
      shadowStrength:typeof shadowStrength==='undefined'?.16:shadowStrength
    };
}

function installLightingWorld(world){
  if(world&&typeof useWorldState==='function')useWorldState(world);
}

function lightingIndex(world,c,r){
  return r*world.cols+c;
}

function lightingNormalizeMaterialCell(world,i){
  if(!world)return normalizeMaterialCell(i);
  const a=world.arrays;
  if(isKnownMaterial(a.material[i]))return a.material[i];
  a.material[i]=EMPTY;
  a.mass[i]=0;
  a.vx[i]=0;
  a.vy[i]=0;
  a.flowDir[i]=0;
  if(typeof clearTintInWorld==='function')clearTintInWorld(world,i);
  else{
    a.tintR[i]=0;
    a.tintG[i]=0;
    a.tintB[i]=0;
    a.tintA[i]=0;
    a.bgTintR[i]=0;
    a.bgTintG[i]=0;
    a.bgTintB[i]=0;
    a.bgTintA[i]=0;
  }
  if(typeof clearMotionTraceInWorld==='function')clearMotionTraceInWorld(world,i);
  if(typeof clearCarryStateInWorld==='function')clearCarryStateInWorld(world,i);
  if(typeof clearRestStateInWorld==='function')clearRestStateInWorld(world,i);
  return EMPTY;
}

function buildLightMask(world){
  const settings=lightingRuntimeSettings(world);
  const targetMask=world?world.arrays.lightMask:lightMask;
  targetMask.fill(0);
  if(!settings.lightingEnabled)return;
  if(world){
    for(let c=0;c<world.cols;c++){
      let lit=true;
      for(let r=0;r<world.rows;r++){
        const i=lightingIndex(world,c,r),m=lightingNormalizeMaterialCell(world,i);
        if(lit)targetMask[i]|=1;
        if(lit&&m!==EMPTY&&materialBlocksLight(m))lit=false;
      }
    }
    if(settings.sideLightStrength<=0)return;
    for(let r=0;r<world.rows;r++){
      for(let c=0;c<world.cols-1;c++){
        const i=lightingIndex(world,c,r),right=lightingIndex(world,c+1,r),targetMat=lightingNormalizeMaterialCell(world,right);
        const targetCanReceiveSideLight=isSolidMaterial(targetMat)||isGranularMaterial(targetMat);
        if((targetMask[i]&1)&&!(targetMask[right]&1)&&targetCanReceiveSideLight)targetMask[right]|=2;
      }
    }
    return;
  }
  for(let c=0;c<cols;c++){
    let lit=true;
    for(let r=0;r<rows;r++){
      const i=idx(c,r),m=normalizeMaterialCell(i);
      if(lit)targetMask[i]|=1;
      if(lit&&m!==EMPTY&&materialBlocksLight(m))lit=false;
    }
  }
  if(settings.sideLightStrength<=0)return;
  for(let r=0;r<rows;r++){
    for(let c=0;c<cols-1;c++){
      const i=idx(c,r),right=idx(c+1,r),targetMat=normalizeMaterialCell(right);
      const targetCanReceiveSideLight=isSolidMaterial(targetMat)||isGranularMaterial(targetMat);
      if((targetMask[i]&1)&&!(targetMask[right]&1)&&targetCanReceiveSideLight)targetMask[right]|=2;
    }
  }
}

function applySimpleLighting(r,g,b,lightBits,worldOrSettings){
  const settings=worldOrSettings&&worldOrSettings.arrays
    ?lightingRuntimeSettings(worldOrSettings)
    :worldOrSettings||lightingRuntimeSettings();
  if(!settings.lightingEnabled)return[r,g,b];
  if(lightBits&1){
    return[
      blendChannel(r,255,settings.lightStrength),
      blendChannel(g,255,settings.lightStrength),
      blendChannel(b,255,settings.lightStrength)
    ];
  }
  if(lightBits&2){
    const t=clamp(settings.lightStrength*settings.sideLightStrength,0,1);
    return[
      blendChannel(r,255,t),
      blendChannel(g,255,t),
      blendChannel(b,255,t)
    ];
  }
  return[
    blendChannel(r,0,settings.shadowStrength),
    blendChannel(g,0,settings.shadowStrength),
    blendChannel(b,0,settings.shadowStrength)
  ];
}

function baseRenderColor(worldOrI,iOrM,maybeM){
  const hasWorld=maybeM!==undefined;
  const world=hasWorld?worldOrI:null;
  const i=hasWorld?iOrM:worldOrI,m=hasWorld?maybeM:iOrM;
  const a=world?world.arrays:null;
  let r=255,g=255,b=255;
  if(m===EMPTY){
    const targetAir=world&&Array.isArray(world.airColor)?world.airColor:airColor;
    r=targetAir[0];
    g=targetAir[1];
    b=targetAir[2];
    const targetBgTintA=world?a.bgTintA:bgTintA;
    if(targetBgTintA[i]){
      r=(world?a.bgTintR:bgTintR)[i];
      g=(world?a.bgTintG:bgTintG)[i];
      b=(world?a.bgTintB:bgTintB)[i];
    }
  }else if(materialCarriesMass(m)){
    const targetMass=world?a.mass:mass;
    const col=materialColor(m),amount=clamp((targetMass[i]-WATER_MIN_MASS)/(WATER_MAX_MASS-WATER_MIN_MASS),0,1),d=clamp(targetMass[i],.08,1.4),wr=clamp(col[0]-d*4,0,255),wg=clamp(col[1]-d*12,0,255),wb=col[2];
    r=Math.floor(255*(1-amount)+wr*amount);
    g=Math.floor(255*(1-amount)+wg*amount);
    b=Math.floor(255*(1-amount)+wb*amount);
  }else{
    const col=materialColor(m);
    r=col[0];
    g=col[1];
    b=col[2];
  }
  const targetTintA=world?a.tintA:tintA;
  if(m!==EMPTY&&targetTintA[i]){
    r=(world?a.tintR:tintR)[i];
    g=(world?a.tintG:tintG)[i];
    b=(world?a.tintB:tintB)[i];
  }
  return[r,g,b];
}
