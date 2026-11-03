import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import multipart from '@fastify/multipart';
import cors from '@fastify/cors';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { AppService } from './service.js';
import { registerRoutes } from './routes.js';
import { ApiError } from './security.js';
import { config, requireSecret } from './config.js';
import { pool } from './db.js';
import { redis,mailTasks,layoutTasks,queueConnection,initStorage } from './infrastructure.js';
import { attachRealtime } from './realtime.js';

@Module({providers:[{provide:AppService,useFactory:()=>new AppService()}]})
class ApiModule {}

export async function buildApp():Promise<any> {
 requireSecret();
 const adapter=new FastifyAdapter({logger:false,bodyLimit:1024*1024,requestTimeout:30000,genReqId:()=>randomUUID()});
 const app=await NestFactory.create(ApiModule,adapter,{logger:['error','warn']});
 const server=adapter.getInstance() as unknown as FastifyInstance;
 await server.register(cors,{origin:process.env.NODE_ENV==='production'?(process.env.CORS_ORIGINS||config.publicBase).split(','):true,allowedHeaders:['Content-Type','Authorization'],methods:['GET','POST','PUT','PATCH','DELETE','OPTIONS']});
 await server.register(multipart,{limits:{fileSize:10*1024*1024,files:1,fields:4}});
 let requests=0,errors=0,totalSeconds=0;const start=new WeakMap<object,number>();
 server.addHook('onRequest',async request=>{start.set(request,performance.now());});
 server.addHook('onResponse',async(request,reply)=>{requests++;if(reply.statusCode>=500)errors++;totalSeconds+=(performance.now()-(start.get(request)||performance.now()))/1000;});
 registerRoutes(server,app.get(AppService));
 const realtime=attachRealtime(server.server,app.get(AppService));
 server.get('/metrics',async(_request,reply)=>{reply.type('text/plain; version=0.0.4');return `# TYPE ourworld_http_requests_total counter\nourworld_http_requests_total ${requests}\n# TYPE ourworld_http_errors_total counter\nourworld_http_errors_total ${errors}\n# TYPE ourworld_http_duration_seconds_sum counter\nourworld_http_duration_seconds_sum ${totalSeconds}\n# TYPE ourworld_ws_connections gauge\nourworld_ws_connections ${realtime.count()}\n# TYPE ourworld_process_resident_memory_bytes gauge\nourworld_process_resident_memory_bytes ${process.memoryUsage().rss}\n`;});
 await app.init();
 server.setErrorHandler((error:any,request,reply)=>{
  if(error instanceof ApiError)return reply.status(error.status).send({code:error.code,message:error.message,requestId:request.id});
  if(error.code==='23505')return reply.status(409).send({code:'CONFLICT',message:'This resource already exists',requestId:request.id});
  if(error.code==='23503')return reply.status(400).send({code:'INVALID_REFERENCE',message:'Referenced resource does not exist',requestId:request.id});
  if(error.statusCode&&error.statusCode<500)return reply.status(error.statusCode).send({code:'INVALID_REQUEST',message:error.message,requestId:request.id});
  console.error(JSON.stringify({level:'error',requestId:request.id,code:error.code||error.name,message:String(error.message).replace(/Bearer\s+\S+/g,'Bearer [redacted]')}));
  return reply.status(503).send({code:'SERVICE_UNAVAILABLE',message:'Service temporarily unavailable. Please retry.',requestId:request.id});
 });
 return {app,server,realtime,close:async()=>{await realtime.close();await app.close();}};
}

export async function start():Promise<void> {
 await redis.connect().catch((error:any)=>{if(!String(error.message).includes('already'))throw error;});
 await initStorage();const instance=await buildApp();await instance.app.listen(config.port,'0.0.0.0');
 console.log(`Ourworld API listening on ${config.port}`);
 const close=async()=>{await instance.close();await mailTasks.close();await layoutTasks.close();await queueConnection.quit();await redis.quit();await pool.end();};
 process.once('SIGTERM',()=>void close());process.once('SIGINT',()=>void close());
}
if(process.argv[1]===fileURLToPath(import.meta.url))start().catch(error=>{console.error(error);process.exitCode=1;});
