import {useEffect,useRef} from 'react';

export function useDialogFocus(onClose:()=>void){
 const root=useRef<HTMLElement|null>(null),close=useRef(onClose);close.current=onClose;
 useEffect(()=>{
  const previous=document.activeElement as HTMLElement|null;
  const dialog=root.current;if(!dialog)return;
  const controls=()=>Array.from(dialog.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],input:not([disabled]),textarea:not([disabled]),select:not([disabled]),[tabindex="0"]')).filter(el=>el.getClientRects().length>0);
  if(!dialog.contains(document.activeElement))controls()[0]?.focus();
  const key=(event:KeyboardEvent)=>{
   if(Array.from(document.querySelectorAll('[aria-modal="true"]')).at(-1)!==dialog)return;
   if(event.key==='Escape'){event.preventDefault();close.current();}
   if(event.key==='Tab'){const elements=controls(),first=elements[0],last=elements.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}
  };
  document.addEventListener('keydown',key);return()=>{document.removeEventListener('keydown',key);if(previous?.isConnected)previous.focus();};
 },[]);return root;
}
