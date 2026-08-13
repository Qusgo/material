'use strict';

// DOM-free save/load codecs and editable-array restore logic. Browser storage
// adapters live in 03-save-storage-adapter.js.

const WORLD_SNAPSHOT_VERSION=1;

function saveCodecHasWorldArg(value){
  return !!(value&&typeof value==='object'&&value.arrays&&value.arrays.material&&Number.isFinite(value.cols));
}

function saveCodecIndex(world,c,r){
  return world?r*world.cols+c:idx(c,r);
}

function saveCodecCount(world){
  return world?world.count:count;
}

function saveCodecSettings(world){
  if(world&&world.runtimeSettings){
    return typeof normalizeRuntimeSettingsState==='function'
      ?normalizeRuntimeSettingsState(world.runtimeSettings)
      :world.runtimeSettings;
  }
  return typeof currentRuntimeSettingsState==='function'
    ?currentRuntimeSettingsState()
    :{sourceInterval,lightingEnabled,lightStrength,sideLightStrength,shadowStrength};
}

function saveCodecAirColor(world){
  if(world&&Array.isArray(world.airColor))return world.airColor;
  return typeof currentAirColorState==='function'?currentAirColorState():airColor;
}

function saveCodecCustomMaterials(world){
  if(world&&Array.isArray(world.customMaterials)){
    return typeof copyCustomMaterialState==='function'
      ?copyCustomMaterialState(world.customMaterials)
      :world.customMaterials.map(item=>({...item}));
  }
  return exportCustomMaterials();
}

function serializeWorldSnapshot(world){
  const targetWorld=saveCodecHasWorldArg(world)?world:null,targetArrays=targetWorld?targetWorld.arrays:null;
  const settings=saveCodecSettings(targetWorld);
  const currentAirColor=saveCodecAirColor(targetWorld);
  return{
    version:WORLD_SNAPSHOT_VERSION,
    cols:targetWorld?targetWorld.cols:cols,
    rows:targetWorld?targetWorld.rows:rows,
    sourceInterval:settings.sourceInterval,
    airColor:currentAirColor.slice(0,3),
    lightingEnabled:settings.lightingEnabled,
    lightStrength:settings.lightStrength,
    sideLightStrength:settings.sideLightStrength,
    shadowStrength:settings.shadowStrength,
    customMaterials:saveCodecCustomMaterials(targetWorld),
    material:encodeRuns(targetWorld?targetArrays.material:material),
    sourceMat:encodeRuns(targetWorld?targetArrays.sourceMat:sourceMat),
    particleTint:targetWorld?encodeTintCells(targetArrays.tintR,targetArrays.tintG,targetArrays.tintB,targetArrays.tintA):encodeTintCells(tintR,tintG,tintB,tintA),
    backgroundTint:targetWorld?encodeTintCells(targetArrays.bgTintR,targetArrays.bgTintG,targetArrays.bgTintB,targetArrays.bgTintA):encodeTintCells(bgTintR,bgTintG,bgTintB,bgTintA)
  };
}

function encodeRuns(array){
  const runs=[];
  if(!array||!array.length)return runs;
  let value=array[0],length=1;
  for(let i=1;i<array.length;i++){
    if(array[i]===value&&length<65535){
      length++;
    }else{
      runs.push([value,length]);
      value=array[i];
      length=1;
    }
  }
  runs.push([value,length]);
  return runs;
}

function decodeRuns(runs,length){
  const out=new Uint8Array(length);
  if(!Array.isArray(runs))return out;
  let p=0;
  for(const run of runs){
    if(!Array.isArray(run)||run.length<2)continue;
    const value=clampInt(run[0],0,255,0),n=clampInt(run[1],0,length-p,0);
    out.fill(value,p,p+n);
    p+=n;
    if(p>=length)break;
  }
  return out;
}

function encodeTintCells(rArray=tintR,gArray=tintG,bArray=tintB,aArray=tintA){
  const out=[];
  const length=aArray?aArray.length:0;
  for(let i=0;i<length;i++){
    if(aArray[i])out.push([i,rArray[i],gArray[i],bArray[i]]);
  }
  return out;
}

function decodeTintCells(cells,length){
  const r=new Uint8Array(length),g=new Uint8Array(length),b=new Uint8Array(length),a=new Uint8Array(length);
  if(!Array.isArray(cells))return{r,g,b,a};
  for(const cell of cells){
    if(!Array.isArray(cell)||cell.length<4)continue;
    const i=clampInt(cell[0],0,length-1,-1);
    if(i<0)continue;
    r[i]=clampInt(cell[1],0,255,0);
    g[i]=clampInt(cell[2],0,255,0);
    b[i]=clampInt(cell[3],0,255,0);
    a[i]=255;
  }
  return{r,g,b,a};
}

