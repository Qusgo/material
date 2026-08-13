'use strict';

// DOM-free world shell. It groups dimensions and grid arrays without forcing
// the existing classic-script runtime to stop using shared globals yet.

let currentWorld=null;

function normalizeWorldDimension(value,fallback=1){
  const n=Math.floor(Number(value));
  return Number.isFinite(n)&&n>0?n:fallback;
}

function normalizeViewSize(value,fallback=1){
  const n=Number(value);
  return Number.isFinite(n)&&n>0?n:fallback;
}

function createWaterScratchTokens(){
  return{
    waterSpaceToken:1,
    waterComponentToken:1,
    waterBasinToken:1,
    waterTargetToken:1,
    waterWakeToken:1
  };
}

function normalizeBodyId(value){
  return normalizeWorldDimension(value,1);
}

function captureBodyRuntimeState(world=currentWorld){
  try{
    if(typeof bodies!=='undefined'&&Array.isArray(bodies)){
      return{bodies,nextBodyId:normalizeBodyId(nextBodyId)};
    }
  }catch(e){}
  return{
    bodies:world&&Array.isArray(world.bodies)?world.bodies:[],
    nextBodyId:normalizeBodyId(world&&world.nextBodyId)
  };
}

function installBodyRuntimeState(world){
  const state=captureBodyRuntimeState(world);
  world.bodies=Array.isArray(world.bodies)?world.bodies:state.bodies;
  world.nextBodyId=normalizeBodyId(world.nextBodyId||state.nextBodyId);
  try{
    if(typeof bodies!=='undefined'){
      bodies=world.bodies;
      nextBodyId=world.nextBodyId;
    }
  }catch(e){}
}

function setBodyRuntimeState(nextBodies=[],nextId=1){
  const state={
    bodies:Array.isArray(nextBodies)?nextBodies:[],
    nextBodyId:normalizeBodyId(nextId)
  };
  try{
    if(typeof bodies!=='undefined'){
      bodies=state.bodies;
      nextBodyId=state.nextBodyId;
    }
  }catch(e){}
  if(currentWorld){
    currentWorld.bodies=state.bodies;
    currentWorld.nextBodyId=state.nextBodyId;
  }
  return state;
}

function normalizeAirColorState(color){
  const source=Array.isArray(color)?color:[255,255,255];
  return[
    clampInt(source[0],0,255,255),
    clampInt(source[1],0,255,255),
    clampInt(source[2],0,255,255)
  ];
}

function captureAirColorState(world=currentWorld){
  try{
    if(typeof airColor!=='undefined'&&Array.isArray(airColor))return normalizeAirColorState(airColor);
  }catch(e){}
  return normalizeAirColorState(world&&world.airColor);
}

function installAirColorState(world){
  world.airColor=normalizeAirColorState(world.airColor);
  try{
    if(typeof airColor!=='undefined')airColor=world.airColor;
  }catch(e){}
}

function setAirColorState(color=[255,255,255]){
  const next=normalizeAirColorState(color);
  try{
    if(typeof airColor!=='undefined')airColor=next;
  }catch(e){}
  if(currentWorld)currentWorld.airColor=next;
  return next;
}

function currentAirColorState(){
  const next=captureAirColorState(currentWorld);
  if(currentWorld)currentWorld.airColor=next;
  return next;
}

function normalizeSimTick(value){
  const n=Math.floor(Number(value));
  return Number.isFinite(n)&&n>=0?n:0;
}

function captureRuntimeFlagsState(world=currentWorld){
  try{
    if(typeof simTick!=='undefined'&&typeof editDirty!=='undefined'){
      return{simTick:normalizeSimTick(simTick),editDirty:!!editDirty};
    }
  }catch(e){}
  return{
    simTick:normalizeSimTick(world&&world.simTick),
    editDirty:!!(world&&world.editDirty)
  };
}

function installRuntimeFlagsState(world){
  const state=captureRuntimeFlagsState(world);
  world.simTick=normalizeSimTick(world.simTick===undefined?state.simTick:world.simTick);
  world.editDirty=world.editDirty===undefined?state.editDirty:!!world.editDirty;
  try{
    if(typeof simTick!=='undefined'){
      simTick=world.simTick;
      editDirty=world.editDirty;
    }
  }catch(e){}
}

