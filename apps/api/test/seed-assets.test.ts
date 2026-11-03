import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import Fastify from 'fastify';
import { BoundedLruCache,registerSeedAssets,renderSeedSvg,renderSeedPng,seedPngCacheInfo,SEED_PNG_CACHE_LIMIT } from '../src/seed-assets.js';

const digest=(text:string)=>createHash('sha256').update(text).digest('hex');
test('controlled seed SVG output remains byte-for-byte unchanged',()=>{
 assert.equal(digest(renderSeedSvg('avatar','demo-local')),'29b6784d04ac1fb4c5020f164ef7285b8cc12ed97b83e92aa1b0004cfe9067ce');
 assert.equal(digest(renderSeedSvg('city','paris')),'0b1f107dc49a3ab5095ebfc7693c86b8e319ecb01c18d1fd4a0b1e09d167edd3');
 assert(!renderSeedSvg('avatar','<svg><script>unsafe()</script></svg>').includes('<script>'));
 assert(!renderSeedSvg('city','https://example.invalid/remote.svg').includes('example.invalid'));
});
test('seed PNG routes return native-decodable PNG dimensions and preserve SVG routes',async()=>{
 const app=Fastify();registerSeedAssets(app);
 try {
  for(const [kind,id,width,height]of [['avatar','demo-local',400,480],['city','paris',1000,650]] as const){
   const png=await app.inject({method:'GET',url:`/api/v1/seed/${kind}/${id}.png`});assert.equal(png.statusCode,200);assert.match(String(png.headers['content-type']),/^image\/png/);assert.equal(png.headers['cache-control'],'public, max-age=86400');
   assert.deepEqual(png.rawPayload.subarray(0,8),Buffer.from([137,80,78,71,13,10,26,10]));assert.equal(png.rawPayload.toString('ascii',12,16),'IHDR');assert.equal(png.rawPayload.readUInt32BE(16),width);assert.equal(png.rawPayload.readUInt32BE(20),height);
   const again=await app.inject({method:'GET',url:`/api/v1/seed/${kind}/${id}.png`});assert.deepEqual(again.rawPayload,png.rawPayload);
   const svg=await app.inject({method:'GET',url:`/api/v1/seed/${kind}/${id}.svg`});assert.equal(svg.statusCode,200);assert.match(String(svg.headers['content-type']),/^image\/svg\+xml/);assert.equal(svg.body,renderSeedSvg(kind,id));
   const old=await app.inject({method:'GET',url:`/api/v1/assets/${kind}/${id}.png`});assert.equal(old.statusCode,302);assert.equal(old.headers.location,`/api/v1/seed/${kind}/${id}.png`);
  }
 }finally{await app.close();}
});
test('PNG cache keys use controlled type and hue and coalesce matching conversions',async()=>{
 const [first,second]=await Promise.all([renderSeedPng('avatar','ab'),renderSeedPng('avatar','ba')]);assert.strictEqual(first,second);
 assert.strictEqual(await renderSeedPng('avatar','ab'),first);const info=seedPngCacheInfo();assert.equal(info.limit,SEED_PNG_CACHE_LIMIT);assert(info.size<=info.limit);assert.equal(info.pending,0);
});
test('bounded LRU cache evicts the least recently used entry',()=>{
 const cache=new BoundedLruCache<Buffer>(2);const a=Buffer.from('a'),b=Buffer.from('b'),c=Buffer.from('c');cache.set('a',a);cache.set('b',b);assert.strictEqual(cache.get('a'),a);cache.set('c',c);assert.equal(cache.size,2);assert.equal(cache.get('b'),undefined);assert.strictEqual(cache.get('a'),a);assert.strictEqual(cache.get('c'),c);
});