function sampleSavedIndex(world,c,r,savedCols,savedRows){
  const targetCols=world?world.cols:cols,targetRows=world?world.rows:rows;
  const sc=clamp(Math.floor((c+.5)*savedCols/targetCols),0,savedCols-1);
  const sr=clamp(Math.floor((r+.5)*savedRows/targetRows),0,savedRows-1);
  return sr*savedCols+sc;
}

function targetIndexFromSaved(world,sc,sr,savedCols,savedRows){
  const targetCols=world?world.cols:cols,targetRows=world?world.rows:rows;
  const c=clamp(Math.floor((sc+.5)*targetCols/savedCols),0,targetCols-1);
  const r=clamp(Math.floor((sr+.5)*targetRows/savedRows),0,targetRows-1);
  return saveCodecIndex(world,c,r);
}

function savedDimensionsAreValid(saved){
  return clampInt(saved&&saved.cols,1,1000,0)>0&&clampInt(saved&&saved.rows,1,1000,0)>0;
}

function restoreResampledEditableArrays(world,savedCols,savedRows,savedMaterial,savedSource,savedParticleTint,savedBackgroundTint,hasSplitTint){
  const a=world?world.arrays:null,targetCount=saveCodecCount(world),targetMaterial=world?a.material:material,targetMass=world?a.mass:mass,targetFlowDir=world?a.flowDir:flowDir,targetSourceMat=world?a.sourceMat:sourceMat,targetTintR=world?a.tintR:tintR,targetTintG=world?a.tintG:tintG,targetTintB=world?a.tintB:tintB,targetTintA=world?a.tintA:tintA,targetBgTintR=world?a.bgTintR:bgTintR,targetBgTintG=world?a.bgTintG:bgTintG,targetBgTintB=world?a.bgTintB:bgTintB,targetBgTintA=world?a.bgTintA:bgTintA;
  const materialSource=new Int32Array(targetCount),sourcePriority=new Int16Array(targetCount);
  materialSource.fill(-1);
  for(let sr=0;sr<savedRows;sr++)for(let sc=0;sc<savedCols;sc++){
    const si=sr*savedCols+sc,mat=isKnownMaterial(savedMaterial[si])?savedMaterial[si]:EMPTY;
    if(mat===EMPTY)continue;
    const i=targetIndexFromSaved(world,sc,sr,savedCols,savedRows);
    if(targetMaterial[i]!==EMPTY&&materialDensity(targetMaterial[i])>materialDensity(mat))continue;
    targetMaterial[i]=mat;
    targetMass[i]=materialCarriesMass(mat)?defaultMassForMaterial(mat):0;
    targetFlowDir[i]=defaultFlowDirForMaterial(mat);
    materialSource[i]=si;
  }
  for(let sr=0;sr<savedRows;sr++)for(let sc=0;sc<savedCols;sc++){
    const si=sr*savedCols+sc,src=isKnownMaterial(savedSource[si])&&isFlowMaterial(savedSource[si])?savedSource[si]:EMPTY;
    if(src===EMPTY)continue;
    const i=targetIndexFromSaved(world,sc,sr,savedCols,savedRows),p=materialDensity(src);
    if(targetSourceMat[i]!==EMPTY&&sourcePriority[i]>p)continue;
    targetSourceMat[i]=src;
    sourcePriority[i]=p;
  }
  for(let si=0;si<savedBackgroundTint.a.length;si++){
    if(!savedBackgroundTint.a[si])continue;
    const i=targetIndexFromSaved(world,si%savedCols,Math.floor(si/savedCols),savedCols,savedRows);
    targetBgTintR[i]=savedBackgroundTint.r[si];
    targetBgTintG[i]=savedBackgroundTint.g[si];
    targetBgTintB[i]=savedBackgroundTint.b[si];
    targetBgTintA[i]=255;
  }
  for(let i=0;i<targetCount;i++){
    const si=materialSource[i];
    if(si<0||!savedParticleTint.a[si])continue;
    targetTintR[i]=savedParticleTint.r[si];
    targetTintG[i]=savedParticleTint.g[si];
    targetTintB[i]=savedParticleTint.b[si];
    targetTintA[i]=255;
  }
  if(hasSplitTint)return;
  for(let si=0;si<savedParticleTint.a.length;si++){
    if(!savedParticleTint.a[si]||savedMaterial[si]!==EMPTY)continue;
    const i=targetIndexFromSaved(world,si%savedCols,Math.floor(si/savedCols),savedCols,savedRows);
    targetBgTintR[i]=savedParticleTint.r[si];
    targetBgTintG[i]=savedParticleTint.g[si];
    targetBgTintB[i]=savedParticleTint.b[si];
    targetBgTintA[i]=255;
  }
}

