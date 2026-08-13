'use strict';

// Browser-only sync after a snapshot is restored. The storage adapter calls
// this optional hook, while non-browser adapters can omit or replace it.

function syncCanvasAfterSnapshotLoad(){
  appContext.running=false;
  resetRuntimeClock();
  if(typeof clearTransientEditUiState==='function')clearTransientEditUiState(appContext);
  if(typeof syncButtons==='function')syncButtons();
  if(typeof syncSourceRateControls==='function')syncSourceRateControls(null);
  if(typeof syncLightingControls==='function')syncLightingControls(null);
  if(typeof updateBrowserFillPreview==='function')updateBrowserFillPreview(appContext.hoverPoint);
  if(typeof renderApp==='function')renderApp();
}
