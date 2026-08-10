'use strict';

// Browser-only resize and animation-loop bootstrap.

function resetRuntimeClock(){
  appContext.lastFrame=0;
  appContext.accumulator=0;
}

function frame(ts){
  if(!appContext.lastFrame)appContext.lastFrame=ts;
  const dt=Math.min(50,ts-appContext.lastFrame);
  appContext.lastFrame=ts;
  if(appContext.running){
    appContext.accumulator+=dt;
    let steps=0;
    while(appContext.accumulator>=SIM_STEP_MS&&steps<4){
      simulationStep();
      appContext.accumulator-=SIM_STEP_MS;
      steps++;
    }
  }else appContext.accumulator=0;
  render();
  requestAnimationFrame(frame);
}

function startBrowserRuntime(){
  window.addEventListener('resize',resize);
  resize();
  requestAnimationFrame(frame);
}

startBrowserRuntime();
