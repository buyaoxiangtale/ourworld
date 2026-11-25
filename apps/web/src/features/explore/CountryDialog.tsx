import {ArrowRight,Search} from 'lucide-react';
import type {Place} from '@ourworld/contracts';
import {api} from '../../api';
import {useApp} from '../../context';
import {useLoad} from '../../hooks';
import {Button,Cover,ErrorBox,Modal} from '../../ui';

export function CountryDialog({country,onClose,onBrowse,onSearch}:{country:Place;onClose:()=>void;onBrowse:(country:Place)=>void;onSearch:(country:Place)=>void}){
 const {locale,t,setLocale}=useApp();
 const details=useLoad(()=>api<Place>(`/places/${encodeURIComponent(country.id)}`),[country.id]);
 const current=details.data||country;
 return <Modal title={current.name[locale]} className="country-info-modal" onClose={onClose} footer={<><Button kind="secondary" onClick={()=>onSearch(current)}><Search size={16}/>{t('搜索该国城市','Search cities in this country')}</Button><Button onClick={()=>onBrowse(current)}>{t('浏览城市','Browse cities')}<ArrowRight size={19}/></Button></>}>
  <div className="country-dialog-meta"><span>{locale==='zh'?current.name.en:current.name.zh}</span><button className="detail-language" aria-label={t('切换语言','Change language')} onClick={()=>setLocale(locale==='zh'?'en':'zh')}>{locale==='zh'?'EN':'中'}</button></div>
  {current.image&&<div className="country-dialog-cover"><Cover src={current.image} alt={current.name[locale]}/></div>}
  <div className="place-detail-description country-dialog-description">{current.description[locale]?current.description[locale].split(/\n\s*\n/).map((paragraph,index)=><p key={index}>{paragraph}</p>):<p>{t('详细介绍正在整理中。','More information is being prepared.')}</p>}</div>
  <ErrorBox message={details.error} retry={details.reload}/>
 </Modal>;
}
