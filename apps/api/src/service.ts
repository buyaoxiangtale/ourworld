import { EDUCATION_LEVELS } from '@ourworld/contracts';
import {photographicLayout,upgradeSeedPhoto} from './photography.js';
import { randomUUID, randomInt } from 'node:crypto';
import { z } from 'zod';
import { query, one, transaction, emit, type Row } from './db.js';
import { ApiError, assert, parse, passwordSchema, hashPassword, verifyPassword, sha256, signAccess, readAccess } from './security.js';
import { randomToken, config } from './config.js';
import { redis, sendMail, mediaUrl } from './infrastructure.js';
import * as shapes from './shapes.js';
import { getDraft } from './profile-layout.js';
import type { PoolClient } from 'pg';
import { decodeJwt } from 'jose';

const text=(max=1000)=>z.string().trim().min(1).max(max);
const ids=z.array(text(100)).max(50);
const url=z.string().max(2000).refine(x=>!x||/^https?:\/\//.test(x),'Use an HTTP(S) URL');
const iso=z.string().datetime({offset:true});
const priceRange=z.object({min:z.number().min(0).max(1000000),max:z.number().min(0).max(1000000),currency:z.enum(['USD','CNY','EUR','GBP','JPY']),unit:z.enum(['hour','half-day','day','experience'])}).strict().refine(v=>v.max>=v.min,'The upper rate cannot be below the lower rate');
export class AppService {
 async authenticate(token:string):Promise<Row> {
  const session=await readAccess(token);
  const actor=await one('SELECT u.*,s.id AS session_id FROM users u JOIN sessions s ON s.user_id=u.id WHERE u.id=$1 AND s.id=$2 AND s.revoked=false AND s.expires_at>now() AND u.active=true',[session.userId,session.sessionId]);
  assert(actor,401,'UNAUTHORIZED','Session expired or account unavailable');actor.access_expires_at=decodeJwt(token).exp;return actor;
 }
 async tokens(actor:Row,c?:PoolClient):Promise<any> {
  const id=randomUUID(),refresh=`${id}.${randomToken()}`;
  const sql='INSERT INTO sessions(id,user_id,refresh_hash,expires_at) VALUES($1,$2,$3,now()+interval \'30 days\')';
  if(c) await c.query(sql,[id,actor.id,sha256(refresh)]);else await query(sql,[id,actor.id,sha256(refresh)]);
  return {accessToken:await signAccess(actor.id,id),refreshToken:refresh,user:shapes.user(actor,true)};
 }
 async register(input:unknown):Promise<any> {
  const b=parse(z.object({email:z.string().email().max(254),password:passwordSchema,name:text(80)}),input);const email=b.email.trim().toLowerCase();
  const hash=await hashPassword(b.password);
  let actor:Row;
  try { actor=(await query('INSERT INTO users(email,password_hash,name,verified) VALUES($1,$2,$3,true) RETURNING *',[email,hash,b.name]))[0]; }
  catch(error:any) { if(error.code==='23505') throw new ApiError(409,'EMAIL_EXISTS','An account with this email already exists');throw error; }
  await getDraft(actor.id);
  return this.tokens(actor);
 }
 async login(input:unknown):Promise<any> {
  const b=parse(z.object({email:z.string().email(),password:z.string().max(128)}),input);
  const actor=await one('SELECT * FROM users WHERE email=$1',[b.email.trim().toLowerCase()]);
  const valid=actor?await verifyPassword(b.password,actor.password_hash):await verifyPassword(b.password,'scrypt:unknown:00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000');
  assert(actor&&actor.active&&valid,401,'INVALID_CREDENTIALS','Email or password is incorrect');return this.tokens(actor);
 }
 async verify(input:unknown):Promise<any> {
  const b=parse(z.object({token:text(200)}),input);
  return transaction(async c=>{
   const t=(await c.query("UPDATE email_tokens SET consumed=true WHERE hash=$1 AND kind='verify' AND consumed=false AND expires_at>now() RETURNING user_id",[sha256(b.token)])).rows[0];
   assert(t,400,'INVALID_TOKEN','Verification link is invalid or expired');
   const u=(await c.query('UPDATE users SET verified=true WHERE id=$1 RETURNING *',[t.user_id])).rows[0];return {ok:true,user:shapes.user(u,true)};
  });
 }
 async forgot(input:unknown):Promise<any> {
  const b=parse(z.object({email:z.string().email()}),input);const actor=await one('SELECT id,email FROM users WHERE email=$1 AND active=true',[b.email.toLowerCase()]);
  if(actor) { const token=randomToken();await query("INSERT INTO email_tokens(hash,user_id,kind,expires_at) VALUES($1,$2,'reset',now()+interval '1 hour')",[sha256(token),actor.id]);await sendMail(actor.email,'Reset your Ourworld password / 重置密码',`Reset password:\n${config.publicBase}/?reset=${encodeURIComponent(token)}\n\nReset token: ${token}\nExpires in one hour.`); }
  return {ok:true};
 }
 async reset(input:unknown):Promise<any> {
  const b=parse(z.object({token:text(200),password:passwordSchema}),input),hash=await hashPassword(b.password);
  await transaction(async c=>{const t=(await c.query("UPDATE email_tokens SET consumed=true WHERE hash=$1 AND kind='reset' AND consumed=false AND expires_at>now() RETURNING user_id",[sha256(b.token)])).rows[0];assert(t,400,'INVALID_TOKEN','Reset link is invalid or expired');await c.query('UPDATE users SET password_hash=$2 WHERE id=$1',[t.user_id,hash]);await c.query('UPDATE sessions SET revoked=true WHERE user_id=$1',[t.user_id]);await emit(c,[t.user_id],'session.revoked',{all:true});});return {ok:true};
 }
 async refresh(input:unknown):Promise<any> {
  const b=parse(z.object({refreshToken:text(300)}),input);
  return transaction(async c=>{
   const session=(await c.query('SELECT s.*,u.active FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.refresh_hash=$1 FOR UPDATE OF s',[sha256(b.refreshToken)])).rows[0];
   assert(session&&!session.revoked&&session.active&&new Date(session.expires_at)>new Date(),401,'UNAUTHORIZED','Refresh session is invalid');
   const next=`${session.id}.${randomToken()}`;await c.query('UPDATE sessions SET refresh_hash=$2 WHERE id=$1',[session.id,sha256(next)]);
   const actor=(await c.query('SELECT * FROM users WHERE id=$1',[session.user_id])).rows[0];
   return {accessToken:await signAccess(actor.id,session.id),refreshToken:next,user:shapes.user(actor,true)};
  });
 }
 async logout(input:unknown):Promise<any> { const b=parse(z.object({refreshToken:text(300)}),input);await transaction(async c=>{const r=(await c.query('UPDATE sessions SET revoked=true WHERE refresh_hash=$1 RETURNING id,user_id',[sha256(b.refreshToken)])).rows[0];if(r)await emit(c,[r.user_id],'session.revoked',{sessionId:r.id});});return {ok:true}; }
 async editMe(actor:Row,input:unknown):Promise<any> {
  const b=parse(z.object({name:text(80).optional(),bio:z.string().max(5000).optional(),tags:z.array(text(40)).max(20).optional(),cityIds:ids.optional(),quote:z.string().max(100).optional(),avatar:url.optional(),socialLinks:z.array(z.object({label:text(50),url:url.refine(Boolean)})).max(10).optional(),accountType:z.enum(['individual','agency']).optional(),priceRange:priceRange.nullable().optional(),experienceYears:z.number().int().min(0).max(90).nullable().optional(),languages:z.array(text(30)).max(12).optional(),school:z.string().trim().max(120).nullable().optional(),educationLevel:z.enum(EDUCATION_LEVELS).nullable().optional()}).strict(),input);
  if(b.cityIds) await this.validCities(b.cityIds);
  // Switching to an agency account restarts service review: agencies must hold the
  // dedicated agency certification before they re-enter the people feed.
  const becomesAgency=b.accountType==='agency'&&actor.account_type!=='agency';
  const leavesAgency=b.accountType==='individual'&&actor.account_type==='agency';
  const current={name:actor.name,bio:actor.bio,tags:actor.tags,cityIds:actor.city_ids,quote:actor.quote,avatar:actor.avatar,socialLinks:actor.social_links,accountType:actor.account_type||'individual',priceRange:actor.price_range??null,experienceYears:actor.experience_years??null,languages:actor.languages||[],school:actor.school??null,educationLevel:actor.education_level??null,...b};
  // The type switch and the voiding of pending verifications commit together, so a
  // concurrent approval decision can never restore the previous type's access.
  const u=await transaction(async c=>{
   const row=(await c.query(`UPDATE users SET name=$2,bio=$3,tags=$4,city_ids=$5,quote=$6,avatar=$7,social_links=$8,account_type=$9,price_range=$10,experience_years=$11,languages=$12,school=$13,education_level=$14${becomesAgency||leavesAgency?",provider_status='none'":''} WHERE id=$1 RETURNING *`,[actor.id,current.name,current.bio,JSON.stringify(current.tags),current.cityIds,current.quote,current.avatar,JSON.stringify(current.socialLinks),current.accountType,current.priceRange?JSON.stringify(current.priceRange):null,current.experienceYears??null,current.languages,current.school||null,current.educationLevel])).rows[0];
   // Either direction of an account-type switch restarts service review, so any
   // pending application from the previous type must stop being approvable.
   if(becomesAgency||leavesAgency)await c.query("UPDATE verifications SET status='rejected',reason='Superseded by an account type change' WHERE user_id=$1 AND status='pending'",[actor.id]);
   return row;
  });
  return shapes.user(u,true);
 }
 async validCities(cityIds:string[]):Promise<void> { if(!cityIds.length)return;const found=await query("SELECT id FROM places WHERE kind='city' AND id=ANY($1::text[])",[cityIds]);assert(found.length===new Set(cityIds).size,400,'INVALID_CITY','One or more cities do not exist'); }
 async places(q:Record<string,any>):Promise<any> {
  const tokens=typeof q.q==='string'?q.q.slice(0,100).normalize('NFKC').toLowerCase().split(/[\s,]+/).filter(Boolean):[];
  const search=tokens.join(' ');
  const limit=parse(z.coerce.number().int().min(1).max(250).default(250),q.limit);
  const offset=parse(z.coerce.number().int().min(0).max(1000000).default(0),q.offset);
  const kind=['country','city','attraction'].includes(q.kind)?q.kind:null;
  const parentId=typeof q.parentId==='string'?q.parentId:null;
  const rows=await query(search?`
   SELECT p.*
   FROM places p
   LEFT JOIN places parent ON parent.id=p.parent_id
   CROSS JOIN LATERAL (
    SELECT lower(normalize(p.name->>'zh', NFKC)) AS zh,
           lower(normalize(p.name->>'en', NFKC)) AS en,
           ARRAY(SELECT lower(normalize(alias, NFKC)) FROM unnest(p.aliases) AS a(alias)) AS aliases,
           lower(normalize(concat_ws(' ',p.country,parent.name->>'zh',parent.name->>'en',array_to_string(parent.aliases,' ')), NFKC)) AS context
   ) AS terms
   WHERE ($2::text IS NULL OR p.kind=$2) AND ($3::text IS NULL OR p.parent_id=$3)
    AND NOT EXISTS (
     SELECT 1 FROM unnest($6::text[]) AS t(token)
     WHERE strpos(concat_ws(' ',terms.zh,terms.en,array_to_string(terms.aliases,' '),terms.context),token)=0
    )
   ORDER BY CASE
    WHEN $1 IN (terms.zh,terms.en) THEN 0
    WHEN $1=ANY(terms.aliases) THEN 1
    WHEN starts_with(terms.zh,$1) OR starts_with(terms.en,$1) THEN 2
    WHEN EXISTS (SELECT 1 FROM unnest(terms.aliases) AS a(alias) WHERE starts_with(alias,$1)) THEN 3
    WHEN strpos(concat_ws(' ',terms.zh,terms.en,array_to_string(terms.aliases,' ')),$1)>0 THEN 4
    ELSE 5
   END, CASE p.kind WHEN 'country' THEN 1 WHEN 'city' THEN 2 ELSE 3 END,p.name->>'en',p.id
   LIMIT $4 OFFSET $5
  `:`
   SELECT * FROM places WHERE ($1::text IS NULL OR kind=$1) AND ($2::text IS NULL OR parent_id=$2)
   ORDER BY CASE kind WHEN 'country' THEN 1 WHEN 'city' THEN 2 ELSE 3 END,name->>'en',id
   LIMIT $3 OFFSET $4
  `,search?[search,kind,parentId,limit+1,offset,tokens]:[kind,parentId,limit+1,offset]);
  return {items:rows.slice(0,limit).map(shapes.place),nextOffset:rows.length>limit?offset+limit:null};
 }
 async getPlace(id:string):Promise<any> {const p=await one('SELECT * FROM places WHERE id=$1',[id]);assert(p,404,'NOT_FOUND','Place not found');return shapes.place(p);}
 async favorites(actor:Row):Promise<any> {return {items:(await query('SELECT p.* FROM places p JOIN favorites f ON f.city_id=p.id WHERE f.user_id=$1 ORDER BY f.created_at DESC',[actor.id])).map(shapes.place)};}
 async favorite(actor:Row,id:string,add:boolean):Promise<any> { await this.validCities([id]);if(add)await query('INSERT INTO favorites(user_id,city_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[actor.id,id]);else await query('DELETE FROM favorites WHERE user_id=$1 AND city_id=$2',[actor.id,id]);return {ok:true};}
 async feed(actor:Row|undefined,cityId:string,q:Record<string,any>):Promise<any> {
  await this.validCities([cityId]);const owner=actor?.id||'anonymous';let feedId=typeof q.feedId==='string'?q.feedId:undefined;let list:string[];
  assert(q.cityIds===undefined||typeof q.cityIds==='string',400,'INVALID_CITIES','cityIds must be comma-separated city identifiers');
  assert(q.coverage===undefined||q.coverage==='all'||q.coverage==='any',400,'INVALID_COVERAGE','coverage must be all or any');
  let cityIds=q.cityIds===undefined?[cityId]:[...new Set<string>((q.cityIds as string).split(',').map(x=>x.trim()).filter(Boolean))].sort();
  assert(cityIds.length>0&&cityIds.length<=20,400,'INVALID_CITIES','Choose between one and twenty cities');
  await this.validCities(cityIds);let coverage:'all'|'any'=q.coverage||'any';
  if(feedId) {
   const raw=await redis.get(`feed:${owner}:${cityId}:${feedId}`);assert(raw,410,'FEED_EXPIRED','This round expired. Start a new round.');const snapshot=JSON.parse(raw);
   const stored=Array.isArray(snapshot)?{ids:snapshot,cityIds:[cityId],coverage:'any'}:snapshot;
   if(q.cityIds!==undefined)assert(JSON.stringify(cityIds)===JSON.stringify(stored.cityIds),409,'FEED_FILTER_CONFLICT','Start a new round to change its cities');
   if(q.coverage!==undefined)assert(coverage===stored.coverage,409,'FEED_FILTER_CONFLICT','Start a new round to change its coverage');
   list=stored.ids;cityIds=stored.cityIds;coverage=stored.coverage;
  }
  else {
   const citiesCondition=coverage==='all'?'u.city_ids @> $1::text[]':'u.city_ids && $1::text[]';
   const found=await query(`SELECT u.id FROM users u WHERE u.active AND u.provider_status='approved' AND ${citiesCondition} AND u.id<>$2 AND NOT EXISTS(SELECT 1 FROM blocks b WHERE (b.user_id=$2 AND b.blocked_id=u.id) OR (b.blocked_id=$2 AND b.user_id=u.id))`,[cityIds,owner]);
   list=found.map(x=>x.id);for(let i=list.length-1;i>0;i--){const j=randomInt(i+1);[list[i],list[j]]=[list[j],list[i]];}feedId=randomUUID();await redis.set(`feed:${owner}:${cityId}:${feedId}`,JSON.stringify({ids:list,cityIds,coverage}),'EX',7200);
  }
  let offset=q.cursor?Number(q.cursor):0;assert(Number.isSafeInteger(offset)&&offset>=0&&offset<=list.length,400,'INVALID_CURSOR','Invalid card cursor');
  const items:any[]=[];
  while(items.length<10&&offset<list.length) {
   const batch=list.slice(offset,offset+10);offset+=batch.length;
   const citiesCondition=coverage==='all'?'u.city_ids @> $2::text[]':'u.city_ids && $2::text[]';
   const rows=await query(`SELECT u.*, (SELECT round(avg(r.rating),1)::float FROM reviews r WHERE r.target_id=u.id AND r.hidden=false) AS rating FROM users u WHERE u.id=ANY($1::text[]) AND u.active AND u.provider_status='approved' AND ${citiesCondition} AND NOT EXISTS(SELECT 1 FROM blocks b WHERE (b.user_id=$3 AND b.blocked_id=u.id) OR (b.blocked_id=$3 AND b.user_id=u.id))`,[batch,cityIds,owner]);
   const byId=new Map(rows.map(x=>[x.id,x]));for(const id of batch){const u=byId.get(id);if(u)items.push({...shapes.user(u),rating:u.rating||undefined});}
  }
  return {feedId,items,nextCursor:offset<list.length?String(offset):null,exhausted:offset>=list.length};
 }
 async publicProfile(id:string):Promise<any> {
  const account=await one('SELECT * FROM users WHERE id=$1 AND active=true',[id]);assert(account,404,'NOT_FOUND','User not found');
  const [publication,packages,posts,reviews,places]=await Promise.all([one('SELECT layout FROM profile_publications WHERE user_id=$1',[id]),this.packages(undefined,{userId:id}),this.posts(undefined,{userId:id}),query('SELECT r.*,row_to_json(a) AS author FROM reviews r JOIN users a ON a.id=r.author_id WHERE r.target_id=$1 AND r.hidden=false ORDER BY r.created_at DESC LIMIT 100',[id]),query('SELECT * FROM places WHERE id=ANY($1::text[])',[account.city_ids])]);
  // Full-history average so the profile rating matches the feed's calculation once
  // a person passes the 100-review display limit.
  const ratingRow=await one('SELECT round(avg(rating),1)::float AS rating FROM reviews WHERE target_id=$1 AND hidden=false',[id]);
  const rating=ratingRow?.rating??undefined;
  return {user:{...shapes.user(account),...(rating!==undefined?{rating}:{})},layout:photographicLayout(publication?.layout??null,account.id),packages:packages.items,posts:posts.items,reviews:reviews.map(r=>({id:r.id,rating:r.rating,body:r.body,author:shapes.user(r.author),createdAt:r.created_at.toISOString()})),places:places.map(shapes.place)};
 }
 async packages(actor:Row|undefined,q:Record<string,any>):Promise<any> {
  const owner=typeof q.userId==='string'?q.userId:null;const canSeeDraft=actor&&owner===actor.id;
  const rows=await query("SELECT p.* FROM packages p JOIN users u ON u.id=p.user_id WHERE u.active AND ($1::text IS NULL OR p.user_id=$1) AND (p.status='published' OR ($2::boolean AND p.status='draft')) ORDER BY p.created_at DESC LIMIT 100",[owner,!!canSeeDraft]);return {items:rows.map(shapes.servicePackage)};
 }
 async savePackage(actor:Row,input:unknown,id?:string):Promise<any> {
  const schema=z.object({title:text(160),description:text(15000),cityIds:ids.min(1),price:text(80),currency:z.string().regex(/^[A-Z]{3}$/).default('USD'),unit:text(30).default('day'),image:url.default(''),status:z.enum(['draft','published']).default('draft')});
  let existing:Row|undefined;if(id){existing=await one('SELECT * FROM packages WHERE id=$1 AND user_id=$2',[id,actor.id]);assert(existing,404,'NOT_FOUND','Package not found');}
  const b=parse(schema,existing?{...shapes.servicePackage(existing),...(input as any)}:input);
  await this.validCities(b.cityIds);if(b.status==='published')assert(actor.provider_status==='approved',403,'VERIFICATION_REQUIRED','Service approval is required before publishing');
  const row=id?(await query('UPDATE packages SET title=$3,description=$4,city_ids=$5,price=$6,currency=$7,unit=$8,image=$9,status=$10 WHERE id=$1 AND user_id=$2 RETURNING *',[id,actor.id,b.title,b.description,b.cityIds,b.price,b.currency,b.unit,b.image,b.status]))[0]:(await query('INSERT INTO packages(user_id,title,description,city_ids,price,currency,unit,image,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',[actor.id,b.title,b.description,b.cityIds,b.price,b.currency,b.unit,b.image,b.status]))[0];return shapes.servicePackage(row);
 }
 async archivePackage(actor:Row,id:string):Promise<any>{const rows=await query("UPDATE packages SET status='archived' WHERE id=$1 AND user_id=$2 RETURNING id",[id,actor.id]);assert(rows.length,404,'NOT_FOUND','Package not found');return {ok:true};}
 async verification(actor:Row):Promise<any>{const r=await one('SELECT * FROM verifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 1',[actor.id]);return r?this.verificationShape(r):null;}
 async verificationShape(r:Row):Promise<any>{const files=await query('SELECT id,purpose FROM files WHERE id=ANY($1::text[])',[r.file_ids]);return {id:r.id,userId:r.user_id,kind:r.kind,name:r.name,description:r.description,fileIds:r.file_ids,files:files.map(f=>({id:f.id,url:mediaUrl(f.id,f.purpose)})),status:r.status,reason:r.reason,createdAt:r.created_at.toISOString()};}
 async submitVerification(actor:Row,input:unknown):Promise<any>{const b=parse(z.object({kind:z.enum(['professional','experience','agency']),name:text(100),description:text(10000),fileIds:ids.default([])}),input);if(b.kind!=='experience')assert(b.fileIds.length>0,400,'DOCUMENT_REQUIRED','Professional and agency verification need a document');if((actor.account_type||'individual')==='agency')assert(b.kind==='agency',400,'AGENCY_CERTIFICATION_REQUIRED','Agency accounts can only apply for agency certification');else if(b.kind==='agency')assert(false,400,'AGENCY_ACCOUNT_REQUIRED','Switch your account to an agency before applying for agency certification');if(b.fileIds.length){const f=await query("SELECT id FROM files WHERE id=ANY($1::text[]) AND user_id=$2 AND purpose='verification'",[b.fileIds,actor.id]);assert(f.length===new Set(b.fileIds).size,400,'INVALID_FILE','Verification files must be your private uploads');}const r=await transaction(async c=>{await c.query("UPDATE users SET provider_status='pending' WHERE id=$1",[actor.id]);return (await c.query('INSERT INTO verifications(user_id,kind,name,description,file_ids) VALUES($1,$2,$3,$4,$5) RETURNING *',[actor.id,b.kind,b.name,b.description,b.fileIds])).rows[0];});return this.verificationShape(r);}
 async posts(actor:Row|undefined,q:Record<string,any>):Promise<any>{
  const last=typeof q.cursor==='string'?q.cursor:null;
  const rows=await query("SELECT p.*,row_to_json(u) AS author,(SELECT count(*)::int FROM post_likes l WHERE l.post_id=p.id) AS likes,EXISTS(SELECT 1 FROM post_likes l WHERE l.post_id=p.id AND l.user_id=$4) AS liked FROM posts p JOIN users u ON u.id=p.user_id WHERE p.hidden=false AND u.active AND ($1::text IS NULL OR p.city_id=$1) AND ($2::text IS NULL OR p.user_id=$2) AND ($3::text IS NULL OR (p.created_at,p.id)<(SELECT created_at,id FROM posts WHERE id=$3)) AND NOT EXISTS(SELECT 1 FROM blocks b WHERE (b.user_id=$4 AND b.blocked_id=p.user_id) OR (b.blocked_id=$4 AND b.user_id=p.user_id)) ORDER BY p.created_at DESC,p.id DESC LIMIT 21",[typeof q.cityId==='string'?q.cityId:null,typeof q.userId==='string'?q.userId:null,last,actor?.id||'']);
  const page=rows.slice(0,20);return {items:page.map(r=>({id:r.id,userId:r.user_id,author:shapes.user(r.author),cityId:r.city_id,title:r.title,body:r.body,images:/^(seed-post-|story-demo-)/.test(r.id)?(r.images||[]).map((value:string)=>upgradeSeedPhoto(value)):r.images,likes:r.likes,liked:r.liked,createdAt:r.created_at.toISOString()})),nextCursor:rows.length>20?page.at(-1)!.id:null};
 }
 async createPost(actor:Row,input:unknown):Promise<any>{const b=parse(z.object({cityId:text(100),title:text(160),body:text(15000),images:z.array(url).max(9).default([])}),input);await this.validCities([b.cityId]);const r=(await query('INSERT INTO posts(user_id,city_id,title,body,images) VALUES($1,$2,$3,$4,$5) RETURNING id',[actor.id,b.cityId,b.title,b.body,JSON.stringify(b.images)]))[0];return (await this.posts(actor,{userId:actor.id})).items.find((p:any)=>p.id===r.id);}
 async like(actor:Row,id:string,add:boolean):Promise<any>{assert(await one('SELECT id FROM posts WHERE id=$1 AND hidden=false',[id]),404,'NOT_FOUND','Post not found');if(add)await query('INSERT INTO post_likes(post_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[id,actor.id]);else await query('DELETE FROM post_likes WHERE post_id=$1 AND user_id=$2',[id,actor.id]);return {ok:true};}
 async comments(id:string):Promise<any>{assert(await one('SELECT id FROM posts WHERE id=$1 AND hidden=false',[id]),404,'NOT_FOUND','Post not found');const rows=await query('SELECT c.*,row_to_json(u) AS author FROM comments c JOIN users u ON u.id=c.user_id WHERE c.post_id=$1 AND u.active ORDER BY c.created_at LIMIT 200',[id]);return {items:rows.map(r=>({id:r.id,body:r.body,author:shapes.user(r.author),createdAt:r.created_at.toISOString()}))};}
 async comment(actor:Row,id:string,input:unknown):Promise<any>{const b=parse(z.object({body:text(4000)}),input);await this.comments(id);const row=(await query('INSERT INTO comments(post_id,user_id,body) VALUES($1,$2,$3) RETURNING *',[id,actor.id,b.body]))[0];return {id:row.id,body:row.body,author:shapes.user(actor),createdAt:row.created_at.toISOString()};}
 async blocked(a:string,b:string,c?:PoolClient):Promise<boolean>{const sql='SELECT 1 FROM blocks WHERE (user_id=$1 AND blocked_id=$2) OR (user_id=$2 AND blocked_id=$1)';return !!(c?(await c.query(sql,[a,b])).rowCount:(await one(sql,[a,b])));}
 async conversation(actor:Row,id:string,c?:PoolClient,lock=false):Promise<Row>{const sql=`SELECT * FROM conversations WHERE id=$1 AND (user_a=$2 OR user_b=$2)${lock?' FOR UPDATE':''}`;const r=c?(await c.query(sql,[id,actor.id])).rows[0]:await one(sql,[id,actor.id]);assert(r,404,'NOT_FOUND','Conversation not found');return r;}
 async direct(actor:Row,input:unknown):Promise<any>{
  const b=parse(z.object({userId:text(100),cityId:text(100).optional()}),input);assert(b.userId!==actor.id,400,'INVALID_PEER','Cannot chat with yourself');
  if(b.cityId)await this.validCities([b.cityId]);const peer=await one('SELECT * FROM users WHERE id=$1 AND active',[b.userId]);assert(peer,404,'NOT_FOUND','User not found');
  const [a,other]=[actor.id,b.userId].sort();
  const result=await transaction(async c=>{assert(!await this.blocked(actor.id,b.userId,c),403,'BLOCKED','This conversation is blocked');const inserted=(await c.query('INSERT INTO conversations(user_a,user_b,city_id) VALUES($1,$2,$3) ON CONFLICT(user_a,user_b) DO NOTHING RETURNING *',[a,other,b.cityId||null])).rows[0];const row=inserted||(await c.query('SELECT * FROM conversations WHERE user_a=$1 AND user_b=$2',[a,other])).rows[0];if(inserted)await emit(c,[a,other],'conversation.created',{conversationId:row.id});return row;});return this.conversationShape(actor,result);
 }
 async conversationShape(actor:Row,r:Row):Promise<any>{const peer=(await one('SELECT * FROM users WHERE id=$1',[r.user_a===actor.id?r.user_b:r.user_a]))!;const unread=await one('SELECT count(*)::int AS n FROM messages m WHERE m.conversation_id=$1 AND m.sender_id<>$2 AND m.sequence>COALESCE((SELECT sequence FROM read_positions WHERE conversation_id=$1 AND user_id=$2),0)',[r.id,actor.id]);return {id:r.id,peer:shapes.user(peer),cityId:r.city_id||undefined,lastMessage:r.last_message||undefined,unread:unread?.n||0,createdAt:r.created_at.toISOString(),updatedAt:r.updated_at.toISOString()};}
 async conversations(actor:Row):Promise<any>{const rows=await query('SELECT * FROM conversations WHERE user_a=$1 OR user_b=$1 ORDER BY updated_at DESC LIMIT 200',[actor.id]);return {items:await Promise.all(rows.map(r=>this.conversationShape(actor,r)))};}
 messageShape(r:Row):any {let body=r.body,data={...r.data};if(r.type==='image'){const id=data.fileId||(body.match(/\/media\/([^?\/]+)/)?.[1]);if(id){body=mediaUrl(id,'chat');data={...data,fileId:id,url:body};}}return {id:r.id,conversationId:r.conversation_id,senderId:r.sender_id,clientMessageId:r.client_message_id,sequence:r.sequence,type:r.type,body,data,createdAt:r.created_at.toISOString()};}
 async messages(actor:Row,id:string,q:Record<string,any>):Promise<any>{await this.conversation(actor,id);const after=q.after!==undefined?Number(q.after):null,before=q.before!==undefined?Number(q.before):q.cursor!==undefined?Number(q.cursor):null;assert((after===null||Number.isSafeInteger(after)&&after>=0)&&(before===null||Number.isSafeInteger(before)&&before>0),400,'INVALID_CURSOR','Invalid message cursor');const rows=await query(`SELECT * FROM messages WHERE conversation_id=$1 AND ($2::int IS NULL OR sequence>$2) AND ($3::int IS NULL OR sequence<$3) ORDER BY sequence ${after!==null?'ASC':'DESC'} LIMIT 101`,[id,after,before]);const page=rows.slice(0,100);if(after===null)page.reverse();return {items:page.map(r=>this.messageShape(r)),nextCursor:rows.length>100?String(after!==null?page.at(-1)!.sequence:page[0].sequence):null};}
 async sendMessage(actor:Row,id:string,input:unknown):Promise<any>{
  const b=parse(z.object({clientMessageId:text(150),type:z.enum(['text','image','contact','place','package','trip']),body:z.string().max(15000),data:z.record(z.unknown()).default({})}),input);
  assert(b.body.trim()||Object.keys(b.data).length,400,'EMPTY_MESSAGE','Message is empty');assert(JSON.stringify(b.data).length<=20000,400,'MESSAGE_TOO_LARGE','Message metadata is too large');
  return transaction(async c=>{
   const conv=await this.conversation(actor,id,c,true),peer=conv.user_a===actor.id?conv.user_b:conv.user_a;
   assert(!await this.blocked(actor.id,peer,c),403,'BLOCKED','This conversation is blocked');
   assert((await c.query('SELECT 1 FROM users WHERE id=$1 AND active',[peer])).rowCount,403,'PEER_UNAVAILABLE','This account is unavailable');
   const existing=(await c.query('SELECT * FROM messages WHERE sender_id=$1 AND client_message_id=$2',[actor.id,b.clientMessageId])).rows[0];
   if(existing){assert(existing.conversation_id===id,409,'MESSAGE_ID_CONFLICT','This message identifier was used in another conversation');return this.messageShape(existing);}
   if(b.type==='image'){const fileId=typeof b.data.fileId==='string'?b.data.fileId:b.body.match(/\/media\/([^?\/]+)/)?.[1];assert(fileId&&(await c.query("SELECT 1 FROM files WHERE id=$1 AND user_id=$2 AND purpose IN ('public','chat')",[fileId,actor.id])).rowCount,400,'INVALID_FILE','Image must be your upload');b.data.fileId=fileId;}
   if(b.type==='trip'){assert(typeof b.data.tripId==='string'&&(await c.query('SELECT 1 FROM trips WHERE id=$1 AND conversation_id=$2',[b.data.tripId,id])).rowCount,400,'INVALID_REFERENCE','Trip does not belong to this conversation');}
   const sequence=conv.last_sequence+1;
   const r=(await c.query('INSERT INTO messages(conversation_id,sender_id,client_message_id,sequence,type,body,data) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',[id,actor.id,b.clientMessageId,sequence,b.type,b.body,JSON.stringify(b.data)])).rows[0];
   await c.query('UPDATE conversations SET last_sequence=$2,last_message=$3,updated_at=now() WHERE id=$1',[id,sequence,b.type==='text'?b.body.slice(0,200):`[${b.type}] ${b.body.slice(0,120)}`]);
   const message=this.messageShape(r);await emit(c,[conv.user_a,conv.user_b],'message.created',message);return message;
  });
 }
 async read(actor:Row,id:string,input:unknown):Promise<any>{const b=parse(z.object({sequence:z.number().int().nonnegative()}),input);await transaction(async c=>{const conv=await this.conversation(actor,id,c);assert(b.sequence<=conv.last_sequence,400,'INVALID_SEQUENCE','Read position exceeds message history');await c.query('INSERT INTO read_positions(conversation_id,user_id,sequence) VALUES($1,$2,$3) ON CONFLICT(conversation_id,user_id) DO UPDATE SET sequence=GREATEST(read_positions.sequence,EXCLUDED.sequence)',[id,actor.id,b.sequence]);await emit(c,[conv.user_a,conv.user_b],'conversation.read',{conversationId:id,userId:actor.id,sequence:b.sequence});});return {ok:true};}
 async trips(actor:Row,id:string):Promise<any>{await this.conversation(actor,id);const rows=await query('SELECT * FROM trips WHERE conversation_id=$1 ORDER BY created_at DESC',[id]);return {items:rows.map(shapes.trip)};}
 async createTrip(actor:Row,id:string,input:unknown):Promise<any>{const b=parse(z.object({cityId:text(100),title:text(160),endAt:iso}),input);await this.validCities([b.cityId]);return transaction(async c=>{const conv=await this.conversation(actor,id,c,true),peer=conv.user_a===actor.id?conv.user_b:conv.user_a;assert(!await this.blocked(actor.id,peer,c),403,'BLOCKED','This conversation is blocked');const row=(await c.query('INSERT INTO trips(conversation_id,creator_id,peer_id,city_id,title,end_at) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',[id,actor.id,peer,b.cityId,b.title,b.endAt])).rows[0];const sequence=conv.last_sequence+1;const m=(await c.query("INSERT INTO messages(conversation_id,sender_id,client_message_id,sequence,type,body,data) VALUES($1,$2,$3,$4,'trip',$5,$6) RETURNING *",[id,actor.id,`trip:${row.id}`,sequence,b.title,JSON.stringify({tripId:row.id})])).rows[0];await c.query('UPDATE conversations SET last_sequence=$2,last_message=$3,updated_at=now() WHERE id=$1',[id,sequence,`[trip] ${b.title}`]);await emit(c,[actor.id,peer],'message.created',this.messageShape(m));await emit(c,[actor.id,peer],'trip.updated',shapes.trip(row));return shapes.trip(row);});}
 async amendTrip(actor:Row,id:string,input:unknown):Promise<any>{
  const b=parse(z.object({endAt:iso,title:text(160).optional()}).strict(),input);
  return transaction(async c=>{
   const current=(await c.query('SELECT * FROM trips WHERE id=$1 AND (creator_id=$2 OR peer_id=$2) FOR UPDATE',[id,actor.id])).rows[0];
   assert(current,404,'NOT_FOUND','Trip not found');assert(current.status!=='cancelled',409,'INVALID_TRIP_STATE','Cancelled trips cannot be changed');assert(!current.frozen,409,'TRIP_FROZEN','The trip is frozen');
   assert(!(await c.query('SELECT 1 FROM reviews WHERE trip_id=$1 LIMIT 1',[id])).rowCount,409,'TRIP_ALREADY_REVIEWED','A reviewed trip cannot be changed');
   const peer=current.creator_id===actor.id?current.peer_id:current.creator_id;
   assert(!await this.blocked(actor.id,peer,c),403,'BLOCKED','This conversation is blocked');
   const conv=await this.conversation(actor,current.conversation_id,c,true);
   const row=(await c.query("UPDATE trips SET creator_id=$2,peer_id=$3,end_at=$4,title=$5,status='proposed',accepted_at=NULL,confirmations='{}',opened_by=NULL WHERE id=$1 RETURNING *",[id,actor.id,peer,b.endAt,b.title||current.title])).rows[0];
   const sequence=conv.last_sequence+1;
   const message=(await c.query("INSERT INTO messages(conversation_id,sender_id,client_message_id,sequence,type,body,data) VALUES($1,$2,$3,$4,'trip',$5,$6) RETURNING *",[conv.id,actor.id,`trip-amendment:${id}:${randomUUID()}`,sequence,`行程变更 / Trip updated: ${row.title}`,JSON.stringify({tripId:id,amendment:true,previousEndAt:current.end_at.toISOString(),previousTitle:current.title})])).rows[0];
   await c.query('UPDATE conversations SET last_sequence=$2,last_message=$3,updated_at=now() WHERE id=$1',[conv.id,sequence,`[trip] ${row.title}`]);
   await emit(c,[actor.id,peer],'message.created',this.messageShape(message));await emit(c,[actor.id,peer],'trip.updated',shapes.trip(row));return shapes.trip(row);
  });
 }
 async tripAction(actor:Row,id:string,action:'accept'|'confirm-end'|'cancel',input:unknown={}):Promise<any>{const acceptance=action==='accept'?parse(z.object({expectedEndAt:iso.optional()}).strict(),input):{};return transaction(async c=>{
  let row=(await c.query('SELECT * FROM trips WHERE id=$1 AND (creator_id=$2 OR peer_id=$2) FOR UPDATE',[id,actor.id])).rows[0];assert(row,404,'NOT_FOUND','Trip not found');
  if(action==='accept'){assert(row.peer_id===actor.id,403,'FORBIDDEN','Only the invited participant may accept');if(acceptance.expectedEndAt)assert(new Date(acceptance.expectedEndAt).getTime()===row.end_at.getTime(),409,'TRIP_CHANGED','The trip end time changed. Review the latest agreement before accepting.');assert(row.status==='proposed',409,'INVALID_TRIP_STATE','Trip is not awaiting acceptance');row=(await c.query("UPDATE trips SET status=CASE WHEN end_at<=now() AND NOT frozen THEN 'reviewable' ELSE 'active' END,opened_by=CASE WHEN end_at<=now() AND NOT frozen THEN 'scheduled' ELSE NULL END,accepted_at=now() WHERE id=$1 RETURNING *",[id])).rows[0];}
  else if(action==='confirm-end'){assert(['active','reviewable'].includes(row.status)&&row.accepted_at,409,'INVALID_TRIP_STATE','Accept the trip before confirming completion');assert(!row.frozen,409,'TRIP_FROZEN','The trip is frozen for review');const confirmations=[...new Set([...row.confirmations,actor.id])];row=(await c.query("UPDATE trips SET confirmations=$2,status=CASE WHEN cardinality($2::text[])=2 THEN 'reviewable' ELSE status END,opened_by=CASE WHEN cardinality($2::text[])=2 AND opened_by IS NULL THEN 'mutual' ELSE opened_by END WHERE id=$1 RETURNING *",[id,confirmations])).rows[0];}
  else {assert(['proposed','active'].includes(row.status),409,'INVALID_TRIP_STATE','This trip cannot be cancelled');row=(await c.query("UPDATE trips SET status='cancelled' WHERE id=$1 RETURNING *",[id])).rows[0];}
  await emit(c,[row.creator_id,row.peer_id],'trip.updated',shapes.trip(row));return shapes.trip(row);
 });}
 async review(actor:Row,id:string,input:unknown):Promise<any>{const b=parse(z.object({rating:z.number().int().min(1).max(5),body:text(4000)}),input);return transaction(async c=>{
  let t=(await c.query('SELECT * FROM trips WHERE id=$1 AND (creator_id=$2 OR peer_id=$2) FOR UPDATE',[id,actor.id])).rows[0];assert(t,404,'NOT_FOUND','Trip not found');
  assert(t.accepted_at&&t.status!=='cancelled',409,'TRIP_NOT_ACCEPTED','The trip must be accepted');assert(!t.frozen,409,'TRIP_FROZEN','The trip is frozen');
  if(t.status==='active'&&new Date(t.end_at)<=new Date())t=(await c.query("UPDATE trips SET status='reviewable',opened_by='scheduled' WHERE id=$1 RETURNING *",[id])).rows[0];
  assert(t.status==='reviewable',409,'REVIEW_NOT_OPEN','Service review is not open yet');
  let r:Row;try{r=(await c.query('INSERT INTO reviews(trip_id,author_id,target_id,rating,body) VALUES($1,$2,$3,$4,$5) RETURNING *',[id,actor.id,t.creator_id===actor.id?t.peer_id:t.creator_id,b.rating,b.body])).rows[0];}catch(error:any){if(error.code==='23505')throw new ApiError(409,'ALREADY_REVIEWED','You already reviewed this trip');throw error;}
  return {id:r.id,rating:r.rating,body:r.body,author:shapes.user(actor),createdAt:r.created_at.toISOString()};
 });}
 async block(actor:Row,id:string,add:boolean):Promise<any>{assert(id!==actor.id,400,'INVALID_PEER','Cannot block yourself');assert(await one('SELECT id FROM users WHERE id=$1',[id]),404,'NOT_FOUND','User not found');if(add)await query('INSERT INTO blocks(user_id,blocked_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[actor.id,id]);else await query('DELETE FROM blocks WHERE user_id=$1 AND blocked_id=$2',[actor.id,id]);return {ok:true};}
 async report(actor:Row,input:unknown):Promise<any>{const b=parse(z.object({targetType:z.enum(['user','post','message','review','trip']),targetId:text(100),reason:text(4000)}),input);let evidence:any={};
  if(b.targetType==='message'){const m=await one('SELECT * FROM messages WHERE id=$1',[b.targetId]);assert(m,404,'NOT_FOUND','Message not found');await this.conversation(actor,m.conversation_id);evidence={message:this.messageShape(m)};}
  else if(b.targetType==='trip'){const t=await one('SELECT * FROM trips WHERE id=$1 AND (creator_id=$2 OR peer_id=$2)',[b.targetId,actor.id]);assert(t,404,'NOT_FOUND','Trip not found');evidence={trip:shapes.trip(t)};}
  else {const table=b.targetType==='user'?'users':b.targetType==='post'?'posts':'reviews';assert(await one(`SELECT id FROM ${table} WHERE id=$1`,[b.targetId]),404,'NOT_FOUND','Report target not found');}
  const r=(await query('INSERT INTO reports(reporter_id,target_type,target_id,reason,evidence) VALUES($1,$2,$3,$4,$5) RETURNING id,status',[actor.id,b.targetType,b.targetId,b.reason,JSON.stringify(evidence)]))[0];return r;
 }
 async adminList(kind:string,q:Record<string,any>={}):Promise<any>{
  if(kind==='overview'){const r=await one("SELECT (SELECT count(*)::int FROM users) AS users,(SELECT count(*)::int FROM users WHERE provider_status='approved') AS providers,(SELECT count(*)::int FROM verifications WHERE status='pending') AS pendingVerifications,(SELECT count(*)::int FROM reports WHERE status='open') AS openReports,(SELECT count(*)::int FROM messages) AS messages,(SELECT count(*)::int FROM posts WHERE hidden=false) AS posts");return r;}
  if(kind==='users')return {items:(await query('SELECT * FROM users ORDER BY created_at DESC LIMIT 300')).map(r=>({...shapes.user(r,true),active:r.active}))};
  if(kind==='verifications'){const filter=q&&typeof q.kind==='string'&&['professional','experience','agency'].includes(q.kind)?q.kind:null;const rows=await query(`SELECT v.*,u.email,u.name AS user_name FROM verifications v JOIN users u ON u.id=v.user_id${filter?' WHERE v.kind=$1':''} ORDER BY v.created_at DESC LIMIT 200`,filter?[filter]:[]);return {items:await Promise.all(rows.map(async r=>({...await this.verificationShape(r),email:r.email,userName:r.user_name})))};}
  if(kind==='trips')return {items:(await query('SELECT * FROM trips ORDER BY created_at DESC LIMIT 200')).map(shapes.trip)};
  if(kind==='places')return {items:(await query('SELECT * FROM places ORDER BY kind,id LIMIT 500')).map(shapes.place)};
  if(kind==='posts'){const rows=await query('SELECT p.*,row_to_json(u) AS author FROM posts p JOIN users u ON u.id=p.user_id ORDER BY p.created_at DESC LIMIT 200');return {items:rows.map(r=>({id:r.id,userId:r.user_id,cityId:r.city_id,title:r.title,body:r.body,images:r.images,hidden:r.hidden,author:shapes.user(r.author),createdAt:r.created_at.toISOString()}))};}
  if(kind==='reports')return {items:await query('SELECT id,reporter_id AS "reporterId",target_type AS "targetType",target_id AS "targetId",reason,evidence,status,resolution,created_at AS "createdAt" FROM reports ORDER BY created_at DESC LIMIT 200')};
  if(kind==='audit')return {items:await query('SELECT id,actor_id AS "actorId",action,target_id AS "targetId",reason,created_at AS "createdAt" FROM audit ORDER BY created_at DESC LIMIT 300')};
  throw new ApiError(404,'NOT_FOUND','Management resource not found');
 }
 async audit(c:PoolClient,actor:Row,action:string,id:string,reason:string):Promise<void>{await c.query('INSERT INTO audit(actor_id,action,target_id,reason) VALUES($1,$2,$3,$4)',[actor.id,action,id,reason]);}
 async savePlace(actor:Row,input:unknown,id?:string):Promise<any>{
  const localized=z.object({zh:text(200),en:text(200)}).strict();
  const schema=z.object({id:text(100).optional(),kind:z.enum(['country','city','attraction']),parentId:text(100).nullable().optional(),country:text(200).optional(),name:localized,lat:z.number().min(-90).max(90),lng:z.number().min(-180).max(180),description:z.object({zh:z.string().max(10000),en:z.string().max(10000)}).strict(),image:url.or(z.string().regex(/^\/api\/v1\/(?:seed|media|uploads)\//)).default(''),aliases:z.array(text(150)).max(40).default([])}).strict();
  return transaction(async c=>{
   const existing=id?(await c.query('SELECT * FROM places WHERE id=$1 FOR UPDATE',[id])).rows[0]:undefined;
   if(id)assert(existing,404,'NOT_FOUND','Place not found');
   const b=existing?parse(schema,{...shapes.place(existing),...parse(schema.partial().strict(),input)}):parse(schema,input);
   const placeId=id||b.id||randomUUID();assert(!id||!b.id||b.id===id,400,'INVALID_ID','A place identifier cannot be changed');
   if(existing)assert(existing.kind===b.kind,409,'PLACE_KIND_IMMUTABLE','Create a new place rather than changing the kind of a referenced place');
   assert(b.parentId!==placeId,400,'INVALID_PARENT','A place cannot be its own parent');
   let country:string;
   if(b.kind==='country'){assert(!b.parentId,400,'INVALID_PARENT','A country cannot have a parent');country=b.name.en;}
   else {assert(b.parentId,400,'INVALID_PARENT','A city or attraction needs a parent');const parent=(await c.query('SELECT * FROM places WHERE id=$1',[b.parentId])).rows[0];assert(parent&&parent.kind===(b.kind==='city'?'country':'city'),400,'INVALID_PARENT',b.kind==='city'?'A city must belong to a country':'An attraction must belong to a city');country=parent.country;}
   const values=[placeId,b.kind,b.parentId||null,country,JSON.stringify(b.name),b.lat,b.lng,JSON.stringify(b.description),b.image,[...new Set(b.aliases)]];
   const row=existing?(await c.query('UPDATE places SET kind=$2,parent_id=$3,country=$4,name=$5,lat=$6,lng=$7,description=$8,image=$9,aliases=$10 WHERE id=$1 RETURNING *',values)).rows[0]:(await c.query('INSERT INTO places(id,kind,parent_id,country,name,lat,lng,description,image,aliases) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *',values)).rows[0];
   if(existing&&existing.country!==country)await c.query('WITH RECURSIVE descendants AS (SELECT id FROM places WHERE parent_id=$1 UNION ALL SELECT p.id FROM places p JOIN descendants d ON p.parent_id=d.id) UPDATE places SET country=$2 WHERE id IN(SELECT id FROM descendants)',[placeId,country]);
   await this.audit(c,actor,existing?'place.update':'place.create',placeId,`${b.kind}: ${b.name.en}`);return shapes.place(row);
  });
 }
 async decideVerification(actor:Row,id:string,input:unknown):Promise<any>{const b=parse(z.object({status:z.enum(['approved','rejected']),reason:z.string().max(2000).default('')}),input);await transaction(async c=>{const r=(await c.query("UPDATE verifications SET status=$2,reason=$3,reviewed_at=now() WHERE id=$1 AND status='pending' RETURNING *",[id,b.status,b.reason])).rows[0];assert(r,409,'NOT_PENDING','Application is no longer pending');await c.query('UPDATE users SET provider_status=$2 WHERE id=$1',[r.user_id,b.status]);
  await this.audit(c,actor,`verification.${b.status}`,id,b.reason);});return {ok:true};}
 async adminTrip(actor:Row,id:string,input:unknown):Promise<any>{const b=parse(z.object({action:z.enum(['freeze','unfreeze','open']),reason:text(2000)}),input);return transaction(async c=>{let t=(await c.query('SELECT * FROM trips WHERE id=$1 FOR UPDATE',[id])).rows[0];assert(t,404,'NOT_FOUND','Trip not found');if(b.action==='open'){assert(t.accepted_at&&t.status!=='cancelled',409,'INVALID_TRIP_STATE','Only an accepted trip can be opened');assert(!t.frozen,409,'TRIP_FROZEN','Unfreeze the trip before opening reviews');t=(await c.query("UPDATE trips SET status='reviewable',opened_by='admin' WHERE id=$1 RETURNING *",[id])).rows[0];}else t=(await c.query('UPDATE trips SET frozen=$2 WHERE id=$1 RETURNING *',[id,b.action==='freeze'])).rows[0];await this.audit(c,actor,`trip.${b.action}`,id,b.reason);await emit(c,[t.creator_id,t.peer_id],'trip.updated',shapes.trip(t));return shapes.trip(t);});}
 async adminUser(actor:Row,id:string,input:unknown):Promise<any>{const b=parse(z.object({action:z.enum(['suspend','restore']),reason:text(2000)}),input);assert(id!==actor.id,400,'INVALID_ACTION','Cannot suspend your own administrator account');await transaction(async c=>{const r=await c.query('UPDATE users SET active=$2 WHERE id=$1 RETURNING id',[id,b.action==='restore']);assert(r.rowCount,404,'NOT_FOUND','User not found');if(b.action==='suspend'){await c.query('UPDATE sessions SET revoked=true WHERE user_id=$1',[id]);await emit(c,[id],'session.revoked',{all:true});}await this.audit(c,actor,`user.${b.action}`,id,b.reason);});return {ok:true};}
 async adminPost(actor:Row,id:string,input:unknown):Promise<any>{const b=parse(z.object({action:z.enum(['hide','restore']),reason:text(2000)}),input);await transaction(async c=>{const r=await c.query('UPDATE posts SET hidden=$2 WHERE id=$1 RETURNING id',[id,b.action==='hide']);assert(r.rowCount,404,'NOT_FOUND','Post not found');await this.audit(c,actor,`post.${b.action}`,id,b.reason);});return {ok:true};}
 async resolveReport(actor:Row,id:string,input:unknown):Promise<any>{const b=parse(z.object({action:text(100),reason:text(2000)}),input);await transaction(async c=>{const r=await c.query("UPDATE reports SET status='resolved',resolution=$2 WHERE id=$1 RETURNING id",[id,`${b.action}: ${b.reason}`]);assert(r.rowCount,404,'NOT_FOUND','Report not found');await this.audit(c,actor,`report.${b.action}`,id,b.reason);});return {ok:true};}
}
