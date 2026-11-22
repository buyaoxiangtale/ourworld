import { execFileSync } from 'node:child_process';
import { writeFileSync,mkdirSync } from 'node:fs';
const samples=[];const start=Date.now();const docker=process.platform==='win32'?'docker.exe':'docker';
mkdirSync('artifacts',{recursive:true});
const names=['ourworld-api-1','ourworld-api-2','ourworld-worker-1','ourworld-postgres-1','ourworld-redis-1'];
const run=args=>execFileSync(docker,args,{encoding:'utf8',timeout:15000,windowsHide:true});
let stopped=false;process.on('SIGINT',()=>{stopped=true});process.on('SIGTERM',()=>{stopped=true});
while(!stopped&&Date.now()-start<1150000){
 const sample={at:new Date().toISOString(),elapsedSeconds:Math.round((Date.now()-start)/1000),containers:[],connections:{}};
 try{sample.containers=run(['stats','--no-stream','--format','{{json .}}',...names]).trim().split(/\r?\n/).filter(Boolean).map(x=>JSON.parse(x));}catch(e){sample.error='Docker statistics unavailable';}
 for(const name of names.slice(0,2)){try{const value=run(['exec',name,'node','-e',"fetch('http://127.0.0.1:3000/metrics').then(r=>r.text()).then(t=>console.log(t))"]);sample.connections[name]=Number(value.match(/ourworld_ws_connections (\d+)/)?.[1]||0);}catch{sample.connections[name]=null}}
 samples.push(sample);writeFileSync('artifacts/load-resources.json',JSON.stringify({startedAt:new Date(start).toISOString(),samples},null,2));console.log(JSON.stringify({at:sample.at,connections:sample.connections}));
 await new Promise(resolve=>setTimeout(resolve,30000));
}
