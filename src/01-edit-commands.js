'use strict';

// Thin command boundary for future ports. The current browser UI still calls
// the low-level drawing functions directly, but tests and non-DOM adapters can
// start routing simple edits through this shape.

function commandRadius(command){
  return Math.max(0,Number.isFinite(command.radius)?command.radius|0:0);
}

function applyEditCommand(command){
  if(!command||typeof command.type!=='string')return false;
  const radius=commandRadius(command);
  if(command.type==='paint'){
    if(!isKnownMaterial(command.material))return false;
    stampAt(command.x,command.y,radius,command.material);
    return true;
  }
  if(command.type==='source'){
    if(!canSourceMaterial(command.material))return false;
    return stampSourceAt(command.x,command.y,radius,command.material)>0;
  }
  if(command.type==='tint'){
    if(!Array.isArray(command.color)||command.color.length<3)return false;
    stampTintAt(command.x,command.y,radius,command.color);
    return true;
  }
  return false;
}
