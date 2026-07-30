'use strict';

const fs=require('fs');
const path=require('path');

const ROOT=path.resolve(__dirname,'..');
const RUNTIME_FILES=[
  'src/00-materials.js',
  'src/00-core-state.js',
  'src/01-editing-and-bodies.js',
  'src/02-sources.js',
  'src/02-source-render.js',
  'src/01-edit-commands.js',
  'src/02-flow-and-water.js',
  'src/02-erosion.js',
  'src/04-save-codec.js',
  'src/04-save-load.js',
  'src/03-lighting.js',
  'src/03-render-buffer.js',
  'src/03-runtime-render-input.js'
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

function sharedPrelude(){
  return `
function clamp(v,a,b){return Math.max(a,Math.min(b,v))}
function randDir(){return 1}
`;
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

function renderColorRegression(){
  const source=sharedPrelude()+read('src/00-materials.js')+read('src/03-lighting.js')+read('src/03-render-buffer.js')+`
let cols=2,rows=2,count=cols*rows;
let material=new Uint8Array(count),mass=new Float32Array(count),tintR=new Uint8Array(count),tintG=new Uint8Array(count),tintB=new Uint8Array(count),tintA=new Uint8Array(count),bgTintR=new Uint8Array(count),bgTintG=new Uint8Array(count),bgTintB=new Uint8Array(count),bgTintA=new Uint8Array(count),lightMask=new Uint8Array(count);
let airColor=[10,20,30],lightingEnabled=true,lightStrength=.2,sideLightStrength=.5,shadowStrength=.25;
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
buildRenderBuffer(data);
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
  const source=sharedPrelude()+read('src/00-materials.js')+read('src/01-editing-and-bodies.js')+read('src/02-sources.js')+read('src/01-edit-commands.js')+`
let cols=4,rows=3,count=cols*rows,cellSize=5,editDirty=false,WAKE_RADIUS=2,accumulator=0;
let material=new Uint8Array(count),sourceMat=new Uint8Array(count),bodyMask=new Uint8Array(count),mass=new Float32Array(count),vx=new Float32Array(count),vy=new Float32Array(count),flowDir=new Int8Array(count),restAge=new Uint8Array(count),stableMask=new Uint8Array(count),moveHistory=new Int32Array(count),moveFlip=new Uint8Array(count),horizontalDir=new Int8Array(count),horizontalTurns=new Uint8Array(count),escapeDir=new Int8Array(count),escapeTarget=new Int16Array(count),carriedBy=new Uint8Array(count),carriedTTL=new Uint16Array(count),lastMoveTick=new Int32Array(count),tintR=new Uint8Array(count),tintG=new Uint8Array(count),tintB=new Uint8Array(count),tintA=new Uint8Array(count),bgTintR=new Uint8Array(count),bgTintG=new Uint8Array(count),bgTintB=new Uint8Array(count),bgTintA=new Uint8Array(count);
let bodies=[],fillPreview=[],placing=null,forceState=null,airColor=[255,255,255];
function idx(c,r){return r*cols+c}
function inBounds(c,r){return c>=0&&c<cols&&r>=0&&r<rows}
function pointToCell(x,y){return{c:Math.max(0,Math.min(cols-1,Math.floor(x/cellSize))),r:Math.max(0,Math.min(rows-1,Math.floor(y/cellSize)))}}
function wakeWaterComponentsAroundCell(){}
function wakeFlowAroundCell(){}
function nextWaterWakeToken(){return 1}
function testAssert(condition,message){if(!condition)throw new Error(message)}
testAssert(applyEditCommand({type:'paint',x:7,y:7,radius:0,material:SAND}),'paint command should apply');
testAssert(material[idx(1,1)]===SAND,'paint command wrote material');
testAssert(applyEditCommand({type:'source',x:12,y:7,radius:0,material:WATER}),'source command should apply');
testAssert(sourceMat[idx(2,1)]===WATER,'source command wrote source layer');
testAssert(applyEditCommand({type:'tint',x:7,y:7,radius:0,color:[9,8,7]}),'tint command should apply to material');
testAssert(tintR[idx(1,1)]===9&&tintG[idx(1,1)]===8&&tintB[idx(1,1)]===7&&tintA[idx(1,1)]===255,'tint command wrote particle tint');
testAssert(applyEditCommand({type:'tint',x:1,y:1,radius:0,color:[1,2,3]}),'tint command should apply to air');
testAssert(bgTintR[idx(0,0)]===1&&bgTintG[idx(0,0)]===2&&bgTintB[idx(0,0)]===3&&bgTintA[idx(0,0)]===255,'tint command wrote background tint');
testAssert(!applyEditCommand({type:'source',x:1,y:1,radius:0,material:FIXED_STONE}),'fixed stone source command should be rejected');
`;
  runIsolated('edit command regression',source);
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
  const source=sharedPrelude()+read('src/00-materials.js')+read('src/04-save-codec.js')+`
let airColor=[255,255,255];
function makeArrays(){
  count=cols*rows;
  material=new Uint8Array(count);
  sourceMat=new Uint8Array(count);
  mass=new Float32Array(count);
  vx=new Float32Array(count);
  vy=new Float32Array(count);
  flowDir=new Int8Array(count);
  restAge=new Uint8Array(count);
  stableMask=new Uint8Array(count);
  moveHistory=new Int32Array(count);
  moveFlip=new Uint8Array(count);
  horizontalDir=new Int8Array(count);
  horizontalTurns=new Uint8Array(count);
  escapeDir=new Int8Array(count);
  escapeTarget=new Int16Array(count);
  carriedBy=new Uint8Array(count);
  carriedTTL=new Uint16Array(count);
  lastMoveTick=new Int32Array(count);
  tintR=new Uint8Array(count);
  tintG=new Uint8Array(count);
  tintB=new Uint8Array(count);
  tintA=new Uint8Array(count);
  bgTintR=new Uint8Array(count);
  bgTintG=new Uint8Array(count);
  bgTintB=new Uint8Array(count);
  bgTintA=new Uint8Array(count);
}
function idx(c,r){return r*cols+c}
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
const saved={
  cols,
  rows,
  material:encodeRuns(material),
  sourceMat:encodeRuns(sourceMat),
  particleTint:encodeTintCells(),
  backgroundTint:encodeTintCells(bgTintR,bgTintG,bgTintB,bgTintA),
  airColor:[255,255,255]
};
restoreEditableArrays(saved);
testAssert(rowsContaining(FIXED_STONE).length===1,'exact restore should keep one concrete row');

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

syntaxRegression();
materialRegistryRegression();
lightingRegression();
renderColorRegression();
sourceRegression();
editCommandRegression();
movementTintRegression();
saveLoadRegression();
