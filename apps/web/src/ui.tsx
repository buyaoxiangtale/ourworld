import {useDialogFocus} from './useDialogFocus';
import { X, ArrowLeft, AlertCircle, Image as ImageIcon } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode, type ButtonHTMLAttributes, type HTMLAttributes } from 'react';
function useDialogPointer(onClose:()=>void):HTMLAttributes<HTMLDivElement>{
 const pressed=useRef<EventTarget|null>(null);
 return {
  onPointerDownCapture:event=>{pressed.current=event.target;},
  onPointerCancelCapture:()=>{pressed.current=null;},
  // A touch on the globe can open a sheet before its compatibility click arrives.
  // Ignore that click throughout the new overlay, including its close controls.
  // Keyboard and assistive-technology clicks have detail 0 and remain available.
  onClickCapture:event=>{if(event.detail>0&&!pressed.current){event.preventDefault();event.stopPropagation();}},
  onClick:event=>{const started=pressed.current;pressed.current=null;if(event.target===event.currentTarget&&(event.detail===0||started===event.currentTarget))onClose();}
 };
}
export function Button({children,kind='primary',busy=false,...props}:ButtonHTMLAttributes<HTMLButtonElement>&{kind?:'primary'|'secondary'|'ghost'|'danger';busy?:boolean}){return <button {...props} className={`button ${kind} ${props.className||''}`} disabled={props.disabled||busy}>{busy&&<EarthSpinner small/>}{children}</button>;}
export function IconButton({children,label,...props}:ButtonHTMLAttributes<HTMLButtonElement>&{label:string}){return <button {...props} className={`icon-button ${props.className||''}`} aria-label={label} title={label}>{children}</button>;}
export function Modal({title,children,onClose,wide=false,className='',footer}:{title:string;children:ReactNode;onClose:()=>void;wide?:boolean;className?:string;footer?:ReactNode}){const focus=useDialogFocus(onClose),pointer=useDialogPointer(onClose);return <div className="modal-backdrop" {...pointer}><section ref={focus} className={`modal ${wide?'wide':''} ${className}`} role="dialog" aria-modal="true" aria-label={title}><header className="modal-header"><h2>{title}</h2><IconButton label="Close" onClick={onClose}><X size={21}/></IconButton></header><div className="modal-body">{children}</div>{footer&&<footer className="modal-footer">{footer}</footer>}</section></div>;}
export function Sheet({children,onClose,label,className=''}:{children:ReactNode;onClose:()=>void;label:string;className?:string}){const focus=useDialogFocus(onClose),pointer=useDialogPointer(onClose);return <div className="sheet-backdrop" {...pointer}><section ref={focus} className={`bottom-sheet ${className}`} role="dialog" aria-modal="true" aria-label={label}><button className="sheet-handle" onClick={onClose} aria-label="Close"/><div className="sheet-body">{children}</div></section></div>;}
export function ErrorBox({message,retry}:{message:string;retry?:()=>void}){if(!message)return null;return <div className="error-box" role="alert"><AlertCircle size={18}/><span>{message}</span>{retry&&<button type="button" onClick={retry}>↻</button>}</div>;}
export function EarthSpinner({small=false}:{small?:boolean}){return <span className={small?'earth-spinner small':'earth-spinner'} aria-hidden="true"/>;}
export function Loading(){return <div className="loading" role="status" aria-label="Loading / 加载中"><EarthSpinner/></div>;}
export function Empty({title,description,action}:{title:string;description?:string;action?:ReactNode}){return <div className="empty"><span className="empty-orbit">✦</span><h3>{title}</h3>{description&&<p>{description}</p>}{action}</div>;}
export function PageHeader({title,eyebrow,back,actions}:{title:string;eyebrow?:string;back?:()=>void;actions?:ReactNode}){return <header className="page-header"><div className="header-main">{back&&<IconButton label="Back" onClick={back}><ArrowLeft size={21}/></IconButton>}<div>{eyebrow&&<span className="eyebrow">{eyebrow}</span>}<h1>{title}</h1></div></div><div className="header-actions">{actions}</div></header>;}
export function Avatar({src,name,size='medium'}:{src?:string;name:string;size?:'small'|'medium'|'large'}){const [failed,setFailed]=useState(false);useEffect(()=>setFailed(false),[src]);return src&&!failed?<img className={`avatar ${size}`} src={src} alt={name} onError={()=>setFailed(true)}/>:<span className={`avatar placeholder ${size}`} aria-label={name}>{name.slice(0,1)}</span>;}
export function Cover({src,alt,className=''}:{src?:string;alt:string;className?:string}){const [failed,setFailed]=useState(false);useEffect(()=>setFailed(false),[src]);return src&&!failed?<img className={`cover ${className}`} src={src} alt={alt} loading="lazy" onError={()=>setFailed(true)}/>:<div className={`cover no-image ${className}`} role="img" aria-label={alt}><ImageIcon size={30}/></div>;}
