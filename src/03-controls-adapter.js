'use strict';

// Browser-only toolbar/settings bindings. Canvas pointer handling and the
// render loop live in their own browser adapter files.

function bindBrowserControls(){
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
  if(loadCanvasBtn)loadCanvasBtn.addEventListener('click',()=>{const result=loadCanvasSnapshot();setStatus(result.message);render()});
  document.getElementById('clear').addEventListener('click',()=>{running=false;applyEditCommand({type:'clear'});rebuildBodyMask();syncButtons();setStatus('Cleared');render()});
  bindBrushSizeControls();
  bindEraserSizeControls();
  bindSourceRateControls();
  bindLightingControls();
  if(tintColorInput)tintColorInput.addEventListener('input',render);
  syncLightingControls(null);
  syncButtons();
}

function bindBrushSizeControls(){
  if(!brushSizeInput||!brushSizeNumberInput)return;
  brushSizeInput.addEventListener('input',()=>{syncIntegerPair(brushSizeInput,brushSizeNumberInput,0,10,4,brushSizeInput);render()});
  brushSizeNumberInput.addEventListener('input',()=>{syncIntegerPair(brushSizeInput,brushSizeNumberInput,0,10,4,brushSizeNumberInput);render()});
  syncIntegerPair(brushSizeInput,brushSizeNumberInput,0,10,4,brushSizeInput);
}

function bindEraserSizeControls(){
  if(!eraserSizeInput||!eraserSizeNumberInput)return;
  eraserSizeInput.addEventListener('input',()=>{syncIntegerPair(eraserSizeInput,eraserSizeNumberInput,0,10,3,eraserSizeInput);render()});
  eraserSizeNumberInput.addEventListener('input',()=>{syncIntegerPair(eraserSizeInput,eraserSizeNumberInput,0,10,3,eraserSizeNumberInput);render()});
  syncIntegerPair(eraserSizeInput,eraserSizeNumberInput,0,10,3,eraserSizeInput);
}

function bindSourceRateControls(){
  if(!sourceRateInput||!sourceRateNumberInput)return;
  const syncSourceRate=source=>{syncSourceRateControls(source);render()};
  sourceRateInput.addEventListener('input',()=>syncSourceRate(sourceRateInput));
  sourceRateNumberInput.addEventListener('input',()=>syncSourceRate(sourceRateNumberInput));
  syncSourceRateControls(sourceRateInput);
}

function bindLightingControls(){
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
}

bindBrowserControls();