function setRuntimeFlagsState(patch={}){
  const current=captureRuntimeFlagsState();
  const state={
    simTick:Object.prototype.hasOwnProperty.call(patch,'simTick')?normalizeSimTick(patch.simTick):current.simTick,
    editDirty:Object.prototype.hasOwnProperty.call(patch,'editDirty')?!!patch.editDirty:current.editDirty
  };
  try{
    if(typeof simTick!=='undefined'){
      simTick=state.simTick;
      editDirty=state.editDirty;
    }
  }catch(e){}
  if(currentWorld){
    currentWorld.simTick=state.simTick;
    currentWorld.editDirty=state.editDirty;
  }
  return state;
}

function incrementSimTickState(){
  const state=captureRuntimeFlagsState();
  return setRuntimeFlagsState({simTick:state.simTick+1}).simTick;
}

function worldStateHasWorldArg(value){
  return !!(value&&typeof value==='object'&&value.arrays&&Number.isFinite(value.cols));
}

function worldStateIsActive(world){
  try{
    return worldStateHasWorldArg(world)&&typeof currentWorld!=='undefined'&&currentWorld===world;
  }catch(e){}
  return false;
}

function incrementWorldSimTick(world){
  if(worldStateHasWorldArg(world)){
    world.simTick=normalizeSimTick(world.simTick)+1;
    if(worldStateIsActive(world))setRuntimeFlagsState({simTick:world.simTick});
    return world.simTick;
  }
  return incrementSimTickState();
}

function setEditDirtyState(value=true){
  return setRuntimeFlagsState({editDirty:value}).editDirty;
}

function normalizeRuntimeSettingsState(settings={}){
  const source=settings||{};
  return{
    sourceInterval:clampInt(source.sourceInterval,1,60,1),
    lightingEnabled:source.lightingEnabled===undefined?true:!!source.lightingEnabled,
    lightStrength:Number.isFinite(Number(source.lightStrength))?clamp(Number(source.lightStrength),0,1):.18,
    sideLightStrength:Number.isFinite(Number(source.sideLightStrength))?clamp(Number(source.sideLightStrength),0,2):1,
    shadowStrength:Number.isFinite(Number(source.shadowStrength))?clamp(Number(source.shadowStrength),0,1):.16
  };
}

function captureRuntimeSettingsState(world=currentWorld){
  const base=normalizeRuntimeSettingsState(world&&world.runtimeSettings),settings={...base};
  let found=false;
  try{
    if(typeof sourceInterval!=='undefined'){settings.sourceInterval=sourceInterval;found=true;}
  }catch(e){}
  try{
    if(typeof lightingEnabled!=='undefined'){settings.lightingEnabled=lightingEnabled;found=true;}
  }catch(e){}
  try{
    if(typeof lightStrength!=='undefined'){settings.lightStrength=lightStrength;found=true;}
  }catch(e){}
  try{
    if(typeof sideLightStrength!=='undefined'){settings.sideLightStrength=sideLightStrength;found=true;}
  }catch(e){}
  try{
    if(typeof shadowStrength!=='undefined'){settings.shadowStrength=shadowStrength;found=true;}
  }catch(e){}
  return found?normalizeRuntimeSettingsState(settings):base;
}

function installRuntimeSettingsState(world){
  world.runtimeSettings=normalizeRuntimeSettingsState(world.runtimeSettings);
  try{
    if(typeof syncRuntimeSettingsToGlobals==='function')syncRuntimeSettingsToGlobals(world.runtimeSettings);
  }catch(e){}
}

function currentRuntimeSettingsState(){
  const next=captureRuntimeSettingsState(currentWorld);
  if(currentWorld)currentWorld.runtimeSettings=next;
  return next;
}

function setRuntimeSettingsState(patch={}){
  const current=captureRuntimeSettingsState(currentWorld);
  const state=normalizeRuntimeSettingsState({
    sourceInterval:Object.prototype.hasOwnProperty.call(patch,'sourceInterval')?patch.sourceInterval:current.sourceInterval,
    lightingEnabled:Object.prototype.hasOwnProperty.call(patch,'lightingEnabled')?patch.lightingEnabled:current.lightingEnabled,
    lightStrength:Object.prototype.hasOwnProperty.call(patch,'lightStrength')?patch.lightStrength:current.lightStrength,
    sideLightStrength:Object.prototype.hasOwnProperty.call(patch,'sideLightStrength')?patch.sideLightStrength:current.sideLightStrength,
    shadowStrength:Object.prototype.hasOwnProperty.call(patch,'shadowStrength')?patch.shadowStrength:current.shadowStrength
  });
  try{
    if(typeof syncRuntimeSettingsToGlobals==='function')syncRuntimeSettingsToGlobals(state);
  }catch(e){}
  if(currentWorld)currentWorld.runtimeSettings=state;
  return state;
}

