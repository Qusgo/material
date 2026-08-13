'use strict';

const fs=require('fs');
const path=require('path');
const {PORTABLE_CORE_FILES,BROWSER_RUNTIME_FILES}=require('./portable-core-files');

const ROOT=path.resolve(__dirname,'..');
const RUNTIME_FILES=BROWSER_RUNTIME_FILES;
const CORE_CANDIDATE_FILES=PORTABLE_CORE_FILES;

function read(file){
  return fs.readFileSync(path.join(ROOT,file),'utf8');
}

function assert(condition,message){
  if(!condition)throw new Error(message);
}

function extractFunction(source,name){
  const start=source.indexOf(`function ${name}`);
  if(start<0)throw new Error(`Missing function ${name}`);
  const brace=source.indexOf('{',start);
  let depth=0;
  for(let i=brace;i<source.length;i++){
    if(source[i]==='{')depth++;
    else if(source[i]==='}'){
      depth--;
      if(depth===0)return source.slice(start,i+1);
    }
  }
  throw new Error(`Unterminated function ${name}`);
}

function runIsolated(name,source){
  new Function(source)();
  console.log(`${name} ok`);
}

function syntaxRegression(){
  for(const file of RUNTIME_FILES)new Function(read(file));
  new Function(RUNTIME_FILES.map(read).join('\n'));
  console.log('syntax ok');
}

function stripCommentsAndStrings(source){
  let out='',i=0,mode='code',quote='';
  while(i<source.length){
    const ch=source[i],next=source[i+1];
    if(mode==='code'){
      if(ch==='/'&&next==='/'){mode='line';out+='  ';i+=2;continue}
      if(ch==='/'&&next==='*'){mode='block';out+='  ';i+=2;continue}
      if(ch==='"'||ch==="'"||ch==='`'){mode='string';quote=ch;out+=' ';i++;continue}
      out+=ch;i++;continue;
    }
    if(mode==='line'){
      if(ch==='\n'){mode='code';out+='\n'}else out+=' ';
      i++;continue;
    }
    if(mode==='block'){
      if(ch==='*'&&next==='/'){mode='code';out+='  ';i+=2;continue}
      out+=ch==='\n'?'\n':' ';i++;continue;
    }
    if(mode==='string'){
      if(ch==='\\'){out+='  ';i+=2;continue}
      if(ch===quote){mode='code';quote='';out+=' ';i++;continue}
      out+=ch==='\n'?'\n':' ';i++;continue;
    }
  }
  return out;
}

function portabilityBoundaryRegression(){
  const browserApiPattern=/\b(document|window|canvas|ctx|localStorage|addEventListener|getElementById|querySelector|requestAnimationFrame|ImageData)\b/g;
  const adapterStatePattern=/\b(appContext|setStatus|renderApp|syncButtons|clearTransientEditUiState|updateBrowserFillPreview|selectedSourceMaterial|currentTool|setCurrentTool|currentSelectedKey|setCurrentSelectedKey|resetRuntimeClock|isBodyMaterial)\b/g;
  const violations=[];
  for(const file of CORE_CANDIDATE_FILES){
    const source=stripCommentsAndStrings(read(file));
    const lines=source.split(/\r?\n/);
    for(let row=0;row<lines.length;row++){
      browserApiPattern.lastIndex=0;
      adapterStatePattern.lastIndex=0;
      let match;
      while((match=browserApiPattern.exec(lines[row]))){
        violations.push(`${file}:${row+1}: ${match[1]}`);
      }
      while((match=adapterStatePattern.exec(lines[row]))){
        violations.push(`${file}:${row+1}: ${match[1]}`);
      }
    }
  }
  assert(!violations.length,`core boundary references browser APIs:\n${violations.join('\n')}`);
  const saveCodec=stripCommentsAndStrings(read('src/04-save-codec.js'));
  assert(!/\b(currentSelectedKey|setCurrentSelectedKey|selected)\b/.test(saveCodec),'save codec should not read or write UI selection state');
  console.log('portability boundary regression ok');
}

