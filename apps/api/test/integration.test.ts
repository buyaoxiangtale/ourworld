import { test,before,after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID,randomInt } from 'node:crypto';
import { buildApp } from '../src/main.js';
import { AppService } from '../src/service.js';
import { pool,query,one } from '../src/db.js';
import { redis,mailTasks,layoutTasks,queueConnection,initStorage,mediaUrl } from '../src/infrastructure.js';
import { hashPassword } from '../src/security.js';
import { DEFAULT_LAYOUT } from '@ourworld/contracts';
import { config } from '../src/config.js';
import { openDueTrips } from '../src/worker.js';

let instance:any;let tokenA:string,tokenB:string,tokenC:string,tokenAdmin:string,tokenUnverified:string;
const prefix=`test-${randomUUID()}`;const a=`${prefix}-a`,b=`${prefix}-b`,c=`${prefix}-c`,admin=`${prefix}-admin`,unverified=`${prefix}-unverified`;
const all=[a,b,c,admin,unverified];let conversationId='';const testPlaces:string[]=[];
const testIp=`198.18.${randomInt(256)}.${randomInt(256)}`;
async function request(method:string,url:string,token?:string,payload?:any):Promise<any>{return instance.server.inject({method,url:`/api/v1${url}`,remoteAddress:testIp,headers:token?{authorization:`Bearer ${token}`}:{},...(payload!==undefined?{payload}:{})});}
before(async()=>{
 await redis.connect().catch((e:any)=>{if(!e.message.includes('already'))throw e;});await initStorage();
 instance=await buildApp();const service=new AppService();const hash=await hashPassword('Integration password 2026!');const tokens=[];
 for(const id of all){const row=(await query('INSERT INTO users(id,email,password_hash,name,verified,role,provider_status,city_ids) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',[id,`${id}@ourworld.test`,hash,id,id!==unverified,id===admin?'admin':'user',id===b?'approved':'none',['city-paris']]))[0];tokens.push((await service.tokens(row)).accessToken);await query('INSERT INTO profile_drafts(user_id,layout) VALUES($1,$2)',[id,JSON.stringify(DEFAULT_LAYOUT)]);}
 [tokenA,tokenB,tokenC,tokenAdmin,tokenUnverified]=tokens;
 await query('INSERT INTO profile_publications(user_id,revision,layout) VALUES($1,1,$2)',[a,JSON.stringify(DEFAULT_LAYOUT)]);
});
after(async()=>{
 await query('UPDATE users SET active=false WHERE id=ANY($1::text[])',[all]);await query('UPDATE sessions SET revoked=true WHERE user_id=ANY($1::text[])',[all]);
 for(const kind of ['attraction','city','country'])await query('DELETE FROM places WHERE id=ANY($1::text[]) AND kind=$2',[testPlaces,kind]);
 if(instance)await instance.close();await mailTasks.close();await layoutTasks.close();await queueConnection.quit();await redis.quit();await pool.end();
});

test('authentication and verification gates protect write operations',async()=>{
 assert.equal((await request('GET','/conversations')).statusCode,401);
 assert.equal((await request('POST','/conversations/direct',tokenUnverified,{userId:b})).statusCode,403);
 assert.equal((await request('GET','/admin/users',tokenA)).statusCode,403);
 const me=await request('GET','/me',tokenA);assert.equal(me.statusCode,200);assert.equal(me.json().password_hash,undefined);
});
test('school and education can be saved, read publicly, cleared and validated independently',async()=>{
 const saved=await request('PATCH','/me',tokenC,{school:'  复旦大学  ',educationLevel:'bachelor'});assert.equal(saved.statusCode,200);assert.equal(saved.json().school,'复旦大学');assert.equal(saved.json().educationLevel,'bachelor');
 const publicProfile=await request('GET',`/users/${c}`);assert.equal(publicProfile.statusCode,200);assert.equal(publicProfile.json().user.school,'复旦大学');assert.equal(publicProfile.json().user.educationLevel,'bachelor');
 const invalid=await request('PATCH','/me',tokenC,{educationLevel:'made-up-degree'});assert.equal(invalid.statusCode,400);
 const tooLong=await request('PATCH','/me',tokenC,{school:'学'.repeat(121)});assert.equal(tooLong.statusCode,400);
 const retained=await request('GET','/me',tokenC);assert.equal(retained.json().school,'复旦大学');assert.equal(retained.json().educationLevel,'bachelor');
 const cleared=await request('PATCH','/me',tokenC,{school:null,educationLevel:null});assert.equal(cleared.statusCode,200);assert.equal(cleared.json().school,undefined);assert.equal(cleared.json().educationLevel,undefined);
});

