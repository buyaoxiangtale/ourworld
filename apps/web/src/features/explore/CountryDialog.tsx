import {ArrowRight} from 'lucide-react';
import type {Place} from '@ourworld/contracts';
import {api} from '../../api';
import {useApp} from '../../context';
import {useLoad} from '../../hooks';
import {Button,Cover,ErrorBox,Modal} from '../../ui';

export function CountryDialog({country,onClose,onBrowse}:{country:Place;onClose:()=>void;onBrowse:(country:Place)=>void}){
 const {locale,t}=useApp();
 const details=useLoad(()=>api<Place>(`/places/${encodeURIComponent(country.id)}`),[country.id]);
 const current=details.data||country;
 return <Modal title={current.name[locale]} className="country-info-modal" onClose={onClose} footer={<Button onClick={()=>onBrowse(current)}>{t('浏览城市','Browse cities')}<ArrowRight size={19}/></Button>}>
  {current.image&&<div className="country-dialog-cover"><Cover src={current.image} alt={current.name[locale]}/></div>}
  <div className="place-detail-description country-dialog-description">{current.description[locale]?current.description[locale].split(/\n\s*\n/).map((paragraph,index)=><p key={index}>{paragraph}</p>):<p>{t('详细介绍正在整理中。','More information is being prepared.')}</p>}</div>
  <ErrorBox message={details.error} retry={details.reload}/>
 </Modal>;
}
