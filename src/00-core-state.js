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
installWorldState(createWorldState(cols,rows,{cellSize}));
let gridCanvas=document.createElement('canvas'),gridCtx=gridCanvas.getContext('2d'),imageData=null;
let bodies=[],nextBodyId=1,tool='brush',selected='water',running=false,debugBasins=false,materialMenuOpen=false,materialEditorMode=null,pointerDown=false,lastPoint=null,hoverPoint=null,fillPreview=[],fillPreviewMaterial=EMPTY,placing=null,forceState=null,lastFrame=0,accumulator=0,simTick=0,editDirty=false;
let sourceInterval=1;
let airColor=[255,255,255];
let lightingEnabled=true,lightStrength=.18,sideLightStrength=1,shadowStrength=.16;
let statusText='Brush: paint material directly';
function idx(c,r){return r*cols+c} function inBounds(c,r){return c>=0&&c<cols&&r>=0&&r<rows} function clamp(v,a,b){return Math.max(a,Math.min(b,v))} function randDir(){return Math.random()<.5?-1:1}
function pointToCell(x,y){return{c:clamp(Math.floor(x/cellSize),0,cols-1),r:clamp(Math.floor(y/cellSize),0,rows-1)}} function cellCenter(c,r){return{x:(c+.5)*cellSize,y:(r+.5)*cellSize}}
function setStatus(t){statusText=t;updateStatus()} function isBodyMaterial(){return false}