test('the city catalogue paginates completely and supports bilingual and alias search',async()=>{
 const expected=(await query("SELECT id FROM places WHERE kind='city' ORDER BY name->>'en',id")).map(row=>row.id);const collected:string[]=[];let offset=0;
 do{const result=await request('GET',`/places?kind=city&limit=7&offset=${offset}`);assert.equal(result.statusCode,200);const page=result.json();assert(page.items.length<=7);assert(page.items.every((place:any)=>place.kind==='city'));collected.push(...page.items.map((place:any)=>place.id));if(page.nextOffset===null)break;assert(page.nextOffset>offset);offset=page.nextOffset;}while(true);
 assert.deepEqual(collected,expected);assert.equal(new Set(collected).size,collected.length);
 for(const search of ['巴黎','Paris','city of light']){const result=await request('GET',`/places?kind=city&q=${encodeURIComponent(search)}&limit=7`);assert.equal(result.statusCode,200);assert(result.json().items.some((place:any)=>place.id==='city-paris'));}
 for(const [search,id] of [['lon','city-london'],['Paris, France','city-paris'],['new  york','city-new-york'],['Ｌｏｎｄｏｎ','city-london']]){
  const result=await request('GET',`/places?q=${encodeURIComponent(search)}&limit=1`);
  assert.equal(result.statusCode,200);assert.equal(result.json().items[0]?.id,id);
 }
 for(const query of ['limit=0','limit=251','offset=-1','offset=abc'])assert.equal((await request('GET',`/places?kind=city&${query}`)).statusCode,400);
});

test('dedicated service-city updates preserve education and reject non-city references',async()=>{
 assert.equal((await request('PATCH','/me',tokenC,{school:'同济大学',educationLevel:'master'})).statusCode,200);
 const cities=['city-paris','city-tokyo'];const saved=await request('PATCH','/me',tokenC,{cityIds:cities});assert.equal(saved.statusCode,200);assert.deepEqual(saved.json().cityIds,cities);assert.equal(saved.json().school,'同济大学');assert.equal(saved.json().educationLevel,'master');
 const details=await request('PATCH','/me',tokenC,{school:'上海交通大学'});assert.equal(details.statusCode,200);assert.deepEqual(details.json().cityIds,cities);
 const invalid=await request('PATCH','/me',tokenC,{cityIds:['country-france']});assert.equal(invalid.statusCode,400);assert.equal(invalid.json().code,'INVALID_CITY');
 const unchanged=await request('GET','/me',tokenC);assert.deepEqual(unchanged.json().cityIds,cities);assert.equal(unchanged.json().school,'上海交通大学');
 const cleared=await request('PATCH','/me',tokenC,{cityIds:[]});assert.equal(cleared.statusCode,200);assert.deepEqual(cleared.json().cityIds,[]);assert.equal(cleared.json().educationLevel,'master');
});

