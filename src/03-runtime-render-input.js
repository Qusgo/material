'use strict';

// Dynamic-body physics, render pipeline, pointer input, and app bootstrap.

function bodyHitsFixed(b){const samples=[];if(b.type==='circle'){samples.push([0,0]);for(let k=0;k<12;k++){const a=k/12*Math.PI*2;samples.push([Math.cos(a)*b.radius,Math.sin(a)*b.radius])}}else{for(const sx of[-1,0,1])for(const sy of[-1,0,1])samples.push([sx*b.hw,sy*b.hh]);samples.push([b.hw,0],[-b.hw,0],[0,b.hh],[0,-b.hh])}const ca=Math.cos(b.angle),sa=Math.sin(b.angle);for(const [lx,ly]of samples){const x=b.x+lx*ca-ly*sa,y=b.y+lx*sa+ly*ca;if(x<0||x>=viewW||y<0||y>=viewH)return true;const p=pointToCell(x,y);if(material[idx(p.c,p.r)]===FIXED_STONE)return true}return false}
function displaceGridUnderBody(b){
  wakeFlowNearBody(b);
  const minC=clamp(Math.floor((b.x-b.radius)/cellSize),0,cols-1),maxC=clamp(Math.floor((b.x+b.radius)/cellSize),0,cols-1);
  const minR=clamp(Math.floor((b.y-b.radius)/cellSize),0,rows-1),maxR=clamp(Math.floor((b.y+b.radius)/cellSize),0,rows-1);
  const wakeToken=nextWaterWakeToken();
  for(let r=minR;r<=maxR;r++)for(let c=minC;c<=maxC;c++){
    const i=idx(c,r);
    if(material[i]===EMPTY||material[i]===FIXED_STONE)continue;
    const p=cellCenter(c,r);
    if(!bodyContainsPoint(b,p.x,p.y))continue;
    const old=material[i],oldMass=mass[i],oldVx=vx[i],oldVy=vy[i],oldFlowDir=flowDir[i],oldCarriedBy=carriedBy[i],oldCarriedTTL=carriedTTL[i],oldTintR=tintR[i],oldTintG=tintG[i],oldTintB=tintB[i],oldTintA=tintA[i];
    clearCell(c,r,wakeToken,false);
    clearParticleTint(i);
    let placed=false;
    for(let rad=1;rad<=8&&!placed;rad++)for(let dr=-rad;dr<=rad&&!placed;dr++)for(let dc=-rad;dc<=rad&&!placed;dc++){
      const nc=c+dc,nr=r+dr;
      if(!inBounds(nc,nr))continue;
      const ni=idx(nc,nr),np=cellCenter(nc,nr);
      if(bodyMask[ni]||material[ni]!==EMPTY||bodyContainsPoint(b,np.x,np.y))continue;
      wakeFlowAroundCell(nc,nr);
      material[ni]=old;
      mass[ni]=materialCarriesMass(old)?oldMass:defaultMassForMaterial(old);
      vx[ni]=oldVx;
      vy[ni]=oldVy;
      flowDir[ni]=materialUsesDirectedFlow(old)?(oldFlowDir||defaultFlowDirForMaterial(old)):defaultFlowDirForMaterial(old);
      carriedBy[ni]=materialCanBeCarried(old)?oldCarriedBy:0;
      carriedTTL[ni]=materialCanBeCarried(old)?oldCarriedTTL:0;
      tintR[ni]=oldTintR;
      tintG[ni]=oldTintG;
      tintB[ni]=oldTintB;
      tintA[ni]=oldTintA;
      clearMotionTrace(ni);
      clearRestState(ni);
      wakeFlowAroundCell(nc,nr);
      placed=true;
    }
  }
}
function resolveBodyBodyCollisions(){for(let a=0;a<bodies.length;a++)for(let b=a+1;b<bodies.length;b++){const A=bodies[a],B=bodies[b];if(!bodiesOverlap(A,B))continue;let dx=B.x-A.x,dy=B.y-A.y,d=Math.hypot(dx,dy)||1;dx/=d;dy/=d;const push=Math.min(8,(A.radius+B.radius-d)*.22+1);A.x-=dx*push;A.y-=dy*push;B.x+=dx*push;B.y+=dy*push;const avx=A.vx,avy=A.vy;A.vx=B.vx*.65;A.vy=B.vy*.65;B.vx=avx*.65;B.vy=avy*.65;A.av*=.75;B.av*=.75}}
function updateBodies(){
  // Bodies are continuous shapes. They interact with particles by rasterizing
  // into bodyMask and displacing any grid material they overlap.
  for(const b of bodies){
    const wasMoving=Math.abs(b.vx)+Math.abs(b.vy)+Math.abs(b.av)*b.radius>STABLE_SPEED;
    if(wasMoving)wakeFlowNearBody(b);
    b.vy+=GRAVITY;
    b.vx*=.992;
    b.vy*=.992;
    b.av*=.992;
    b.vx=clamp(b.vx,-MAX_BODY_SPEED,MAX_BODY_SPEED);
    b.vy=clamp(b.vy,-MAX_BODY_SPEED,MAX_BODY_SPEED);
    b.av=clamp(b.av,-MAX_ANGULAR_SPEED,MAX_ANGULAR_SPEED);
    const steps=Math.max(1,Math.ceil(Math.max(Math.abs(b.vx),Math.abs(b.vy),Math.abs(b.av)*b.radius)/(cellSize*.75)));
    for(let s=0;s<steps;s++){
      const ox=b.x,oy=b.y,oa=b.angle;
      b.x+=b.vx/steps;
      b.y+=b.vy/steps;
      b.angle+=b.av/steps;
      if(bodyHitsFixed(b)){
        b.x=ox;
        b.y=oy;
        b.angle=oa;
        b.vx*=-.18;
        b.vy*=-.18;
        b.av*=-.25;
        break;
      }
    }
    if(wasMoving||Math.abs(b.vx)+Math.abs(b.vy)+Math.abs(b.av)*b.radius>STABLE_SPEED)wakeFlowNearBody(b);
  }
  resolveBodyBodyCollisions();
  rebuildBodyMask();
  for(const b of bodies)displaceGridUnderBody(b);
  bodies=bodies.filter(b=>b.y-b.radius<viewH+160&&b.x+b.radius>-160&&b.x-b.radius<viewW+160);
}
function simulationStep(){simTick++;rebuildBodyMask();updateBodies();rebuildBodyMask();updateGridMaterials();rebuildBodyMask()}

