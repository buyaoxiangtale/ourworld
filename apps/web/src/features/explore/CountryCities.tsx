import {useLayoutEffect,useRef,useState} from 'react';
import {ArrowLeft,ArrowRight,MapPin} from 'lucide-react';
import type {Place} from '@ourworld/contracts';
import {api} from '../../api';
import {useApp} from '../../context';
import {useLoad} from '../../hooks';
import {useDialogFocus} from '../../useDialogFocus';
import {Button,Cover,Empty,ErrorBox,IconButton,Loading} from '../../ui';

export type CountryTarget=Pick<Place,'name'>&{id?:string};

export function CountryCities({country,initialIndex=0,inert=false,onIndexChange,onClose,onChoose,onSearch}:{country:CountryTarget;initialIndex?:number;inert?:boolean;onIndexChange:(index:number)=>void;onClose:()=>void;onChoose:(city:Place)=>void;onSearch:()=>void}){
 const {locale,t}=useApp(),focus=useDialogFocus(onClose);
 const cities=useLoad(async()=>country.id?(await api<{items:Place[]}>(`/places?kind=city&parentId=${encodeURIComponent(country.id)}`)).items:[],[country.id]);
 const items=cities.data||[],track=useRef<HTMLDivElement>(null),current=useRef(initialIndex);
 const [index,setIndex]=useState(initialIndex),[dragging,setDragging]=useState(false);
 const gesture=useRef<{id:number;x:number;y:number;left:number;dragging:boolean}|null>(null);
 const nearest=()=>{
  const element=track.current;if(!element)return 0;
  const center=element.scrollLeft+element.clientWidth/2;let best=0,distance=Infinity;
  Array.from(element.children).forEach((child,i)=>{const card=child as HTMLElement,delta=Math.abs(card.offsetLeft+card.offsetWidth/2-center);if(delta<distance){best=i;distance=delta;}});
  return best;
 };
 const go=(next:number,smooth=true)=>{
  const element=track.current;if(!element)return;
  const target=Math.max(0,Math.min(next,items.length-1)),card=element.children[target] as HTMLElement|undefined;if(!card)return;
  element.scrollTo({left:Math.max(0,card.offsetLeft+card.offsetWidth/2-element.clientWidth/2),behavior:smooth&&!matchMedia('(prefers-reduced-motion: reduce)').matches?'smooth':'instant'});
 };
 useLayoutEffect(()=>{
  const element=track.current;if(!element||!items.length)return;
  const target=Math.max(0,Math.min(current.current,items.length-1));if(target!==current.current){current.current=target;setIndex(target);onIndexChange(target);}go(target,false);
  const observer=new ResizeObserver(()=>go(current.current,false));observer.observe(element);return()=>observer.disconnect();
 },[cities.data]);
 const finish=()=>{const active=gesture.current;if(!active)return;gesture.current=null;setDragging(false);if(active.dragging)go(nearest());};
 return <section ref={focus} className="country-cities-page" role="dialog" aria-modal="true" aria-label={t('浏览城市','Browse cities')} inert={inert} aria-hidden={inert||undefined} onKeyDown={event=>{
  if((event.target as HTMLElement).closest('[role="dialog"]')!==event.currentTarget)return;
  if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();go(index+(event.key==='ArrowLeft'?-1:1));}
 }}>
  <header className="country-cities-header"><IconButton label={t('返回国家信息','Back to country information')} onClick={onClose}><ArrowLeft size={23}/></IconButton><div><span>{country.name[locale]}</span><h1>{t('浏览城市','Browse cities')}</h1></div></header>
  {cities.loading?<Loading/>:cities.error?<ErrorBox message={cities.error} retry={cities.reload}/>:items.length?<>
   <div ref={track} className={`country-city-track ${dragging?'is-dragging':''}`} tabIndex={0} aria-label={t('左右滑动浏览城市','Swipe left or right to browse cities')} onScroll={()=>{const next=nearest();if(next!==current.current){current.current=next;setIndex(next);onIndexChange(next);}}}
    onPointerDown={event=>{if(event.pointerType==='touch'||event.button!==0||(event.target as HTMLElement).closest('button,a'))return;gesture.current={id:event.pointerId,x:event.clientX,y:event.clientY,left:event.currentTarget.scrollLeft,dragging:false};}}
    onPointerMove={event=>{const active=gesture.current;if(!active||active.id!==event.pointerId)return;const x=event.clientX-active.x,y=event.clientY-active.y;if(!active.dragging){if(Math.abs(x)<8||Math.abs(x)<=Math.abs(y))return;active.dragging=true;event.currentTarget.setPointerCapture(event.pointerId);setDragging(true);}event.preventDefault();event.currentTarget.scrollLeft=active.left-x;}}
    onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish} onDragStart={event=>event.preventDefault()}>
    {items.map((city,i)=><article className={`country-city-card ${i===index?'is-active':''}`} key={city.id} role="group" aria-label={t(`城市 ${i+1}，共 ${items.length} 座`,`City ${i+1} of ${items.length}`)} inert={i!==index}>
     <Cover src={city.image} alt={city.name[locale]}/><div className="country-city-card-content"><span className="country-city-location"><MapPin size={14}/>{country.name[locale]}</span><h2>{city.name[locale]}</h2>{locale==='zh'&&<span className="country-city-english">{city.name.en}</span>}<p>{city.description[locale]||t('从这座城市，开始下一段旅程。','Begin your next journey here.')}</p><Button onClick={()=>onChoose(city)}>{t('查看城市','Explore city')}<ArrowRight size={18}/></Button></div>
    </article>)}
   </div>
   <footer className="country-city-controls"><IconButton label={t('上一座城市','Previous city')} disabled={index===0} onClick={()=>go(index-1)}><ArrowLeft size={22}/></IconButton><div><span aria-live="polite" aria-atomic="true">{index+1} / {items.length}</span><p>{items.length>1?t('左右滑动，发现下一座城市','Swipe to discover the next city'):t('从这里开始探索','Start exploring here')}</p></div><IconButton label={t('下一座城市','Next city')} disabled={index===items.length-1} onClick={()=>go(index+1)}><ArrowRight size={22}/></IconButton></footer>
  </>:<Empty title={t('这里的城市尚未收录','No cities have been added here yet')} description={t('可以先看看其他目的地。','Explore another destination while we add more cities.')} action={<Button kind="secondary" onClick={onSearch}>{t('探索其他地点','Explore other places')}</Button>}/>}
 </section>;
}
