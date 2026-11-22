import type {ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {useDialogFocus} from '../../useDialogFocus';

export function ProfileCardSheet({title,className='',busy=false,onClose,children}:{title:string;className?:string;busy?:boolean;onClose:()=>void;children:ReactNode}){
 const close=()=>{if(!busy)onClose();};const focus=useDialogFocus(close);
 return createPortal(<div className="profile-card-sheet-backdrop" onClick={event=>{if(event.target===event.currentTarget)close();}}><section ref={focus} className={`profile-card-sheet ${className}`} role="dialog" aria-modal="true" aria-label={title}>{children}</section></div>,document.body);
}
