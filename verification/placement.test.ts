// Run within the pinned upstream tree after applying the distribution patch.
import assert from 'node:assert/strict';
import test from 'node:test';
import {freePosition, placeAutomaticNodes} from '../src/canvas/automaticPlacement.ts';
import {createNode, type Rect} from '../src/canvas/model.ts';

test('automatic placement honors gaps, sizes, and touching forbidden intervals',()=>{
  const r={x:-100,y:500,width:80,height:90};
  assert.deepEqual(freePosition(r,[{...r,x:r.x+r.width+64}]),{x:r.x,y:r.y});
  const filled: Rect[]=[];
  for(let i=0;i<1000;i++){
    const size={...r,width:120+i%7*100,height:80+i%19*20};
    const p=freePosition(size,filled);
    for(const a of filled)assert.ok(a.x+a.width+64<=p.x || p.x+size.width+64<=a.x || a.y+a.height+64<=p.y || p.y+size.height+64<=a.y);
    filled.push({...size,...p});
  }
});

test('group-relative children block their absolute footprint; existing nodes never move',()=>{
  const group=createNode('group',{x:2000,y:-300});
  const child=createNode('text',{x:900,y:0}); child.parentId=group.id;
  const existing=[group,child], before=structuredClone(existing);
  const nodes=[createNode('image',{x:2900,y:-300}),createNode('video',{x:2900,y:-300})];
  placeAutomaticNodes(existing,nodes);
  assert.deepEqual(existing,before);
  assert.notDeepEqual(nodes[0].position,{x:2900,y:-300});
  assert.notDeepEqual(nodes[0].position,nodes[1].position);
});
