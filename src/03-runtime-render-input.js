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
function simulationStep(){return stepWorld()}

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

function syncIntegerPair(rangeInput,numberInput,min,max,fallback,source){
  const input=source||rangeInput;
  const value=clampInt(input.value,min,max,fallback);
  rangeInput.value=String(value);
  numberInput.value=String(value);
  return value;
}

function syncSourceRateControls(source=sourceRateInput){
  if(!sourceRateInput||!sourceRateNumberInput)return sourceInterval;
  if(source)applyRuntimeSettingsCommand({type:'sourceInterval',value:syncIntegerPair(sourceRateInput,sourceRateNumberInput,1,60,1,source)});
  else{
    applyRuntimeSettingsCommand({type:'sourceInterval',value:sourceInterval});
    sourceRateInput.value=String(sourceInterval);
    sourceRateNumberInput.value=sourceRateInput.value;
  }
  return sourceInterval;
}

function syncLightingControls(source=null){
  if(lightingEnabledInput){
    if(source===lightingEnabledInput)applyRuntimeSettingsCommand({type:'lighting',enabled:lightingEnabledInput.checked});
    else lightingEnabledInput.checked=!!lightingEnabled;
  }
  if(lightStrengthInput&&lightStrengthNumberInput){
    const value=source===lightStrengthInput||source===lightStrengthNumberInput
      ?syncIntegerPair(lightStrengthInput,lightStrengthNumberInput,0,100,18,source)
      :clampInt(Math.round(lightStrength*100),0,100,18);
    applyRuntimeSettingsCommand({type:'lighting',lightStrength:value/100});
    lightStrengthInput.value=String(value);
    lightStrengthNumberInput.value=String(value);
  }
  if(sideLightStrengthInput&&sideLightStrengthNumberInput){
    const value=source===sideLightStrengthInput||source===sideLightStrengthNumberInput
      ?syncIntegerPair(sideLightStrengthInput,sideLightStrengthNumberInput,0,200,100,source)
      :clampInt(Math.round(sideLightStrength*100),0,200,100);
    applyRuntimeSettingsCommand({type:'lighting',sideLightStrength:value/100});
    sideLightStrengthInput.value=String(value);
    sideLightStrengthNumberInput.value=String(value);
  }
  if(shadowStrengthInput&&shadowStrengthNumberInput){
    const value=source===shadowStrengthInput||source===shadowStrengthNumberInput
      ?syncIntegerPair(shadowStrengthInput,shadowStrengthNumberInput,0,100,16,source)
      :clampInt(Math.round(shadowStrength*100),0,100,16);
    applyRuntimeSettingsCommand({type:'lighting',shadowStrength:value/100});
    shadowStrengthInput.value=String(value);
    shadowStrengthNumberInput.value=String(value);
  }
  if(source===null&&lightingEnabledInput)lightingEnabledInput.checked=lightingEnabled;
}

function frame(ts){if(!lastFrame)lastFrame=ts;const dt=Math.min(50,ts-lastFrame);lastFrame=ts;if(running){accumulator+=dt;let steps=0;while(accumulator>=SIM_STEP_MS&&steps<4){simulationStep();accumulator-=SIM_STEP_MS;steps++}}else accumulator=0;render();requestAnimationFrame(frame)}
canvas.addEventListener('pointerdown',e=>{canvas.setPointerCapture(e.pointerId);pointerDown=true;const p=canvasPoint(e);hoverPoint=p;pauseForEdit();if(tool==='brush'){if(isBodyMaterial())placing={kind:selected,start:p,current:p};else{const mat=MATERIAL_FROM_NAME[selected]||WATER;applyEditCommand({type:'paint',x:p.x,y:p.y,radius:getBrushRadius(),material:mat})}lastPoint=p}else if(tool==='source'){const mat=selectedSourceMaterial();if(mat){applyEditCommand({type:'source',x:p.x,y:p.y,radius:getBrushRadius(),material:mat});lastPoint=p}else setStatus('Source requires a flow material')}else if(tool==='color'){applyEditCommand({type:'tint',x:p.x,y:p.y,radius:getBrushRadius(),color:getTintColor()});lastPoint=p}else if(tool==='fill'){updateFillPreview();applyFill()}else if(tool==='eraser')applyEditCommand({type:'erase',x:p.x,y:p.y,radius:getEraserRadius()});else if(tool==='force'){if(!forceState||forceState.done)forceState={phase:'circle',start:p,current:p};else if(forceState.phase==='arrow')forceState.arrowEnd=p}render()});
canvas.addEventListener('pointermove',e=>{const p=canvasPoint(e);hoverPoint=p;if(tool==='fill')updateFillPreview();if(!pointerDown){render();return}if(tool==='brush'){if(placing)placing.current=p;else if(lastPoint){const mat=MATERIAL_FROM_NAME[selected]||WATER;applyEditCommand({type:'paintLine',x1:lastPoint.x,y1:lastPoint.y,x2:p.x,y2:p.y,radius:getBrushRadius(),material:mat})}lastPoint=p}else if(tool==='source'){const mat=selectedSourceMaterial();if(mat&&lastPoint)applyEditCommand({type:'sourceLine',x1:lastPoint.x,y1:lastPoint.y,x2:p.x,y2:p.y,radius:getBrushRadius(),material:mat});lastPoint=p}else if(tool==='color'){if(lastPoint)applyEditCommand({type:'tintLine',x1:lastPoint.x,y1:lastPoint.y,x2:p.x,y2:p.y,radius:getBrushRadius(),color:getTintColor()});lastPoint=p}else if(tool==='eraser')applyEditCommand({type:'erase',x:p.x,y:p.y,radius:getEraserRadius()});else if(tool==='force'&&forceState){if(forceState.phase==='circle')forceState.current=p;else if(forceState.phase==='arrow')forceState.arrowEnd=p}render()});
canvas.addEventListener('pointerup',e=>{pointerDown=false;const p=canvasPoint(e);if(placing){placing.current=p;if(applyEditCommand({type:'placeBody',kind:placing.kind,start:placing.start,current:placing.current}))setStatus('Dynamic stone placed');placing=null}if(tool==='force'&&forceState){if(forceState.phase==='circle'){const r=Math.max(12,Math.hypot(forceState.current.x-forceState.start.x,forceState.current.y-forceState.start.y));forceState={phase:'arrow',circle:{x:forceState.start.x,y:forceState.start.y,r},arrowEnd:null};setStatus('Force: now drag arrow direction and strength')}else if(forceState.phase==='arrow'&&forceState.arrowEnd){const arrow={x:forceState.arrowEnd.x-forceState.circle.x,y:forceState.arrowEnd.y-forceState.circle.y};if(applyEditCommand({type:'force',circle:forceState.circle,arrow}))setStatus('Force applied');forceState=null}}finishEditAsNewInitialState();lastPoint=null;if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);rebuildBodyMask();updateFillPreview();render()});
canvas.addEventListener('pointercancel',e=>{pointerDown=false;placing=null;lastPoint=null;finishEditAsNewInitialState();if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);render()});
canvas.addEventListener('pointerleave',()=>{hoverPoint=null;fillPreview=[];render()});
window.addEventListener('resize',resize);resize();requestAnimationFrame(frame);
