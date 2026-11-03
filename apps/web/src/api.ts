import type { User, RealtimeEvent } from '@ourworld/contracts';
export const API_BASE=(import.meta.env.VITE_API_BASE||'/api/v1').replace(/\/$/,'');
type Session={accessToken:string;refreshToken:string;user:User};
let stored:Session|null=null;
try{stored=JSON.parse(sessionStorage.getItem('ourworld.session')||'null');}catch{ /* a corrupt tab session is cleared below */ }
let refreshPromise:Promise<void>|null=null;
export class ApiError extends Error {constructor(public status:number,public code:string,message:string){super(message);}}
export function getSession(){return stored;}
export function setSession(value:Session|null){stored=value;if(value)sessionStorage.setItem('ourworld.session',JSON.stringify(value));else sessionStorage.removeItem('ourworld.session');window.dispatchEvent(new Event('ourworld:session'));}
export async function api<T=unknown>(path:string,options:RequestInit={},retried=false):Promise<T>{
  const headers=new Headers(options.headers);if(stored)headers.set('Authorization',`Bearer ${stored.accessToken}`);
  if(options.body&&!(options.body instanceof FormData))headers.set('Content-Type','application/json');
  const response=await fetch(`${API_BASE}${path}`,{...options,headers,signal:options.signal||AbortSignal.timeout(options.body instanceof FormData?60000:20000)});
  if(response.status===401&&stored&&!retried&&!path.startsWith('/auth/')){
    if(!refreshPromise)refreshPromise=fetch(`${API_BASE}/auth/refresh`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({refreshToken:stored.refreshToken})}).then(async r=>{if(!r.ok)throw new Error('Session expired');const data=await r.json();setSession({...stored!,...data});}).catch(error=>{setSession(null);throw error;}).finally(()=>{refreshPromise=null;});
    await refreshPromise;return api(path,options,true);
  }
  if(!response.ok){let error:{message?:string;code?:string}={};try{error=await response.json();}catch{}throw new ApiError(response.status,error.code||'REQUEST_FAILED',error.message||`Request failed (${response.status})`);}
  if(response.status===204)return undefined as T;
  const text=await response.text();return (text?JSON.parse(text):undefined) as T;
}
export const send=<T=unknown>(path:string,body?:unknown,method='POST')=>api<T>(path,{method,body:body===undefined?undefined:JSON.stringify(body)});
export async function upload(file:File,purpose='public'){const form=new FormData();form.append('file',file);form.append('purpose',purpose);return api<{id:string;url:string}>('/uploads',{method:'POST',body:form});}
export async function signOut(){const token=stored?.refreshToken;try{if(token)await send('/auth/logout',{refreshToken:token});}finally{setSession(null);}}
export function connectRealtime(){
  let socket:WebSocket|undefined;let stopped=false;let timer:number|undefined;let attempts=0;
  const connect=()=>{if(stopped||!stored)return;const base=import.meta.env.VITE_WS_BASE||`${location.protocol==='https:'?'wss:':'ws:'}//${location.host}`;socket=new WebSocket(`${base}${API_BASE.startsWith('http')?new URL(API_BASE).pathname:API_BASE}/ws`);socket.onopen=()=>{attempts=0;socket?.send(JSON.stringify({event:'auth',data:{token:stored?.accessToken}}));window.dispatchEvent(new CustomEvent('ourworld:realtime',{detail:{event:'reconnected',data:{}}}));};socket.onmessage=e=>{try{const event=JSON.parse(e.data) as RealtimeEvent;window.dispatchEvent(new CustomEvent('ourworld:realtime',{detail:event}));}catch{}};socket.onclose=()=>{if(!stopped&&stored)timer=window.setTimeout(connect,Math.min(30000,1000*2**attempts++));};socket.onerror=()=>socket?.close();};connect();return()=>{stopped=true;clearTimeout(timer);socket?.close();};
}
