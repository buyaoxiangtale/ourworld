import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSeedMedia } from '../src/seed-media.js';

test('known development artwork is portable across local gateway ports',()=>{
 const expected='/api/v1/seed/city/paris.svg';
 assert.equal(normalizeSeedMedia('http://localhost:8080/api/v1/seed/city/paris.svg',expected),expected);
 assert.equal(normalizeSeedMedia('http://localhost:8080/api/v1/assets/city/paris.svg',expected),expected);
 assert.equal(normalizeSeedMedia('http://127.0.0.1:8188/api/v1/assets/city/paris.svg',expected),expected);
 assert.equal(normalizeSeedMedia('/api/v1/assets/city/paris.svg',expected),expected);
 assert.equal(normalizeSeedMedia(expected,expected),expected);
});
test('normalization never touches user uploads, outside sites or another resource',()=>{
 const expected='/api/v1/seed/city/paris.svg';
 for(const input of ['http://localhost:8080/api/v1/media/private-upload','https://images.example/api/v1/seed/city/paris.svg','http://localhost:8080/api/v1/seed/city/tokyo.svg','http://localhost:8080/api/v1/assets/city/paris.svg?sig=private','https://cdn.example/photo.jpg'])assert.equal(normalizeSeedMedia(input,expected),input);
});
