'use strict';

// Thin command boundary for future ports. Browser input should translate user
// gestures into these small commands before touching grid/body helpers.

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

function commandLine(command){
  const line={
    from:{x:command.x1,y:command.y1},
    to:{x:command.x2,y:command.y2}
  };
  if(!Number.isFinite(line.from.x)||!Number.isFinite(line.from.y)||!Number.isFinite(line.to.x)||!Number.isFinite(line.to.y))return null;
  return line;
}

function commandCircle(command){
  const circle=command.circle||{};
  const out={x:circle.x,y:circle.y,r:circle.r};
  if(!Number.isFinite(out.x)||!Number.isFinite(out.y)||!Number.isFinite(out.r)||out.r<=0)return null;
  out.r=Math.min(Math.max(out.r,0),Math.max(viewW,viewH));
  return out;
}

function commandArrow(command){
  const arrow=command.arrow||{};
  const out={x:arrow.x,y:arrow.y};
  if(!Number.isFinite(out.x)||!Number.isFinite(out.y))return null;
  return out;
}

function commandPoint(value){
  if(!value)return null;
  const point={x:value.x,y:value.y};
  if(!Number.isFinite(point.x)||!Number.isFinite(point.y))return null;
  return point;
}

function commandBodyPlacement(command){
  if(command.kind!=='stoneCircle'&&command.kind!=='stoneRect')return null;
  const start=commandPoint(command.start),current=commandPoint(command.current);
  if(!start||!current)return null;
  return{kind:command.kind,start,current};
}

function normalizeEditCommandArgs(worldOrCommand,maybeCommand){
  if(maybeCommand!==undefined){
    useWorldState(worldOrCommand);
    return maybeCommand;
  }
  return worldOrCommand;
}

function applyEditCommand(worldOrCommand,maybeCommand){
  const command=normalizeEditCommandArgs(worldOrCommand,maybeCommand);
  if(!command||typeof command.type!=='string')return false;
  const radius=commandRadius(command);
  if(command.type==='paint'){
    if(!commandHasPoint(command))return false;
    if(!isKnownMaterial(command.material))return false;
    stampAt(command.x,command.y,radius,command.material);
    return true;
  }
  if(command.type==='paintLine'){
    const line=commandLine(command);
    if(!line||!isKnownMaterial(command.material))return false;
    drawMaterialLine(line.from,line.to,radius,command.material);
    return true;
  }
  if(command.type==='source'){
    if(!commandHasPoint(command))return false;
    if(!canSourceMaterial(command.material))return false;
    return stampSourceAt(command.x,command.y,radius,command.material)>0;
  }
  if(command.type==='sourceLine'){
    const line=commandLine(command);
    if(!line||!canSourceMaterial(command.material))return false;
    return drawSourceLine(line.from,line.to,radius,command.material)>0;
  }
  if(command.type==='tint'){
    if(!commandHasPoint(command))return false;
    const color=commandColor(command);
    if(!color)return false;
    stampTintAt(command.x,command.y,radius,color);
    return true;
  }
  if(command.type==='tintLine'){
    const line=commandLine(command),color=commandColor(command);
    if(!line||!color)return false;
    drawTintLine(line.from,line.to,radius,color);
    return true;
  }
  if(command.type==='erase'){
    if(!commandHasPoint(command))return false;
    eraseAtRadius(command.x,command.y,radius);
    return true;
  }
  if(command.type==='eraseLine'){
    const line=commandLine(command);
    if(!line)return false;
    eraseLine(line.from,line.to,radius);
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
  if(command.type==='force'){
    const circle=commandCircle(command),arrow=commandArrow(command);
    if(!circle||!arrow)return false;
    return applyForce(circle,arrow);
  }
  if(command.type==='placeBody'){
    const placement=commandBodyPlacement(command);
    if(!placement)return false;
    const body=makeBodyFromPlacement(placement,true);
    return !!(body&&addBody(body));
  }
  return false;
}
