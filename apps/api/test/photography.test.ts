import {test} from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import {portraitFile,photoFile,upgradeSeedPhoto,registerPhotography} from '../src/photography.js';
import * as shapes from '../src/shapes.js';

test('demo identities resolve consistently and arbitrary files cannot become photo paths',()=>{
 assert.equal(portraitFile('demo-guide-paris'),'01');
 assert.equal(portraitFile('load-0000'),'01');
 assert.equal(portraitFile('load-0008'),'01');
 assert.equal(portraitFile('load-1000'),null);
 assert.equal(photoFile('avatar','../../.env'),null);
 assert.equal(photoFile('city','__proto__'),null);
});
test('photo upgrades preserve user uploads, external hosts, query strings and unknown assets',()=>{
 assert.equal(upgradeSeedPhoto('/api/v1/seed/avatar/demo-local.svg'),'/api/v1/seed/avatar/demo-local.jpg');
 assert.equal(upgradeSeedPhoto('http://localhost:8188/api/v1/assets/avatar/demo-local.png'),'/api/v1/seed/avatar/demo-local.jpg');
 for(const value of ['/media/user-photo.jpg','https://example.com/api/v1/seed/avatar/demo-local.svg','/api/v1/seed/avatar/demo-local.svg?crop=custom','http://localhost:8188/api/v1/seed/avatar/demo-local.svg?crop=custom','/api/v1/seed/avatar/unknown.svg'])assert.equal(upgradeSeedPhoto(value),value);
});
test('new clients receive photos from legacy fixtures without requiring a database rewrite',()=>{
 const row={id:'demo-local',name:'Claire',avatar:'/api/v1/seed/avatar/demo-local.svg'};
 assert.equal(shapes.user(row).avatar,'/api/v1/seed/avatar/demo-local.jpg');assert.equal(row.avatar,'/api/v1/seed/avatar/demo-local.svg');
 assert.equal(shapes.user({...row,avatar:'/media/personal.jpg'}).avatar,'/media/personal.jpg');
 assert.equal(shapes.user({...row,id:'real-user'}).avatar,row.avatar);
 const place={id:'city-paris',kind:'city',image:'/api/v1/seed/city/paris.svg',description:{zh:'用户写下的介绍'}};
 assert.equal(shapes.place(place).image,'/api/v1/seed/city/paris.jpg');assert.equal(shapes.place(place).description.zh,place.description.zh);
 const hongKong={...place,id:'city-hong-kong',image:'/api/v1/seed/country/china.svg'};
 assert.equal(shapes.place(hongKong).image,'/api/v1/seed/city/hong-kong.jpg','Hong Kong uses its own skyline photo even with the legacy country illustration');
 assert.equal(shapes.place({...hongKong,image:'/media/user-hong-kong.jpg'}).image,'/media/user-hong-kong.jpg');
});
test('bundled portrait endpoint supplies a decodable JPEG and safe errors',async()=>{
 const app=Fastify();registerPhotography(app);
 try{
  const response=await app.inject('/api/v1/seed/avatar/demo-local.jpg');assert.equal(response.statusCode,200);assert.match(String(response.headers['content-type']),/^image\/jpeg/);assert.deepEqual(response.rawPayload.subarray(0,3),Buffer.from([255,216,255]));
  assert.equal((await app.inject('/api/v1/seed/avatar/unknown.jpg')).statusCode,404);
  const hongKong=await app.inject('/api/v1/seed/city/hong-kong.jpg');assert.equal(hongKong.statusCode,200);assert.match(String(hongKong.headers['content-type']),/^image\/jpeg/);assert.deepEqual(hongKong.rawPayload.subarray(0,3),Buffer.from([255,216,255]));
  const credits=await app.inject('/api/v1/photo-credits');assert.equal(credits.statusCode,200);assert.match(credits.body,/fictional adult demo/);
  assert.match(credits.body,/Mk2010/);assert.match(credits.body,/Victoria_Harbour_\(Hong_Kong\)/);assert.match(credits.body,/resized display copy/);
 }finally{await app.close();}
});
