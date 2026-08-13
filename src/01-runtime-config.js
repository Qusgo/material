'use strict';

// DOM-free configuration commands. Browser controls should gather input values,
// then call these helpers so future adapters can reuse the same validation.

function countMaterialCells(worldOrMat,maybeMat){
  const world=maybeMat!==undefined&&runtimeConfigHasWorldArg(worldOrMat)?worldOrMat:null,mat=maybeMat!==undefined?maybeMat:worldOrMat;
  const targetMaterial=world?world.arrays.material:typeof material==='undefined'?null:material;
  let total=0;
  if(typeof targetMaterial==='undefined'||!targetMaterial)return total;
  for(let i=0;i<targetMaterial.length;i++)if(targetMaterial[i]===mat)total++;
  return total;
}

function countMaterialUses(worldOrMat,maybeMat){
  const world=maybeMat!==undefined?worldOrMat:null,mat=maybeMat!==undefined?maybeMat:worldOrMat;
  const materialUses=world?countMaterialCells(world,mat):countMaterialCells(mat);
  const sourceUses=typeof countSourceCells==='function'
    ?world?countSourceCells(world,mat):countSourceCells(mat)
    :0;
  return materialUses+sourceUses;
}

function runtimeConfigHasWorldArg(value){
  return !!(value&&typeof value==='object'&&value.arrays&&Number.isFinite(value.cols));
}

function installRuntimeConfigWorld(world){
  if(runtimeConfigHasWorldArg(world)&&typeof useWorldState==='function')useWorldState(world);
}

function normalizeRuntimeConfigSettings(settings={}){
  if(typeof normalizeRuntimeSettingsState==='function')return normalizeRuntimeSettingsState(settings);
  const source=settings||{};
  return{
    sourceInterval:clampInt(source.sourceInterval,1,60,1),
    lightingEnabled:source.lightingEnabled===undefined?true:!!source.lightingEnabled,
    lightStrength:Number.isFinite(Number(source.lightStrength))?clamp(Number(source.lightStrength),0,1):.18,
    sideLightStrength:Number.isFinite(Number(source.sideLightStrength))?clamp(Number(source.sideLightStrength),0,2):1,
    shadowStrength:Number.isFinite(Number(source.shadowStrength))?clamp(Number(source.shadowStrength),0,1):.16
  };
}

