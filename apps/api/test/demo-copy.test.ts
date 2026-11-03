import {test} from 'node:test';
import assert from 'node:assert/strict';
import {demoDisplayCopy} from '../src/demo-copy.js';
test('untouched demo fixtures receive readable names and travel copy without a database rewrite',()=>{
 const row={id:'load-0001',name:'Noah 002',bio:'Development sample profile · Tokyo。喜欢用当地人的视角发现城市。'};
 const copy=demoDisplayCopy(row);assert.equal(copy.name,'Noah Laurent');assert(copy.bio.includes('Tokyo'));assert(!copy.bio.includes('Development sample'));assert.equal(row.name,'Noah 002');
});
test('demo presentation never rewrites edited or non-demo user content',()=>{
 for(const row of [{id:'load-0001',name:'My chosen name',bio:'Development sample profile · Tokyo。喜欢用当地人的视角发现城市。'},{id:'load-0001',name:'Noah 002',bio:'My own introduction'},{id:'real-user',name:'Noah 002',bio:'Development sample profile · Tokyo。喜欢用当地人的视角发现城市。'}])assert.deepEqual(demoDisplayCopy(row),{name:row.name,bio:row.bio});
});
