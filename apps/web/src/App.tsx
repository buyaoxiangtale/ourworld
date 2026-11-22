import {SlidePresence} from './SlidePresence';
import { useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import type { Locale, User } from '@ourworld/contracts';
import { api, connectRealtime, getSession, send, setSession } from './api';
import { AppContext } from './context';
import { translator } from './i18n';
import { Auth } from './Auth';
import { Explore } from './Explore';
import { Chat } from './Chat';
import { NavEarth } from './NavEarth';
import { Stories } from './Stories';
import { Profile, PublicProfile } from './features/profile/Profile';
import { Admin } from './Admin';
import { Button, ErrorBox, Loading, Modal } from './ui';
import { errorMessage } from './hooks';

export function App(){
 const [locale,setLanguage]=useState<Locale>(()=>localStorage.getItem('ourworld.locale')==='en'?'en':'zh');const [user,setUser]=useState<User|null>(()=>getSession()?.user||null);const [tab,setTab]=useState<'earth'|'community'|'chat'|'profile'>(()=>{const restored=sessionStorage.getItem('ourworld.frontend.tab');return restored==='community'||restored==='chat'||restored==='profile'?restored:'earth';});const [auth,setAuth]=useState(false);const [profileId,setProfileId]=useState<string|null>(null);const [notification,setNotification]=useState('');const [newConversation,setNewConversation]=useState(false);const [emailAction,setEmailAction]=useState(()=>{const params=new URLSearchParams(location.search);const verify=params.get('verify');const reset=params.get('reset');const token=params.get('token');if(verify)return {token:verify,reset:false};if(reset)return {token:reset,reset:true};return token&&/verify|reset/.test(location.pathname)?{token,reset:location.pathname.includes('reset')}:null;});const pendingAction=useRef<(()=>void)|undefined>(undefined);const toastTimer=useRef<number|undefined>(undefined);const t=translator(locale);
 useEffect(()=>{sessionStorage.removeItem('ourworld.frontend.tab');},[]);
 const setLocale=(next:Locale)=>{setLanguage(next);localStorage.setItem('ourworld.locale',next);document.documentElement.lang=next;};
 const toast=(message:string)=>{setNotification(message);clearTimeout(toastTimer.current);toastTimer.current=window.setTimeout(()=>setNotification(''),3800);};
 useEffect(()=>{const update=()=>{const next=getSession()?.user||null;setUser(next);if(!next){pendingAction.current=undefined;setAuth(false);setProfileId(null);setNewConversation(false);}if(next?.verified&&pendingAction.current){const action=pendingAction.current;pendingAction.current=undefined;setAuth(false);setTimeout(action,0);}};window.addEventListener('ourworld:session',update);return()=>window.removeEventListener('ourworld:session',update);},[]);
 useEffect(()=>{if(!user)return;return connectRealtime();},[user?.id,getSession()?.accessToken]);
 useEffect(()=>{const notify=(e:Event)=>{const kind=(e as CustomEvent).detail?.event;if(tab!=='chat'&&['conversation.created','message.created'].includes(kind))setNewConversation(true);};window.addEventListener('ourworld:realtime',notify);return()=>window.removeEventListener('ourworld:realtime',notify);},[tab]);
 const refreshUser=async()=>{const before=getSession();if(!before)return;const next=await api<User>('/me');const current=getSession();if(current?.clientId===before.clientId)setSession({...current,user:next});};
 useEffect(()=>{if(getSession())void refreshUser().catch(()=>{});},[]);
 const requireAuth=(action?:()=>void)=>{const current=getSession()?.user;if(current?.verified)return true;pendingAction.current=action;setAuth(true);return false;};
 useEffect(()=>{const update=()=>document.documentElement.style.setProperty('--app-height',`${window.visualViewport?.height||window.innerHeight}px`);update();window.visualViewport?.addEventListener('resize',update);return()=>window.visualViewport?.removeEventListener('resize',update);},[]);
 const admin=location.pathname.startsWith('/admin');
 return <AppContext.Provider value={{user,locale,t,setLocale,toast,openAuth:()=>setAuth(true),requireAuth,openProfile:(id)=>{setNotification('');setProfileId(id);},refreshUser,conversationAdded:()=>{setNewConversation(true);window.dispatchEvent(new CustomEvent('ourworld:realtime',{detail:{event:'conversation.created',data:{}}}));}}}>{admin?<Admin key={getSession()?.clientId||'guest'}/>:<div className="app-shell starlight" inert={!!(profileId||auth||emailAction)}><main className={`mobile-app ${tab==='earth'?'earth-mode':'paper-mode'}`}>
  <div className="tab-panel earth-panel" style={{display:tab==='earth'?'block':'none'}}><Explore active={tab==='earth'}/></div>
  {tab==='community'&&<div className="tab-panel"><Stories/></div>}
  <div className="tab-panel" style={{display:tab==='chat'?'block':'none'}}><Chat key={getSession()?.clientId||'guest'} active={tab==='chat'} onListSeen={()=>setNewConversation(false)}/></div>
  <div className="tab-panel" style={{display:tab==='profile'?'block':'none'}}><Profile key={getSession()?.clientId||'guest'}/></div>
  <nav className="bottom-nav" aria-label={t('主导航','Main navigation')}>
    <button aria-label={t('地球','Explore')} aria-current={tab==='earth'?'page':undefined} data-tab="earth" className={tab==='earth'?'active':''} onClick={()=>{setNotification('');setTab('earth');}}>
      <span className="nav-planet" aria-hidden="true"><NavEarth/></span>
    </button>
    <button aria-label={t('社区','Community')} aria-current={tab==='community'?'page':undefined} data-tab="community" className={tab==='community'?'active':''} onClick={()=>{setNotification('');setTab('community');}}>
      <span className="nav-planet"><span className="planet-atlas" data-planet="community" aria-hidden="true"/></span>
    </button>
    <button aria-label={t('聊天','Chats')} aria-current={tab==='chat'?'page':undefined} data-tab="chat" className={tab==='chat'?'active':''} onClick={()=>{setNotification('');setTab('chat');setNewConversation(false);}}>
      <span className="nav-planet"><span className="planet-atlas" data-planet="chat" aria-hidden="true"/>{newConversation&&<i/>}</span>
    </button>
    <button aria-label={t('我的','Profile')} aria-current={tab==='profile'?'page':undefined} data-tab="profile" className={tab==='profile'?'active':''} onClick={()=>{setNotification('');setTab('profile');}}>
      <span className="nav-planet"><span className="planet-atlas" data-planet="profile" aria-hidden="true"/></span>
    </button>
  </nav>
 </main></div>}{auth&&<Modal title={t('欢迎来到 Ourworld','Welcome to Ourworld')} onClose={()=>{setAuth(false);pendingAction.current=undefined;}}><Auth onClose={()=>setAuth(false)}/></Modal>}<SlidePresence>{profileId&&<PublicProfile userId={profileId} onClose={()=>setProfileId(null)}/>}</SlidePresence> {emailAction&&<EmailAction token={emailAction.token} reset={emailAction.reset} onClose={()=>{setEmailAction(null);history.replaceState({},'',location.pathname.startsWith('/admin')?'/admin':'/');}}/>}{notification&&<div className="toast" role="status"><Check size={16}/>{notification}</div>}</AppContext.Provider>;
}
function EmailAction({token,reset,onClose}:{token:string;reset:boolean;onClose:()=>void}){const [busy,setBusy]=useState(!reset);const [error,setError]=useState('');const [done,setDone]=useState(false);const [password,setPassword]=useState('');useEffect(()=>{if(!reset){send('/auth/verify',{token}).then(()=>{setDone(true);if(getSession())return api<User>('/me').then(user=>setSession({...getSession()!,user}));}).catch(e=>setError(errorMessage(e))).finally(()=>setBusy(false));}},[token,reset]);return <Modal title={reset?'Reset password / 重置密码':'Verify email / 邮箱验证'} onClose={onClose}>{busy?<Loading/>:done?<div className="auth-form"><span className="auth-symbol"><Check size={28}/></span><h2>{reset?'密码已更新 / Password updated':'验证完成 / Email verified'}</h2><Button onClick={onClose}>继续 / Continue</Button></div>:<><ErrorBox message={error}/>{reset&&<form className="form-stack" onSubmit={async e=>{e.preventDefault();setBusy(true);try{await send('/auth/reset',{token,password});setDone(true);}catch(e){setError(errorMessage(e));}finally{setBusy(false);}}}><label>新密码 / New password<input type="password" minLength={8} required value={password} onChange={e=>setPassword(e.target.value)}/></label><Button type="submit">更新密码 / Update password</Button></form>}</>}</Modal>;}
