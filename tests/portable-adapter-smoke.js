'use strict';

// Minimal non-browser adapter smoke.
// This intentionally loads only DOM-free core/facade scripts. It is a runnable
// example for WebView, mini-program, or native shells that want to drive the
// simulator without browser adapters.

const fs=require('fs');
const path=require('path');
const {PORTABLE_CORE_FILES}=require('./portable-core-files');

const ROOT=path.resolve(__dirname,'..');

function read(file){
  return fs.readFileSync(path.join(ROOT,file),'utf8');
}

const smoke=`
function smokeAssert(condition,message){
  if(!condition)throw new Error(message);
}

smokeAssert(typeof document==='undefined','portable smoke should not define document');
smokeAssert(typeof canvas==='undefined','portable smoke should not define canvas');
smokeAssert(typeof localStorage==='undefined','portable smoke should not define localStorage');

const surface={
  engine:createSimulationEngine({cols:16,rows:12,cellSize:4,install:false}),
  running:false,
  preview:null,
  storage:null
};
surface.frameBuffer=new Uint8ClampedArray(surface.engine.world.count*4);

surface.engine.edit({type:'paint',x:24,y:24,radius:1,material:WATER});
surface.engine.edit({type:'source',x:36,y:24,radius:0,material:SAND});
surface.engine.finishEdit();
smokeAssert(surface.engine.world.arrays.material.some(v=>v===WATER),'paint command did not place material');
smokeAssert(surface.engine.world.arrays.sourceMat.some(v=>v===SAND),'source command did not place source material');

surface.preview=surface.engine.computeFill({x:24,y:24});
smokeAssert(surface.preview&&surface.preview.cell&&surface.preview.cells.length>0,'computeFill did not return adapter preview data');

surface.engine.runtimeSettingsCommand({type:'sourceInterval',value:1});
surface.engine.step(3);
smokeAssert(surface.engine.world.simTick===3,'step did not advance the portable surface');

surface.engine.renderBuffer(surface.frameBuffer);
smokeAssert(surface.frameBuffer.length===surface.engine.world.count*4,'renderBuffer wrote the wrong buffer size');
smokeAssert(surface.frameBuffer.some(v=>v!==0),'renderBuffer left the frame empty');

const custom=surface.engine.materialCommand({
  type:'add',
  kind:MATERIAL_KIND_FLUID,
  name:'Smoke Fluid',
  density:3,
  color:[12,34,56]
});
smokeAssert(custom.ok&&surface.engine.world.customMaterials.some(def=>def.id===custom.def.id),'materialCommand did not store custom material on the surface world');

surface.storage=JSON.stringify(surface.engine.serialize());
surface.engine.clear();
smokeAssert(!surface.engine.world.arrays.material.some(v=>v!==EMPTY),'clear did not empty the surface');

const activeBeforeRestore=currentWorldState();
const restored=surface.engine.restore(JSON.parse(surface.storage));
smokeAssert(restored.ok,'restore rejected the portable snapshot');
smokeAssert(currentWorldState()===activeBeforeRestore,'restore should not install an install:false surface');
smokeAssert(surface.engine.world.arrays.material.some(v=>v===WATER),'restore did not recover painted material');
smokeAssert(surface.engine.world.customMaterials.some(def=>def.name==='Smoke Fluid'),'restore did not recover custom material definitions');

const resized=surface.engine.resize(12,10,{cellSize:5});
smokeAssert(resized.changed&&surface.engine.world.cols===12&&surface.engine.world.rows===10,'resize did not update the surface world');
surface.frameBuffer=new Uint8ClampedArray(surface.engine.world.count*4);
surface.engine.renderBuffer(surface.frameBuffer);
smokeAssert(surface.frameBuffer.length===surface.engine.world.count*4,'render after resize used the wrong buffer size');

return {
  cols:surface.engine.world.cols,
  rows:surface.engine.world.rows,
  frameBytes:surface.frameBuffer.length,
  savedBytes:surface.storage.length
};
`;

const result=new Function(`${PORTABLE_CORE_FILES.map(read).join('\n')}\n${smoke}`)();
console.log(`portable adapter smoke ok (${result.cols}x${result.rows}, ${result.frameBytes} rgba bytes, ${result.savedBytes} saved bytes)`);
