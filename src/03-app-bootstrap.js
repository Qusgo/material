'use strict';

// Browser-only resize and animation-loop bootstrap.

let lastFrame=0,accumulator=0;

function resetRuntimeClock(){
  lastFrame=0;
  accumulator=0;
}

function frame(ts){
  if(!lastFrame)lastFrame=ts;
  const dt=Math.min(50,ts-lastFrame);
  lastFrame=ts;
  if(running){
    accumulator+=dt;
    let steps=0;
    while(accumulator>=SIM_STEP_MS&&steps<4){
      simulationStep();
      accumulator-=SIM_STEP_MS;
      steps++;
    }
  }else accumulator=0;
  render();
  requestAnimationFrame(frame);
}

function startBrowserRuntime(){
  window.addEventListener('resize',resize);
  resize();
  requestAnimationFrame(frame);
}

startBrowserRuntime();
