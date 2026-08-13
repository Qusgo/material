'use strict';

// Browser-only single-slot localStorage save/load adapter. It stores the
// editable canvas state, not transient physics state, so loading behaves like
// reopening a drawn scene.

const CANVAS_SAVE_KEY='material-force-lab.canvas.v1';

function loadSnapshotMessage(result){
  if(result.reason==='unsupported-version')return'Saved canvas version is unsupported';
  if(result.reason==='invalid-dimensions')return'Saved canvas dimensions are invalid';
  return'Load failed';
}

function saveCanvasSnapshot(){
  if(typeof localStorage==='undefined')return{ok:false,message:'Local storage is unavailable'};
  try{
    localStorage.setItem(CANVAS_SAVE_KEY,JSON.stringify(serializeAppSnapshot()));
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
  const result=restoreAppSnapshot(saved);
  if(!result.ok)return{ok:false,message:loadSnapshotMessage(result)};
  if(typeof syncCanvasAfterSnapshotLoad==='function')syncCanvasAfterSnapshotLoad(result);
  return{ok:true,message:result.resampled?`Canvas loaded (${result.savedCols}x${result.savedRows} -> ${cols}x${rows})`:'Canvas loaded'};
}
