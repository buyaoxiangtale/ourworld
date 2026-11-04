import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword, signAccess, readAccess, passwordSchema } from '../src/security.js';

test('password hashes are salted and do not accept another password',async()=>{
 const first=await hashPassword('Correct password 2026!'),second=await hashPassword('Correct password 2026!');
 assert.notEqual(first,second);assert.equal(await verifyPassword('Correct password 2026!',first),true);assert.equal(await verifyPassword('Wrong password',first),false);assert.equal(first.includes('Correct password'),false);
});
test('password schema accepts 8 characters and rejects shorter input',()=>{
 assert.equal(passwordSchema.safeParse('abcd1234').success,true);
 const short=passwordSchema.safeParse('abcd123');
 assert.equal(short.success,false);
 assert.equal((short as { success:false }).error.issues[0].message,'密码至少需要 8 位 / password must be at least 8 characters');
});
test('access tokens enforce signatures and carry an opaque user/session pair',async()=>{
 const token=await signAccess('user-1','session-1');assert.deepEqual(await readAccess(token),{userId:'user-1',sessionId:'session-1'});
 const parts=token.split('.');parts[1]=Buffer.from(JSON.stringify({sub:'administrator',sid:'session-1'})).toString('base64url');
 await assert.rejects(()=>readAccess(parts.join('.')),/expired or invalid/);
});
