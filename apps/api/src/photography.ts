import {readFileSync,existsSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import type {FastifyInstance} from 'fastify';
import type {PoolClient} from 'pg';
import {DEMO_PROFILES} from './enriched-data.js';

type Kind='avatar'|'city'|'country';
type Credit={slug:string;title:string;file:string;source:string;author:string;license:string;licenseUrl:string};
const root=new URL('../assets/photos/',import.meta.url);
const manifestPath=new URL('places.json',root);
const manifest:{places:Record<string,Credit>;countries:Record<string,string>}=existsSync(manifestPath)?JSON.parse(readFileSync(manifestPath,'utf8')):{places:{},countries:{}};
const people:Record<string,string>={'demo-local':'01','demo-traveler':'03','demo-admin':'04','demo-guide-paris':'01','demo-guide-tokyo':'02','demo-guide-shanghai':'03','demo-guide-lisbon':'07','demo-guide-rio':'04','demo-traveler-lin':'05','demo-traveler-anna':'06','demo-traveler-oliver':'08'};
export function portraitFile(id:string):string|null {
 if(Object.hasOwn(people,id))return people[id];
 if(/^load-\d{4}$/.test(id)&&Number(id.slice(5))<1000)return String(Number(id.slice(5))%8+1).padStart(2,'0');
 return null;
}
export function photoFile(kind:Kind,id:string):URL|null {
 if(kind==='avatar'){const photo=portraitFile(id);return photo?new URL(`portraits/${photo}.jpg`,root):null;}
 const country=id.replace(/^country-/,'');
 const slug=kind==='country'?(Object.hasOwn(manifest.countries,country)?manifest.countries[country]:''):id.replace(/^city-/,'');
 const photo=Object.hasOwn(manifest.places,slug)?manifest.places[slug]:null;return photo?new URL(`places/${photo.file}`,root):null;
}
/** Recognize exact built-in media only; never replace uploads or external hosts. */
export function upgradeSeedPhoto(value:string,target?:{kind:Kind;id:string}):string {
 let path=value;
 if(!path.startsWith('/')){try{const url=new URL(value);if(!['http:','https:'].includes(url.protocol)||!['localhost','127.0.0.1','[::1]'].includes(url.hostname)||url.search||url.hash)return value;path=url.pathname;}catch{return value;}}
 const match=path.match(/^\/api\/v1\/(?:seed|assets)\/(avatar|city|country)\/([a-z0-9-]+)\.(?:svg|png|jpg)$/);
 if(!match)return value;
 const kind=target?.kind||match[1] as Kind,id=target?.id||match[2];
 return photoFile(kind,id)?`/api/v1/seed/${kind}/${id}.jpg`:value;
}
export function photographicDescription(value:Record<string,string>={}):Record<string,string>{
 const result={...value};for(const [lang,caption]of [['zh','\n\n配图为应用内原创地标插画，非实景照片。'],['en','\n\nThe image is an original landmark illustration, not a photograph.']])if(result[lang]?.endsWith(caption))result[lang]=result[lang].slice(0,-caption.length);return result;
}
export function photographicLayout(layout:any,userId:string):any{
 if(!layout||!portraitFile(userId))return layout;
 return {...layout,blocks:(layout.blocks||[]).map((block:any)=>block.type==='gallery'&&Array.isArray(block.refs)?{...block,refs:block.refs.map((url:string)=>upgradeSeedPhoto(url))}:block)};
}
export function registerPhotography(server:FastifyInstance):void {
 for(const kind of ['avatar','city','country'] as const)server.get<{Params:{id:string}}>(`/api/v1/seed/${kind}/:id.jpg`,async(request,reply)=>{
  const file=photoFile(kind,request.params.id);if(!file)return reply.code(404).send({code:'NOT_FOUND',message:'Photo unavailable'});
  reply.type('image/jpeg').header('Cache-Control','public, max-age=86400').header('X-Content-Type-Options','nosniff');return readFile(file);
 });
 server.get('/api/v1/photo-credits',async(_request,reply)=>{
  const escape=(value:string)=>value.replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]!));
  reply.type('text/html; charset=utf-8');return `<!doctype html><html lang="zh"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Photography credits · Ourworld</title><style>body{font:16px/1.65 system-ui;background:#f5f4f1;color:#242322;max-width:800px;margin:40px auto;padding:20px}li{margin:20px 0}a{color:inherit}</style><h1>摄影素材与来源</h1><p>人物照片为 AI 生成的成年虚构演示人物。地点照片来自下列摄影作品，按原许可提供。<br>Portraits: fictional adult demo characters generated with OpenAI image_gen. Place photography is credited below.</p><ul>${Object.values(manifest.places).map(p=>`<li><a href="${escape(p.source)}">${escape(p.title)}</a><br>${escape(p.author)} · <a href="${escape(p.licenseUrl||p.source)}">${escape(p.license)}</a></li>`).join('')}</ul></html>`;
 });
}
export async function migrateSeedPhotography(c:PoolClient):Promise<void> {
 const ids=[...Object.keys(people),...DEMO_PROFILES.map(p=>p.id),...Array.from({length:1000},(_,i)=>`load-${String(i).padStart(4,'0')}`)];
 for(const row of (await c.query('SELECT id,avatar FROM users WHERE id=ANY($1::text[])',[ids])).rows){const next=upgradeSeedPhoto(row.avatar,{kind:'avatar',id:row.id});if(next!==row.avatar)await c.query('UPDATE users SET avatar=$2 WHERE id=$1',[row.id,next]);}
 // The matcher limits changes to known internal artwork. Custom URLs and files win.
 for(const row of (await c.query("SELECT id,kind,image,description FROM places WHERE image LIKE '/api/v1/seed/%' OR image LIKE '/api/v1/assets/%' OR image LIKE 'http://localhost:%/api/v1/%' OR image LIKE 'http://127.0.0.1:%/api/v1/%'")).rows){
  const target=row.kind==='country'?{kind:'country' as const,id:row.id.replace(/^country-/,'')}:row.kind==='city'?{kind:'city' as const,id:row.id.replace(/^city-/,'')}:undefined;
  const next=upgradeSeedPhoto(row.image,target);if(next===row.image)continue;
  const description={...row.description};for(const [lang,caption]of [['zh','\n\n配图为应用内原创地标插画，非实景照片。'],['en','\n\nThe image is an original landmark illustration, not a photograph.']])if(description[lang]?.endsWith(caption))description[lang]=description[lang].slice(0,-caption.length);
  await c.query('UPDATE places SET image=$2,description=$3 WHERE id=$1',[row.id,next,JSON.stringify(description)]);
 }
 for(const row of (await c.query("SELECT id,image FROM packages WHERE id LIKE 'package-demo-%' OR id LIKE 'package-load-%'")).rows){const next=upgradeSeedPhoto(row.image);if(next!==row.image)await c.query('UPDATE packages SET image=$2 WHERE id=$1',[row.id,next]);}
 for(const row of (await c.query("SELECT id,images FROM posts WHERE id LIKE 'seed-post-%' OR id LIKE 'story-demo-%'")).rows){const images=(row.images||[]).map((v:string)=>upgradeSeedPhoto(v));if(JSON.stringify(images)!==JSON.stringify(row.images))await c.query('UPDATE posts SET images=$2 WHERE id=$1',[row.id,JSON.stringify(images)]);}
 // Upgrade individual built-in gallery refs without changing layout, order or revisions.
 for(const table of ['profile_drafts','profile_publications','profile_history'])for(const row of (await c.query(`SELECT user_id,revision,layout FROM ${table} WHERE user_id=ANY($1::text[])`,[ids])).rows){
  let changed=false;const layout={...row.layout,blocks:(row.layout?.blocks||[]).map((block:any)=>{if(block.type!=='gallery'||!block.refs)return block;const refs=block.refs.map((v:string)=>upgradeSeedPhoto(v));if(JSON.stringify(refs)!==JSON.stringify(block.refs))changed=true;return {...block,refs};})};
  if(changed)await c.query(`UPDATE ${table} SET layout=$3 WHERE user_id=$1 AND revision=$2`,[row.user_id,row.revision,JSON.stringify(layout)]);
 }
}
