'use strict';

// Browser app-shell state. Keeping these values in one plain object makes the
// eventual WebView/miniprogram adapter boundary visible without changing the
// classic-script loading model yet.

let tool='brush',selected='water';

function currentTool(){return tool}
function setCurrentTool(value){tool=value||'brush';return tool}
function currentSelectedKey(){return selected}
function setCurrentSelectedKey(value){selected=value||'water';return selected}
function isBodyMaterial(key=currentSelectedKey()){
  return key==='stoneCircle'||key==='stoneRect';
}

function appTool(context=appContext){
  const active=resolveAppContext(context);
  return active.tool||(typeof currentTool==='function'?currentTool():tool);
}

function appSelectedKey(context=appContext){
  const active=resolveAppContext(context);
  return active.selected||(typeof currentSelectedKey==='function'?currentSelectedKey():selected);
}

function appSelectedMaterialId(context=appContext){
  return appMaterialIdFromKey(appSelectedKey(context),context);
}

function appSelectionIsBodyMaterial(context=appContext){
  return isBodyMaterial(appSelectedKey(context));
}

const appContext={
  engine:createSimulationEngine({world:currentWorldState()}),
  statusText:'Brush: paint material directly',
  running:false,
  debugBasins:false,
  tool:typeof tool==='undefined'?'brush':tool,
  selected:typeof selected==='undefined'?'water':selected,
  materialMenuOpen:false,
  materialEditorMode:null,
  materialEditorTarget:0,
  pointerDown:false,
  lastPoint:null,
  hoverPoint:null,
  fillPreview:[],
  fillPreviewMaterial:0,
  placing:null,
  forceState:null,
  dpr:1,
  lastFrame:0,
  accumulator:0
};
if(typeof globalThis!=='undefined')globalThis.appContext=appContext;

function resolveAppContext(context=appContext){
  return context||appContext;
}

function appWorld(context=appContext){
  return resolveAppContext(context).engine.currentWorld();
}

function applyAppEditCommand(command,context=appContext){
  return resolveAppContext(context).engine.edit(command);
}

function finishAppEdit(context=appContext){
  const world=resolveAppContext(context).engine.finishEdit();
  if(typeof resetRuntimeClock==='function')resetRuntimeClock();
  return world;
}

function stepAppWorld(iterations=1,context=appContext){
  return resolveAppContext(context).engine.step(iterations);
}

function resizeAppWorld(nextCols,nextRows,options={},context=appContext){
  return resolveAppContext(context).engine.resize(nextCols,nextRows,options);
}

function rebuildAppBodyMask(context=appContext){
  const active=resolveAppContext(context),world=appWorld(active);
  if(typeof rebuildBodyMask==='function')rebuildBodyMask(world);
  return world;
}

function placementPreviewBody(world=null,context=appContext){
  const active=resolveAppContext(context);
  if(!active.placing||typeof makeBodyFromPlacement!=='function')return null;
  const targetWorld=world||appWorld(active);
  const body=makeBodyFromPlacement(active.placing);
  if(!body)return null;
  const canPlace=typeof canPlaceBody==='function'?canPlaceBody(targetWorld,body):true;
  return{body,canPlace,world:targetWorld};
}

function appVisibleMaterialCounts(context=appContext){
  const world=appWorld(context),arrays=world&&world.arrays?world.arrays:null;
  const materialArray=arrays&&arrays.material?arrays.material:material;
  const sourceArray=arrays&&arrays.sourceMat?arrays.sourceMat:sourceMat;
  const massArray=arrays&&arrays.mass?arrays.mass:mass;
  const total=world&&Number.isFinite(world.count)?world.count:count;
  const counts={flow:0,stone:0,sources:0,waterMass:0,byId:{}};
  for(let i=0;i<total;i++){
    if(sourceArray&&isKnownMaterial(sourceArray[i])&&isFlowMaterial(sourceArray[i]))counts.sources++;
    const mat=materialArray?materialArray[i]:EMPTY;
    if(mat===EMPTY||!isKnownMaterial(mat))continue;
    counts.byId[mat]=(counts.byId[mat]||0)+1;
    if(isFlowMaterial(mat))counts.flow++;
    if(isSolidMaterial(mat))counts.stone++;
    if(materialCarriesMass(mat))counts.waterMass+=massArray?massArray[i]:0;
  }
  return counts;
}

