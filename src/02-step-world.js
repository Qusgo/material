'use strict';

// DOM-free simulation step wrapper. It preserves the established update order
// while giving non-browser adapters one function to call per physics tick.

function stepWorld(world=currentWorldState()){
  useWorldState(world);
  if(typeof incrementSimTickState==='function')incrementSimTickState();
  else simTick++;
  rebuildBodyMask();
  updateBodies();
  rebuildBodyMask();
  updateGridMaterials();
  rebuildBodyMask();
  return currentWorldState();
}

function simulationStep(){return stepWorld(currentWorldState())}
