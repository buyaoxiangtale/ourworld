import {useState} from 'react';
import {ArrowLeft,Check,Languages,Search,X} from 'lucide-react';
import type {User} from '@ourworld/contracts';
import {getSession,send,setSession} from '../../api';
import {errorMessage} from '../../hooks';
import {useDialogFocus} from '../../useDialogFocus';
import {Button,Empty,ErrorBox,IconButton} from '../../ui';
import {useApp} from '../../context';

const languages=[
 {value:'中文 Chinese',zh:'中文（普通话）',en:'Mandarin Chinese',aliases:['中文','Chinese','Mandarin','普通话','普通話','中文（普通话）']},
 {value:'粤语 Cantonese',zh:'粤语',en:'Cantonese',aliases:['粤语','粵語','Cantonese','广东话']},
 {value:'English',zh:'英语',en:'English',aliases:['英语','英語','英语 English']},
 {value:'日本語',zh:'日语',en:'Japanese',aliases:['Japanese','日语','日語','日本語 Japanese']},
 {value:'한국어',zh:'韩语',en:'Korean',aliases:['Korean','韩语','韓語']},
 {value:'Français',zh:'法语',en:'French',aliases:['French','法语','French Français']},
 {value:'Deutsch',zh:'德语',en:'German',aliases:['German','德语']},
 {value:'Español',zh:'西班牙语',en:'Spanish',aliases:['Spanish','西班牙语']},
 {value:'Português',zh:'葡萄牙语',en:'Portuguese',aliases:['Portuguese','葡萄牙语']},
 {value:'Русский',zh:'俄语',en:'Russian',aliases:['Russian','俄语']},
 {value:'Italiano',zh:'意大利语',en:'Italian',aliases:['Italian','意大利语']},
 {value:'العربية',zh:'阿拉伯语',en:'Arabic',aliases:['Arabic','阿拉伯语']},
 {value:'हिन्दी',zh:'印地语',en:'Hindi',aliases:['Hindi','印地语']},
 {value:'ไทย',zh:'泰语',en:'Thai',aliases:['Thai','泰语']},
 {value:'Tiếng Việt',zh:'越南语',en:'Vietnamese',aliases:['Vietnamese','越南语']},
 {value:'Bahasa Indonesia',zh:'印度尼西亚语',en:'Indonesian',aliases:['Indonesian','印尼语','印度尼西亚语']},
 {value:'Bahasa Melayu',zh:'马来语',en:'Malay',aliases:['Malay','马来语']},
 {value:'Nederlands',zh:'荷兰语',en:'Dutch',aliases:['Dutch','荷兰语']},
 {value:'Türkçe',zh:'土耳其语',en:'Turkish',aliases:['Turkish','土耳其语']},
 {value:'Filipino',zh:'菲律宾语',en:'Filipino',aliases:['Tagalog','菲律宾语']},
];
const normalize=(value:string)=>value.normalize('NFKD').replace(/\p{Diacritic}/gu,'').trim().toLocaleLowerCase();
const canonical=(value:string)=>languages.find(language=>[language.value,language.zh,language.en,...language.aliases].some(alias=>normalize(alias)===normalize(value)))?.value||value.trim();
export const selectedServiceLanguages=(values:string[])=>[...new Set(values.map(canonical).filter(Boolean))];

export const serviceLanguagesText=(values:string[],locale:'zh'|'en')=>selectedServiceLanguages(values).map(value=>languages.find(language=>language.value===value)?.[locale]||value).join(' / ');

export function ServiceLanguagesPage({initialUser,onClose,onDone}:{initialUser?:User;onClose:()=>void;onDone:()=>void}){
 const {t,locale,user,toast,refreshUser}=useApp();const initial=initialUser||user;
 const [selected,setSelected]=useState(()=>selectedServiceLanguages(initial?.languages||[]));
 const [options]=useState(()=>[...languages,...selected.filter(value=>!languages.some(language=>language.value===value)).map(value=>({value,zh:value,en:value,aliases:[]}))]);
 const [search,setSearch]=useState('');const [busy,setBusy]=useState(false);const [error,setError]=useState('');
 const close=()=>{if(!busy)onClose();};const focus=useDialogFocus(close);
 const terms=normalize(search).split(/\s+/).filter(Boolean);
 const filtered=options.filter(language=>{const text=normalize([language.zh,language.en,language.value,...language.aliases].join(' '));return terms.every(term=>text.includes(term));});
 const toggle=(value:string)=>setSelected(items=>items.includes(value)?items.filter(item=>item!==value):items.length<12?[...items,value]:items);
 const save=async()=>{
  setBusy(true);setError('');
  try{const updated=await send<User>('/me',{languages:selected},'PATCH');setSession({...getSession()!,user:updated});await refreshUser();toast(t('服务语言已更新','Service languages updated'));onDone();}catch(error){setError(errorMessage(error));}finally{setBusy(false);}
 };
 return <section ref={focus} className="service-cities-page service-languages-page" role="dialog" aria-modal="true" aria-label={t('服务语言','Service languages')}>
  <header className="service-cities-header"><IconButton label={t('返回','Back')} disabled={busy} onClick={close}><ArrowLeft size={22}/></IconButton><div><h2>{t('服务语言','Service languages')}</h2><span>{t('选择你可以提供服务的语言，最多 12 种','Choose up to 12 languages for your services')}</span></div></header>
  <div className="service-cities-search"><Search size={19}/><input type="search" aria-label={t('搜索服务语言','Search service languages')} placeholder={t('搜索语言、英文名或别名','Search languages or aliases')} value={search} disabled={busy} onChange={event=>setSearch(event.target.value)}/>{search&&<IconButton label={t('清空搜索','Clear search')} disabled={busy} onClick={()=>setSearch('')}><X size={17}/></IconButton>}</div>
  {selected.length>0&&<div className="service-cities-selected" aria-label={t('已选语言','Selected languages')}>{selected.map(value=>{const label=options.find(language=>language.value===value)?.[locale]||value;return <button type="button" key={value} disabled={busy} onClick={()=>toggle(value)} aria-label={t('移除语言','Remove language')+' '+label}>{label}<X size={13}/></button>;})}</div>}
  <div className="service-cities-count"><span>{search?t(`找到 ${filtered.length} 种语言`,`${filtered.length} languages found`):t(`全部 ${options.length} 种语言`,`${options.length} languages`)}</span><span aria-live="polite">{t(`已选 ${selected.length} / 12`,`${selected.length} / 12 selected`)}</span></div>
  <ErrorBox message={error}/>
  <div className="service-cities-list" tabIndex={0}>{filtered.length?filtered.map(language=>{const checked=selected.includes(language.value);return <button type="button" className="service-city-row" role="checkbox" key={language.value} aria-label={language[locale]} aria-checked={checked} disabled={busy||!checked&&selected.length>=12} onClick={()=>toggle(language.value)}><span className="service-city-mark"><Languages size={19}/></span><span className="service-city-copy"><strong>{language[locale]}</strong><small>{locale==='zh'?language.en:language.value}</small></span><span className={`service-city-check ${checked?'is-selected':''}`}>{checked&&<Check size={16}/>}</span></button>;}):<Empty title={t('未找到语言','No languages found')} description={t('试试语言的中文名、英文名或别名。','Try a language name or alias.')}/>}</div>
  <footer className="service-cities-footer"><Button busy={busy} onClick={()=>void save()}>{t(`保存所选语言（${selected.length}）`,`Save selected languages (${selected.length})`)}</Button></footer>
 </section>;
}