function restoreEditableArrays(worldOrSaved,maybeSaved){
  const hasWorld=maybeSaved!==undefined&&saveCodecHasWorldArg(worldOrSaved),world=hasWorld?worldOrSaved:null,saved=hasWorld?maybeSaved:worldOrSaved;
  const savedCols=clampInt(saved.cols,1,1000,0),savedRows=clampInt(saved.rows,1,1000,0);
  if(!savedCols||!savedRows)return false;
  const savedCount=savedCols*savedRows;
  const savedMaterial=decodeRuns(saved.material,savedCount);
  const savedSource=decodeRuns(saved.sourceMat,savedCount);
  const hasSplitTint=Array.isArray(saved.particleTint)||Array.isArray(saved.backgroundTint);
  const savedParticleTint=decodeTintCells(hasSplitTint?saved.particleTint:saved.tint,savedCount);
  const savedBackgroundTint=decodeTintCells(hasSplitTint?saved.backgroundTint:[],savedCount);
  clearEditableGridState(world);
  if(world){
    const nextAir=Array.isArray(saved.airColor)?saved.airColor.map(v=>clampInt(v,0,255,255)).slice(0,3):[255,255,255];
    while(nextAir.length<3)nextAir.push(255);
    world.airColor=nextAir;
  }else if(typeof setAirColorState==='function')setAirColorState(saved.airColor);
  else{
    airColor=Array.isArray(saved.airColor)?saved.airColor.map(v=>clampInt(v,0,255,255)).slice(0,3):[255,255,255];
    while(airColor.length<3)airColor.push(255);
  }
  const targetCols=world?world.cols:cols,targetRows=world?world.rows:rows,a=world?world.arrays:null;
  const targetMaterial=world?a.material:material,targetMass=world?a.mass:mass,targetFlowDir=world?a.flowDir:flowDir,targetSourceMat=world?a.sourceMat:sourceMat,targetTintR=world?a.tintR:tintR,targetTintG=world?a.tintG:tintG,targetTintB=world?a.tintB:tintB,targetTintA=world?a.tintA:tintA,targetBgTintR=world?a.bgTintR:bgTintR,targetBgTintG=world?a.bgTintG:bgTintG,targetBgTintB=world?a.bgTintB:bgTintB,targetBgTintA=world?a.bgTintA:bgTintA;
  const sameSize=savedCols===targetCols&&savedRows===targetRows;
  if(!sameSize){
    restoreResampledEditableArrays(world,savedCols,savedRows,savedMaterial,savedSource,savedParticleTint,savedBackgroundTint,hasSplitTint);
    return true;
  }
  for(let r=0;r<targetRows;r++)for(let c=0;c<targetCols;c++){
    const si=saveCodecIndex(world,c,r);
    const i=saveCodecIndex(world,c,r),mat=isKnownMaterial(savedMaterial[si])?savedMaterial[si]:EMPTY,src=isKnownMaterial(savedSource[si])&&isFlowMaterial(savedSource[si])?savedSource[si]:EMPTY;
    targetMaterial[i]=mat;
    targetMass[i]=materialCarriesMass(mat)?defaultMassForMaterial(mat):0;
    targetFlowDir[i]=defaultFlowDirForMaterial(mat);
    targetSourceMat[i]=src;
    if(savedBackgroundTint.a[si]){
      targetBgTintR[i]=savedBackgroundTint.r[si];
      targetBgTintG[i]=savedBackgroundTint.g[si];
      targetBgTintB[i]=savedBackgroundTint.b[si];
      targetBgTintA[i]=255;
    }
    if(savedParticleTint.a[si]){
      if(hasSplitTint||mat!==EMPTY){
        targetTintR[i]=savedParticleTint.r[si];
        targetTintG[i]=savedParticleTint.g[si];
        targetTintB[i]=savedParticleTint.b[si];
        targetTintA[i]=mat===EMPTY?0:255;
      }else{
        targetBgTintR[i]=savedParticleTint.r[si];
        targetBgTintG[i]=savedParticleTint.g[si];
        targetBgTintB[i]=savedParticleTint.b[si];
        targetBgTintA[i]=255;
      }
    }
  }
  return true;
}

function normalizeRestoreSnapshotArgs(worldOrSaved,maybeSaved){
  if(maybeSaved!==undefined){
    return{world:worldOrSaved,saved:maybeSaved};
  }
  return{world:null,saved:worldOrSaved};
}