test('concurrent right swipes produce a single conversation',async()=>{
 const responses=await Promise.all(Array.from({length:8},()=>request('POST','/conversations/direct',tokenA,{userId:b,cityId:'city-paris'})));
 for(const response of responses)assert.equal(response.statusCode,200,response.body);
 assert.equal(new Set(responses.map(r=>r.json().id)).size,1);conversationId=responses[0].json().id;
 const opposite=await request('POST','/conversations/direct',tokenB,{userId:a,cityId:'city-tokyo'});assert.equal(opposite.json().id,conversationId);
 assert.equal((await query('SELECT id FROM conversations WHERE user_a=LEAST($1::text,$2::text) AND user_b=GREATEST($1::text,$2::text)',[a,b])).length,1);
});
test('message retries are idempotent, ordered, and private even from administrators',async()=>{
 const payload={clientMessageId:randomUUID(),type:'text',body:'A real persisted message'};
 const results=await Promise.all(Array.from({length:8},()=>request('POST',`/conversations/${conversationId}/messages`,tokenA,payload)));
 for(const r of results)assert.equal(r.statusCode,200,r.body);assert.equal(new Set(results.map(r=>r.json().id)).size,1);
 assert.equal((await query('SELECT id FROM messages WHERE sender_id=$1 AND client_message_id=$2',[a,payload.clientMessageId])).length,1);
 assert.equal((await request('GET',`/conversations/${conversationId}/messages`,tokenC)).statusCode,404);
 assert.equal((await request('GET',`/conversations/${conversationId}/messages`,tokenAdmin)).statusCode,404);
 const second=await request('POST',`/conversations/${conversationId}/messages`,tokenB,{clientMessageId:randomUUID(),type:'contact',body:'You can reach me by email',data:{label:'Email',value:'local@example.test'}});
 assert.equal(second.json().sequence,results[0].json().sequence+1);
 await request('PUT',`/conversations/${conversationId}/read`,tokenA,{sequence:second.json().sequence});await request('PUT',`/conversations/${conversationId}/read`,tokenA,{sequence:1});
 assert.equal((await one('SELECT sequence FROM read_positions WHERE conversation_id=$1 AND user_id=$2',[conversationId,a]))!.sequence,second.json().sequence);
});
test('blocking prevents new conversations and messages in both directions',async()=>{
 assert.equal((await request('PUT',`/blocks/${a}`,tokenB)).statusCode,200);
 assert.equal((await request('POST','/conversations/direct',tokenA,{userId:b})).statusCode,403);
 assert.equal((await request('POST',`/conversations/${conversationId}/messages`,tokenB,{clientMessageId:randomUUID(),type:'text',body:'Blocked'})).statusCode,403);
 assert.equal((await request('DELETE',`/blocks/${a}`,tokenB)).statusCode,200);
});
test('private drafts never leak and stale candidates cannot overwrite edits',async()=>{
 const first=(await request('GET','/profile/draft',tokenA)).json();const forest={...DEFAULT_LAYOUT,theme:'forest'};
 const save=await request('PUT','/profile/draft',tokenA,{revision:first.revision,layout:forest});assert.equal(save.statusCode,200,save.body);
 assert.equal((await request('GET',`/users/${a}`)).json().layout.theme,'nocturne');
 assert.equal((await request('POST','/profile/publish',tokenA,{revision:first.revision})).statusCode,409);
 const publish=await request('POST','/profile/publish',tokenA,{revision:save.json().revision});assert.equal(publish.statusCode,200,publish.body);
 assert.equal((await request('GET',`/users/${a}`)).json().layout.theme,'forest');
 const jobId=randomUUID();await query("INSERT INTO layout_jobs(id,user_id,status,base_revision,base_layout,prompt,layout) VALUES($1,$2,'ready',$3,$4,'test candidate',$5)",[jobId,a,save.json().revision,JSON.stringify(forest),JSON.stringify({...DEFAULT_LAYOUT,theme:'ocean'})]);
 const next=await request('PUT','/profile/draft',tokenA,{revision:save.json().revision,layout:DEFAULT_LAYOUT});
 assert.equal((await request('POST',`/profile/jobs/${jobId}/apply`,tokenA,{revision:next.json().revision})).statusCode,409);
 assert.equal((await request('GET','/profile/draft',tokenA)).json().layout.theme,'nocturne');
 assert.equal((await request('GET',`/profile/jobs/${jobId}`,tokenB)).statusCode,404);
});
test('independent travel prompt cards save, publish and reject stale revisions',async()=>{
 const before=await request('GET','/profile/draft',tokenC);assert.equal(before.statusCode,200);const draft=before.json();
 const prompts=[{question:'我最爱的城市角落',answer:'清晨安静的河岸。'}];
 const layout={...draft.layout,blocks:[...draft.layout.blocks.filter((b:any)=>b.type!=='prompts'),{id:'card-prompts',type:'prompts',span:2,size:'compact',prompts}]};
 const saved=await request('PUT','/profile/draft',tokenC,{revision:draft.revision,layout});assert.equal(saved.statusCode,200);const revision=saved.json().revision;
 const published=await request('POST','/profile/publish',tokenC,{revision});assert.equal(published.statusCode,200);
 const profile=await request('GET',`/users/${c}`,tokenC);assert.equal(profile.statusCode,200);assert.deepEqual(profile.json().layout.blocks.find((b:any)=>b.type==='prompts').prompts,prompts);
 const stale=await request('PUT','/profile/draft',tokenC,{revision:draft.revision,layout});assert.equal(stale.statusCode,409);assert.equal(stale.json().code,'REVISION_CONFLICT');
 const unchanged=await request('GET',`/users/${c}`,tokenC);assert.deepEqual(unchanged.json().layout.blocks.find((b:any)=>b.type==='prompts').prompts,prompts);
});

