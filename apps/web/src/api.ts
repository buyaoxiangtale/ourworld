import type { RealtimeEvent } from '@ourworld/contracts';
import {getSession,setSession,syncSession,type Session} from './session';
export {getSession,setSession} from './session';
export const API_BASE=(import.meta.env.VITE_API_BASE||'/api/v1').replace(/\/$/,'');
let refreshTask:{clientId:string;promise:Promise<void>}|null=null;
export class ApiError extends Error {constructor(public status:number,public code:string,message:string){super(message);}}
const changed=()=>new ApiError(401,'SESSION_CHANGED','Session changed');
const revoke=async(refreshToken:string)=>{try{await fetch(`${API_BASE}/auth/logout`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({refreshToken}),signal:AbortSignal.timeout(5000),keepalive:true});}catch{/* Local logout succeeds even when the server is temporarily unreachable. */}};
async function withRefreshLock(clientId:string,renew:()=>Promise<void>){
 if(typeof navigator!=='undefined'&&navigator.locks)return navigator.locks.request('ourworld:refresh',renew);
 // HTTP LAN deployments may not expose Web Locks. Coordinate their tabs through
 // a short-lived storage lease; closed tabs cannot block renewal indefinitely.
 const key=`ourworld.refresh.${clientId}`,owner=globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random()}`;
 const delay=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
 try{
  while(true){
   syncSession();if(getSession()?.clientId!==clientId)throw changed();
   let lease;
   try{lease=JSON.parse(localStorage.getItem(key)||'null');}catch{return renew();}
   if(!lease||typeof lease.owner!=='string'||!Number.isFinite(lease.expiresAt)||lease.expiresAt<=Date.now()||lease.expiresAt>Date.now()+30000){
    try{localStorage.setItem(key,JSON.stringify({owner,expiresAt:Date.now()+20000}));}catch{return renew();}
    await delay(50);
    try{if(JSON.parse(localStorage.getItem(key)||'null')?.owner===owner)break;}catch{return renew();}
   }
   await delay(75);
  }
  return await renew();
 }finally{try{if(JSON.parse(localStorage.getItem(key)||'null')?.owner===owner)localStorage.removeItem(key);}catch{/* No persistent storage. */}}
}
async function refreshSession(snapshot:NonNullable<ReturnType<typeof getSession>>){
 if(refreshTask?.clientId===snapshot.clientId)return refreshTask.promise;
 const renew=async()=>{
  syncSession();const current=getSession();
  if(current?.clientId!==snapshot.clientId)throw changed();
  if(current.accessToken!==snapshot.accessToken)return;
  const response=await fetch(`${API_BASE}/auth/refresh`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({refreshToken:current.refreshToken}),signal:AbortSignal.timeout(15000)});
  syncSession();const latest=getSession();
  if(latest?.clientId!==snapshot.clientId){if(response.ok){const discarded=await response.json();if(typeof discarded.refreshToken==='string')await revoke(discarded.refreshToken);}throw changed();}
  if(!response.ok){
   if(latest.refreshToken!==current.refreshToken)return;
   if(response.status===401||response.status===403)setSession(null);
   throw new ApiError(response.status,'REFRESH_FAILED','Unable to renew session. Please retry.');
  }
  const data=await response.json() as Session;
  if(getSession()?.clientId!==snapshot.clientId){if(typeof data.refreshToken==='string')await revoke(data.refreshToken);throw changed();}
  if(typeof data.accessToken!=='string'||!data.accessToken||typeof data.refreshToken!=='string'||!data.refreshToken||data.user?.id!==current.user.id||typeof data.user?.name!=='string')throw new ApiError(502,'REFRESH_FAILED','Invalid session renewal response');
  setSession({...data,clientId:current.clientId});
 };
 const promise=withRefreshLock(snapshot.clientId,renew);
 const task={clientId:snapshot.clientId,promise};refreshTask=task;
 try{await promise;}finally{if(refreshTask===task)refreshTask=null;}
}
export async function api<T=unknown>(path:string,options:RequestInit={},retried=false):Promise<T>{
  const session=getSession(),authPath=path.startsWith('/auth/');
  const headers=new Headers(options.headers);if(session)headers.set('Authorization',`Bearer ${session.accessToken}`);
  if(options.body&&!(options.body instanceof FormData))headers.set('Content-Type','application/json');
  const response=await fetch(`${API_BASE}${path}`,{...options,headers,signal:options.signal||AbortSignal.timeout(options.body instanceof FormData?60000:20000)});
  if(session&&!authPath&&getSession()?.clientId!==session.clientId)throw changed();
  if(response.status===401&&session&&!authPath){
    if(retried){if(getSession()?.accessToken===session.accessToken)setSession(null);}
    else{await refreshSession(session);return api(path,options,true);}
  }
  if(!response.ok){let error:{message?:string;code?:string}={};try{error=await response.json();}catch{}throw new ApiError(response.status,error.code||'REQUEST_FAILED',error.message||`Request failed (${response.status})`);}
  if(response.status===204)return undefined as T;
  const text=await response.text();if(session&&!authPath&&getSession()?.clientId!==session.clientId)throw changed();return (text?JSON.parse(text):undefined) as T;
}
export const send=<T=unknown>(path:string,body?:unknown,method='POST')=>api<T>(path,{method,body:body===undefined?undefined:JSON.stringify(body)});
export async function upload(file:File,purpose='public'){const form=new FormData();form.append('file',file);form.append('purpose',purpose);return api<{id:string;url:string}>('/uploads',{method:'POST',body:form});}
export async function signOut(){const token=getSession()?.refreshToken;setSession(null);if(token)await revoke(token);}
export function connectRealtime(){
  let socket:WebSocket|undefined;let stopped=false;let timer:number|undefined;let attempts=0;
  const connect=()=>{const session=getSession();if(stopped||!session)return;const base=import.meta.env.VITE_WS_BASE||`${location.protocol==='https:'?'wss:':'ws:'}//${location.host}`;socket=new WebSocket(`${base}${API_BASE.startsWith('http')?new URL(API_BASE).pathname:API_BASE}/ws`);socket.onopen=()=>{if(stopped||getSession()?.clientId!==session.clientId){socket?.close();return;}attempts=0;socket?.send(JSON.stringify({event:'auth',data:{token:getSession()?.accessToken}}));window.dispatchEvent(new CustomEvent('ourworld:realtime',{detail:{event:'reconnected',data:{}}}));};socket.onmessage=e=>{if(stopped||getSession()?.clientId!==session.clientId)return;try{const event=JSON.parse(e.data) as RealtimeEvent;window.dispatchEvent(new CustomEvent('ourworld:realtime',{detail:event}));}catch{}};socket.onclose=()=>{if(!stopped&&getSession()?.clientId===session.clientId)timer=window.setTimeout(connect,Math.min(30000,1000*2**attempts++));};socket.onerror=()=>socket?.close();};connect();return()=>{stopped=true;clearTimeout(timer);socket?.close();};
}
