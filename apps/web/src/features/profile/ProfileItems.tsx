import {useId,useState} from 'react';
import {createPortal} from 'react-dom';
import {ArrowLeft,Check,MapPin,Search,X} from 'lucide-react';
import {EDUCATION_LEVELS,type EducationLevel,type Place,type User} from '@ourworld/contracts';
import {api,getSession,send,setSession} from '../../api';
import {useApp} from '../../context';
import {errorMessage,useLoad} from '../../hooks';
import {useDialogFocus} from '../../useDialogFocus';
import {Button,Empty,ErrorBox,IconButton,Loading,Modal} from '../../ui';

const educationLabels:Record<EducationLevel,[string,string]>={
 'high-school':['高中','High school'],vocational:['中专 / 职业教育','Vocational education'],associate:['大专','Associate degree'],bachelor:['本科','Bachelor’s degree'],master:['硕士','Master’s degree'],doctorate:['博士','Doctorate'],other:['其他','Other'],
};
export const educationText=(user:User,locale:'zh'|'en')=>[user.school,user.educationLevel&&educationLabels[user.educationLevel]?.[locale==='zh'?0:1]].filter(Boolean).join(' · ');

export function EducationDialog({onClose,onDone,initialUser}:{onClose:()=>void;onDone:()=>void;initialUser?:User}){
 const {t,user,refreshUser,toast}=useApp();const fieldId=useId();const initial=initialUser||user;const [school,setSchool]=useState(initial?.school||'');const [level,setLevel]=useState<EducationLevel|''>(initial?.educationLevel||'');const [busy,setBusy]=useState(false);const [error,setError]=useState('');
 return <Modal title={t('学校与学历','School & education')} onClose={()=>{if(!busy)onClose();}}><form className="form-stack" onSubmit={async event=>{
  event.preventDefault();setBusy(true);setError('');
  try{const updated=await send<User>('/me',{school:school.trim()||null,educationLevel:level||null},'PATCH');setSession({...getSession()!,user:updated});await refreshUser();toast(t('学校与学历已更新','Education updated'));onDone();}catch(error){setError(errorMessage(error));}finally{setBusy(false);}
 }}><div className="profile-item-field"><label htmlFor={`${fieldId}-school`}>{t('学校','School')}</label><input id={`${fieldId}-school`} name="school" value={school} maxLength={120} onChange={event=>setSchool(event.target.value)} placeholder={t('填写你的学校名称','Your school or university')} disabled={busy}/></div><div className="profile-item-field"><label htmlFor={`${fieldId}-level`}>{t('学历','Education level')}</label><select id={`${fieldId}-level`} value={level} onChange={event=>setLevel(event.target.value as EducationLevel|'')} disabled={busy}><option value="">{t('暂不填写','Prefer not to say')}</option>{EDUCATION_LEVELS.map(value=><option key={value} value={value}>{t(...educationLabels[value])}</option>)}</select></div><ErrorBox message={error}/><Button type="submit" busy={busy}>{t('保存','Save')}</Button></form></Modal>;
}


type CataloguePage={items:Place[];nextOffset?:number|null};
export async function loadPlaceCatalogue(kind:'city'|'country'){
 const places:Place[]=[];let offset=0;
 while(true){
  const page=await api<CataloguePage>(`/places?kind=${kind}&limit=250&offset=${offset}`);places.push(...page.items);
  if(page.nextOffset==null)break;
  if(!Number.isInteger(page.nextOffset)||page.nextOffset<=offset)throw new Error('Invalid catalogue pagination');
  offset=page.nextOffset;
 }
 return [...new Map(places.filter(place=>place.kind===kind).map(place=>[place.id,place])).values()];
}
const normalize=(value:string)=>value.normalize('NFKD').replace(/\p{Diacritic}/gu,'').toLocaleLowerCase().trim();

export function ServiceCitiesPage({onClose,onDone,initialUser}:{onClose:()=>void;onDone:()=>void;initialUser?:User}){
 const {t,user,refreshUser,toast}=useApp();
 return <ServiceCityPicker initialCityIds={(initialUser||user)?.cityIds||[]} onClose={onClose} onConfirm={async cityIds=>{const updated=await send<User>('/me',{cityIds},'PATCH');setSession({...getSession()!,user:updated});await refreshUser();toast(t('服务城市已更新','Service cities updated'));onDone();}}/>;
}

