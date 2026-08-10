'use strict';

// Browser-only sync after a snapshot is restored. The storage wrapper calls
// this optional hook, while non-browser adapters can omit or replace it.

function syncCanvasAfterSnapshotLoad(){
  running=false;
  resetRuntimeClock();
  if(typeof syncButtons==='function')syncButtons();
  if(typeof syncSourceRateControls==='function')syncSourceRateControls(null);
  if(typeof syncLightingControls==='function')syncLightingControls(null);
  if(typeof updateFillPreview==='function')updateFillPreview();
  if(typeof render==='function')render();
}
