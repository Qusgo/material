'use strict';

// Material ids, rendering metadata, density order, and shared flow rules.
//
// Add or remove material behavior here first. The simulation code should ask
// these helpers what a material can do instead of hard-coding ids.

const EMPTY=0,WATER=1,SAND=2,FIXED_STONE=4;
const WATER_MAX_MASS=1,WATER_MIN_MASS=.01;
const MAX_CUSTOM_MATERIALS=12;

const MATERIAL_KIND_FLUID='fluid';
const MATERIAL_KIND_GRANULAR='granular';
const MATERIAL_KIND_FIXED='fixed';

const MATERIALS={};
const MATERIAL_BY_ID={};
const MATERIAL_FROM_NAME={};
const COLORS={};
const FLOW_RULES={};
const STABLE_FRAMES={};
let FLOW_MATERIALS=[];
let FLOW_ORDER=[];
let nextCustomMaterialId=5;
let customMaterialCount=0;
let customFluidCount=0;
let customGranularCount=0;

const COMMON_FLOW={
  gravity:.12,
  drag:.68,
  slides:true,
  passes:1,
  deleteWhenUnstable:true
};

const WATER_LIKE_FLOW={
  maxSlope:1,
  slopeRise:1,
  slopeRun:2,
  slopeLookahead:6,
  localSlopeSurface:true,
  persistentDirection:false,
  requiresBasinSleep:false,
  useBasinSettle:false,
  useSurfaceLevelPass:false,
  escapeTriggerFrames:6,
  singlePixelTurnThreshold:8,
  escapeScanDistance:32,
  unstableFrames:12,
  forceScale:1.1
};

const SAND_LIKE_FLOW={
  maxSlope:1,
  localSlopeSurface:true,
  slideRequiresSlope:true,
  slideFromExposedSide:true,
  erosionResistance:24,
  unstableFrames:10,
  forceScale:.65
};

function sanitizeMaterialKey(name){
  return String(name||'material').trim().replace(/[^a-z0-9]+/gi,'_').replace(/^_+|_+$/g,'').toLowerCase()||'material';
}

function uniqueMaterialKey(base){
  const root=sanitizeMaterialKey(base);
  let key=root,n=2;
  while(MATERIALS[key])key=`${root}_${n++}`;
  return key;
}

function uniqueMaterialKeyForEdit(base,currentKey){
  const root=sanitizeMaterialKey(base);
  let key=root,n=2;
  while(MATERIALS[key]&&key!==currentKey)key=`${root}_${n++}`;
  return key;
}

function clampInt(value,min,max,fallback){
  const n=Number.parseInt(value,10);
  if(!Number.isFinite(n))return fallback;
  return clamp(n,min,max);
}

function flowRule(overrides){
  return {...COMMON_FLOW,...overrides};
}

function registerMaterial(key,def){
  MATERIALS[key]=def;
  MATERIAL_BY_ID[def.id]=def;
  MATERIAL_FROM_NAME[key]=def.id;
  COLORS[def.id]=def.color;
  if(def.flow){
    FLOW_RULES[def.id]=flowRule(def.flow);
    STABLE_FRAMES[def.id]=def.stableFrames;
  }
  refreshFlowMaterialLists();
  return def;
}

function reindexMaterial(def,oldKey){
  if(oldKey&&oldKey!==def.key){
    delete MATERIALS[oldKey];
    delete MATERIAL_FROM_NAME[oldKey];
  }
  MATERIALS[def.key]=def;
  MATERIAL_BY_ID[def.id]=def;
  MATERIAL_FROM_NAME[def.key]=def.id;
  COLORS[def.id]=def.color;
  if(def.flow){
    FLOW_RULES[def.id]=flowRule(def.flow);
    STABLE_FRAMES[def.id]=def.stableFrames;
  }else{
    delete FLOW_RULES[def.id];
    delete STABLE_FRAMES[def.id];
  }
  refreshFlowMaterialLists();
  return def;
}

function refreshFlowMaterialLists(){
  FLOW_MATERIALS=Object.values(MATERIAL_BY_ID).filter(def=>def.flow).map(def=>def.id);
  FLOW_ORDER=[...FLOW_MATERIALS].sort((a,b)=>materialDensity(b)-materialDensity(a)||b-a);
}

function allocateCustomMaterialId(){
  while(MATERIAL_BY_ID[nextCustomMaterialId])nextCustomMaterialId++;
  return nextCustomMaterialId++;
}

