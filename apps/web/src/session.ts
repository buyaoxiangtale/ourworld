import type {User} from '@ourworld/contracts';

export const SESSION_KEY='ourworld.session';
export type Session={accessToken:string;refreshToken:string;user:User;clientId?:string};
type SavedSession=Session&{clientId:string};
const read=(storage:()=>Storage)=>{try{return storage().getItem(SESSION_KEY);}catch{return undefined;}};
const remove=(storage:()=>Storage)=>{try{storage().removeItem(SESSION_KEY);}catch{/* Storage may be disabled. */}};
const parse=(raw:string|null|undefined):SavedSession|null=>{
 try{
  const value=JSON.parse(raw||'null');
  if(!value||typeof value.accessToken!=='string'||!value.accessToken||typeof value.refreshToken!=='string'||!value.refreshToken||typeof value.user?.id!=='string'||typeof value.user?.name!=='string')return null;
  return {...value,clientId:typeof value.clientId==='string'&&value.clientId?value.clientId:globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random()}`};
 }catch{return null;}
};
let persistent=false;
const persist=(session:SavedSession|null)=>{
 if(!session){remove(()=>localStorage);remove(()=>sessionStorage);return;}
 const raw=JSON.stringify(session);
 try{localStorage.setItem(SESSION_KEY,raw);persistent=true;remove(()=>sessionStorage);}
 catch{persistent=false;remove(()=>localStorage);try{sessionStorage.setItem(SESSION_KEY,raw);}catch{/* Keep the in-memory session when storage is unavailable. */}}
};
const local=read(()=>localStorage);
let stored=parse(local)||parse(read(()=>sessionStorage));
if(stored)persist(stored);else if(local){remove(()=>localStorage);remove(()=>sessionStorage);}

export const getSession=()=>stored;
const notify=()=>{if(typeof window!=='undefined')window.dispatchEvent(new Event('ourworld:session'));};
export function setSession(value:Session|null){
 const next=value===null?null:parse(JSON.stringify(value));
 if(value!==null&&!next)return;
 stored=next;persist(stored);notify();
}
/** Adopt other tabs' token rotations before refreshing a single-use refresh token. */
export function syncSession(force=false){
 const raw=read(()=>localStorage);
 if(raw===undefined||!raw&&!persistent&&!force)return;
 const next=parse(raw);
 if(JSON.stringify(next)!==JSON.stringify(stored)){stored=next;persistent=!!next;remove(()=>sessionStorage);notify();}
}
if(typeof window!=='undefined')window.addEventListener('storage',event=>{
 if(event.key===SESSION_KEY||event.key===null)syncSession(true);
});
