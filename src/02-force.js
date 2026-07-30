'use strict';

// DOM-free force application. UI tools build a circle and arrow; this function
// mutates flow cells and dynamic bodies using the same rules on every platform.

function applyForce(circle,arrow){
  const fx=arrow.x*.035,fy=arrow.y*.035;
  if(Math.hypot(fx,fy)<.02)return false;
  const minC=clamp(Math.floor((circle.x-circle.r)/cellSize),0,cols-1),maxC=clamp(Math.floor((circle.x+circle.r)/cellSize),0,cols-1);
  const minR=clamp(Math.floor((circle.y-circle.r)/cellSize),0,rows-1),maxR=clamp(Math.floor((circle.y+circle.r)/cellSize),0,rows-1),r2=circle.r*circle.r;
  for(let r=minR;r<=maxR;r++)for(let c=minC;c<=maxC;c++){
    const p=cellCenter(c,r),dx=p.x-circle.x,dy=p.y-circle.y;
    if(dx*dx+dy*dy>r2)continue;
    const i=idx(c,r);
    const mat=material[i],rule=FLOW_RULES[mat];
    if(rule){
      const scale=rule.forceScale||.65;
      clearRestState(i);
      vx[i]+=fx*scale;
      vy[i]+=fy*scale;
      wakeFlowAroundCell(c,r);
    }
  }
  for(const b of bodies){
    if(!bodyIntersectsCircle(b,circle.x,circle.y,circle.r))continue;
    wakeFlowNearBody(b);
    const response=.55/Math.max(1,b.mass*.015);
    b.vx+=fx*response;
    b.vy+=fy*response;
    const rx=circle.x-b.x,ry=circle.y-b.y;
    b.av+=(rx*fy-ry*fx)*b.invInertia*38;
  }
  return true;
}
