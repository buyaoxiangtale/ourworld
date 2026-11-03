import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, Bookmark, Check, Compass, Globe2, HeartHandshake, Info, MapPin, MessageCircle, Search, SlidersHorizontal, Sparkles, Star, Users, X } from 'lucide-react';
import type { GlobeCommand, GlobeEvent, PeopleFeed, Person, Place, Conversation } from '@ourworld/contracts';
import { api, send } from './api';
import { useApp } from './context';
import { errorMessage, useLoad } from './hooks';
import { Avatar, Button, Cover, Empty, ErrorBox, IconButton, Loading, Modal, PageHeader, Sheet } from './ui';
import { Stories } from './Stories';
import { useSwipeDeck } from './useSwipeDeck';

export function Explore({active}:{active:boolean}){
 const {t,locale,user,requireAuth,toast}=useApp();
 const iframe=useRef<HTMLIFrameElement>(null);
 const [ready,setReady]=useState(false);const [globeError,setGlobeError]=useState(false);
 const [query,setQuery]=useState('');const [results,setResults]=useState<Place[]>([]);const [searching,setSearching]=useState(false);const [searchError,setSearchError]=useState('');
 const [showSearch,setShowSearch]=useState(false);const [searchCountry,setSearchCountry]=useState<Place|null>(null);const [searchScope,setSearchScope]=useState<'all'|'country'>('all');
 const [selected,setSelected]=useState<Place|null>(null);const [unknownCountry,setUnknownCountry]=useState<{name:string;lat:number;lng:number}|null>(null);
 const [peopleCity,setPeopleCity]=useState<Place|null>(null);const [storyCity,setStoryCity]=useState<Place|null>(null);
 const [favoriteIds,setFavoriteIds]=useState<string[]>([]);const [saving,setSaving]=useState(false);const [placeError,setPlaceError]=useState('');
 const camera=useRef<Record<string,unknown>|null>(null);
 const catalog=useLoad(async()=>{const [countries,cities]=await Promise.all([api<{items:Place[]}>('/places?kind=country'),api<{items:Place[]}>('/places?kind=city')]);return [...countries.items,...cities.items];},[]);
 const command=(event:GlobeCommand['event'],data:Record<string,unknown>)=>iframe.current?.contentWindow?.postMessage({bridgeVersion:1,event,data} satisfies GlobeCommand,location.origin);
 useEffect(()=>{if(!user){setFavoriteIds([]);return;}api<{items:Place[]}>('/favorites').then(r=>setFavoriteIds(r.items.map(p=>p.id))).catch(()=>{});},[user?.id]);
 useEffect(()=>{const refresh=()=>{if(user)api<{items:Place[]}>('/favorites').then(r=>setFavoriteIds(r.items.map(p=>p.id))).catch(()=>{});};window.addEventListener('ourworld:favorites',refresh);return()=>window.removeEventListener('ourworld:favorites',refresh);},[user?.id]);
 useEffect(()=>{if(ready)command('setMarkers',{places:catalog.data||[],favoriteIds});},[ready,catalog.data,favoriteIds]);
 useEffect(()=>{if(ready){command('setActive',{active:active&&!peopleCity&&!storyCity});if(active&&!peopleCity&&camera.current)command('restoreCamera',camera.current);}},[active,ready,peopleCity?.id,storyCity?.id]);
 useEffect(()=>{const timeout=window.setTimeout(()=>{if(!ready)setGlobeError(true);},10000);return()=>clearTimeout(timeout);},[ready]);
 useEffect(()=>{
  const receive=(e:MessageEvent<GlobeEvent>)=>{
   if(e.source!==iframe.current?.contentWindow||e.origin!==location.origin||e.data?.bridgeVersion!==1)return;
   const {event,data}=e.data;
   if(event==='rendererReady'){setReady(true);setGlobeError(false);}
   if(event==='rendererError')setGlobeError(true);
   if(event==='cameraChanged')camera.current=data;
   if(event==='placeSelected'){
    setPlaceError('');
    if(data.place){setUnknownCountry(null);setSelected(data.place as Place);}
    else if(data.geoName){
     const name=String(data.geoName);const unknown={name,lat:Number(data.lat)||0,lng:Number(data.lng)||0};
     api<{items:Place[]}>(`/places?q=${encodeURIComponent(name)}&kind=country`).then(r=>{
      const exact=r.items.find(p=>p.name.en.toLowerCase()===name.toLowerCase()||(p.aliases||[]).some(alias=>alias.toLowerCase()===name.toLowerCase()));
      if(exact){setUnknownCountry(null);setSelected(exact);}else{setSelected(null);setUnknownCountry(unknown);}
     }).catch(error=>{setSelected(null);setUnknownCountry(unknown);setPlaceError(errorMessage(error));});
    }
   }
  };
  window.addEventListener('message',receive);return()=>window.removeEventListener('message',receive);
 },[]);
 useEffect(()=>{
  if(!showSearch)return;let alive=true;
  const timer=setTimeout(async()=>{setSearching(true);setSearchError('');try{
   const scope=searchScope==='country'&&searchCountry?`&kind=city&parentId=${encodeURIComponent(searchCountry.id)}`:'';
   const r=await api<{items:Place[]}>(`/places?q=${encodeURIComponent(query)}${scope}`);if(alive)setResults(r.items);
  }catch(e){if(alive)setSearchError(errorMessage(e));}finally{if(alive)setSearching(false);}},250);
  return()=>{alive=false;clearTimeout(timer);};
 },[query,showSearch,searchScope,searchCountry?.id]);
 const choose=(place:Place)=>{setShowSearch(false);setQuery('');setUnknownCountry(null);setSelected(place);command('focusPlace',{place});};
 const openSearch=(country?:Place)=>{setSearchCountry(country||null);setSearchScope(country?'country':'all');setQuery('');setShowSearch(true);};
 const favorite=async()=>{if(!selected||selected.kind!=='city'||saving)return;if(!requireAuth(()=>void favorite()))return;setSaving(true);const exists=favoriteIds.includes(selected.id);try{await send(`/favorites/${selected.id}`,undefined,exists?'DELETE':'PUT');setFavoriteIds(ids=>exists?ids.filter(id=>id!==selected.id):[...ids,selected.id]);toast(exists?t('已取消收藏','Removed from your places'):t('地图上为你留下一颗红点','A little red dot, saved for you'));}catch(e){toast(errorMessage(e));}finally{setSaving(false);}};
 return <section className={`explore-page pure-earth ${peopleCity?'is-discovering':''}`} aria-label={t('探索地球','Explore the world')}>
  <button className="search-pill home-search" aria-label={t('搜索国家、城市、景点','Search countries, cities and landmarks')} onClick={()=>openSearch()}><Search size={18}/><span>{t('搜索国家、城市、景点','Search countries, cities and landmarks')}</span></button>
  <div className="earth-stage"><iframe ref={iframe} title={t('可交互地球','Interactive globe')} src="/globe/index.html" className="globe-frame" loading="eager"/>{globeError&&<button className="globe-fallback" aria-label={t('地球暂不可用，浏览地点','Globe unavailable, browse places')} onClick={()=>openSearch()}><Globe2 size={120}/></button>}</div>
  {showSearch&&<Sheet label={t('探索地点','Explore places')} onClose={()=>setShowSearch(false)}><div className="search-sheet-input"><Search size={20}/><input autoFocus placeholder={t('搜索国家、城市、景点','Search a country, city or landmark')} value={query} onChange={e=>setQuery(e.target.value)}/><IconButton label={t('关闭','Close')} onClick={()=>setShowSearch(false)}><X size={18}/></IconButton></div>{searchCountry&&<div className="place-search-scopes"><button className={searchScope==='country'?'active':''} onClick={()=>setSearchScope('country')}>{searchCountry.name[locale]}</button><button className={searchScope==='all'?'active':''} onClick={()=>setSearchScope('all')}>{t('全部目的地','All destinations')}</button></div>}<div className="section-heading"><span className="eyebrow">{query?t('搜索结果','SEARCH RESULTS'):t('探索地点','EXPLORE PLACES')}</span><span>{results.length}</span></div><ErrorBox message={searchError}/>{searching?<Loading/>:results.length?<div className="place-results">{results.map(place=><button className="place-result" key={place.id} onClick={()=>choose(place)}><Cover src={place.image} alt={place.name[locale]}/><span><strong>{place.name[locale]}</strong><small>{place.country} · {place.kind==='country'?t('国家','Country'):place.kind==='city'?t('城市','City'):t('景点','Landmark')}</small></span><ArrowRight size={17}/></button>)}</div>:<Empty title={t('还没有找到这个地方','No places found')} description={t('换一个名称，或试试中英文别名。','Try another name or an alias in Chinese or English.')}/>}</Sheet>}
  {selected&&!showSearch&&!peopleCity&&!storyCity&&<CitySheet place={selected} favorite={favoriteIds.includes(selected.id)} busy={saving} onFavorite={favorite} onClose={()=>setSelected(null)} onChoose={choose} onSearch={openSearch} onPeople={setPeopleCity} onStories={setStoryCity}/>}
  {unknownCountry&&!showSearch&&<Sheet label={unknownCountry.name} onClose={()=>setUnknownCountry(null)}><div className="unknown-country"><MapPin size={27}/><h2>{unknownCountry.name}</h2><p>{t('这个国家的详细图片与介绍尚未收录。','Detailed images and information for this country are not available yet.')}</p><ErrorBox message={placeError||catalog.error}/><Button kind="secondary" onClick={()=>openSearch()}><Search size={16}/>{t('探索已收录地点','Explore available places')}</Button></div></Sheet>}
  {peopleCity&&<PeopleCards city={peopleCity} onClose={()=>setPeopleCity(null)}/>}
  {storyCity&&<div className="full-overlay"><Stories city={storyCity} onClose={()=>setStoryCity(null)}/></div>}
 </section>;
}

