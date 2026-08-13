'use strict';

// Browser-only toolbar/settings bindings. Canvas pointer handling and the
// render loop live in their own browser adapter files.

function bindBrowserControls(){
  document.querySelectorAll('[data-tool]').forEach(b=>b.addEventListener('click',()=>setTool(b.dataset.tool)));
  if(materialButton)materialButton.addEventListener('click',()=>{appContext.materialMenuOpen=!appContext.materialMenuOpen;renderMaterialMenu()});
  if(addFluidBtn)addFluidBtn.addEventListener('click',()=>openMaterialEditor(MATERIAL_KIND_FLUID));
  if(addGranularBtn)addGranularBtn.addEventListener('click',()=>openMaterialEditor(MATERIAL_KIND_GRANULAR));
  if(cancelMaterialBtn)cancelMaterialBtn.addEventListener('click',closeMaterialEditor);
  if(deleteMaterialBtn)deleteMaterialBtn.addEventListener('click',()=>{if(appContext.materialEditorTarget)deleteExistingMaterial(appContext.materialEditorTarget)});
  if(saveMaterialBtn)saveMaterialBtn.addEventListener('click',saveCustomMaterial);
  if(materialDensityInput)materialDensityInput.addEventListener('input',()=>normalizeIntegerInput(materialDensityInput,1,98,appContext.materialEditorMode===MATERIAL_KIND_GRANULAR?2:1));
  if(materialSlopeInput)materialSlopeInput.addEventListener('input',()=>normalizeIntegerInput(materialSlopeInput,0,32,1));
  if(materialErosionInput)materialErosionInput.addEventListener('input',()=>normalizeIntegerInput(materialErosionInput,1,999,SAND_LIKE_FLOW.erosionResistance));
  playBtn.addEventListener('click',()=>{appContext.running=!appContext.running;setStatus(appContext.running?'Running':'Paused');syncButtons()});
  document.getElementById('step').addEventListener('click',()=>{appContext.running=false;syncButtons();stepAppWorld();setStatus('Advanced one step');renderApp()});
  if(debugBasinsBtn)debugBasinsBtn.addEventListener('click',()=>{appContext.debugBasins=!appContext.debugBasins;syncButtons();setStatus(appContext.debugBasins?'Showing geometry basins':'Basin debug hidden');renderApp()});
  if(fillAirColorBtn)fillAirColorBtn.addEventListener('click',()=>{applyAppEditCommand({type:'fillAir',color:getTintColor()});setStatus('Air color filled');renderApp()});
  if(saveCanvasBtn)saveCanvasBtn.addEventListener('click',()=>{const result=saveCanvasSnapshot();setStatus(result.message);renderApp()});
  if(loadCanvasBtn)loadCanvasBtn.addEventListener('click',()=>{const result=loadCanvasSnapshot();setStatus(result.message);renderApp()});
  document.getElementById('clear').addEventListener('click',()=>{appContext.running=false;applyAppEditCommand({type:'clear'});if(typeof clearTransientEditUiState==='function')clearTransientEditUiState(appContext);rebuildAppBodyMask(appContext);syncButtons();setStatus('Cleared');renderApp()});
  bindBrushSizeControls();
  bindEraserSizeControls();
  bindSourceRateControls();
  bindLightingControls();
  if(tintColorInput)tintColorInput.addEventListener('input',renderApp);
  syncLightingControls(null);
  syncButtons();
}

function bindBrushSizeControls(){
  if(!brushSizeInput||!brushSizeNumberInput)return;
  brushSizeInput.addEventListener('input',()=>{syncIntegerPair(brushSizeInput,brushSizeNumberInput,0,10,4,brushSizeInput);renderApp()});
  brushSizeNumberInput.addEventListener('input',()=>{syncIntegerPair(brushSizeInput,brushSizeNumberInput,0,10,4,brushSizeNumberInput);renderApp()});
  syncIntegerPair(brushSizeInput,brushSizeNumberInput,0,10,4,brushSizeInput);
}

function bindEraserSizeControls(){
  if(!eraserSizeInput||!eraserSizeNumberInput)return;
  eraserSizeInput.addEventListener('input',()=>{syncIntegerPair(eraserSizeInput,eraserSizeNumberInput,0,10,3,eraserSizeInput);renderApp()});
  eraserSizeNumberInput.addEventListener('input',()=>{syncIntegerPair(eraserSizeInput,eraserSizeNumberInput,0,10,3,eraserSizeNumberInput);renderApp()});
  syncIntegerPair(eraserSizeInput,eraserSizeNumberInput,0,10,3,eraserSizeInput);
}

function bindSourceRateControls(){
  if(!sourceRateInput||!sourceRateNumberInput)return;
  const syncSourceRate=source=>{syncSourceRateControls(source);renderApp()};
  sourceRateInput.addEventListener('input',()=>syncSourceRate(sourceRateInput));
  sourceRateNumberInput.addEventListener('input',()=>syncSourceRate(sourceRateNumberInput));
  syncSourceRateControls(sourceRateInput);
}

function bindLightingControls(){
  if(lightingEnabledInput)lightingEnabledInput.addEventListener('input',()=>{syncLightingControls(lightingEnabledInput);renderApp()});
  if(lightStrengthInput&&lightStrengthNumberInput){
    lightStrengthInput.addEventListener('input',()=>{syncLightingControls(lightStrengthInput);renderApp()});
    lightStrengthNumberInput.addEventListener('input',()=>{syncLightingControls(lightStrengthNumberInput);renderApp()});
  }
  if(sideLightStrengthInput&&sideLightStrengthNumberInput){
    sideLightStrengthInput.addEventListener('input',()=>{syncLightingControls(sideLightStrengthInput);renderApp()});
    sideLightStrengthNumberInput.addEventListener('input',()=>{syncLightingControls(sideLightStrengthNumberInput);renderApp()});
  }
  if(shadowStrengthInput&&shadowStrengthNumberInput){
    shadowStrengthInput.addEventListener('input',()=>{syncLightingControls(shadowStrengthInput);renderApp()});
    shadowStrengthNumberInput.addEventListener('input',()=>{syncLightingControls(shadowStrengthNumberInput);renderApp()});
  }
}

bindBrowserControls();
