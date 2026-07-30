'use strict';

// Single-slot local save/load. This stores the editable canvas state, not the
// transient physics state, so loading behaves like reopening a drawn scene.

const CANVAS_SAVE_KEY='material-force-lab.canvas.v1';
const CANVAS_SAVE_VERSION=1;

function saveCanvasSnapshot(){
  if(typeof localStorage==='undefined')return{ok:false,message:'Local storage is unavailable'};
  const payload={
    version:CANVAS_SAVE_VERSION,
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
  try{
    localStorage.setItem(CANVAS_SAVE_KEY,JSON.stringify(payload));
    return{ok:true,message:'Canvas saved'};
  }catch(err){
    return{ok:false,message:'Save failed: storage may be full'};
  }
}

function loadCanvasSnapshot(){
  if(typeof localStorage==='undefined')return{ok:false,message:'Local storage is unavailable'};
  const raw=localStorage.getItem(CANVAS_SAVE_KEY);
  if(!raw)return{ok:false,message:'No saved canvas'};
  let saved=null;
  try{
    saved=JSON.parse(raw);
  }catch(err){
    return{ok:false,message:'Saved canvas is corrupted'};
  }
  if(!saved||saved.version!==CANVAS_SAVE_VERSION)return{ok:false,message:'Saved canvas version is unsupported'};
  if(!savedDimensionsAreValid(saved))return{ok:false,message:'Saved canvas dimensions are invalid'};
  running=false;
  accumulator=0;
  restoreCustomMaterials(saved.customMaterials);
  if(!restoreEditableArrays(saved))return{ok:false,message:'Saved canvas dimensions are invalid'};
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
  rebuildBodyMask();
  if(typeof syncButtons==='function')syncButtons();
  if(typeof syncSourceRateControls==='function')syncSourceRateControls(null);
  if(typeof syncLightingControls==='function')syncLightingControls(null);
  if(typeof updateFillPreview==='function')updateFillPreview();
  if(typeof render==='function')render();
  const resampled=saved.cols!==cols||saved.rows!==rows;
  return{ok:true,message:resampled?`Canvas loaded (${saved.cols}x${saved.rows} -> ${cols}x${rows})`:'Canvas loaded'};
}
