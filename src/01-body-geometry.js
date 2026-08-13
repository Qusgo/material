'use strict';

// Dynamic-body construction, shape tests, placement, and body-mask rasterization.

function bodyGeometryHasWorldArg(value){
  return !!(value&&typeof value==='object'&&value.arrays&&Number.isFinite(value.cols));
}

function bodyGeometryCellSizeFor(world){
  return Math.max(1,world&&world.cellSize||cellSize||1);
}

function bodyGeometryViewWFor(world){
  if(world&&Number.isFinite(world.viewW))return world.viewW;
  return world?world.cols*bodyGeometryCellSizeFor(world):viewW;
}

function bodyGeometryViewHFor(world){
  if(world&&Number.isFinite(world.viewH))return world.viewH;
  return world?world.rows*bodyGeometryCellSizeFor(world):viewH;
}

function bodyGeometryCellCenterFor(world,c,r){
  if(!world)return cellCenter(c,r);
  const size=bodyGeometryCellSizeFor(world);
  return{x:(c+.5)*size,y:(r+.5)*size};
}

function bodyGeometryIndexFor(world,c,r){
  return world?r*world.cols+c:idx(c,r);
}

function bodyGeometryNextBodyIdFor(world){
  const nextId=Math.floor(Number(world&&world.nextBodyId));
  return Number.isFinite(nextId)&&nextId>0?nextId:1;
}

function bodyGeometrySyncActiveBodyId(world){
  if(!world||typeof currentWorldState!=='function'||currentWorldState()!==world)return;
  if(typeof nextBodyId!=='undefined')nextBodyId=bodyGeometryNextBodyIdFor(world);
}

function makeBodyFromPlacement(p,commit=false){
  if(!p)return null;
  const id=commit?nextBodyId++:nextBodyId;
  if(p.kind==='stoneCircle'){
    const radius=Math.max(8,Math.hypot(p.current.x-p.start.x,p.current.y-p.start.y));
    const m=Math.max(1,Math.PI*radius*radius*.012);
    const inertia=.5*m*radius*radius;
    return{id,type:'circle',x:p.start.x,y:p.start.y,vx:0,vy:0,angle:0,av:0,radius,hw:radius,hh:radius,mass:m,invMass:1/m,inertia,invInertia:1/inertia};
  }
  const hw=Math.max(8,Math.abs(p.current.x-p.start.x)/2);
  const hh=Math.max(8,Math.abs(p.current.y-p.start.y)/2);
  const x=(p.current.x+p.start.x)/2;
  const y=(p.current.y+p.start.y)/2;
  const m=Math.max(1,hw*2*hh*2*.012);
  const inertia=m*((hw*2)**2+(hh*2)**2)/12;
  return{id,type:'rect',x,y,vx:0,vy:0,angle:0,av:0,radius:Math.hypot(hw,hh),hw,hh,mass:m,invMass:1/m,inertia,invInertia:1/inertia};
}

function makeBodyFromPlacementForWorld(world,p,commit=false){
  if(!bodyGeometryHasWorldArg(world))return makeBodyFromPlacement(p,commit);
  const body=makeBodyFromPlacement(p,false);
  if(!body)return null;
  const id=bodyGeometryNextBodyIdFor(world);
  body.id=id;
  if(commit){
    world.nextBodyId=id+1;
    bodyGeometrySyncActiveBodyId(world);
  }
  return body;
}

function bodyContainsPoint(b,x,y){
  if(b.type==='circle')return Math.hypot(x-b.x,y-b.y)<=b.radius;
  const ca=Math.cos(-b.angle),sa=Math.sin(-b.angle),dx=x-b.x,dy=y-b.y;
  const lx=dx*ca-dy*sa,ly=dx*sa+dy*ca;
  return Math.abs(lx)<=b.hw&&Math.abs(ly)<=b.hh;
}

function bodyIntersectsCircle(b,x,y,r){
  if(b.type==='circle')return Math.hypot(x-b.x,y-b.y)<=b.radius+r;
  const ca=Math.cos(-b.angle),sa=Math.sin(-b.angle),dx=x-b.x,dy=y-b.y;
  const lx=dx*ca-dy*sa,ly=dx*sa+dy*ca,cx=clamp(lx,-b.hw,b.hw),cy=clamp(ly,-b.hh,b.hh);
  return(lx-cx)**2+(ly-cy)**2<=r*r;
}

function rectCorners(b){
  const ca=Math.cos(b.angle),sa=Math.sin(b.angle),pts=[];
  for(const sx of[-1,1]){
    for(const sy of[-1,1]){
      const x=sx*b.hw,y=sy*b.hh;
      pts.push({x:b.x+x*ca-y*sa,y:b.y+x*sa+y*ca});
    }
  }
  return pts;
}

function project(pts,ax,ay){
  let min=Infinity,max=-Infinity;
  for(const p of pts){
    const v=p.x*ax+p.y*ay;
    min=Math.min(min,v);
    max=Math.max(max,v);
  }
  return{min,max};
}

