'use strict';

// Single local/CI verification entry point.

const {spawnSync}=require('child_process');
const path=require('path');

const ROOT=path.resolve(__dirname,'..');
const CHECKS=[
  'tests/headless-regression.js',
  'tests/portable-adapter-smoke.js'
];

for(const script of CHECKS){
  console.log(`\n> node ${script}`);
  const result=spawnSync(process.execPath,[script],{
    cwd:ROOT,
    stdio:'inherit'
  });
  if(result.error)throw result.error;
  if(result.status!==0)process.exit(result.status||1);
}

console.log('\nverify ok');
