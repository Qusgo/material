'use strict';

// Connected-region fill selection and fill application. Preview storage lives
// in browser/platform adapters; the core only computes and commits regions.

function normalizeFillCellArgs(worldOrC,cOrR,rOrMat,maybeMat){
  if(maybeMat!==undefined){
    return{world:worldOrC,c:cOrR,r:rOrMat,mat:maybeMat};
  }
  return{world:null,c:worldOrC,r:cOrR,mat:rOrMat};
}

function normalizeComputeFillArgs(worldOrC,cOrR,maybeR){
  if(maybeR!==undefined){
    return{world:worldOrC,c:cOrR,r:maybeR};
  }
  return{world:null,c:worldOrC,r:cOrR};
}

function computeFill(worldOrC,cOrR,maybeR){
  const args=normalizeComputeFillArgs(worldOrC,cOrR,maybeR);
  if(args.world&&args.world.arrays){
    const world=args.world,a=world.arrays,c=args.c,r=args.r;
    if(c<0||c>=world.cols||r<0||r>=world.rows)return{cells:[],target:EMPTY,clipped:false};
    const start=r*world.cols+c,target=a.material[start];
    const seen=new Uint8Array(world.count),queue=new Int32Array(Math.min(world.count,MAX_FILL_CELLS+1)),out=[];
    let h=0,t=0;
    seen[start]=1;
    queue[t++]=start;
    while(h<t&&out.length<MAX_FILL_CELLS){
      const i=queue[h++];
      out.push(i);
      const cc=i%world.cols,rr=Math.floor(i/world.cols),ns=[i-1,i+1,i-world.cols,i+world.cols];
      for(const ni of ns){
        if(ni<0||ni>=world.count||seen[ni])continue;
        const nc=ni%world.cols,nr=Math.floor(ni/world.cols);
        if(Math.abs(nc-cc)+Math.abs(nr-rr)!==1)continue;
        if(a.bodyMask[ni]||a.material[ni]!==target)continue;
        seen[ni]=1;
        if(t<queue.length)queue[t++]=ni;
      }
    }
    return{cells:out,target,clipped:h<t||out.length>=MAX_FILL_CELLS};
  }
  const c=args.c,r=args.r,start=idx(c,r),target=material[start];
  const seen=new Uint8Array(count),queue=new Int32Array(Math.min(count,MAX_FILL_CELLS+1)),out=[];
  let h=0,t=0;
  seen[start]=1;
  queue[t++]=start;
  while(h<t&&out.length<MAX_FILL_CELLS){
    const i=queue[h++];
    out.push(i);
    const cc=i%cols,rr=Math.floor(i/cols),ns=[i-1,i+1,i-cols,i+cols];
    for(const ni of ns){
      if(ni<0||ni>=count||seen[ni])continue;
      const nc=ni%cols,nr=Math.floor(ni/cols);
      if(Math.abs(nc-cc)+Math.abs(nr-rr)!==1)continue;
      if(bodyMask[ni]||material[ni]!==target)continue;
      seen[ni]=1;
      if(t<queue.length)queue[t++]=ni;
    }
  }
  return{cells:out,target,clipped:h<t||out.length>=MAX_FILL_CELLS};
}
function normalizeFillCellsArgs(worldOrCells,cellsOrMat,maybeMat){
  if(maybeMat!==undefined){
    return{world:worldOrCells,cells:cellsOrMat,mat:maybeMat};
  }
  return{world:null,cells:worldOrCells,mat:cellsOrMat};
}

function fillCells(worldOrCells,cellsOrMat,maybeMat){
  const args=normalizeFillCellsArgs(worldOrCells,cellsOrMat,maybeMat),cells=args.cells,mat=args.mat;
  if(!cells.length||!isKnownMaterial(mat))return 0;
  if(args.world&&args.world.arrays){
    const world=args.world;
    for(const i of cells){
      const c=i%world.cols,r=Math.floor(i/world.cols);
      writeCell(world,c,r,mat,0);
    }
    return cells.length;
  }
  const wakeToken=nextWaterWakeToken();
  for(const i of cells){
    const c=i%cols,r=Math.floor(i/cols);
    const oldMat=material[i];
    if(oldMat!==mat){
      if(typeof setEditDirtyState==='function')setEditDirtyState(true);
      else editDirty=true;
    }
    if(oldMat!==mat)wakeWaterComponentsAroundCell(c,r,WAKE_RADIUS,wakeToken);
    wakeFlowAroundCell(c,r);
    material[i]=mat;
    mass[i]=defaultMassForMaterial(mat);
    vx[i]=0;
    vy[i]=0;
    flowDir[i]=defaultFlowDirForMaterial(mat);
    clearTint(i);
    clearSource(i);
    clearMotionTrace(i);
    clearCarryState(i);
    clearRestState(i);
    wakeFlowAroundCell(c,r);
    if(oldMat!==mat)wakeWaterComponentsAroundCell(c,r,WAKE_RADIUS,wakeToken);
  }
  return cells.length;
}
function fillAtCell(worldOrC,cOrR,rOrMat,maybeMat){
  const args=normalizeFillCellArgs(worldOrC,cOrR,rOrMat,maybeMat),c=args.c,r=args.r,mat=args.mat;
  if(args.world&&args.world.arrays){
    if(c<0||c>=args.world.cols||r<0||r>=args.world.rows||!isKnownMaterial(mat))return 0;
    const res=computeFill(args.world,c,r);
    return fillCells(args.world,res.cells,mat);
  }
  if(!inBounds(c,r)||!isKnownMaterial(mat))return 0;
  const res=args.world?computeFill(args.world,c,r):computeFill(c,r);
  return args.world?fillCells(args.world,res.cells,mat):fillCells(res.cells,mat);
}
