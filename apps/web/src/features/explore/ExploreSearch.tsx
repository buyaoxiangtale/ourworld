import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {ArrowRight,Search,X} from 'lucide-react';
import type {Place} from '@ourworld/contracts';
import {api} from '../../api';
import {useApp} from '../../context';
import {errorMessage} from '../../hooks';
import {Button,Cover,Empty,ErrorBox,IconButton,Loading,Sheet} from '../../ui';

type DestinationPage={items:Place[];nextOffset?:number|null};
type SearchResult={offset:number;attempt:number;error:string};
const pageSize=24;

export function ExploreSearch({country,onClose,onChoose}:{country?:Place;onClose:()=>void;onChoose:(place:Place)=>void}){
 const {locale,t}=useApp();
 const viewportLayer=useRef<HTMLDivElement>(null);
 useLayoutEffect(()=>{
  const layer=viewportLayer.current;
  const viewport=window.visualViewport;
  if(!layer||!viewport)return;
  const sync=()=>{
   layer.style.setProperty('--search-viewport-top',`${Math.max(0,viewport.offsetTop)}px`);
   layer.style.setProperty('--search-viewport-height',`${viewport.height}px`);
   layer.toggleAttribute('data-compact',viewport.height<window.innerHeight-80||viewport.height<480);
  };
  sync();
  viewport.addEventListener('resize',sync);
  viewport.addEventListener('scroll',sync);
  window.addEventListener('resize',sync);
  return()=>{
   viewport.removeEventListener('resize',sync);
   viewport.removeEventListener('scroll',sync);
   window.removeEventListener('resize',sync);
  };
 },[]);
 const [query,setQuery]=useState('');
 const [local,setLocal]=useState(!!country);
 const [offset,setOffset]=useState(0);
 const [attempt,setAttempt]=useState(0);
 const [result,setResult]=useState<SearchResult|null>(null);
 const [items,setItems]=useState<Place[]>([]);
 const [nextOffset,setNextOffset]=useState<number|null>(null);
 const pending=result?.offset!==offset||result.attempt!==attempt;
 const error=pending?'':result.error;
 const parentId=local?country?.id:undefined;
 const searchLabel=t('搜索国家、城市、景点','Search a country, city or landmark');
 const reset=()=>{setItems([]);setNextOffset(null);setOffset(0);setResult(null);};
 const retry=()=>setAttempt(value=>value+1);
 useEffect(()=>{
  const controller=new AbortController();
  const timer=window.setTimeout(async()=>{
   const params=new URLSearchParams({q:query,limit:String(pageSize),offset:String(offset)});
   if(parentId){params.set('kind','city');params.set('parentId',parentId);}
   try{
    const page=await api<DestinationPage>(`/places?${params}`,{
     signal:AbortSignal.any([controller.signal,AbortSignal.timeout(20000)])
    });
    if(controller.signal.aborted)return;
    setItems(previous=>offset===0?page.items:[...new Map([...previous,...page.items].map(place=>[place.id,place])).values()]);
    setNextOffset(page.nextOffset!=null&&page.nextOffset>offset?page.nextOffset:null);
    setResult({offset,attempt,error:''});
   }catch(cause){
    if(!controller.signal.aborted)setResult({offset,attempt,error:errorMessage(cause)});
   }
  },offset===0?250:0);
  return()=>{controller.abort();window.clearTimeout(timer);};
 },[query,parentId,offset,attempt]);

 return createPortal(<div ref={viewportLayer} className="explore-search-layer"><Sheet className="explore-search-sheet" label={t('探索地点','Explore places')} onClose={onClose}>
  <form className="search-sheet-input" onSubmit={event=>{
   event.preventDefault();
   if(query.trim()&&!pending&&!error&&items[0])onChoose(items[0]);
  }}>
   <Search size={20} aria-hidden="true"/>
   <input autoFocus type="search" enterKeyHint="search" aria-label={searchLabel} placeholder={searchLabel} value={query}
    onChange={event=>{reset();setQuery(event.target.value);}}/>
   <IconButton type="button" label={t('关闭','Close')} onClick={onClose}><X size={18}/></IconButton>
  </form>
  <div className="explore-search-results">
  {country&&<div className="place-search-scopes">
   <button type="button" className={local?'active':''} aria-pressed={local} onClick={()=>{if(!local){reset();setLocal(true);}}}>{country.name[locale]}</button>
   <button type="button" className={local?'':'active'} aria-pressed={!local} onClick={()=>{if(local){reset();setLocal(false);}}}>{t('全部目的地','All destinations')}</button>
  </div>}
  <div className="section-heading">
   <span className="eyebrow">{query.trim()?t('搜索结果','SEARCH RESULTS'):t('探索地点','EXPLORE PLACES')}</span>
   {!pending&&!error&&<span role="status">{items.length}</span>}
  </div>
  {error&&<div><ErrorBox message={error}/><Button kind="secondary" onClick={retry}>{t('重试','Retry')}</Button></div>}
  {items.length>0&&<div className="place-results">{items.map(place=><button type="button" className="place-result" key={place.id}
   onClick={()=>onChoose(place)}>
   <Cover src={place.image} alt=""/>
   <span><strong>{place.name[locale]}</strong><small>{place.country} · {place.kind==='country'?t('国家','Country'):place.kind==='city'?t('城市','City'):t('景点','Landmark')}</small></span>
   <ArrowRight size={17} aria-hidden="true"/>
  </button>)}</div>}
  {pending&&<Loading/>}
  {!pending&&!error&&(nextOffset!==null
   ?<Button kind="secondary" onClick={()=>setOffset(nextOffset)}>{t('加载更多地点','Load more places')}</Button>
   :items.length===0&&<Empty title={t('还没有找到这个地方','No places found')} description={t('换一个名称，或试试中英文别名。','Try another name or an alias in Chinese or English.')}/>)}
  </div>
 </Sheet></div>,document.body);
}