function portableGuideFileListRegression(){
  const guide=read('docs/PORTABLE_ADAPTER_GUIDE.md');
  const start=guide.indexOf('## Core Files To Reuse');
  const end=guide.indexOf('## Engine API');
  assert(start>=0&&end>start,'portable adapter guide core file section moved');
  const section=guide.slice(start,end);
  const matches=[...section.matchAll(/^\d+\.\s+`([^`]+)`/gm)].map(match=>match[1]);
  assert(matches.length===PORTABLE_CORE_FILES.length,`portable guide core file count ${matches.length} does not match shared list ${PORTABLE_CORE_FILES.length}`);
  const mismatches=[];
  for(let i=0;i<PORTABLE_CORE_FILES.length;i++){
    if(matches[i]!==PORTABLE_CORE_FILES[i])mismatches.push(`${i+1}: guide=${matches[i]||'<missing>'} shared=${PORTABLE_CORE_FILES[i]}`);
  }
  assert(!mismatches.length,`portable guide core file list drifted:\n${mismatches.join('\n')}`);
  console.log('portable guide file list regression ok');
}

function extractHtmlScripts(file){
  return[...read(file).matchAll(/<script\s+[^>]*src="([^"]+)"[^>]*><\/script>/g)].map(match=>match[1]);
}

function htmlScriptOrderRegression(){
  for(const file of ['index.html','material_sim.html']){
    const scripts=extractHtmlScripts(file);
    assert(scripts.length===RUNTIME_FILES.length,`${file} script count ${scripts.length} does not match browser runtime list ${RUNTIME_FILES.length}`);
    const mismatches=[];
    for(let i=0;i<RUNTIME_FILES.length;i++){
      if(scripts[i]!==RUNTIME_FILES[i])mismatches.push(`${i+1}: html=${scripts[i]||'<missing>'} shared=${RUNTIME_FILES[i]}`);
    }
    assert(!mismatches.length,`${file} script order drifted from shared browser runtime list:\n${mismatches.join('\n')}`);
  }
  console.log('HTML script order regression ok');
}

function htmlEntryEquivalenceRegression(){
  assert(read('index.html')===read('material_sim.html'),'material_sim.html should stay equivalent to index.html while it is kept as the legacy entry point');
  console.log('HTML entry equivalence regression ok');
}

function sharedPrelude(){
  return `
function clamp(v,a,b){return Math.max(a,Math.min(b,v))}
function randDir(){return 1}
`;
}

function runtimeBootstrapRegression(){
  const source=read('src/00-materials.js')+read('src/00-world-arrays.js')+read('src/00-world-state.js')+`
const fakeContext={
  setTransform(){},
  createImageData(w,h){return{width:w,height:h,data:new Uint8ClampedArray(w*h*4)}}
};
const fakeCanvas={
  width:0,
  height:0,
  getContext(){return fakeContext},
  getBoundingClientRect(){return{width:320,height:240}}
};
const fakeElement={textContent:'',classList:{toggle(){}},dataset:{}};
const document={
  getElementById(id){return id==='canvas'?fakeCanvas:fakeElement},
  createElement(){return fakeCanvas},
  querySelectorAll(){return[]}
};
const window={devicePixelRatio:1};
`+read('src/00-core-state.js')+read('src/03-app-dom-refs.js')+`
if(cols!==1||rows!==1||count!==1)throw new Error('core-state bootstrap dimensions changed');
if(!currentWorldState()||currentWorldState().arrays.material!==material)throw new Error('core-state did not install active world');
sourceInterval=9;
lightingEnabled=false;
lightStrength=.4;
sideLightStrength=.6;
shadowStrength=.2;
let settings=currentRuntimeSettingsState();
if(settings.sourceInterval!==9||settings.lightingEnabled!==false||settings.lightStrength!==.4||settings.sideLightStrength!==.6||settings.shadowStrength!==.2)throw new Error('runtime settings should capture legacy global writes');
settings=applyRuntimeSettingsState({sourceInterval:99,lightingEnabled:true,lightStrength:2,sideLightStrength:3,shadowStrength:-1});
if(sourceInterval!==60||lightingEnabled!==true||lightStrength!==1||sideLightStrength!==2||shadowStrength!==0)throw new Error('runtime settings should clamp and sync legacy globals');
if(settings.sourceInterval!==60||settings.lightStrength!==1||settings.sideLightStrength!==2||settings.shadowStrength!==0)throw new Error('runtime settings should return clamped values');
`;
  runIsolated('runtime bootstrap regression',source);
}

function appContextRegression(){
const source=`
const calls=[],initialWorld={id:'initial'},nextWorld={id:'next'};
let clockReset=0;
const EMPTY=0,WATER=1,SAND=2,FIXED_STONE=4;
const MATERIAL_FROM_NAME={water:WATER,sand:SAND};
let material=new Uint8Array(0),sourceMat=new Uint8Array(0),mass=new Float32Array(0),count=0;
function materialKeyFromId(id){return id===SAND?'sand':'water'}
function materialDef(id){return{id,key:materialKeyFromId(id),name:id===SAND?'Sand':id===FIXED_STONE?'Stone':'Water',color:id===SAND?[194,148,74]:id===FIXED_STONE?[56,56,56]:[32,136,224]}}
function listSelectableMaterials(){return[materialDef(WATER),materialDef(SAND),materialDef(FIXED_STONE)]}
function countMaterialUses(world,id){calls.push('uses:'+world.id+'/'+id);return id===WATER?3:0}
const FLOW_RULES={};
function isKnownMaterial(mat){return mat===WATER||mat===SAND||mat===FIXED_STONE}
function isFlowMaterial(mat){return mat===WATER||mat===SAND}
function isSolidMaterial(mat){return mat===FIXED_STONE}
function materialCarriesMass(mat){return mat===WATER}
function currentWorldState(){calls.push('current');return initialWorld}
function resetRuntimeClock(){clockReset++}
function createSimulationEngine(options){
  if(options.world!==initialWorld)throw new Error('appContext should seed engine from current world');
  return{
    world:nextWorld,
    currentWorld(){calls.push('engine-current');return nextWorld},
    edit(command){calls.push('edit:'+command.type);return true},
    finishEdit(){calls.push('finish');return nextWorld},
    step(iterations){calls.push('step:'+iterations);return nextWorld},
    resize(cols,rows,options){calls.push('resize:'+cols+'x'+rows+'/'+options.cellSize);return{changed:true,world:nextWorld}},
    serialize(){calls.push('serialize');return{version:1}},
    restore(snapshot){calls.push('restore:'+snapshot.version);return{ok:true}},
    materialCommand(command){calls.push('material:'+command.type);return{ok:true}},
    runtimeSettingsCommand(command){calls.push('runtime:'+command.type);return{ok:true}},
    runtimeSettings(){calls.push('runtime-current');return{sourceInterval:1,lightingEnabled:true,lightStrength:.18,sideLightStrength:1,shadowStrength:.16}},
    renderBuffer(data){calls.push('engine-buffer:'+data.length);return data}
  };
}
function render(world,context){calls.push('render:'+world.id+'/'+context.label)}
function rebuildBodyMask(world){calls.push('mask:'+world.id)}
function makeBodyFromPlacement(placing){calls.push('make-body:'+placing.kind);return{type:'rect',id:'preview-body'}}
function canPlaceBody(world,body){calls.push('can-place:'+world.id+'/'+body.id);return world.id!=='blocked'}
function useWorldState(world){calls.push('use-world:'+world.id);return world}
function buildWaterBasins(world){calls.push('basins:'+world.id);return[{id:1,cells:[0],intervals:[],minC:0,maxC:0,topRow:0,bottomRow:0}]}
function testAssert(condition,message){if(!condition)throw new Error(message)}
`+read('src/03-app-context.js')+`
appContext.label='main';
const altContext={
  label:'alt',
  engine:{
    world:{id:'alt-world'},
    currentWorld(){calls.push('alt-current');return{id:'alt-world'}},
    edit(command){calls.push('alt-edit:'+command.type);return true},
    finishEdit(){calls.push('alt-finish');return{id:'alt-finished'}},
    step(iterations){calls.push('alt-step:'+iterations);return{id:'alt-step-world'}},
    resize(cols,rows,options){calls.push('alt-resize:'+cols+'x'+rows+'/'+options.cellSize);return{changed:false,world:{id:'alt-resized'}}},
    serialize(){calls.push('alt-serialize');return{version:3}},
    restore(snapshot){calls.push('alt-restore:'+snapshot.version);return{ok:true}},
    materialCommand(command){calls.push('alt-material:'+command.type);return{ok:true}},
    runtimeSettingsCommand(command){calls.push('alt-runtime:'+command.type);return{ok:true}},
    runtimeSettings(){calls.push('alt-runtime-current');return{sourceInterval:9}},
    renderBuffer(data){calls.push('alt-buffer:'+data.length);return data}
  }
};
function buildRenderBuffer(world,data){calls.push('fallback-buffer:'+world.id+'/'+data.length);return data}
testAssert(appContext.engine,'appContext should own the browser engine');
testAssert(currentTool()==='brush'&&currentSelectedKey()==='water','app context should own default selection helpers');
testAssert(isBodyMaterial('stoneRect')&&!isBodyMaterial('sand'),'app context should own body-material selection helper');
setCurrentTool('fill');
setCurrentSelectedKey('sand');
testAssert(currentTool()==='fill'&&currentSelectedKey()==='sand','app context selection helpers should update browser selection mirrors');
appContext.tool=currentTool();
appContext.selected=currentSelectedKey();
testAssert(appTool(appContext)==='fill'&&appSelectedKey(appContext)==='sand'&&appSelectedMaterialId(appContext)===SAND&&!appSelectionIsBodyMaterial(appContext),'app context should expose explicit tool and material selection helpers');
testAssert(appWorld()===nextWorld,'appWorld should delegate to engine.currentWorld');
testAssert(applyAppEditCommand({type:'paint'}),'applyAppEditCommand should delegate to engine.edit');
testAssert(finishAppEdit()===nextWorld,'finishAppEdit should delegate to engine.finishEdit');
testAssert(clockReset===1,'finishAppEdit should reset browser runtime clock when available');
testAssert(stepAppWorld(2)===nextWorld,'stepAppWorld should delegate to engine.step');
const resized=resizeAppWorld(4,5,{cellSize:6});
testAssert(resized.changed&&resized.world===nextWorld,'resizeAppWorld should delegate to engine.resize');
const appSnapshot=serializeAppSnapshot();
testAssert(appSnapshot.version===1&&appSnapshot.selected==='sand','serializeAppSnapshot should delegate to engine.serialize and add browser selection');
testAssert(restoreAppSnapshot({version:2,selected:'sand'}).ok,'restoreAppSnapshot should delegate to engine.restore');
testAssert(appContext.selected==='sand'&&appContext.tool==='fill','restoreAppSnapshot should sync browser selection state from core helpers');
testAssert(applyAppMaterialCommand({type:'add'}).ok,'applyAppMaterialCommand should delegate to engine.materialCommand');
testAssert(applyAppRuntimeSettingsCommand({type:'sourceInterval'}).ok,'applyAppRuntimeSettingsCommand should delegate to engine.runtimeSettingsCommand');
testAssert(currentAppRuntimeSettings().sourceInterval===1,'currentAppRuntimeSettings should delegate to engine.runtimeSettings');
const buffer=new Uint8ClampedArray(4);
testAssert(appRenderBuffer(nextWorld,buffer)===buffer,'appRenderBuffer should delegate to engine.renderBuffer for the app world');
testAssert(appRenderBuffer({id:'external'},buffer)===buffer&&calls.includes('fallback-buffer:external/4'),'appRenderBuffer should fallback for non-engine worlds');
appContext.debugBasins=true;
testAssert(appDebugBasins(nextWorld,appContext).length===1&&calls.includes('basins:next'),'appDebugBasins should build debug basin data for the supplied world');
appContext.debugBasins=false;
testAssert(rebuildAppBodyMask()===nextWorld,'rebuildAppBodyMask should rebuild mask for app world');
appContext.placing={kind:'stoneRect'};
const preview=placementPreviewBody(nextWorld,appContext);
testAssert(preview&&preview.body.id==='preview-body'&&preview.canPlace===true&&preview.world===nextWorld,'placementPreviewBody should build preview body against explicit world');
const statsWorld={id:'stats',count:4,arrays:{material:new Uint8Array([WATER,FIXED_STONE,SAND,EMPTY]),sourceMat:new Uint8Array([EMPTY,WATER,EMPTY,SAND]),mass:new Float32Array([.75,0,0,0])}};
const statsContext={engine:{currentWorld(){calls.push('stats-current');return statsWorld}}};
const stats=appVisibleMaterialCounts(statsContext);
testAssert(stats.flow===2&&stats.stone===1&&stats.sources===2&&stats.waterMass>.74&&stats.waterMass<.76&&stats.byId[WATER]===1,'appVisibleMaterialCounts should count supplied app world arrays');
const selectable=appSelectableMaterialItems();
testAssert(appMaterialKeyExists('water')&&!appMaterialKeyExists('missing')&&appMaterialIdFromKey('missing')===WATER,'app material key helpers should validate browser selection through app context');
testAssert(appMaterialDefinition(SAND).name==='Sand'&&appMaterialUseCount(WATER)===3&&selectable[0].uses===3,'app material query helpers should read definitions and use counts through the app world');
renderApp();
testAssert(appWorld(altContext).id==='alt-world','appWorld should accept explicit context');
testAssert(applyAppEditCommand({type:'paint'},altContext),'applyAppEditCommand should accept explicit context');
testAssert(finishAppEdit(altContext).id==='alt-finished','finishAppEdit should accept explicit context');
testAssert(clockReset===2,'explicit finishAppEdit should reset browser runtime clock when available');
testAssert(stepAppWorld(4,altContext).id==='alt-step-world','stepAppWorld should accept explicit context');
testAssert(!resizeAppWorld(6,7,{cellSize:8},altContext).changed,'resizeAppWorld should accept explicit context');
altContext.selected='sand';
const altSnapshot=serializeAppSnapshot(altContext);
testAssert(altSnapshot.version===3&&altSnapshot.selected==='sand','serializeAppSnapshot should accept explicit context');
testAssert(restoreAppSnapshot({version:4,selected:'sand'},altContext).ok,'restoreAppSnapshot should accept explicit context');
testAssert(altContext.selected==='sand'&&altContext.tool==='fill','explicit restoreAppSnapshot should sync explicit context selection state');
testAssert(applyAppMaterialCommand({type:'delete'},altContext).ok,'applyAppMaterialCommand should accept explicit context');
testAssert(applyAppRuntimeSettingsCommand({type:'lighting'},altContext).ok,'applyAppRuntimeSettingsCommand should accept explicit context');
testAssert(currentAppRuntimeSettings(altContext).sourceInterval===9,'currentAppRuntimeSettings should accept explicit context');
testAssert(appRenderBuffer(altContext.engine.world,new Uint8ClampedArray(8),altContext).length===8,'appRenderBuffer should accept explicit context');
testAssert(rebuildAppBodyMask(altContext).id==='alt-world','rebuildAppBodyMask should accept explicit context');
altContext.placing={kind:'stoneRect'};
const altPreview=placementPreviewBody({id:'blocked'},altContext);
testAssert(altPreview&&altPreview.canPlace===false&&altPreview.world.id==='blocked','placementPreviewBody should accept explicit context and world');
renderApp(altContext);
testAssert(calls.includes('edit:paint')&&calls.includes('finish')&&calls.includes('step:2')&&calls.includes('resize:4x5/6')&&calls.includes('serialize')&&calls.includes('restore:2')&&calls.includes('material:add')&&calls.includes('runtime:sourceInterval')&&calls.includes('runtime-current')&&calls.includes('mask:next')&&calls.includes('can-place:next/preview-body')&&calls.includes('render:next/main'),'appContext helpers changed');
testAssert(calls.includes('alt-edit:paint')&&calls.includes('alt-finish')&&calls.includes('alt-step:4')&&calls.includes('alt-resize:6x7/8')&&calls.includes('alt-serialize')&&calls.includes('alt-restore:4')&&calls.includes('alt-material:delete')&&calls.includes('alt-runtime:lighting')&&calls.includes('alt-runtime-current')&&calls.includes('mask:alt-world')&&calls.includes('can-place:blocked/preview-body')&&calls.includes('render:alt-world/alt'),'explicit app context helpers changed');
`;
  runIsolated('app context regression',source);
}

function headlessCoreSmokeRegression(){
  const source=PORTABLE_CORE_FILES.map(read).join('\n')+`
function testAssert(condition,message){if(!condition)throw new Error(message)}
function setStatus(){}
const world=createWorldState(24,18,{cellSize:4});
installWorldState(world);
testAssert(typeof document==='undefined'&&typeof canvas==='undefined','headless core smoke should not define DOM globals');
testAssert(currentWorldState()===world&&cols===24&&rows===18,'headless world was not installed');
applyEditCommand(world,{type:'paintLine',x1:8,y1:60,x2:80,y2:60,radius:1,material:FIXED_STONE});
applyEditCommand(world,{type:'paint',x:24,y:32,radius:2,material:WATER});
applyEditCommand(world,{type:'source',x:12,y:8,radius:0,material:WATER});
testAssert(material.some(v=>v===FIXED_STONE)&&material.some(v=>v===WATER),'headless edit commands did not write material');
stepWorld(world);
stepWorld(world);
testAssert(simTick===2&&currentWorldState()===world,'headless stepWorld did not tick supplied world');
const data=new Uint8Array(count*4);
buildRenderBuffer(world,data);
testAssert(data.length===count*4&&data.some(v=>v!==0),'headless render buffer was not populated');
const snapshot=serializeWorldSnapshot();
testAssert(snapshot.version===WORLD_SNAPSHOT_VERSION&&snapshot.cols===24&&snapshot.rows===18,'headless snapshot metadata changed');
clearSimulationState();
testAssert(!material.some(v=>v!==EMPTY),'headless clear command did not empty grid');
const restored=restoreWorldSnapshot(snapshot);
testAssert(restored.ok&&material.some(v=>v===FIXED_STONE)&&sourceMat.some(v=>v===WATER),'headless snapshot restore lost material or source cells');
const savedActiveWorld=currentWorldState();
const alternateWorld=createWorldState(10,9,{cellSize:4});
installWorldState(alternateWorld);
applyEditCommand(alternateWorld,{type:'paint',x:10,y:10,radius:0,material:WATER});
installWorldState(savedActiveWorld);
const explicitSnapshot=serializeWorldSnapshot(alternateWorld);
testAssert(explicitSnapshot.cols===10&&explicitSnapshot.rows===9&&currentWorldState()===savedActiveWorld,'explicit-world serialize should read supplied world without installing it');
alternateWorld.arrays.material.fill(EMPTY);
const explicitRestore=restoreWorldSnapshot(alternateWorld,explicitSnapshot);
testAssert(explicitRestore.ok&&currentWorldState()===savedActiveWorld&&alternateWorld.arrays.material.some(v=>v===WATER),'explicit-world restore should mutate supplied world without installing it');
installWorldState(savedActiveWorld);
testAssert(applyEditCommand(alternateWorld,{type:'paint',x:8,y:8,radius:0,material:SAND})&&currentWorldState()===savedActiveWorld&&alternateWorld.arrays.material[2*alternateWorld.cols+2]===SAND,'explicit-world paint edit command should route through supplied world without installing it');
const explicitRenderData=new Uint8Array(alternateWorld.count*4);
installWorldState(savedActiveWorld);
buildRenderBuffer(alternateWorld,explicitRenderData);
testAssert(currentWorldState()===savedActiveWorld&&explicitRenderData.some(v=>v!==0),'explicit-world buildRenderBuffer should render supplied world without installing it');
installWorldState(savedActiveWorld);
testAssert(applyEditCommand(alternateWorld,{type:'tint',x:8,y:8,radius:0,color:[3,4,5]})&&currentWorldState()===savedActiveWorld&&alternateWorld.arrays.tintR[2*alternateWorld.cols+2]===3&&alternateWorld.arrays.tintG[2*alternateWorld.cols+2]===4&&alternateWorld.arrays.tintB[2*alternateWorld.cols+2]===5,'explicit-world tint edit command should route through supplied world without installing it');
installWorldState(savedActiveWorld);
testAssert(applyEditCommand(alternateWorld,{type:'erase',x:8,y:8,radius:0})&&currentWorldState()===savedActiveWorld&&alternateWorld.arrays.material[2*alternateWorld.cols+2]===EMPTY,'explicit-world erase edit command should route through supplied world without installing it');
installWorldState(savedActiveWorld);
testAssert(applyEditCommand(alternateWorld,{type:'fillAir',color:[8,9,10]})&&currentWorldState()===savedActiveWorld&&alternateWorld.airColor[0]===8&&alternateWorld.airColor[2]===10,'explicit-world fillAir edit command should route through supplied world without installing it');
alternateWorld.arrays.material[1*alternateWorld.cols+1]=SAND;
alternateWorld.arrays.sourceMat[1*alternateWorld.cols+1]=WATER;
installWorldState(savedActiveWorld);
testAssert(applyEditCommand(alternateWorld,{type:'clear'})&&currentWorldState()===savedActiveWorld&&!alternateWorld.arrays.material.some(v=>v!==EMPTY)&&!alternateWorld.arrays.sourceMat.some(v=>v!==EMPTY),'explicit-world clear edit command should route through supplied world without installing it');
installWorldState(savedActiveWorld);
writeCell(alternateWorld,2,2,WATER,1);
testAssert(currentWorldState()===savedActiveWorld&&alternateWorld.arrays.material[2*alternateWorld.cols+2]===WATER&&alternateWorld.editDirty===true,'explicit-world writeCell should mutate supplied world without installing it');
installWorldState(savedActiveWorld);
clearCell(alternateWorld,2,2,1);
testAssert(currentWorldState()===savedActiveWorld&&alternateWorld.arrays.material[2*alternateWorld.cols+2]===EMPTY,'explicit-world clearCell should mutate supplied world without installing it');
alternateWorld.arrays.material[2*alternateWorld.cols+2]=WATER;
alternateWorld.arrays.vx[2*alternateWorld.cols+2]=3;
alternateWorld.editDirty=true;
installWorldState(savedActiveWorld);
finishEditAsNewInitialState(alternateWorld);
testAssert(currentWorldState()===savedActiveWorld&&alternateWorld.arrays.vx[2*alternateWorld.cols+2]===0&&alternateWorld.editDirty===false,'explicit-world finishEditAsNewInitialState should reset supplied world without installing it');
alternateWorld.arrays.material.fill(EMPTY);
alternateWorld.arrays.tintA.fill(0);
alternateWorld.arrays.bgTintA.fill(0);
alternateWorld.arrays.sourceMat.fill(EMPTY);
alternateWorld.editDirty=false;
installWorldState(savedActiveWorld);
stampAt(alternateWorld,8,8,0,SAND);
testAssert(currentWorldState()===savedActiveWorld&&alternateWorld.arrays.material[2*alternateWorld.cols+2]===SAND,'explicit-world stampAt should mutate supplied world without installing it');
drawMaterialLine(alternateWorld,{x:4,y:8},{x:12,y:8},0,WATER);
testAssert(currentWorldState()===savedActiveWorld&&alternateWorld.arrays.material[2*alternateWorld.cols+3]===WATER,'explicit-world drawMaterialLine should mutate supplied world without installing it');
stampTintAt(alternateWorld,8,8,0,[3,4,5]);
testAssert(currentWorldState()===savedActiveWorld&&alternateWorld.arrays.tintR[2*alternateWorld.cols+2]===3,'explicit-world stampTintAt should tint supplied material without installing it');
drawTintLine(alternateWorld,{x:0,y:0},{x:4,y:0},0,[6,7,8]);
testAssert(currentWorldState()===savedActiveWorld&&alternateWorld.arrays.bgTintA[1]===255&&alternateWorld.arrays.bgTintR[1]===6,'explicit-world drawTintLine should tint supplied empty air without installing it');
eraseAtRadius(alternateWorld,8,8,0);
testAssert(currentWorldState()===savedActiveWorld&&alternateWorld.arrays.material[2*alternateWorld.cols+2]===EMPTY,'explicit-world eraseAtRadius should clear supplied world without installing it when no body mask changes');
setAllAirColor(alternateWorld,[8,9,10]);
testAssert(currentWorldState()===savedActiveWorld&&alternateWorld.airColor[0]===8&&alternateWorld.airColor[2]===10&&alternateWorld.arrays.bgTintA[1]===0,'explicit-world setAllAirColor should mutate supplied world without installing it');
alternateWorld.arrays.material[1]=WATER;
alternateWorld.arrays.sourceMat[2]=SAND;
alternateWorld.bodies=[{id:99,x:1,y:1,radius:1}];
clearSimulationState(alternateWorld);
testAssert(currentWorldState()===savedActiveWorld&&!alternateWorld.arrays.material.some(v=>v!==EMPTY)&&!alternateWorld.arrays.sourceMat.some(v=>v!==EMPTY)&&alternateWorld.bodies.length===0,'explicit-world clearSimulationState should reset supplied world without installing it');
sourceMat.fill(EMPTY);
installWorldState(savedActiveWorld);
stampSourceAt(alternateWorld,8,8,0,WATER);
testAssert(currentWorldState()===savedActiveWorld&&alternateWorld.arrays.sourceMat[2*alternateWorld.cols+2]===WATER,'explicit-world stampSourceAt should mutate supplied world without installing it');
alternateWorld.arrays.sourceMat.fill(EMPTY);
drawSourceLine(alternateWorld,{x:4,y:8},{x:12,y:8},0,WATER);
testAssert(currentWorldState()===savedActiveWorld&&alternateWorld.arrays.sourceMat[2*alternateWorld.cols+3]===WATER,'explicit-world drawSourceLine should mutate supplied world without installing it');
alternateWorld.arrays.sourceMat.fill(EMPTY);
sourceMat.fill(EMPTY);
installWorldState(savedActiveWorld);
testAssert(applyEditCommand(alternateWorld,{type:'source',x:8,y:8,radius:0,material:WATER})&&currentWorldState()===savedActiveWorld&&alternateWorld.arrays.sourceMat[2*alternateWorld.cols+2]===WATER,'explicit-world source edit command should route through supplied world without installing it');
alternateWorld.arrays.sourceMat.fill(EMPTY);
installWorldState(savedActiveWorld);
testAssert(applyEditCommand(alternateWorld,{type:'sourceLine',x1:4,y1:8,x2:12,y2:8,radius:0,material:WATER})&&currentWorldState()===savedActiveWorld&&alternateWorld.arrays.sourceMat[2*alternateWorld.cols+3]===WATER,'explicit-world sourceLine edit command should route through supplied world without installing it');
alternateWorld.arrays.sourceMat[2*alternateWorld.cols+2]=WATER;
alternateWorld.arrays.material[2*alternateWorld.cols+2]=EMPTY;
installWorldState(savedActiveWorld);
applySources(alternateWorld);
testAssert(currentWorldState()===savedActiveWorld&&alternateWorld.arrays.material[2*alternateWorld.cols+2]===WATER,'explicit-world applySources should mutate supplied world without installing it');
installWorldState(savedActiveWorld);
applyForce(alternateWorld,{x:10,y:10,r:5},{x:20,y:0});
testAssert(currentWorldState()===savedActiveWorld&&alternateWorld.arrays.vx[2*alternateWorld.cols+2]>0,'explicit-world applyForce should mutate supplied world without installing it');
alternateWorld.arrays.vx[2*alternateWorld.cols+2]=0;
alternateWorld.bodies=[{id:88,type:'circle',x:10,y:10,vx:0,vy:0,angle:0,av:0,radius:4,hw:4,hh:4,mass:10,invMass:.1,inertia:80,invInertia:1/80}];
applyForce(alternateWorld,{x:10,y:10,r:8},{x:20,y:0});
testAssert(currentWorldState()===savedActiveWorld&&alternateWorld.bodies[0].vx>0,'explicit-world applyForce should mutate supplied-world bodies without installing it');
alternateWorld.bodies=[];
installWorldState(savedActiveWorld);
testAssert(applyEditCommand(alternateWorld,{type:'force',circle:{x:10,y:10,r:5},arrow:{x:20,y:0}})&&currentWorldState()===savedActiveWorld&&alternateWorld.arrays.vx[2*alternateWorld.cols+2]>0,'explicit-world force edit command should route through supplied world without installing it');
installWorldState(savedActiveWorld);
const explicitFill=computeFill(alternateWorld,2,2);
testAssert(currentWorldState()===savedActiveWorld&&explicitFill.cells.length>0&&explicitFill.target===WATER,'explicit-world computeFill should read supplied world without installing it');
installWorldState(savedActiveWorld);
testAssert(fillAtCell(alternateWorld,2,2,SAND)>0&&currentWorldState()===savedActiveWorld&&alternateWorld.arrays.material[2*alternateWorld.cols+2]===SAND,'explicit-world fillAtCell should mutate supplied world without installing it');
installWorldState(savedActiveWorld);
const alternateCenterIndex=2*alternateWorld.cols+2;
testAssert(fillCells(alternateWorld,[alternateCenterIndex],WATER)>0&&currentWorldState()===savedActiveWorld&&alternateWorld.arrays.material[alternateCenterIndex]===WATER,'explicit-world fillCells should mutate supplied world without installing it');
alternateWorld.arrays.material[alternateCenterIndex]=EMPTY;
installWorldState(savedActiveWorld);
testAssert(applyEditCommand(alternateWorld,{type:'fill',x:8,y:8,material:SAND})&&currentWorldState()===savedActiveWorld&&alternateWorld.arrays.material[alternateCenterIndex]===SAND,'explicit-world fill edit command should route through supplied world without installing it');
installWorldState(savedActiveWorld);
const explicitCustom=applyMaterialCommand(alternateWorld,{type:'add',kind:MATERIAL_KIND_FLUID,name:'Direct Fluid',density:6,color:[6,7,8]});
testAssert(explicitCustom.ok&&currentWorldState()===savedActiveWorld&&alternateWorld.customMaterials.some(def=>def.name==='Direct Fluid'),'explicit-world material command should update supplied world materials without installing it');
const explicitUpdated=applyMaterialCommand(alternateWorld,{type:'update',id:explicitCustom.def.id,name:'Direct Fluid 2',density:7,color:[9,8,7]});
testAssert(explicitUpdated.ok&&currentWorldState()===savedActiveWorld&&alternateWorld.customMaterials.some(def=>def.name==='Direct Fluid 2'&&def.density===7),'explicit-world material update should mutate supplied registry without installing it');
const explicitDeleted=applyMaterialCommand(alternateWorld,{type:'delete',id:explicitCustom.def.id});
testAssert(explicitDeleted.ok&&currentWorldState()===savedActiveWorld&&!alternateWorld.customMaterials.some(def=>def.id===explicitCustom.def.id),'explicit-world material delete should mutate supplied registry without installing it');
installWorldState(savedActiveWorld);
testAssert(!isKnownMaterial(explicitCustom.def.id),'installing another world should restore its custom material registry');
installWorldState(savedActiveWorld);
const explicitRuntime=applyRuntimeSettingsCommand(alternateWorld,{type:'sourceInterval',value:14});
testAssert(explicitRuntime.ok&&currentWorldState()===savedActiveWorld&&currentRuntimeSettings(alternateWorld).sourceInterval===14,'explicit-world runtime settings command should update supplied world without installing it');
const activeCustom=applyMaterialCommand(savedActiveWorld,{type:'add',kind:MATERIAL_KIND_FLUID,name:'Active Fluid',density:3,color:[1,2,3]});
testAssert(activeCustom.ok,'active-world custom material setup failed');
installWorldState(savedActiveWorld);
const originalRestoreEditableArrays=restoreEditableArrays;
const failingCustomSnapshot={...explicitSnapshot,customMaterials:[{id:activeCustom.def.id+1,kind:MATERIAL_KIND_FLUID,name:'Broken Fluid',density:4,color:[4,5,6],custom:true}]};
restoreEditableArrays=function(){return false};
const failedExplicitRestore=restoreWorldSnapshot(alternateWorld,failingCustomSnapshot);
restoreEditableArrays=originalRestoreEditableArrays;
testAssert(!failedExplicitRestore.ok&&currentWorldState()===savedActiveWorld&&isKnownMaterial(activeCustom.def.id)&&!isKnownMaterial(activeCustom.def.id+1),'failed explicit-world restore should restore the previous active material registry');
installWorldState(savedActiveWorld);
installWorldState(alternateWorld);
material[0]=WATER;
sourceMat[1]=WATER;
installWorldState(savedActiveWorld);
testAssert(countSourceCells(alternateWorld,WATER)>=1&&currentWorldState()===savedActiveWorld,'explicit-world source use counts should inspect supplied world without installing it');
testAssert(countMaterialUses(alternateWorld,WATER)>=2&&currentWorldState()===savedActiveWorld,'explicit-world material use counts should inspect supplied world without installing it');
const explicitBody={id:40,type:'circle',x:8,y:28,vx:0,vy:0,angle:0,av:0,radius:3,hw:3,hh:3,mass:10,invMass:.1,inertia:45,invInertia:1/45};
installWorldState(savedActiveWorld);
testAssert(canPlaceBody(alternateWorld,explicitBody)&&currentWorldState()===savedActiveWorld,'explicit-world canPlaceBody should inspect the supplied world without installing it');
alternateWorld.arrays.material[7*alternateWorld.cols+2]=FIXED_STONE;
installWorldState(savedActiveWorld);
testAssert(bodyHitsFixed(alternateWorld,explicitBody)&&currentWorldState()===savedActiveWorld,'explicit-world bodyHitsFixed should inspect supplied world without installing it');
alternateWorld.arrays.material[7*alternateWorld.cols+2]=WATER;
installWorldState(savedActiveWorld);
clearGridUnderBody(alternateWorld,explicitBody);
testAssert(currentWorldState()===savedActiveWorld&&alternateWorld.arrays.material[7*alternateWorld.cols+2]===EMPTY,'explicit-world clearGridUnderBody should mutate supplied world without installing it');
installWorldState(savedActiveWorld);
testAssert(addBody(alternateWorld,explicitBody)&&currentWorldState()===savedActiveWorld&&alternateWorld.bodies[0]===explicitBody,'explicit-world addBody should mutate supplied world without installing it');
alternateWorld.arrays.bodyMask.fill(0);
installWorldState(savedActiveWorld);
rebuildBodyMask(alternateWorld);
testAssert(currentWorldState()===savedActiveWorld&&alternateWorld.arrays.bodyMask.some(v=>v===1),'explicit-world rebuildBodyMask should rasterize supplied world without installing it');
alternateWorld.bodies=[];
alternateWorld.nextBodyId=100;
alternateWorld.arrays.bodyMask.fill(0);
installWorldState(savedActiveWorld);
testAssert(applyEditCommand(alternateWorld,{type:'placeBody',kind:'stoneRect',start:{x:8,y:20},current:{x:24,y:28}})&&currentWorldState()===savedActiveWorld&&alternateWorld.bodies.length===1&&alternateWorld.bodies[0].id===100,'explicit-world placeBody command should route through supplied world without installing it');
testAssert(alternateWorld.nextBodyId===101&&alternateWorld.arrays.bodyMask.some(v=>v===1),'explicit-world placeBody command should update supplied body id and body mask');
alternateWorld.bodies=[
  {id:41,type:'circle',x:20,y:12,vx:0,vy:0,angle:0,av:0,radius:5,hw:5,hh:5,mass:10,invMass:.1,inertia:45,invInertia:1/45},
  {id:42,type:'circle',x:22,y:12,vx:0,vy:0,angle:0,av:0,radius:5,hw:5,hh:5,mass:10,invMass:.1,inertia:45,invInertia:1/45}
];
installWorldState(savedActiveWorld);
resolveBodyBodyCollisions(alternateWorld);
testAssert(currentWorldState()===savedActiveWorld&&alternateWorld.bodies[0].x<20&&alternateWorld.bodies[1].x>22,'explicit-world resolveBodyBodyCollisions should separate supplied bodies without installing it');
alternateWorld.bodies=[{id:42,type:'circle',x:20,y:12,vx:0,vy:0,angle:0,av:0,radius:3,hw:3,hh:3,mass:10,invMass:.1,inertia:45,invInertia:1/45}];
alternateWorld.nextBodyId=43;
installWorldState(savedActiveWorld);
updateBodies(alternateWorld);
testAssert(currentWorldState()===savedActiveWorld&&alternateWorld.bodies[0].y>12&&alternateWorld.bodies!==bodies,'explicit-world updateBodies should update supplied world without installing it');
installWorldState(alternateWorld);
clearEditableGridState();
sourceMat[idx(1,1)]=WATER;
installWorldState(savedActiveWorld);
updateGridMaterials(alternateWorld);
testAssert(currentWorldState()===savedActiveWorld&&alternateWorld.arrays.material.some(v=>v===WATER),'explicit-world updateGridMaterials should update supplied world without installing it');
installWorldState(alternateWorld);
material[0]=SAND;
carriedBy[0]=WATER;
carriedTTL[0]=3;
installWorldState(savedActiveWorld);
updateCarryLifetimes(alternateWorld);
testAssert(currentWorldState()===savedActiveWorld&&alternateWorld.arrays.carriedTTL[0]===2,'explicit-world updateCarryLifetimes should mutate supplied world without installing it');
alternateWorld.arrays.material.fill(EMPTY);
alternateWorld.arrays.carriedBy.fill(0);
alternateWorld.arrays.carriedTTL.fill(0);
alternateWorld.arrays.lastMoveTick.fill(0);
alternateWorld.arrays.stableMask.fill(0);
alternateWorld.simTick=5;
alternateWorld.arrays.material[0]=SAND;
alternateWorld.arrays.material[1]=WATER;
alternateWorld.arrays.lastMoveTick[1]=5;
installWorldState(savedActiveWorld);
const originalRandom=Math.random;
Math.random=()=>0;
applyErosionPass(alternateWorld);
Math.random=originalRandom;
testAssert(currentWorldState()===savedActiveWorld&&alternateWorld.arrays.carriedBy[0]===WATER,'explicit-world applyErosionPass should mutate supplied world without installing it');
alternateWorld.arrays.material.fill(EMPTY);
alternateWorld.arrays.carriedBy.fill(0);
alternateWorld.arrays.carriedTTL.fill(0);
alternateWorld.arrays.moveHistory.fill(-1);
alternateWorld.arrays.lastMoveTick.fill(0);
alternateWorld.arrays.stableMask.fill(0);
alternateWorld.arrays.material[0]=SAND;
alternateWorld.arrays.carriedBy[0]=WATER;
alternateWorld.arrays.carriedTTL[0]=3;
alternateWorld.arrays.material[1]=WATER;
alternateWorld.arrays.moveHistory[1]=0;
alternateWorld.arrays.lastMoveTick[1]=5;
installWorldState(savedActiveWorld);
testAssert(tryCarriedMove(0,0,SAND,alternateWorld),'explicit-world tryCarriedMove should move carried particle in supplied world');
testAssert(currentWorldState()===savedActiveWorld&&alternateWorld.arrays.material[1]===SAND&&alternateWorld.arrays.material[0]===WATER,'explicit-world tryCarriedMove should not install or mutate active world');
`;
  runIsolated('headless core smoke regression',source);
}

function simulationEngineRegression(){
  const source=PORTABLE_CORE_FILES.map(read).join('\n')+`
function testAssert(condition,message){if(!condition)throw new Error(message)}
function setStatus(){}
testAssert(typeof document==='undefined'&&typeof canvas==='undefined'&&typeof localStorage==='undefined','simulation engine should be DOM-free');
const engine=createSimulationEngine({cols:12,rows:10,cellSize:3});
testAssert(currentWorldState()===engine.world&&cols===12&&rows===10,'engine did not install its world');
testAssert(engine.world.viewW===36&&engine.world.viewH===30&&viewW===36&&viewH===30,'engine did not initialize view size');
testAssert(engine.edit({type:'paint',x:6,y:6,radius:0,material:WATER}),'engine edit failed');
testAssert(material.some(v=>v===WATER),'engine edit did not write material');
const engineFillPreview=engine.computeFill({x:6,y:6});
testAssert(engineFillPreview.cell.c===2&&engineFillPreview.cell.r===2&&engineFillPreview.target===WATER&&engineFillPreview.cells.length===1,'engine computeFill should expose DOM-free fill preview data');
testAssert(engine.cellAt(6,6).c===2&&engine.cellAt({x:6,y:6}).r===2,'engine cellAt should map platform points to grid cells');
const editedCell=idx(2,2);
vx[editedCell]=5;
restAge[editedCell]=9;
stableMask[editedCell]=1;
engine.finishEdit();
testAssert(currentWorldState()===engine.world&&editDirty===false&&vx[editedCell]===0&&restAge[editedCell]===0&&stableMask[editedCell]===0,'engine finishEdit should reset transient edited flow state');
engine.step(3);
testAssert(simTick===3&&currentWorldState()===engine.world,'engine step did not use its world');
const buffer=engine.renderBuffer();
testAssert(buffer.length===engine.world.count*4&&buffer.some(v=>v!==0),'engine renderBuffer failed');
const snapshot=engine.serialize();
testAssert(snapshot.cols===12&&snapshot.rows===10,'engine serialize returned wrong dimensions');
engine.clear();
testAssert(!material.some(v=>v!==EMPTY),'engine clear failed');
const restored=engine.restore(snapshot);
testAssert(restored.ok&&material.some(v=>v===WATER),'engine restore failed');
const resized=engine.resize(8,6,{cellSize:4});
testAssert(resized.changed&&engine.world.cols===8&&engine.world.rows===6&&cellSize===4,'engine resize failed');
const custom=engine.materialCommand({type:'add',kind:MATERIAL_KIND_FLUID,name:'Engine Oil',density:3,color:[3,4,5]});
testAssert(custom.ok&&materialDef(custom.def.id).name==='Engine Oil','engine material command failed');
engine.runtimeSettingsCommand({type:'sourceInterval',value:9});
testAssert(engine.runtimeSettings().sourceInterval===9,'engine runtime settings command failed');
`;
  runIsolated('simulation engine regression',source);
}

function portableAdapterContractRegression(){
  const source=PORTABLE_CORE_FILES.map(read).join('\n')+`
function testAssert(condition,message){if(!condition)throw new Error(message)}
function setStatus(){}
testAssert(typeof document==='undefined'&&typeof canvas==='undefined'&&typeof localStorage==='undefined','portable adapter contract must run without browser globals');
const surfaceA=createSimulationEngine({cols:8,rows:7,cellSize:4,install:false});
const surfaceB=createSimulationEngine({cols:8,rows:7,cellSize:4,install:false});
testAssert(currentWorldState()!==surfaceA.world&&currentWorldState()!==surfaceB.world,'install:false should not eagerly install adapter worlds');
surfaceA.edit({type:'paint',x:6,y:6,radius:0,material:WATER});
surfaceA.finishEdit();
const aCell=1*surfaceA.world.cols+1;
testAssert(currentWorldState()!==surfaceA.world&&surfaceA.world.arrays.material[aCell]===WATER,'surface A edit/finish should mutate only its world without installing it');
surfaceB.edit({type:'paint',x:6,y:6,radius:0,material:SAND});
surfaceB.finishEdit();
const bCell=1*surfaceB.world.cols+1;
testAssert(currentWorldState()!==surfaceB.world&&surfaceB.world.arrays.material[bCell]===SAND,'surface B edit/finish should mutate only its world without installing it');
testAssert(surfaceA.world.arrays.material[aCell]===WATER&&surfaceB.world.arrays.material[bCell]===SAND,'adapter surfaces should keep separate world arrays');
const previewA=surfaceA.computeFill({x:6,y:6});
testAssert(currentWorldState()!==surfaceA.world&&currentWorldState()!==surfaceB.world&&previewA.target===WATER&&previewA.cell.c===1&&previewA.cell.r===1,'surface A fill preview should use its own world without installing it');
const previewB=surfaceB.computeFill(6,6);
testAssert(currentWorldState()!==surfaceA.world&&currentWorldState()!==surfaceB.world&&previewB.target===SAND&&previewB.cell.c===1&&previewB.cell.r===1,'surface B fill preview should use its own world without installing it');
const customA=surfaceA.materialCommand({type:'add',kind:MATERIAL_KIND_FLUID,name:'A Fluid',density:4,color:[9,8,7]});
testAssert(customA.ok&&surfaceA.world.customMaterials.length===1,'surface A should capture custom material definitions');
surfaceB.currentWorld();
testAssert(surfaceB.world.customMaterials.length===0&&!isKnownMaterial(customA.def.id),'surface B should not inherit surface A custom materials');
surfaceA.currentWorld();
testAssert(isKnownMaterial(customA.def.id)&&materialDef(customA.def.id).name==='A Fluid','surface A should reinstall its custom material registry');
const legacyA=registerCustomGranularMaterial({name:'Legacy A',density:5,color:[5,6,7],maxSlope:2,erosionResistance:24});
testAssert(legacyA&&isKnownMaterial(legacyA.id),'legacy custom material registration should work on the active surface');
surfaceB.currentWorld();
testAssert(surfaceA.world.customMaterials.some(def=>def.id===legacyA.id)&&!isKnownMaterial(legacyA.id),'switching surfaces should capture outgoing legacy material changes');
surfaceA.currentWorld();
surfaceA.edit({type:'paint',x:22,y:6,radius:0,material:customA.def.id});
surfaceA.finishEdit();
testAssert(surfaceA.world.arrays.material[idx(5,1)]===customA.def.id,'surface A should paint its custom material');
surfaceA.edit({type:'source',x:14,y:6,radius:0,material:WATER});
surfaceA.runtimeSettingsCommand({type:'sourceInterval',value:7});
testAssert(surfaceA.runtimeSettings().sourceInterval===7&&surfaceB.runtimeSettings().sourceInterval===1,'adapter surfaces should keep separate runtime settings');
surfaceA.runtimeSettingsCommand({type:'sourceInterval',value:1});
surfaceB.currentWorld();
surfaceA.step(2);
testAssert(currentWorldState()===surfaceB.world&&surfaceA.world.simTick===2&&surfaceA.world.arrays.material.some(v=>v===WATER),'surface A step should use its own source/runtime state without installing it');
const bufferA=new Uint8ClampedArray(surfaceA.world.count*4);
const bufferB=new Uint8ClampedArray(surfaceB.world.count*4);
surfaceA.renderBuffer(bufferA);
surfaceB.renderBuffer(bufferB);
testAssert(currentWorldState()===surfaceB.world&&bufferA.some(v=>v!==0)&&bufferB.some(v=>v!==0),'portable render buffers should be produced through each engine without installing them');
const stored=JSON.stringify(surfaceA.serialize());
surfaceA.clear();
testAssert(!surfaceA.world.arrays.material.some(v=>v!==EMPTY),'portable clear should empty the target world');
const restored=surfaceA.restore(JSON.parse(stored));
testAssert(restored.ok&&currentWorldState()===surfaceB.world&&surfaceA.world.arrays.material.some(v=>v===WATER),'portable restore should reload the target engine from adapter storage data without installing it');
surfaceA.currentWorld();
testAssert(isKnownMaterial(customA.def.id)&&surfaceA.world.arrays.material.some(v=>v===customA.def.id),'portable restore should reload custom material definitions for the target engine when installed');
surfaceB.currentWorld();
testAssert(surfaceB.world.arrays.material[bCell]===SAND&&surfaceB.world.customMaterials.length===0&&!isKnownMaterial(customA.def.id),'restoring one adapter surface should not mutate another surface or material registry');
const resizeA=surfaceA.resize(6,5,{cellSize:3});
testAssert(resizeA.changed&&resizeA.world===surfaceA.world&&surfaceA.world.cols===6&&surfaceA.world.rows===5&&currentWorldState()===surfaceB.world,'surface A resize should resize its world without installing it');
testAssert(surfaceA.world.arrays.material.some(v=>v===WATER)&&surfaceB.world.arrays.material[bCell]===SAND,'resizing one adapter surface should preserve its data and not mutate another surface');
`;
  runIsolated('portable adapter contract regression',source);
}

function browserLoadSmokeRegression(){
  const source=`
const calls=[],events={canvas:{},window:{},element:{}};
function makeContext(){
  return{
    setTransform(){calls.push('setTransform')},
    createImageData(w,h){return{width:w,height:h,data:new Uint8ClampedArray(w*h*4)}},
    putImageData(){calls.push('putImageData')},
    drawImage(){calls.push('drawImage')},
    clearRect(){},
    fillRect(){},
    strokeRect(){},
    save(){},
    restore(){},
    beginPath(){},
    moveTo(){},
    lineTo(){},
    closePath(){},
    arc(){},
    rect(){},
    fill(){},
    stroke(){},
    translate(){},
    rotate(){},
    fillText(){}
  };
}
const fakeCanvas={
  width:0,
  height:0,
  style:{},
  getContext(){return makeContext()},
  getBoundingClientRect(){return{left:0,top:0,width:360,height:240}},
  addEventListener(type,handler){events.canvas[type]=handler},
  setPointerCapture(){},
  hasPointerCapture(){return false},
  releasePointerCapture(){}
};
function makeElement(id){
  return{
    id,
    value:id.includes('source-rate')?'1':id.includes('strength')?'50':id.includes('size')?'4':'',
    checked:false,
    disabled:false,
    title:'',
    textContent:'',
    innerHTML:'',
    dataset:{},
    style:{},
    classList:{toggle(){}},
    appendChild(child){return child},
    addEventListener(type,handler){events.element[id+':'+type]=handler}
  };
}
const elementMap={};
const document={
  getElementById(id){
    if(id==='canvas')return fakeCanvas;
    return elementMap[id]||(elementMap[id]=makeElement(id));
  },
  createElement(tag){return tag==='canvas'?fakeCanvas:makeElement(tag)},
  querySelectorAll(){return[]}
};
const window={
  devicePixelRatio:3,
  addEventListener(type,handler){events.window[type]=handler}
};
function requestAnimationFrame(handler){calls.push('raf');requestAnimationFrame.last=handler}
const localStorage={getItem(){return null},setItem(){}};
function testAssert(condition,message){if(!condition)throw new Error(message)}
`+RUNTIME_FILES.map(read).join('\n')+`
testAssert(cols>1&&rows>1&&count===cols*rows,'browser load did not resize/install grid');
testAssert(appContext.dpr===2,'browser resize should clamp DPR in appContext');
testAssert(!!events.window.resize,'resize handler was not bound');
testAssert(!!requestAnimationFrame.last&&calls.includes('raf'),'animation frame was not scheduled');
testAssert(!!events.canvas.pointerdown&&!!events.canvas.pointermove&&!!events.canvas.pointerup,'canvas pointer handlers were not bound');
testAssert(calls.includes('putImageData')&&calls.includes('drawImage'),'initial render did not draw grid');
testAssert(typeof render==='function'&&typeof simulationStep==='function','public browser runtime functions missing');
`;
  runIsolated('browser load smoke regression',source);
}

function appDomRefsRegression(){
  const source=`
const requested=[];
const fakeContext={};
const fakeCanvas={id:'canvas',getContext(type,options){return{type,options}}};
const document={
  getElementById(id){
    requested.push(id);
    return id==='canvas'?fakeCanvas:{id};
  }
};
function testAssert(condition,message){if(!condition)throw new Error(message)}
`+read('src/03-app-dom-refs.js')+`
testAssert(canvas.id==='canvas'&&ctx.type==='2d'&&ctx.options.alpha===false,'canvas ref changed');
testAssert(statusEl.id==='status'&&playBtn.id==='play','app shell refs changed');
testAssert(debugBasinsBtn.id==='debug-basins'&&brushSizeInput.id==='brush-size','early control refs changed');
testAssert(requested.join(',')==='canvas,status,play,debug-basins,brush-size','app DOM ref order changed');
`;
  runIsolated('app DOM refs regression',source);
}

function lightingRegression(){
  const lighting=read('src/03-lighting.js');
  const source=sharedPrelude()+read('src/00-materials.js')+`
let cols=6,rows=4,count=cols*rows;
let material=new Uint8Array(count),mass=new Float32Array(count),vx=new Float32Array(count),vy=new Float32Array(count),flowDir=new Int8Array(count),lightMask=new Uint8Array(count);
let lightingEnabled=true,sideLightStrength=1;
function idx(c,r){return r*cols+c}
function normalizeMaterialCell(i){return isKnownMaterial(material[i])?material[i]:EMPTY}
function testAssert(condition,message){if(!condition)throw new Error(message)}
function reset(){material.fill(EMPTY);lightMask.fill(0)}
${extractFunction(lighting,'lightingRuntimeSettings')}
${extractFunction(lighting,'installLightingWorld')}
${extractFunction(lighting,'buildLightMask')}

reset();
material[idx(1,0)]=FIXED_STONE;
material[idx(1,1)]=FIXED_STONE;
material[idx(2,0)]=FIXED_STONE;
material[idx(2,1)]=SAND;
material[idx(3,0)]=FIXED_STONE;
material[idx(3,1)]=SAND;
buildLightMask();
testAssert(lightMask[idx(0,1)]&1,'source air should be directly lit');
testAssert((lightMask[idx(1,1)]&2)&&!(lightMask[idx(1,1)]&1),'right-neighbor fixed solid gets one side light');
testAssert(!(lightMask[idx(2,1)]&2),'second shadowed solid must not get recursive side light');

reset();
material[idx(1,0)]=FIXED_STONE;
material[idx(1,1)]=WATER;
material[idx(2,0)]=FIXED_STONE;
buildLightMask();
testAssert(!(lightMask[idx(1,1)]&2),'shadowed fluid does not receive side light');
testAssert(!(lightMask[idx(2,1)]&2),'shadowed air does not receive side light');

reset();
material[idx(0,1)]=WATER;
material[idx(1,0)]=FIXED_STONE;
material[idx(1,1)]=SAND;
buildLightMask();
testAssert((lightMask[idx(1,1)]&2),'direct-lit fluid can cast one-cell side light to solid');
`;
  runIsolated('lighting regression',source);
}

function materialRegistryRegression(){
  const source=sharedPrelude()+read('src/00-materials.js')+`
function testAssert(condition,message){if(!condition)throw new Error(message)}
testAssert(EMPTY===0,'empty material id changed');
testAssert(WATER===1,'water material id changed');
testAssert(SAND===2,'sand material id changed');
testAssert(FIXED_STONE===4,'fixed stone material id changed');
testAssert(isFluidMaterial(WATER),'water should be a fluid');
testAssert(isGranularMaterial(SAND),'sand should be granular');
testAssert(isSolidMaterial(FIXED_STONE),'fixed stone should be fixed solid');
testAssert(materialDensity(WATER)<materialDensity(SAND),'water should stay lighter than sand');
testAssert(materialDensity(SAND)<materialDensity(FIXED_STONE),'sand should stay lighter than fixed stone');
testAssert(materialCarriesMass(WATER),'water should carry mass');
testAssert(!materialCarriesMass(SAND),'sand should not carry water mass');
testAssert(!materialBlocksLight(WATER),'water should default transparent to light');
testAssert(materialBlocksLight(SAND),'sand should block light');
testAssert(materialBlocksLight(FIXED_STONE),'fixed stone should block light');
testAssert(FLOW_RULES[WATER].useBasinSettle===false,'default water should not use legacy basin settle');
testAssert(FLOW_RULES[SAND].slideRequiresSlope===true,'sand slope slide guard changed');
`;
  runIsolated('material registry regression',source);
}

function runtimeConfigRegression(){
  const source=sharedPrelude()+read('src/00-materials.js')+read('src/00-world-arrays.js')+read('src/02-sources.js')+read('src/01-runtime-config.js')+`
let cols=3,rows=3,count=cols*rows,sourceInterval=1,lightingEnabled=true,lightStrength=.18,sideLightStrength=1,shadowStrength=.16;
let material,mass,vx,vy,bodyMask,flowDir,restAge,stableMask,tintR,tintG,tintB,tintA,bgTintR,bgTintG,bgTintB,bgTintA,sourceMat,lightMask;
let moveHistory,moveFlip,horizontalDir,horizontalTurns,escapeDir,escapeTarget,carriedBy,carriedTTL,lastMoveTick;
let waterSeen,waterSpaceMark,waterComponentMark,waterBasinMark,waterSleepBlockMark,waterTargetMark,waterWakeMark,waterQueue,rowCounts;
installGridArrays(createGridArrays(count,rows));
function idx(c,r){return r*cols+c}
function testAssert(condition,message){if(!condition)throw new Error(message)}
const fluid=applyMaterialCommand({type:'add',kind:MATERIAL_KIND_FLUID,name:'Oil',color:[1,2,3],density:5,blocksLight:true,emissive:true});
testAssert(fluid.ok&&fluid.def.custom&&isFluidMaterial(fluid.def.id),'add fluid command failed');
testAssert(fluid.def.color[0]===1&&fluid.def.density===5&&materialBlocksLight(fluid.def.id)&&materialEmissive(fluid.def.id),'add fluid command normalized fields incorrectly');
material[idx(0,0)]=fluid.def.id;
sourceMat[idx(1,0)]=fluid.def.id;
const blockedDelete=applyMaterialCommand({type:'delete',id:fluid.def.id});
testAssert(!blockedDelete.ok&&blockedDelete.reason==='in-use'&&blockedDelete.uses===2,'delete command should reject materials in use');
material[idx(0,0)]=EMPTY;
sourceMat[idx(1,0)]=EMPTY;
const updated=applyMaterialCommand({type:'update',id:fluid.def.id,name:'Heavy Oil',color:[9,8,7],density:7,blocksLight:false,emissive:false});
testAssert(updated.ok&&updated.def.name==='Heavy Oil'&&updated.def.density===7&&!materialBlocksLight(updated.def.id),'update material command failed');
const deleted=applyMaterialCommand({type:'delete',id:updated.def.id});
testAssert(deleted.ok&&!isKnownMaterial(updated.def.id),'delete material command failed');
testAssert(!applyMaterialCommand({type:'add',kind:MATERIAL_KIND_FIXED,name:'Bad'}).ok,'add command should reject unsupported kinds');
applyRuntimeSettingsCommand({type:'sourceInterval',value:99});
testAssert(sourceInterval===60,'source interval command should clamp high values');
applyRuntimeSettingsCommand({type:'lighting',enabled:false,lightStrength:2,sideLightStrength:3,shadowStrength:-1});
testAssert(lightingEnabled===false&&lightStrength===1&&sideLightStrength===2&&shadowStrength===0,'lighting command should clamp settings');
`;
  runIsolated('runtime config regression',source);
}

function worldArrayRegression(){
  const source=sharedPrelude()+read('src/00-materials.js')+read('src/00-world-arrays.js')+`
let material,mass,vx,vy,bodyMask,flowDir,restAge,stableMask,tintR,tintG,tintB,tintA,bgTintR,bgTintG,bgTintB,bgTintA,sourceMat,lightMask;
let moveHistory,moveFlip,horizontalDir,horizontalTurns,escapeDir,escapeTarget,carriedBy,carriedTTL,lastMoveTick;
let waterSeen,waterSpaceMark,waterComponentMark,waterBasinMark,waterSleepBlockMark,waterTargetMark,waterWakeMark,waterQueue,rowCounts;
let waterSpaceToken=9,waterComponentToken=9,waterBasinToken=9,waterTargetToken=9,waterWakeToken=9;
function testAssert(condition,message){if(!condition)throw new Error(message)}
installGridArrays(createGridArrays(6,2));
testAssert(material.length===6&&rowCounts.length===2,'grid array allocation size changed');
testAssert(moveHistory[0]===-1&&escapeTarget[0]===-1,'motion sentinels should initialize to -1');
material[1]=SAND;
mass[1]=3;
vx[1]=4;
sourceMat[2]=WATER;
tintA[1]=255;
bgTintA[3]=255;
bodyMask[4]=1;
lightMask[5]=3;
clearEditableGridState();
testAssert(material[1]===EMPTY&&mass[1]===0&&sourceMat[2]===EMPTY,'editable clear left material/source state');
testAssert(tintA[1]===0&&bgTintA[3]===0,'editable clear left tint state');
testAssert(bodyMask[4]===0&&lightMask[5]===0,'editable clear left mask state');
testAssert(moveHistory[1]===-1&&escapeTarget[1]===-1,'editable clear reset motion sentinels');
testAssert(waterSpaceToken===1&&waterWakeToken===1,'editable clear reset water scratch tokens');
const otherWorld={arrays:createGridArrays(6,2),tokens:{waterSpaceToken:8,waterComponentToken:8,waterBasinToken:8,waterTargetToken:8,waterWakeToken:8}};
otherWorld.arrays.material[1]=SAND;
otherWorld.arrays.sourceMat[2]=WATER;
otherWorld.arrays.tintA[1]=255;
otherWorld.arrays.lightMask[5]=3;
clearEditableGridState(otherWorld);
testAssert(otherWorld.arrays.material[1]===EMPTY&&otherWorld.arrays.sourceMat[2]===EMPTY&&otherWorld.arrays.tintA[1]===0,'explicit-world editable clear should reset supplied arrays');
testAssert(otherWorld.arrays.lightMask[5]===0&&otherWorld.tokens.waterWakeToken===1,'explicit-world editable clear should reset supplied transient state and tokens');
`;
  runIsolated('world array regression',source);
}

function worldStateRegression(){
  const source=sharedPrelude()+read('src/00-materials.js')+read('src/00-world-arrays.js')+read('src/00-world-state.js')+`
let cols=1,rows=1,count=1,cellSize=1,viewW=10,viewH=20,simTick=2,editDirty=true;
let material,mass,vx,vy,bodyMask,flowDir,restAge,stableMask,tintR,tintG,tintB,tintA,bgTintR,bgTintG,bgTintB,bgTintA,sourceMat,lightMask;
let moveHistory,moveFlip,horizontalDir,horizontalTurns,escapeDir,escapeTarget,carriedBy,carriedTTL,lastMoveTick;
let waterSeen,waterSpaceMark,waterComponentMark,waterBasinMark,waterSleepBlockMark,waterTargetMark,waterWakeMark,waterQueue,rowCounts;
let waterSpaceToken=1,waterComponentToken=1,waterBasinToken=1,waterTargetToken=1,waterWakeToken=1;
let bodies=[],nextBodyId=1;
function idx(c,r){return r*cols+c}
function testAssert(condition,message){if(!condition)throw new Error(message)}
const seedBodies=[{id:7,x:1,y:2,radius:3}];
const world=createWorldState(5,4,{cellSize:6,viewW:31,viewH:42,bodies:seedBodies,nextBodyId:8,airColor:[1,2,3],simTick:11,editDirty:false,runtimeSettings:{sourceInterval:5,lightingEnabled:false,lightStrength:.4,sideLightStrength:.6,shadowStrength:.2}});
testAssert(world.cols===5&&world.rows===4&&world.count===20&&world.cellSize===6,'world dimensions changed');
testAssert(world.arrays.material.length===20&&world.arrays.rowCounts.length===4,'world array dimensions changed');
installWorldState(world);
testAssert(cols===5&&rows===4&&count===20&&cellSize===6,'installWorldState did not update dimensions');
testAssert(viewW===31&&viewH===42&&world.viewW===31&&world.viewH===42,'installWorldState did not install view size');
testAssert(material===world.arrays.material&&rowCounts===world.arrays.rowCounts,'installWorldState did not install arrays');
testAssert(bodies===seedBodies&&nextBodyId===8,'installWorldState did not install body state');
testAssert(world.airColor[0]===1&&world.airColor[1]===2&&world.airColor[2]===3,'installWorldState did not install air color');
testAssert(simTick===11&&editDirty===false&&world.simTick===11&&world.editDirty===false,'installWorldState did not install runtime flags');
testAssert(world.runtimeSettings.sourceInterval===5&&world.runtimeSettings.lightingEnabled===false&&world.runtimeSettings.lightStrength===.4,'installWorldState did not install runtime settings');
material[0]=SAND;
waterWakeToken=7;
bodies.push({id:8,x:2,y:3,radius:4});
nextBodyId=9;
setAirColorState([4,5,6]);
setRuntimeFlagsState({simTick:13,editDirty:true});
setRuntimeSettingsState({sourceInterval:12,lightStrength:.7});
setViewSizeState(33,44);
const current=currentWorldState();
testAssert(current===world,'currentWorldState should return active world');
testAssert(current.arrays.material[0]===SAND,'currentWorldState did not capture array references');
testAssert(current.tokens.waterWakeToken===7,'currentWorldState did not capture scratch tokens');
testAssert(current.bodies.length===2&&current.nextBodyId===9,'currentWorldState did not capture body state');
testAssert(current.airColor[0]===4&&current.airColor[1]===5&&current.airColor[2]===6,'currentWorldState did not capture air color');
testAssert(current.simTick===13&&current.editDirty===true,'currentWorldState did not capture runtime flags');
testAssert(current.runtimeSettings.sourceInterval===12&&current.runtimeSettings.lightStrength===.7,'currentWorldState did not capture runtime settings');
testAssert(current.viewW===33&&current.viewH===44,'currentWorldState did not capture view size');
clearEditableGridState();
testAssert(current.tokens.waterWakeToken===1,'clearEditableGridState should reset active world tokens');
const replacement=createWorldState(2,3,{cellSize:4});
installWorldState(replacement);
testAssert(currentWorldState()===replacement&&cols===2&&rows===3&&material.length===6&&bodies===replacement.bodies,'replacement world install failed');
bodies.push({id:9,x:4,y:5,radius:6});
nextBodyId=10;
setAirColorState([12,13,14]);
setRuntimeFlagsState({simTick:21,editDirty:true});
setRuntimeSettingsState({sourceInterval:8,lightingEnabled:false,shadowStrength:.5});
setViewSizeState(48,72);
material[idx(1,1)]=WATER;
mass[idx(1,1)]=.7;
vx[idx(1,1)]=2;
vy[idx(1,1)]=3;
flowDir[idx(1,1)]=1;
sourceMat[idx(0,2)]=SAND;
tintR[idx(1,1)]=9;
tintG[idx(1,1)]=8;
tintB[idx(1,1)]=7;
tintA[idx(1,1)]=255;
bgTintR[idx(0,2)]=6;
bgTintG[idx(0,2)]=5;
bgTintB[idx(0,2)]=4;
bgTintA[idx(0,2)]=255;
const unchanged=resizeWorldGrid(2,3,{cellSize:4,viewW:49,viewH:73});
testAssert(!unchanged.changed&&currentWorldState()===replacement,'resizeWorldGrid should no-op matching dimensions');
testAssert(unchanged.world.viewW===49&&unchanged.world.viewH===73&&viewW===49&&viewH===73,'resizeWorldGrid no-op should still update view size');
setViewSizeState(48,72);
const resized=resizeWorldGrid(4,6,{cellSize:4});
testAssert(resized.changed&&cols===4&&rows===6&&cellSize===4,'resizeWorldGrid did not install resized world');
testAssert(resized.world.bodies===bodies&&bodies.length===1&&resized.world.nextBodyId===10,'resizeWorldGrid should preserve body state');
testAssert(resized.world.airColor[0]===12&&currentAirColorState()[2]===14,'resizeWorldGrid should preserve air color state');
testAssert(resized.world.simTick===21&&resized.world.editDirty===true&&simTick===21&&editDirty===true,'resizeWorldGrid should preserve runtime flags');
testAssert(resized.world.runtimeSettings.sourceInterval===8&&resized.world.runtimeSettings.lightingEnabled===false&&resized.world.runtimeSettings.shadowStrength===.5,'resizeWorldGrid should preserve runtime settings');
testAssert(resized.world.viewW===48&&resized.world.viewH===72&&viewW===48&&viewH===72,'resizeWorldGrid should preserve view size');
testAssert(material[idx(1,1)]===WATER&&mass[idx(1,1)]>.69&&mass[idx(1,1)]<.71&&vx[idx(1,1)]===2&&vy[idx(1,1)]===3,'resizeWorldGrid lost material motion state');
testAssert(flowDir[idx(1,1)]===1&&tintA[idx(1,1)]===255&&tintR[idx(1,1)]===9,'resizeWorldGrid lost flow direction or particle tint');
testAssert(sourceMat[idx(0,2)]===SAND&&bgTintA[idx(0,2)]===255&&bgTintR[idx(0,2)]===6,'resizeWorldGrid lost source or background tint');
const inactiveWorld=createWorldState(3,3,{cellSize:2,viewW:6,viewH:6,airColor:[30,31,32]});
installWorldState(inactiveWorld);
material[idx(1,1)]=WATER;
sourceMat[idx(2,2)]=SAND;
const activeBeforeExplicitResize=resized.world;
installWorldState(activeBeforeExplicitResize);
const explicitResize=resizeWorldGrid(inactiveWorld,5,4,{cellSize:2,viewW:10,viewH:8});
testAssert(explicitResize.changed&&currentWorldState()===activeBeforeExplicitResize&&explicitResize.world===inactiveWorld&&inactiveWorld.cols===5&&inactiveWorld.rows===4,'explicit-world resizeWorldGrid should resize supplied world without installing it');
testAssert(explicitResize.oldCols===3&&explicitResize.oldRows===3&&inactiveWorld.arrays.material.some(v=>v===WATER)&&inactiveWorld.arrays.sourceMat.some(v=>v===SAND),'explicit-world resizeWorldGrid should resample supplied world arrays');
testAssert(explicitResize.world.airColor[0]===30&&explicitResize.world.viewW===10&&explicitResize.world.viewH===8,'explicit-world resizeWorldGrid should preserve supplied world metadata');
`;
  runIsolated('world state regression',source);
}

function stepWorldRegression(){
  const source=sharedPrelude()+read('src/00-materials.js')+read('src/00-world-arrays.js')+read('src/00-world-state.js')+read('src/02-step-world.js')+`
let cols=1,rows=1,count=1,cellSize=1,simTick=4;
let material,mass,vx,vy,bodyMask,flowDir,restAge,stableMask,tintR,tintG,tintB,tintA,bgTintR,bgTintG,bgTintB,bgTintA,sourceMat,lightMask;
let moveHistory,moveFlip,horizontalDir,horizontalTurns,escapeDir,escapeTarget,carriedBy,carriedTTL,lastMoveTick;
let waterSeen,waterSpaceMark,waterComponentMark,waterBasinMark,waterSleepBlockMark,waterTargetMark,waterWakeMark,waterQueue,rowCounts;
let waterSpaceToken=1,waterComponentToken=1,waterBasinToken=1,waterTargetToken=1,waterWakeToken=1;
const calls=[];
function rebuildBodyMask(worldArg){if(worldArg!==world)throw new Error('stepWorld should pass world to rebuildBodyMask');calls.push('mask')}
function updateBodies(worldArg){if(worldArg!==world)throw new Error('stepWorld should pass world to updateBodies');calls.push('bodies')}
function updateGridMaterials(worldArg){if(worldArg!==world)throw new Error('stepWorld should pass world to updateGridMaterials');calls.push('grid')}
function testAssert(condition,message){if(!condition)throw new Error(message)}
const world=createWorldState(2,2,{cellSize:3,simTick:4});
stepWorld(world);
testAssert(simTick===4&&world.simTick===5,'stepWorld should increment the supplied world without touching legacy simTick');
testAssert(calls.join(',')==='mask,bodies,mask,grid,mask','stepWorld update order changed');
testAssert(cols===1&&rows===1&&count===1&&cellSize===1,'stepWorld should not install the supplied world');
testAssert(currentWorldState()===null,'stepWorld should leave the active world unchanged');
`;
  runIsolated('step world regression',source);
}

function renderColorRegression(){
  const source=sharedPrelude()+read('src/00-materials.js')+read('src/00-world-arrays.js')+read('src/00-world-state.js')+read('src/03-lighting.js')+read('src/03-render-buffer.js')+`
let cols=2,rows=2,count=cols*rows,cellSize=1;
let material,mass,vx,vy,bodyMask,flowDir,restAge,stableMask,tintR,tintG,tintB,tintA,bgTintR,bgTintG,bgTintB,bgTintA,sourceMat,lightMask;
let moveHistory,moveFlip,horizontalDir,horizontalTurns,escapeDir,escapeTarget,carriedBy,carriedTTL,lastMoveTick;
let waterSeen,waterSpaceMark,waterComponentMark,waterBasinMark,waterSleepBlockMark,waterTargetMark,waterWakeMark,waterQueue,rowCounts;
let waterSpaceToken=1,waterComponentToken=1,waterBasinToken=1,waterTargetToken=1,waterWakeToken=1;
let airColor=[10,20,30],lightingEnabled=true,lightStrength=.2,sideLightStrength=.5,shadowStrength=.25;
const renderWorld=createWorldState(cols,rows,{cellSize});
installWorldState(renderWorld);
function idx(c,r){return r*cols+c}
function normalizeMaterialCell(i){return isKnownMaterial(material[i])?material[i]:EMPTY}
function testAssert(condition,message){if(!condition)throw new Error(message)}
function same(a,b){return a.length===b.length&&a.every((v,i)=>v===b[i])}
bgTintR[0]=1;bgTintG[0]=2;bgTintB[0]=3;bgTintA[0]=255;
testAssert(same(baseRenderColor(0,EMPTY),[1,2,3]),'background tint should override global air color');
material[1]=SAND;tintR[1]=7;tintG[1]=8;tintB[1]=9;tintA[1]=255;
testAssert(same(baseRenderColor(1,SAND),[7,8,9]),'particle tint should override material base color');
testAssert(same(applySimpleLighting(100,100,100,1),[131,131,131]),'direct light blend changed');
testAssert(same(applySimpleLighting(100,100,100,2),[115,115,115]),'side light blend changed');
testAssert(same(applySimpleLighting(100,100,100,0),[75,75,75]),'shadow blend changed');
const glow=registerCustomGranularMaterial({name:'Glow',color:[20,30,40],density:3,maxSlope:1,erosionResistance:24,emissive:true});
testAssert(materialEmissive(glow.id),'custom emissive material should report emissive');
const base=glow.color;
const rendered=materialEmissive(glow.id)?base:applySimpleLighting(base[0],base[1],base[2],0);
testAssert(same(rendered,base),'emissive material should skip system lighting');
material[2]=glow.id;
const data=new Uint8Array(count*4);
buildRenderBuffer(renderWorld,data);
testAssert(currentWorldState()===renderWorld,'buildRenderBuffer(world, data) should leave the supplied world active');
testAssert(data[8]===20&&data[9]===30&&data[10]===40&&data[11]===255,'render buffer should preserve emissive color');
`;
  runIsolated('render color regression',source);
}

function sourceRegression(){
  const source=sharedPrelude()+read('src/00-materials.js')+read('src/02-sources.js')+`
let cols=4,rows=3,count=cols*rows,sourceInterval=1,simTick=0,selected='water',cellSize=5;
let material=new Uint8Array(count),sourceMat=new Uint8Array(count),mass=new Float32Array(count),vx=new Float32Array(count),vy=new Float32Array(count),flowDir=new Int8Array(count),bodyMask=new Uint8Array(count),tintR=new Uint8Array(count),tintG=new Uint8Array(count),tintB=new Uint8Array(count),tintA=new Uint8Array(count),moveHistory=new Int32Array(count),moveFlip=new Uint8Array(count),horizontalDir=new Int8Array(count),horizontalTurns=new Uint8Array(count),escapeDir=new Int8Array(count),escapeTarget=new Int16Array(count),carriedBy=new Uint8Array(count),carriedTTL=new Uint16Array(count),lastMoveTick=new Int32Array(count);
function idx(c,r){return r*cols+c}
function inBounds(c,r){return c>=0&&c<cols&&r>=0&&r<rows}
function pointToCell(x,y){return{c:Math.max(0,Math.min(cols-1,Math.floor(x/cellSize))),r:Math.max(0,Math.min(rows-1,Math.floor(y/cellSize)))}}
function getBrushRadius(){return 0}
function wakeFlowAroundCell(){}
function clearParticleTint(i){tintA[i]=0}
function clearMotionTrace(i){moveHistory[i]=-1;moveFlip[i]=0;horizontalDir[i]=0;horizontalTurns[i]=0;escapeDir[i]=0;escapeTarget[i]=-1}
function clearCarryState(i){carriedBy[i]=0;carriedTTL[i]=0;lastMoveTick[i]=0}
function clearRestState(){}
function testAssert(condition,message){if(!condition)throw new Error(message)}
testAssert(canSourceMaterial(WATER),'water should be sourceable');
testAssert(!canSourceMaterial(FIXED_STONE),'fixed stone should not be sourceable');
sourceMat[idx(1,1)]=WATER;
applySources();
testAssert(material[idx(1,1)]===WATER,'source should create water in empty cell');
material[idx(2,1)]=SAND;
sourceMat[idx(2,1)]=WATER;
applySources();
testAssert(material[idx(2,1)]===SAND,'source must not overwrite occupied material');
sourceMat[idx(3,1)]=FIXED_STONE;
applySources();
testAssert(sourceMat[idx(3,1)]===EMPTY,'invalid source material should be cleared');
sourceInterval=2;simTick=1;sourceMat[idx(0,1)]=WATER;
applySources();
testAssert(material[idx(0,1)]===EMPTY,'source interval should throttle generation');
`;
  runIsolated('source regression',source);
}

function editCommandRegression(){
  const source=sharedPrelude()+read('src/00-materials.js')+read('src/00-world-arrays.js')+read('src/00-world-state.js')+read('src/01-cell-state.js')+read('src/01-grid-editing.js')+read('src/01-fill-editing.js')+read('src/01-body-geometry.js')+read('src/02-sources.js')+read('src/02-force.js')+read('src/01-edit-commands.js')+`
let cols=12,rows=8,count=cols*rows,cellSize=5,viewW=60,viewH=40,editDirty=false,WAKE_RADIUS=2,MAX_FILL_CELLS=100,BODY_LIMIT=64;
let material,mass,vx,vy,bodyMask,flowDir,restAge,stableMask,tintR,tintG,tintB,tintA,bgTintR,bgTintG,bgTintB,bgTintA,sourceMat,lightMask;
let moveHistory,moveFlip,horizontalDir,horizontalTurns,escapeDir,escapeTarget,carriedBy,carriedTTL,lastMoveTick;
let waterSeen,waterSpaceMark,waterComponentMark,waterBasinMark,waterSleepBlockMark,waterTargetMark,waterWakeMark,waterQueue,rowCounts;
let waterSpaceToken=1,waterComponentToken=1,waterBasinToken=1,waterTargetToken=1,waterWakeToken=1;
let bodies=[],nextBodyId=1,airColor=[255,255,255],tool='brush',selected='water';
const editWorld=createWorldState(cols,rows,{cellSize});
installWorldState(editWorld);
function idx(c,r){return r*cols+c}
function inBounds(c,r){return c>=0&&c<cols&&r>=0&&r<rows}
function pointToCell(x,y){return{c:Math.max(0,Math.min(cols-1,Math.floor(x/cellSize))),r:Math.max(0,Math.min(rows-1,Math.floor(y/cellSize)))}}
function cellCenter(c,r){return{x:(c+.5)*cellSize,y:(r+.5)*cellSize}}
function wakeWaterComponentsAroundCell(){}
function wakeFlowAroundCell(){}
function wakeFlowNearBody(){}
function nextWaterWakeToken(){return 1}
function isBodyMaterial(){return false}
function resetRuntimeClock(){}
function setStatus(){}
function testAssert(condition,message){if(!condition)throw new Error(message)}
testAssert(applyEditCommand(editWorld,{type:'paint',x:7,y:7,radius:0,material:SAND}),'explicit-world paint command should apply');
testAssert(currentWorldState()===editWorld,'applyEditCommand(world, command) should leave the supplied world active');
testAssert(material[idx(1,1)]===SAND,'paint command wrote material');
testAssert(applyEditCommand({type:'source',x:12,y:7,radius:0,material:WATER}),'source command should apply');
testAssert(sourceMat[idx(2,1)]===WATER,'source command wrote source layer');
testAssert(applyEditCommand({type:'tint',x:7,y:7,radius:0,color:[9,8,7]}),'tint command should apply to material');
testAssert(tintR[idx(1,1)]===9&&tintG[idx(1,1)]===8&&tintB[idx(1,1)]===7&&tintA[idx(1,1)]===255,'tint command wrote particle tint');
testAssert(applyEditCommand({type:'tint',x:1,y:1,radius:0,color:[1,2,3]}),'tint command should apply to air');
testAssert(bgTintR[idx(0,0)]===1&&bgTintG[idx(0,0)]===2&&bgTintB[idx(0,0)]===3&&bgTintA[idx(0,0)]===255,'tint command wrote background tint');
testAssert(!applyEditCommand({type:'source',x:1,y:1,radius:0,material:FIXED_STONE}),'fixed stone source command should be rejected');
testAssert(applyEditCommand({type:'paintLine',x1:0,y1:12,x2:19,y2:12,radius:0,material:SAND}),'paintLine command should apply');
testAssert(material[idx(3,2)]===SAND,'paintLine command should write line endpoint');
testAssert(applyEditCommand({type:'sourceLine',x1:0,y1:7,x2:19,y2:7,radius:0,material:WATER}),'sourceLine command should apply');
testAssert(sourceMat[idx(3,1)]===WATER,'sourceLine command should write line endpoint');
testAssert(applyEditCommand({type:'tintLine',x1:0,y1:2,x2:19,y2:2,radius:0,color:[4,5,6]}),'tintLine command should apply');
testAssert(bgTintR[idx(3,0)]===4&&bgTintG[idx(3,0)]===5&&bgTintB[idx(3,0)]===6,'tintLine command should write line endpoint');
testAssert(applyEditCommand({type:'erase',x:7,y:7,radius:0}),'erase command should apply');
testAssert(material[idx(1,1)]===EMPTY&&tintA[idx(1,1)]===0,'erase command should clear material and particle tint');
testAssert(applyEditCommand({type:'fill',x:1,y:1,material:WATER}),'fill command should apply');
testAssert(material[idx(0,0)]===WATER&&material[idx(1,1)]===WATER,'fill command should fill connected region');
testAssert(applyEditCommand({type:'force',circle:{x:7.5,y:7.5,r:8},arrow:{x:20,y:0}}),'force command should apply');
testAssert(vx[idx(1,1)]>0,'force command should accelerate flow material');
testAssert(applyEditCommand({type:'fillAir',color:[11,12,13]}),'fillAir command should apply');
testAssert(airColor[0]===11&&airColor[1]===12&&airColor[2]===13,'fillAir command should set global air color');
testAssert(currentWorldState().airColor[0]===11&&currentWorldState().airColor[2]===13,'fillAir command should sync world air color');
testAssert(bgTintA[idx(0,0)]===0,'fillAir command should clear background tint overrides');
testAssert(applyEditCommand({type:'clear'}),'clear command should apply');
testAssert(material.every(v=>v===EMPTY)&&sourceMat.every(v=>v===EMPTY),'clear command should empty material and source layers');
testAssert(airColor[0]===255&&airColor[1]===255&&airColor[2]===255,'clear command should reset air color');
testAssert(applyEditCommand({type:'clear'}),'clear command should reset after fill preview check');
testAssert(currentWorldState().airColor[0]===255&&currentWorldState().airColor[1]===255&&currentWorldState().airColor[2]===255,'clear command should reset world air color');
testAssert(applyEditCommand({type:'clear'}),'clear command should not require transient UI hook');
testAssert(!applyEditCommand({type:'paint',x:NaN,y:1,radius:0,material:SAND}),'point commands should reject invalid coordinates');
material[idx(6,5)]=WATER;
testAssert(!applyEditCommand({type:'placeBody',kind:'bad',start:{x:20,y:20},current:{x:40,y:30}}),'placeBody command should reject invalid body kinds');
testAssert(applyEditCommand({type:'placeBody',kind:'stoneRect',start:{x:20,y:20},current:{x:40,y:30}}),'placeBody command should apply');
testAssert(bodies.length===1&&bodies[0].type==='rect','placeBody command should create one rectangle body');
testAssert(material[idx(6,5)]===EMPTY,'placeBody command should clear material under the body');
testAssert(bodyMask[idx(6,5)]===1,'placeBody command should rebuild the body mask');
`;
  runIsolated('edit command regression',source);
}

function bodyGeometryRegression(){
  const source=sharedPrelude()+`
let cols=20,rows=20,count=cols*rows,cellSize=5,viewW=100,viewH=100,BODY_LIMIT=64,editDirty=false,WAKE_RADIUS=2;
let bodies=[],nextBodyId=1;
let bodyMask=new Uint8Array(count),material=new Uint8Array(count),mass=new Float32Array(count),vx=new Float32Array(count),vy=new Float32Array(count),flowDir=new Int8Array(count),sourceMat=new Uint8Array(count),tintR=new Uint8Array(count),tintG=new Uint8Array(count),tintB=new Uint8Array(count),tintA=new Uint8Array(count),bgTintR=new Uint8Array(count),bgTintG=new Uint8Array(count),bgTintB=new Uint8Array(count),bgTintA=new Uint8Array(count);
let moveHistory=new Int16Array(count),moveFlip=new Uint8Array(count),horizontalDir=new Int8Array(count),horizontalTurns=new Uint8Array(count),escapeDir=new Int8Array(count),escapeTarget=new Int16Array(count),carriedBy=new Uint8Array(count),carriedTTL=new Uint16Array(count),lastMoveTick=new Uint32Array(count),restAge=new Uint16Array(count),stableMask=new Uint8Array(count);
function idx(c,r){return r*cols+c}
function inBounds(c,r){return c>=0&&c<cols&&r>=0&&r<rows}
function cellCenter(c,r){return{x:(c+.5)*cellSize,y:(r+.5)*cellSize}}
function nextWaterWakeToken(){return 1}
function wakeWaterComponentsAroundCell(){}
function wakeFlowAroundCell(){}
function setStatus(){}
function testAssert(condition,message){if(!condition)throw new Error(message)}
`+read('src/00-materials.js')+read('src/01-cell-state.js')+read('src/01-grid-editing.js')+read('src/01-fill-editing.js')+read('src/01-body-geometry.js')+`
const rect=makeBodyFromPlacement({kind:'stoneRect',start:{x:25,y:25},current:{x:45,y:45}},true);
const circle=makeBodyFromPlacement({kind:'stoneCircle',start:{x:52,y:35},current:{x:60,y:35}},true);
testAssert(rect.type==='rect'&&circle.type==='circle','body construction changed');
testAssert(bodyContainsPoint(rect,35,35)&&!bodyContainsPoint(rect,5,5),'bodyContainsPoint changed');
testAssert(bodyIntersectsCircle(rect,circle.x,circle.y,circle.radius),'rect/circle intersection should use circle radius');
testAssert(bodiesOverlap(rect,circle),'bodiesOverlap should detect rect/circle overlap');
testAssert(addBody(rect),'addBody should accept first body');
testAssert(!canPlaceBody(circle),'overlapping body should not be placeable');
rebuildBodyMask();
testAssert(bodyMask[idx(7,7)]===1,'rebuildBodyMask should rasterize body cells');
`;
  runIsolated('body geometry regression',source);
}

function movementTintRegression(){
  const flow=read('src/02-flow-and-water.js');
  const source=sharedPrelude()+read('src/00-materials.js')+`
let cols=3,rows=3,count=cols*rows;
let material=new Uint8Array(count),mass=new Float32Array(count),vx=new Float32Array(count),vy=new Float32Array(count),flowDir=new Int8Array(count),escapeDir=new Int8Array(count),escapeTarget=new Int16Array(count),carriedBy=new Uint8Array(count),carriedTTL=new Uint16Array(count),tintR=new Uint8Array(count),tintG=new Uint8Array(count),tintB=new Uint8Array(count),tintA=new Uint8Array(count);
function idx(c,r){return r*cols+c}
function normalizeMaterialCell(i){return isKnownMaterial(material[i])?material[i]:EMPTY}
function wakeFlowAroundCell(){}
function noteMove(){}
function clearParticleTint(i){tintR[i]=0;tintG[i]=0;tintB[i]=0;tintA[i]=0}
function clearRestState(){}
function testAssert(condition,message){if(!condition)throw new Error(message)}
${extractFunction(flow,'moveCell')}
const from=idx(1,0),to=idx(1,1);
material[from]=WATER;mass[from]=1;flowDir[from]=1;tintR[from]=1;tintG[from]=2;tintB[from]=3;tintA[from]=255;
material[to]=SAND;tintR[to]=9;tintG[to]=8;tintB[to]=7;tintA[to]=255;
moveCell(from,to);
testAssert(material[to]===WATER,'moving material should arrive at target');
testAssert(tintR[to]===1&&tintG[to]===2&&tintB[to]===3&&tintA[to]===255,'moving particle tint should follow material');
testAssert(material[from]===SAND,'old target material should swap back to source');
testAssert(tintR[from]===9&&tintG[from]===8&&tintB[from]===7&&tintA[from]===255,'old target particle tint should swap back');
const empty=idx(2,1);
moveCell(to,empty);
testAssert(material[empty]===WATER&&tintA[empty]===255,'particle tint should survive move into empty cell');
testAssert(material[to]===EMPTY&&tintA[to]===0,'source cell tint should clear after moving into empty cell');
`;
  runIsolated('movement tint regression',source);
}

function flowGridPrimitiveRegression(){
  const source=read('src/00-materials.js')+read('src/00-world-arrays.js')+read('src/00-world-state.js')+read('src/00-core-state.js')+read('src/02-flow-and-water.js')+`
function testAssert(condition,message){if(!condition)throw new Error(message)}
const worldA=createWorldState(4,4,{cellSize:1,simTick:3});
const worldB=createWorldState(4,4,{cellSize:1,simTick:9});
useWorldState(worldA);
const a=worldA.arrays,b=worldB.arrays;
a.material[5]=SAND;
b.material[5]=WATER;
b.mass[5]=1;
b.flowDir[5]=1;
b.tintR[5]=4;
b.tintG[5]=5;
b.tintB[5]=6;
b.tintA[5]=255;
testAssert(tryMove(1,1,1,2,WATER,worldB),'explicit grid tryMove should move inside the supplied world');
testAssert(currentWorldState()===worldA,'explicit grid tryMove should not install the supplied world');
testAssert(a.material[5]===SAND&&a.material[9]===EMPTY,'explicit grid tryMove should not mutate the installed world');
testAssert(b.material[5]===EMPTY&&b.material[9]===WATER&&b.tintA[9]===255,'explicit grid tryMove should mutate the supplied world arrays');
testAssert(b.lastMoveTick[9]===9,'explicit grid move should use the supplied world tick');
b.material[12]=FIXED_STONE;
b.material[15]=WATER;
b.mass[15]=1;
drainOpenBoundaries(worldB);
testAssert(b.material[15]===EMPTY,'explicit grid drain should delete edge flow material in the supplied world');
testAssert(b.material[12]===FIXED_STONE,'explicit grid drain should keep non-flow edge solids');
testAssert(a.material[5]===SAND,'explicit grid drain should not mutate the installed world');
b.material.fill(EMPTY);
b.mass.fill(0);
b.flowDir.fill(0);
b.material[1]=SAND;
b.mass[1]=1;
a.material[1]=FIXED_STONE;
testAssert(isSurfaceCell(1,0,SAND,worldB),'explicit grid surface query should read supplied world');
testAssert(!isSurfaceCell(1,0,SAND,worldA),'explicit grid surface query should not read installed world by accident');
testAssert(columnLandingSurfaceRow(2,SAND,worldB)===4,'explicit grid landing query should use supplied world height');
testAssert(hasSlopeCandidate(1,0,SAND,FLOW_RULES[SAND],worldB),'explicit grid slope candidate should see supplied world slope');
testAssert(trySlopeRelax(1,0,SAND,FLOW_RULES[SAND],worldB),'explicit grid slope relax should move inside supplied world');
testAssert(b.material[1]===EMPTY&&(b.material[0]===SAND||b.material[2]===SAND),'explicit grid slope relax should mutate supplied world');
testAssert(a.material[1]===FIXED_STONE&&a.material[2]===EMPTY,'explicit grid slope relax should not mutate installed world');
b.material.fill(EMPTY);
b.mass.fill(0);
b.vy.fill(0);
b.material[5]=WATER;
b.mass[5]=1;
testAssert(hasGravityCandidate(1,1,WATER,FLOW_RULES[WATER],worldB),'explicit grid gravity candidate should read supplied world');
testAssert(tryGravity(1,1,WATER,FLOW_RULES[WATER],worldB),'explicit grid gravity should move inside supplied world');
testAssert(b.material[5]===EMPTY&&b.material[9]===WATER&&b.vy[9]>0,'explicit grid gravity should mutate supplied world');
testAssert(a.material[5]===SAND,'explicit grid gravity should not mutate installed world');
b.material.fill(EMPTY);
b.mass.fill(0);
b.escapeDir.fill(0);
b.escapeTarget.fill(-1);
b.material[5]=WATER;
b.material[8]=FIXED_STONE;
b.material[9]=FIXED_STONE;
b.material[10]=FIXED_STONE;
testAssert(isIsolatedSurfaceCell(1,1,WATER,worldB),'explicit grid isolated-surface query should read supplied world');
const escape=findDropEscape(1,1,WATER,FLOW_RULES[WATER],worldB);
testAssert(escape&&Math.abs(escape.targetC-1)===1,'explicit grid escape scan should find adjacent outlet in supplied world');
testAssert(tryArmIsolatedSurfaceEscape(1,1,WATER,FLOW_RULES[WATER],worldB),'explicit grid escape arm should move inside supplied world');
testAssert(b.material[5]===EMPTY&&(b.material[4]===WATER||b.material[6]===WATER),'explicit grid escape should mutate supplied world');
testAssert(a.material[5]===SAND,'explicit grid escape should not mutate installed world');
b.material.fill(EMPTY);
b.mass.fill(0);
b.vx.fill(0);
b.vy.fill(0);
b.material[5]=WATER;
b.mass[5]=1;
updateFlowCell(1,1,WATER,worldB);
testAssert(b.material[5]===EMPTY&&b.material[9]===WATER,'explicit grid flow-cell dispatch should move supplied world');
testAssert(currentWorldState()===worldA&&a.material[5]===SAND,'explicit grid flow-cell dispatch should not install or mutate worldA');
b.material.fill(EMPTY);
b.mass.fill(0);
b.material[5]=WATER;
b.mass[5]=1;
updateGridMaterials(worldB);
testAssert(b.material[5]===EMPTY&&b.material[9]===WATER,'explicit grid frame update should step supplied world');
testAssert(currentWorldState()===worldA&&a.material[5]===SAND,'explicit grid frame update should not install or mutate worldA');
const worldSurface=createWorldState(4,4,{cellSize:1,simTick:0});
const s=worldSurface.arrays;
function wsi(c,r){return flowGridIndex(worldSurface,c,r)}
s.material[wsi(1,1)]=WATER;
s.material[wsi(0,1)]=FIXED_STONE;
s.material[wsi(2,3)]=FIXED_STONE;
waterSurfaceLevelPass(worldSurface);
testAssert(s.material[wsi(1,1)]===EMPTY&&s.material[wsi(2,2)]===WATER,'explicit grid surface-level pass should move water inside supplied world');
testAssert(currentWorldState()===worldA&&a.material[5]===SAND,'explicit grid surface-level pass should not install or mutate active world');
b.material.fill(EMPTY);
b.restAge.fill(0);
b.stableMask.fill(0);
b.vx.fill(0);
b.vy.fill(0);
b.material[5]=SAND;
b.material[8]=FIXED_STONE;
b.material[9]=FIXED_STONE;
b.material[10]=FIXED_STONE;
b.restAge[5]=STABLE_FRAMES[SAND]-1;
updateMaterialStability(worldB);
testAssert(b.stableMask[5]===1,'explicit grid stability should mark supplied world cells stable');
testAssert(a.stableMask[5]===0,'explicit grid stability should not mutate installed world');
b.material.fill(EMPTY);
b.moveHistory.fill(-1);
b.moveFlip.fill(0);
b.material[5]=SAND;
b.moveHistory[5]=4;
b.moveFlip[5]=FLOW_RULES[SAND].unstableFrames;
deleteOscillatingCells(worldB);
testAssert(b.material[5]===EMPTY,'explicit grid oscillation cleanup should delete supplied world cell');
testAssert(a.material[5]===SAND,'explicit grid oscillation cleanup should not mutate installed world');
b.material.fill(EMPTY);
b.bodyMask.fill(0);
b.waterBasinMark.fill(0);
b.waterSleepBlockMark.fill(0);
a.waterBasinMark.fill(0);
a.waterSleepBlockMark.fill(0);
b.material[8]=FIXED_STONE;
b.material[11]=FIXED_STONE;
b.material[12]=FIXED_STONE;
b.material[13]=FIXED_STONE;
b.material[14]=FIXED_STONE;
b.material[15]=FIXED_STONE;
b.material[9]=WATER;
const basins=buildWaterBasins(worldB);
testAssert(basins.length===1&&basins[0].waterCount===1&&basins[0].cells.includes(9)&&basins[0].cells.includes(10),'explicit grid basin scan should read supplied world geometry');
testAssert(b.waterBasinMark[9]===1&&b.waterBasinMark[10]===1,'explicit grid basin scan should mark supplied world');
testAssert(a.waterBasinMark[9]===0&&currentWorldState()===worldA,'explicit grid basin scan should not install or mutate active world');
a.material[6]=SAND;
b.material[6]=WATER;
const intake=collectWaterBasinIntake(basins[0],worldB);
testAssert(intake.length===1&&intake[0]===6,'explicit grid basin intake should collect connected supplied-world water');
testAssert(a.waterSpaceMark[6]===0&&currentWorldState()===worldA,'explicit grid basin intake should not mutate active-world scratch marks');
testAssert(settleWaterTray(basins[0],intake,worldB),'explicit grid basin settling should rewrite supplied-world basin');
testAssert(b.material[6]===EMPTY&&b.material[9]===WATER&&b.material[10]===WATER,'explicit grid basin settling should move intake into supplied-world basin targets');
testAssert(a.material[6]===SAND&&a.material[10]===EMPTY&&currentWorldState()===worldA,'explicit grid basin settling should not install or mutate active world');
b.material.fill(EMPTY);
b.waterBasinMark.fill(0);
b.waterSleepBlockMark.fill(0);
b.waterSpaceMark.fill(0);
b.material[8]=FIXED_STONE;
b.material[11]=FIXED_STONE;
b.material[12]=FIXED_STONE;
b.material[13]=FIXED_STONE;
b.material[14]=FIXED_STONE;
b.material[15]=FIXED_STONE;
b.material[6]=WATER;
b.material[9]=WATER;
b.material[10]=WATER;
const fullBasins=buildWaterBasins(worldB);
const overflow=collectBasinOverflow(fullBasins[0],worldB);
testAssert(fullBasins.length===1&&overflow.length===1&&overflow[0]===6,'explicit grid basin overflow should collect supplied-world overflow water');
testAssert(a.waterSpaceMark[6]===0&&currentWorldState()===worldA,'explicit grid basin overflow should not mutate active-world scratch marks');
const worldC=createWorldState(5,5,{cellSize:1,simTick:11});
const cArr=worldC.arrays;
function wci(c,r){return flowGridIndex(worldC,c,r)}
cArr.material[wci(1,1)]=WATER;
cArr.material[wci(2,1)]=WATER;
cArr.material[wci(1,2)]=FIXED_STONE;
cArr.material[wci(2,2)]=FIXED_STONE;
cArr.material[wci(1,4)]=FIXED_STONE;
cArr.material[wci(2,4)]=FIXED_STONE;
cArr.material[wci(2,0)]=WATER;
const sourceInfo=buildWaterTrayInfo([{r:1,left:1,right:2}],worldC);
const targetInfo=buildWaterTrayInfo([{r:3,left:1,right:2}],worldC);
sourceInfo.id=1;
targetInfo.id=2;
for(const i of sourceInfo.cells)cArr.waterBasinMark[i]=sourceInfo.id;
for(const i of targetInfo.cells)cArr.waterBasinMark[i]=targetInfo.id;
a.material[2]=SAND;
testAssert(transferBasinOverflow([sourceInfo,targetInfo],worldC),'explicit grid basin transfer should move overflow into a lower supplied-world basin');
testAssert(cArr.material[wci(2,0)]===EMPTY,'explicit grid basin transfer should delete supplied-world overflow intake');
testAssert(cArr.material[wci(1,3)]===WATER||cArr.material[wci(2,3)]===WATER,'explicit grid basin transfer should settle water into supplied-world target basin');
testAssert(a.material[2]===SAND&&currentWorldState()===worldA,'explicit grid basin transfer should not install or mutate active world');
const worldD=createWorldState(5,4,{cellSize:1,simTick:13});
const dArr=worldD.arrays;
function wdi(c,r){return flowGridIndex(worldD,c,r)}
dArr.material[wdi(1,1)]=WATER;
dArr.material[wdi(2,1)]=WATER;
dArr.material[wdi(1,2)]=FIXED_STONE;
dArr.material[wdi(2,2)]=FIXED_STONE;
dArr.material[wdi(0,1)]=FIXED_STONE;
const runoutInfo=buildWaterTrayInfo([{r:1,left:1,right:2}],worldD);
runoutInfo.id=1;
for(const i of runoutInfo.cells)dArr.waterBasinMark[i]=runoutInfo.id;
a.material[8]=SAND;
testAssert(pushWaterAlongBasinOverflow(runoutInfo,worldD),'explicit grid basin overflow runout should move supplied-world water');
testAssert(dArr.material[wdi(2,1)]===EMPTY&&(dArr.material[wdi(3,1)]===WATER||dArr.material[wdi(3,2)]===WATER),'explicit grid basin overflow runout should push water toward the open side in supplied world');
testAssert(a.material[8]===SAND&&currentWorldState()===worldA,'explicit grid basin overflow runout should not install or mutate active world');
const worldE=createWorldState(4,4,{cellSize:1,simTick:17});
const eArr=worldE.arrays;
function wei(c,r){return flowGridIndex(worldE,c,r)}
eArr.material[wei(0,2)]=FIXED_STONE;
eArr.material[wei(3,2)]=FIXED_STONE;
eArr.material[wei(0,3)]=FIXED_STONE;
eArr.material[wei(1,3)]=FIXED_STONE;
eArr.material[wei(2,3)]=FIXED_STONE;
eArr.material[wei(3,3)]=FIXED_STONE;
eArr.material[wei(1,2)]=WATER;
eArr.material[wei(2,1)]=WATER;
a.material[10]=SAND;
testAssert(waterTraySettlePass(worldE),'explicit grid basin pass should settle supplied-world intake');
testAssert(eArr.material[wei(2,1)]===EMPTY&&eArr.material[wei(1,2)]===WATER&&eArr.material[wei(2,2)]===WATER,'explicit grid basin pass should repack water inside supplied-world basin');
testAssert(a.material[10]===SAND&&currentWorldState()===worldA,'explicit grid basin pass should not install or mutate active world');
const worldComponent=createWorldState(4,4,{cellSize:1,simTick:19});
const g=worldComponent.arrays;
function wgi(c,r){return flowGridIndex(worldComponent,c,r)}
g.material[wgi(0,1)]=FIXED_STONE;
g.material[wgi(3,1)]=FIXED_STONE;
g.material[wgi(0,2)]=FIXED_STONE;
g.material[wgi(3,2)]=FIXED_STONE;
g.material[wgi(0,3)]=FIXED_STONE;
g.material[wgi(1,3)]=FIXED_STONE;
g.material[wgi(2,3)]=FIXED_STONE;
g.material[wgi(3,3)]=FIXED_STONE;
g.material[wgi(1,1)]=WATER;
g.material[wgi(2,1)]=WATER;
a.material[6]=SAND;
waterSettlePass(worldComponent);
testAssert(g.material[wgi(1,1)]===EMPTY&&g.material[wgi(2,1)]===EMPTY&&g.material[wgi(1,2)]===WATER&&g.material[wgi(2,2)]===WATER,'explicit grid component settling should repack supplied-world water downward');
testAssert(a.material[6]===SAND&&currentWorldState()===worldA,'explicit grid component settling should not install or mutate active world');
`;
  runIsolated('flow grid primitive regression',source);
}

function saveLoadRegression(){
  const source=sharedPrelude()+read('src/00-materials.js')+read('src/00-world-arrays.js')+read('src/04-save-codec.js')+`
let airColor=[255,255,255];
let material,mass,vx,vy,bodyMask,flowDir,restAge,stableMask,tintR,tintG,tintB,tintA,bgTintR,bgTintG,bgTintB,bgTintA,sourceMat,lightMask;
let moveHistory,moveFlip,horizontalDir,horizontalTurns,escapeDir,escapeTarget,carriedBy,carriedTTL,lastMoveTick;
let waterSeen,waterSpaceMark,waterComponentMark,waterBasinMark,waterSleepBlockMark,waterTargetMark,waterWakeMark,waterQueue,rowCounts;
let waterSpaceToken=1,waterComponentToken=1,waterBasinToken=1,waterTargetToken=1,waterWakeToken=1;
let selected='water',sourceInterval=1,lightingEnabled=true,lightStrength=.18,sideLightStrength=1,shadowStrength=.16;
let bodies=[],fillPreview=[],placing=null,forceState=null,editDirty=false;
let clearTransientEditUiState=function(){throw new Error('snapshot codec should not clear browser UI state')};
function makeArrays(){
  count=cols*rows;
  installGridArrays(createGridArrays(count,rows));
}
function idx(c,r){return r*cols+c}
let expectedRebuildWorld=null;
function rebuildBodyMask(worldArg){
  if(expectedRebuildWorld&&worldArg!==expectedRebuildWorld)throw new Error('snapshot restore should pass explicit world to rebuildBodyMask');
  bodyMask.fill(0);
}
function testAssert(condition,message){if(!condition)throw new Error(message)}
function rowsContaining(mat){
  const out=[];
  for(let r=0;r<rows;r++){
    let ok=false;
    for(let c=0;c<cols;c++)if(material[idx(c,r)]===mat)ok=true;
    if(ok)out.push(r);
  }
  return out;
}
function countWhere(array,predicate){
  let n=0;
  for(const value of array)if(predicate(value))n++;
  return n;
}

let cols=20,rows=20,count=cols*rows;
makeArrays();
for(let c=3;c<17;c++)material[idx(c,10)]=FIXED_STONE;
sourceMat[idx(5,11)]=WATER;
tintR[idx(6,10)]=7;
tintG[idx(6,10)]=8;
tintB[idx(6,10)]=9;
tintA[idx(6,10)]=255;
bgTintR[idx(5,12)]=1;
bgTintG[idx(5,12)]=2;
bgTintB[idx(5,12)]=3;
bgTintA[idx(5,12)]=255;
sourceInterval=4;
lightingEnabled=false;
lightStrength=.33;
sideLightStrength=.44;
shadowStrength=.55;
const saved={
  cols,
  rows,
  material:encodeRuns(material),
  sourceMat:encodeRuns(sourceMat),
  particleTint:encodeTintCells(),
  backgroundTint:encodeTintCells(bgTintR,bgTintG,bgTintB,bgTintA),
  airColor:[255,255,255]
};
const snapshot=serializeWorldSnapshot();
testAssert(snapshot.version===WORLD_SNAPSHOT_VERSION,'snapshot version changed');
testAssert(!Object.prototype.hasOwnProperty.call(snapshot,'selected'),'core snapshot should not serialize UI selection');
testAssert(snapshot.sourceInterval===4&&snapshot.lightingEnabled===false,'snapshot settings were not serialized');
restoreEditableArrays(saved);
testAssert(rowsContaining(FIXED_STONE).length===1,'exact restore should keep one concrete row');

material.fill(EMPTY);
sourceMat.fill(EMPTY);
airColor=[0,0,0];
sourceInterval=1;
lightingEnabled=true;
lightStrength=.18;
sideLightStrength=1;
shadowStrength=.16;
selected='sand';
bodies=[{x:1}];
fillPreview=[1];
placing={};
forceState={};
editDirty=true;
const restored=restoreWorldSnapshot(snapshot);
testAssert(restored.ok&&!restored.resampled,'snapshot restore should succeed without resampling');
testAssert(material[idx(5,11)]===EMPTY&&sourceMat[idx(5,11)]===WATER,'snapshot restore lost source layer');
testAssert(rowsContaining(FIXED_STONE).length===1,'snapshot restore should keep concrete row');
testAssert(tintA[idx(6,10)]===255&&bgTintA[idx(5,12)]===255,'snapshot restore lost tint data');
testAssert(sourceInterval===4&&lightingEnabled===false&&lightStrength===.33&&sideLightStrength===.44&&shadowStrength===.55,'snapshot restore lost settings');
testAssert(selected==='sand','core snapshot restore should not change UI selection');
testAssert(bodies.length===0&&fillPreview.length===1&&placing&&forceState&&editDirty===false,'snapshot restore should clear runtime state without touching UI state');
clearTransientEditUiState=undefined;
editDirty=true;
testAssert(restoreWorldSnapshot(snapshot).ok&&editDirty===false,'snapshot restore should not require transient UI hook');
expectedRebuildWorld={arrays:{},cols};
testAssert(restoreWorldSnapshot(expectedRebuildWorld,snapshot).ok,'explicit-world snapshot restore should pass world through cleanup hooks');
expectedRebuildWorld=null;
testAssert(!restoreWorldSnapshot({version:999,cols:1,rows:1}).ok,'snapshot restore should reject unsupported versions');

cols=20;
rows=19;
makeArrays();
restoreEditableArrays(saved);
testAssert(rowsContaining(FIXED_STONE).length<=1,'downsize expanded concrete');
testAssert(countWhere(sourceMat,v=>v===WATER)>0,'downsize lost source');

cols=20;
rows=21;
makeArrays();
restoreEditableArrays(saved);
testAssert(rowsContaining(FIXED_STONE).length<=1,'upsize expanded concrete');
testAssert(countWhere(tintA,v=>v)>0,'upsize lost particle tint');
testAssert(countWhere(bgTintA,v=>v)>0,'upsize lost background tint');
`;
  runIsolated('save/load regression',source);
}

function saveLoadAdapterRegression(){
  const source=read('src/03-save-storage-adapter.js')+read('src/03-save-ui-adapter.js')+`
let cols=7,rows=5,clockReset=false;
const appContext={running:true,fillPreview:[1],placing:{},forceState:{},pointerDown:true,lastPoint:{},hoverPoint:{}};
const calls=[];
let savedRaw='';
const localStorage={
  getItem(){return JSON.stringify({version:1})},
  setItem(key,value){savedRaw=value;calls.push('store:'+key)}
};
function serializeAppSnapshot(){calls.push('serialize');return{version:1,cols:7,rows:5}}
function restoreAppSnapshot(){calls.push('restore');return{ok:true,resampled:true,savedCols:2,savedRows:3}}
function serializeWorldSnapshot(){throw new Error('save wrapper should use serializeAppSnapshot')}
function restoreWorldSnapshot(){throw new Error('load wrapper should use restoreAppSnapshot')}
function syncButtons(){calls.push('buttons')}
function syncSourceRateControls(arg){if(arg!==null)throw new Error('source controls should sync from state');calls.push('source')}
function syncLightingControls(arg){if(arg!==null)throw new Error('lighting controls should sync from state');calls.push('lighting')}
function updateBrowserFillPreview(){calls.push('preview')}
function clearTransientEditUiState(context){if(context!==appContext)throw new Error('save UI adapter should clear explicit app context');context.fillPreview=[];context.placing=null;context.forceState=null;context.pointerDown=false;calls.push('clear-ui')}
function renderApp(){calls.push('render')}
function resetRuntimeClock(){clockReset=true}
function testAssert(condition,message){if(!condition)throw new Error(message)}
const saved=saveCanvasSnapshot();
testAssert(saved.ok&&savedRaw.includes('"cols":7'),'saveCanvasSnapshot should store serialized app snapshot');
const result=loadCanvasSnapshot();
testAssert(result.ok&&result.message==='Canvas loaded (2x3 -> 7x5)','loadCanvasSnapshot should return resampled message');
testAssert(appContext.running===false&&clockReset,'save UI adapter should stop runtime clock');
testAssert(appContext.fillPreview.length===0&&appContext.placing===null&&appContext.forceState===null&&appContext.pointerDown===false,'save UI adapter should clear transient UI state');
testAssert(calls.join(',')==='serialize,store:material-force-lab.canvas.v1,restore,clear-ui,buttons,source,lighting,preview,render','save UI adapter sync order changed');
`;
  runIsolated('save/load adapter regression',source);
}

function domRefsRegression(){
  const source=`
const requested=[];
const document={getElementById(id){requested.push(id);return{id}}};
function testAssert(condition,message){if(!condition)throw new Error(message)}
`+read('src/03-dom-refs.js')+`
testAssert(materialButton.id==='material-button','material button ref changed');
testAssert(brushSizeNumberInput.id==='brush-size-number','brush size number ref changed');
testAssert(sourceRateInput.id==='source-rate'&&sourceRateNumberInput.id==='source-rate-number','source rate refs changed');
testAssert(lightingEnabledInput.id==='lighting-enabled'&&shadowStrengthNumberInput.id==='shadow-strength-number','lighting refs changed');
testAssert(saveCanvasBtn.id==='save-canvas'&&loadCanvasBtn.id==='load-canvas','save/load refs changed');
testAssert(requested.length===36,'DOM ref count changed');
`;
  runIsolated('DOM refs regression',source);
}

function controlsAdapterRegression(){
  const source=`
const calls=[];
function fakeElement(id,value='4'){
  return{
    id,
    value,
    checked:false,
    dataset:{tool:id==='tool-brush'?'brush':undefined},
    addEventListener(type,handler){this[type]=handler}
  };
}
const toolButton=fakeElement('tool-brush');
const elementMap={step:fakeElement('step'),clear:fakeElement('clear')};
const document={
  querySelectorAll(selector){return selector==='[data-tool]'?[toolButton]:[]},
  getElementById(id){return elementMap[id]||(elementMap[id]=fakeElement(id))}
};
const MATERIAL_KIND_FLUID='fluid',MATERIAL_KIND_GRANULAR='granular',SAND_LIKE_FLOW={erosionResistance:24};
const appContext={materialEditorMode:MATERIAL_KIND_GRANULAR,materialEditorTarget:0,running:false,debugBasins:false,materialMenuOpen:false};
let materialButton=fakeElement('material-button'),addFluidBtn=fakeElement('add-fluid'),addGranularBtn=fakeElement('add-granular'),cancelMaterialBtn=fakeElement('cancel-material'),deleteMaterialBtn=fakeElement('delete-material'),saveMaterialBtn=fakeElement('save-material');
let materialDensityInput=fakeElement('density','2'),materialSlopeInput=fakeElement('slope','1'),materialErosionInput=fakeElement('erosion','24');
let playBtn=fakeElement('play'),debugBasinsBtn=fakeElement('debug'),fillAirColorBtn=fakeElement('fill-air'),saveCanvasBtn=fakeElement('save'),loadCanvasBtn=fakeElement('load');
let brushSizeInput=fakeElement('brush','4'),brushSizeNumberInput=fakeElement('brush-number','4'),eraserSizeInput=fakeElement('eraser','3'),eraserSizeNumberInput=fakeElement('eraser-number','3');
let sourceRateInput=fakeElement('source','1'),sourceRateNumberInput=fakeElement('source-number','1');
let lightingEnabledInput=fakeElement('lighting'),lightStrengthInput=fakeElement('light','18'),lightStrengthNumberInput=fakeElement('light-number','18'),sideLightStrengthInput=fakeElement('side','100'),sideLightStrengthNumberInput=fakeElement('side-number','100'),shadowStrengthInput=fakeElement('shadow','16'),shadowStrengthNumberInput=fakeElement('shadow-number','16');
let tintColorInput=fakeElement('tint');
function currentWorldState(){throw new Error('controls should use app engine helpers')}
function stepWorld(){throw new Error('controls should use stepAppWorld')}
function applyEditCommand(){throw new Error('controls should use applyAppEditCommand')}
function setTool(tool){calls.push('tool:'+tool)}
function renderMaterialMenu(){calls.push('menu')}
function openMaterialEditor(kind){calls.push('open:'+kind)}
function closeMaterialEditor(){calls.push('close')}
function deleteExistingMaterial(id){calls.push('delete:'+id)}
function saveCustomMaterial(){calls.push('save-material')}
function normalizeIntegerInput(input){calls.push('normalize:'+input.id);return Number(input.value)}
function syncIntegerPair(range,number){calls.push('pair:'+range.id+'/'+number.id);return Number(range.value)}
function syncSourceRateControls(source){calls.push('source:'+(source&&source.id))}
function syncLightingControls(source){calls.push('lighting:'+(source&&source.id))}
function setStatus(text){calls.push('status:'+text)}
function syncButtons(){calls.push('buttons')}
function stepAppWorld(){calls.push('step')}
function applyAppEditCommand(command){calls.push('command:'+command.type);return true}
function clearTransientEditUiState(context){if(context!==appContext)throw new Error('clear should pass app context');calls.push('clear-ui')}
function rebuildAppBodyMask(context){if(context!==appContext)throw new Error('clear should rebuild mask through app context');calls.push('mask')}
function rebuildBodyMask(){throw new Error('controls should use rebuildAppBodyMask')}
function saveCanvasSnapshot(){calls.push('save-canvas');return{message:'saved'}}
function loadCanvasSnapshot(){calls.push('load-canvas');return{message:'loaded'}}
function getTintColor(){return[1,2,3]}
function renderApp(){calls.push('render')}
function testAssert(condition,message){if(!condition)throw new Error(message)}
`+read('src/03-controls-adapter.js')+`
toolButton.click();
playBtn.click();
brushSizeInput.input();
sourceRateInput.input();
lightingEnabledInput.input();
elementMap.step.click();
elementMap.clear.click();
testAssert(calls.includes('tool:brush'),'tool button was not bound');
testAssert(calls.includes('status:Running')&&calls.includes('buttons'),'play button was not bound');
testAssert(calls.includes('pair:brush/brush-number'),'brush size controls were not bound');
testAssert(calls.includes('source:source'),'source rate controls were not bound');
testAssert(calls.includes('lighting:lighting'),'lighting controls were not bound');
testAssert(calls.includes('step'),'step button was not bound');
testAssert(calls.includes('command:clear')&&calls.includes('clear-ui')&&calls.includes('mask'),'clear button was not bound');
`;
  runIsolated('controls adapter regression',source);
}

function appUiStateAdapterRegression(){
  const source=`
const calls=[];
const EMPTY=0,WATER=1,SAND=2,FIXED_STONE=3;
let tool='fill',selected='sand',count=0;
let material=new Uint8Array(0),sourceMat=new Uint8Array(0);
const MATERIAL_FROM_NAME={water:WATER,sand:SAND,stone:FIXED_STONE};
const appContext={
  statusText:'',
  running:false,
  fillPreview:[9],
  fillPreviewMaterial:WATER,
  pointerDown:true,
  lastPoint:{x:1,y:2},
  hoverPoint:{x:5,y:6},
  placing:{},
  forceState:{},
  engine:{
    computeFill(point){calls.push('compute:'+point.x+','+point.y);return{cells:[2,3],target:EMPTY,clipped:true,cell:{c:1,r:1}}}
  }
};
const statusEl={textContent:''};
function currentTool(){return tool}
function currentSelectedKey(){return selected}
function isBodyMaterial(){return false}
function appTool(context){return context.tool||tool}
function appSelectedKey(context){return context.selected||selected}
function appSelectedMaterialId(context){return MATERIAL_FROM_NAME[appSelectedKey(context)]||WATER}
function appSelectionIsBodyMaterial(){return false}
function isKnownMaterial(){return false}
function isFlowMaterial(){return false}
function isSolidMaterial(){return false}
function materialCarriesMass(){return false}
function canSourceMaterial(mat){return mat===WATER||mat===SAND}
function appVisibleMaterialCounts(context){if(context!==appContext)throw new Error('status should count through app context');calls.push('visible-counts');return{flow:4,stone:1,sources:2,waterMass:0,byId:{}}}
function applyAppEditCommand(command,context){if(context!==appContext)throw new Error('fill should use explicit app context');calls.push('command:'+command.type+'/'+command.material);return true}
function finishAppEdit(context){if(context!==appContext)throw new Error('fill finish should use explicit app context');calls.push('finish')}
function clampInt(value){return Number(value)||0}
function testAssert(condition,message){if(!condition)throw new Error(message)}
`+read('src/03-app-ui-state-adapter.js')+`
const preview=updateBrowserFillPreview(appContext.hoverPoint);
testAssert(preview.cells.length===2&&appContext.fillPreview.length===2&&appContext.fillPreviewMaterial===SAND,'browser fill preview should store adapter state');
testAssert(appContext.statusText==='Fill preview reached the cell limit','browser fill preview should own clipped status');
testAssert(statusEl.textContent.includes('Flow 4 Stone 1 Source 2')&&calls.includes('visible-counts'),'browser status should use app visible-count helper');
const filled=applyBrowserFill(appContext.hoverPoint,appContext);
testAssert(filled===2&&appContext.fillPreview.length===0,'browser fill should clear adapter preview after commit');
testAssert(calls.includes('command:fill/'+SAND)&&calls.includes('finish'),'browser fill should commit through app engine helpers');
selected='water';
testAssert(selectedSourceMaterial()===WATER,'source material helper should use browser selection');
selected='stone';
testAssert(selectedSourceMaterial()===EMPTY,'source material helper should reject non-sourceable materials');
const altContext={statusText:'alt',tool:'fill',selected:'water',fillPreview:[7],fillPreviewMaterial:SAND,hoverPoint:{x:9,y:9},engine:{computeFill(point){calls.push('alt-compute:'+point.x+','+point.y);return{cells:[4],target:EMPTY,clipped:false,cell:{c:2,r:2}}}}};
const altPreview=updateBrowserFillPreview(altContext.hoverPoint,altContext);
testAssert(altPreview.cells.length===1&&altContext.fillPreview[0]===4&&altContext.fillPreviewMaterial===WATER&&calls.includes('alt-compute:9,9'),'browser fill preview should use the supplied app context engine and selection');
testAssert(selectedSourceMaterial(altContext)===WATER,'source material helper should accept explicit app context selection');
clearTransientEditUiState(appContext);
testAssert(appContext.pointerDown===false&&appContext.lastPoint===null&&appContext.hoverPoint===null&&appContext.placing===null&&appContext.forceState===null,'transient UI clear should reset browser state');
`;
  runIsolated('app UI state adapter regression',source);
}

function canvasRenderAdapterRegression(){
  const source=`
const calls=[];
function noop(){}
const fakeCtx={
  fillStyle:'',
  strokeStyle:'',
  lineWidth:1,
  font:'',
  textAlign:'',
  textBaseline:'',
  imageSmoothingEnabled:true,
  clearRect:noop,
  fillRect:noop,
  strokeRect:noop,
  putImageData:noop,
  drawImage(){calls.push('draw')},
  save:noop,
  restore:noop,
  beginPath:noop,
  arc:noop,
  fill:noop,
  stroke:noop,
  moveTo:noop,
  lineTo:noop,
  closePath:noop,
  translate(x,y){calls.push('translate:'+x+','+y)},
  rotate:noop,
  rect:noop,
  fillText:noop,
  createImageData(w,h){return{width:w,height:h,data:new Uint8ClampedArray(w*h*4)}}
};
const document={createElement(){return{getContext(){return fakeCtx}}}};
let ctx=fakeCtx,cols=2,rows=2,cellSize=3,viewW=6,viewH=6,airColor=[255,255,255],bodies=[],fillPreview=[],fillPreviewMaterial=1,tool='brush';
const fallbackWorld={id:'fallback',cols:2,rows:2,cellSize:3,bodies:[]};
const renderWorld={id:'render-world',cols:2,rows:2,cellSize:3,bodies:[{type:'rect',x:2,y:3,angle:0,hw:1,hh:1,radius:2}]};
const renderContext={debugBasins:true,placing:{kind:'stoneRect'},forceState:null,hoverPoint:null};
const appContext={debugBasins:true,placing:{},forceState:{},hoverPoint:{x:1,y:1}};
function currentWorldState(){return fallbackWorld}
function useWorldState(world){calls.push('use:'+world.id);return world}
function buildRenderBuffer(){throw new Error('render adapter should use appRenderBuffer')}
function appRenderBuffer(world,data,context){if(world!==renderWorld||context!==renderContext)throw new Error('render should pass explicit world/context to app render buffer');calls.push('buffer:'+data.length);return data}
function renderSources(world){if(world!==renderWorld)throw new Error('render should pass explicit world to source overlay');calls.push('sources')}
function updateStatus(){calls.push('status')}
function buildWaterBasins(){throw new Error('render adapter should use appDebugBasins')}
function appDebugBasins(world,context){if(world!==renderWorld||context!==renderContext)throw new Error('basin debug should use explicit render world/context');calls.push('basins');return[{id:1,cells:[0],intervals:[],minC:0,maxC:0,topRow:0,bottomRow:0}]}
function materialColor(){return[0,0,0]}
function appTool(context){return context.tool||tool}
function placementPreviewBody(world,context){if(world!==renderWorld||context!==renderContext)throw new Error('placement preview should use explicit render world/context');calls.push('place-world');return{body:{type:'rect',x:1,y:1,angle:0,hw:1,hh:1,radius:2},canPlace:true,world}}
function makeBodyFromPlacement(){throw new Error('render adapter should use placementPreviewBody')}
function canPlaceBody(){throw new Error('render adapter should use placementPreviewBody')}
function getEraserRadius(){return 0}
function pointToCell(){return{c:0,r:0}}
function testAssert(condition,message){if(!condition)throw new Error(message)}
`+read('src/03-canvas-render-adapter.js')+`
render(renderWorld,renderContext);
testAssert(!calls.some(v=>v==='use:render-world')&&calls.includes('buffer:16')&&calls.includes('draw')&&calls.includes('sources')&&calls.includes('basins')&&calls.includes('translate:2,3')&&calls.includes('place-world')&&calls.includes('status'),'render explicit world/context path changed');
`;
  runIsolated('canvas render adapter regression',source);
}

function settingsSyncAdapterRegression(){
  const source=sharedPrelude()+read('src/00-materials.js')+`
const commands=[];
function fakeInput(id,value='0'){return{id,value,checked:false}}
let sourceInterval=4,lightingEnabled=true,lightStrength=.18,sideLightStrength=1,shadowStrength=.16;
let sourceRateInput=fakeInput('source-rate','90'),sourceRateNumberInput=fakeInput('source-rate-number','1');
let lightingEnabledInput=fakeInput('lighting-enabled'),lightStrengthInput=fakeInput('light','200'),lightStrengthNumberInput=fakeInput('light-number','0'),sideLightStrengthInput=fakeInput('side','150'),sideLightStrengthNumberInput=fakeInput('side-number','0'),shadowStrengthInput=fakeInput('shadow','50'),shadowStrengthNumberInput=fakeInput('shadow-number','0');
function currentAppRuntimeSettings(){return{sourceInterval,lightingEnabled,lightStrength,sideLightStrength,shadowStrength}}
function applyAppRuntimeSettingsCommand(command){
  commands.push(command);
  if(command.type==='sourceInterval')sourceInterval=clampInt(command.value,1,60,1);
  if(command.type==='lighting'){
    if(Object.prototype.hasOwnProperty.call(command,'enabled'))lightingEnabled=!!command.enabled;
    if(Object.prototype.hasOwnProperty.call(command,'lightStrength'))lightStrength=command.lightStrength;
    if(Object.prototype.hasOwnProperty.call(command,'sideLightStrength'))sideLightStrength=command.sideLightStrength;
    if(Object.prototype.hasOwnProperty.call(command,'shadowStrength'))shadowStrength=command.shadowStrength;
  }
}
function applyRuntimeSettingsCommand(){throw new Error('settings adapter should use applyAppRuntimeSettingsCommand')}
function testAssert(condition,message){if(!condition)throw new Error(message)}
`+read('src/03-settings-sync-adapter.js')+`
testAssert(syncSourceRateControls(sourceRateInput)===60&&sourceRateInput.value==='60'&&sourceRateNumberInput.value==='60','source rate clamp changed');
sourceInterval=7;
syncSourceRateControls(null);
testAssert(sourceRateInput.value==='7'&&sourceRateNumberInput.value==='7','source rate state sync changed');
lightingEnabledInput.checked=false;
syncLightingControls(lightingEnabledInput);
testAssert(lightingEnabled===false,'lighting enabled sync changed');
lightStrengthInput.value='200';
syncLightingControls(lightStrengthInput);
testAssert(lightStrength===1&&lightStrengthInput.value==='100'&&lightStrengthNumberInput.value==='100','light strength clamp changed');
sideLightStrengthInput.value='150';
syncLightingControls(sideLightStrengthInput);
testAssert(sideLightStrength===1.5&&sideLightStrengthInput.value==='150','side light strength sync changed');
shadowStrengthInput.value='50';
syncLightingControls(shadowStrengthInput);
testAssert(shadowStrength===.5&&shadowStrengthInput.value==='50','shadow strength sync changed');
`;
  runIsolated('settings sync adapter regression',source);
}

function canvasInputAdapterRegression(){
  const source=`
const calls=[],handlers={};
const canvas={
  addEventListener(type,handler){handlers[type]=handler},
  setPointerCapture(id){calls.push('capture:'+id)},
  hasPointerCapture(){return true},
  releasePointerCapture(id){calls.push('release:'+id)}
};
const MATERIAL_FROM_NAME={water:1},WATER=1;
let tool='brush',selected='water';
const appContext={running:true,accumulator:9,tool:'brush',selected:'water',pointerDown:false,lastPoint:null,hoverPoint:null,placing:null,forceState:null};
function canvasPoint(e){return{x:e.clientX,y:e.clientY}}
function pauseForEdit(){appContext.running=false;appContext.accumulator=0;calls.push('pause')}
function appTool(context){if(context!==appContext)throw new Error('canvas input should read tool through app context');return context.tool}
function appSelectedKey(context){if(context!==appContext)throw new Error('canvas input should read selection key through app context');return context.selected}
function appSelectedMaterialId(context){if(context!==appContext)throw new Error('canvas input should read material through app context');return MATERIAL_FROM_NAME[context.selected]||WATER}
function appSelectionIsBodyMaterial(context){if(context!==appContext)throw new Error('canvas input should read body selection through app context');return false}
function isBodyMaterial(){throw new Error('canvas input should use appSelectionIsBodyMaterial')}
function getBrushRadius(){return 2}
function getEraserRadius(){return 3}
function selectedSourceMaterial(context){if(context!==appContext)throw new Error('canvas input should pass app context to source selection');return WATER}
function getTintColor(){return[1,2,3]}
function updateBrowserFillPreview(point,context){if(context!==appContext)throw new Error('canvas input should pass app context to fill preview');calls.push('preview')}
function clearFillPreview(){calls.push('clear-preview')}
function applyBrowserFill(point,context){
  if(point!==appContext.hoverPoint)throw new Error('fill should receive current hover point');
  if(context!==appContext)throw new Error('fill should receive app context');
  const ok=applyAppEditCommand({type:'fill',x:point.x,y:point.y,material:WATER},context);
  calls.push('fill:'+ok);
  return ok?1:0;
}
function applyAppEditCommand(command,context){if(context!==appContext)throw new Error('canvas input should pass app context to edit command');calls.push('command:'+command.type);return true}
function applyEditCommand(){throw new Error('canvas input should use applyAppEditCommand')}
function currentWorldState(){throw new Error('canvas input should use app engine helpers')}
function setStatus(text){calls.push('status:'+text)}
function finishAppEdit(context){if(context!==appContext)throw new Error('canvas input should pass app context to finish edit');calls.push('finish')}
function finishEditAsNewInitialState(){throw new Error('canvas input should use finishAppEdit')}
function rebuildAppBodyMask(context){if(context!==appContext)throw new Error('canvas input should rebuild mask through app context');calls.push('mask')}
function rebuildBodyMask(){throw new Error('canvas input should use rebuildAppBodyMask')}
function renderApp(){calls.push('render')}
function testAssert(condition,message){if(!condition)throw new Error(message)}
`+read('src/03-canvas-input-adapter.js')+`
testAssert(Object.keys(handlers).sort().join(',')==='pointercancel,pointerdown,pointerleave,pointermove,pointerup','canvas pointer handlers changed');
handlers.pointerdown({pointerId:7,clientX:10,clientY:12});
handlers.pointermove({pointerId:7,clientX:14,clientY:16});
handlers.pointerup({pointerId:7,clientX:18,clientY:20});
testAssert(calls.includes('command:paint')&&calls.includes('command:paintLine'),'brush commands were not routed');
testAssert(calls.includes('finish')&&calls.includes('mask')&&calls.includes('release:7'),'pointerup cleanup changed');
testAssert(appContext.pointerDown===false&&appContext.lastPoint===null,'pointer state did not reset');
tool='fill';
appContext.tool='fill';
handlers.pointerdown({pointerId:8,clientX:5,clientY:6});
testAssert(calls.includes('preview')&&calls.includes('command:fill')&&calls.includes('fill:true')&&calls.includes('status:Filled 1 cells'),'fill gesture should route through app edit command');
`;
  runIsolated('canvas input adapter regression',source);
}

function appBootstrapRegression(){
const source=`
const calls=[];
let SIM_STEP_MS=14;
const appContext={running:true,lastFrame:0,accumulator:0};
const window={addEventListener(type,handler){calls.push('window:'+type);this[type]=handler}};
function resize(){calls.push('resize')}
function stepAppWorld(){calls.push('step')}
function renderApp(){calls.push('render')}
function requestAnimationFrame(handler){calls.push('raf');requestAnimationFrame.last=handler}
function testAssert(condition,message){if(!condition)throw new Error(message)}
`+read('src/03-app-bootstrap.js')+`
testAssert(calls.join(',')==='window:resize,resize,raf','bootstrap startup order changed');
requestAnimationFrame.last(14);
requestAnimationFrame.last(28);
testAssert(calls.includes('step')&&calls.filter(v=>v==='render').length===2,'frame loop did not step and render');
resetRuntimeClock();
requestAnimationFrame.last(56);
testAssert(calls.filter(v=>v==='step').length===1,'resetRuntimeClock should clear accumulated frame time');
`;
  runIsolated('app bootstrap regression',source);
}

function materialUiAdapterRegression(){
  const source=sharedPrelude()+read('src/00-materials.js')+read('src/01-runtime-config.js')+`
function fakeElement(id){
  return{
    id,
    value:'',
    checked:false,
    disabled:false,
    title:'',
    textContent:'',
    innerHTML:'',
    style:{},
    dataset:{},
    classList:{toggle(){}},
    appendChild(child){this.lastChild=child;return child},
    addEventListener(type,handler){this[type]=handler}
  };
}
const document={createElement(tag){return fakeElement(tag)}};
let selected='water';
const appContext={materialMenuOpen:false,materialEditorMode:null,materialEditorTarget:0};
let materialButton=fakeElement('material-button'),materialMenu=fakeElement('material-menu'),materialListEl=fakeElement('material-list'),materialSwatchEl=fakeElement('swatch'),materialLabelEl=fakeElement('label'),materialEditor=fakeElement('editor');
let materialNameInput=fakeElement('name'),materialColorInput=fakeElement('color'),materialDensityInput=fakeElement('density'),materialBlocksLightInput=fakeElement('blocks'),materialEmissiveInput=fakeElement('emissive'),materialSlopeInput=fakeElement('slope'),materialSlopeRow=fakeElement('slope-row'),materialErosionInput=fakeElement('erosion'),materialErosionRow=fakeElement('erosion-row');
let addFluidBtn=fakeElement('add-fluid'),addGranularBtn=fakeElement('add-granular'),deleteMaterialBtn=fakeElement('delete');
let statusText='';
function setStatus(text){statusText=text}
function setSelected(key){selected=key}
const coreApplyMaterialCommand=applyMaterialCommand;
const coreMaterialDef=materialDef;
const coreListSelectableMaterials=listSelectableMaterials;
const coreCountMaterialUses=countMaterialUses;
const coreMaterialKeyFromId=materialKeyFromId;
function applyAppMaterialCommand(command){
  const throwingMaterialDef=materialDef;
  const throwingListSelectableMaterials=listSelectableMaterials;
  const throwingCountMaterialUses=countMaterialUses;
  const throwingMaterialKeyFromId=materialKeyFromId;
  materialDef=coreMaterialDef;
  listSelectableMaterials=coreListSelectableMaterials;
  countMaterialUses=coreCountMaterialUses;
  materialKeyFromId=coreMaterialKeyFromId;
  try{
    return coreApplyMaterialCommand(command);
  }finally{
    materialDef=throwingMaterialDef;
    listSelectableMaterials=throwingListSelectableMaterials;
    countMaterialUses=throwingCountMaterialUses;
    materialKeyFromId=throwingMaterialKeyFromId;
  }
}
function appDefaultMaterialKey(){return 'water'}
function appSelectedKey(){return selected}
function appMaterialKeyExists(key){return !!MATERIAL_FROM_NAME[key]}
function appMaterialIdFromKey(key){return appMaterialKeyExists(key)?MATERIAL_FROM_NAME[key]:WATER}
function appMaterialDefinition(id){return coreMaterialDef(id)}
function appMaterialUseCount(id){return coreCountMaterialUses(id)}
function appMaterialFlowRule(id){return FLOW_RULES[id]||null}
function appSelectableMaterialItems(){return coreListSelectableMaterials().map(item=>Object.assign({},item,{uses:coreCountMaterialUses(item.id)}))}
applyMaterialCommand=function(){throw new Error('material UI adapter should use applyAppMaterialCommand')};
materialDef=function(){throw new Error('material UI adapter should use appMaterialDefinition')};
listSelectableMaterials=function(){throw new Error('material UI adapter should use appSelectableMaterialItems')};
countMaterialUses=function(){throw new Error('material UI adapter should use appMaterialUseCount or appSelectableMaterialItems')};
materialKeyFromId=function(){throw new Error('material UI adapter should use appDefaultMaterialKey')};
function testAssert(condition,message){if(!condition)throw new Error(message)}
`+read('src/03-material-ui-adapter.js')+`
openMaterialEditor(MATERIAL_KIND_FLUID);
testAssert(appContext.materialMenuOpen&&appContext.materialEditorMode===MATERIAL_KIND_FLUID&&appContext.materialEditorTarget===0,'openMaterialEditor should open a new fluid draft');
materialNameInput.value='Ui Oil';
materialColorInput.value='#010203';
materialDensityInput.value='5';
materialBlocksLightInput.checked=true;
materialEmissiveInput.checked=true;
saveCustomMaterial();
const oilId=MATERIAL_FROM_NAME[selected];
testAssert(oilId&&coreMaterialDef(oilId).name==='Ui Oil'&&coreMaterialDef(oilId).density===5,'saveCustomMaterial should register custom fluid');
testAssert(coreMaterialDef(oilId).color[0]===1&&coreMaterialDef(oilId).blocksLight&&coreMaterialDef(oilId).emissive,'saveCustomMaterial should preserve color and light flags');
openExistingMaterialEditor(oilId);
testAssert(appContext.materialEditorMode===MATERIAL_KIND_FLUID&&appContext.materialEditorTarget===oilId&&materialNameInput.value==='Ui Oil','openExistingMaterialEditor should load existing material');
deleteExistingMaterial(oilId);
testAssert(!isKnownMaterial(oilId)&&selected==='water'&&statusText==='Custom material deleted','deleteExistingMaterial should remove unused custom material');
testAssert(hexToRgb('bad').join(',')==='36,168,198','hexToRgb should fallback for invalid color');
`;
  runIsolated('material UI adapter regression',source);
}

syntaxRegression();
portabilityBoundaryRegression();
portableGuideFileListRegression();
htmlScriptOrderRegression();
htmlEntryEquivalenceRegression();
appDomRefsRegression();
runtimeBootstrapRegression();
appContextRegression();
headlessCoreSmokeRegression();
simulationEngineRegression();
portableAdapterContractRegression();
browserLoadSmokeRegression();
materialRegistryRegression();
runtimeConfigRegression();
worldArrayRegression();
worldStateRegression();
stepWorldRegression();
lightingRegression();
renderColorRegression();
sourceRegression();
editCommandRegression();
bodyGeometryRegression();
movementTintRegression();
flowGridPrimitiveRegression();
saveLoadRegression();
saveLoadAdapterRegression();
domRefsRegression();
materialUiAdapterRegression();
settingsSyncAdapterRegression();
appUiStateAdapterRegression();
controlsAdapterRegression();
canvasRenderAdapterRegression();
canvasInputAdapterRegression();
appBootstrapRegression();