function applyRuntimeSettingsState(patch={}){
  return setRuntimeSettingsState(patch);
}

function copyCustomMaterialState(saved=[]){
  if(!Array.isArray(saved))return[];
  return saved.map(item=>({
    ...item,
    color:Array.isArray(item&&item.color)?item.color.slice(0,3):item&&item.color
  }));
}

function captureCustomMaterialState(world=currentWorld){
  try{
    if(typeof exportCustomMaterials==='function')return copyCustomMaterialState(exportCustomMaterials());
  }catch(e){}
  return copyCustomMaterialState(world&&world.customMaterials);
}

function installCustomMaterialState(world){
  world.customMaterials=copyCustomMaterialState(world.customMaterials);
  try{
    if(typeof restoreCustomMaterials==='function')restoreCustomMaterials(world.customMaterials);
  }catch(e){}
}

function currentCustomMaterialState(){
  const next=captureCustomMaterialState(currentWorld);
  if(currentWorld)currentWorld.customMaterials=next;
  return next;
}

function captureViewSizeState(world=currentWorld){
  try{
    if(typeof viewW!=='undefined'&&typeof viewH!=='undefined'){
      return{
        viewW:normalizeViewSize(viewW,world&&world.viewW||1),
        viewH:normalizeViewSize(viewH,world&&world.viewH||1)
      };
    }
  }catch(e){}
  return{
    viewW:normalizeViewSize(world&&world.viewW,world?world.cols*world.cellSize:1),
    viewH:normalizeViewSize(world&&world.viewH,world?world.rows*world.cellSize:1)
  };
}

function installViewSizeState(world){
  const fallbackW=world.cols*world.cellSize,fallbackH=world.rows*world.cellSize;
  world.viewW=normalizeViewSize(world.viewW,fallbackW);
  world.viewH=normalizeViewSize(world.viewH,fallbackH);
  try{
    if(typeof viewW!=='undefined'){
      viewW=world.viewW;
      viewH=world.viewH;
    }
  }catch(e){}
}

function setViewSizeState(nextW,nextH){
  const state={
    viewW:normalizeViewSize(nextW,currentWorld?currentWorld.cols*currentWorld.cellSize:1),
    viewH:normalizeViewSize(nextH,currentWorld?currentWorld.rows*currentWorld.cellSize:1)
  };
  try{
    if(typeof viewW!=='undefined'){
      viewW=state.viewW;
      viewH=state.viewH;
    }
  }catch(e){}
  if(currentWorld){
    currentWorld.viewW=state.viewW;
    currentWorld.viewH=state.viewH;
  }
  return state;
}

function createWorldState(worldCols,worldRows,options={}){
  const nextCols=normalizeWorldDimension(worldCols,1),nextRows=normalizeWorldDimension(worldRows,1);
  const nextCellSize=normalizeWorldDimension(options.cellSize,1);
  const world={
    cols:nextCols,
    rows:nextRows,
    count:nextCols*nextRows,
    cellSize:nextCellSize,
    viewW:normalizeViewSize(options.viewW,nextCols*nextCellSize),
    viewH:normalizeViewSize(options.viewH,nextRows*nextCellSize),
    arrays:createGridArrays(nextCols*nextRows,nextRows),
    tokens:createWaterScratchTokens(),
    bodies:Array.isArray(options.bodies)?options.bodies:[],
    nextBodyId:normalizeBodyId(options.nextBodyId),
    airColor:normalizeAirColorState(options.airColor),
    simTick:normalizeSimTick(options.simTick),
    editDirty:!!options.editDirty,
    runtimeSettings:normalizeRuntimeSettingsState(options.runtimeSettings),
    customMaterials:copyCustomMaterialState(options.customMaterials)
  };
  return world;
}

