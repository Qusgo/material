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

function editCommandHasWorldArg(value){
  return !!(value&&typeof value==='object'&&value.arrays&&Number.isFinite(value.cols));
}

function editCommandPointToCell(world,x,y){
  const size=Math.max(1,world.cellSize||1);
  return{
    c:clamp(Math.floor(x/size),0,world.cols-1),
    r:clamp(Math.floor(y/size),0,world.rows-1)
  };
}

function normalizeEditCommandArgs(worldOrCommand,maybeCommand){
  if(maybeCommand!==undefined){
    return{world:worldOrCommand,command:maybeCommand};
  }
  return{world:null,command:worldOrCommand};
}

function applyEditCommand(worldOrCommand,maybeCommand){
  const args=normalizeEditCommandArgs(worldOrCommand,maybeCommand),world=args.world,command=args.command;
  if(!command||typeof command.type!=='string')return false;
  const radius=commandRadius(command);
  if(command.type==='paint'){
    if(!commandHasPoint(command))return false;
    if(!isKnownMaterial(command.material))return false;
    if(world)stampAt(world,command.x,command.y,radius,command.material);
    else stampAt(command.x,command.y,radius,command.material);
    return true;
  }
  if(command.type==='paintLine'){
    const line=commandLine(command);
    if(!line||!isKnownMaterial(command.material))return false;
    if(world)drawMaterialLine(world,line.from,line.to,radius,command.material);
    else drawMaterialLine(line.from,line.to,radius,command.material);
    return true;
  }
  if(command.type==='source'){
    if(!commandHasPoint(command))return false;
    if(!canSourceMaterial(command.material))return false;
    return world?stampSourceAt(world,command.x,command.y,radius,command.material)>0:stampSourceAt(command.x,command.y,radius,command.material)>0;
  }
  if(command.type==='sourceLine'){
    const line=commandLine(command);
    if(!line||!canSourceMaterial(command.material))return false;
    return world?drawSourceLine(world,line.from,line.to,radius,command.material)>0:drawSourceLine(line.from,line.to,radius,command.material)>0;
  }
  if(command.type==='tint'){
    if(!commandHasPoint(command))return false;
    const color=commandColor(command);
    if(!color)return false;
    if(world)stampTintAt(world,command.x,command.y,radius,color);
    else stampTintAt(command.x,command.y,radius,color);
    return true;
  }
  if(command.type==='tintLine'){
    const line=commandLine(command),color=commandColor(command);
    if(!line||!color)return false;
    if(world)drawTintLine(world,line.from,line.to,radius,color);
    else drawTintLine(line.from,line.to,radius,color);
    return true;
  }
  if(command.type==='erase'){
    if(!commandHasPoint(command))return false;
    if(world)eraseAtRadius(world,command.x,command.y,radius);
    else eraseAtRadius(command.x,command.y,radius);
    return true;
  }
  if(command.type==='eraseLine'){
    const line=commandLine(command);
    if(!line)return false;
    if(world)eraseLine(world,line.from,line.to,radius);
    else eraseLine(line.from,line.to,radius);
    return true;
  }
  if(command.type==='fill'){
    if(!commandHasPoint(command))return false;
    if(!isKnownMaterial(command.material))return false;
    const p=world?editCommandPointToCell(world,command.x,command.y):pointToCell(command.x,command.y);
    return world?fillAtCell(world,p.c,p.r,command.material)>0:fillAtCell(p.c,p.r,command.material)>0;
  }
  if(command.type==='fillAir'){
    const color=commandColor(command);
    if(!color)return false;
    if(world)setAllAirColor(world,color);
    else setAllAirColor(color);
    return true;
  }
  if(command.type==='clear'){
    if(world)clearSimulationState(world);
    else clearSimulationState();
    return true;
  }
  if(command.type==='force'){
    const circle=commandCircle(command),arrow=commandArrow(command);
    if(!circle||!arrow)return false;
    return world?applyForce(world,circle,arrow):applyForce(circle,arrow);
  }
  if(command.type==='placeBody'){
    const placement=commandBodyPlacement(command);
    if(!placement)return false;
    const body=world&&typeof makeBodyFromPlacementForWorld==='function'
      ?makeBodyFromPlacementForWorld(world,placement,true)
      :makeBodyFromPlacement(placement,true);
    return !!(body&&(world?addBody(world,body):addBody(body)));
  }
  return false;
}
