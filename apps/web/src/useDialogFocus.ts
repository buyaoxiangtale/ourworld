import {useEffect,useRef} from 'react';
import {useSlideExit} from './SlidePresence';

export function useDialogFocus(onClose:()=>void){
 const root=useRef<HTMLElement|null>(null),close=useRef(onClose);close.current=onClose;
 useSlideExit(root);
 useEffect(()=>{
  const previous=document.activeElement as HTMLElement|null;
  const dialog=root.current;if(!dialog)return;
  const controls=()=>Array.from(dialog.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],input:not([disabled]),textarea:not([disabled]),select:not([disabled]),[tabindex="0"]')).filter(el=>el.getClientRects().length>0);
  // The first control may still be below the viewport during an entry animation.
  // Focusing it must not scroll the overlay or any underlying profile container.
  if(!dialog.contains(document.activeElement))controls()[0]?.focus({preventScroll:true});
  const key=(event:KeyboardEvent)=>{
   if(Array.from(document.querySelectorAll('[aria-modal="true"]')).at(-1)!==dialog)return;
   if(event.key==='Escape'){event.preventDefault();close.current();}
   if(event.key==='Tab'){const elements=controls(),first=elements[0],last=elements.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}
  };
  document.addEventListener('keydown',key);return()=>{document.removeEventListener('keydown',key);if(previous?.isConnected&&(document.activeElement===document.body||dialog.contains(document.activeElement)))previous.focus({preventScroll:true});};
 },[]);return root;
}