export function ServiceCityPicker({initialCityIds,onClose,onConfirm,minSelection=0,description,confirmText}:{initialCityIds:string[];onClose:()=>void;onConfirm:(cityIds:string[])=>void|Promise<void>;minSelection?:number;description?:string;confirmText?:(count:number)=>string}){
 const {t,locale}=useApp();
 const [query,setQuery]=useState('');const [selected,setSelected]=useState(()=>new Set(initialCityIds));const [busy,setBusy]=useState(false);const [error,setError]=useState('');
 const close=()=>{if(!busy)onClose();};const focus=useDialogFocus(close);
 const catalogue=useLoad(async()=>{const [cities,countries]=await Promise.all([loadPlaceCatalogue('city'),loadPlaceCatalogue('country')]);return {cities,countries};},[]);
 const cities=catalogue.data?.cities||[];const countries=new Map((catalogue.data?.countries||[]).map(country=>[country.country,country.name[locale]]));const byId=new Map(cities.map(city=>[city.id,city]));
 const words=normalize(query).split(/\s+/).filter(Boolean);
 const filtered=cities.filter(city=>{const text=normalize([city.name.zh,city.name.en,city.country,countries.get(city.country),...(city.aliases||[])].filter(Boolean).join(' '));return words.every(word=>text.includes(word));}).sort((a,b)=>a.name[locale].localeCompare(b.name[locale],locale));
 const toggle=(id:string)=>setSelected(previous=>{const next=new Set(previous);if(next.has(id))next.delete(id);else if(next.size<50)next.add(id);return next;});
 const save=async()=>{if(selected.size<minSelection||busy)return;setBusy(true);setError('');try{await onConfirm([...selected]);}catch(error){setError(errorMessage(error));}finally{setBusy(false);}};
 return createPortal(<section ref={focus} className="service-cities-page" role="dialog" aria-modal="true" aria-label={t('服务城市','Service cities')}>
  <header className="service-cities-header"><IconButton label={t('返回','Back')} disabled={busy} onClick={close}><ArrowLeft size={22}/></IconButton><div><h2>{t('服务城市','Service cities')}</h2><span>{description||t('选择你熟悉、可以提供服务的城市','Choose the cities where you offer your services')}</span></div></header>
  <div className="service-cities-search"><Search size={19}/><input type="search" aria-label={t('搜索已收录的城市','Search the city catalogue')} placeholder={t('搜索城市、国家或地区','Search cities or countries')} value={query} disabled={busy} onChange={event=>setQuery(event.target.value)}/>{query&&<IconButton label={t('清空搜索','Clear search')} disabled={busy} onClick={()=>setQuery('')}><X size={17}/></IconButton>}</div>
  {selected.size>0&&<div className="service-cities-selected" aria-label={t('已选城市','Selected cities')}>{[...selected].map(id=><button type="button" key={id} disabled={busy} onClick={()=>toggle(id)} aria-label={t('移除城市','Remove city')+' '+(byId.get(id)?.name[locale]||id)}>{byId.get(id)?.name[locale]||t('已选城市','Selected city')}<X size={13}/></button>)}</div>}
  <div className="service-cities-count"><span>{query?t(`找到 ${filtered.length} 座城市`,`${filtered.length} cities found`):t(`全部 ${cities.length} 座城市`,`${cities.length} cities in the catalogue`)}</span><span>{t(`已选 ${selected.size} / 50`,`${selected.size} / 50 selected`)}</span></div>
  <ErrorBox message={catalogue.error||error} retry={catalogue.error?catalogue.reload:undefined}/>
  <div className="service-cities-list" tabIndex={0}>{catalogue.loading?<Loading/>:!catalogue.error&&(filtered.length?filtered.map(city=><button type="button" key={city.id} className="service-city-row" role="checkbox" aria-checked={selected.has(city.id)} aria-label={`${city.name[locale]} · ${countries.get(city.country)||city.country}`} disabled={busy||!selected.has(city.id)&&selected.size>=50} onClick={()=>toggle(city.id)}><span className="service-city-mark"><MapPin size={19}/></span><span className="service-city-copy"><strong>{city.name[locale]}</strong><small>{locale==='zh'?city.name.en+' · ':''}{countries.get(city.country)||city.country}</small></span><span className={`service-city-check ${selected.has(city.id)?'is-selected':''}`}>{selected.has(city.id)&&<Check size={16}/>}</span></button>):<Empty title={t('未找到城市','No cities found')} description={t('试试城市的中文名、英文名或国家名称。','Try a city name, alias or country.')}/>)}</div>
  <footer className="service-cities-footer"><Button busy={busy} disabled={catalogue.loading||!!catalogue.error||selected.size<minSelection} onClick={()=>void save()}>{confirmText?confirmText(selected.size):t(`保存所选城市（${selected.size}）`,`Save selected cities (${selected.size})`)}</Button></footer>
 </section>,document.body);
}