function installWaterScratchTokens(tokens){
  const next=tokens||createWaterScratchTokens();
  waterSpaceToken=next.waterSpaceToken||1;
  waterComponentToken=next.waterComponentToken||1;
  waterBasinToken=next.waterBasinToken||1;
  waterTargetToken=next.waterTargetToken||1;
  waterWakeToken=next.waterWakeToken||1;
}

function captureWaterScratchTokens(world=currentWorld){
  if(!world)return null;
  world.tokens={
    waterSpaceToken,
    waterComponentToken,
    waterBasinToken,
    waterTargetToken,
    waterWakeToken
  };
  return world.tokens;
}

function installWorldState(world){
  if(!world||!world.arrays)throw new Error('Invalid world state');
  if(currentWorld&&currentWorld!==world){
    currentWorld.runtimeSettings=currentRuntimeSettingsState();
    currentWorld.customMaterials=currentCustomMaterialState();
  }
  else if(currentWorld===world)world.customMaterials=captureCustomMaterialState(world);
  currentWorld=world;
  cols=world.cols;
  rows=world.rows;
  count=world.count;
  cellSize=world.cellSize;
  installCustomMaterialState(world);
  installViewSizeState(world);
  installGridArrays(world.arrays);
  installWaterScratchTokens(world.tokens);
  installBodyRuntimeState(world);
  installAirColorState(world);
  installRuntimeFlagsState(world);
  installRuntimeSettingsState(world);
  return world;
}

function useWorldState(world){
  if(world)return installWorldState(world);
  return currentWorldState();
}

function currentWorldState(){
  if(!currentWorld)return null;
  currentWorld.cols=cols;
  currentWorld.rows=rows;
  currentWorld.count=count;
  currentWorld.cellSize=cellSize;
  const viewState=captureViewSizeState(currentWorld);
  currentWorld.viewW=viewState.viewW;
  currentWorld.viewH=viewState.viewH;
  currentWorld.arrays={
    material,mass,vx,vy,bodyMask,flowDir,restAge,stableMask,
    tintR,tintG,tintB,tintA,bgTintR,bgTintG,bgTintB,bgTintA,
    sourceMat,lightMask,moveHistory,moveFlip,horizontalDir,horizontalTurns,
    escapeDir,escapeTarget,carriedBy,carriedTTL,lastMoveTick,
    waterSeen,waterSpaceMark,waterComponentMark,waterBasinMark,
    waterSleepBlockMark,waterTargetMark,waterWakeMark,waterQueue,rowCounts
  };
  captureWaterScratchTokens(currentWorld);
  const bodyState=captureBodyRuntimeState(currentWorld);
  currentWorld.bodies=bodyState.bodies;
  currentWorld.nextBodyId=bodyState.nextBodyId;
  currentWorld.airColor=currentAirColorState();
  const flags=captureRuntimeFlagsState(currentWorld);
  currentWorld.simTick=flags.simTick;
  currentWorld.editDirty=flags.editDirty;
  currentWorld.runtimeSettings=currentRuntimeSettingsState();
  currentWorld.customMaterials=currentCustomMaterialState();
  return currentWorld;
}

function clampWorldNumber(value,min,max){
  return Math.max(min,Math.min(max,value));
}

function captureResizeSource(){
  return{
    cols,
    rows,
    cellSize,
    material,
    mass,
    vx,
    vy,
    flowDir,
    tintR,
    tintG,
    tintB,
    tintA,
    bgTintR,
    bgTintG,
    bgTintB,
    bgTintA,
    sourceMat
  };
}

function captureResizeSourceFromWorld(world){
  if(!world||!world.arrays)return captureResizeSource();
  const a=world.arrays;
  return{
    cols:world.cols,
    rows:world.rows,
    cellSize:world.cellSize,
    material:a.material,
    mass:a.mass,
    vx:a.vx,
    vy:a.vy,
    flowDir:a.flowDir,
    tintR:a.tintR,
    tintG:a.tintG,
    tintB:a.tintB,
    tintA:a.tintA,
    bgTintR:a.bgTintR,
    bgTintG:a.bgTintG,
    bgTintB:a.bgTintB,
    bgTintA:a.bgTintA,
    sourceMat:a.sourceMat
  };
}

