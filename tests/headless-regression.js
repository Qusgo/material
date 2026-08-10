'use strict';

const fs=require('fs');
const path=require('path');

const ROOT=path.resolve(__dirname,'..');
const RUNTIME_FILES=[
  'src/00-materials.js',
  'src/00-world-arrays.js',
  'src/00-world-state.js',
  'src/00-app-dom-refs.js',
  'src/00-core-state.js',
  'src/01-cell-state.js',
  'src/01-grid-editing.js',
  'src/01-fill-editing.js',
  'src/01-body-geometry.js',
  'src/02-sources.js',
  'src/02-flow-and-water.js',
  'src/02-force.js',
  'src/01-runtime-config.js',
  'src/01-edit-commands.js',
  'src/02-erosion.js',
  'src/02-body-runtime.js',
  'src/02-step-world.js',
  'src/04-save-codec.js',
  'src/04-save-load.js',
  'src/04-save-ui-adapter.js',
  'src/03-lighting.js',
  'src/03-render-buffer.js',
  'src/03-simulation-engine.js',
  'src/03-canvas-render-adapter.js',
  'src/03-source-render-adapter.js',
  'src/03-dom-refs.js',
  'src/03-app-context.js',
  'src/03-app-ui-state-adapter.js',
  'src/03-material-ui-adapter.js',
  'src/03-settings-sync-adapter.js',
  'src/03-controls-adapter.js',
  'src/03-canvas-input-adapter.js',
  'src/03-app-bootstrap.js'
];
const CORE_CANDIDATE_FILES=[
  'src/00-materials.js',
  'src/00-world-arrays.js',
  'src/00-world-state.js',
  'src/01-cell-state.js',
  'src/01-grid-editing.js',
  'src/01-fill-editing.js',
  'src/01-body-geometry.js',
  'src/02-sources.js',
  'src/02-flow-and-water.js',
  'src/02-force.js',
  'src/01-runtime-config.js',
  'src/01-edit-commands.js',
  'src/02-erosion.js',
  'src/02-body-runtime.js',
  'src/02-step-world.js',
  'src/04-save-codec.js',
  'src/03-lighting.js',
  'src/03-render-buffer.js',
  'src/03-simulation-engine.js'
];

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
  const violations=[];
  for(const file of CORE_CANDIDATE_FILES){
    const source=stripCommentsAndStrings(read(file));
    const lines=source.split(/\r?\n/);
    for(let row=0;row<lines.length;row++){
      browserApiPattern.lastIndex=0;
      let match;
      while((match=browserApiPattern.exec(lines[row]))){
        violations.push(`${file}:${row+1}: ${match[1]}`);
      }
    }
  }
  assert(!violations.length,`core boundary references browser APIs:\n${violations.join('\n')}`);
  console.log('portability boundary regression ok');
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
`+read('src/00-app-dom-refs.js')+read('src/00-core-state.js')+`
if(cols!==1||rows!==1||count!==1)throw new Error('core-state bootstrap dimensions changed');
if(!currentWorldState()||currentWorldState().arrays.material!==material)throw new Error('core-state did not install active world');
if(currentTool()!=='brush'||currentSelectedKey()!=='water')throw new Error('selection helpers should default to legacy globals');
globalThis.appContext={tool:'eraser',selected:'sand'};
if(currentTool()!=='eraser'||currentSelectedKey()!=='sand')throw new Error('selection helpers should read appContext when present');
setCurrentTool('fill');
setCurrentSelectedKey('stone');
if(tool!=='fill'||selected!=='stone'||globalThis.appContext.tool!=='fill'||globalThis.appContext.selected!=='stone')throw new Error('selection helpers should sync legacy globals and appContext');
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
function currentWorldState(){calls.push('current');return initialWorld}
function createSimulationEngine(options){
  if(options.world!==initialWorld)throw new Error('appContext should seed engine from current world');
  return{
    currentWorld(){calls.push('engine-current');return nextWorld},
    edit(command){calls.push('edit:'+command.type);return true},
    step(iterations){calls.push('step:'+iterations);return nextWorld},
    resize(cols,rows,options){calls.push('resize:'+cols+'x'+rows+'/'+options.cellSize);return{changed:true,world:nextWorld}},
    serialize(){calls.push('serialize');return{version:1}},
    restore(snapshot){calls.push('restore:'+snapshot.version);return{ok:true}},
    materialCommand(command){calls.push('material:'+command.type);return{ok:true}},
    runtimeSettingsCommand(command){calls.push('runtime:'+command.type);return{ok:true}},
    runtimeSettings(){calls.push('runtime-current');return{sourceInterval:1,lightingEnabled:true,lightStrength:.18,sideLightStrength:1,shadowStrength:.16}}
  };
}
function render(world,context){calls.push('render:'+world.id+'/'+context.label)}
function testAssert(condition,message){if(!condition)throw new Error(message)}
`+read('src/03-app-context.js')+`
appContext.label='main';
const altContext={
  label:'alt',
  engine:{
    currentWorld(){calls.push('alt-current');return{id:'alt-world'}},
    edit(command){calls.push('alt-edit:'+command.type);return true},
    step(iterations){calls.push('alt-step:'+iterations);return{id:'alt-step-world'}},
    resize(cols,rows,options){calls.push('alt-resize:'+cols+'x'+rows+'/'+options.cellSize);return{changed:false,world:{id:'alt-resized'}}},
    serialize(){calls.push('alt-serialize');return{version:3}},
    restore(snapshot){calls.push('alt-restore:'+snapshot.version);return{ok:true}},
    materialCommand(command){calls.push('alt-material:'+command.type);return{ok:true}},
    runtimeSettingsCommand(command){calls.push('alt-runtime:'+command.type);return{ok:true}},
    runtimeSettings(){calls.push('alt-runtime-current');return{sourceInterval:9}}
  }
};
testAssert(appContext.engine,'appContext should own the browser engine');
testAssert(appWorld()===nextWorld,'appWorld should delegate to engine.currentWorld');
testAssert(applyAppEditCommand({type:'paint'}),'applyAppEditCommand should delegate to engine.edit');
testAssert(stepAppWorld(2)===nextWorld,'stepAppWorld should delegate to engine.step');
const resized=resizeAppWorld(4,5,{cellSize:6});
testAssert(resized.changed&&resized.world===nextWorld,'resizeAppWorld should delegate to engine.resize');
testAssert(serializeAppSnapshot().version===1,'serializeAppSnapshot should delegate to engine.serialize');
testAssert(restoreAppSnapshot({version:2}).ok,'restoreAppSnapshot should delegate to engine.restore');
testAssert(applyAppMaterialCommand({type:'add'}).ok,'applyAppMaterialCommand should delegate to engine.materialCommand');
testAssert(applyAppRuntimeSettingsCommand({type:'sourceInterval'}).ok,'applyAppRuntimeSettingsCommand should delegate to engine.runtimeSettingsCommand');
testAssert(currentAppRuntimeSettings().sourceInterval===1,'currentAppRuntimeSettings should delegate to engine.runtimeSettings');
renderApp();
testAssert(appWorld(altContext).id==='alt-world','appWorld should accept explicit context');
testAssert(applyAppEditCommand({type:'paint'},altContext),'applyAppEditCommand should accept explicit context');
testAssert(stepAppWorld(4,altContext).id==='alt-step-world','stepAppWorld should accept explicit context');
testAssert(!resizeAppWorld(6,7,{cellSize:8},altContext).changed,'resizeAppWorld should accept explicit context');
testAssert(serializeAppSnapshot(altContext).version===3,'serializeAppSnapshot should accept explicit context');
testAssert(restoreAppSnapshot({version:4},altContext).ok,'restoreAppSnapshot should accept explicit context');
testAssert(applyAppMaterialCommand({type:'delete'},altContext).ok,'applyAppMaterialCommand should accept explicit context');
testAssert(applyAppRuntimeSettingsCommand({type:'lighting'},altContext).ok,'applyAppRuntimeSettingsCommand should accept explicit context');
testAssert(currentAppRuntimeSettings(altContext).sourceInterval===9,'currentAppRuntimeSettings should accept explicit context');
renderApp(altContext);
testAssert(calls.includes('edit:paint')&&calls.includes('step:2')&&calls.includes('resize:4x5/6')&&calls.includes('serialize')&&calls.includes('restore:2')&&calls.includes('material:add')&&calls.includes('runtime:sourceInterval')&&calls.includes('runtime-current')&&calls.includes('render:next/main'),'appContext helpers changed');
testAssert(calls.includes('alt-edit:paint')&&calls.includes('alt-step:4')&&calls.includes('alt-resize:6x7/8')&&calls.includes('alt-serialize')&&calls.includes('alt-restore:4')&&calls.includes('alt-material:delete')&&calls.includes('alt-runtime:lighting')&&calls.includes('alt-runtime-current')&&calls.includes('render:alt-world/alt'),'explicit app context helpers changed');
`;
  runIsolated('app context regression',source);
}

function headlessCoreSmokeRegression(){
  const coreFiles=[
    'src/00-materials.js',
    'src/00-world-arrays.js',
    'src/00-world-state.js',
    'src/00-core-state.js',
    'src/01-cell-state.js',
    'src/01-grid-editing.js',
    'src/01-fill-editing.js',
    'src/01-body-geometry.js',
    'src/02-sources.js',
    'src/02-flow-and-water.js',
    'src/02-force.js',
    'src/01-runtime-config.js',
    'src/01-edit-commands.js',
    'src/02-erosion.js',
    'src/02-body-runtime.js',
    'src/02-step-world.js',
    'src/04-save-codec.js',
    'src/03-lighting.js',
    'src/03-render-buffer.js',
    'src/03-simulation-engine.js'
  ];
  const source=coreFiles.map(read).join('\n')+`
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
`;
  runIsolated('headless core smoke regression',source);
}

function simulationEngineRegression(){
  const coreFiles=[
    'src/00-materials.js',
    'src/00-world-arrays.js',
    'src/00-world-state.js',
    'src/00-core-state.js',
    'src/01-cell-state.js',
    'src/01-grid-editing.js',
    'src/01-fill-editing.js',
    'src/01-body-geometry.js',
    'src/02-sources.js',
    'src/02-flow-and-water.js',
    'src/02-force.js',
    'src/01-runtime-config.js',
    'src/01-edit-commands.js',
    'src/02-erosion.js',
    'src/02-body-runtime.js',
    'src/02-step-world.js',
    'src/04-save-codec.js',
    'src/03-lighting.js',
    'src/03-render-buffer.js',
    'src/03-simulation-engine.js'
  ];
  const source=coreFiles.map(read).join('\n')+`
