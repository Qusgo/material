'use strict';

// DOM-free save/load codecs and editable-array restore logic. Browser storage
// wrappers live in 04-save-load.js.

const WORLD_SNAPSHOT_VERSION=1;

function serializeWorldSnapshot(){
  return{
    version:WORLD_SNAPSHOT_VERSION,
    cols,
    rows,
    sourceInterval,
    selected,
    airColor:airColor.slice(0,3),
    lightingEnabled,
    lightStrength,
    sideLightStrength,
    shadowStrength,
    customMaterials:exportCustomMaterials(),
    material:encodeRuns(material),
    sourceMat:encodeRuns(sourceMat),
    particleTint:encodeTintCells(tintR,tintG,tintB,tintA),
    backgroundTint:encodeTintCells(bgTintR,bgTintG,bgTintB,bgTintA)
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
  for(let i=0;i<count;i++){
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

function sampleSavedIndex(c,r,savedCols,savedRows){
  const sc=clamp(Math.floor((c+.5)*savedCols/cols),0,savedCols-1);
  const sr=clamp(Math.floor((r+.5)*savedRows/rows),0,savedRows-1);
  return sr*savedCols+sc;
}

function targetIndexFromSaved(sc,sr,savedCols,savedRows){
  const c=clamp(Math.floor((sc+.5)*cols/savedCols),0,cols-1);
  const r=clamp(Math.floor((sr+.5)*rows/savedRows),0,rows-1);
  return idx(c,r);
}

function savedDimensionsAreValid(saved){
  return clampInt(saved&&saved.cols,1,1000,0)>0&&clampInt(saved&&saved.rows,1,1000,0)>0;
}

function restoreResampledEditableArrays(savedCols,savedRows,savedMaterial,savedSource,savedParticleTint,savedBackgroundTint,hasSplitTint){
  const materialSource=new Int32Array(count),sourcePriority=new Int16Array(count);
  materialSource.fill(-1);
  for(let sr=0;sr<savedRows;sr++)for(let sc=0;sc<savedCols;sc++){
    const si=sr*savedCols+sc,mat=isKnownMaterial(savedMaterial[si])?savedMaterial[si]:EMPTY;
    if(mat===EMPTY)continue;
    const i=targetIndexFromSaved(sc,sr,savedCols,savedRows);
    if(material[i]!==EMPTY&&materialDensity(material[i])>materialDensity(mat))continue;
    material[i]=mat;
    mass[i]=materialCarriesMass(mat)?defaultMassForMaterial(mat):0;
    flowDir[i]=defaultFlowDirForMaterial(mat);
    materialSource[i]=si;
  }
  for(let sr=0;sr<savedRows;sr++)for(let sc=0;sc<savedCols;sc++){
    const si=sr*savedCols+sc,src=isKnownMaterial(savedSource[si])&&isFlowMaterial(savedSource[si])?savedSource[si]:EMPTY;
    if(src===EMPTY)continue;
    const i=targetIndexFromSaved(sc,sr,savedCols,savedRows),p=materialDensity(src);
    if(sourceMat[i]!==EMPTY&&sourcePriority[i]>p)continue;
    sourceMat[i]=src;
    sourcePriority[i]=p;
  }
  for(let si=0;si<savedBackgroundTint.a.length;si++){
    if(!savedBackgroundTint.a[si])continue;
    const i=targetIndexFromSaved(si%savedCols,Math.floor(si/savedCols),savedCols,savedRows);
    bgTintR[i]=savedBackgroundTint.r[si];
    bgTintG[i]=savedBackgroundTint.g[si];
    bgTintB[i]=savedBackgroundTint.b[si];
    bgTintA[i]=255;
  }
  for(let i=0;i<count;i++){
    const si=materialSource[i];
    if(si<0||!savedParticleTint.a[si])continue;
    tintR[i]=savedParticleTint.r[si];
    tintG[i]=savedParticleTint.g[si];
    tintB[i]=savedParticleTint.b[si];
    tintA[i]=255;
  }
  if(hasSplitTint)return;
  for(let si=0;si<savedParticleTint.a.length;si++){
    if(!savedParticleTint.a[si]||savedMaterial[si]!==EMPTY)continue;
    const i=targetIndexFromSaved(si%savedCols,Math.floor(si/savedCols),savedCols,savedRows);
    bgTintR[i]=savedParticleTint.r[si];
    bgTintG[i]=savedParticleTint.g[si];
    bgTintB[i]=savedParticleTint.b[si];
    bgTintA[i]=255;
  }
}

function restoreEditableArrays(saved){
  const savedCols=clampInt(saved.cols,1,1000,0),savedRows=clampInt(saved.rows,1,1000,0);
  if(!savedCols||!savedRows)return false;
  const savedCount=savedCols*savedRows;
  const savedMaterial=decodeRuns(saved.material,savedCount);
  const savedSource=decodeRuns(saved.sourceMat,savedCount);
  const hasSplitTint=Array.isArray(saved.particleTint)||Array.isArray(saved.backgroundTint);
  const savedParticleTint=decodeTintCells(hasSplitTint?saved.particleTint:saved.tint,savedCount);
  const savedBackgroundTint=decodeTintCells(hasSplitTint?saved.backgroundTint:[],savedCount);
  clearEditableGridState();
  airColor=Array.isArray(saved.airColor)?saved.airColor.map(v=>clampInt(v,0,255,255)).slice(0,3):[255,255,255];
  while(airColor.length<3)airColor.push(255);
  const sameSize=savedCols===cols&&savedRows===rows;
  if(!sameSize){
    restoreResampledEditableArrays(savedCols,savedRows,savedMaterial,savedSource,savedParticleTint,savedBackgroundTint,hasSplitTint);
    return true;
  }
  for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){
    const si=idx(c,r);
    const i=idx(c,r),mat=isKnownMaterial(savedMaterial[si])?savedMaterial[si]:EMPTY,src=isKnownMaterial(savedSource[si])&&isFlowMaterial(savedSource[si])?savedSource[si]:EMPTY;
    material[i]=mat;
    mass[i]=materialCarriesMass(mat)?defaultMassForMaterial(mat):0;
    flowDir[i]=defaultFlowDirForMaterial(mat);
    sourceMat[i]=src;
    if(savedBackgroundTint.a[si]){
      bgTintR[i]=savedBackgroundTint.r[si];
      bgTintG[i]=savedBackgroundTint.g[si];
      bgTintB[i]=savedBackgroundTint.b[si];
      bgTintA[i]=255;
    }
    if(savedParticleTint.a[si]){
      if(hasSplitTint||mat!==EMPTY){
        tintR[i]=savedParticleTint.r[si];
        tintG[i]=savedParticleTint.g[si];
        tintB[i]=savedParticleTint.b[si];
        tintA[i]=mat===EMPTY?0:255;
      }else{
        bgTintR[i]=savedParticleTint.r[si];
        bgTintG[i]=savedParticleTint.g[si];
        bgTintB[i]=savedParticleTint.b[si];
        bgTintA[i]=255;
      }
    }
  }
  return true;
}

function restoreWorldSnapshot(saved){
  if(!saved||saved.version!==WORLD_SNAPSHOT_VERSION)return{ok:false,reason:'unsupported-version'};
  if(!savedDimensionsAreValid(saved))return{ok:false,reason:'invalid-dimensions'};
  const savedCols=clampInt(saved.cols,1,1000,0),savedRows=clampInt(saved.rows,1,1000,0);
  restoreCustomMaterials(saved.customMaterials);
  if(!restoreEditableArrays(saved))return{ok:false,reason:'invalid-dimensions'};
  sourceInterval=clampInt(saved.sourceInterval,1,60,1);
  lightingEnabled=saved.lightingEnabled===undefined?true:!!saved.lightingEnabled;
  lightStrength=clamp(Number(saved.lightStrength),0,1);
  if(!Number.isFinite(lightStrength))lightStrength=.18;
  sideLightStrength=clamp(Number(saved.sideLightStrength),0,2);
  if(!Number.isFinite(sideLightStrength))sideLightStrength=1;
  shadowStrength=clamp(Number(saved.shadowStrength),0,1);
  if(!Number.isFinite(shadowStrength))shadowStrength=.16;
  selected=MATERIAL_FROM_NAME[saved.selected]?saved.selected:materialKeyFromId(WATER);
  bodies=[];
  fillPreview=[];
  placing=null;
  forceState=null;
  editDirty=false;
  if(typeof rebuildBodyMask==='function')rebuildBodyMask();
  return{ok:true,resampled:savedCols!==cols||savedRows!==rows,savedCols,savedRows};
}