function rectRectOverlap(a,b){
  const ap=rectCorners(a),bp=rectCorners(b),axes=[];
  for(const body of[a,b]){
    const ca=Math.cos(body.angle),sa=Math.sin(body.angle);
    axes.push({x:ca,y:sa},{x:-sa,y:ca});
  }
  for(const axis of axes){
    const pa=project(ap,axis.x,axis.y),pb=project(bp,axis.x,axis.y);
    if(pa.max<pb.min||pb.max<pa.min)return false;
  }
  return true;
}

function bodiesOverlap(a,b){
  const broad=a.radius+b.radius,dx=b.x-a.x,dy=b.y-a.y;
  if(dx*dx+dy*dy>broad*broad)return false;
  if(a.type==='circle'&&b.type==='circle')return Math.hypot(dx,dy)<broad;
  if(a.type==='circle'&&b.type==='rect')return bodyIntersectsCircle(b,a.x,a.y,a.radius);
  if(a.type==='rect'&&b.type==='circle')return bodyIntersectsCircle(a,b.x,b.y,b.radius);
  return rectRectOverlap(a,b);
}

function normalizeBodyWorldArg(worldOrBody,maybeBody){
  return maybeBody!==undefined?maybeBody:worldOrBody;
}

function canPlaceBody(worldOrBody,maybeBody){
  const world=maybeBody!==undefined&&bodyGeometryHasWorldArg(worldOrBody)?worldOrBody:null;
  const body=normalizeBodyWorldArg(worldOrBody,maybeBody);
  if(!body)return false;
  const targetBodies=world?world.bodies||[]:bodies;
  if(targetBodies.length>=BODY_LIMIT)return false;
  const targetViewW=bodyGeometryViewWFor(world),targetViewH=bodyGeometryViewHFor(world);
  if(body.x-body.radius<0||body.x+body.radius>targetViewW||body.y-body.radius<0||body.y+body.radius>targetViewH)return false;
  return!targetBodies.some(o=>bodiesOverlap(body,o));
}

function clearGridUnderBody(worldOrBody,maybeBody){
  const world=maybeBody!==undefined&&bodyGeometryHasWorldArg(worldOrBody)?worldOrBody:null;
  const body=normalizeBodyWorldArg(worldOrBody,maybeBody);
  if(!body)return;
  const targetCols=world?world.cols:cols,targetRows=world?world.rows:rows;
  const targetSize=bodyGeometryCellSizeFor(world);
  const minC=clamp(Math.floor((body.x-body.radius)/targetSize),0,targetCols-1);
  const maxC=clamp(Math.floor((body.x+body.radius)/targetSize),0,targetCols-1);
  const minR=clamp(Math.floor((body.y-body.radius)/targetSize),0,targetRows-1);
  const maxR=clamp(Math.floor((body.y+body.radius)/targetSize),0,targetRows-1);
  const wakeToken=world?0:nextWaterWakeToken();
  for(let r=minR;r<=maxR;r++){
    for(let c=minC;c<=maxC;c++){
      const p=bodyGeometryCellCenterFor(world,c,r);
      if(bodyContainsPoint(body,p.x,p.y)){
        if(world)clearCell(world,c,r,wakeToken);
        else clearCell(c,r,wakeToken);
      }
    }
  }
}

function addBody(worldOrBody,maybeBody){
  const world=maybeBody!==undefined&&bodyGeometryHasWorldArg(worldOrBody)?worldOrBody:null;
  const body=normalizeBodyWorldArg(worldOrBody,maybeBody);
  if(!(world?canPlaceBody(world,body):canPlaceBody(body)))return false;
  if(world)clearGridUnderBody(world,body);
  else clearGridUnderBody(body);
  if(world){
    if(!Array.isArray(world.bodies))world.bodies=[];
    world.bodies.push(body);
    world.editDirty=true;
    rebuildBodyMask(world);
    return true;
  }
  bodies.push(body);
  if(typeof setEditDirtyState==='function')setEditDirtyState(true);
  else editDirty=true;
  rebuildBodyMask();
  return true;
}

function rebuildBodyMask(world){
  const targetMask=world&&world.arrays?world.arrays.bodyMask:bodyMask;
  if(!targetMask)return;
  targetMask.fill(0);
  const targetBodies=world?world.bodies||[]:bodies;
  const targetCols=world?world.cols:cols,targetRows=world?world.rows:rows;
  const targetSize=bodyGeometryCellSizeFor(world);
  for(const b of targetBodies){
    const minC=clamp(Math.floor((b.x-b.radius)/targetSize),0,targetCols-1);
    const maxC=clamp(Math.floor((b.x+b.radius)/targetSize),0,targetCols-1);
    const minR=clamp(Math.floor((b.y-b.radius)/targetSize),0,targetRows-1);
    const maxR=clamp(Math.floor((b.y+b.radius)/targetSize),0,targetRows-1);
    for(let r=minR;r<=maxR;r++){
      for(let c=minC;c<=maxC;c++){
        const p=bodyGeometryCellCenterFor(world,c,r);
        if(bodyContainsPoint(b,p.x,p.y))targetMask[bodyGeometryIndexFor(world,c,r)]=1;
      }
    }
  }
}
