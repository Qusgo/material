'use strict';

// Browser-only material menu/editor helpers. Material validation and mutation
// stay in 01-runtime-config.js; this file only translates DOM fields.

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

function getTintColor(){
  return hexToRgb(tintColorInput?tintColorInput.value:'#ef4444');
}

function renderMaterialMenu(){
  if(!materialButton)return;
  if(!MATERIAL_FROM_NAME[selected])selected=materialKeyFromId(WATER);
  const selectedMat=MATERIAL_FROM_NAME[selected]||WATER,def=materialDef(selectedMat),col=def.color;
  materialSwatchEl.style.background=`rgb(${col[0]},${col[1]},${col[2]})`;
  materialLabelEl.textContent=def.name;
  materialButton.classList.toggle('active',appContext.materialMenuOpen);
  materialMenu.classList.toggle('hidden',!appContext.materialMenuOpen);
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
    b.addEventListener('click',()=>{appContext.materialMenuOpen=false;setSelected(item.key)});
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
  materialEditor.classList.toggle('hidden',!appContext.materialEditorMode);
  materialSlopeRow.classList.toggle('hidden',appContext.materialEditorMode!==MATERIAL_KIND_GRANULAR);
  materialErosionRow.classList.toggle('hidden',appContext.materialEditorMode!==MATERIAL_KIND_GRANULAR);
  deleteMaterialBtn.classList.toggle('hidden',!appContext.materialEditorTarget);
  if(appContext.materialEditorTarget)deleteMaterialBtn.disabled=countMaterialUses(appContext.materialEditorTarget)>0;
}

function openMaterialEditor(mode){
  if(customMaterialCount>=MAX_CUSTOM_MATERIALS){
    setStatus('Custom material limit reached');
    return;
  }
  appContext.materialMenuOpen=true;
  appContext.materialEditorMode=mode;
  appContext.materialEditorTarget=0;
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
  appContext.materialMenuOpen=true;
  appContext.materialEditorMode=def.kind;
  appContext.materialEditorTarget=id;
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
  appContext.materialEditorMode=null;
  appContext.materialEditorTarget=0;
  renderMaterialMenu();
}

function saveCustomMaterial(){
  if(!appContext.materialEditorMode)return;
  const density=normalizeIntegerInput(materialDensityInput,1,98,appContext.materialEditorMode===MATERIAL_KIND_GRANULAR?2:1);
  const color=hexToRgb(materialColorInput.value);
  const name=materialNameInput.value;
  const result=applyMaterialCommand({
    type:appContext.materialEditorTarget?'update':'add',
    id:appContext.materialEditorTarget,
    kind:appContext.materialEditorMode,
    name,
    color,
    density,
    blocksLight:materialBlocksLightInput.checked,
    emissive:materialEmissiveInput.checked,
    maxSlope:normalizeIntegerInput(materialSlopeInput,0,32,1),
    erosionResistance:normalizeIntegerInput(materialErosionInput,1,999,SAND_LIKE_FLOW.erosionResistance)
  });
  if(!result.ok){
    setStatus(result.reason==='limit'?'Custom material limit reached':'Could not save material');
    return;
  }
  appContext.materialEditorMode=null;
  appContext.materialEditorTarget=0;
  appContext.materialMenuOpen=false;
  setSelected(result.def.key);
}

function deleteExistingMaterial(id){
  const def=materialDef(id);
  const result=applyMaterialCommand({type:'delete',id});
  if(!result.ok){
    if(result.reason==='in-use')setStatus(`Erase ${result.uses} cells or sources of ${def.name} before deleting`);
    else setStatus('Built-in materials are locked');
    renderMaterialMenu();
    return;
  }
  if(selected===def.key)selected=materialKeyFromId(WATER);
  appContext.materialEditorMode=null;
  appContext.materialEditorTarget=0;
  setStatus('Custom material deleted');
  renderMaterialMenu();
}