function registerCustomFluidMaterial({name,color,density,blocksLight=false,emissive=false}){
  if(customMaterialCount>=MAX_CUSTOM_MATERIALS)return null;
  const id=allocateCustomMaterialId();
  const label=String(name||`Fluid ${customFluidCount+1}`).trim()||`Fluid ${customFluidCount+1}`;
  const key=uniqueMaterialKey(label);
  customMaterialCount++;
  customFluidCount++;
  return registerMaterial(key,{
    id,
    key,
    name:label,
    kind:MATERIAL_KIND_FLUID,
    density:clampInt(density,1,98,1),
    color,
    blocksLight:!!blocksLight,
    emissive:!!emissive,
    flow:true,
    stableFrames:14,
    maxMass:WATER_MAX_MASS,
    directedFlow:true,
    custom:true,
    flow:{name:label,...WATER_LIKE_FLOW}
  });
}

function registerCustomGranularMaterial({name,color,density,maxSlope,erosionResistance,blocksLight=true,emissive=false}){
  if(customMaterialCount>=MAX_CUSTOM_MATERIALS)return null;
  const id=allocateCustomMaterialId();
  const label=String(name||`Granular ${customGranularCount+1}`).trim()||`Granular ${customGranularCount+1}`;
  const key=uniqueMaterialKey(label);
  customMaterialCount++;
  customGranularCount++;
  return registerMaterial(key,{
    id,
    key,
    name:label,
    kind:MATERIAL_KIND_GRANULAR,
    density:clampInt(density,1,98,2),
    color,
    blocksLight:!!blocksLight,
    emissive:!!emissive,
    flow:true,
    stableFrames:14,
    custom:true,
    flow:{name:label,...SAND_LIKE_FLOW,maxSlope:clampInt(maxSlope,0,32,1),erosionResistance:clampInt(erosionResistance,1,999,SAND_LIKE_FLOW.erosionResistance)}
  });
}

function clearCustomMaterialRegistry(){
  for(const def of Object.values(MATERIAL_BY_ID)){
    if(!def.custom)continue;
    delete MATERIALS[def.key];
    delete MATERIAL_BY_ID[def.id];
    delete MATERIAL_FROM_NAME[def.key];
    delete COLORS[def.id];
    delete FLOW_RULES[def.id];
    delete STABLE_FRAMES[def.id];
  }
  customMaterialCount=0;
  customFluidCount=0;
  customGranularCount=0;
  nextCustomMaterialId=5;
  refreshFlowMaterialLists();
}

function exportCustomMaterials(){
  return Object.values(MATERIAL_BY_ID).filter(def=>def.custom).map(def=>({
    id:def.id,
    key:def.key,
    name:def.name,
    kind:def.kind,
    density:def.density,
    color:def.color,
    blocksLight:!!def.blocksLight,
    emissive:!!def.emissive,
    maxSlope:def.flow&&def.flow.maxSlope,
    erosionResistance:def.flow&&def.flow.erosionResistance
  }));
}

function restoreCustomMaterials(saved){
  clearCustomMaterialRegistry();
  if(!Array.isArray(saved))return;
  for(const item of saved){
    const id=clampInt(item&&item.id,5,250,0);
    const kind=item&&item.kind;
    if(!id||MATERIAL_BY_ID[id]||customMaterialCount>=MAX_CUSTOM_MATERIALS)continue;
    const isGranular=kind===MATERIAL_KIND_GRANULAR,isFluid=kind===MATERIAL_KIND_FLUID;
    if(!isGranular&&!isFluid)continue;
    const label=String(item.name||item.key||`Material ${id}`).trim()||`Material ${id}`;
    const key=uniqueMaterialKey(item.key||label);
    const density=clampInt(item.density,1,98,isGranular?2:1);
    const color=Array.isArray(item.color)?item.color.map(v=>clampInt(v,0,255,0)).slice(0,3):[36,168,198];
    while(color.length<3)color.push(0);
    customMaterialCount++;
    if(isGranular)customGranularCount++;
    else customFluidCount++;
    registerMaterial(key,{
      id,
      key,
      name:label,
      kind,
      density,
      color,
      blocksLight:item.blocksLight===undefined?isGranular:!!item.blocksLight,
      emissive:!!item.emissive,
      flow:true,
      stableFrames:14,
      custom:true,
      maxMass:isFluid?WATER_MAX_MASS:undefined,
      directedFlow:isFluid,
      flow:isGranular
        ?{name:label,...SAND_LIKE_FLOW,maxSlope:clampInt(item.maxSlope,0,32,1),erosionResistance:clampInt(item.erosionResistance,1,999,SAND_LIKE_FLOW.erosionResistance)}
        :{name:label,...WATER_LIKE_FLOW}
    });
    nextCustomMaterialId=Math.max(nextCustomMaterialId,id+1);
  }
  refreshFlowMaterialLists();
}

function materialDef(mat){
  return MATERIAL_BY_ID[mat]||MATERIAL_BY_ID[EMPTY];
}

function materialIsCustom(mat){
  return !!materialDef(mat).custom;
}