function restoreWorldSnapshot(worldOrSaved,maybeSaved){
  const args=normalizeRestoreSnapshotArgs(worldOrSaved,maybeSaved),world=args.world,saved=args.saved;
  if(!saved||saved.version!==WORLD_SNAPSHOT_VERSION)return{ok:false,reason:'unsupported-version'};
  if(!savedDimensionsAreValid(saved))return{ok:false,reason:'invalid-dimensions'};
  const savedCols=clampInt(saved.cols,1,1000,0),savedRows=clampInt(saved.rows,1,1000,0);
  const explicitWorld=world&&saveCodecHasWorldArg(world);
  let targetIsActive=false,previousCustomMaterials=null;
  try{
    targetIsActive=explicitWorld&&typeof currentWorld!=='undefined'&&currentWorld===world;
  }catch(e){}
  if(explicitWorld&&!targetIsActive&&typeof currentCustomMaterialState==='function'){
    previousCustomMaterials=currentCustomMaterialState();
  }
  const restorePreviousCustomMaterials=()=>{
    if(explicitWorld&&!targetIsActive&&previousCustomMaterials&&typeof restoreCustomMaterials==='function')restoreCustomMaterials(previousCustomMaterials);
  };
  restoreCustomMaterials(saved.customMaterials);
  if(explicitWorld){
    world.customMaterials=typeof copyCustomMaterialState==='function'
      ?copyCustomMaterialState(exportCustomMaterials())
      :exportCustomMaterials();
  }else if(typeof currentCustomMaterialState==='function')currentCustomMaterialState();
  if(!(explicitWorld?restoreEditableArrays(world,saved):restoreEditableArrays(saved))){
    restorePreviousCustomMaterials();
    return{ok:false,reason:'invalid-dimensions'};
  }
  if(world&&saveCodecHasWorldArg(world)){
    world.runtimeSettings=typeof normalizeRuntimeSettingsState==='function'
      ?normalizeRuntimeSettingsState({
        sourceInterval:saved.sourceInterval,
        lightingEnabled:saved.lightingEnabled===undefined?true:saved.lightingEnabled,
        lightStrength:saved.lightStrength,
        sideLightStrength:saved.sideLightStrength,
        shadowStrength:saved.shadowStrength
      })
      :{
        sourceInterval:clampInt(saved.sourceInterval,1,60,1),
        lightingEnabled:saved.lightingEnabled===undefined?true:!!saved.lightingEnabled,
        lightStrength:Number.isFinite(Number(saved.lightStrength))?clamp(Number(saved.lightStrength),0,1):.18,
        sideLightStrength:Number.isFinite(Number(saved.sideLightStrength))?clamp(Number(saved.sideLightStrength),0,2):1,
        shadowStrength:Number.isFinite(Number(saved.shadowStrength))?clamp(Number(saved.shadowStrength),0,1):.16
      };
  }else if(typeof applyRuntimeSettingsState==='function'){
    applyRuntimeSettingsState({
      sourceInterval:saved.sourceInterval,
      lightingEnabled:saved.lightingEnabled===undefined?true:saved.lightingEnabled,
      lightStrength:saved.lightStrength,
      sideLightStrength:saved.sideLightStrength,
      shadowStrength:saved.shadowStrength
    });
  }else{
    sourceInterval=clampInt(saved.sourceInterval,1,60,1);
    lightingEnabled=saved.lightingEnabled===undefined?true:!!saved.lightingEnabled;
    lightStrength=clamp(Number(saved.lightStrength),0,1);
    if(!Number.isFinite(lightStrength))lightStrength=.18;
    sideLightStrength=clamp(Number(saved.sideLightStrength),0,2);
    if(!Number.isFinite(sideLightStrength))sideLightStrength=1;
    shadowStrength=clamp(Number(saved.shadowStrength),0,1);
    if(!Number.isFinite(shadowStrength))shadowStrength=.16;
  }
  if(world&&saveCodecHasWorldArg(world)){
    world.bodies=[];
    world.nextBodyId=1;
    world.editDirty=false;
  }else if(typeof setBodyRuntimeState==='function')setBodyRuntimeState();
  else bodies=[];
  if(world&&saveCodecHasWorldArg(world)){
    world.editDirty=false;
  }else if(typeof setEditDirtyState==='function')setEditDirtyState(false);
  else editDirty=false;
  if(typeof rebuildBodyMask==='function'){
    if(world)rebuildBodyMask(world);
    else rebuildBodyMask();
  }
  restorePreviousCustomMaterials();
  const targetCols=explicitWorld?world.cols:cols,targetRows=explicitWorld?world.rows:rows;
  return{ok:true,resampled:savedCols!==targetCols||savedRows!==targetRows,savedCols,savedRows};
}