function CitySheet({place,favorite,busy,onFavorite,onClose,onChoose,onPeople,onStories,onSearch}:{place:Place;favorite:boolean;busy:boolean;onFavorite:()=>void;onClose:()=>void;onChoose:(place:Place)=>void;onPeople:(place:Place)=>void;onStories:(place:Place)=>void;onSearch:(country?:Place)=>void}){
 const {locale,t,setLocale}=useApp();
 const details=useLoad(()=>api<Place>(`/places/${encodeURIComponent(place.id)}`),[place.id]);
 const current=details.data||place;
 const children=useLoad(async()=>place.kind==='country'?(await api<{items:Place[]}>(`/places?kind=city&parentId=${encodeURIComponent(place.id)}`)).items:place.kind==='attraction'&&place.parentId?[await api<Place>(`/places/${place.parentId}`)]:[],[place.id]);
 const start=useRef<{x:number;y:number}|null>(null);
 return <Sheet className={place.kind==='country'?'country-details-sheet':''} label={current.name[locale]} onClose={onClose}>
  <div className={`place-details kind-${place.kind}`}>
   <div className="place-detail-toolbar"><button onClick={onClose}><ArrowLeft size={17}/>{t('返回地球','Back to globe')}</button><span><IconButton label={t('搜索地点','Search places')} onClick={()=>onSearch(place.kind==='country'?current:undefined)}><Search size={18}/></IconButton><button className="detail-language" aria-label={t('切换语言','Change language')} onClick={()=>setLocale(locale==='zh'?'en':'zh')}>{locale==='zh'?'EN':'中'}</button></span></div>
   <div onPointerDown={e=>{start.current={x:e.clientX,y:e.clientY};}} onPointerUp={e=>{if(start.current&&place.kind==='city'&&e.clientX-start.current.x>e.currentTarget.clientWidth*.25&&Math.abs(e.clientY-start.current.y)<70)onFavorite();start.current=null;}}>
    {current.image&&<div className="city-cover place-detail-cover"><Cover src={current.image} alt={current.name[locale]}/></div>}
    <div className="city-title-row"><div><span className="eyebrow">{place.kind==='country'?t('探索一个国家','EXPLORE A COUNTRY'):current.country}</span><h2>{current.name[locale]}</h2>{locale==='zh'&&current.name.en!==current.name.zh&&<span className="place-secondary-name">{current.name.en}</span>}</div>{place.kind==='city'&&<IconButton label={favorite?t('取消收藏','Unsave'):t('收藏城市','Save city')} onClick={onFavorite} disabled={busy} className={favorite?'is-saved':''}><Bookmark size={24} fill={favorite?'currentColor':'none'}/></IconButton>}</div>
    <div className="place-detail-description">{current.description[locale]?current.description[locale].split(/\n\s*\n/).map((paragraph,i)=><p key={i}>{paragraph}</p>):<p className="muted">{t('详细介绍正在整理中。','More information is being prepared.')}</p>}</div>
    <ErrorBox message={details.error} retry={details.reload}/>
    {place.kind==='city'&&<><div className="city-actions"><Button onClick={()=>onPeople(current)}><Users size={18}/>{t('找当地人','Meet the locals')}<ArrowRight size={17}/></Button><Button kind="secondary" onClick={()=>onStories(current)}>{t('城市故事','City stories')}</Button></div><p className="micro-note"><span className="red-dot"/>{t('右滑收藏，让这个地方留在你的地图上','Swipe right to keep this place on your map')}</p></>}
   </div>
   {place.kind==='country'&&<div className="section-heading country-city-heading"><h3>{t('从一座城市开始','Begin with a city')}</h3><span>{children.data?.length||0}</span></div>}
   {children.loading&&place.kind!=='city'&&<Loading/>}<ErrorBox message={children.error} retry={children.reload}/>
   <div className={place.kind==='country'?'country-city-list':''}>{children.data?.map(child=><button key={child.id} className="place-result" onClick={()=>onChoose(child)}><Cover src={child.image} alt={child.name[locale]}/><span><strong>{child.name[locale]}</strong><small>{child.description[locale].slice(0,65)}</small></span><ArrowRight size={18}/></button>)}</div>
   {place.kind==='country'&&children.data?.length===0&&!children.loading&&<Empty title={t('这里的城市尚未收录','No cities have been added here yet')} action={<Button kind="secondary" onClick={()=>onSearch()}>{t('探索其他地点','Explore other places')}</Button>}/>}
  </div>
 </Sheet>;
}