// Rendering is separated from simulation state: the grid draws to a tiny
// offscreen canvas first, then scales up with image smoothing disabled.
function renderGrid(){
  if(!imageData||imageData.width!==cols||imageData.height!==rows)imageData=gridCtx.createImageData(cols,rows);
  const data=imageData.data;
  buildRenderBuffer(data);
  gridCtx.putImageData(imageData,0,0);
  ctx.imageSmoothingEnabled=false;
  ctx.drawImage(gridCanvas,0,0,cols,rows,0,0,cols*cellSize,rows*cellSize);
  ctx.imageSmoothingEnabled=true;
}
function debugBasinColor(id,alpha){
  const hue=(id*57)%360;
  return`hsla(${hue},86%,48%,${alpha})`;
}
function renderBasinDebug(){
  if(!debugBasins)return;
  const basins=buildWaterBasins();
  ctx.save();
  ctx.lineWidth=Math.max(1,cellSize*.35);
  ctx.font='12px Arial, sans-serif';
  ctx.textAlign='center';
  ctx.textBaseline='middle';
  for(const info of basins){
    ctx.fillStyle=debugBasinColor(info.id,.24);
    for(const i of info.cells){
      const c=i%cols,r=Math.floor(i/cols);
      ctx.fillRect(c*cellSize,r*cellSize,cellSize,cellSize);
    }
    ctx.strokeStyle=debugBasinColor(info.id,.9);
    for(const span of info.intervals){
      const x=span.left*cellSize,y=span.r*cellSize,w=(span.right-span.left+1)*cellSize;
      ctx.strokeRect(x+.5,y+.5,Math.max(1,w-1),Math.max(1,cellSize-1));
    }
    const x=(info.minC+info.maxC+1)*cellSize*.5,y=(info.topRow+info.bottomRow+1)*cellSize*.5;
    ctx.fillStyle='rgba(17,24,39,.78)';
    ctx.fillText(`#${info.id} ${info.cells.length}`,x,y);
  }
  ctx.restore();
}
function renderBodies(){for(const b of bodies){ctx.save();ctx.translate(b.x,b.y);ctx.rotate(b.angle);ctx.fillStyle='#4b4b4b';ctx.strokeStyle='#202020';ctx.lineWidth=2;if(b.type==='circle'){ctx.beginPath();ctx.arc(0,0,b.radius,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(b.radius*.82,0);ctx.strokeStyle='rgba(255,255,255,.55)';ctx.stroke()}else{ctx.beginPath();ctx.rect(-b.hw,-b.hh,b.hw*2,b.hh*2);ctx.fill();ctx.stroke();ctx.strokeStyle='rgba(255,255,255,.45)';ctx.beginPath();ctx.moveTo(-b.hw,0);ctx.lineTo(b.hw,0);ctx.moveTo(0,-b.hh);ctx.lineTo(0,b.hh);ctx.stroke()}ctx.restore()}}
function renderFillPreview(){if(!fillPreview.length)return;const col=materialColor(fillPreviewMaterial);ctx.save();ctx.fillStyle=`rgba(${col[0]},${col[1]},${col[2]},.32)`;for(const i of fillPreview){const c=i%cols,r=Math.floor(i/cols);ctx.fillRect(c*cellSize,r*cellSize,cellSize,cellSize)}ctx.restore()}
function renderPlacement(){if(!placing)return;const b=makeBodyFromPlacement(placing);if(!b)return;const ok=canPlaceBody(b);ctx.save();ctx.strokeStyle=ok?'rgba(58,58,58,.85)':'rgba(201,74,74,.9)';ctx.fillStyle=ok?'rgba(58,58,58,.22)':'rgba(201,74,74,.18)';ctx.lineWidth=2;if(b.type==='circle'){ctx.beginPath();ctx.arc(b.x,b.y,b.radius,0,Math.PI*2);ctx.fill();ctx.stroke()}else{ctx.beginPath();ctx.rect(b.x-b.hw,b.y-b.hh,b.hw*2,b.hh*2);ctx.fill();ctx.stroke()}ctx.restore()}
function drawArrow(x1,y1,x2,y2){const a=Math.atan2(y2-y1,x2-x1);ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();ctx.beginPath();ctx.moveTo(x2,y2);ctx.lineTo(x2-Math.cos(a-.55)*14,y2-Math.sin(a-.55)*14);ctx.lineTo(x2-Math.cos(a+.55)*14,y2-Math.sin(a+.55)*14);ctx.closePath();ctx.fillStyle=ctx.strokeStyle;ctx.fill()}
function renderForcePreview(){if(!forceState)return;ctx.save();ctx.strokeStyle='rgba(17,24,39,.78)';ctx.fillStyle='rgba(22,141,226,.1)';ctx.lineWidth=2;if(forceState.circle){ctx.beginPath();ctx.arc(forceState.circle.x,forceState.circle.y,forceState.circle.r,0,Math.PI*2);ctx.fill();ctx.stroke()}else if(forceState.start&&forceState.current){const r=Math.hypot(forceState.current.x-forceState.start.x,forceState.current.y-forceState.start.y);ctx.beginPath();ctx.arc(forceState.start.x,forceState.start.y,r,0,Math.PI*2);ctx.fill();ctx.stroke()}if(forceState.circle&&forceState.arrowEnd)drawArrow(forceState.circle.x,forceState.circle.y,forceState.arrowEnd.x,forceState.arrowEnd.y);ctx.restore()}
function renderEraser(){if(tool!=='eraser'||!hoverPoint)return;const rad=getEraserRadius();ctx.save();ctx.strokeStyle='rgba(201,74,74,.85)';ctx.lineWidth=2;if(rad===0){const p=pointToCell(hoverPoint.x,hoverPoint.y);ctx.strokeRect(p.c*cellSize+.5,p.r*cellSize+.5,Math.max(1,cellSize-1),Math.max(1,cellSize-1))}else{ctx.beginPath();ctx.arc(hoverPoint.x,hoverPoint.y,rad*cellSize,0,Math.PI*2);ctx.stroke()}ctx.restore()}
function render(){ctx.clearRect(0,0,viewW,viewH);ctx.fillStyle=`rgb(${airColor[0]},${airColor[1]},${airColor[2]})`;ctx.fillRect(0,0,viewW,viewH);renderGrid();if(typeof renderSources==='function')renderSources();renderBasinDebug();renderFillPreview();renderBodies();renderPlacement();renderForcePreview();renderEraser();updateStatus()}

const materialButton=document.getElementById('material-button'),materialMenu=document.getElementById('material-menu'),materialListEl=document.getElementById('material-list'),materialSwatchEl=document.getElementById('material-swatch'),materialLabelEl=document.getElementById('material-label'),materialEditor=document.getElementById('material-editor'),materialNameInput=document.getElementById('material-name'),materialColorInput=document.getElementById('material-color'),materialDensityInput=document.getElementById('material-density'),materialBlocksLightInput=document.getElementById('material-blocks-light'),materialEmissiveInput=document.getElementById('material-emissive'),materialSlopeInput=document.getElementById('material-slope'),materialSlopeRow=document.getElementById('material-slope-row'),materialErosionInput=document.getElementById('material-erosion'),materialErosionRow=document.getElementById('material-erosion-row'),addFluidBtn=document.getElementById('add-fluid'),addGranularBtn=document.getElementById('add-granular'),saveMaterialBtn=document.getElementById('save-material'),deleteMaterialBtn=document.getElementById('delete-material'),cancelMaterialBtn=document.getElementById('cancel-material'),brushSizeNumberInput=document.getElementById('brush-size-number'),eraserSizeInput=document.getElementById('eraser-size'),eraserSizeNumberInput=document.getElementById('eraser-size-number'),sourceRateInput=document.getElementById('source-rate'),sourceRateNumberInput=document.getElementById('source-rate-number'),tintColorInput=document.getElementById('tint-color'),fillAirColorBtn=document.getElementById('fill-air-color'),lightingEnabledInput=document.getElementById('lighting-enabled'),lightStrengthInput=document.getElementById('light-strength'),lightStrengthNumberInput=document.getElementById('light-strength-number'),sideLightStrengthInput=document.getElementById('side-light-strength'),sideLightStrengthNumberInput=document.getElementById('side-light-strength-number'),shadowStrengthInput=document.getElementById('shadow-strength'),shadowStrengthNumberInput=document.getElementById('shadow-strength-number'),saveCanvasBtn=document.getElementById('save-canvas'),loadCanvasBtn=document.getElementById('load-canvas');
let materialEditorTarget=0;

function rgbToHex(col){
  return `#${col.map(v=>clamp(Math.round(v),0,255).toString(16).padStart(2,'0')).join('')}`;
}

function hexToRgb(hex){
  const s=String(hex||'').replace('#','');
  if(!/^[0-9a-f]{6}$/i.test(s))return[36,168,198];
  return[Number.parseInt(s.slice(0,2),16),Number.parseInt(s.slice(2,4),16),Number.parseInt(s.slice(4,6),16)];
}

function normalizeIntegerInput(input,min,max,fallback){
  const value=clampInt(input.value,min,max,fallback);
  input.value=String(value);
  return value;
}

function countMaterialCells(mat){
  let total=0;
  for(let i=0;i<count;i++)if(material[i]===mat)total++;
  return total;
}

function countMaterialUses(mat){
  return countMaterialCells(mat)+(typeof countSourceCells==='function'?countSourceCells(mat):0);
}

function getTintColor(){
  return hexToRgb(tintColorInput?tintColorInput.value:'#ef4444');
}

function syncIntegerPair(rangeInput,numberInput,min,max,fallback,source){
  const input=source||rangeInput;
  const value=clampInt(input.value,min,max,fallback);
  rangeInput.value=String(value);
  numberInput.value=String(value);
  return value;
}

function syncSourceRateControls(source=sourceRateInput){
  if(!sourceRateInput||!sourceRateNumberInput)return sourceInterval;
  if(source)sourceInterval=syncIntegerPair(sourceRateInput,sourceRateNumberInput,1,60,1,source);
  else{
    sourceRateInput.value=String(clampInt(sourceInterval,1,60,1));
    sourceRateNumberInput.value=sourceRateInput.value;
  }
  return sourceInterval;
}

function syncLightingControls(source=null){
  if(lightingEnabledInput){
    if(source===lightingEnabledInput)lightingEnabled=!!lightingEnabledInput.checked;
    else lightingEnabledInput.checked=!!lightingEnabled;
  }
  if(lightStrengthInput&&lightStrengthNumberInput){
    const value=source===lightStrengthInput||source===lightStrengthNumberInput
      ?syncIntegerPair(lightStrengthInput,lightStrengthNumberInput,0,100,18,source)
      :clampInt(Math.round(lightStrength*100),0,100,18);
    lightStrength=value/100;
    lightStrengthInput.value=String(value);
    lightStrengthNumberInput.value=String(value);
  }
  if(sideLightStrengthInput&&sideLightStrengthNumberInput){
    const value=source===sideLightStrengthInput||source===sideLightStrengthNumberInput
      ?syncIntegerPair(sideLightStrengthInput,sideLightStrengthNumberInput,0,200,100,source)
      :clampInt(Math.round(sideLightStrength*100),0,200,100);
    sideLightStrength=value/100;
    sideLightStrengthInput.value=String(value);
    sideLightStrengthNumberInput.value=String(value);
  }
  if(shadowStrengthInput&&shadowStrengthNumberInput){
    const value=source===shadowStrengthInput||source===shadowStrengthNumberInput
      ?syncIntegerPair(shadowStrengthInput,shadowStrengthNumberInput,0,100,16,source)
      :clampInt(Math.round(shadowStrength*100),0,100,16);
    shadowStrength=value/100;
    shadowStrengthInput.value=String(value);
    shadowStrengthNumberInput.value=String(value);
  }
  if(source===null&&lightingEnabledInput)lightingEnabledInput.checked=lightingEnabled;
}

function renderMaterialMenu(){
  if(!materialButton)return;
  if(!MATERIAL_FROM_NAME[selected])selected=materialKeyFromId(WATER);
  const selectedMat=MATERIAL_FROM_NAME[selected]||WATER,def=materialDef(selectedMat),col=def.color;
  materialSwatchEl.style.background=`rgb(${col[0]},${col[1]},${col[2]})`;
  materialLabelEl.textContent=def.name;
  materialButton.classList.toggle('active',materialMenuOpen);
  materialMenu.classList.toggle('hidden',!materialMenuOpen);
  materialListEl.innerHTML='';
  for(const item of listSelectableMaterials()){
    const row=document.createElement('div');
    row.className='material-row';
    const b=document.createElement('button');
    b.type='button';
    b.className='btn material-option';
    b.dataset.material=item.key;
    const sw=document.createElement('span'),label=document.createElement('span'),itemCol=item.color;
    sw.className='swatch';
    sw.style.background=`rgb(${itemCol[0]},${itemCol[1]},${itemCol[2]})`;
    label.textContent=item.name;
    b.appendChild(sw);
    b.appendChild(label);
    b.classList.toggle('active',item.key===selected);
    b.addEventListener('click',()=>{materialMenuOpen=false;setSelected(item.key)});
    row.appendChild(b);
    if(item.custom){
      const edit=document.createElement('button'),del=document.createElement('button'),used=countMaterialUses(item.id);
      edit.type='button';
      edit.className='btn';
      edit.textContent='Edit';
      edit.addEventListener('click',()=>openExistingMaterialEditor(item.id));
      del.type='button';
      del.className='btn warn';
      del.textContent='Del';
      del.disabled=used>0;
      del.title=used>0?'Erase this material from the canvas before deleting it':'Delete this custom material';
      del.addEventListener('click',()=>deleteExistingMaterial(item.id));
      row.appendChild(edit);
      row.appendChild(del);
    }
    materialListEl.appendChild(row);
  }
  const atLimit=customMaterialCount>=MAX_CUSTOM_MATERIALS;
  addFluidBtn.disabled=atLimit;
  addGranularBtn.disabled=atLimit;
  materialEditor.classList.toggle('hidden',!materialEditorMode);
  materialSlopeRow.classList.toggle('hidden',materialEditorMode!==MATERIAL_KIND_GRANULAR);
  materialErosionRow.classList.toggle('hidden',materialEditorMode!==MATERIAL_KIND_GRANULAR);
  deleteMaterialBtn.classList.toggle('hidden',!materialEditorTarget);
  if(materialEditorTarget)deleteMaterialBtn.disabled=countMaterialUses(materialEditorTarget)>0;
}

function openMaterialEditor(mode){
  if(customMaterialCount>=MAX_CUSTOM_MATERIALS){
    setStatus('Custom material limit reached');
    return;
  }
  materialMenuOpen=true;
  materialEditorMode=mode;
  materialEditorTarget=0;
  const isGranular=mode===MATERIAL_KIND_GRANULAR;
  materialNameInput.value=isGranular?`Granular ${customGranularCount+1}`:`Fluid ${customFluidCount+1}`;
  materialColorInput.value=isGranular?'#d0a44f':'#24a8c6';
  materialDensityInput.value=isGranular?'2':'1';
  materialBlocksLightInput.checked=isGranular;
  materialEmissiveInput.checked=false;
  materialSlopeInput.value='1';
  materialErosionInput.value=String(SAND_LIKE_FLOW.erosionResistance);
  materialDensityInput.min='1';
  materialDensityInput.max='98';
  materialSlopeInput.min='0';
  materialSlopeInput.max='32';
  materialErosionInput.min='1';
  materialErosionInput.max='999';
  renderMaterialMenu();
}

function openExistingMaterialEditor(id){
  const def=materialDef(id);
  if(!def.custom){
    setStatus('Built-in materials are locked');
    return;
  }
  materialMenuOpen=true;
  materialEditorMode=def.kind;
  materialEditorTarget=id;
  materialNameInput.value=def.name;
  materialColorInput.value=rgbToHex(def.color);
  materialDensityInput.value=String(def.density);
  materialBlocksLightInput.checked=!!def.blocksLight;
  materialEmissiveInput.checked=!!def.emissive;
  materialSlopeInput.value=String(FLOW_RULES[id]&&FLOW_RULES[id].maxSlope!==undefined?FLOW_RULES[id].maxSlope:1);
  materialErosionInput.value=String(FLOW_RULES[id]&&FLOW_RULES[id].erosionResistance!==undefined?FLOW_RULES[id].erosionResistance:SAND_LIKE_FLOW.erosionResistance);
  renderMaterialMenu();
}

function closeMaterialEditor(){
  materialEditorMode=null;
  materialEditorTarget=0;
  renderMaterialMenu();
}

function saveCustomMaterial(){
  if(!materialEditorMode)return;
  const density=normalizeIntegerInput(materialDensityInput,1,98,materialEditorMode===MATERIAL_KIND_GRANULAR?2:1);
  const color=hexToRgb(materialColorInput.value);
  const name=materialNameInput.value;
  const def=materialEditorTarget
    ?updateCustomMaterial(materialEditorTarget,{name,color,density,blocksLight:materialBlocksLightInput.checked,emissive:materialEmissiveInput.checked,maxSlope:normalizeIntegerInput(materialSlopeInput,0,32,1),erosionResistance:normalizeIntegerInput(materialErosionInput,1,999,SAND_LIKE_FLOW.erosionResistance)})
    :materialEditorMode===MATERIAL_KIND_GRANULAR
    ?registerCustomGranularMaterial({name,color,density,blocksLight:materialBlocksLightInput.checked,emissive:materialEmissiveInput.checked,maxSlope:normalizeIntegerInput(materialSlopeInput,0,32,1),erosionResistance:normalizeIntegerInput(materialErosionInput,1,999,SAND_LIKE_FLOW.erosionResistance)})
    :registerCustomFluidMaterial({name,color,density,blocksLight:materialBlocksLightInput.checked,emissive:materialEmissiveInput.checked});
  if(!def){
    setStatus('Custom material limit reached');
    return;
  }
  materialEditorMode=null;
  materialEditorTarget=0;
  materialMenuOpen=false;
  setSelected(def.key);
}

function deleteExistingMaterial(id){
  const def=materialDef(id);
  if(!def.custom){
    setStatus('Built-in materials are locked');
    return;
  }
  const used=countMaterialUses(id);
  if(used>0){
    setStatus(`Erase ${used} cells or sources of ${def.name} before deleting`);
    renderMaterialMenu();
    return;
  }
  deleteCustomMaterial(id);
  if(selected===def.key)selected=materialKeyFromId(WATER);
  materialEditorMode=null;
  materialEditorTarget=0;
  setStatus('Custom material deleted');
  renderMaterialMenu();
}

function frame(ts){if(!lastFrame)lastFrame=ts;const dt=Math.min(50,ts-lastFrame);lastFrame=ts;if(running){accumulator+=dt;let steps=0;while(accumulator>=SIM_STEP_MS&&steps<4){simulationStep();accumulator-=SIM_STEP_MS;steps++}}else accumulator=0;render();requestAnimationFrame(frame)}
canvas.addEventListener('pointerdown',e=>{canvas.setPointerCapture(e.pointerId);pointerDown=true;const p=canvasPoint(e);hoverPoint=p;pauseForEdit();if(tool==='brush'){if(isBodyMaterial())placing={kind:selected,start:p,current:p};else{const mat=MATERIAL_FROM_NAME[selected]||WATER;applyEditCommand({type:'paint',x:p.x,y:p.y,radius:getBrushRadius(),material:mat})}lastPoint=p}else if(tool==='source'){const mat=selectedSourceMaterial();if(mat){applyEditCommand({type:'source',x:p.x,y:p.y,radius:getBrushRadius(),material:mat});lastPoint=p}else setStatus('Source requires a flow material')}else if(tool==='color'){applyEditCommand({type:'tint',x:p.x,y:p.y,radius:getBrushRadius(),color:getTintColor()});lastPoint=p}else if(tool==='fill'){updateFillPreview();applyFill()}else if(tool==='eraser')applyEditCommand({type:'erase',x:p.x,y:p.y,radius:getEraserRadius()});else if(tool==='force'){if(!forceState||forceState.done)forceState={phase:'circle',start:p,current:p};else if(forceState.phase==='arrow')forceState.arrowEnd=p}render()});
canvas.addEventListener('pointermove',e=>{const p=canvasPoint(e);hoverPoint=p;if(tool==='fill')updateFillPreview();if(!pointerDown){render();return}if(tool==='brush'){if(placing)placing.current=p;else if(lastPoint){const mat=MATERIAL_FROM_NAME[selected]||WATER;applyEditCommand({type:'paintLine',x1:lastPoint.x,y1:lastPoint.y,x2:p.x,y2:p.y,radius:getBrushRadius(),material:mat})}lastPoint=p}else if(tool==='source'){const mat=selectedSourceMaterial();if(mat&&lastPoint)applyEditCommand({type:'sourceLine',x1:lastPoint.x,y1:lastPoint.y,x2:p.x,y2:p.y,radius:getBrushRadius(),material:mat});lastPoint=p}else if(tool==='color'){if(lastPoint)applyEditCommand({type:'tintLine',x1:lastPoint.x,y1:lastPoint.y,x2:p.x,y2:p.y,radius:getBrushRadius(),color:getTintColor()});lastPoint=p}else if(tool==='eraser')applyEditCommand({type:'erase',x:p.x,y:p.y,radius:getEraserRadius()});else if(tool==='force'&&forceState){if(forceState.phase==='circle')forceState.current=p;else if(forceState.phase==='arrow')forceState.arrowEnd=p}render()});
canvas.addEventListener('pointerup',e=>{pointerDown=false;const p=canvasPoint(e);if(placing){placing.current=p;const b=makeBodyFromPlacement(placing,true);if(b&&addBody(b))setStatus('Dynamic stone placed');placing=null}if(tool==='force'&&forceState){if(forceState.phase==='circle'){const r=Math.max(12,Math.hypot(forceState.current.x-forceState.start.x,forceState.current.y-forceState.start.y));forceState={phase:'arrow',circle:{x:forceState.start.x,y:forceState.start.y,r},arrowEnd:null};setStatus('Force: now drag arrow direction and strength')}else if(forceState.phase==='arrow'&&forceState.arrowEnd){const arrow={x:forceState.arrowEnd.x-forceState.circle.x,y:forceState.arrowEnd.y-forceState.circle.y};if(applyEditCommand({type:'force',circle:forceState.circle,arrow}))setStatus('Force applied');forceState=null}}finishEditAsNewInitialState();lastPoint=null;if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);rebuildBodyMask();updateFillPreview();render()});
canvas.addEventListener('pointercancel',e=>{pointerDown=false;placing=null;lastPoint=null;finishEditAsNewInitialState();if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);render()});
canvas.addEventListener('pointerleave',()=>{hoverPoint=null;fillPreview=[];render()});
document.querySelectorAll('[data-tool]').forEach(b=>b.addEventListener('click',()=>setTool(b.dataset.tool)));
if(materialButton)materialButton.addEventListener('click',()=>{materialMenuOpen=!materialMenuOpen;renderMaterialMenu()});
if(addFluidBtn)addFluidBtn.addEventListener('click',()=>openMaterialEditor(MATERIAL_KIND_FLUID));
if(addGranularBtn)addGranularBtn.addEventListener('click',()=>openMaterialEditor(MATERIAL_KIND_GRANULAR));
if(cancelMaterialBtn)cancelMaterialBtn.addEventListener('click',closeMaterialEditor);
if(deleteMaterialBtn)deleteMaterialBtn.addEventListener('click',()=>{if(materialEditorTarget)deleteExistingMaterial(materialEditorTarget)});
if(saveMaterialBtn)saveMaterialBtn.addEventListener('click',saveCustomMaterial);
if(materialDensityInput)materialDensityInput.addEventListener('input',()=>normalizeIntegerInput(materialDensityInput,1,98,materialEditorMode===MATERIAL_KIND_GRANULAR?2:1));
if(materialSlopeInput)materialSlopeInput.addEventListener('input',()=>normalizeIntegerInput(materialSlopeInput,0,32,1));
if(materialErosionInput)materialErosionInput.addEventListener('input',()=>normalizeIntegerInput(materialErosionInput,1,999,SAND_LIKE_FLOW.erosionResistance));
playBtn.addEventListener('click',()=>{running=!running;setStatus(running?'Running':'Paused');syncButtons()});
document.getElementById('step').addEventListener('click',()=>{running=false;syncButtons();simulationStep();setStatus('Advanced one step');render()});
if(debugBasinsBtn)debugBasinsBtn.addEventListener('click',()=>{debugBasins=!debugBasins;syncButtons();setStatus(debugBasins?'Showing geometry basins':'Basin debug hidden');render()});
if(fillAirColorBtn)fillAirColorBtn.addEventListener('click',()=>{applyEditCommand({type:'fillAir',color:getTintColor()});setStatus('Air color filled');render()});
if(saveCanvasBtn)saveCanvasBtn.addEventListener('click',()=>{const result=saveCanvasSnapshot();setStatus(result.message);render()});
if(loadCanvasBtn)loadCanvasBtn.addEventListener('click',()=>{const result=loadCanvasSnapshot();setStatus(result.message);syncButtons();render()});
document.getElementById('clear').addEventListener('click',()=>{running=false;applyEditCommand({type:'clear'});rebuildBodyMask();syncButtons();setStatus('Cleared');render()});
if(brushSizeInput&&brushSizeNumberInput){
  brushSizeInput.addEventListener('input',()=>{syncIntegerPair(brushSizeInput,brushSizeNumberInput,0,10,4,brushSizeInput);render()});
  brushSizeNumberInput.addEventListener('input',()=>{syncIntegerPair(brushSizeInput,brushSizeNumberInput,0,10,4,brushSizeNumberInput);render()});
  syncIntegerPair(brushSizeInput,brushSizeNumberInput,0,10,4,brushSizeInput);
}
if(eraserSizeInput&&eraserSizeNumberInput){
  eraserSizeInput.addEventListener('input',()=>{syncIntegerPair(eraserSizeInput,eraserSizeNumberInput,0,10,3,eraserSizeInput);render()});
  eraserSizeNumberInput.addEventListener('input',()=>{syncIntegerPair(eraserSizeInput,eraserSizeNumberInput,0,10,3,eraserSizeNumberInput);render()});
  syncIntegerPair(eraserSizeInput,eraserSizeNumberInput,0,10,3,eraserSizeInput);
}
if(sourceRateInput&&sourceRateNumberInput){
  const syncSourceRate=source=>{syncSourceRateControls(source);render()};
  sourceRateInput.addEventListener('input',()=>syncSourceRate(sourceRateInput));
  sourceRateNumberInput.addEventListener('input',()=>syncSourceRate(sourceRateNumberInput));
  syncSourceRateControls(sourceRateInput);
}
if(lightingEnabledInput)lightingEnabledInput.addEventListener('input',()=>{syncLightingControls(lightingEnabledInput);render()});
if(lightStrengthInput&&lightStrengthNumberInput){
  lightStrengthInput.addEventListener('input',()=>{syncLightingControls(lightStrengthInput);render()});
  lightStrengthNumberInput.addEventListener('input',()=>{syncLightingControls(lightStrengthNumberInput);render()});
}
if(sideLightStrengthInput&&sideLightStrengthNumberInput){
  sideLightStrengthInput.addEventListener('input',()=>{syncLightingControls(sideLightStrengthInput);render()});
  sideLightStrengthNumberInput.addEventListener('input',()=>{syncLightingControls(sideLightStrengthNumberInput);render()});
}
if(shadowStrengthInput&&shadowStrengthNumberInput){
  shadowStrengthInput.addEventListener('input',()=>{syncLightingControls(shadowStrengthInput);render()});
  shadowStrengthNumberInput.addEventListener('input',()=>{syncLightingControls(shadowStrengthNumberInput);render()});
}
syncLightingControls(null);
if(tintColorInput)tintColorInput.addEventListener('input',render);
window.addEventListener('resize',resize);resize();syncButtons();requestAnimationFrame(frame);