test('bio and photo stories save independently and publish only owned public photos',async()=>{
 const before=(await request('GET','/me',tokenC)).json();
 const biography='喜欢城市漫步，愿意分享照片背后的故事。';
 const updated=await request('PATCH','/me',tokenC,{bio:biography});assert.equal(updated.statusCode,200,updated.body);
 assert.equal(updated.json().name,before.name);assert.deepEqual(updated.json().tags,before.tags);
 const photo=randomUUID(),foreign=randomUUID(),privatePhoto=randomUUID();
 for(const [id,owner,purpose]of [[photo,c,'public'],[foreign,a,'public'],[privatePhoto,c,'verification']])await query("INSERT INTO files(id,user_id,storage_key,mime,size,purpose) VALUES($1,$2,'test/photo-story','image/jpeg',1,$3)",[id,owner,purpose]);
 const draft=(await request('GET','/profile/draft',tokenC)).json();
 const caption={id:'photo-caption',type:'gallery',span:2,size:'expanded',title:'这张照片背后的故事',content:'清晨，沿着安静的河岸散步。',refs:[mediaUrl(photo)]};
 const second={...caption,id:'photo-caption-second-story',title:'旅行中最难忘的一刻',content:'另一段独立保存的照片故事。'};
 const layout={...draft.layout,blocks:[...draft.layout.blocks,caption,second]};
 const saved=await request('PUT','/profile/draft',tokenC,{revision:draft.revision,layout});assert.equal(saved.statusCode,200,saved.body);
 assert.equal((await request('POST','/profile/publish',tokenC,{revision:saved.json().revision})).statusCode,200);
 const published=(await request('GET',`/users/${c}`)).json();assert.equal(published.user.bio,biography);
 assert.deepEqual(published.layout.blocks.find((block:any)=>block.id==='photo-caption'),caption);
 assert.deepEqual(published.layout.blocks.find((block:any)=>block.id===second.id),second);
 for(const id of [foreign,privatePhoto]){
  const invalid={...layout,blocks:[{...caption,refs:[mediaUrl(id)]}]};
  assert.equal((await request('PUT','/profile/draft',tokenC,{revision:saved.json().revision,layout:invalid})).statusCode,400);
 }
 const editedLayout={...layout,blocks:layout.blocks.map((block:any)=>block.id===caption.id?{...block,content:'已编辑的第一条故事。'}:block)};
 const edited=await request('PUT','/profile/draft',tokenC,{revision:saved.json().revision,layout:editedLayout});assert.equal(edited.statusCode,200,edited.body);
 assert.equal((await request('POST','/profile/publish',tokenC,{revision:edited.json().revision})).statusCode,200);
 const afterEdit=(await request('GET',`/users/${c}`)).json();assert.equal(afterEdit.layout.blocks.find((block:any)=>block.id===caption.id).content,'已编辑的第一条故事。');assert.deepEqual(afterEdit.layout.blocks.find((block:any)=>block.id===second.id),second);
 const remaining={...editedLayout,blocks:editedLayout.blocks.filter((block:any)=>block.id!==caption.id)};
 const removedOne=await request('PUT','/profile/draft',tokenC,{revision:edited.json().revision,layout:remaining});assert.equal(removedOne.statusCode,200,removedOne.body);
 assert.equal((await request('POST','/profile/publish',tokenC,{revision:removedOne.json().revision})).statusCode,200);
 const afterRemove=(await request('GET',`/users/${c}`)).json();assert(!afterRemove.layout.blocks.some((block:any)=>block.id===caption.id));assert.deepEqual(afterRemove.layout.blocks.find((block:any)=>block.id===second.id),second);
 const removed=await request('PUT','/profile/draft',tokenC,{revision:removedOne.json().revision,layout:draft.layout});assert.equal(removed.statusCode,200,removed.body);
 assert.equal((await request('POST','/profile/publish',tokenC,{revision:removed.json().revision})).statusCode,200);
 const restored=(await request('GET',`/users/${c}`)).json();assert.deepEqual(restored.layout.blocks,draft.layout.blocks);assert.equal(restored.user.bio,biography);
});