function PeopleCards({city,onClose}:{city:Place;onClose:()=>void}){
 const {t,locale,requireAuth,toast,openProfile,conversationAdded}=useApp();const [feed,setFeed]=useState<PeopleFeed|null>(null);const [index,setIndex]=useState(0);const [error,setError]=useState('');const [feedError,setFeedError]=useState('');const [loading,setLoading]=useState(true);const [busy,setBusy]=useState(false);const loadedCursor=useRef<string|null>(null);const generation=useRef(0);const [rangeOpen,setRangeOpen]=useState(false);const [cityIds,setCityIds]=useState<string[]>([city.id]);const [coverage,setCoverage]=useState<'any'|'all'>('any');
 const load=async(reset=false)=>{const requestGeneration=reset?++generation.current:generation.current;setLoading(true);setFeedError('');if(reset){setFeed(null);setIndex(0);loadedCursor.current=null;}try{const query=!reset&&feed?`?feedId=${encodeURIComponent(feed.feedId)}&cursor=${encodeURIComponent(feed.nextCursor||'')}`:`?cityIds=${encodeURIComponent(cityIds.join(','))}&coverage=${coverage}`;const result=await api<PeopleFeed>(`/cities/${city.id}/people-feed${query}`);if(requestGeneration!==generation.current)return;setFeed(prev=>!reset&&prev?{...result,items:[...prev.items,...result.items.filter(p=>!prev.items.some(q=>q.id===p.id))]}:result);if(reset)setIndex(0);}catch(e){if(requestGeneration===generation.current)setFeedError(errorMessage(e));}finally{if(requestGeneration===generation.current)setLoading(false);}};
 useEffect(()=>{void load(true);},[city.id,cityIds.join(','),coverage]);
 useEffect(()=>{if(feed&&feed.items.length-index<=3&&feed.nextCursor&&loadedCursor.current!==feed.nextCursor&&!loading){loadedCursor.current=feed.nextCursor;void load();}},[index,feed,loading]);
 useEffect(()=>()=>{generation.current++;},[]);
 const person=feed?.items[index];
 const advance=()=>setIndex(n=>n+1);
 const join=async()=>{if(!person)return false;const requestGeneration=generation.current;setBusy(true);setError('');try{await send<Conversation>('/conversations/direct',{userId:person.id,cityId:cityIds.find(id=>person.cityIds.includes(id))||city.id});conversationAdded();toast(t('已加入对话，继续认识下一位','Added to chats. Keep exploring.'));return requestGeneration===generation.current;}catch(e){if(requestGeneration===generation.current)setError(errorMessage(e));return false;}finally{setBusy(false);}};
 const resumeSwipe=useRef<()=>void>(()=>{});
 const swipe=useSwipeDeck(person?.id,()=>requireAuth(()=>resumeSwipe.current()),join,advance);resumeSwipe.current=()=>void swipe.choose(1);
 return <div className="people-overlay">
  <PageHeader title={cityIds.length>1?t(`${cityIds.length} 个城市`,`${cityIds.length} cities`):city.name[locale]} back={onClose} actions={<button className="random-label" disabled={swipe.busy} aria-label={t('相遇范围','Places')} onClick={()=>setRangeOpen(true)}><SlidersHorizontal size={20}/></button>}/>
  {loading&&!person?<Loading/>:person?<>
   <div className="people-deck" ref={swipe.root} data-phase={swipe.phase}>
    {feed?.items.slice(index+1,index+3).map((next,depth)=><article className={`person-card deck-back depth-${depth+1}`} key={next.id} aria-hidden="true"><Cover src={next.avatar} alt=""/></article>)}
    <article ref={swipe.card} className="person-card deck-front" onPointerDown={swipe.onPointerDown} onPointerMove={swipe.onPointerMove} onPointerUp={swipe.onPointerUp} onPointerCancel={swipe.onPointerCancel}>
     <div className="person-photo">
      <Cover src={person.avatar} alt={person.name}/><div className="person-photo-shade"/>
      <div className="person-photo-name"><h2>{person.name}</h2><span>{/^(demo-|load-)/.test(person.id)?t('AI 演示人物','AI demo profile'):person.providerStatus==='approved'&&<><Check size={13}/>{t('资料已审核','Profile reviewed')}</>}</span>{person.tags.length>0&&<p className="person-interests">{person.tags.slice(0,2).join(' · ')}</p>}</div>
      <button className="person-details" aria-label={t('查看主页','View profile')} disabled={swipe.busy} onClick={()=>openProfile(person.id)}><Info size={24}/></button>
      <span className="swipe-stamp yes">{t('聊一聊','LET’S TALK')}</span><span className="swipe-stamp no">{t('略过','PASS')}</span>
     </div>
    </article>
   </div>
   <ErrorBox message={error} retry={()=>void swipe.choose(1)}/><ErrorBox message={feedError} retry={()=>void load()}/>
   <div className="people-actions">
    <Button kind="secondary" aria-label={t('略过','Pass')} title={t('略过','Pass')} disabled={busy||swipe.busy} onClick={()=>void swipe.choose(-1)}><X size={26}/></Button>
    <Button aria-label={t('加入对话','Add to chats')} title={t('加入对话','Add to chats')} busy={busy||swipe.busy} onClick={()=>void swipe.choose(1)}>{!busy&&<MessageCircle size={24}/>}</Button>
   </div>
  </>:<><ErrorBox message={feedError} retry={()=>void load(!feed)}/>{!loading&&<Empty title={t(feed?.items.length?'这一轮，先到这里':'这座城市正在等待相遇',feed?.items.length?'A lovely place to pause':'Someone new is on the way')} description={t('可以重新开始，或去另一个城市看看。','Start a new round, or explore another city.')} action={<Button onClick={()=>{loadedCursor.current=null;void load(true);}}>{t('重新开始','A fresh round')}<ArrowRight size={16}/></Button>}/>}</>}
  {rangeOpen&&<PeopleRange city={city} selected={cityIds} coverage={coverage} onClose={()=>setRangeOpen(false)} onApply={(ids,mode)=>{setCityIds(ids);setCoverage(mode);setRangeOpen(false);}}/>}
 </div>;
}

