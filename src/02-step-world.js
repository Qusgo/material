'use strict';

// DOM-free simulation step wrapper. It preserves the established update order
// while letting portable adapters tick a supplied world without installing it.

function stepWorld(world=currentWorldState()){
  const target=world||currentWorldState();
  const run=()=>{
    if(typeof incrementWorldSimTick==='function')incrementWorldSimTick(target);
    else if(typeof incrementSimTickState==='function')incrementSimTickState();
    else simTick++;
    rebuildBodyMask(target);
    updateBodies(target);
    rebuildBodyMask(target);
    updateGridMaterials(target);
    rebuildBodyMask(target);
    return target;
  };
  if(target&&target.arrays){
    if(typeof withMaterialRegistryForWorld==='function')return withMaterialRegistryForWorld(target,run);
    return run();
  }
  useWorldState(target);
  run();
  return currentWorldState();
}

function simulationStep(){return stepWorld(currentWorldState())}