function sampleResizeSourceIndex(c,r,source,targetCellSize=cellSize){
  const x=(c+.5)*targetCellSize,y=(r+.5)*targetCellSize;
  const oldC=clampWorldNumber(Math.floor(x/source.cellSize),0,source.cols-1);
  const oldR=clampWorldNumber(Math.floor(y/source.cellSize),0,source.rows-1);
  return oldR*source.cols+oldC;
}

function restoreResizeCellToArrays(target,targetIndex,sourceIndex,source){
  const mat=isKnownMaterial(source.material[sourceIndex])?source.material[sourceIndex]:EMPTY;
  const src=isKnownMaterial(source.sourceMat[sourceIndex])?source.sourceMat[sourceIndex]:EMPTY;
  target.material[targetIndex]=mat;
  target.mass[targetIndex]=materialCarriesMass(mat)?source.mass[sourceIndex]:defaultMassForMaterial(mat);
  target.vx[targetIndex]=source.vx[sourceIndex]||0;
  target.vy[targetIndex]=source.vy[sourceIndex]||0;
  target.flowDir[targetIndex]=materialUsesDirectedFlow(mat)
    ?(source.flowDir[sourceIndex]||defaultFlowDirForMaterial(mat))
    :defaultFlowDirForMaterial(mat);
  target.tintR[targetIndex]=source.tintR[sourceIndex]||0;
  target.tintG[targetIndex]=source.tintG[sourceIndex]||0;
  target.tintB[targetIndex]=source.tintB[sourceIndex]||0;
  target.tintA[targetIndex]=source.tintA[sourceIndex]||0;
  target.bgTintR[targetIndex]=source.bgTintR[sourceIndex]||0;
  target.bgTintG[targetIndex]=source.bgTintG[sourceIndex]||0;
  target.bgTintB[targetIndex]=source.bgTintB[sourceIndex]||0;
  target.bgTintA[targetIndex]=source.bgTintA[sourceIndex]||0;
  target.sourceMat[targetIndex]=isFlowMaterial(src)?src:EMPTY;
}

function restoreResizeCell(targetIndex,sourceIndex,source){
  restoreResizeCellToArrays({material,mass,vx,vy,flowDir,tintR,tintG,tintB,tintA,bgTintR,bgTintG,bgTintB,bgTintA,sourceMat},targetIndex,sourceIndex,source);
}

function resizeWorldGridHasWorldArg(value){
  return !!(value&&typeof value==='object'&&value.arrays&&Number.isFinite(value.cols));
}

function normalizeResizeWorldArgs(worldOrCols,colsOrRows,rowsOrOptions,maybeOptions){
  if(resizeWorldGridHasWorldArg(worldOrCols)){
    return{world:worldOrCols,nextCols:colsOrRows,nextRows:rowsOrOptions,options:maybeOptions||{}};
  }
  return{world:null,nextCols:worldOrCols,nextRows:colsOrRows,options:rowsOrOptions||{}};
}

function applyResizedWorldState(target,sourceWorld){
  target.cols=sourceWorld.cols;
  target.rows=sourceWorld.rows;
  target.count=sourceWorld.count;
  target.cellSize=sourceWorld.cellSize;
  target.viewW=sourceWorld.viewW;
  target.viewH=sourceWorld.viewH;
  target.arrays=sourceWorld.arrays;
  target.tokens=sourceWorld.tokens;
  target.bodies=sourceWorld.bodies;
  target.nextBodyId=sourceWorld.nextBodyId;
  target.airColor=sourceWorld.airColor;
  target.simTick=sourceWorld.simTick;
  target.editDirty=sourceWorld.editDirty;
  target.runtimeSettings=sourceWorld.runtimeSettings;
  target.customMaterials=sourceWorld.customMaterials;
  return target;
}

