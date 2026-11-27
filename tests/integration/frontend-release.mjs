import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';

const base=process.env.OURWORLD_WEB_URL||'http://127.0.0.1:8188';
const docker=(...args)=>execFileSync('docker',args,{encoding:'utf8'}).trim();
async function get(path){
 const response=await fetch(new URL(path,base),{cache:'no-store',signal:AbortSignal.timeout(5000)});
 assert.equal(response.status,200,path);
 return response;
}
const published=await (await get('/frontend-version.json')).json();
assert.match(published.revision,/^[0-9a-f]{40}$/,'expected a committed release');
assert.equal(docker('ps','-q','--filter','label=com.docker.compose.project=ourworld','--filter','label=com.docker.compose.service=frontend-watch'),'','legacy frontend watcher is stopped');
for(const [service,expected] of [['api',2],['worker',1]]){
 const ids=docker('ps','-q','--filter','label=com.docker.compose.project=ourworld','--filter',`label=com.docker.compose.service=${service}`).split(/\s+/).filter(Boolean);
 assert.equal(ids.length,expected,`expected ${expected} running ${service} containers`);
 const images=docker('inspect','--format','{{.Image}}',...ids).split(/\s+/);
 for(const id of new Set(images)){
  const revision=docker('image','inspect','--format','{{index .Config.Labels "org.opencontainers.image.revision"}}',id);
  assert.equal(revision,published.revision,`${service} image uses the published frontend revision`);
 }
}
await get('/api/v1/ready');
const html=await (await get('/')).text();
assert(html.includes(`name="ourworld-frontend-version" content="${published.version}"`));
const assets=[...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map(match=>match[1]);
assert(assets.some(path=>path.endsWith('.js')));
await Promise.all(assets.map(get));
assert.equal((await (await get('/frontend-version.json')).json()).version,published.version,'release stays stable throughout verification');
console.log(`Frontend, both API instances, worker and entry assets verified at ${published.revision}`);