function PeopleRange({city,selected,coverage,onClose,onApply}:{city:Place;selected:string[];coverage:'any'|'all';onClose:()=>void;onApply:(ids:string[],mode:'any'|'all')=>void}){
 const {t,locale}=useApp();const places=useLoad(()=>api<{items:Place[]}>('/places?kind=city'),[]);const [ids,setIds]=useState(selected);const [mode,setMode]=useState(coverage);
 return <Modal title={t('这次想去哪里','Where will this journey take you?')} onClose={onClose}><div className="form-stack"><p className="muted">{t('选定地点后，在符合服务范围的人中随机相遇。','Meet people at random within the places they can cover.')}</p><label>{t('城市','Places')}<div className="city-checkboxes">{places.data?.items.map(place=><label key={place.id}><input type="checkbox" checked={ids.includes(place.id)} disabled={place.id===city.id} onChange={e=>setIds(a=>e.target.checked?[...a,place.id]:a.filter(id=>id!==place.id))}/>{place.name[locale]}</label>)}</div></label><label>{t('寻找方式','Find people')}<select value={mode} onChange={e=>setMode(e.target.value as 'any'|'all')}><option value="any">{t('分别找人：任一城市提供服务','Separate locals: covers any selected city')}</option><option value="all">{t('一人全程：覆盖全部城市','One person: covers every selected city')}</option></select></label><ErrorBox message={places.error}/><Button onClick={()=>onApply(Array.from(new Set([city.id,...ids])),mode)}>{t('开始新一轮相遇','Start a fresh round')}<ArrowRight size={16}/></Button></div></Modal>;
}
