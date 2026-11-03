import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from 'react';
import { swipeDirection, swipeMotion } from './swipe-physics';

export function useSwipeDeck(key:string|undefined,authorize:()=>boolean,connect:()=>Promise<boolean>,advance:()=>void){
 const root=useRef<HTMLDivElement>(null),card=useRef<HTMLElement>(null);
 const animation=useRef(0),offset=useRef({x:0,y:0});
 const gesture=useRef<{id:number;x:number;y:number;samples:{x:number;t:number}[];axis:'x'|'y'|null;crossed:boolean}|null>(null);
 const [phase,setPhase]=useState<'idle'|'dragging'|'returning'|'committing'>('idle');
 const locked=useRef(false),alive=useRef(true),version=useRef(0);
 const callbacks=useRef({authorize,connect,advance});callbacks.current={authorize,connect,advance};
 const paint=(x:number,y=0)=>{
  offset.current={x,y};const width=card.current?.clientWidth||320,p=Math.min(Math.abs(x)/(width*.25),1),style=root.current?.style;
  style?.setProperty('--swipe-x',`${x}px`);style?.setProperty('--swipe-y',`${Math.max(-24,Math.min(24,y*.15))}px`);
  style?.setProperty('--swipe-angle',`${Math.max(-12,Math.min(12,x/width*12))}deg`);style?.setProperty('--swipe-progress',String(p));
  style?.setProperty('--right-progress',String(x>0?p:0));style?.setProperty('--left-progress',String(x<0?p:0));
 };
 const springBack=(velocity=0)=>{
  cancelAnimationFrame(animation.current);setPhase('returning');let x=offset.current.x,v=velocity,last=performance.now();
  const tick=(now:number)=>{if(!alive.current)return;const dt=Math.min((now-last)/1000,.025);last=now;v+=(-400*x-2*.82*Math.sqrt(400)*v)*dt;x+=v*dt;paint(x,offset.current.y*.8);
   if(Math.abs(x)<.3&&Math.abs(v)<3){paint(0);setPhase('idle');}else animation.current=requestAnimationFrame(tick);
  };animation.current=requestAnimationFrame(tick);
 };
 const choose=async(direction:-1|1,velocity=0)=>{
  if(locked.current||!key)return;
  if(direction>0&&!callbacks.current.authorize()){springBack();return;}
  cancelAnimationFrame(animation.current);gesture.current=null;locked.current=true;setPhase('committing');
  const generation=version.current,request=direction>0?callbacks.current.connect():Promise.resolve(true);
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const initial=offset.current.x,width=card.current?.clientWidth||320,target=direction*width*1.45;
  const duration=reduced?60:Math.max(swipeMotion.exitMin,Math.min(swipeMotion.exitMax,Math.abs(target-initial)/Math.max(Math.abs(velocity),width*4)*1000));
  await new Promise<void>(resolve=>{const start=performance.now();const tick=(now:number)=>{if(!alive.current){resolve();return;}const p=Math.min(1,(now-start)/duration);paint(initial+(target-initial)*(1-Math.pow(1-p,3)));if(p===1)resolve();else animation.current=requestAnimationFrame(tick);};animation.current=requestAnimationFrame(tick);});
  let success=false;try{success=await request;}catch{success=false;}
  if(!alive.current||generation!==version.current)return;
  locked.current=false;
  if(success){callbacks.current.advance();setPhase('idle');}else springBack();
 };
 useLayoutEffect(()=>{version.current++;locked.current=false;cancelAnimationFrame(animation.current);paint(0);setPhase('idle');gesture.current=null;},[key]);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;version.current++;cancelAnimationFrame(animation.current);};},[]);
 return {root,card,phase,busy:phase==='committing',choose,
  onPointerDown:(e:PointerEvent<HTMLElement>)=>{if(locked.current||e.button!==0||(e.target as HTMLElement).closest('button,a'))return;cancelAnimationFrame(animation.current);gesture.current={id:e.pointerId,x:e.clientX-offset.current.x,y:e.clientY,samples:[{x:e.clientX,t:performance.now()}],axis:null,crossed:false};},
  onPointerMove:(e:PointerEvent<HTMLElement>)=>{const g=gesture.current;if(!g||g.id!==e.pointerId)return;const x=e.clientX-g.x,y=e.clientY-g.y;
   if(!g.axis&&Math.hypot(x,y)>10){g.axis=Math.abs(x)>Math.abs(y)*1.2?'x':'y';if(g.axis==='x'){e.currentTarget.setPointerCapture(e.pointerId);setPhase('dragging');}}
   if(g.axis!=='x')return;const now=performance.now();g.samples=g.samples.filter(s=>now-s.t<100);g.samples.push({x:e.clientX,t:now});paint(x,y);
   if(!g.crossed&&Math.abs(x)>=(card.current?.clientWidth||320)*.25){g.crossed=true;navigator.vibrate?.(8);}
  },
  onPointerUp:(e:PointerEvent<HTMLElement>)=>{const g=gesture.current;if(!g||g.id!==e.pointerId)return;gesture.current=null;const now=performance.now(),sample=g.samples.find(s=>now-s.t<120),velocity=sample?(e.clientX-sample.x)/Math.max(1,now-sample.t)*1000:0;
   const direction=g.axis==='x'?swipeDirection(e.clientX-g.x,e.clientY-g.y,card.current?.clientWidth||320,velocity):0;
   if(direction)void choose(direction,velocity);else springBack(velocity);
  },
  onPointerCancel:()=>{gesture.current=null;if(!locked.current)springBack();},
 };
}
