import sharp from 'sharp';
import type { FastifyInstance } from 'fastify';
import { countryArtwork } from './country-illustrations.js';

export type SeedAssetKind='avatar'|'city'|'country';
export const SEED_PNG_CACHE_LIMIT=128;

export class BoundedLruCache<T> {
 private readonly values=new Map<string,T>();
 constructor(public readonly limit:number){if(!Number.isSafeInteger(limit)||limit<1)throw new Error('A positive cache limit is required');}
 get size():number{return this.values.size;}
 get(key:string):T|undefined{const value=this.values.get(key);if(value!==undefined){this.values.delete(key);this.values.set(key,value);}return value;}
 set(key:string,value:T):void{this.values.delete(key);this.values.set(key,value);while(this.values.size>this.limit){const oldest=this.values.keys().next().value;if(oldest!==undefined)this.values.delete(oldest);}}
}

const pngCache=new BoundedLruCache<Buffer>(SEED_PNG_CACHE_LIMIT);
const pending=new Map<string,Promise<Buffer>>();
function hueFor(kind:'avatar'|'city',id:string):number {
 if(kind!=='avatar'&&kind!=='city')throw new Error('Unknown controlled seed asset');
 const hash=[...id].reduce((n,c)=>n+c.charCodeAt(0),0);
 return kind==='avatar'?hash%360:160+hash%70;
}
function svgFor(kind:SeedAssetKind,hue:number):string {
 if(kind==='avatar')return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 480"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="hsl(${hue} 32% 76%)"/><stop offset="1" stop-color="hsl(${(hue+50)%360} 35% 90%)"/></linearGradient></defs><rect width="400" height="480" fill="url(#g)"/><circle cx="200" cy="175" r="68" fill="#f7ecda"/><path d="M70 480v-70a130 130 0 0 1 260 0v70" fill="hsl(${hue} 25% 39%)"/><path d="M128 162q5-92 72-80 75-8 73 85-30-45-64-27-42-13-81 22" fill="#394440"/><circle cx="180" cy="178" r="4" fill="#394440"/><circle cx="220" cy="178" r="4" fill="#394440"/><path d="M181 210q19 12 38 0" stroke="#bf8a77" stroke-width="4" fill="none"/></svg>`;
 return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 650"><defs><linearGradient id="s" x2="0" y2="1"><stop stop-color="hsl(${hue} 30% 68%)"/><stop offset="1" stop-color="#f1e6cf"/></linearGradient></defs><rect width="1000" height="650" fill="url(#s)"/><circle cx="780" cy="150" r="70" fill="#f5e1b0"/><path d="M0 430 150 250 300 410 480 180 700 440 850 300 1000 390V650H0" fill="hsl(${hue} 23% 42%)"/><path d="M0 520Q260 400 500 520T1000 500V650H0" fill="hsl(${hue} 23% 30%)"/><path d="M0 600Q300 500 600 580T1000 560V650H0" fill="#183e3c"/></svg>`;
}
export function renderSeedSvg(kind:SeedAssetKind,id:string):string{if(kind==='country'){const svg=countryArtwork(id);if(!svg)throw new Error('Country artwork is not available');return svg;}return svgFor(kind,hueFor(kind,id));}
export async function renderSeedPng(kind:SeedAssetKind,id:string):Promise<Buffer>{
 const key=kind==='country'?`country:${id.replace(/^country-/,'')}`:`${kind}:${hueFor(kind,id)}`;
 const svg=renderSeedSvg(kind,id);
 const cached=pngCache.get(key);if(cached)return cached;
 const existing=pending.get(key);if(existing)return existing;
 // Only this controlled built-in SVG is passed to Sharp. IDs are reduced to a bounded hue;
 // no user SVG, filesystem path or remote URL can become renderer input.
 const conversion=sharp(Buffer.from(svg,'utf8')).png().toBuffer().then(bytes=>{pngCache.set(key,bytes);return bytes;}).finally(()=>pending.delete(key));
 pending.set(key,conversion);return conversion;
}
export function seedPngCacheInfo():{size:number;pending:number;limit:number}{return {size:pngCache.size,pending:pending.size,limit:pngCache.limit};}

export function registerSeedAssets(server:FastifyInstance,prefix='/api/v1'):void{
 for(const kind of ['avatar','city','country'] as const){
  server.get<{Params:{id:string}}>(`${prefix}/seed/${kind}/:id.svg`,async(request,reply)=>{if(kind==='country'&&!countryArtwork(request.params.id))return reply.status(404).send({code:'NOT_FOUND',message:'Country artwork is not available'});reply.type('image/svg+xml').header('Cache-Control','public, max-age=86400');return renderSeedSvg(kind,request.params.id);});
  server.get<{Params:{id:string}}>(`${prefix}/seed/${kind}/:id.png`,async(request,reply)=>{if(kind==='country'&&!countryArtwork(request.params.id))return reply.status(404).send({code:'NOT_FOUND',message:'Country artwork is not available'});reply.type('image/png').header('Cache-Control','public, max-age=86400').header('X-Content-Type-Options','nosniff');return renderSeedPng(kind,request.params.id);});
  for(const extension of ['svg','png'])server.get<{Params:{id:string}}>(`${prefix}/assets/${kind}/:id.${extension}`,async(request,reply)=>reply.redirect(`${prefix}/seed/${kind}/${encodeURIComponent(request.params.id)}.${extension}`));
 }
}
