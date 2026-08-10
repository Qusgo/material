'use strict';

// Browser-only form value synchronization for source-rate and lighting controls.

function syncIntegerPair(rangeInput,numberInput,min,max,fallback,source){
  const input=source||rangeInput;
  const value=clampInt(input.value,min,max,fallback);
  rangeInput.value=String(value);
  numberInput.value=String(value);
  return value;
}

function syncSourceRateControls(source=sourceRateInput){
  const settings=currentAppRuntimeSettings();
  if(!sourceRateInput||!sourceRateNumberInput)return settings.sourceInterval;
  if(source)applyAppRuntimeSettingsCommand({type:'sourceInterval',value:syncIntegerPair(sourceRateInput,sourceRateNumberInput,1,60,1,source)});
  else{
    applyAppRuntimeSettingsCommand({type:'sourceInterval',value:settings.sourceInterval});
    sourceRateInput.value=String(settings.sourceInterval);
    sourceRateNumberInput.value=sourceRateInput.value;
  }
  return currentAppRuntimeSettings().sourceInterval;
}

function syncLightingControls(source=null){
  const settings=currentAppRuntimeSettings();
  if(lightingEnabledInput){
    if(source===lightingEnabledInput)applyAppRuntimeSettingsCommand({type:'lighting',enabled:lightingEnabledInput.checked});
    else lightingEnabledInput.checked=!!settings.lightingEnabled;
  }
  if(lightStrengthInput&&lightStrengthNumberInput){
    const value=source===lightStrengthInput||source===lightStrengthNumberInput
      ?syncIntegerPair(lightStrengthInput,lightStrengthNumberInput,0,100,18,source)
      :clampInt(Math.round(settings.lightStrength*100),0,100,18);
    applyAppRuntimeSettingsCommand({type:'lighting',lightStrength:value/100});
    lightStrengthInput.value=String(value);
    lightStrengthNumberInput.value=String(value);
  }
  if(sideLightStrengthInput&&sideLightStrengthNumberInput){
    const value=source===sideLightStrengthInput||source===sideLightStrengthNumberInput
      ?syncIntegerPair(sideLightStrengthInput,sideLightStrengthNumberInput,0,200,100,source)
      :clampInt(Math.round(settings.sideLightStrength*100),0,200,100);
    applyAppRuntimeSettingsCommand({type:'lighting',sideLightStrength:value/100});
    sideLightStrengthInput.value=String(value);
    sideLightStrengthNumberInput.value=String(value);
  }
  if(shadowStrengthInput&&shadowStrengthNumberInput){
    const value=source===shadowStrengthInput||source===shadowStrengthNumberInput
      ?syncIntegerPair(shadowStrengthInput,shadowStrengthNumberInput,0,100,16,source)
      :clampInt(Math.round(settings.shadowStrength*100),0,100,16);
    applyAppRuntimeSettingsCommand({type:'lighting',shadowStrength:value/100});
    shadowStrengthInput.value=String(value);
    shadowStrengthNumberInput.value=String(value);
  }
  if(source===null&&lightingEnabledInput)lightingEnabledInput.checked=currentAppRuntimeSettings().lightingEnabled;
}
