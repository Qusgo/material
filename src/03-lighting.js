'use strict';

// DOM-free render preparation helpers. These functions read the current world
// arrays and material metadata, then produce lighting bits or per-cell colors.

function blendChannel(a,b,t){
  return Math.floor(a+(b-a)*t);
}

function buildLightMask(){
  lightMask.fill(0);
  if(!lightingEnabled)return;
  for(let c=0;c<cols;c++){
    let lit=true;
    for(let r=0;r<rows;r++){
      const i=idx(c,r),m=normalizeMaterialCell(i);
      if(lit)lightMask[i]|=1;
      if(lit&&m!==EMPTY&&materialBlocksLight(m))lit=false;
    }
  }
  if(sideLightStrength<=0)return;
  for(let r=0;r<rows;r++){
    for(let c=0;c<cols-1;c++){
      const i=idx(c,r),right=idx(c+1,r),targetMat=normalizeMaterialCell(right);
      const targetCanReceiveSideLight=isSolidMaterial(targetMat)||isGranularMaterial(targetMat);
      if((lightMask[i]&1)&&!(lightMask[right]&1)&&targetCanReceiveSideLight)lightMask[right]|=2;
    }
  }
}

function applySimpleLighting(r,g,b,lightBits){
  if(!lightingEnabled)return[r,g,b];
  if(lightBits&1){
    return[
      blendChannel(r,255,lightStrength),
      blendChannel(g,255,lightStrength),
      blendChannel(b,255,lightStrength)
    ];
  }
  if(lightBits&2){
    const t=clamp(lightStrength*sideLightStrength,0,1);
    return[
      blendChannel(r,255,t),
      blendChannel(g,255,t),
      blendChannel(b,255,t)
    ];
  }
  return[
    blendChannel(r,0,shadowStrength),
    blendChannel(g,0,shadowStrength),
    blendChannel(b,0,shadowStrength)
  ];
}

function baseRenderColor(i,m){
  let r=255,g=255,b=255;
  if(m===EMPTY){
    r=airColor[0];
    g=airColor[1];
    b=airColor[2];
    if(bgTintA[i]){
      r=bgTintR[i];
      g=bgTintG[i];
      b=bgTintB[i];
    }
  }else if(materialCarriesMass(m)){
    const col=materialColor(m),a=clamp((mass[i]-WATER_MIN_MASS)/(WATER_MAX_MASS-WATER_MIN_MASS),0,1),d=clamp(mass[i],.08,1.4),wr=clamp(col[0]-d*4,0,255),wg=clamp(col[1]-d*12,0,255),wb=col[2];
    r=Math.floor(255*(1-a)+wr*a);
    g=Math.floor(255*(1-a)+wg*a);
    b=Math.floor(255*(1-a)+wb*a);
  }else{
    const col=materialColor(m);
    r=col[0];
    g=col[1];
    b=col[2];
  }
  if(m!==EMPTY&&tintA[i]){
    r=tintR[i];
    g=tintG[i];
    b=tintB[i];
  }
  return[r,g,b];
}
