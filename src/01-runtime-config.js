'use strict';

// DOM-free configuration commands. Browser controls should gather input values,
// then call these helpers so future adapters can reuse the same validation.

function countMaterialCells(mat){
  let total=0;
  if(typeof material==='undefined'||!material)return total;
  for(let i=0;i<material.length;i++)if(material[i]===mat)total++;
  return total;
}

function countMaterialUses(mat){
  return countMaterialCells(mat)+(typeof countSourceCells==='function'?countSourceCells(mat):0);
}

function materialDraftColor(input,kind){
  const fallback=kind===MATERIAL_KIND_GRANULAR?[208,164,79]:[36,168,198];
  const source=Array.isArray(input&&input.color)?input.color:fallback;
  const out=source.map(v=>clampInt(v,0,255,0)).slice(0,3);
  while(out.length<3)out.push(0);
  return out;
}

function normalizeMaterialDraft(kind,input={},existingDef=null){
  const isGranular=kind===MATERIAL_KIND_GRANULAR,isFluid=kind===MATERIAL_KIND_FLUID;
  if(!isGranular&&!isFluid)return null;
  const fallbackName=existingDef&&existingDef.name
    ?existingDef.name
    :isGranular?`Granular ${customGranularCount+1}`:`Fluid ${customFluidCount+1}`;
  return{
    name:String(input.name||fallbackName).trim()||fallbackName,
    color:materialDraftColor(input,kind),
    density:clampInt(input.density,1,98,isGranular?2:1),
    blocksLight:input.blocksLight===undefined?isGranular:!!input.blocksLight,
    emissive:!!input.emissive,
    maxSlope:clampInt(input.maxSlope,0,32,1),
    erosionResistance:clampInt(input.erosionResistance,1,999,SAND_LIKE_FLOW.erosionResistance)
  };
}

function applyMaterialCommand(command){
  if(!command||typeof command.type!=='string')return{ok:false,reason:'invalid-command'};
  if(command.type==='add'){
    const draft=normalizeMaterialDraft(command.kind,command);
    if(!draft)return{ok:false,reason:'invalid-kind'};
    const def=command.kind===MATERIAL_KIND_GRANULAR
      ?registerCustomGranularMaterial(draft)
      :registerCustomFluidMaterial(draft);
    return def?{ok:true,def}:{ok:false,reason:'limit'};
  }
  if(command.type==='update'){
    const id=clampInt(command.id,5,250,0),current=MATERIAL_BY_ID[id];
    if(!current||!current.custom)return{ok:false,reason:'locked'};
    const draft=normalizeMaterialDraft(current.kind,command,current);
    if(!draft)return{ok:false,reason:'invalid-kind'};
    const def=updateCustomMaterial(id,draft);
    return def?{ok:true,def}:{ok:false,reason:'not-found'};
  }
  if(command.type==='delete'){
    const id=clampInt(command.id,5,250,0),def=MATERIAL_BY_ID[id];
    if(!def||!def.custom)return{ok:false,reason:'locked'};
    const uses=countMaterialUses(id);
    if(uses>0)return{ok:false,reason:'in-use',uses,def};
    return deleteCustomMaterial(id)?{ok:true,def}:{ok:false,reason:'not-found'};
  }
  return{ok:false,reason:'unknown-command'};
}

function currentRuntimeSettings(){
  if(typeof currentRuntimeSettingsState==='function')return currentRuntimeSettingsState();
  return{sourceInterval,lightingEnabled,lightStrength,sideLightStrength,shadowStrength};
}

function applyRuntimeSettingsCommand(command){
  if(!command||typeof command.type!=='string')return{ok:false,reason:'invalid-command',settings:currentRuntimeSettings()};
  if(command.type==='sourceInterval'){
    if(typeof applyRuntimeSettingsState==='function')applyRuntimeSettingsState({sourceInterval:command.value});
    else sourceInterval=clampInt(command.value,1,60,1);
    return{ok:true,settings:currentRuntimeSettings()};
  }
  if(command.type==='lighting'){
    if(typeof applyRuntimeSettingsState==='function'){
      const patch={};
      if(command.enabled!==undefined)patch.lightingEnabled=command.enabled;
      if(command.lightStrength!==undefined)patch.lightStrength=command.lightStrength;
      if(command.sideLightStrength!==undefined)patch.sideLightStrength=command.sideLightStrength;
      if(command.shadowStrength!==undefined)patch.shadowStrength=command.shadowStrength;
      applyRuntimeSettingsState(patch);
    }else{
      if(command.enabled!==undefined)lightingEnabled=!!command.enabled;
      if(command.lightStrength!==undefined){
        lightStrength=clamp(Number(command.lightStrength),0,1);
        if(!Number.isFinite(lightStrength))lightStrength=.18;
      }
      if(command.sideLightStrength!==undefined){
        sideLightStrength=clamp(Number(command.sideLightStrength),0,2);
        if(!Number.isFinite(sideLightStrength))sideLightStrength=1;
      }
      if(command.shadowStrength!==undefined){
        shadowStrength=clamp(Number(command.shadowStrength),0,1);
        if(!Number.isFinite(shadowStrength))shadowStrength=.16;
      }
    }
    return{ok:true,settings:currentRuntimeSettings()};
  }
  return{ok:false,reason:'unknown-command',settings:currentRuntimeSettings()};
}
