import {Heart,Pencil,Plus} from 'lucide-react';
import type {ProfileLayout} from '@ourworld/contracts';
import {API_BASE} from '../../api';
import {useApp} from '../../context';
import {groupSelectedHobbies,hobbyKey,readHobbyPhotos} from './profile-hobbies';

export function ProfileHobbyCards({tags,layout,onEdit}:{tags:string[];layout?:ProfileLayout|null;onEdit?:()=>void}){
 const {t,locale}=useApp();
 const groups=groupSelectedHobbies(tags);
 const savedPhotos=readHobbyPhotos(layout);
 return <div className="profile-hobby-cards" role="group" tabIndex={0} aria-label={t('爱好分类卡片','Hobby category cards')}>
  {groups.map(group=>{
   const photos=group.items.flatMap(({value,hobby})=>{
    const id=savedPhotos.get(hobbyKey(value));
    return id?[{id,key:value,label:hobby?.[locale]||value}]:[];
   });
   const content=<>
    <span className="profile-hobby-card-category"><Heart size={20}/><span>{group[locale]}</span></span>
    <strong className="profile-hobby-card-title">{t('当前爱好','Current favourites')}</strong>
    <span className="profile-hobby-card-names">{group.items.map(({value,hobby})=>hobby?.[locale]||value).join(locale==='zh'?'、':', ')}</span>
    {photos.length>0
     ? <span className="profile-hobby-card-photos" style={{gridTemplateColumns:`repeat(${Math.min(photos.length,5)},minmax(0,1fr))`}}>
       {photos.map(({id,key,label})=><img key={key} src={`${API_BASE}/media/${encodeURIComponent(id)}`} alt={label} loading="lazy"/>)}
      </span>
     : <span className="profile-hobby-card-emojis" aria-hidden="true">{group.items.slice(0,3).map(({value,hobby})=><span key={value}>{hobby?.emoji||'✨'}</span>)}</span>}
    {onEdit&&<span className="profile-hobby-card-edit owner-card-add"><Pencil size={16}/></span>}
   </>;
   return onEdit?<button type="button" className="profile-hobby-card owner-interest-card" key={group.id} data-hobby-category={group.id} onClick={onEdit} aria-label={`${t('编辑爱好','Edit hobbies')} · ${group[locale]}`}>{content}</button>:<article className="profile-hobby-card" key={group.id} data-hobby-category={group.id} aria-label={group[locale]}>{content}</article>;
  })}
  {onEdit&&<button type="button" className="profile-hobby-card owner-content-card owner-interest-card owner-hobby-add" onClick={onEdit} aria-label={t('新增爱好','Add hobbies')}><span className="owner-card-add"><Plus size={21}/></span><Heart size={28} className="owner-card-symbol"/><strong className="profile-hobby-card-title">{t('新增爱好','Add hobbies')}</strong><span className="profile-hobby-card-names">{t('选择爱好，找到你的同好','Find people who share your interests')}</span></button>}
 </div>;
}
