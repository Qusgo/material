'use strict';

// DOM handles, constants, mutable simulation state, resize, and top-level UI state helpers.

// These files are loaded as ordered classic scripts, not ES modules. Top-level
// bindings are intentionally shared by later files in the same page.
const canvas=document.getElementById('canvas'),ctx=canvas.getContext('2d',{alpha:false});
const statusEl=document.getElementById('status'),playBtn=document.getElementById('play'),debugBasinsBtn=document.getElementById('debug-basins'),brushSizeInput=document.getElementById('brush-size');
const BODY_LIMIT=64,GRAVITY=.24,MAX_BODY_SPEED=7,MAX_ANGULAR_SPEED=.18,CELL_MAX_COLS=220,CELL_MAX_ROWS=360,MAX_FILL_CELLS=28000,WATER_SETTLE_INTERVAL=1;
const SIM_STEP_MS=14;
const WATER_RESIDUE_MAX_FRACTION=.025,WATER_RESIDUE_MAX_CELLS=96;
const STABLE_SPEED=.18,WAKE_RADIUS=3;
let viewW=1,viewH=1,dpr=1,cellSize=5,cols=1,rows=1,count=1;
// Hot grid state. Keep these as typed arrays; most simulation code assumes
// index = row * cols + col and mutates these arrays directly.
let material=new Uint8Array(count),mass=new Float32Array(count),vx=new Float32Array(count),vy=new Float32Array(count),bodyMask=new Uint8Array(count),flowDir=new Int8Array(count);
let restAge=new Uint8Array(count),stableMask=new Uint8Array(count),tintR=new Uint8Array(count),tintG=new Uint8Array(count),tintB=new Uint8Array(count),tintA=new Uint8Array(count),bgTintR=new Uint8Array(count),bgTintG=new Uint8Array(count),bgTintB=new Uint8Array(count),bgTintA=new Uint8Array(count),sourceMat=new Uint8Array(count);
let lightMask=new Uint8Array(count);
let gridCanvas=document.createElement('canvas'),gridCtx=gridCanvas.getContext('2d'),imageData=null;
let bodies=[],nextBodyId=1,tool='brush',selected='water',running=false,debugBasins=false,materialMenuOpen=false,materialEditorMode=null,pointerDown=false,lastPoint=null,hoverPoint=null,fillPreview=[],fillPreviewMaterial=EMPTY,placing=null,forceState=null,lastFrame=0,accumulator=0,simTick=0,editDirty=false;
let sourceInterval=1;
let airColor=[255,255,255];
let lightingEnabled=true,lightStrength=.18,sideLightStrength=1,shadowStrength=.16;
let moveHistory=new Int32Array(count),moveFlip=new Uint8Array(count),horizontalDir=new Int8Array(count),horizontalTurns=new Uint8Array(count),escapeDir=new Int8Array(count),escapeTarget=new Int16Array(count);moveHistory.fill(-1);escapeTarget.fill(-1);
let carriedBy=new Uint8Array(count),carriedTTL=new Uint16Array(count),lastMoveTick=new Int32Array(count);
// Scratch buffers for water component/basin passes. They are reused every frame
// to avoid allocations on mobile-sized devices.
let waterSeen=new Uint8Array(count),waterSpaceMark=new Uint16Array(count),waterComponentMark=new Uint16Array(count),waterBasinMark=new Uint16Array(count),waterSleepBlockMark=new Uint8Array(count),waterTargetMark=new Uint16Array(count),waterWakeMark=new Uint16Array(count),waterQueue=new Int32Array(count),waterSpaceToken=1,waterComponentToken=1,waterBasinToken=1,waterTargetToken=1,waterWakeToken=1,rowCounts=new Uint16Array(rows);
let statusText='Brush: paint material directly';
function idx(c,r){return r*cols+c} function inBounds(c,r){return c>=0&&c<cols&&r>=0&&r<rows} function clamp(v,a,b){return Math.max(a,Math.min(b,v))} function randDir(){return Math.random()<.5?-1:1}
function pointToCell(x,y){return{c:clamp(Math.floor(x/cellSize),0,cols-1),r:clamp(Math.floor(y/cellSize),0,rows-1)}} function cellCenter(c,r){return{x:(c+.5)*cellSize,y:(r+.5)*cellSize}}
function setStatus(t){statusText=t;updateStatus()} function isBodyMaterial(){return false}
function countVisibleMaterials(){
  const counts={flow:0,stone:0,sources:0,waterMass:0,byId:{}};
  for(let i=0;i<count;i++){
    if(isKnownMaterial(sourceMat[i])&&isFlowMaterial(sourceMat[i]))counts.sources++;
    const mat=material[i];
    if(mat===EMPTY)continue;
    if(!isKnownMaterial(mat))continue;
    counts.byId[mat]=(counts.byId[mat]||0)+1;
    if(isFlowMaterial(mat))counts.flow++;
    if(isSolidMaterial(mat))counts.stone++;
    if(materialCarriesMass(mat))counts.waterMass+=mass[i];
  }
  return counts;
}
function updateStatus(){
  const c=countVisibleMaterials();
  statusEl.textContent=`${statusText} | Flow ${c.flow} Stone ${c.stone} Source ${c.sources}`;
}
function resize(){
  // Resizing changes the cell size and reallocates all hot arrays. Existing
  // material is resampled by canvas position rather than copied by raw index.
  const rect=canvas.getBoundingClientRect(),nextW=Math.max(320,Math.floor(rect.width)),nextH=Math.max(240,Math.floor(rect.height)); dpr=Math.max(1,Math.min(2,window.devicePixelRatio||1));
  const newCell=Math.max(4,Math.ceil(Math.max(nextW/CELL_MAX_COLS,nextH/CELL_MAX_ROWS))),newCols=Math.max(1,Math.floor(nextW/newCell)),newRows=Math.max(1,Math.floor(nextH/newCell));
  canvas.width=Math.floor(nextW*dpr); canvas.height=Math.floor(nextH*dpr); ctx.setTransform(dpr,0,0,dpr,0,0); viewW=nextW; viewH=nextH;
  if(newCell===cellSize&&newCols===cols&&newRows===rows){render();return}
  const oldCols=cols,oldRows=rows,oldCell=cellSize,oldMat=material,oldMass=mass,oldVx=vx,oldVy=vy,oldFlowDir=flowDir,oldTintR=tintR,oldTintG=tintG,oldTintB=tintB,oldTintA=tintA,oldBgTintR=bgTintR,oldBgTintG=bgTintG,oldBgTintB=bgTintB,oldBgTintA=bgTintA,oldSourceMat=sourceMat;
  cellSize=newCell; cols=newCols; rows=newRows; count=cols*rows; material=new Uint8Array(count); mass=new Float32Array(count); vx=new Float32Array(count); vy=new Float32Array(count); bodyMask=new Uint8Array(count); flowDir=new Int8Array(count); restAge=new Uint8Array(count); stableMask=new Uint8Array(count); tintR=new Uint8Array(count); tintG=new Uint8Array(count); tintB=new Uint8Array(count); tintA=new Uint8Array(count); bgTintR=new Uint8Array(count); bgTintG=new Uint8Array(count); bgTintB=new Uint8Array(count); bgTintA=new Uint8Array(count); sourceMat=new Uint8Array(count); lightMask=new Uint8Array(count);
  moveHistory=new Int32Array(count); moveHistory.fill(-1); moveFlip=new Uint8Array(count); horizontalDir=new Int8Array(count); horizontalTurns=new Uint8Array(count); escapeDir=new Int8Array(count); escapeTarget=new Int16Array(count); escapeTarget.fill(-1);
  carriedBy=new Uint8Array(count); carriedTTL=new Uint16Array(count); lastMoveTick=new Int32Array(count);
  waterSeen=new Uint8Array(count); waterSpaceMark=new Uint16Array(count); waterComponentMark=new Uint16Array(count); waterBasinMark=new Uint16Array(count); waterSleepBlockMark=new Uint8Array(count); waterTargetMark=new Uint16Array(count); waterWakeMark=new Uint16Array(count); waterQueue=new Int32Array(count); waterSpaceToken=1; waterComponentToken=1; waterBasinToken=1; waterTargetToken=1; waterWakeToken=1; rowCounts=new Uint16Array(rows);
  gridCanvas.width=cols; gridCanvas.height=rows; imageData=gridCtx.createImageData(cols,rows);
  if(oldMat&&oldMat.length){for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){const x=(c+.5)*cellSize,y=(r+.5)*cellSize,oc=clamp(Math.floor(x/oldCell),0,oldCols-1),or=clamp(Math.floor(y/oldCell),0,oldRows-1),oi=or*oldCols+oc,ni=idx(c,r),mat=isKnownMaterial(oldMat[oi])?oldMat[oi]:EMPTY,src=isKnownMaterial(oldSourceMat[oi])?oldSourceMat[oi]:EMPTY;material[ni]=mat;mass[ni]=materialCarriesMass(mat)?oldMass[oi]:defaultMassForMaterial(mat);vx[ni]=oldVx[oi]||0;vy[ni]=oldVy[oi]||0;flowDir[ni]=materialUsesDirectedFlow(mat)?(oldFlowDir[oi]||defaultFlowDirForMaterial(mat)):defaultFlowDirForMaterial(mat);tintR[ni]=oldTintR[oi]||0;tintG[ni]=oldTintG[oi]||0;tintB[ni]=oldTintB[oi]||0;tintA[ni]=oldTintA[oi]||0;bgTintR[ni]=oldBgTintR[oi]||0;bgTintG[ni]=oldBgTintG[oi]||0;bgTintB[ni]=oldBgTintB[oi]||0;bgTintA[ni]=oldBgTintA[oi]||0;sourceMat[ni]=isFlowMaterial(src)?src:EMPTY}}
  rebuildBodyMask(); render();
}
function canvasPoint(e){const r=canvas.getBoundingClientRect();return{x:clamp(e.clientX-r.left,0,viewW),y:clamp(e.clientY-r.top,0,viewH)}}
function syncButtons(){document.querySelectorAll('[data-tool]').forEach(b=>b.classList.toggle('active',b.dataset.tool===tool));document.querySelectorAll('[data-material]').forEach(b=>b.classList.toggle('active',b.dataset.material===selected));playBtn.textContent=running?'Pause':'Play';if(debugBasinsBtn){debugBasinsBtn.classList.toggle('active',debugBasins);debugBasinsBtn.textContent=debugBasins?'Basins On':'Basins'}if(typeof renderMaterialMenu==='function')renderMaterialMenu()}
function setTool(t){tool=t;fillPreview=[];placing=null;forceState=null;if(tool==='eraser'){running=false;setStatus('Erase: time paused; removes material, tint, and source')}else if(tool==='fill'){running=false;setStatus('Fill: replace one connected region')}else if(tool==='force'){running=false;setStatus('Force: draw an area circle, then an arrow')}else if(tool==='color'){setStatus('Color: tint cells without changing material')}else if(tool==='source'){setStatus('Source: paint an infinite flow-material generator')}else setStatus('Brush: paint material directly');syncButtons();updateFillPreview();render()}
function setSelected(s){selected=s;fillPreview=[];const mat=MATERIAL_FROM_NAME[selected]||WATER;setStatus(isSolidMaterial(mat)?'Stone: fixed stone is drawn':'Material changed');syncButtons();updateFillPreview();render()}
function pauseForEdit(){if(running){running=false;accumulator=0;syncButtons()}}
