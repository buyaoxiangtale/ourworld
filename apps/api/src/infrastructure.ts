import { Redis } from 'ioredis';
import { Queue } from 'bullmq';
import { S3Client, HeadBucketCommand, CreateBucketCommand, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { createHmac, timingSafeEqual, randomUUID } from 'node:crypto';
import { config, requireSecret } from './config.js';
import { assert } from './security.js';
import { one, query, type Row } from './db.js';

export const redis = new Redis(config.redisUrl,{lazyConnect:true,maxRetriesPerRequest:1,retryStrategy:times=>Math.min(times*250,3000)});
redis.on('error',()=>{});
export const queueConnection = new Redis(config.redisUrl,{maxRetriesPerRequest:null,lazyConnect:true});
queueConnection.on('error',()=>{});
export const MAIL_QUEUE_NAME='ourworld-mail';
export const LAYOUT_QUEUE_NAME='ourworld-layout';
export const mailTasks = new Queue(MAIL_QUEUE_NAME,{connection:queueConnection});
export const layoutTasks = new Queue(LAYOUT_QUEUE_NAME,{connection:queueConnection});
export const s3 = new S3Client({endpoint:config.s3Endpoint,region:process.env.S3_REGION||'us-east-1',forcePathStyle:true,credentials:{accessKeyId:config.s3Access,secretAccessKey:config.s3Secret}});

export async function initStorage():Promise<void> {
 try { await s3.send(new HeadBucketCommand({Bucket:config.s3Bucket})); }
 catch { try { await s3.send(new CreateBucketCommand({Bucket:config.s3Bucket})); } catch(error:any) { if(!['BucketAlreadyExists','BucketAlreadyOwnedByYou'].includes(error.name)) throw error; } }
}

export async function limit(key:string,max:number,seconds:number):Promise<void> {
 // Fail closed on Redis failure: per-instance counters would allow abusive requests to bypass shared limits.
 const count=await redis.eval("local n=redis.call('INCR',KEYS[1]);if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end;return n",1,`limit:${key}`,seconds) as number;
 assert(count<=max,429,'RATE_LIMITED','Too many requests. Please try again later.');
}

export function mediaUrl(id:string,purpose='public'):string {
 const base=`${config.publicBase}/api/v1/media/${encodeURIComponent(id)}`;
 if(purpose==='public') return base;
 const expires=Math.floor(Date.now()/1000)+900;
 const sig=createHmac('sha256',requireSecret()).update(`${id}:${expires}`).digest('base64url');
 return `${base}?expires=${expires}&sig=${sig}`;
}
export function validMediaSignature(id:string,expires:unknown,sig:unknown):boolean {
 if(typeof expires!=='string'||typeof sig!=='string'||!/^\d+$/.test(expires)||Number(expires)<Date.now()/1000||Number(expires)>Date.now()/1000+901) return false;
 const expected=Buffer.from(createHmac('sha256',requireSecret()).update(`${id}:${expires}`).digest('base64url'));
 const actual=Buffer.from(sig);return actual.length===expected.length&&timingSafeEqual(actual,expected);
}
export async function uploadFile(actor:Row,bytes:Buffer,mime:string,purpose:string):Promise<{id:string;url:string}> {
 assert(['public','chat','verification'].includes(purpose),400,'INVALID_PURPOSE','Invalid upload purpose');
 assert(bytes.length>0&&bytes.length<=10*1024*1024,400,'INVALID_FILE','File must be between 1 byte and 10 MB');
 const detected=bytes[0]===0xff&&bytes[1]===0xd8?'image/jpeg':bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'image/png':bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP'?'image/webp':bytes.toString('ascii',0,5)==='%PDF-'?'application/pdf':null;
 assert(detected&&detected===mime,400,'INVALID_FILE','Only verified JPEG, PNG, WebP and PDF files are accepted');
 assert(mime!=='application/pdf'||purpose==='verification',400,'INVALID_FILE','PDF is only accepted for verification');
 const id=randomUUID(),key=`${purpose}/${actor.id}/${id}`;
 await s3.send(new PutObjectCommand({Bucket:config.s3Bucket,Key:key,Body:bytes,ContentType:mime}));
 await query('INSERT INTO files(id,user_id,storage_key,mime,size,purpose) VALUES($1,$2,$3,$4,$5,$6)',[id,actor.id,key,mime,bytes.length,purpose]);
 return {id,url:mediaUrl(id,purpose)};
}
export async function readMedia(id:string,actor:Row|undefined,q:Record<string,unknown>):Promise<{body:any;mime:string;private:boolean}> {
 const file=await one('SELECT * FROM files WHERE id=$1',[id]);assert(file,404,'NOT_FOUND','File not found');
 const privileged=actor&&(actor.id===file.user_id||(actor.role==='admin'&&file.purpose==='verification'));
 assert(file.purpose==='public'||privileged||validMediaSignature(id,q.expires,q.sig),403,'FORBIDDEN','Private file access denied');
 const object=await s3.send(new GetObjectCommand({Bucket:config.s3Bucket,Key:file.storage_key}));
 return {body:object.Body,mime:file.mime,private:file.purpose!=='public'};
}
export async function sendMail(to:string,subject:string,text:string):Promise<void> { await mailTasks.add('mail',{to,subject,text},{attempts:4,backoff:{type:'exponential',delay:1500},removeOnComplete:100,removeOnFail:100}); }
