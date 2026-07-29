'use strict';

const fs=require('fs');
const path=require('path');

const ROOT=path.resolve(__dirname,'..');
const RUNTIME_FILES=[
  'src/00-materials.js',
  'src/00-core-state.js',
  'src/01-editing-and-bodies.js',
  'src/02-sources.js',
  'src/02-flow-and-water.js',
  'src/02-erosion.js',
  'src/04-save-load.js',
  'src/03-lighting.js',
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

function saveLoadRegression(){
  const source=sharedPrelude()+read('src/00-materials.js')+read('src/04-save-load.js')+`
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
lightingRegression();
saveLoadRegression();
