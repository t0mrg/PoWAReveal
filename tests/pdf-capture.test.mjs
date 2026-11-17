import test from 'node:test';
import assert from 'node:assert/strict';
import { imagePlacement } from '../src/pdf-capture.js';

test('Fit preserves the entire image with centred letterboxing in both native aspect ratios',()=>{
  assert.deepEqual(imagePlacement(400,100,{x:0,y:0,width:1280,height:720},'contain'),{x:0,y:200,width:1280,height:320});
  assert.deepEqual(imagePlacement(400,100,{x:0,y:0,width:1296,height:864},'contain'),{x:0,y:270,width:1296,height:324});
  assert.deepEqual(imagePlacement(100,200,{x:5,y:10,width:1000,height:500},'contain'),{x:380,y:10,width:250,height:500});
});

test('Fill covers the image box and crops equally on opposing edges',()=>{
  assert.deepEqual(imagePlacement(400,100,{x:0,y:0,width:1280,height:720},'cover'),{x:-800,y:0,width:2880,height:720});
  assert.deepEqual(imagePlacement(400,100,{x:0,y:0,width:1296,height:864},'cover'),{x:-1080,y:0,width:3456,height:864});
  assert.deepEqual(imagePlacement(100,200,{x:5,y:10,width:1000,height:500},'cover'),{x:5,y:-740,width:1000,height:2000});
});

test('computed object-position supports crop offsets, pixels and calculated offsets',()=>{
  const box={x:0,y:0,width:1280,height:720};
  assert.equal(imagePlacement(400,100,box,'cover','0% 50%').x,0);
  assert.equal(imagePlacement(400,100,box,'cover','100% 50%').x,-1600);
  assert.equal(imagePlacement(400,100,box,'cover','calc(50% + 10px) 50%').x,-790);
  assert.equal(imagePlacement(400,100,box,'cover','20px 0px').x,20);
  assert.deepEqual(imagePlacement(400,100,box,'fill'),{x:0,y:0,width:1280,height:720});
});

test('invalid geometry and unresolved custom positions fail instead of producing a misleading PDF',()=>{
  assert.throws(()=>imagePlacement(0,100,{x:0,y:0,width:1280,height:720}),/dimensions/);
  assert.throws(()=>imagePlacement(400,100,{x:0,y:0,width:1280,height:720},'cover','var(--unknown) 50%'),/position/);
});
