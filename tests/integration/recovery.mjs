import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID,randomBytes,scrypt,createHash } from 'node:crypto';
import { mkdirSync,writeFileSync,readFileSync } from 'node:fs';
import { dirname,join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EventEmitter } from 'node:events';
import WebSocket from 'ws';
import pg from 'pg';

// Actual Docker fault injection is opt-in. Merely loading/checking this file never stops a service.
const root=dirname(dirname(dirname(fileURLToPath(import.meta.url))));
try{process.loadEnvFile(join(root,'.env'));}catch{}
const execute=process.argv.includes('--execute');
const project='ourworld';
const base=(process.env.TEST_BASE_URL||'http://127.0.0.1:8188/api/v1').replace(/\/$/,'');
const docker=process.platform==='win32'?'docker.exe':'docker';
const exec=promisify(execFile),derive=promisify(scrypt);
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const started=Date.now(),runId=`recovery-${randomUUID()}`;
const reportPath=join(root,'artifacts','recovery-results.json');
const report={runId,startedAt:new Date(started).toISOString(),project,base,scriptSha256:createHash('sha256').update(readFileSync(fileURLToPath(import.meta.url))).digest('hex'),status:'running',containers:{},fixtures:{},tests:[],actions:[],restoration:[]};
let interrupted=false,pool;
const touched=new Map(),sockets=new Set();
const persist=()=>{mkdirSync(dirname(reportPath),{recursive:true});writeFileSync(reportPath,JSON.stringify(report,null,2));};
const cleanError=error=>String(error?.message||error).replace(/Bearer\s+\S+/g,'Bearer [redacted]').slice(0,1200);
function checkInterrupted(){if(interrupted)throw new Error('Recovery test interrupted; restoring owned containers');}
async function dockerCommand(args,timeout=30000){const {stdout}=await exec(docker,args,{cwd:root,encoding:'utf8',windowsHide:true,timeout,maxBuffer:1024*1024});return stdout.trim();}
async function inspect(id){
 assert.match(id,/^[0-9a-f]{12,64}$/,'Container identifier must come from Docker');
 const template='{"id":{{json .Id}},"name":{{json .Name}},"labels":{{json .Config.Labels}},"state":{{json .State}},"ports":{{json .NetworkSettings.Ports}}}';
 const container=JSON.parse(await dockerCommand(['inspect','--format',template,id]));
 assert.equal(container.labels['com.docker.compose.project'],project,'Refusing to touch a container outside ourworld');
 const workingDir=container.labels['com.docker.compose.project.working_dir'];
 if(workingDir)assert.equal(workingDir.replace(/\\/g,'/').toLowerCase(),root.replace(/\\/g,'/').toLowerCase(),'Refusing to touch an ourworld stack from another workspace');
 container.service=container.labels['com.docker.compose.service'];container.name=container.name.replace(/^\//,'');return container;
}
async function inventory(service){
 const ids=(await dockerCommand(['compose','-p',project,'-f',join(root,'compose.yaml'),'ps','-q',service])).split(/\r?\n/).filter(Boolean);
 const entries=await Promise.all(ids.map(inspect));for(const entry of entries)assert.equal(entry.service,service);return entries;
}
async function action(command,container){
 checkInterrupted();const current=await inspect(container.id);assert.equal(current.service,container.service);assert(['api','redis','worker'].includes(current.service),'Faults are restricted to API, Redis and worker');
 touched.set(container.id,{id:container.id,service:container.service,name:container.name});
 const record={at:new Date().toISOString(),command,container:container.name,service:container.service};report.actions.push(record);persist();
 try{const args=command==='start'?['start',container.id]:[command,'--time','2',container.id];await dockerCommand(args,60000);record.passed=true;}catch(error){record.passed=false;record.error=cleanError(error);throw error;}finally{persist();}
}
async function until(fn,{timeout=30000,interval=500,label='condition'}={}){
 const end=Date.now()+timeout;let last;
 while(Date.now()<end){checkInterrupted();try{const value=await fn();if(value)return value;}catch(error){last=error;}await sleep(interval);}
 throw new Error(`Timed out waiting for ${label}${last?`: ${cleanError(last)}`:''}`);
}
async function request(path,{token,method='GET',body,accept=[200,201]}={}){
 const response=await fetch(base+path,{method,headers:{...(token?{Authorization:`Bearer ${token}`} : {}),...(body!==undefined?{'Content-Type':'application/json'}:{})},body:body!==undefined?JSON.stringify(body):undefined,signal:AbortSignal.timeout(12000)});
 const text=await response.text();let value;try{value=JSON.parse(text);}catch{value=text;}
 if(accept&&!accept.includes(response.status))throw new Error(`${method} ${path}: ${response.status} ${typeof value==='object'?value.code||value.message:'non-JSON response'}`);
 return {status:response.status,value};
}
const api=(path,options)=>request(path,options).then(r=>r.value);
async function apiReady(container){
 const code="fetch('http://127.0.0.1:3000/api/v1/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))";
 await dockerCommand(['exec',container.id,'node','-e',code],15000);return true;
}
async function socketCounts(apis){
 const result={};
 for(const container of apis){const text=await dockerCommand(['exec',container.id,'node','-e',"fetch('http://127.0.0.1:3000/metrics').then(r=>r.text()).then(console.log)"],15000);const match=text.match(/^ourworld_ws_connections (\d+)$/m);assert(match,'API metrics must expose the actual socket count');result[container.id]=Number(match[1]);}
 return result;
}
async function connect(token){
 const socket=new WebSocket(base.replace(/^http/,'ws')+'/ws');const events=[],emitter=new EventEmitter();let ended=false;
 const closed=new Promise(resolve=>socket.once('close',(code,reason)=>{ended=true;resolve({code,reason:reason.toString()});emitter.emit('closed');}));
 const waitEvent=(predicate,timeout=15000)=>{
  const found=events.find(predicate);if(found)return Promise.resolve(found);
  return new Promise((resolve,reject)=>{
   const cleanup=()=>{clearTimeout(timer);emitter.off('event',handle);emitter.off('closed',onClose);};
   const handle=event=>{if(predicate(event)){cleanup();resolve(event);}};
   const onClose=()=>{cleanup();reject(new Error('Socket closed before the expected event'));};
   const timer=setTimeout(()=>{cleanup();reject(new Error('Timed out waiting for realtime event'));},timeout);
   emitter.on('event',handle);emitter.on('closed',onClose);if(ended)onClose();
  });
 };
 socket.on('error',()=>{});
 socket.on('message',raw=>{try{const event=JSON.parse(raw.toString());events.push(event);emitter.emit('event',event);}catch{}});
 const ready=waitEvent(e=>e.event==='auth.ready');
 socket.once('open',()=>socket.send(JSON.stringify({event:'auth',data:{token}})));
 const client={socket,events,closed,waitEvent,close:async()=>{if(!ended){socket.close();await Promise.race([closed,sleep(1000)]);if(!ended)socket.terminate();}sockets.delete(client);}};
 sockets.add(client);await ready;return client;
}
async function connectPinned(token,apis){
 for(let attempt=0;attempt<3;attempt++){
  const before=await socketCounts(apis),client=await connect(token),after=await socketCounts(apis);
  const owners=apis.filter(item=>after[item.id]-before[item.id]===1);
  const total=apis.reduce((n,item)=>n+after[item.id]-before[item.id],0);
  if(owners.length===1&&total===1)return {client,owner:owners[0]};
  await client.close();await sleep(300);
 }
 throw new Error('Cannot unambiguously identify the test socket owner; no container was restarted');
}
const messageEvent=id=>event=>event.event==='message.created'&&(event.data?.id===id||event.data?.message?.id===id);
async function send(token,conversationId,label,clientMessageId=randomUUID(),retry=false){
 const call=()=>api(`/conversations/${conversationId}/messages`,{method:'POST',token,body:{clientMessageId,type:'text',body:`${runId}: ${label}`}});
 return retry?until(call,{timeout:30000,label:'persisted message through surviving API'}):call();
}
async function test(name,run){
 checkInterrupted();const begin=Date.now();try{const evidence=await run();report.tests.push({name,passed:true,ms:Date.now()-begin,evidence});console.log('PASS '+name);}
 catch(error){report.tests.push({name,passed:false,ms:Date.now()-begin,error:cleanError(error)});console.error('FAIL '+name+': '+cleanError(error));}
 persist();
}
async function restore(){
 for(const container of touched.values()){
  const result={container:container.name,service:container.service};
  try{const current=await inspect(container.id);assert.equal(current.service,container.service);if(!current.state.Running)await dockerCommand(['start',container.id],60000);result.passed=(await inspect(container.id)).state.Running;}
  catch(error){result.passed=false;result.error=cleanError(error);}report.restoration.push(result);persist();
 }
}

async function run(){
 const address=new URL(base);assert(['localhost','127.0.0.1','[::1]'].includes(address.hostname)&&!address.username&&!address.password,'Recovery only targets the local ourworld gateway');
 process.once('SIGINT',()=>{interrupted=true;});process.once('SIGTERM',()=>{interrupted=true;});persist();
 try{
  const apis=await inventory('api'),redisContainers=await inventory('redis'),workers=await inventory('worker'),databases=await inventory('postgres');
  assert(apis.length>=2,'At least two running ourworld API replicas are required');assert.equal(redisContainers.length,1);assert.equal(workers.length,1,'Scheduled recovery test requires one isolated Docker worker');assert.equal(databases.length,1);
  for(const container of [...apis,...redisContainers,...workers,...databases])assert(container.state.Running,`${container.name} must be running`);
  const cache=redisContainers[0],worker=workers[0],database=databases[0];
  report.containers={api:apis.map(x=>({id:x.id,name:x.name})),redis:{id:cache.id,name:cache.name},worker:{id:worker.id,name:worker.name},postgres:{id:database.id,name:database.name}};persist();
  const dbUrl=new URL(process.env.DATABASE_URL||'postgresql://ourworld:ourworld_dev@localhost:5432/ourworld');
  assert(['localhost','127.0.0.1','[::1]'].includes(dbUrl.hostname)&&dbUrl.pathname==='/ourworld','Fixture SQL is restricted to the local ourworld database');
  const bindings=database.ports['5432/tcp']||[];assert(bindings.some(p=>p.HostPort===(dbUrl.port||'5432')),'Database port must match the inspected ourworld container');
  await Promise.all(apis.map(apiReady));await api('/ready');
  pool=new pg.Pool({connectionString:dbUrl.toString(),max:2,connectionTimeoutMillis:5000,idleTimeoutMillis:2000});
  const city=(await api('/places?kind=city')).items[0];assert(city,'A seeded city is required');
  const password=`Recovery-${randomUUID()}`,salt=randomBytes(16).toString('hex'),hash=await derive(password,salt,64);
  const passwordHash=`scrypt:${salt}:${hash.toString('hex')}`;
  const users=[`${runId}-a`,`${runId}-b`];
  for(const id of users)await pool.query('INSERT INTO users(id,email,password_hash,name,verified,city_ids) VALUES($1,$2,$3,$4,true,$5)',[id,`${id}@ourworld.test`,passwordHash,'Dedicated recovery fixture',[city.id]]);
  report.fixtures={userIds:users,cityId:city.id};persist();
  const a=await api('/auth/login',{method:'POST',body:{email:`${users[0]}@ourworld.test`,password}}),b=await api('/auth/login',{method:'POST',body:{email:`${users[1]}@ourworld.test`,password}});
  const conversation=await api('/conversations/direct',{method:'POST',token:a.accessToken,body:{userId:b.user.id,cityId:city.id}});report.fixtures.conversationId=conversation.id;persist();

  await test('single API restart: reconnect and fill persisted history',async()=>{
   const {client,owner}=await connectPinned(b.accessToken,apis);let reconnect,restart;
   try{
    const before=await send(a.accessToken,conversation.id,'before API restart');await client.waitEvent(messageEvent(before.id));
    const faultAt=Date.now();restart=action('restart',owner);restart.catch(()=>{});
    const closure=await Promise.race([client.closed,sleep(15000).then(()=>{throw new Error('Owned socket did not close when its API restarted');})]);
    const gap=await send(a.accessToken,conversation.id,'persisted while receiver disconnected',randomUUID(),true);
    await restart;await until(()=>apiReady(owner),{timeout:60000,label:'restarted API readiness'});
    reconnect=await connect(b.accessToken);
    const history=await api(`/conversations/${conversation.id}/messages?after=${before.sequence}`,{token:b.accessToken});
    assert.equal(history.items.filter(m=>m.id===gap.id).length,1,'Disconnected message must be recoverable exactly once');
    const after=await send(a.accessToken,conversation.id,'live delivery after API restart');await reconnect.waitEvent(messageEvent(after.id));
    return {restartedContainer:owner.name,socketClose:closure,lastSeenSequence:before.sequence,recoveredMessageId:gap.id,recoveredSequence:gap.sequence,liveMessageId:after.id,recoveryMs:Date.now()-faultAt};
   }finally{if(restart)await restart.catch(()=>{});await client.close();if(reconnect)await reconnect.close();}
  });

  await test('Redis interruption: resubscribe, retry once and restore broadcast',async()=>{
   const client=await connect(b.accessToken);let reconnect;
   try{
    const baseline=await send(a.accessToken,conversation.id,'before Redis interruption');await client.waitEvent(messageEvent(baseline.id));
    await action('stop',cache);const faultAt=Date.now();
    const closure=await Promise.race([client.closed,sleep(15000).then(()=>{throw new Error('Socket was not told to resync after Redis outage');})]);
    const clientMessageId=randomUUID(),body={clientMessageId,type:'text',body:`${runId}: retry across Redis outage`};
    let outage;try{outage=await request(`/conversations/${conversation.id}/messages`,{token:a.accessToken,method:'POST',body,accept:null});}catch(error){outage={status:0,value:{message:cleanError(error)}};}
    assert([0,200,201,502,503,504].includes(outage.status),'Unexpected write status during dependency outage');
    await sleep(4000);await action('start',cache);
    await until(async()=>{assert.equal(await dockerCommand(['exec',cache.id,'redis-cli','ping']),'PONG');await Promise.all(apis.map(apiReady));return true;},{timeout:60000,label:'Redis and API readiness'});
    await until(async()=>{const values=(await dockerCommand(['exec',cache.id,'redis-cli','--raw','PUBSUB','NUMSUB','ourworld:events'])).split(/\r?\n/);return Number(values.at(-1))>=apis.length;},{timeout:30000,label:'API Redis subscriptions'});
    reconnect=await connect(b.accessToken);
    const retried=await until(()=>api(`/conversations/${conversation.id}/messages`,{token:a.accessToken,method:'POST',body}),{timeout:30000,label:'retry after Redis recovery'});
    const history=await api(`/conversations/${conversation.id}/messages?after=${baseline.sequence}`,{token:b.accessToken});assert.equal(history.items.filter(m=>m.clientMessageId===clientMessageId).length,1,'Retry must not duplicate a committed message');
    const live=await send(a.accessToken,conversation.id,'live delivery after Redis recovery');await reconnect.waitEvent(messageEvent(live.id));
    return {container:cache.name,socketClose:closure,outageWriteStatus:outage.status,retriedMessageId:retried.id,liveMessageId:live.id,recoveryMs:Date.now()-faultAt};
   }finally{await action('start',cache);await client.close();if(reconnect)await reconnect.close();}
  });

  await test('worker restart: catch up expired trip and relay queued outbox',async()=>{
   const client=await connect(b.accessToken);const endAt=new Date(Date.now()+10000).toISOString();
   const trip=await api(`/conversations/${conversation.id}/trips`,{method:'POST',token:a.accessToken,body:{cityId:city.id,title:`${runId}: scheduled catch-up`,endAt}});
   await api(`/trips/${trip.id}/accept`,{method:'POST',token:b.accessToken,body:{expectedEndAt:endAt}});report.fixtures.tripId=trip.id;persist();
   try{
    await action('stop',worker);
    const queued=await send(a.accessToken,conversation.id,'committed while worker was stopped');
    await sleep(Math.max(0,Date.parse(endAt)+2000-Date.now()));checkInterrupted();
    assert.equal((await inspect(worker.id)).state.Running,false);
    const during=(await api(`/conversations/${conversation.id}/trips`,{token:a.accessToken})).items.find(item=>item.id===trip.id);
    assert.equal(during.status,'active','Another worker processed the schedule while Docker worker was stopped; isolate the worker tier before rerunning');
    assert(!client.events.some(messageEvent(queued.id)),'Another worker relayed outbox while Docker worker was stopped');
    const resumedAt=Date.now();await action('start',worker);
    const completed=await until(async()=>{const current=(await api(`/conversations/${conversation.id}/trips`,{token:a.accessToken})).items.find(item=>item.id===trip.id);return current?.status==='reviewable'?current:false;},{timeout:30000,label:'scheduled trip catch-up'});
    assert.equal(completed.openedBy,'scheduled');await client.waitEvent(messageEvent(queued.id));
    return {container:worker.name,tripId:trip.id,endAt,statusWhileStopped:during.status,statusAfterRestart:completed.status,openedBy:completed.openedBy,relayedMessageId:queued.id,catchUpMs:Date.now()-resumedAt};
   }finally{await action('start',worker);await client.close();}
  });
 }catch(error){report.preflightError=cleanError(error);console.error(report.preflightError);}
 finally{
  for(const client of [...sockets])await client.close();await restore();
  if(pool){try{const users=report.fixtures.userIds||[];await pool.query('UPDATE users SET active=false WHERE id=ANY($1::text[])',[users]);await pool.query('UPDATE sessions SET revoked=true WHERE user_id=ANY($1::text[])',[users]);}catch(error){report.cleanupError=cleanError(error);}await pool.end();}
  report.finishedAt=new Date().toISOString();report.durationMs=Date.now()-started;
  report.status=!interrupted&&!report.preflightError&&!report.cleanupError&&report.tests.length===3&&report.tests.every(t=>t.passed)&&report.restoration.every(r=>r.passed)?'passed':'failed';persist();
  console.log(`Recovery ${report.status}: ${report.tests.filter(t=>t.passed).length}/3; ${reportPath}`);if(report.status!=='passed')process.exitCode=1;
 }
}

if(!execute){
 console.log('Not executed. After the load-test window closes, run: node tests/integration/recovery.mjs --execute');
 console.log('Scope: only inspected ourworld Compose API/Redis/worker containers; no removal, volume deletion or other-project actions. Expected duration: 60–120 seconds.');
}else await run();
