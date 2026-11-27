import {useState,type KeyboardEvent} from 'react';
import {Heart,Pencil,Plus} from 'lucide-react';
import type {ProfileLayout} from '@ourworld/contracts';
import {API_BASE} from '../../api';
import {useApp} from '../../context';
import {groupSelectedHobbies,hobbyKey,readHobbyDetails} from './profile-hobbies';

type HobbyPhoto={id:string;label:string};

function scrollBySlide(event:KeyboardEvent<HTMLDivElement>,axis:'x'|'y'){
 if(event.target!==event.currentTarget)return;
 const keys=axis==='x'?['ArrowLeft','ArrowRight']:['ArrowUp','ArrowDown'];
 const direction=keys.indexOf(event.key);
 if(direction<0)return;
 const track=event.currentTarget;
 event.preventDefault();
 const nextCard=track.children[1] as HTMLElement|undefined;
 const stride=axis==='x'?(nextCard?.offsetLeft??track.clientWidth):track.clientHeight;
 const distance=(direction===0?-1:1)*stride;
 const behavior=matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth';
 track.scrollBy(axis==='x'?{left:distance,behavior}:{top:distance,behavior});
}

function HobbyGallery({photos,label}:{photos:HobbyPhoto[];label:string}){
 const {t}=useApp();
 const [active,setActive]=useState(0);
 const multiple=photos.length>1;
 return <div className="profile-hobby-media">
  <div className="profile-hobby-card-photos" data-multiple={multiple} tabIndex={multiple?0:undefined}
   role={multiple?'group':undefined} aria-label={multiple?label:undefined}
   onKeyDown={event=>scrollBySlide(event,'y')}
   onScroll={event=>{
    const track=event.currentTarget;
    setActive(Math.min(photos.length-1,Math.round(track.scrollTop/track.clientHeight)));
   }}>
   {photos.map(({id,label})=><img key={id} src={`${API_BASE}/media/${encodeURIComponent(id)}`} alt={label} loading="lazy" draggable={false}/>)}
  </div>
  {multiple&&<div className="profile-hobby-photo-position" data-dense={photos.length>12} role="status" aria-label={t(`第 ${active+1} 张，共 ${photos.length} 张`,`Photo ${active+1} of ${photos.length}`)}>
   {photos.map(({id},index)=><span key={id} aria-hidden="true" data-active={index===active}/>)}
  </div>}
 </div>;
}

export function ProfileHobbyCards({tags,layout,onEdit,headingId}:{tags:string[];layout?:ProfileLayout|null;onEdit?:()=>void;headingId?:string}){
 const {t,locale}=useApp();
 const groups=groupSelectedHobbies(tags);
 const {photos:savedPhotos,intros}=readHobbyDetails(layout);
 const editButton=onEdit&&<button type="button" className="profile-hobby-card-edit owner-interest-card" onClick={onEdit} aria-label={t('编辑爱好','Edit hobbies')}><Pencil size={17}/></button>;
 return <>
  {headingId&&<div className="owner-section-heading profile-hobby-heading"><h2 id={headingId}>{t('我的爱好','My hobbies')}</h2>{groups.length>0&&editButton}</div>}
  {!headingId&&groups.length>0&&editButton}
  {groups.length>0&&<div className="profile-hobby-cards" role="group" tabIndex={groups.length>1?0:undefined}
   aria-label={t('爱好分类卡片','Hobby category cards')} onKeyDown={event=>scrollBySlide(event,'x')}>
   {groups.map(group=>{
    const photos=[...new Map(group.items.flatMap(({value,hobby})=>
     (savedPhotos.get(hobbyKey(value))??[]).map(id=>[id,{id,label:hobby?.[locale]||value}] as const)
    )).values()];
    const intro=intros.get(group.id);
    return <article className="profile-hobby-card" key={group.id} data-hobby-category={group.id} aria-label={group[locale]}>
     {photos.length>0?<HobbyGallery key={photos.map(photo=>photo.id).join(',')} photos={photos} label={t(`${group[locale]}图片，上下滑动切换`,`${group[locale]} photos, swipe vertically to browse`)}/>
      :<div className="profile-hobby-media profile-hobby-card-emojis" aria-hidden="true">{group.items.slice(0,3).map(({value,hobby})=><span key={value}>{hobby?.emoji||'✨'}</span>)}</div>}
     <div className="profile-hobby-card-copy">
      <ul className="profile-hobby-card-tags">{group.items.map(({value,hobby})=><li key={value}>{hobby?.[locale]||value}</li>)}</ul>
      {intro&&<p className="profile-hobby-card-intro">{intro}</p>}
     </div>
    </article>;
   })}
  </div>}
  {onEdit&&<button type="button" className={groups.length?'profile-hobby-add owner-hobby-add':'profile-empty-action profile-hobby-empty owner-hobby-add owner-interest-card'} onClick={onEdit}>
   {groups.length?<Plus size={16} aria-hidden="true"/>:<Heart size={24} aria-hidden="true"/>} {t('新增爱好','Add hobbies')}
  </button>}
 </>;
}
