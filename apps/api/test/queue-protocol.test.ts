import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { Queue,QueueEvents } from 'bullmq';
import { Redis } from 'ioredis';
import { config } from '../src/config.js';
import { query,one,pool } from '../src/db.js';
import { redis,mailTasks,layoutTasks,queueConnection,MAIL_QUEUE_NAME,LAYOUT_QUEUE_NAME } from '../src/infrastructure.js';
import { createTaskWorkers } from '../src/worker.js';
import { processLayout } from '../src/profile-layout.js';
import { DEFAULT_LAYOUT,BLOCK_TYPES } from '@ourworld/contracts';

// This fixture verifies the compatible HTTP protocol and queue isolation only.
// It does not call or simulate a successful connection to the real DeepSeek service.
test('protocol fixture: two blocked model calls do not starve SMTP mail; every output mode is transmitted', {timeout:30000},async()=>{
 const prefix=`protocol-${randomUUID()}`;
 const names={mail:`${MAIL_QUEUE_NAME}-${prefix}`,layout:`${LAYOUT_QUEUE_NAME}-${prefix}`};
 const mailQueue=new Queue(names.mail,{connection:queueConnection}),layoutQueue=new Queue(names.layout,{connection:queueConnection});
 const mailEventConnection=new Redis(config.redisUrl,{maxRetriesPerRequest:null}),layoutEventConnection=new Redis(config.redisUrl,{maxRetriesPerRequest:null});
 const mailEvents=new QueueEvents(names.mail,{connection:mailEventConnection}),layoutEvents=new QueueEvents(names.layout,{connection:layoutEventConnection});
 const old={base:config.llmBase,key:config.llmKey,model:config.llmModel,format:config.llmFormat};
 const users=[`${prefix}-a`,`${prefix}-b`];let processors:Awaited<ReturnType<typeof createTaskWorkers>>|undefined;
 const requests:any[]=[];const held:ServerResponse[]=[];let releaseModels=false;
 let sawBoth!:()=>void;const bothRequests=new Promise<void>(resolve=>{sawBoth=resolve;});
 const result={...DEFAULT_LAYOUT,blocks:DEFAULT_LAYOUT.blocks.map(b=>({...b,title:null,content:null,refs:null}))};
 const answer=(response:ServerResponse)=>{if(response.writableEnded)return;response.writeHead(200,{'content-type':'application/json'});response.end(JSON.stringify({choices:[{message:{content:JSON.stringify(result)}}]}));};
 const server=createServer(async(req,res)=>{
  if(req.url!=='/v1/chat/completions'||req.method!=='POST'){res.writeHead(404);res.end();return;}
  const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(Buffer.from(chunk));
  requests.push(JSON.parse(Buffer.concat(chunks).toString('utf8')));
  if(releaseModels)answer(res);else{held.push(res);if(held.length===2)sawBoth();}
 });
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 const address=server.address();assert(address&&typeof address!=='string');
 config.llmBase=`http://127.0.0.1:${address.port}/v1`;config.llmModel='local-protocol-fixture';config.llmKey='fixture-only-not-a-provider-key';config.llmFormat='json_schema';
 const addRecord=async(userId:string)=>{const id=randomUUID();await query("INSERT INTO layout_jobs(id,user_id,status,base_revision,base_layout,prompt) VALUES($1,$2,'queued',1,$3,'Move the gallery above the introduction')",[id,userId,JSON.stringify(DEFAULT_LAYOUT)]);return id;};
 try {
  for(const id of users){await query("INSERT INTO users(id,email,password_hash,name,verified) VALUES($1,$2,'unused-protocol-fixture','Queue protocol test',true)",[id,`${id}@ourworld.test`]);await query('INSERT INTO profile_drafts(user_id,layout) VALUES($1,$2)',[id,JSON.stringify(DEFAULT_LAYOUT)]);}
  await Promise.all([mailEvents.waitUntilReady(),layoutEvents.waitUntilReady()]);
  processors=await createTaskWorkers(names);
  const ids=[await addRecord(users[0]),await addRecord(users[1])];
  const generated=await Promise.all(ids.map(id=>layoutQueue.add('layout',{id},{jobId:id})));
  const generationFinished=generated.map(job=>job.waitUntilFinished(layoutEvents,20000));
  await Promise.race([bothRequests,new Promise((_,reject)=>{const timeout=setTimeout(()=>reject(new Error('The two model calls did not start')),10000);timeout.unref();})]);
  assert.equal(await layoutQueue.getActiveCount(),2);
  assert.equal(await layoutQueue.getGlobalConcurrency(),2);
  assert.equal(await mailQueue.getGlobalConcurrency(),null,'The mail queue must not inherit the two-model concurrency cap');
  const mail=await mailQueue.add('mail',{to:`${prefix}@ourworld.test`,subject:'Queue isolation protocol test',text:'Two model requests are deliberately blocked. This real SMTP message must finish first.'});
  const started=performance.now();await mail.waitUntilFinished(mailEvents,5000);
  assert(performance.now()-started<5000,'SMTP delivery must finish while both model responses remain blocked');
  assert.equal(releaseModels,false);assert.equal(held.length,2);
  assert.equal((await query("SELECT id FROM layout_jobs WHERE id=ANY($1::text[]) AND status='running'",[ids])).length,2);
  for(const request of requests){assert.equal(request.response_format.type,'json_schema');assert.equal(request.response_format.json_schema.strict,true);assert.equal(request.response_format.json_schema.name,'ourworld_profile_layout');assert.deepEqual(request.response_format.json_schema.schema.properties.blocks.items.properties.type.enum,BLOCK_TYPES);assert.equal(request.reasoning_effort,undefined,'Do not send DeepSeek-specific options to another provider');}
  releaseModels=true;for(const response of held)answer(response);
  await Promise.all(generationFinished);
  for(const id of ids){const row=await one('SELECT status,layout FROM layout_jobs WHERE id=$1',[id]);assert.equal(row?.status,'ready');assert.equal(row?.layout.blocks[0].title,undefined);}
  assert.equal((await query('SELECT user_id FROM profile_publications WHERE user_id=ANY($1::text[])',[users])).length,0,'Protocol generation must never publish');
  for(const mode of ['json','plain'] as const){config.llmFormat=mode;const id=await addRecord(users[0]);await processLayout(id);assert.equal((await one('SELECT status FROM layout_jobs WHERE id=$1',[id]))?.status,'ready');const sent=requests.at(-1);if(mode==='json')assert.deepEqual(sent.response_format,{type:'json_object'});else assert.equal(sent.response_format,undefined);}
 } finally {
  releaseModels=true;for(const response of held)answer(response);
  if(processors)await processors.close();
  await Promise.all([mailEvents.close(),layoutEvents.close()]);
  await Promise.all([mailQueue.obliterate({force:true}),layoutQueue.obliterate({force:true})]);await Promise.all([mailQueue.close(),layoutQueue.close()]);
  await Promise.all([mailEventConnection.quit().catch(()=>{}),layoutEventConnection.quit().catch(()=>{})]);
  await query('UPDATE users SET active=false WHERE id=ANY($1::text[])',[users]);
  Object.assign(config,{llmBase:old.base,llmKey:old.key,llmModel:old.model,llmFormat:old.format});
  await new Promise<void>(resolve=>server.close(()=>resolve()));
  await mailTasks.close();await layoutTasks.close();await queueConnection.quit();await redis.quit().catch(()=>{});await pool.end();
 }
});