test('gallery references cannot expose private verification files or foreign media',async()=>{
 const fileId=randomUUID();await query("INSERT INTO files(id,user_id,storage_key,mime,size,purpose) VALUES($1,$2,'test/private','image/png',1,'verification')",[fileId,a]);
 const d=(await request('GET','/profile/draft',tokenA)).json();
 const layout={...DEFAULT_LAYOUT,blocks:[{id:'private-image',type:'gallery',span:2,size:'expanded',refs:[mediaUrl(fileId)]}]};
 assert.equal((await request('PUT','/profile/draft',tokenA,{revision:d.revision,layout})).statusCode,400);
 assert.equal((await request('GET',`/media/${fileId}`)).statusCode,403);
 layout.blocks[0].refs=['https://attacker.example/image.jpg'];
 assert.equal((await request('PUT','/profile/draft',tokenA,{revision:d.revision,layout})).statusCode,400);
});
test('a frozen trip blocks all review paths and each participant reviews once',async()=>{
 const made=await request('POST',`/conversations/${conversationId}/trips`,tokenA,{cityId:'city-paris',title:'Integration walk',endAt:new Date(Date.now()+86400000).toISOString()});assert.equal(made.statusCode,200,made.body);const id=made.json().id;
 assert.equal((await request('POST',`/trips/${id}/accept`,tokenA)).statusCode,403);
 assert.equal((await request('POST',`/trips/${id}/reviews`,tokenA,{rating:5,body:'Too early'})).statusCode,409);
 assert.equal((await request('POST',`/trips/${id}/accept`,tokenB)).json().status,'active');
 await request('POST',`/admin/trips/${id}/action`,tokenAdmin,{action:'freeze',reason:'Review investigation'});
 assert.equal((await request('POST',`/trips/${id}/confirm-end`,tokenA)).statusCode,409);
 assert.equal((await request('POST',`/admin/trips/${id}/action`,tokenAdmin,{action:'open',reason:'Must remain frozen'})).statusCode,409);
 await query("UPDATE trips SET end_at=now()-interval '1 minute' WHERE id=$1",[id]);await openDueTrips();
 assert.equal((await one('SELECT status FROM trips WHERE id=$1',[id]))!.status,'active');
 await request('POST',`/admin/trips/${id}/action`,tokenAdmin,{action:'unfreeze',reason:'Resolved'});
 await request('POST',`/trips/${id}/confirm-end`,tokenA);const ended=await request('POST',`/trips/${id}/confirm-end`,tokenB);assert.equal(ended.json().status,'reviewable');
 assert.equal((await request('POST',`/trips/${id}/reviews`,tokenA,{rating:5,body:'A lovely walk'})).statusCode,200);
 assert.equal((await request('POST',`/trips/${id}/reviews`,tokenA,{rating:1,body:'Duplicate'})).statusCode,409);
 assert.equal((await request('POST',`/trips/${id}/reviews`,tokenB,{rating:5,body:'Great company'})).statusCode,200);
});
test('scheduled and administrator review opening both require an accepted trip',async()=>{
 const scheduled=(await request('POST',`/conversations/${conversationId}/trips`,tokenA,{cityId:'city-paris',title:'Earlier trip',endAt:new Date(Date.now()-60000).toISOString()})).json();
 assert.equal((await request('POST',`/trips/${scheduled.id}/accept`,tokenB)).json().openedBy,'scheduled');
 const manual=(await request('POST',`/conversations/${conversationId}/trips`,tokenA,{cityId:'city-paris',title:'Manual completion',endAt:new Date(Date.now()+86400000).toISOString()})).json();
 assert.equal((await request('POST',`/admin/trips/${manual.id}/action`,tokenAdmin,{action:'open',reason:'Unaccepted'})).statusCode,409);
 await request('POST',`/trips/${manual.id}/accept`,tokenB);assert.equal((await request('POST',`/admin/trips/${manual.id}/action`,tokenAdmin,{action:'open',reason:'Completion verified'})).json().openedBy,'admin');
});
test('only participants can report private message evidence',async()=>{
 const message=(await request('GET',`/conversations/${conversationId}/messages`,tokenA)).json().items[0];
 assert.equal((await request('POST','/reports',tokenC,{targetType:'message',targetId:message.id,reason:'Not my message'})).statusCode,404);
 assert.equal((await request('POST','/reports',tokenA,{targetType:'message',targetId:message.id,reason:'Please investigate this message'})).statusCode,200);
 const reports=(await request('GET','/admin/reports',tokenAdmin)).json();assert(reports.items.some((r:any)=>r.evidence?.message?.id===message.id));
});
test('random snapshots do not repeat people across pages',async()=>{
 const first=await request('GET','/cities/city-paris/people-feed',tokenA);assert.equal(first.statusCode,200,first.body);const page=first.json();assert(page.items.length>0);
 const next=await request('GET',`/cities/city-paris/people-feed?feedId=${page.feedId}&cursor=${page.nextCursor}`,tokenA);assert.equal(next.statusCode,200,next.body);
 const ids=[...page.items,...next.json().items].map((x:any)=>x.id);assert.equal(new Set(ids).size,ids.length);
});
test('an unconfigured model explicitly fails instead of generating a simulated layout',async()=>{
 if(config.llmKey)return;const d=(await request('GET','/profile/draft',tokenC)).json();const r=await request('POST','/profile/jobs',tokenC,{prompt:'Put photos first',baseRevision:d.revision});assert.equal(r.statusCode,503);assert.equal(r.json().code,'MODEL_NOT_CONFIGURED');
});
test('registration is immediately usable, refresh rotation and password reset work together',async()=>{
 const email=`${prefix}-registered@ourworld.test`,original='Original password 2026!',changed='Changed password 2026!';
 const registered=await request('POST','/auth/register',undefined,{email,password:original,name:'Email flow test'});assert.equal(registered.statusCode,200,registered.body);const account=registered.json();all.push(account.user.id);assert.equal(account.user.verified,true);
 const mails=await mailTasks.getJobs(['waiting','active','completed','delayed'],0,200);
 const verification=mails.find(j=>j.data.to===email&&j.data.subject.includes('Verify'));assert(!verification,'No verification email should be queued anymore');
 assert.equal((await request('POST','/auth/verify',undefined,{token:'not-an-issued-token'})).statusCode,400);
 const refreshed=await instance.server.inject({method:'POST',url:'/api/v1/auth/refresh',headers:{authorization:'Bearer deliberately-expired'},payload:{refreshToken:account.refreshToken}});assert.equal(refreshed.statusCode,200,refreshed.body);
 assert.equal((await request('POST','/auth/refresh',undefined,{refreshToken:account.refreshToken})).statusCode,401);
 assert.equal((await request('POST','/auth/forgot',undefined,{email})).statusCode,200);
 const resetMails=await mailTasks.getJobs(['waiting','active','completed','delayed'],0,200);const mail=resetMails.find(j=>j.data.to===email&&j.data.subject.includes('Reset'));assert(mail);
 const resetToken=mail.data.text.match(/Reset token: (\S+)/)[1];assert.equal((await request('POST','/auth/reset',undefined,{token:resetToken,password:changed})).statusCode,200);
 assert.equal((await request('GET','/me',refreshed.json().accessToken)).statusCode,401);
 assert.equal((await request('POST','/auth/login',undefined,{email,password:original})).statusCode,401);
 assert.equal((await request('POST','/auth/login',undefined,{email,password:changed})).statusCode,200);
});
test('S3 uploads enforce file purpose and short-lived private download signatures',async()=>{
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aSfcAAAAASUVORK5CYII=','base64');
 const upload=async(purpose:string)=>{
  const boundary=`ourworld-${randomUUID()}`;
  const payload=Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="purpose"\r\n\r\n${purpose}\r\n--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="pixel.png"\r\nContent-Type: image/png\r\n\r\n`),png,Buffer.from(`\r\n--${boundary}--\r\n`)]);
  const response=await instance.server.inject({method:'POST',url:'/api/v1/uploads',headers:{authorization:`Bearer ${tokenA}`,'content-type':`multipart/form-data; boundary=${boundary}`},payload});assert.equal(response.statusCode,200,response.body);return response.json();
 };
 const privateFile=await upload('verification');assert(privateFile.url.includes('sig='));
 const address=new URL(privateFile.url);const signed=await instance.server.inject({method:'GET',url:address.pathname+address.search});assert.equal(signed.statusCode,200,signed.body);assert.equal(signed.headers['cache-control'],'private, no-store');
 assert.equal((await request('GET',`/media/${privateFile.id}`)).statusCode,403);
 assert.equal((await request('POST',`/conversations/${conversationId}/messages`,tokenA,{clientMessageId:randomUUID(),type:'image',body:privateFile.url,data:{fileId:privateFile.id}})).statusCode,400);
 const publicFile=await upload('public');assert(!publicFile.url.includes('sig='));assert.equal((await request('GET',`/media/${publicFile.id}`)).statusCode,200);
 const d=(await request('GET','/profile/draft',tokenA)).json();const layout={...DEFAULT_LAYOUT,blocks:[{id:'own-image',type:'gallery',span:2,size:'expanded',refs:[publicFile.url]}]};
 assert.equal((await request('PUT','/profile/draft',tokenA,{revision:d.revision,layout})).statusCode,200);
});
const countryId=`${prefix}-country`,cityA=`${prefix}-city-a`,cityB=`${prefix}-city-b`,attractionId=`${prefix}-attraction`;
test('administrators maintain localized place hierarchies with coordinates and audit records',async()=>{
 const country={id:countryId,kind:'country',name:{zh:'测试国家',en:'Test Country'},lat:20,lng:30,description:{zh:'',en:''},aliases:['测试别称','Country Alias']};
 assert.equal((await request('POST','/admin/places',tokenA,country)).statusCode,403);
 const created=await request('POST','/admin/places',tokenAdmin,country);assert.equal(created.statusCode,200,created.body);testPlaces.push(countryId);
 assert.equal(created.json().country,'Test Country');
 const city={kind:'city',parentId:countryId,name:{zh:'测试城市',en:'Test City'},lat:21,lng:31,description:{zh:'测试介绍',en:'Test description'},aliases:['城市别名','Walking City']};
 const first=await request('POST','/admin/places',tokenAdmin,{...city,id:cityA});assert.equal(first.statusCode,200,first.body);testPlaces.push(cityA);
 const second=await request('POST','/admin/places',tokenAdmin,{...city,id:cityB,name:{zh:'第二城市',en:'Second City'}});assert.equal(second.statusCode,200,second.body);testPlaces.push(cityB);
 assert.equal((await request('POST','/admin/places',tokenAdmin,{...city,lat:91})).statusCode,400);
 assert.equal((await request('POST','/admin/places',tokenAdmin,{...city,parentId:cityA})).statusCode,400);
 const attraction=await request('POST','/admin/places',tokenAdmin,{...city,id:attractionId,kind:'attraction',parentId:cityA,name:{zh:'测试景点',en:'Test Attraction'}});assert.equal(attraction.statusCode,200,attraction.body);testPlaces.push(attractionId);
 assert.equal((await request('PATCH',`/admin/places/${attractionId}`,tokenAdmin,{parentId:countryId})).statusCode,400);
 assert.equal((await request('PATCH',`/admin/places/${cityA}`,tokenAdmin,{kind:'country',parentId:null})).statusCode,409);
 assert.equal((await request('PATCH',`/admin/places/${countryId}`,tokenAdmin,{parentId:countryId})).statusCode,400);
 const renamed=await request('PATCH',`/admin/places/${countryId}`,tokenAdmin,{name:{zh:'新测试国家',en:'Renamed Country'}});assert.equal(renamed.statusCode,200,renamed.body);
 assert.equal((await request('GET',`/places/${cityA}`)).json().country,'Renamed Country');assert.equal((await request('GET',`/places/${attractionId}`)).json().country,'Renamed Country');
 assert.equal((await request('PATCH',`/admin/places/${cityA}`,tokenAdmin,{aliases:['漫步城市','Walking Alias']})).statusCode,200);
 assert((await request('GET','/places?q=Walking%20Alias')).json().items.some((p:any)=>p.id===cityA));
 const audit=(await request('GET','/admin/audit',tokenAdmin)).json().items;assert(audit.some((r:any)=>r.targetId===cityA&&r.action==='place.create'));assert(audit.some((r:any)=>r.targetId===cityA&&r.action==='place.update'));
});
test('accepted trip amendments preserve history and require the other participant to accept again',async()=>{
 const originalEnd=new Date(Date.now()+86400000).toISOString();
 const initial=(await request('POST',`/conversations/${conversationId}/trips`,tokenA,{cityId:'city-paris',title:'Original agreement',endAt:originalEnd})).json();
 await request('POST',`/trips/${initial.id}/accept`,tokenB);await request('POST',`/trips/${initial.id}/confirm-end`,tokenA);
 const before=(await request('GET',`/conversations/${conversationId}/messages`,tokenA)).json().items;
 const updatedEnd=new Date(Date.now()+172800000).toISOString();
 assert.equal((await request('PATCH',`/trips/${initial.id}`,tokenC,{endAt:updatedEnd})).statusCode,404);
 const modified=await request('PATCH',`/trips/${initial.id}`,tokenB,{endAt:updatedEnd,title:'New agreement'});assert.equal(modified.statusCode,200,modified.body);const m=modified.json();
 assert.equal(m.id,initial.id);assert.equal(m.creatorId,b);assert.equal(m.peerId,a);assert.equal(m.status,'proposed');assert.deepEqual(m.confirmations,[]);assert.equal(m.openedBy,undefined);
 assert.equal((await one('SELECT accepted_at FROM trips WHERE id=$1',[m.id]))!.accepted_at,null);
 assert.equal((await request('POST',`/trips/${m.id}/accept`,tokenB)).statusCode,403);
 assert.equal((await request('POST',`/trips/${m.id}/reviews`,tokenA,{rating:5,body:'Not accepted yet'})).statusCode,409);
 const history=(await request('GET',`/conversations/${conversationId}/messages`,tokenA)).json().items;
 for(const old of before)assert(history.some((message:any)=>message.id===old.id));
 const change=history.find((message:any)=>message.data.amendment&&message.data.tripId===m.id);assert(change);assert.equal(change.data.previousEndAt,originalEnd);
 const stale=await request('POST',`/trips/${m.id}/accept`,tokenA,{expectedEndAt:originalEnd});assert.equal(stale.statusCode,409);assert.equal(stale.json().code,'TRIP_CHANGED');assert.equal((await one('SELECT accepted_at FROM trips WHERE id=$1',[m.id]))!.accepted_at,null);
 const equivalentOffset=new Date(Date.parse(updatedEnd)+2*3600000).toISOString().replace('Z','+02:00');
 assert.equal((await request('POST',`/trips/${m.id}/accept`,tokenA,{expectedEndAt:equivalentOffset})).json().status,'active');
 await request('POST',`/admin/trips/${m.id}/action`,tokenAdmin,{action:'freeze',reason:'Freeze amendment'});
 assert.equal((await request('PATCH',`/trips/${m.id}`,tokenA,{endAt:updatedEnd})).statusCode,409);
 await request('POST',`/admin/trips/${m.id}/action`,tokenAdmin,{action:'unfreeze',reason:'Resolved'});await request('POST',`/admin/trips/${m.id}/action`,tokenAdmin,{action:'open',reason:'Service confirmed'});
 assert.equal((await request('POST',`/trips/${m.id}/reviews`,tokenA,{rating:5,body:'Completed service'})).statusCode,200);
 assert.equal((await request('PATCH',`/trips/${m.id}`,tokenB,{endAt:originalEnd})).statusCode,409);
 const cancelled=(await request('POST',`/conversations/${conversationId}/trips`,tokenA,{cityId:'city-paris',title:'Cancelled agreement',endAt:updatedEnd})).json();await request('POST',`/trips/${cancelled.id}/cancel`,tokenA);
 assert.equal((await request('PATCH',`/trips/${cancelled.id}`,tokenA,{endAt:originalEnd})).statusCode,409);
});
test('multi-city coverage remains random and fixed for the whole feed round',async()=>{
 await query("UPDATE users SET provider_status='approved',city_ids=$2 WHERE id=$1",[a,[cityA]]);
 await query("UPDATE users SET provider_status='approved',city_ids=$2 WHERE id=$1",[b,[cityA,cityB]]);
 await query("UPDATE users SET provider_status='approved',city_ids=$2 WHERE id=$1",[c,[cityB]]);
 const any=(await request('GET',`/cities/${cityA}/people-feed?cityIds=${cityB},${cityA}&coverage=any`,tokenAdmin)).json();assert.deepEqual(new Set(any.items.map((p:any)=>p.id)),new Set([a,b,c]));
 const all=(await request('GET',`/cities/${cityA}/people-feed?cityIds=${cityA},${cityB}&coverage=all`,tokenAdmin)).json();assert.deepEqual(all.items.map((p:any)=>p.id),[b]);
 const continued=await request('GET',`/cities/${cityA}/people-feed?feedId=${any.feedId}&cursor=0`,tokenAdmin);assert.equal(continued.statusCode,200,continued.body);assert.equal(continued.json().items.length,3);
 assert.equal((await request('GET',`/cities/${cityA}/people-feed?feedId=${any.feedId}&cursor=0&cityIds=${cityA}`,tokenAdmin)).statusCode,409);
 assert.equal((await request('GET',`/cities/${cityA}/people-feed?feedId=${any.feedId}&cursor=0&coverage=all`,tokenAdmin)).statusCode,409);
 const reordered=await request('GET',`/cities/${cityA}/people-feed?feedId=${any.feedId}&cursor=0&cityIds=${cityA},${cityB}&coverage=any`,tokenAdmin);assert.equal(reordered.statusCode,200,reordered.body);
 const single=(await request('GET',`/cities/${cityA}/people-feed`,tokenAdmin)).json();assert.deepEqual(new Set(single.items.map((p:any)=>p.id)),new Set([a,b]));
 await query('UPDATE users SET city_ids=$2 WHERE id=$1',[b,[cityB]]);
 assert.equal((await request('GET',`/cities/${cityA}/people-feed?feedId=${all.feedId}&cursor=0`,tokenAdmin)).json().items.length,0);
 assert.equal((await request('GET',`/cities/${cityA}/people-feed?coverage=rank`,tokenAdmin)).statusCode,400);
 assert.equal((await request('GET',`/cities/${cityA}/people-feed?cityIds=unknown-city`,tokenAdmin)).statusCode,400);
});
