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

function installErosionWorld(world){
  if(world&&typeof useWorldState==='function')useWorldState(world);
}

function erosionGridHasArrays(value){
  return !!(value&&typeof value==='object'&&value.arrays&&Number.isFinite(value.cols)&&Number.isFinite(value.rows));
}

function erosionIndex(grid,c,r){
  return r*grid.cols+c;
}

function erosionInBounds(grid,c,r){
  return c>=0&&c<grid.cols&&r>=0&&r<grid.rows;
}

function clearCarryStateInGrid(grid,i){
  const a=grid.arrays;
  a.carriedBy[i]=0;
  a.carriedTTL[i]=0;
  a.lastMoveTick[i]=0;
}

function carriedTTLForMaterial(mat){
  const max=Math.max(1,Math.floor(100/Math.max(1,materialDensity(mat))));
  return 1+Math.floor(Math.random()*max);
}

function isRecentlyMoved(i,grid=null){
  if(erosionGridHasArrays(grid)){
    return grid.arrays.lastMoveTick[i]>0&&grid.simTick-grid.arrays.lastMoveTick[i]<=EROSION_ACTIVE_WINDOW;
  }
  return lastMoveTick[i]>0&&simTick-lastMoveTick[i]<=EROSION_ACTIVE_WINDOW;
}

function isActiveCarrierCell(i,carrierMat,grid=null){
  if(erosionGridHasArrays(grid)){
    return carrierMat!==EMPTY&&isFlowMaterial(carrierMat)&&!grid.arrays.stableMask[i]&&isRecentlyMoved(i,grid);
  }
  return carrierMat!==EMPTY&&isFlowMaterial(carrierMat)&&!stableMask[i]&&isRecentlyMoved(i);
}

function diagonalErosionContactOpen(c,r,dc,dr,grid=null){
  if(dc===0||dr===0)return true;
  if(erosionGridHasArrays(grid)){
    const sideA=erosionInBounds(grid,c+dc,r)&&!flowIsBlockedCellInGrid(grid,erosionIndex(grid,c+dc,r));
    const sideB=erosionInBounds(grid,c,r+dr)&&!flowIsBlockedCellInGrid(grid,erosionIndex(grid,c,r+dr));
    return sideA||sideB;
  }
  const sideA=inBounds(c+dc,r)&&!isBlockedCell(idx(c+dc,r));
  const sideB=inBounds(c,r+dr)&&!isBlockedCell(idx(c,r+dr));
  return sideA||sideB;
}

function carrierMoveVector(i,grid=null){
  const a=erosionGridHasArrays(grid)?grid.arrays:null;
  const width=a?grid.cols:cols;
  const prev=a?a.moveHistory[i]:moveHistory[i];
  if(prev>=0){
    const pc=prev%width,pr=Math.floor(prev/width),c=i%width,r=Math.floor(i/width);
    return{dx:Math.sign(c-pc),dy:Math.sign(r-pr)};
  }
  const cellVx=a?a.vx[i]:vx[i],cellVy=a?a.vy[i]:vy[i];
  const dx=Math.abs(cellVx)>=STABLE_SPEED?Math.sign(cellVx):0;
  const dy=Math.abs(cellVy)>=STABLE_SPEED?Math.sign(cellVy):0;
  return{dx,dy};
}

function findActiveCarrierAround(c,r,mat,preferredMat=0,grid=null){
  const a=erosionGridHasArrays(grid)?grid.arrays:null;
  let fallback=null;
  for(const [dc,dr]of EROSION_NEIGHBORS){
    const nc=c+dc,nr=r+dr;
    if(a){
      if(!erosionInBounds(grid,nc,nr)||!diagonalErosionContactOpen(c,r,dc,dr,grid))continue;
      const ni=erosionIndex(grid,nc,nr),carrierMat=a.material[ni];
      if(carrierMat===mat||!isActiveCarrierCell(ni,carrierMat,grid))continue;
      if(preferredMat&&carrierMat===preferredMat)return{index:ni,mat:carrierMat,vec:carrierMoveVector(ni,grid)};
      if(!fallback)fallback={index:ni,mat:carrierMat,vec:carrierMoveVector(ni,grid)};
      continue;
    }
    if(!inBounds(nc,nr)||!diagonalErosionContactOpen(c,r,dc,dr))continue;
    const ni=idx(nc,nr),carrierMat=material[ni];
    if(carrierMat===mat||!isActiveCarrierCell(ni,carrierMat))continue;
    if(preferredMat&&carrierMat===preferredMat)return{index:ni,mat:carrierMat,vec:carrierMoveVector(ni)};
    if(!fallback)fallback={index:ni,mat:carrierMat,vec:carrierMoveVector(ni)};
  }
  return fallback;
}

