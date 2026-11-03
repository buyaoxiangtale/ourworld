import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword, signAccess, readAccess } from '../src/security.js';

test('password hashes are salted and do not accept another password',async()=>{
 const first=await hashPassword('Correct password 2026!'),second=await hashPassword('Correct password 2026!');
 assert.notEqual(first,second);assert.equal(await verifyPassword('Correct password 2026!',first),true);assert.equal(await verifyPassword('Wrong password',first),false);assert.equal(first.includes('Correct password'),false);
});
test('access tokens enforce signatures and carry an opaque user/session pair',async()=>{
 const token=await signAccess('user-1','session-1');assert.deepEqual(await readAccess(token),{userId:'user-1',sessionId:'session-1'});
 const parts=token.split('.');parts[1]=Buffer.from(JSON.stringify({sub:'administrator',sid:'session-1'})).toString('base64url');
 await assert.rejects(()=>readAccess(parts.join('.')),/expired or invalid/);
});
