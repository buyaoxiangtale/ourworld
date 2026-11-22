import {useLayoutEffect,useRef,useState} from 'react';
import {ArrowLeft,ArrowRight,X} from 'lucide-react';
import {useApp} from '../../context';
import {useDialogFocus} from '../../useDialogFocus';
import {Cover,IconButton} from '../../ui';

export function ProfilePhotoViewer({photos,initialIndex=0,onClose}:{photos:string[];initialIndex?:number;onClose:()=>void}){
 const {t}=useApp();const focus=useDialogFocus(onClose);const track=useRef<HTMLDivElement>(null);
 const start=Math.max(0,Math.min(initialIndex,photos.length-1));const [index,setIndex]=useState(start);const current=useRef(start);
 const gesture=useRef<{id:number;x:number;left:number}|null>(null);const [dragging,setDragging]=useState(false);
 const nearest=()=>{
  const element=track.current;if(!element)return 0;
  const center=element.scrollLeft+element.clientWidth/2;let best=0,distance=Infinity;
  Array.from(element.children).forEach((child,i)=>{const card=child as HTMLElement;const delta=Math.abs(card.offsetLeft+card.offsetWidth/2-center);if(delta<distance){best=i;distance=delta;}});
  return best;
 };
 const go=(next:number,smooth=true)=>{
  const element=track.current;if(!element)return;
  const target=Math.max(0,Math.min(next,photos.length-1));
  const card=element.children[target] as HTMLElement|undefined;if(!card)return;
  element.scrollTo({left:Math.max(0,card.offsetLeft+card.offsetWidth/2-element.clientWidth/2),behavior:smooth&&!matchMedia('(prefers-reduced-motion: reduce)').matches?'smooth':'instant'});
 };
 useLayoutEffect(()=>{
  const element=track.current;if(!element)return;go(start,false);
  const observer=new ResizeObserver(()=>go(current.current,false));observer.observe(element);return()=>observer.disconnect();
 },[]);
 const finish=()=>{if(!gesture.current)return;gesture.current=null;setDragging(false);go(nearest());};
 return <section ref={focus} className="profile-photo-viewer" role="dialog" aria-modal="true" aria-label={t('我的照片','My photos')} onKeyDown={event=>{if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();go(index+(event.key==='ArrowLeft'?-1:1));}}}>
  <header><IconButton label={t('关闭照片','Close photos')} onClick={onClose}><X size={24}/></IconButton><h2>{t('我的照片','My photos')}</h2><span className="profile-photo-position" aria-live="polite" aria-atomic="true">{index+1} / {photos.length}</span></header>
  <div className="profile-photo-viewer-stage">
   <div ref={track} className={`profile-photo-viewer-track ${dragging?'is-dragging':''}`} tabIndex={0} aria-label={t('左右滑动查看照片','Swipe left or right to view photos')} onScroll={()=>{const next=nearest();current.current=next;setIndex(next);}}
    onPointerDown={event=>{if(event.pointerType==='touch'||event.button!==0)return;gesture.current={id:event.pointerId,x:event.clientX,left:event.currentTarget.scrollLeft};event.currentTarget.setPointerCapture(event.pointerId);setDragging(true);}}
    onPointerMove={event=>{const active=gesture.current;if(!active||active.id!==event.pointerId)return;event.preventDefault();event.currentTarget.scrollLeft=active.left+active.x-event.clientX;}}
    onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish} onDragStart={event=>event.preventDefault()}>
    {photos.map((photo,i)=><div className={`profile-photo-viewer-slide ${i===index?'is-active':''}`} key={`${photo}-${i}`} role="group" aria-label={t(`照片 ${i+1}，共 ${photos.length} 张`,`Photo ${i+1} of ${photos.length}`)}><Cover src={photo} alt={t(`我的第 ${i+1} 张照片`,`My photo ${i+1}`)}/></div>)}
   </div>
   {photos.length>1&&<><IconButton className="profile-photo-previous" label={t('上一张照片','Previous photo')} disabled={index===0} onClick={()=>go(index-1)}><ArrowLeft size={23}/></IconButton><IconButton className="profile-photo-next" label={t('下一张照片','Next photo')} disabled={index===photos.length-1} onClick={()=>go(index+1)}><ArrowRight size={23}/></IconButton></>}
  </div>
  {photos.length>1&&photos.length<=12&&<div className="profile-photo-dots" role="group" aria-label={t('照片导航','Photo navigation')}>{photos.map((_,i)=><button type="button" key={i} aria-label={t(`查看照片 ${i+1}`,`View photo ${i+1}`)} aria-current={i===index?'true':undefined} onClick={()=>go(i)}><span/></button>)}</div>}
  <p className="profile-photo-viewer-hint">{photos.length>1?t('左右滑动查看更多照片','Swipe to see more photos'):t('我的一刻','A moment of mine')}</p>
 </section>;
}
