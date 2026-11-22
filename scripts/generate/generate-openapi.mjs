import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve,dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const text=readFileSync(resolve(root,'apps/api/src/routes.ts'),'utf8');
const routes=[...text.matchAll(/add\('([A-Z]+)','([^']+)'/g)].map(m=>[m[1],m[2]]);
for(const name of ['overview','users','verifications','reports','trips','posts','places','audit'])routes.push(['GET','/admin/'+name]);
for(const action of ['accept','confirm-end','cancel'])routes.push(['POST','/trips/:id/'+action]);
const string={type:'string'},id={type:'string',description:'Opaque resource identifier'},date={type:'string',format:'date-time'};
const ref=name=>({$ref:'#/components/schemas/'+name});
const object=(properties,required=[])=>({type:'object',properties,...(required.length?{required}:{} )});
const array=items=>({type:'array',items});
const localized=object({zh:string,en:string},['zh','en']);
const schemas={
 Error:object({code:string,message:string,requestId:string},['code','message']),
 User:object({id,name:string,avatar:string,bio:string,verified:{type:'boolean'},providerStatus:{enum:['none','pending','approved','rejected']},role:{enum:['user','admin']},accountType:{enum:['individual','agency']},priceRange:object({min:{type:'number',minimum:0,maximum:1000000},max:{type:'number',minimum:0,maximum:1000000},currency:{enum:['USD','CNY','EUR','GBP','JPY']},unit:{enum:['hour','half-day','day','experience']}},['min','max','currency','unit']),experienceYears:{type:'integer',minimum:0,maximum:90},languages:array({type:'string',maxLength:30}),school:{type:'string',maxLength:120},educationLevel:{enum:['high-school','vocational','associate','bachelor','master','doctorate','other']},tags:array(string),cityIds:array(id),quote:string},['id','name','avatar','bio','verified','providerStatus','role','accountType','tags','cityIds']),
 Place:object({id,kind:{enum:['country','city','attraction']},parentId:id,country:string,name:localized,lat:{type:'number',minimum:-90,maximum:90},lng:{type:'number',minimum:-180,maximum:180},description:localized,image:string,aliases:array(string)},['id','kind','country','name','lat','lng','description','image']),
 ProfileBlock:object({id,type:{enum:['intro','prompts','gallery','experiences','skills','cities','packages','posts','reviews','social']},span:{enum:[1,2]},size:{enum:['compact','expanded']},title:string,content:string,refs:array(string),prompts:array(object({question:string,answer:string},['question','answer']))},['id','type','span','size']),
 ProfileLayout:object({schemaVersion:{const:1},theme:{enum:['ocean','forest','nocturne']},accent:{type:'string',pattern:'^#[0-9a-fA-F]{6}$'},blocks:array(ref('ProfileBlock'))},['schemaVersion','theme','accent','blocks']),
 ProfileDraft:object({revision:{type:'integer'},layout:ref('ProfileLayout'),publishedRevision:{type:['integer','null']}},['revision','layout','publishedRevision']),
 LayoutJob:object({id,status:{enum:['queued','running','validating','ready','failed','cancelled']},baseRevision:{type:'integer'},layout:ref('ProfileLayout'),error:string},['id','status','baseRevision']),
 Conversation:object({id,peer:ref('User'),cityId:id,lastMessage:string,unread:{type:'integer'},createdAt:date,updatedAt:date},['id','peer','unread','createdAt','updatedAt']),
 Message:object({id,conversationId:id,senderId:id,clientMessageId:id,sequence:{type:'integer'},type:{enum:['text','image','contact','place','package','trip']},body:string,data:object({}),createdAt:date},['id','conversationId','senderId','clientMessageId','sequence','type','body','createdAt']),
 Trip:object({id,conversationId:id,creatorId:id,peerId:id,cityId:id,title:string,endAt:date,status:{enum:['proposed','active','reviewable','cancelled']},frozen:{type:'boolean'},confirmations:array(id),openedBy:{enum:['scheduled','mutual','admin']}},['id','conversationId','creatorId','peerId','cityId','title','endAt','status','frozen','confirmations']),
 Session:object({accessToken:string,refreshToken:string,user:ref('User')},['accessToken','refreshToken','user'])
};
const bodies={
 'POST /auth/register':object({email:{type:'string',format:'email'},password:{type:'string',minLength:8},name:string},['email','password','name']),
 'POST /auth/login':object({email:{type:'string',format:'email'},password:string},['email','password']),
 'POST /auth/refresh':object({refreshToken:string},['refreshToken']),
 'POST /auth/logout':object({refreshToken:string},['refreshToken']),
 'POST /auth/verify':object({token:string},['token']),
 'POST /auth/forgot':object({email:{type:'string',format:'email'}},['email']),
 'POST /auth/reset':object({token:string,password:{type:'string',minLength:8}},['token','password']),
 'PATCH /me':object({name:string,bio:string,tags:array({type:'string',maxLength:40}),cityIds:array(id),quote:{type:'string',maxLength:100},avatar:string,socialLinks:array(object({label:string,url:string},['label','url'])),accountType:{enum:['individual','agency']},priceRange:schemas.User.properties.priceRange,experienceYears:{type:['integer','null'],minimum:0,maximum:90},languages:array({type:'string',maxLength:30}),school:{type:['string','null'],maxLength:120},educationLevel:{enum:['high-school','vocational','associate','bachelor','master','doctorate','other',null]}}),
 'PUT /profile/draft':object({revision:{type:'integer'},layout:ref('ProfileLayout')},['revision','layout']),
 'POST /profile/publish':object({revision:{type:'integer'}},['revision']),
 'POST /profile/restore':object({revision:{type:'integer'}},['revision']),
 'POST /profile/jobs':object({prompt:{type:'string',minLength:2,maxLength:4000},baseRevision:{type:'integer'}},['prompt','baseRevision']),
 'POST /profile/jobs/:id/apply':object({revision:{type:'integer'}},['revision']),
 'POST /conversations/direct':object({userId:id,cityId:id},['userId']),
 'POST /conversations/:id/messages':object({clientMessageId:id,type:schemas.Message.properties.type,body:string,data:object({})},['clientMessageId','type','body']),
 'PUT /conversations/:id/read':object({sequence:{type:'integer',minimum:0}},['sequence']),
 'POST /conversations/:id/trips':object({cityId:id,title:string,endAt:date},['cityId','title','endAt']),
 'PATCH /trips/:id':object({title:string,endAt:date},['endAt']),
 'POST /trips/:id/accept':object({expectedEndAt:date}),
 'POST /trips/:id/reviews':object({rating:{type:'integer',minimum:1,maximum:5},body:string},['rating','body']),
 'POST /reports':object({targetType:{enum:['user','post','message','review','trip']},targetId:id,reason:string},['targetType','targetId','reason']),
 'POST /posts':object({cityId:id,title:string,body:string,images:array(string)},['cityId','title','body']),
 'POST /posts/:id/comments':object({body:string},['body']),
 'POST /verification':object({kind:{enum:['professional','experience','agency']},name:string,description:string,fileIds:array(id)},['kind','name','description','fileIds']),
 'POST /admin/places':ref('Place'),
 'PATCH /admin/places/:id':object(schemas.Place.properties)
};
const paths={};
for(const [method,path]of routes){
 if(path.startsWith('/assets')||path.startsWith('/seed'))continue;
 const target=path.replace(/:(\w+)/g,'{$1}');
 const parameters=[...path.matchAll(/:(\w+)/g)].map(m=>({name:m[1],in:'path',required:true,schema:string}));
 const queries=path==='/places'?['q','kind','parentId','limit','offset']:path.includes('people-feed')?['feedId','cursor','cityIds','coverage']:path.endsWith('/messages')&&method==='GET'?['before','after']:path==='/posts'?['cityId','userId','cursor']:path==='/packages'?['userId']:[];
 parameters.push(...queries.map(name=>({name,in:'query',required:false,schema:name==='limit'?{type:'integer',minimum:1,maximum:250,default:250}:name==='offset'?{type:'integer',minimum:0,maximum:1000000,default:0}:name==='coverage'?{type:'string',enum:['any','all']}:string})));
 const optional=path.startsWith('/auth/')||['/health','/ready','/places','/places/:id','/posts','/packages','/users/:id'].includes(path)&&method==='GET'||path.includes('people-feed');
 const operation={operationId:(method+'_'+path).replace(/[^a-zA-Z0-9]+/g,'_'),tags:[path.split('/')[1]],summary:method+' '+path,security:optional?[{},{bearerAuth:[]}]:[{bearerAuth:[]}],parameters,responses:{'200':{description:'Resource or page; see API_CONTRACT.md',content:{'application/json':{schema:object({})}}},'400':{description:'Invalid request',content:{'application/json':{schema:ref('Error')}}},'401':{description:'Authentication required'},'403':{description:'Not authorized'},'404':{description:'Unavailable resource'},'409':{description:'Version/state conflict'},'429':{description:'Rate limit exceeded'},'503':{description:'Dependency or model unavailable'}}};
 if(path==='/places'&&method==='GET')operation.responses['200'].content['application/json'].schema=object({items:array(ref('Place')),nextOffset:{type:['integer','null'],minimum:0}},['items','nextOffset']);
 if(bodies[method+' '+path])operation.requestBody={required:true,content:{'application/json':{schema:bodies[method+' '+path]}}};
 if(path==='/uploads'&&method==='POST')operation.requestBody={required:true,content:{'multipart/form-data':{schema:object({file:{type:'string',format:'binary'},purpose:{enum:['public','chat','verification']}},['file'])}}};
 (paths[target]||={})[method.toLowerCase()]=operation;
}
const doc={openapi:'3.1.0',info:{title:'Ourworld API',version:'0.1.0',description:'Local travel connections, no payment processing. Full behavior and response types: docs/api/contract.md and @ourworld/contracts.'},servers:[{url:'/api/v1'}],paths,components:{securitySchemes:{bearerAuth:{type:'http',scheme:'bearer',bearerFormat:'JWT'}},schemas}};
const value=JSON.stringify(doc,null,2)+'\n';
for(const name of ['docs/api/openapi.json','apps/web/public/openapi.json']){const file=resolve(root,name);mkdirSync(dirname(file),{recursive:true});writeFileSync(file,value)}
console.log('OpenAPI paths: '+Object.keys(paths).length);