function resizeExplicitWorldGrid(world,nextCols,nextRows,options={}){
  const run=()=>{
    const normalizedCols=normalizeWorldDimension(nextCols,world.cols);
    const normalizedRows=normalizeWorldDimension(nextRows,world.rows);
    const normalizedCell=normalizeWorldDimension(options.cellSize,world.cellSize);
    if(normalizedCols===world.cols&&normalizedRows===world.rows&&normalizedCell===world.cellSize){
      if(Object.prototype.hasOwnProperty.call(options,'viewW')||Object.prototype.hasOwnProperty.call(options,'viewH')){
        world.viewW=normalizeViewSize(
          Object.prototype.hasOwnProperty.call(options,'viewW')?options.viewW:world.viewW,
          world.cols*world.cellSize
        );
        world.viewH=normalizeViewSize(
          Object.prototype.hasOwnProperty.call(options,'viewH')?options.viewH:world.viewH,
          world.rows*world.cellSize
        );
        if(worldStateIsActive(world))setViewSizeState(world.viewW,world.viewH);
      }
      return{changed:false,world};
    }
    const source=world.arrays&&world.arrays.material&&world.arrays.material.length?captureResizeSourceFromWorld(world):null;
    const viewState={
      viewW:normalizeViewSize(options.viewW,world.viewW),
      viewH:normalizeViewSize(options.viewH,world.viewH)
    };
    const resized=createWorldState(normalizedCols,normalizedRows,{
      cellSize:normalizedCell,
      viewW:viewState.viewW,
      viewH:viewState.viewH,
      bodies:Array.isArray(world.bodies)?world.bodies:[],
      nextBodyId:world.nextBodyId,
      airColor:world.airColor,
      simTick:world.simTick,
      editDirty:world.editDirty,
      runtimeSettings:world.runtimeSettings,
      customMaterials:world.customMaterials
    });
    if(source){
      for(let r=0;r<resized.rows;r++)for(let c=0;c<resized.cols;c++){
        restoreResizeCellToArrays(resized.arrays,r*resized.cols+c,sampleResizeSourceIndex(c,r,source,resized.cellSize),source);
      }
    }
    applyResizedWorldState(world,resized);
    if(worldStateIsActive(world))installWorldState(world);
    return{changed:true,world,oldCols:source&&source.cols,oldRows:source&&source.rows};
  };
  if(typeof withMaterialRegistryForWorld==='function')return withMaterialRegistryForWorld(world,run);
  return run();
}

function resizeWorldGrid(worldOrCols,colsOrRows,rowsOrOptions,maybeOptions){
  const args=normalizeResizeWorldArgs(worldOrCols,colsOrRows,rowsOrOptions,maybeOptions);
  if(args.world)return resizeExplicitWorldGrid(args.world,args.nextCols,args.nextRows,args.options);
  const nextCols=args.nextCols,nextRows=args.nextRows,options=args.options;
  const normalizedCols=normalizeWorldDimension(nextCols,cols);
  const normalizedRows=normalizeWorldDimension(nextRows,rows);
  const normalizedCell=normalizeWorldDimension(options.cellSize,cellSize);
  if(normalizedCols===cols&&normalizedRows===rows&&normalizedCell===cellSize){
    if(Object.prototype.hasOwnProperty.call(options,'viewW')||Object.prototype.hasOwnProperty.call(options,'viewH')){
      const currentView=captureViewSizeState();
      setViewSizeState(
        Object.prototype.hasOwnProperty.call(options,'viewW')?options.viewW:currentView.viewW,
        Object.prototype.hasOwnProperty.call(options,'viewH')?options.viewH:currentView.viewH
      );
    }
    return{changed:false,world:currentWorldState()};
  }
  const source=material&&material.length?captureResizeSource():null;
  const bodyState=captureBodyRuntimeState();
  const nextAirColor=currentAirColorState();
  const flags=captureRuntimeFlagsState();
  const nextRuntimeSettings=currentRuntimeSettingsState();
  const nextCustomMaterials=currentCustomMaterialState();
  const capturedViewState=captureViewSizeState();
  const viewState={
    viewW:normalizeViewSize(options.viewW,capturedViewState.viewW),
    viewH:normalizeViewSize(options.viewH,capturedViewState.viewH)
  };
  installWorldState(createWorldState(normalizedCols,normalizedRows,{cellSize:normalizedCell,viewW:viewState.viewW,viewH:viewState.viewH,bodies:bodyState.bodies,nextBodyId:bodyState.nextBodyId,airColor:nextAirColor,simTick:flags.simTick,editDirty:flags.editDirty,runtimeSettings:nextRuntimeSettings,customMaterials:nextCustomMaterials}));
  if(source){
    for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){
      restoreResizeCell(r*cols+c,sampleResizeSourceIndex(c,r,source),source);
    }
  }
  return{changed:true,world:currentWorldState(),oldCols:source&&source.cols,oldRows:source&&source.rows};
}
