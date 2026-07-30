'use strict';

// Thin command boundary for future ports. The current browser UI still calls
// the low-level drawing functions directly, but tests and non-DOM adapters can
// start routing simple edits through this shape.

function commandRadius(command){
  return clampInt(command.radius,0,32,0);
}

function commandColor(command){
  if(!Array.isArray(command.color)||command.color.length<3)return null;
  return[
    clampInt(command.color[0],0,255,0),
    clampInt(command.color[1],0,255,0),
    clampInt(command.color[2],0,255,0)
  ];
}

function commandHasPoint(command){
  return Number.isFinite(command.x)&&Number.isFinite(command.y);
}

function applyEditCommand(command){
  if(!command||typeof command.type!=='string')return false;
  const radius=commandRadius(command);
  if(command.type==='paint'){
    if(!commandHasPoint(command))return false;
    if(!isKnownMaterial(command.material))return false;
    stampAt(command.x,command.y,radius,command.material);
    return true;
  }
  if(command.type==='source'){
    if(!commandHasPoint(command))return false;
    if(!canSourceMaterial(command.material))return false;
    return stampSourceAt(command.x,command.y,radius,command.material)>0;
  }
  if(command.type==='tint'){
    if(!commandHasPoint(command))return false;
    const color=commandColor(command);
    if(!color)return false;
    stampTintAt(command.x,command.y,radius,color);
    return true;
  }
  if(command.type==='erase'){
    if(!commandHasPoint(command))return false;
    eraseAtRadius(command.x,command.y,radius);
    return true;
  }
  if(command.type==='fill'){
    if(!commandHasPoint(command))return false;
    if(!isKnownMaterial(command.material))return false;
    const p=pointToCell(command.x,command.y);
    return fillAtCell(p.c,p.r,command.material)>0;
  }
  if(command.type==='fillAir'){
    const color=commandColor(command);
    if(!color)return false;
    setAllAirColor(color);
    return true;
  }
  if(command.type==='clear'){
    clearSimulationState();
    return true;
  }
  return false;
}