function testAssert(condition,message){if(!condition)throw new Error(message)}
function setStatus(){}
testAssert(typeof document==='undefined'&&typeof canvas==='undefined'&&typeof localStorage==='undefined','simulation engine should be DOM-free');
const engine=createSimulationEngine({cols:12,rows:10,cellSize:3});
testAssert(currentWorldState()===engine.world&&cols===12&&rows===10,'engine did not install its world');
testAssert(engine.edit({type:'paint',x:6,y:6,radius:0,material:SAND}),'engine edit failed');
testAssert(material.some(v=>v===SAND),'engine edit did not write material');
engine.step(3);
testAssert(simTick===3&&currentWorldState()===engine.world,'engine step did not use its world');
const buffer=engine.renderBuffer();
testAssert(buffer.length===engine.world.count*4&&buffer.some(v=>v!==0),'engine renderBuffer failed');
const snapshot=engine.serialize();
testAssert(snapshot.cols===12&&snapshot.rows===10,'engine serialize returned wrong dimensions');
engine.clear();
testAssert(!material.some(v=>v!==EMPTY),'engine clear failed');
const restored=engine.restore(snapshot);
testAssert(restored.ok&&material.some(v=>v===SAND),'engine restore failed');
const resized=engine.resize(8,6,{cellSize:4});
testAssert(resized.changed&&engine.world.cols===8&&engine.world.rows===6&&cellSize===4,'engine resize failed');
const custom=engine.materialCommand({type:'add',kind:MATERIAL_KIND_FLUID,name:'Engine Oil',density:3,color:[3,4,5]});
testAssert(custom.ok&&materialDef(custom.def.id).name==='Engine Oil','engine material command failed');
engine.runtimeSettingsCommand({type:'sourceInterval',value:9});
testAssert(engine.runtimeSettings().sourceInterval===9,'engine runtime settings command failed');
`;
  runIsolated('simulation engine regression',source);
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
  devicePixelRatio:1,
  addEventListener(type,handler){events.window[type]=handler}
};
function requestAnimationFrame(handler){calls.push('raf');requestAnimationFrame.last=handler}
const localStorage={getItem(){return null},setItem(){}};
function testAssert(condition,message){if(!condition)throw new Error(message)}
`+RUNTIME_FILES.map(read).join('\n')+`
testAssert(cols>1&&rows>1&&count===cols*rows,'browser load did not resize/install grid');
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
`+read('src/00-app-dom-refs.js')+`
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
`;
  runIsolated('world array regression',source);
}