function appDefaultMaterialKey(context=appContext){
  appWorld(context);
  return typeof materialKeyFromId==='function'?materialKeyFromId(WATER):'water';
}

function appMaterialKeyExists(key,context=appContext){
  appWorld(context);
  return typeof MATERIAL_FROM_NAME!=='undefined'&&!!MATERIAL_FROM_NAME[key];
}

function appMaterialIdFromKey(key,context=appContext){
  appWorld(context);
  return appMaterialKeyExists(key,context)?MATERIAL_FROM_NAME[key]:WATER;
}

function appMaterialDefinition(id,context=appContext){
  appWorld(context);
  return materialDef(id);
}

function appMaterialUseCount(id,context=appContext){
  const world=appWorld(context);
  return typeof countMaterialUses==='function'?countMaterialUses(world,id):0;
}

function appMaterialFlowRule(id,context=appContext){
  appWorld(context);
  return typeof FLOW_RULES!=='undefined'&&FLOW_RULES[id]?FLOW_RULES[id]:null;
}

function appSelectableMaterialItems(context=appContext){
  const world=appWorld(context);
  return listSelectableMaterials().map(item=>Object.assign({},item,{
    uses:typeof countMaterialUses==='function'?countMaterialUses(world,item.id):0
  }));
}

function appSnapshotSelectedKey(value,context=appContext){
  const fallback=appDefaultMaterialKey(context);
  return appMaterialKeyExists(value,context)?value:fallback;
}

function serializeAppSnapshot(context=appContext){
  const active=resolveAppContext(context);
  const snapshot=active.engine.serialize();
  const selectedKey=active.selected||(typeof currentSelectedKey==='function'?currentSelectedKey():(typeof selected==='undefined'?null:selected));
  snapshot.selected=appSnapshotSelectedKey(selectedKey,active);
  return snapshot;
}

function restoreAppSnapshot(snapshot,context=appContext){
  const active=resolveAppContext(context);
  const result=active.engine.restore(snapshot);
  const fallbackSelected=active.selected||(typeof currentSelectedKey==='function'?currentSelectedKey():(typeof selected==='undefined'?null:selected));
  const restoredSelected=appSnapshotSelectedKey(snapshot&&snapshot.selected?snapshot.selected:fallbackSelected,active);
  if(typeof setCurrentSelectedKey==='function')active.selected=setCurrentSelectedKey(restoredSelected);
  else active.selected=restoredSelected;
  if(typeof currentTool==='function')active.tool=currentTool();
  return result;
}

function applyAppMaterialCommand(command,context=appContext){
  return resolveAppContext(context).engine.materialCommand(command);
}

function applyAppRuntimeSettingsCommand(command,context=appContext){
  return resolveAppContext(context).engine.runtimeSettingsCommand(command);
}

function currentAppRuntimeSettings(context=appContext){
  return resolveAppContext(context).engine.runtimeSettings();
}

function appRenderBuffer(world,data,context=appContext){
  const active=resolveAppContext(context);
  if(active.engine&&active.engine.world===world&&typeof active.engine.renderBuffer==='function'){
    return active.engine.renderBuffer(data);
  }
  buildRenderBuffer(world,data);
  return data;
}

function appDebugBasins(world,context=appContext){
  const active=resolveAppContext(context);
  if(!active.debugBasins||typeof buildWaterBasins!=='function')return[];
  return buildWaterBasins(world);
}

function renderApp(context=appContext){
  const active=resolveAppContext(context);
  render(appWorld(active),active);
}
