'use strict';

// Dynamic-body physics and grid displacement for non-fixed stone bodies.

function normalizeBodyRuntimeWorldArg(worldOrBody,maybeBody){
  if(maybeBody!==undefined){
    if(worldOrBody&&typeof useWorldState==='function')useWorldState(worldOrBody);
    return maybeBody;
  }
  return worldOrBody;
}
function bodyHitsFixed(worldOrBody,maybeBody){
  const b=normalizeBodyRuntimeWorldArg(worldOrBody,maybeBody);
  const samples=[];
  if(b.type==='circle'){
    samples.push([0,0]);
    for(let k=0;k<12;k++){
      const a=k/12*Math.PI*2;
      samples.push([Math.cos(a)*b.radius,Math.sin(a)*b.radius]);
    }
  }else{
    for(const sx of[-1,0,1])for(const sy of[-1,0,1])samples.push([sx*b.hw,sy*b.hh]);
    samples.push([b.hw,0],[-b.hw,0],[0,b.hh],[0,-b.hh]);
  }
  const ca=Math.cos(b.angle),sa=Math.sin(b.angle);
  for(const [lx,ly]of samples){
    const x=b.x+lx*ca-ly*sa,y=b.y+lx*sa+ly*ca;
    if(x<0||x>=viewW||y<0||y>=viewH)return true;
    const p=pointToCell(x,y);
    if(material[idx(p.c,p.r)]===FIXED_STONE)return true;
  }
  return false;
}
function displaceGridUnderBody(worldOrBody,maybeBody){
  const b=normalizeBodyRuntimeWorldArg(worldOrBody,maybeBody);
  wakeFlowNearBody(b);
  const minC=clamp(Math.floor((b.x-b.radius)/cellSize),0,cols-1),maxC=clamp(Math.floor((b.x+b.radius)/cellSize),0,cols-1);
  const minR=clamp(Math.floor((b.y-b.radius)/cellSize),0,rows-1),maxR=clamp(Math.floor((b.y+b.radius)/cellSize),0,rows-1);
  const wakeToken=nextWaterWakeToken();
  for(let r=minR;r<=maxR;r++)for(let c=minC;c<=maxC;c++){
    const i=idx(c,r);
    if(material[i]===EMPTY||material[i]===FIXED_STONE)continue;
    const p=cellCenter(c,r);
    if(!bodyContainsPoint(b,p.x,p.y))continue;
    const old=material[i],oldMass=mass[i],oldVx=vx[i],oldVy=vy[i],oldFlowDir=flowDir[i],oldCarriedBy=carriedBy[i],oldCarriedTTL=carriedTTL[i],oldTintR=tintR[i],oldTintG=tintG[i],oldTintB=tintB[i],oldTintA=tintA[i];
    clearCell(c,r,wakeToken,false);
    clearParticleTint(i);
    let placed=false;
    for(let rad=1;rad<=8&&!placed;rad++)for(let dr=-rad;dr<=rad&&!placed;dr++)for(let dc=-rad;dc<=rad&&!placed;dc++){
      const nc=c+dc,nr=r+dr;
      if(!inBounds(nc,nr))continue;
      const ni=idx(nc,nr),np=cellCenter(nc,nr);
      if(bodyMask[ni]||material[ni]!==EMPTY||bodyContainsPoint(b,np.x,np.y))continue;
      wakeFlowAroundCell(nc,nr);
      material[ni]=old;
      mass[ni]=materialCarriesMass(old)?oldMass:defaultMassForMaterial(old);
      vx[ni]=oldVx;
      vy[ni]=oldVy;
      flowDir[ni]=materialUsesDirectedFlow(old)?(oldFlowDir||defaultFlowDirForMaterial(old)):defaultFlowDirForMaterial(old);
      carriedBy[ni]=materialCanBeCarried(old)?oldCarriedBy:0;
      carriedTTL[ni]=materialCanBeCarried(old)?oldCarriedTTL:0;
      tintR[ni]=oldTintR;
      tintG[ni]=oldTintG;
      tintB[ni]=oldTintB;
      tintA[ni]=oldTintA;
      clearMotionTrace(ni);
      clearRestState(ni);
      wakeFlowAroundCell(nc,nr);
      placed=true;
    }
  }
}
function resolveBodyBodyCollisions(world){
  if(world&&typeof useWorldState==='function')useWorldState(world);
  for(let a=0;a<bodies.length;a++)for(let b=a+1;b<bodies.length;b++){
    const A=bodies[a],B=bodies[b];
    if(!bodiesOverlap(A,B))continue;
    let dx=B.x-A.x,dy=B.y-A.y,d=Math.hypot(dx,dy)||1;
    dx/=d;dy/=d;
    const push=Math.min(8,(A.radius+B.radius-d)*.22+1);
    A.x-=dx*push;A.y-=dy*push;B.x+=dx*push;B.y+=dy*push;
    const avx=A.vx,avy=A.vy;
    A.vx=B.vx*.65;A.vy=B.vy*.65;B.vx=avx*.65;B.vy=avy*.65;
    A.av*=.75;B.av*=.75;
  }
}
function updateBodies(world){
  if(world&&typeof useWorldState==='function')useWorldState(world);
  // Bodies are continuous shapes. They interact with particles by rasterizing
  // into bodyMask and displacing any grid material they overlap.
  for(const b of bodies){
    const wasMoving=Math.abs(b.vx)+Math.abs(b.vy)+Math.abs(b.av)*b.radius>STABLE_SPEED;
    if(wasMoving)wakeFlowNearBody(b);
    b.vy+=GRAVITY;
    b.vx*=.992;
    b.vy*=.992;
    b.av*=.992;
    b.vx=clamp(b.vx,-MAX_BODY_SPEED,MAX_BODY_SPEED);
    b.vy=clamp(b.vy,-MAX_BODY_SPEED,MAX_BODY_SPEED);
    b.av=clamp(b.av,-MAX_ANGULAR_SPEED,MAX_ANGULAR_SPEED);
    const steps=Math.max(1,Math.ceil(Math.max(Math.abs(b.vx),Math.abs(b.vy),Math.abs(b.av)*b.radius)/(cellSize*.75)));
    for(let s=0;s<steps;s++){
      const ox=b.x,oy=b.y,oa=b.angle;
      b.x+=b.vx/steps;
      b.y+=b.vy/steps;
      b.angle+=b.av/steps;
      if(bodyHitsFixed(b)){
        b.x=ox;
        b.y=oy;
        b.angle=oa;
        b.vx*=-.18;
        b.vy*=-.18;
        b.av*=-.25;
        break;
      }
    }
    if(wasMoving||Math.abs(b.vx)+Math.abs(b.vy)+Math.abs(b.av)*b.radius>STABLE_SPEED)wakeFlowNearBody(b);
  }
  resolveBodyBodyCollisions();
  rebuildBodyMask();
  for(const b of bodies)displaceGridUnderBody(b);
  bodies=bodies.filter(b=>b.y-b.radius<viewH+160&&b.x+b.radius>-160&&b.x-b.radius<viewW+160);
  if(typeof setBodyRuntimeState==='function')setBodyRuntimeState(bodies,nextBodyId);
}
