'use strict';

// Browser-only app shell DOM handles shared by canvas and toolbar adapters.

const canvas=document.getElementById('canvas'),
  ctx=canvas.getContext('2d',{alpha:false}),
  statusEl=document.getElementById('status'),
  playBtn=document.getElementById('play'),
  debugBasinsBtn=document.getElementById('debug-basins'),
  brushSizeInput=document.getElementById('brush-size');
