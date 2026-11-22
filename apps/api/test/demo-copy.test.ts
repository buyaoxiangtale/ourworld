import {test} from 'node:test';
import assert from 'node:assert/strict';
import {demoDisplayCopy} from '../src/demo-copy.js';

const sampleBio='Development sample profile · Tokyo。喜欢用当地人的视角发现城市。';

test('untouched demo fixtures receive portrait-aligned names and travel copy without a database rewrite',()=>{
 // Each name follows its portrait slot, including surname rollover and the final load fixture.
 const cases=[
  ['load-0000','Mia 001','Mia Laurent'],
  ['load-0001','Sofia 002','Sofia Laurent'],
  ['load-0002','Isabella 003','Isabella Laurent'],
  ['load-0003','Kai 004','Kai Laurent'],
  ['load-0004','Rin 005','Rin Laurent'],
  ['load-0005','Yuna 006','Yuna Laurent'],
  ['load-0006','Chloe 007','Chloe Laurent'],
  ['load-0007','Theo 008','Theo Laurent'],
  ['load-0008','Mia 009','Mia Martin'],
  ['load-0079','Theo 080','Theo Park'],
  ['load-0080','Mia 081','Mia Laurent'],
  ['load-0999','Theo 1000','Theo Silva'],
 ];
 for(const [id,name,expected] of cases){
  const row=Object.freeze({id,name,bio:sampleBio});
  const copy=demoDisplayCopy(row);
  assert.equal(copy.name,expected,id);
  assert(copy.bio.includes('Tokyo'),`${id}: city is preserved`);
  assert(!copy.bio.includes('Development sample'),`${id}: placeholder copy is replaced`);
  assert.deepEqual(row,{id,name,bio:sampleBio},`${id}: stored source is unchanged`);
 }
});

test('demo presentation never rewrites edited, mismatched or non-demo user content',()=>{
 const rows=[
  {id:'load-0001',name:'My chosen name',bio:sampleBio},
  {id:'load-0001',name:'Sofia 002',bio:'My own introduction'},
  {id:'real-user',name:'Sofia 002',bio:sampleBio},
  {id:'load-0001',name:'Sofia 003',bio:sampleBio},
  {id:'load-0001',name:'Mia 002',bio:sampleBio},
  {id:'load-0001',name:'Noah 002',bio:sampleBio},
  {id:'load-1000',name:'Mia 1001',bio:sampleBio},
  {id:'load-001',name:'Sofia 002',bio:sampleBio},
 ];
 for(const row of rows)assert.deepEqual(demoDisplayCopy(row),{name:row.name,bio:row.bio},row.id+' / '+row.name);
});
