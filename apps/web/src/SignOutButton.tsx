import {useState} from 'react';
import {createPortal} from 'react-dom';
import {ArrowRight,LogOut} from 'lucide-react';
import {signOut} from './api';
import {useApp} from './context';
import {Button,Modal} from './ui';

export function SignOutButton({row=false,label,kind='secondary'}:{row?:boolean;label?:string;kind?:'secondary'|'ghost'}){
 const {t}=useApp();const [confirm,setConfirm]=useState(false);
 const close=()=>setConfirm(false);
 const content=<><LogOut size={row?19:17}/>{label||t('退出登录','Sign out')}</>;
 return <>
  {row?<button type="button" aria-haspopup="dialog" aria-expanded={confirm} onClick={()=>setConfirm(true)}><span>{content}</span><ArrowRight size={17}/></button>:<Button kind={kind} type="button" aria-haspopup="dialog" aria-expanded={confirm} onClick={()=>setConfirm(true)}>{content}</Button>}
  {confirm&&createPortal(<Modal title={t('确认退出登录','Confirm sign out')} onClose={close}><p>{t('确定要退出当前账号吗？','Are you sure you want to sign out of this account?')}</p><div className="inline-actions signout-confirm-actions"><Button kind="secondary" type="button" onClick={close}>{t('取消','Cancel')}</Button><Button kind="danger" type="button" onClick={()=>{close();void signOut();}}>{t('确认退出','Sign out')}</Button></div></Modal>,document.body)}
 </>;
}
