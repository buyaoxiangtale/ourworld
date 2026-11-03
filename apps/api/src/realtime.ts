import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'node:http';
import { Redis } from 'ioredis';
import { config } from './config.js';
import { AppService } from './service.js';

export function attachRealtime(server:Server,service:AppService):{close:()=>Promise<void>;count:()=>number} {
 const wss=new WebSocketServer({noServer:true,maxPayload:8192});
 const clients=new Map<WebSocket,{userId:string;sessionId:string;alive:boolean;expires:NodeJS.Timeout}>();
 const subscriber=new Redis(config.redisUrl,{maxRetriesPerRequest:null});subscriber.on('error',()=>{for(const socket of clients.keys())socket.close(1012,'Resync required');});
 void subscriber.subscribe('ourworld:events').catch(()=>{});
 subscriber.on('message',(_channel,raw)=>{try{const event=JSON.parse(raw);for(const [socket,connection] of clients){if(event.userIds.includes(connection.userId)&&socket.readyState===WebSocket.OPEN){if(event.event==='session.revoked'){if(event.data.all||event.data.sessionId===connection.sessionId)socket.close(1008,'Session revoked');continue;}if(socket.bufferedAmount>1024*1024){socket.close(1013,'Slow connection; reconnect to sync');continue;}socket.send(JSON.stringify({event:event.event,data:event.data,eventId:event.eventId}));}}}catch{}});
 server.on('upgrade',(request,socket,head)=>{if(new URL(request.url||'/', 'http://localhost').pathname!=='/api/v1/ws'){socket.destroy();return;}wss.handleUpgrade(request,socket,head,ws=>wss.emit('connection',ws,request));});
 wss.on('connection',socket=>{
  const authDeadline=setTimeout(()=>{if(!clients.has(socket))socket.close(1008,'Authenticate first');},5000);
  socket.on('message',async raw=>{try{
   const frame=JSON.parse(raw.toString());
   if(frame.event==='auth'&&typeof frame.data?.token==='string'){
    const actor=await service.authenticate(frame.data.token);if(!actor.verified){socket.close(1008,'Verify email first');return;}
    const old=clients.get(socket);if(old)clearTimeout(old.expires);const expires=setTimeout(()=>socket.close(1008,'Session renewal required'),Math.max(0,Number(actor.access_expires_at)*1000-Date.now()));
    clients.set(socket,{userId:actor.id,sessionId:actor.session_id,alive:true,expires});clearTimeout(authDeadline);socket.send(JSON.stringify({event:'auth.ready',data:{userId:actor.id}}));
   }else if(!clients.has(socket))socket.close(1008,'Authenticate first');
   else if(frame.event==='ping')socket.send(JSON.stringify({event:'pong',data:{}}));
  }catch{socket.close(1008,'Invalid authentication or frame');}});
  socket.on('pong',()=>{const client=clients.get(socket);if(client)client.alive=true;});
  socket.on('close',()=>{clearTimeout(authDeadline);const client=clients.get(socket);if(client)clearTimeout(client.expires);clients.delete(socket);});
 });
 const heartbeat=setInterval(()=>{for(const [socket,client]of clients){if(!client.alive){socket.terminate();continue;}client.alive=false;socket.ping();}},30000);heartbeat.unref();
 return {count:()=>clients.size,close:async()=>{clearInterval(heartbeat);for(const socket of wss.clients)socket.terminate();await subscriber.quit();await new Promise<void>(resolve=>wss.close(()=>resolve()));}};
}