function updateCustomMaterial(id,{name,color,density,maxSlope,erosionResistance,blocksLight,emissive}){
  const def=MATERIAL_BY_ID[id];
  if(!def||!def.custom)return null;
  const oldKey=def.key;
  const fallbackName=def.kind===MATERIAL_KIND_GRANULAR?`Granular ${customGranularCount+1}`:`Fluid ${customFluidCount+1}`;
  const label=String(name||def.name||fallbackName).trim()||fallbackName;
  def.name=label;
  def.key=uniqueMaterialKeyForEdit(label,oldKey);
  def.color=color;
  def.density=clampInt(density,1,98,def.density||1);
  if(blocksLight!==undefined)def.blocksLight=!!blocksLight;
  if(emissive!==undefined)def.emissive=!!emissive;
  if(def.flow){
    def.flow={...def.flow,name:label};
    if(def.kind===MATERIAL_KIND_GRANULAR){
      def.flow.maxSlope=clampInt(maxSlope,0,32,def.flow.maxSlope||1);
      def.flow.erosionResistance=clampInt(erosionResistance,1,999,def.flow.erosionResistance||SAND_LIKE_FLOW.erosionResistance);
    }
  }
  return reindexMaterial(def,oldKey);
}

function deleteCustomMaterial(id){
  const def=MATERIAL_BY_ID[id];
  if(!def||!def.custom)return false;
  if(typeof material!=='undefined'){
    for(let i=0;i<material.length;i++)if(material[i]===id)return false;
  }
  if(typeof sourceMat!=='undefined'){
    for(let i=0;i<sourceMat.length;i++)if(sourceMat[i]===id)return false;
  }
  delete MATERIALS[def.key];
  delete MATERIAL_BY_ID[id];
  delete MATERIAL_FROM_NAME[def.key];
  delete COLORS[id];
  delete FLOW_RULES[id];
  delete STABLE_FRAMES[id];
  customMaterialCount=Math.max(0,customMaterialCount-1);
  refreshFlowMaterialLists();
  return true;
}

function materialKeyFromId(mat){
  return materialDef(mat).key||'empty';
}

function materialColor(mat){
  return materialDef(mat).color||MATERIAL_BY_ID[EMPTY].color;
}

function isKnownMaterial(mat){
  return !!MATERIAL_BY_ID[mat];
}

function isFlowMaterial(mat){
  return !!materialDef(mat).flow;
}

function isSolidMaterial(mat){
  return materialDef(mat).kind===MATERIAL_KIND_FIXED;
}

function isFluidMaterial(mat){
  return materialDef(mat).kind===MATERIAL_KIND_FLUID;
}

function isGranularMaterial(mat){
  return materialDef(mat).kind===MATERIAL_KIND_GRANULAR;
}

function materialDensity(mat){
  return materialDef(mat).density;
}

function materialBlocksLight(mat){
  return !!materialDef(mat).blocksLight;
}

function materialEmissive(mat){
  return !!materialDef(mat).emissive;
}

function materialCarriesMass(mat){
  return !!materialDef(mat).maxMass;
}

function materialUsesDirectedFlow(mat){
  return !!materialDef(mat).directedFlow;
}

function materialErosionResistance(mat){
  const rule=FLOW_RULES[mat];
  return rule&&rule.erosionResistance?rule.erosionResistance:0;
}

function materialCanBeCarried(mat){
  return isGranularMaterial(mat)&&materialErosionResistance(mat)>0;
}

function defaultMassForMaterial(mat){
  return materialDef(mat).maxMass||0;
}

function defaultFlowDirForMaterial(mat){
  return materialUsesDirectedFlow(mat)?randDir():0;
}

function listSelectableMaterials(){
  return Object.values(MATERIAL_BY_ID).filter(def=>def.id!==EMPTY);
}

registerMaterial('empty',{id:EMPTY,key:'empty',name:'Empty',kind:'empty',density:0,color:[255,255,255]});
registerMaterial('water',{
  id:WATER,
  key:'water',
  name:'Water',
  kind:MATERIAL_KIND_FLUID,
  density:1,
  color:[24,141,226],
  blocksLight:false,
  emissive:false,
  flow:true,
  stableFrames:14,
  maxMass:WATER_MAX_MASS,
  directedFlow:true,
  flow:{name:'water',...WATER_LIKE_FLOW}
});
registerMaterial('sand',{
  id:SAND,
  key:'sand',
  name:'Sand',
  kind:MATERIAL_KIND_GRANULAR,
  density:2,
  color:[216,180,95],
  blocksLight:true,
  emissive:false,
  flow:true,
  stableFrames:14,
  flow:{name:'sand',...SAND_LIKE_FLOW}
});
registerMaterial('fixedStone',{
  id:FIXED_STONE,
  key:'fixedStone',
  name:'Fixed Stone',
  kind:MATERIAL_KIND_FIXED,
  density:99,
  color:[58,58,58],
  blocksLight:true,
  emissive:false,
  solid:true
});