function canBeErodedAt(c,r,mat,grid=null){
  if(erosionGridHasArrays(grid)){
    const a=grid.arrays,i=erosionIndex(grid,c,r);
    if(!materialCanBeCarried(mat)||a.carriedBy[i])return false;
    if(isSolidMaterial(mat)||a.stableMask[i]&&flowCellHasPotentialAction(c,r,mat,grid))return true;
    return EROSION_CARDINAL.some(([dc,dr])=>{
      const nc=c+dc,nr=r+dr;
      return !erosionInBounds(grid,nc,nr)||flowCanEnterCellInGrid(grid,mat,erosionIndex(grid,nc,nr));
    });
  }
  if(!materialCanBeCarried(mat)||carriedBy[idx(c,r)])return false;
  if(isSolidMaterial(mat)||stableMask[idx(c,r)]&&flowCellHasPotentialAction(c,r,mat))return true;
  return EROSION_CARDINAL.some(([dc,dr])=>{
    const nc=c+dc,nr=r+dr;
    return !inBounds(nc,nr)||canEnterCell(mat,idx(nc,nr));
  });
}

function armCarriedCell(i,carrierMat,grid=null){
  const a=erosionGridHasArrays(grid)?grid.arrays:null;
  const mat=a?a.material[i]:material[i];
  if(!materialCanBeCarried(mat)||carrierMat===mat)return false;
  const resistance=Math.max(1,materialErosionResistance(mat));
  if(Math.random()>=1/resistance)return false;
  if(a){
    a.carriedBy[i]=carrierMat;
    a.carriedTTL[i]=carriedTTLForMaterial(mat);
    flowClearRestStateInGrid(grid,i);
    return true;
  }
  carriedBy[i]=carrierMat;
  carriedTTL[i]=carriedTTLForMaterial(mat);
  clearRestState(i);
  return true;
}

function tryErodeCell(c,r,grid=null){
  const a=erosionGridHasArrays(grid)?grid.arrays:null;
  const i=a?erosionIndex(grid,c,r):idx(c,r),mat=a?a.material[i]:material[i];
  if(!canBeErodedAt(c,r,mat,grid))return false;
  const carrier=findActiveCarrierAround(c,r,mat,0,grid);
  return carrier?armCarriedCell(i,carrier.mat,grid):false;
}

function decayCarryState(i,grid=null){
  const a=erosionGridHasArrays(grid)?grid.arrays:null;
  if(a){
    if(!a.carriedBy[i])return false;
    if(a.carriedTTL[i]>0)a.carriedTTL[i]--;
    if(a.carriedTTL[i]===0){
      a.carriedBy[i]=0;
      return false;
    }
    return true;
  }
  if(!carriedBy[i])return false;
  if(carriedTTL[i]>0)carriedTTL[i]--;
  if(carriedTTL[i]===0){
    carriedBy[i]=0;
    return false;
  }
  return true;
}

function tryCarriedMove(c,r,mat,grid=null){
  const a=erosionGridHasArrays(grid)?grid.arrays:null;
  const i=a?erosionIndex(grid,c,r):idx(c,r);
  const carried=a?a.carriedBy[i]:carriedBy[i];
  if(!carried)return false;
  const carrier=findActiveCarrierAround(c,r,mat,carried,grid);
  if(!carrier)return false;
  const {dx,dy}=carrier.vec;
  const candidates=[];
  if(dx||dy)candidates.push([c+dx,r+dy]);
  if(dx)candidates.push([c+dx,r]);
  if(dy)candidates.push([c,r+dy]);
  for(const [nc,nr]of candidates){
    if(nc===c&&nr===r)continue;
    if(tryMove(c,r,nc,nr,mat,grid))return true;
  }
  return false;
}

function updateCarryLifetimes(world){
  if(erosionGridHasArrays(world)){
    const a=world.arrays;
    for(let i=0;i<world.count;i++){
      if(a.carriedBy[i]&&materialCanBeCarried(a.material[i]))decayCarryState(i,world);
      else if(a.carriedBy[i])clearCarryStateInGrid(world,i);
    }
    return;
  }
  installErosionWorld(world);
  for(let i=0;i<count;i++){
    if(carriedBy[i]&&materialCanBeCarried(material[i]))decayCarryState(i);
    else if(carriedBy[i])clearCarryState(i);
  }
}

function applyErosionPass(world){
  if(erosionGridHasArrays(world)){
    for(let r=world.rows-1;r>=0;r--){
      const start=((r+world.simTick)&1)?world.cols-1:0,end=start?-1:world.cols,step=start?-1:1;
      for(let c=start;c!==end;c+=step)tryErodeCell(c,r,world);
    }
    return;
  }
  installErosionWorld(world);
  for(let r=rows-1;r>=0;r--){
    const start=((r+simTick)&1)?cols-1:0,end=start?-1:cols,step=start?-1:1;
    for(let c=start;c!==end;c+=step)tryErodeCell(c,r);
  }
}
