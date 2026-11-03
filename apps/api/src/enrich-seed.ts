import { fileURLToPath } from 'node:url';
import type { PoolClient } from 'pg';
import { pool,transaction } from './db.js';
import { hashPassword } from './security.js';
import { ENRICHED_COUNTRIES,EXTRA_CITIES,DEMO_PROFILES,demoLayout } from './enriched-data.js';

/** Enrich blank/known initial templates only. Custom content and uploaded images win. */
export function countryEnrichmentPatch(existing:{description?:Record<string,string>;image?:string;aliases?:string[]},target:typeof ENRICHED_COUNTRIES[number]):{description:Record<string,string>;image:string;aliases:string[]} {
 const current=existing.description||{};
 const zh=!current.zh||current.zh===`从${target.name.zh}开始探索世界`?target.description.zh:current.zh;
 const en=!current.en||current.en===`Explore ${target.name.en} with local people`?target.description.en:current.en;
 return {description:{...current,zh,en},image:existing.image||target.image,aliases:[...new Set([...(existing.aliases||[]),target.name.zh,target.name.en,...target.aliases])]};
}

export async function applyEnrichedSeed(c:PoolClient,passwordHash:string):Promise<{countries:number;updatedCountries:number;cities:number;demoProfiles:number}> {
 const changed={countries:0,updatedCountries:0,cities:0,demoProfiles:0};
 for(const country of ENRICHED_COUNTRIES){
  const inserted=await c.query("INSERT INTO places(id,kind,country,name,lat,lng,description,image,aliases) VALUES($1,'country',$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(id) DO NOTHING RETURNING id",[country.id,country.country,JSON.stringify(country.name),country.lat,country.lng,JSON.stringify(country.description),country.image,country.aliases]);
  if(inserted.rowCount){changed.countries++;continue;}
  const row=(await c.query('SELECT * FROM places WHERE id=$1 FOR UPDATE',[country.id])).rows[0];if(!row||row.kind!=='country')continue;
  const patch=countryEnrichmentPatch(row,country);
  if(row.description?.zh!==patch.description.zh||row.description?.en!==patch.description.en||row.image!==patch.image||JSON.stringify(row.aliases)!==JSON.stringify(patch.aliases)){
   await c.query('UPDATE places SET description=$2,image=$3,aliases=$4 WHERE id=$1',[country.id,JSON.stringify(patch.description),patch.image,patch.aliases]);changed.updatedCountries++;
  }
 }
 for(const city of EXTRA_CITIES){
  const inserted=await c.query("INSERT INTO places(id,kind,parent_id,country,name,lat,lng,description,image,aliases) VALUES($1,'city',$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(id) DO NOTHING RETURNING id",[city.id,city.parentId,city.country,JSON.stringify(city.name),city.lat,city.lng,JSON.stringify(city.description),city.image,city.aliases]);changed.cities+=inserted.rowCount||0;
 }
 for(const demo of DEMO_PROFILES){
  const inserted=await c.query('INSERT INTO users(id,email,password_hash,name,avatar,bio,verified,provider_status,tags,city_ids,quote) VALUES($1,$2,$3,$4,$5,$6,true,$7,$8,$9,$10) ON CONFLICT DO NOTHING RETURNING id',[demo.id,demo.email,passwordHash,demo.name,`/api/v1/seed/avatar/${demo.id}.svg`,demo.bio,demo.kind==='guide'?'approved':'none',JSON.stringify(demo.tags),demo.cityIds,demo.quote]);
  // Never overwrite a user who has already explored or edited a demo account.
  if(!inserted.rowCount)continue;changed.demoProfiles++;
  if(demo.service){const service=demo.service;await c.query("INSERT INTO packages(id,user_id,title,description,city_ids,price,currency,unit,image,status) VALUES($1,$2,$3,$4,$5,$6,'USD',$7,$8,'published') ON CONFLICT DO NOTHING",[`package-${demo.id}`,demo.id,service.title,service.description,demo.cityIds,service.price,service.unit,`/api/v1/seed/country/${demo.countrySlug}.svg`]);}
  const layout=JSON.stringify(demoLayout(demo));
  await c.query('INSERT INTO profile_drafts(user_id,revision,layout) VALUES($1,1,$2) ON CONFLICT DO NOTHING',[demo.id,layout]);
  await c.query('INSERT INTO profile_publications(user_id,revision,layout) VALUES($1,1,$2) ON CONFLICT DO NOTHING',[demo.id,layout]);
  await c.query('INSERT INTO profile_history(user_id,revision,layout) VALUES($1,1,$2) ON CONFLICT DO NOTHING',[demo.id,layout]);
  for(let i=0;i<demo.stories.length;i++){const story=demo.stories[i];await c.query('INSERT INTO posts(id,user_id,city_id,title,body,images,created_at) VALUES($1,$2,$3,$4,$5,$6,now()-($7::int*interval \'1 hour\')) ON CONFLICT DO NOTHING',[`story-${demo.id}-${i}`,demo.id,story.cityId,story.title,story.body,JSON.stringify([`/api/v1/seed/country/${demo.countrySlug}.svg`]),i]);}
 }
 return changed;
}
export async function enrichSeed():Promise<Awaited<ReturnType<typeof applyEnrichedSeed>>>{
 const hash=await hashPassword(process.env.DEMO_PASSWORD||'Ourworld2026!');
 const result=await transaction(c=>applyEnrichedSeed(c,hash));
 console.log(`Enriched catalog: 18 country stories/artworks; added ${result.countries} countries, ${result.cities} cities, ${result.demoProfiles} demo profiles; updated ${result.updatedCountries} legacy country templates.`);return result;
}
if(process.argv[1]===fileURLToPath(import.meta.url))enrichSeed().then(()=>pool.end()).catch(error=>{console.error(error);process.exitCode=1;return pool.end();});
