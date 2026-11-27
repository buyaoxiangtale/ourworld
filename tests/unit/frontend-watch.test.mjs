import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm,readlink,readdir,utimes} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fingerprint,publishRelease,FrontendWatcher} from '../../scripts/dev/frontend-watch.mjs';
import {pruneReleases} from '../../scripts/deploy/frontend-release.mjs';

async function fixture(t){
 const root=await mkdtemp(join(tmpdir(),'ourworld-watch-test-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const source=join(root,'source'),dist=join(root,'dist'),releases=join(root,'releases');
 await mkdir(join(source,'apps/web/src'),{recursive:true});await mkdir(join(dist,'assets'),{recursive:true});
 await writeFile(join(source,'apps/web/src/main.tsx'),'export const title="first";');
 return {root,source,dist,releases};
}
async function output(dist,name='first'){
 await writeFile(join(dist,`assets/${name}.js`),`console.log('${name}');`);
 await writeFile(join(dist,'index.html'),`<!doctype html><html><head><script type="module" src="/assets/${name}.js"></script></head><body>${name}</body></html>`);
}
async function settle(watcher){if(watcher.task)await watcher.task;}

test('only frontend inputs trigger builds, including changed and removed source files',async t=>{
 const {source}=await fixture(t);const cache=new Map();const first=await fingerprint(source,undefined,cache);
 await writeFile(join(source,'.env'),'PRIVATE_KEY=do-not-publish');
 await mkdir(join(source,'apps/web/dist'),{recursive:true});await writeFile(join(source,'apps/web/dist/index.html'),'generated');
 assert.equal(await fingerprint(source,undefined,cache),first,'secrets and generated output cannot trigger a build loop');
 await writeFile(join(source,'apps/web/src/extra.ts'),'export const value=2;');const added=await fingerprint(source,undefined,cache);assert.notEqual(added,first);
 await rm(join(source,'apps/web/src/extra.ts'));assert.equal(await fingerprint(source,undefined,cache),first,'deletions are observed');
 await writeFile(join(source,'apps/web/src/main.tsx'),'export const title="other";');assert.notEqual(await fingerprint(source,undefined,cache),first);
});

test('a release becomes visible with its version and all entry assets together',async t=>{
 const {dist,releases}=await fixture(t);await output(dist);await publishRelease(dist,releases,'100-first');
 assert.equal(await readlink(join(releases,'current')),'releases/100-first');
 const html=await readFile(join(releases,'current/index.html'),'utf8');assert.match(html,/<meta name="ourworld-frontend-version" content="100-first">/);
 assert.equal(JSON.parse(await readFile(join(releases,'current/frontend-version.json'),'utf8')).version,'100-first');
 assert.match(await readFile(join(releases,'shared/assets/first.js'),'utf8'),/first/);
 await output(dist,'second');await publishRelease(dist,releases,'200-second');
 assert.match(await readFile(join(releases,'current/index.html'),'utf8'),/second/);
 assert.match(await readFile(join(releases,'shared/assets/first.js'),'utf8'),/first/,'old tabs can still fetch their hashed modules');
 assert.match(await readFile(join(releases,'shared/assets/second.js'),'utf8'),/second/);
});

test('incomplete output cannot replace the working release',async t=>{
 const {dist,releases}=await fixture(t);await output(dist);await publishRelease(dist,releases,'100-good');
 await writeFile(join(dist,'index.html'),'<html><head><script type="module" src="/assets/missing.js"></script></head></html>');
 await assert.rejects(publishRelease(dist,releases,'200-bad'),/Missing build asset/);
 assert.equal(await readlink(join(releases,'current')),'releases/100-good');
});

test('release cleanup retains fresh legacy chunks and every current chunk',async t=>{
 const {dist,releases}=await fixture(t);
 for(let i=1;i<=6;i++){
  await output(dist,`entry-${i}`);
  if(i>1)await rm(join(dist,'assets',`entry-${i-1}.js`));
  await publishRelease(dist,releases,`1000${i}`,'a'.repeat(40));
 }
 const old=new Date(Date.now()-2*86400000);
 await utimes(join(releases,'shared/assets/entry-1.js'),old,old);
 await utimes(join(releases,'shared/assets/entry-6.js'),old,old);
 await pruneReleases(releases,'10006');
 assert.equal((await readdir(join(releases,'releases'))).length,5);
 await assert.rejects(readFile(join(releases,'shared/assets/entry-1.js')),{code:'ENOENT'});
 assert.match(await readFile(join(releases,'shared/assets/entry-2.js'),'utf8'),/entry-2/);
 assert.match(await readFile(join(releases,'shared/assets/entry-6.js'),'utf8'),/entry-6/);
});

test('saving invalid source keeps the working release and fixing it publishes again',async t=>{
 const {root,source,dist,releases}=await fixture(t);let fail=false;
 const watcher=new FrontendWatcher({sourceRoot:source,workRoot:join(root,'work'),releaseRoot:releases,debounceMs:0,onEvent:()=>{},build:async()=>{if(fail)throw new Error('TypeScript error');await output(dist,fail?'bad':'working');return dist;}});
 await watcher.tick();await settle(watcher);assert.equal(watcher.status.state,'ready');const previous=await readlink(join(releases,'current'));
 fail=true;await writeFile(join(source,'apps/web/src/main.tsx'),'invalid source');await watcher.tick();await settle(watcher);
 assert.equal(watcher.status.state,'failed');assert.equal(await readlink(join(releases,'current')),previous);
 assert.match(watcher.status.error,/TypeScript error/);
 fail=false;await writeFile(join(source,'apps/web/src/main.tsx'),'fixed source');await watcher.tick();await settle(watcher);
 assert.equal(watcher.status.state,'ready');assert.notEqual(await readlink(join(releases,'current')),previous);
});

test('edits made during a build are serialized and stale output is never published',async t=>{
 const {root,source,dist,releases}=await fixture(t);let finish;let builds=0;let active=0;let maximum=0;
 const gate=new Promise(resolve=>finish=resolve);
 const watcher=new FrontendWatcher({sourceRoot:source,workRoot:join(root,'work'),releaseRoot:releases,debounceMs:0,onEvent:()=>{},build:async()=>{builds++;maximum=Math.max(maximum,++active);if(builds===1)await gate;await output(dist,'latest');active--;return dist;}});
 await watcher.tick();await new Promise(resolve=>setImmediate(resolve));
 await writeFile(join(source,'apps/web/src/main.tsx'),'latest edit');await watcher.tick();finish();await settle(watcher);
 await assert.rejects(readlink(join(releases,'current')),/ENOENT/,'stale build was not activated');
 await watcher.tick();await settle(watcher);assert.equal(watcher.status.state,'ready');assert.equal(builds,2);assert.equal(maximum,1);
});