function worldStateRegression(){
  const source=sharedPrelude()+read('src/00-materials.js')+read('src/00-world-arrays.js')+read('src/00-world-state.js')+`
let cols=1,rows=1,count=1,cellSize=1,simTick=2,editDirty=true;
let material,mass,vx,vy,bodyMask,flowDir,restAge,stableMask,tintR,tintG,tintB,tintA,bgTintR,bgTintG,bgTintB,bgTintA,sourceMat,lightMask;
let moveHistory,moveFlip,horizontalDir,horizontalTurns,escapeDir,escapeTarget,carriedBy,carriedTTL,lastMoveTick;
let waterSeen,waterSpaceMark,waterComponentMark,waterBasinMark,waterSleepBlockMark,waterTargetMark,waterWakeMark,waterQueue,rowCounts;
let waterSpaceToken=1,waterComponentToken=1,waterBasinToken=1,waterTargetToken=1,waterWakeToken=1;
let bodies=[],nextBodyId=1;
function idx(c,r){return r*cols+c}
function testAssert(condition,message){if(!condition)throw new Error(message)}
const seedBodies=[{id:7,x:1,y:2,radius:3}];
const world=createWorldState(5,4,{cellSize:6,bodies:seedBodies,nextBodyId:8,airColor:[1,2,3],simTick:11,editDirty:false});
testAssert(world.cols===5&&world.rows===4&&world.count===20&&world.cellSize===6,'world dimensions changed');
testAssert(world.arrays.material.length===20&&world.arrays.rowCounts.length===4,'world array dimensions changed');
installWorldState(world);
testAssert(cols===5&&rows===4&&count===20&&cellSize===6,'installWorldState did not update dimensions');
testAssert(material===world.arrays.material&&rowCounts===world.arrays.rowCounts,'installWorldState did not install arrays');
testAssert(bodies===seedBodies&&nextBodyId===8,'installWorldState did not install body state');
testAssert(world.airColor[0]===1&&world.airColor[1]===2&&world.airColor[2]===3,'installWorldState did not install air color');
testAssert(simTick===11&&editDirty===false&&world.simTick===11&&world.editDirty===false,'installWorldState did not install runtime flags');
material[0]=SAND;
waterWakeToken=7;
bodies.push({id:8,x:2,y:3,radius:4});
nextBodyId=9;
setAirColorState([4,5,6]);
setRuntimeFlagsState({simTick:13,editDirty:true});
const current=currentWorldState();
testAssert(current===world,'currentWorldState should return active world');
testAssert(current.arrays.material[0]===SAND,'currentWorldState did not capture array references');
testAssert(current.tokens.waterWakeToken===7,'currentWorldState did not capture scratch tokens');
testAssert(current.bodies.length===2&&current.nextBodyId===9,'currentWorldState did not capture body state');
testAssert(current.airColor[0]===4&&current.airColor[1]===5&&current.airColor[2]===6,'currentWorldState did not capture air color');
testAssert(current.simTick===13&&current.editDirty===true,'currentWorldState did not capture runtime flags');
clearEditableGridState();
testAssert(current.tokens.waterWakeToken===1,'clearEditableGridState should reset active world tokens');
const replacement=createWorldState(2,3,{cellSize:4});
installWorldState(replacement);
testAssert(currentWorldState()===replacement&&cols===2&&rows===3&&material.length===6&&bodies===replacement.bodies,'replacement world install failed');
bodies.push({id:9,x:4,y:5,radius:6});
nextBodyId=10;
setAirColorState([12,13,14]);
setRuntimeFlagsState({simTick:21,editDirty:true});
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
const unchanged=resizeWorldGrid(2,3,{cellSize:4});
testAssert(!unchanged.changed&&currentWorldState()===replacement,'resizeWorldGrid should no-op matching dimensions');
const resized=resizeWorldGrid(4,6,{cellSize:4});
testAssert(resized.changed&&cols===4&&rows===6&&cellSize===4,'resizeWorldGrid did not install resized world');
testAssert(resized.world.bodies===bodies&&bodies.length===1&&resized.world.nextBodyId===10,'resizeWorldGrid should preserve body state');
testAssert(resized.world.airColor[0]===12&&currentAirColorState()[2]===14,'resizeWorldGrid should preserve air color state');
testAssert(resized.world.simTick===21&&resized.world.editDirty===true&&simTick===21&&editDirty===true,'resizeWorldGrid should preserve runtime flags');
testAssert(material[idx(1,1)]===WATER&&mass[idx(1,1)]>.69&&mass[idx(1,1)]<.71&&vx[idx(1,1)]===2&&vy[idx(1,1)]===3,'resizeWorldGrid lost material motion state');
testAssert(flowDir[idx(1,1)]===1&&tintA[idx(1,1)]===255&&tintR[idx(1,1)]===9,'resizeWorldGrid lost flow direction or particle tint');
testAssert(sourceMat[idx(0,2)]===SAND&&bgTintA[idx(0,2)]===255&&bgTintR[idx(0,2)]===6,'resizeWorldGrid lost source or background tint');
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
function rebuildBodyMask(){calls.push('mask')}
function updateBodies(){calls.push('bodies')}
function updateGridMaterials(){calls.push('grid')}
function testAssert(condition,message){if(!condition)throw new Error(message)}
const world=createWorldState(2,2,{cellSize:3,simTick:4});
stepWorld(world);
testAssert(simTick===5&&world.simTick===5,'stepWorld should increment world and legacy simTick once');
testAssert(calls.join(',')==='mask,bodies,mask,grid,mask','stepWorld update order changed');
testAssert(cols===2&&rows===2&&count===4&&cellSize===3,'stepWorld should install supplied world');
testAssert(currentWorldState()===world,'stepWorld should leave supplied world active');
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
const appContext={fillPreview:[],fillPreviewMaterial:0};
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
tool='fill';
selected='sand';
updateFillPreview({x:1,y:1});
testAssert(appContext.fillPreview.length===count&&appContext.fillPreview===fillPreview&&appContext.fillPreviewMaterial===SAND,'fill preview should live in appContext during browser use');
testAssert(applyFill({x:1,y:1},applyEditCommand),'applyFill should commit the preview through the edit command boundary');
testAssert(appContext.fillPreview.length===0&&fillPreview.length===0,'applyFill should clear appContext preview state');
testAssert(applyEditCommand({type:'clear'}),'clear command should reset after fill preview check');
testAssert(currentWorldState().airColor[0]===255&&currentWorldState().airColor[1]===255&&currentWorldState().airColor[2]===255,'clear command should reset world air color');
clearTransientEditUiState=undefined;
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

function saveLoadRegression(){
  const source=sharedPrelude()+read('src/00-materials.js')+read('src/00-world-arrays.js')+read('src/04-save-codec.js')+`
let airColor=[255,255,255];
let material,mass,vx,vy,bodyMask,flowDir,restAge,stableMask,tintR,tintG,tintB,tintA,bgTintR,bgTintG,bgTintB,bgTintA,sourceMat,lightMask;
let moveHistory,moveFlip,horizontalDir,horizontalTurns,escapeDir,escapeTarget,carriedBy,carriedTTL,lastMoveTick;
let waterSeen,waterSpaceMark,waterComponentMark,waterBasinMark,waterSleepBlockMark,waterTargetMark,waterWakeMark,waterQueue,rowCounts;
let waterSpaceToken=1,waterComponentToken=1,waterBasinToken=1,waterTargetToken=1,waterWakeToken=1;
let selected='water',sourceInterval=1,lightingEnabled=true,lightStrength=.18,sideLightStrength=1,shadowStrength=.16;
let bodies=[],fillPreview=[],placing=null,forceState=null,editDirty=false;
function clearTransientEditUiState(){fillPreview=[];placing=null;forceState=null}
function makeArrays(){
  count=cols*rows;
  installGridArrays(createGridArrays(count,rows));
}
function idx(c,r){return r*cols+c}
function rebuildBodyMask(){bodyMask.fill(0)}
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
testAssert(bodies.length===0&&fillPreview.length===0&&placing===null&&forceState===null&&editDirty===false,'snapshot restore should clear transient runtime state');
clearTransientEditUiState=undefined;
editDirty=true;
testAssert(restoreWorldSnapshot(snapshot).ok&&editDirty===false,'snapshot restore should not require transient UI hook');
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
  const source=read('src/04-save-load.js')+read('src/04-save-ui-adapter.js')+`
let cols=7,rows=5,clockReset=false;
const appContext={running:true};
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
function updateFillPreview(){calls.push('preview')}
function renderApp(){calls.push('render')}
function resetRuntimeClock(){clockReset=true}
function testAssert(condition,message){if(!condition)throw new Error(message)}
const saved=saveCanvasSnapshot();
testAssert(saved.ok&&savedRaw.includes('"cols":7'),'saveCanvasSnapshot should store serialized app snapshot');
const result=loadCanvasSnapshot();
testAssert(result.ok&&result.message==='Canvas loaded (2x3 -> 7x5)','loadCanvasSnapshot should return resampled message');
testAssert(appContext.running===false&&clockReset,'save UI adapter should stop runtime clock');
testAssert(calls.join(',')==='serialize,store:material-force-lab.canvas.v1,restore,buttons,source,lighting,preview,render','save UI adapter sync order changed');
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
function rebuildBodyMask(){calls.push('mask')}
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
testAssert(calls.includes('command:clear')&&calls.includes('mask'),'clear button was not bound');
`;
  runIsolated('controls adapter regression',source);
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
  translate:noop,
  rotate:noop,
  rect:noop,
  fillText:noop,
  createImageData(w,h){return{width:w,height:h,data:new Uint8ClampedArray(w*h*4)}}
};
const document={createElement(){return{getContext(){return fakeCtx}}}};
let ctx=fakeCtx,cols=2,rows=2,cellSize=3,viewW=6,viewH=6,airColor=[255,255,255],bodies=[],fillPreview=[],fillPreviewMaterial=1,tool='brush';
const fallbackWorld={id:'fallback',cols:2,rows:2,cellSize:3},renderWorld={id:'render-world',cols:2,rows:2,cellSize:3},renderContext={debugBasins:false,placing:null,forceState:null,hoverPoint:null};
const appContext={debugBasins:true,placing:{},forceState:{},hoverPoint:{x:1,y:1}};
function currentWorldState(){return fallbackWorld}
function useWorldState(world){calls.push('use:'+world.id);return world}
function buildRenderBuffer(world,data){if(world!==renderWorld)throw new Error('render should pass explicit world to render buffer');calls.push('buffer:'+data.length)}
function renderSources(world){if(world!==renderWorld)throw new Error('render should pass explicit world to source overlay');calls.push('sources')}
function renderBodies(){calls.push('bodies')}
function updateStatus(){calls.push('status')}
function buildWaterBasins(){throw new Error('explicit context should disable basin debug')}
function materialColor(){return[0,0,0]}
function makeBodyFromPlacement(){throw new Error('explicit context should disable placement preview')}
function canPlaceBody(){return true}
function getEraserRadius(){return 0}
function pointToCell(){return{c:0,r:0}}
function testAssert(condition,message){if(!condition)throw new Error(message)}
`+read('src/03-canvas-render-adapter.js')+`
render(renderWorld,renderContext);
testAssert(calls.includes('use:render-world')&&calls.includes('buffer:16')&&calls.includes('draw')&&calls.includes('sources')&&calls.includes('status'),'render explicit world/context path changed');
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
const appContext={running:true,accumulator:9,pointerDown:false,lastPoint:null,hoverPoint:null,placing:null,forceState:null};
function canvasPoint(e){return{x:e.clientX,y:e.clientY}}
function pauseForEdit(){appContext.running=false;appContext.accumulator=0;calls.push('pause')}
function isBodyMaterial(){return false}
function getBrushRadius(){return 2}
function getEraserRadius(){return 3}
function selectedSourceMaterial(){return WATER}
function getTintColor(){return[1,2,3]}
function updateFillPreview(){calls.push('preview')}
function clearFillPreview(){calls.push('clear-preview')}
function applyFill(point,runCommand){
  if(point!==appContext.hoverPoint)throw new Error('fill should receive current hover point');
  const ok=runCommand({type:'fill',x:point.x,y:point.y,material:WATER});
  calls.push('fill:'+ok);
}
function applyAppEditCommand(command){calls.push('command:'+command.type);return true}
function applyEditCommand(){throw new Error('canvas input should use applyAppEditCommand')}
function currentWorldState(){throw new Error('canvas input should use app engine helpers')}
function setStatus(text){calls.push('status:'+text)}
function finishEditAsNewInitialState(){calls.push('finish')}
function rebuildBodyMask(){calls.push('mask')}
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
handlers.pointerdown({pointerId:8,clientX:5,clientY:6});
testAssert(calls.includes('preview')&&calls.includes('command:fill')&&calls.includes('fill:true'),'fill gesture should route through app edit command');
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
function applyAppMaterialCommand(command){return coreApplyMaterialCommand(command)}
applyMaterialCommand=function(){throw new Error('material UI adapter should use applyAppMaterialCommand')};
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
testAssert(oilId&&materialDef(oilId).name==='Ui Oil'&&materialDef(oilId).density===5,'saveCustomMaterial should register custom fluid');
testAssert(materialDef(oilId).color[0]===1&&materialBlocksLight(oilId)&&materialEmissive(oilId),'saveCustomMaterial should preserve color and light flags');
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
appDomRefsRegression();
runtimeBootstrapRegression();
appContextRegression();
headlessCoreSmokeRegression();
simulationEngineRegression();
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
saveLoadRegression();
saveLoadAdapterRegression();
domRefsRegression();
materialUiAdapterRegression();
settingsSyncAdapterRegression();
controlsAdapterRegression();
canvasRenderAdapterRegression();
canvasInputAdapterRegression();
appBootstrapRegression();
