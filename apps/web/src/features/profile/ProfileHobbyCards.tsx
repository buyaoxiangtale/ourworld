import {Heart,Pencil,Plus} from 'lucide-react';
import {useApp} from '../../context';
import {groupSelectedHobbies} from './profile-hobbies';

export function ProfileHobbyCards({tags,onEdit}:{tags:string[];onEdit?:()=>void}){
 const {t,locale}=useApp();
 const groups=groupSelectedHobbies(tags);
 return <div className="profile-hobby-cards" role="group" aria-label={t('爱好分类卡片','Hobby category cards')}>
  {groups.map(group=>{
   const content=<><span className="profile-hobby-card-category"><Heart size={20}/><span>{group[locale]}</span></span><strong className="profile-hobby-card-title">{t('当前爱好','Current favourites')}</strong><span className="profile-hobby-card-names">{group.items.map(({value,hobby})=>hobby?.[locale]||value).join(locale==='zh'?'、':', ')}</span><span className="profile-hobby-card-emojis" aria-hidden="true">{group.items.slice(0,3).map(({value,hobby})=><span key={value}>{hobby?.emoji||'✨'}</span>)}</span>{onEdit&&<span className="profile-hobby-card-edit owner-card-add"><Pencil size={16}/></span>}</>;
   return onEdit?<button type="button" className="profile-hobby-card owner-interest-card" key={group.id} data-hobby-category={group.id} onClick={onEdit} aria-label={`${t('编辑爱好','Edit hobbies')} · ${group[locale]}`}>{content}</button>:<article className="profile-hobby-card" key={group.id} data-hobby-category={group.id} aria-label={group[locale]}>{content}</article>;
  })}
  {onEdit&&<button type="button" className="profile-hobby-card owner-content-card owner-interest-card owner-hobby-add" onClick={onEdit} aria-label={t('新增爱好','Add hobbies')}><span className="owner-card-add"><Plus size={21}/></span><Heart size={28} className="owner-card-symbol"/><strong className="profile-hobby-card-title">{t('新增爱好','Add hobbies')}</strong><span className="profile-hobby-card-names">{t('选择爱好，找到你的同好','Find people who share your interests')}</span></button>}
 </div>;
}
