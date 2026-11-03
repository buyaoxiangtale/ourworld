import { Worker,Queue } from 'bullmq';
import { Redis } from 'ioredis';
import nodemailer from 'nodemailer';
import { fileURLToPath } from 'node:url';
import { config,requireSecret } from './config.js';
import { transaction,query,emit,pool } from './db.js';
import { redis,mailTasks,layoutTasks,MAIL_QUEUE_NAME,LAYOUT_QUEUE_NAME,queueConnection } from './infrastructure.js';
import { processLayout } from './profile-layout.js';
import { trip as tripShape } from './shapes.js';

export async function flushOutbox():Promise<number>{return transaction(async c=>{
 const rows=(await c.query('SELECT * FROM outbox WHERE delivered_at IS NULL ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 100')).rows;
 for(const row of rows){await redis.publish('ourworld:events',JSON.stringify({eventId:row.id,userIds:row.user_ids,event:row.event,data:row.data}));await c.query('UPDATE outbox SET delivered_at=now() WHERE id=$1',[row.id]);}return rows.length;
});}
export async function openDueTrips():Promise<number>{return transaction(async c=>{
 const rows=(await c.query("WITH due AS (SELECT id FROM trips WHERE status='active' AND accepted_at IS NOT NULL AND frozen=false AND end_at<=now() FOR UPDATE SKIP LOCKED LIMIT 100) UPDATE trips SET status='reviewable',opened_by='scheduled' WHERE id IN(SELECT id FROM due) RETURNING *")).rows;
 for(const row of rows)await emit(c,[row.creator_id,row.peer_id],'trip.updated',tripShape(row));return rows.length;
});}
export async function createTaskWorkers(names:{mail:string;layout:string}={mail:MAIL_QUEUE_NAME,layout:LAYOUT_QUEUE_NAME}):Promise<{close:()=>Promise<void>}> {
 const mailConnection=new Redis(config.redisUrl,{maxRetriesPerRequest:null}),layoutConnection=new Redis(config.redisUrl,{maxRetriesPerRequest:null});
 mailConnection.on('error',()=>{});layoutConnection.on('error',()=>{});
 const mail=nodemailer.createTransport({host:config.smtpHost,port:config.smtpPort,secure:config.smtpPort===465,...(process.env.SMTP_USER?{auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASSWORD}}:{})});
 const layoutControl=names.layout===LAYOUT_QUEUE_NAME?layoutTasks:new Queue(names.layout,{connection:queueConnection});
 await layoutControl.setGlobalConcurrency(2);
 const mailWorker=new Worker(names.mail,async job=>{await mail.sendMail({from:config.smtpFrom,...job.data});},{connection:mailConnection,concurrency:5});
 const layoutWorker=new Worker(names.layout,async job=>{await processLayout(job.data.id);},{connection:layoutConnection,concurrency:2});
 for(const worker of [mailWorker,layoutWorker]){worker.on('error',error=>console.error('Worker error:',error.message));worker.on('failed',(job,error)=>console.error(`Task ${job?.name} failed: ${error.message}`));}
 return {close:async()=>{await Promise.all([mailWorker.close(),layoutWorker.close()]);mail.close();if(layoutControl!==layoutTasks)await layoutControl.close();await Promise.all([mailConnection.quit(),layoutConnection.quit()]);}};
}
export async function startWorker():Promise<void>{
 requireSecret();await redis.connect().catch((error:any)=>{if(!String(error.message).includes('already'))throw error;});
 const processors=await createTaskWorkers();
 let flushing=false,scheduling=false;
 const outboxTimer=setInterval(()=>{if(flushing)return;flushing=true;flushOutbox().catch(error=>console.error('Outbox retry:',error.message)).finally(()=>{flushing=false;});},100);
 const tripTimer=setInterval(()=>{if(scheduling)return;scheduling=true;openDueTrips().catch(error=>console.error('Trip scheduler retry:',error.message)).finally(()=>{scheduling=false;});},1000);
 const recovery=setInterval(()=>{void query("SELECT id FROM layout_jobs WHERE status='queued' AND created_at<now()-interval '15 seconds' LIMIT 100").then(rows=>Promise.all(rows.map(r=>layoutTasks.add('layout',{id:r.id},{jobId:r.id,removeOnComplete:100,removeOnFail:100})))).catch(()=>{});},15000);
 console.log('Ourworld worker ready (independent mail/layout queues, outbox, trip scheduler)');
 const close=async()=>{clearInterval(outboxTimer);clearInterval(tripTimer);clearInterval(recovery);await processors.close();await mailTasks.close();await layoutTasks.close();await queueConnection.quit();await redis.quit();await pool.end();};
 process.once('SIGTERM',()=>void close());process.once('SIGINT',()=>void close());
}
if(process.argv[1]===fileURLToPath(import.meta.url))startWorker().catch(error=>{console.error(error);process.exitCode=1;});