function applyRuntimeConfigSettingsToWorld(world,patch={}){
  const current=normalizeRuntimeConfigSettings(world.runtimeSettings);
  world.runtimeSettings=normalizeRuntimeConfigSettings({...current,...patch});
  return world.runtimeSettings;
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

function normalizeMaterialCommandArgs(worldOrCommand,maybeCommand){
  if(maybeCommand!==undefined){
    return{world:worldOrCommand,command:maybeCommand};
  }
  return{world:null,command:worldOrCommand};
}

function syncMaterialCommandWorld(world){
  if(!world)return;
  if(typeof copyCustomMaterialState==='function')world.customMaterials=copyCustomMaterialState(exportCustomMaterials());
  else world.customMaterials=exportCustomMaterials();
}

function runtimeConfigWorldIsActive(world){
  try{
    return runtimeConfigHasWorldArg(world)&&typeof currentWorld!=='undefined'&&currentWorld===world;
  }catch(e){}
  return false;
}

function withMaterialRegistryForWorld(world,fn){
  if(!runtimeConfigHasWorldArg(world))return fn();
  const targetIsActive=runtimeConfigWorldIsActive(world);
  const previous=targetIsActive?null:exportCustomMaterials();
  if(!targetIsActive)restoreCustomMaterials(world.customMaterials);
  try{
    const result=fn();
    syncMaterialCommandWorld(world);
    return result;
  }finally{
    if(!targetIsActive)restoreCustomMaterials(previous);
  }
}

function applyMaterialCommand(worldOrCommand,maybeCommand){
  const args=normalizeMaterialCommandArgs(worldOrCommand,maybeCommand),world=args.world,command=args.command;
  if(runtimeConfigHasWorldArg(world))return withMaterialRegistryForWorld(world,()=>applyMaterialCommand(command));
  if(!command||typeof command.type!=='string')return{ok:false,reason:'invalid-command'};
  if(command.type==='add'){
    const draft=normalizeMaterialDraft(command.kind,command);
    if(!draft)return{ok:false,reason:'invalid-kind'};
    const def=command.kind===MATERIAL_KIND_GRANULAR
      ?registerCustomGranularMaterial(draft)
      :registerCustomFluidMaterial(draft);
    syncMaterialCommandWorld(world);
    return def?{ok:true,def}:{ok:false,reason:'limit'};
  }
  if(command.type==='update'){
    const id=clampInt(command.id,5,250,0),current=MATERIAL_BY_ID[id];
    if(!current||!current.custom)return{ok:false,reason:'locked'};
    const draft=normalizeMaterialDraft(current.kind,command,current);
    if(!draft)return{ok:false,reason:'invalid-kind'};
    const def=updateCustomMaterial(id,draft);
    syncMaterialCommandWorld(world);
    return def?{ok:true,def}:{ok:false,reason:'not-found'};
  }
  if(command.type==='delete'){
    const id=clampInt(command.id,5,250,0),def=MATERIAL_BY_ID[id];
    if(!def||!def.custom)return{ok:false,reason:'locked'};
    const uses=world?countMaterialUses(world,id):countMaterialUses(id);
    if(uses>0)return{ok:false,reason:'in-use',uses,def};
    const ok=deleteCustomMaterial(id);
    syncMaterialCommandWorld(world);
    return ok?{ok:true,def}:{ok:false,reason:'not-found'};
  }
  return{ok:false,reason:'unknown-command'};
}

function currentRuntimeSettings(world){
  if(runtimeConfigHasWorldArg(world))return normalizeRuntimeConfigSettings(world.runtimeSettings);
  if(typeof currentRuntimeSettingsState==='function')return currentRuntimeSettingsState();
  return{sourceInterval,lightingEnabled,lightStrength,sideLightStrength,shadowStrength};
}

function normalizeRuntimeSettingsCommandArgs(worldOrCommand,maybeCommand){
  if(maybeCommand!==undefined){
    return{world:worldOrCommand,command:maybeCommand};
  }
  return{world:null,command:worldOrCommand};
}

function applyRuntimeSettingsCommand(worldOrCommand,maybeCommand){
  const args=normalizeRuntimeSettingsCommandArgs(worldOrCommand,maybeCommand),world=args.world,command=args.command;
  if(!command||typeof command.type!=='string')return{ok:false,reason:'invalid-command',settings:currentRuntimeSettings()};
  if(command.type==='sourceInterval'){
    if(runtimeConfigHasWorldArg(world))applyRuntimeConfigSettingsToWorld(world,{sourceInterval:command.value});
    else if(typeof applyRuntimeSettingsState==='function')applyRuntimeSettingsState({sourceInterval:command.value});
    else sourceInterval=clampInt(command.value,1,60,1);
    return{ok:true,settings:currentRuntimeSettings(world)};
  }
  if(command.type==='lighting'){
    const patch={};
    if(command.enabled!==undefined)patch.lightingEnabled=command.enabled;
    if(command.lightStrength!==undefined)patch.lightStrength=command.lightStrength;
    if(command.sideLightStrength!==undefined)patch.sideLightStrength=command.sideLightStrength;
    if(command.shadowStrength!==undefined)patch.shadowStrength=command.shadowStrength;
    if(runtimeConfigHasWorldArg(world))applyRuntimeConfigSettingsToWorld(world,patch);
    else if(typeof applyRuntimeSettingsState==='function'){
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
    return{ok:true,settings:currentRuntimeSettings(world)};
  }
  return{ok:false,reason:'unknown-command',settings:currentRuntimeSettings(world)};
}
