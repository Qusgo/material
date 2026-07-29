'use strict';

// Lightweight entrainment/erosion for granular materials.
//
// A carried particle keeps its original material id and color. The carrier only
// gives it a short-lived motion hint, which avoids material identity bugs while
// still making particles peel off and travel with nearby moving matter.

const EROSION_ACTIVE_WINDOW=2;
const EROSION_CARDINAL=[[0,-1],[1,0],[0,1],[-1,0]];
const EROSION_NEIGHBORS=[
  [0,-1],[1,0],[0,1],[-1,0],
  [-1,-1],[1,-1],[-1,1],[1,1]
];

function carriedTTLForMaterial(mat){
  const max=Math.max(1,Math.floor(100/Math.max(1,materialDensity(mat))));
  return 1+Math.floor(Math.random()*max);
}

function isRecentlyMoved(i){
  return lastMoveTick[i]>0&&simTick-lastMoveTick[i]<=EROSION_ACTIVE_WINDOW;
}

function isActiveCarrierCell(i,carrierMat){
  return carrierMat!==EMPTY&&isFlowMaterial(carrierMat)&&!stableMask[i]&&isRecentlyMoved(i);
}

function diagonalErosionContactOpen(c,r,dc,dr){
  if(dc===0||dr===0)return true;
  const sideA=inBounds(c+dc,r)&&!isBlockedCell(idx(c+dc,r));
  const sideB=inBounds(c,r+dr)&&!isBlockedCell(idx(c,r+dr));
  return sideA||sideB;
}

function carrierMoveVector(i){
  const prev=moveHistory[i];
  if(prev>=0){
    const pc=prev%cols,pr=Math.floor(prev/cols),c=i%cols,r=Math.floor(i/cols);
    return{dx:Math.sign(c-pc),dy:Math.sign(r-pr)};
  }
  const dx=Math.abs(vx[i])>=STABLE_SPEED?Math.sign(vx[i]):0;
  const dy=Math.abs(vy[i])>=STABLE_SPEED?Math.sign(vy[i]):0;
  return{dx,dy};
}

function findActiveCarrierAround(c,r,mat,preferredMat=0){
  let fallback=null;
  for(const [dc,dr]of EROSION_NEIGHBORS){
    const nc=c+dc,nr=r+dr;
    if(!inBounds(nc,nr)||!diagonalErosionContactOpen(c,r,dc,dr))continue;
    const ni=idx(nc,nr),carrierMat=material[ni];
    if(carrierMat===mat||!isActiveCarrierCell(ni,carrierMat))continue;
    if(preferredMat&&carrierMat===preferredMat)return{index:ni,mat:carrierMat,vec:carrierMoveVector(ni)};
    if(!fallback)fallback={index:ni,mat:carrierMat,vec:carrierMoveVector(ni)};
  }
  return fallback;
}

function canBeErodedAt(c,r,mat){
  if(!materialCanBeCarried(mat)||carriedBy[idx(c,r)])return false;
  if(isSolidMaterial(mat)||stableMask[idx(c,r)]&&flowCellHasPotentialAction(c,r,mat))return true;
  return EROSION_CARDINAL.some(([dc,dr])=>{
    const nc=c+dc,nr=r+dr;
    return !inBounds(nc,nr)||canEnterCell(mat,idx(nc,nr));
  });
}

function armCarriedCell(i,carrierMat){
  const mat=material[i];
  if(!materialCanBeCarried(mat)||carrierMat===mat)return false;
  const resistance=Math.max(1,materialErosionResistance(mat));
  if(Math.random()>=1/resistance)return false;
  carriedBy[i]=carrierMat;
  carriedTTL[i]=carriedTTLForMaterial(mat);
  clearRestState(i);
  return true;
}

function tryErodeCell(c,r){
  const i=idx(c,r),mat=material[i];
  if(!canBeErodedAt(c,r,mat))return false;
  const carrier=findActiveCarrierAround(c,r,mat);
  return carrier?armCarriedCell(i,carrier.mat):false;
}

function decayCarryState(i){
  if(!carriedBy[i])return false;
  if(carriedTTL[i]>0)carriedTTL[i]--;
  if(carriedTTL[i]===0){
    carriedBy[i]=0;
    return false;
  }
  return true;
}

function tryCarriedMove(c,r,mat){
  const i=idx(c,r);
  if(!carriedBy[i])return false;
  const carrier=findActiveCarrierAround(c,r,mat,carriedBy[i]);
  if(!carrier)return false;
  const {dx,dy}=carrier.vec;
  const candidates=[];
  if(dx||dy)candidates.push([c+dx,r+dy]);
  if(dx)candidates.push([c+dx,r]);
  if(dy)candidates.push([c,r+dy]);
  for(const [nc,nr]of candidates){
    if(nc===c&&nr===r)continue;
    if(tryMove(c,r,nc,nr,mat))return true;
  }
  return false;
}

function updateCarryLifetimes(){
  for(let i=0;i<count;i++){
    if(carriedBy[i]&&materialCanBeCarried(material[i]))decayCarryState(i);
    else if(carriedBy[i])clearCarryState(i);
  }
}

function applyErosionPass(){
  for(let r=rows-1;r>=0;r--){
    const start=((r+simTick)&1)?cols-1:0,end=start?-1:cols,step=start?-1:1;
    for(let c=start;c!==end;c+=step)tryErodeCell(c,r);
  }
}
