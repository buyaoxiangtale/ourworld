import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import Fastify from 'fastify';
import type { PoolClient } from 'pg';
import { COUNTRY_COPY } from '../src/country-copy.js';
import { COUNTRY_ART_IDS,countryArtwork } from '../src/country-illustrations.js';
import { ENRICHED_COUNTRIES,EXTRA_CITIES,DEMO_PROFILES,demoLayout } from '../src/enriched-data.js';
import { BASE_CITY_IDS } from '../src/seed.js';
import { countryEnrichmentPatch,applyEnrichedSeed } from '../src/enrich-seed.js';
import { registerSeedAssets,renderSeedPng } from '../src/seed-assets.js';
import { BLOCK_TYPES } from '@ourworld/contracts';

test('18 country descriptions and landmark illustrations match the catalog without generic templates',()=>{
 assert.equal(ENRICHED_COUNTRIES.length,18);assert.deepEqual(new Set(ENRICHED_COUNTRIES.map(c=>c.slug)),new Set(Object.keys(COUNTRY_COPY)));assert.deepEqual(new Set(COUNTRY_ART_IDS),new Set(Object.keys(COUNTRY_COPY)));
 assert.equal(new Set(ENRICHED_COUNTRIES.map(c=>c.description.zh)).size,18);assert.equal(new Set(ENRICHED_COUNTRIES.map(c=>c.description.en)).size,18);
 for(const country of ENRICHED_COUNTRIES){assert(country.description.zh.length>180);assert(country.description.en.split(/\s+/).length>55);assert(country.description.zh.split('\n\n').length>=4);assert(country.description.en.includes('not a photograph'));assert.match(country.image,/^\/api\/v1\/seed\/country\/[a-z-]+\.svg$/);assert(countryArtwork(country.slug));}
 assert.equal(countryArtwork('__proto__'),undefined);assert.equal(countryArtwork('constructor'),undefined);
});
test('all country SVG/PNG routes render distinct offline 1000x650 artwork',async()=>{
 const app=Fastify();registerSeedAssets(app);const hashes=new Set<string>();
 try{for(const country of ENRICHED_COUNTRIES){const svg=await app.inject({method:'GET',url:country.image});assert.equal(svg.statusCode,200);assert.match(svg.body,/Original landmark illustration, not a photograph/);const image=await renderSeedPng('country',country.slug);assert.deepEqual(image.subarray(0,8),Buffer.from([137,80,78,71,13,10,26,10]));assert.equal(image.readUInt32BE(16),1000);assert.equal(image.readUInt32BE(20),650);hashes.add(createHash('sha256').update(image).digest('hex'));const png=await app.inject({method:'GET',url:country.image.replace(/\.svg$/,'.png')});assert.equal(png.statusCode,200);assert.deepEqual(png.rawPayload,image);}assert.equal(hashes.size,18);assert.equal((await app.inject({method:'GET',url:'/api/v1/seed/country/not-recorded.png'})).statusCode,404);}finally{await app.close();}
});
test('country enrichment is idempotent and preserves edited text and uploaded images',()=>{
 const target=ENRICHED_COUNTRIES.find(c=>c.slug==='france')!;
 const old={description:{zh:'从法国开始探索世界',en:'Explore France with local people'},image:'',aliases:['my existing alias']};
 const first=countryEnrichmentPatch(old,target);assert.equal(first.description.zh,target.description.zh);assert.equal(first.image,target.image);assert(first.aliases.includes('my existing alias'));assert.deepEqual(countryEnrichmentPatch(first,target),first);
 const edited={description:{zh:'用户已经写好的中文介绍',en:'My own detailed description'},image:'/api/v1/media/my-own-upload',aliases:['custom name']};const kept=countryEnrichmentPatch(edited,target);assert.deepEqual(kept.description,edited.description);assert.equal(kept.image,edited.image);assert(kept.aliases.includes('custom name'));
 const bilingual=countryEnrichmentPatch({description:{zh:'保留中文',en:''},image:'https://images.example/user-photo.jpg'},target);assert.equal(bilingual.description.zh,'保留中文');assert.equal(bilingual.description.en,target.description.en);assert.equal(bilingual.image,'https://images.example/user-photo.jpg');
});
test('new cities and differentiated guide/traveler fixtures use valid data references',()=>{
 assert.equal(EXTRA_CITIES.length,15);const countries=new Set(ENRICHED_COUNTRIES.map(c=>c.id));const cities=new Set([...BASE_CITY_IDS,...EXTRA_CITIES.map(c=>c.id)]);assert.equal(cities.size,65);
 for(const city of EXTRA_CITIES){assert(countries.has(city.parentId));assert(city.description.zh.length>30);assert(city.lat>=-90&&city.lat<=90&&city.lng>=-180&&city.lng<=180);}
 assert.equal(DEMO_PROFILES.length,8);assert.equal(DEMO_PROFILES.filter(d=>d.kind==='guide').length,5);assert.equal(DEMO_PROFILES.filter(d=>d.kind==='traveler').length,3);
 for(const profile of DEMO_PROFILES){assert(!profile.id.startsWith('load-'));assert(profile.name.includes('演示'));assert(profile.bio.includes('fictional'));assert(profile.cityIds.every(id=>cities.has(id)));assert(profile.tags.length>=3);assert(profile.stories.length>=2);if(profile.kind==='guide'){assert(profile.quote&&profile.service?.price);assert(profile.service?.description.includes('演示'));}else{assert.equal(profile.service,undefined);assert(profile.bio.includes('旅行目标'));}const layout=demoLayout(profile);assert.equal(new Set(layout.blocks.map(b=>b.id)).size,layout.blocks.length);assert(layout.blocks.every(b=>BLOCK_TYPES.includes(b.type)));assert(!layout.blocks.some(b=>b.type==='gallery'),'Fixtures use published story/service artwork rather than invalid gallery upload references');}
 assert.equal(new Set(DEMO_PROFILES.map(d=>d.bio)).size,8);
});
test('re-running enrichment skips existing demo accounts instead of overwriting edits or load users',async()=>{
 const calls:{sql:string;values:any[]}[]=[];const byId=new Map(ENRICHED_COUNTRIES.map(c=>[c.id,c]));
 const fake={query:async(sql:string,values:any[]=[])=>{calls.push({sql,values});if(sql.startsWith('INSERT INTO places'))return {rowCount:0,rows:[]};if(sql.startsWith('SELECT * FROM places')){const c=byId.get(values[0])!;return {rowCount:1,rows:[{kind:'country',description:{zh:'User-owned Chinese text',en:'User-owned English text'},image:'/api/v1/media/user-upload',aliases:[...new Set([c.name.zh,c.name.en,...c.aliases])]}]};}if(sql.startsWith('INSERT INTO users'))return {rowCount:0,rows:[]};throw new Error(`Unexpected mutation while preserving existing data: ${sql}`);}};
 const result=await applyEnrichedSeed(fake as unknown as PoolClient,'unused-test-hash');assert.equal(result.demoProfiles,0);assert.equal(result.updatedCountries,0);assert(!calls.some(c=>/UPDATE users|profile_drafts|profile_publications|profile_history|INSERT INTO packages|INSERT INTO posts/.test(c.sql)));assert(!calls.some(c=>c.values.some(v=>typeof v==='string'&&v.startsWith('load-'))));
});
