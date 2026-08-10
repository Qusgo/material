'use strict';

// Runtime constants, mutable simulation state, and basic coordinate helpers.

// These files are loaded as ordered classic scripts, not ES modules. Top-level
// bindings are intentionally shared by later files in the same page.
const BODY_LIMIT=64,GRAVITY=.24,MAX_BODY_SPEED=7,MAX_ANGULAR_SPEED=.18,CELL_MAX_COLS=220,CELL_MAX_ROWS=360,MAX_FILL_CELLS=28000,WATER_SETTLE_INTERVAL=1;
const SIM_STEP_MS=14;
const WATER_RESIDUE_MAX_FRACTION=.025,WATER_RESIDUE_MAX_CELLS=96;
const STABLE_SPEED=.18,WAKE_RADIUS=3;
let viewW=1,viewH=1,dpr=1,cellSize=5,cols=1,rows=1,count=1;
// Hot grid state. Keep these as typed arrays; most simulation code assumes
// index = row * cols + col and mutates these arrays directly.
let material,mass,vx,vy,bodyMask,flowDir,restAge,stableMask,tintR,tintG,tintB,tintA,bgTintR,bgTintG,bgTintB,bgTintA,sourceMat,lightMask;
let moveHistory,moveFlip,horizontalDir,horizontalTurns,escapeDir,escapeTarget,carriedBy,carriedTTL,lastMoveTick;
let waterSeen,waterSpaceMark,waterComponentMark,waterBasinMark,waterSleepBlockMark,waterTargetMark,waterWakeMark,waterQueue,rowCounts;
let waterSpaceToken=1,waterComponentToken=1,waterBasinToken=1,waterTargetToken=1,waterWakeToken=1;
let bodies=[],nextBodyId=1;
let airColor=[255,255,255];
installWorldState(createWorldState(cols,rows,{cellSize,bodies,nextBodyId,airColor}));
let tool='brush',selected='water',simTick=0,editDirty=false;
let sourceInterval=1;
let lightingEnabled=true,lightStrength=.18,sideLightStrength=1,shadowStrength=.16;
const runtimeSettings={sourceInterval,lightingEnabled,lightStrength,sideLightStrength,shadowStrength};
function captureRuntimeSettingsFromGlobals(){
  runtimeSettings.sourceInterval=clampInt(sourceInterval,1,60,1);
  runtimeSettings.lightingEnabled=!!lightingEnabled;
  runtimeSettings.lightStrength=Number.isFinite(Number(lightStrength))?clamp(Number(lightStrength),0,1):.18;
  runtimeSettings.sideLightStrength=Number.isFinite(Number(sideLightStrength))?clamp(Number(sideLightStrength),0,2):1;
  runtimeSettings.shadowStrength=Number.isFinite(Number(shadowStrength))?clamp(Number(shadowStrength),0,1):.16;
  return runtimeSettings;
}
function syncRuntimeSettingsToGlobals(settings=runtimeSettings){
  sourceInterval=clampInt(settings.sourceInterval,1,60,1);
  lightingEnabled=!!settings.lightingEnabled;
  lightStrength=Number.isFinite(Number(settings.lightStrength))?clamp(Number(settings.lightStrength),0,1):.18;
  sideLightStrength=Number.isFinite(Number(settings.sideLightStrength))?clamp(Number(settings.sideLightStrength),0,2):1;
  shadowStrength=Number.isFinite(Number(settings.shadowStrength))?clamp(Number(settings.shadowStrength),0,1):.16;
  runtimeSettings.sourceInterval=sourceInterval;
  runtimeSettings.lightingEnabled=lightingEnabled;
  runtimeSettings.lightStrength=lightStrength;
  runtimeSettings.sideLightStrength=sideLightStrength;
  runtimeSettings.shadowStrength=shadowStrength;
  return runtimeSettings;
}
function currentRuntimeSettingsState(){
  const settings=captureRuntimeSettingsFromGlobals();
  return{sourceInterval:settings.sourceInterval,lightingEnabled:settings.lightingEnabled,lightStrength:settings.lightStrength,sideLightStrength:settings.sideLightStrength,shadowStrength:settings.shadowStrength};
}
function applyRuntimeSettingsState(patch={}){
  captureRuntimeSettingsFromGlobals();
  if(Object.prototype.hasOwnProperty.call(patch,'sourceInterval'))runtimeSettings.sourceInterval=patch.sourceInterval;
  if(Object.prototype.hasOwnProperty.call(patch,'lightingEnabled'))runtimeSettings.lightingEnabled=patch.lightingEnabled;
  if(Object.prototype.hasOwnProperty.call(patch,'lightStrength'))runtimeSettings.lightStrength=patch.lightStrength;
  if(Object.prototype.hasOwnProperty.call(patch,'sideLightStrength'))runtimeSettings.sideLightStrength=patch.sideLightStrength;
  if(Object.prototype.hasOwnProperty.call(patch,'shadowStrength'))runtimeSettings.shadowStrength=patch.shadowStrength;
  syncRuntimeSettingsToGlobals(runtimeSettings);
  return currentRuntimeSettingsState();
}
function appShellContext(){
  if(typeof globalThis!=='undefined'&&globalThis.appContext)return globalThis.appContext;
  try{return typeof appContext!=='undefined'&&appContext?appContext:null}catch(e){return null}
}
function currentTool(){const context=appShellContext();return context&&context.tool?context.tool:tool}
function setCurrentTool(value){tool=value||'brush';const context=appShellContext();if(context)context.tool=tool;return tool}
function currentSelectedKey(){const context=appShellContext();return context&&context.selected?context.selected:selected}
function setCurrentSelectedKey(value){selected=value||'water';const context=appShellContext();if(context)context.selected=selected;return selected}
function idx(c,r){return r*cols+c} function inBounds(c,r){return c>=0&&c<cols&&r>=0&&r<rows} function clamp(v,a,b){return Math.max(a,Math.min(b,v))} function randDir(){return Math.random()<.5?-1:1}
function pointToCell(x,y){return{c:clamp(Math.floor(x/cellSize),0,cols-1),r:clamp(Math.floor(y/cellSize),0,rows-1)}} function cellCenter(c,r){return{x:(c+.5)*cellSize,y:(r+.5)*cellSize}}
function resetRuntimeClock(){}
function isBodyMaterial(){return false}
