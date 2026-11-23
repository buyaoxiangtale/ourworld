import {useEffect,useId,useRef,useState} from 'react';
import {Check,ChevronDown,ImagePlus,Search,X} from 'lucide-react';
import type {ProfileDraft,ProfileLayout,User} from '@ourworld/contracts';
import {API_BASE,api,getSession,send,setSession,upload} from '../../api';
import {useApp} from '../../context';
import {errorMessage} from '../../hooks';
import {ProfileCardSheet} from './ProfileCardSheet';
import {findHobby,hobbyKey,hobbyLabel,HOBBY_GROUPS,HOBBY_LIMIT,normalizeHobby,readHobbyPhotos,updateHobbyPhotos} from './profile-hobbies';
import { EarthSpinner,Empty,ErrorBox,IconButton} from '../../ui';

export function InterestsDialog({onClose,onDone,initialUser,layout}:{onClose:()=>void;onDone:()=>void;initialUser?:User;layout?:ProfileLayout|null}){
 const {t,locale,user,refreshUser,toast}=useApp();const id=useId();
 const [initial]=useState(()=>[...new Map(((initialUser||user)?.tags||[]).map(value=>[findHobby(value)?.id||normalizeHobby(value),value])).values()]);
 const [selected,setSelected]=useState(initial);const [query,setQuery]=useState('');const [expanded,setExpanded]=useState<string[]>([]);const [busy,setBusy]=useState(false);const [error,setError]=useState('');
 const [originalPhotos]=useState(()=>readHobbyPhotos(layout));
 const [photoChanges,setPhotoChanges]=useState<ReadonlyMap<string,string|null>>(new Map());
 const [photoHobby,setPhotoHobby]=useState('');
 const [uploading,setUploading]=useState(false);
 const photoInput=useRef<HTMLInputElement>(null);
 const currentHobby=selected.includes(photoHobby)?photoHobby:selected[0];
 const currentPhotoKey=currentHobby?hobbyKey(currentHobby):'';
 const currentPhoto=photoChanges.has(currentPhotoKey)?photoChanges.get(currentPhotoKey):originalPhotos.get(currentPhotoKey);
 const waiting=busy||uploading;
 const [groups]=useState(()=>{
  const known=HOBBY_GROUPS.map(group=>({...group,items:group.items.map(item=>({...item,value:initial.find(value=>findHobby(value)?.id===item.id)||item.zh}))}));
  const legacy=initial.filter(value=>!findHobby(value)).map((value,index)=>({id:`legacy-${index}`,emoji:'✨',zh:value,en:value,aliases:[],value}));
  return legacy.length?[{id:'existing',zh:'已有爱好',en:'Your existing hobbies',preview:legacy.length,items:legacy},...known]:known;
 });
 const scroll=useRef<HTMLDivElement>(null);useEffect(()=>{scroll.current?.scrollTo({top:0});},[query]);
 const close=()=>{if(!waiting)onClose();};const terms=normalizeHobby(query).split(' ').filter(Boolean);
 const filtered=groups.map(group=>({...group,items:group.items.filter(item=>{const text=normalizeHobby([item.zh,item.en,item.value,item.emoji,...item.aliases,group.zh,group.en].join(' '));return terms.every(term=>text.includes(term));})})).filter(group=>group.items.length);
 const toggle=(value:string)=>{
  if(selected.includes(value))setSelected(items=>items.filter(item=>item!==value));
  else if(selected.length<HOBBY_LIMIT){
   setSelected(items=>[...items,value]);
   setPhotoHobby(value);
  }
 };
 const setPhoto=(key:string,mediaId:string|null)=>setPhotoChanges(changes=>new Map(changes).set(key,mediaId));
 const uploadPhoto=async(file:File)=>{
  if(!currentPhotoKey||waiting)return;
  setUploading(true);setError('');
  try{const media=await upload(file);setPhoto(currentPhotoKey,media.id);}
  catch(error){setError(errorMessage(error));}finally{setUploading(false);}
 };
 const save=async()=>{
  if(waiting||selected.length>HOBBY_LIMIT)return;setBusy(true);setError('');
  try{
   const updated=await send<User>('/me',{tags:selected},'PATCH');
   setSession({...getSession()!,user:updated});
   const selectedKeys=new Set(selected.map(hobbyKey));
   const changes=new Map([...photoChanges].filter(([key])=>selectedKeys.has(key)));
   if(changes.size){
    const draft=await api<ProfileDraft>('/profile/draft');
    const saved=await send<ProfileDraft>('/profile/draft',{
     revision:draft.revision,layout:updateHobbyPhotos(draft.layout,selected,changes)
    },'PUT');
    await send('/profile/publish',{revision:saved.revision});
   }
   await refreshUser();toast(t('爱好已更新','Hobbies updated'));onDone();
  }catch(error){setError(errorMessage(error));}finally{setBusy(false);}
 };
 return <ProfileCardSheet title={t('我的爱好','My hobbies')} className="profile-hobbies-sheet" busy={waiting} onClose={onClose}>
  <header className="profile-hobbies-header"><div className="profile-hobbies-controls"><IconButton label={t('取消','Cancel')} disabled={waiting} onClick={close}><X size={25}/></IconButton><IconButton label={t('保存爱好','Save hobbies')} className="profile-hobbies-save" disabled={waiting||selected.length>HOBBY_LIMIT} onClick={()=>void save()}>{busy?<EarthSpinner small/>:<Check size={26}/>}</IconButton></div><div className="profile-hobbies-title"><h2>{t('我的爱好','My hobbies')}</h2><span aria-live="polite" aria-label={t('已选爱好数量','Selected hobby count')}>{selected.length}/{HOBBY_LIMIT}</span></div><p>{t('添加最多十项爱好，发现与你志趣相投的旅人。','Choose up to ten hobbies to find travellers who share your interests.')}</p><div className="profile-hobbies-search"><Search size={21}/><input type="search" aria-label={t('搜索爱好','Search hobbies')} placeholder={t('搜索爱好','Search hobbies')} value={query} disabled={busy} onChange={event=>setQuery(event.target.value)}/>{query&&<IconButton label={t('清空搜索','Clear search')} disabled={busy} onClick={()=>setQuery('')}><X size={17}/></IconButton>}</div></header>
  <div ref={scroll} className="profile-hobbies-scroll"><ErrorBox message={error||(selected.length>HOBBY_LIMIT?t('已选爱好超过 10 项，请取消部分选择后保存。','More than 10 hobbies are selected. Remove a few before saving.'):'')}/>
   {currentHobby&&<div className="profile-hobby-image-editor">
    <label htmlFor={`${id}-image-hobby`}>{t('爱好图片','Hobby photo')}</label>
    <select id={`${id}-image-hobby`} value={currentHobby} disabled={waiting}
     onChange={event=>setPhotoHobby(event.target.value)}>
     {selected.map(value=><option value={value} key={value}>{hobbyLabel(value,locale)}</option>)}
    </select>
    <div className="profile-hobby-image-actions">
     {currentPhoto&&<img src={`${API_BASE}/media/${encodeURIComponent(currentPhoto)}`} alt="" />}
     <button type="button" disabled={waiting} onClick={()=>photoInput.current?.click()}>
      {uploading?<EarthSpinner small/>:<ImagePlus size={17} aria-hidden="true" />}
      {uploading?t('正在上传…','Uploading…'):currentPhoto?t('更换图片','Replace photo'):t('上传图片','Upload photo')}
     </button>
     {currentPhoto&&<button type="button" disabled={waiting}
      onClick={()=>setPhoto(currentPhotoKey,null)}>{t('移除图片','Remove photo')}</button>}
    </div>
    <input ref={photoInput} type="file" accept="image/*" hidden disabled={waiting}
     onChange={event=>{
      const file=event.target.files?.[0];
      event.target.value='';
      if(file)void uploadPhoto(file);
     }}/>
   </div>}
   {filtered.length?filtered.map(group=>{
   const isExpanded=expanded.includes(group.id),all=!!query.trim()||isExpanded;
   const visible=all?group.items:group.items.filter((item,index)=>index<group.preview||selected.includes(item.value));
   return <section className="profile-hobby-category" key={group.id} aria-labelledby={`${id}-${group.id}`}><h3 id={`${id}-${group.id}`}>{group[locale]}</h3><div id={`${id}-${group.id}-options`} className="profile-hobby-pills">{visible.map(item=>{const checked=selected.includes(item.value);return <button type="button" role="checkbox" aria-label={item[locale]} aria-checked={checked} key={item.id} disabled={waiting||!checked&&selected.length>=HOBBY_LIMIT} onClick={()=>toggle(item.value)}><span aria-hidden="true">{item.emoji}</span><span>{item[locale]}</span>{checked&&<Check size={13} aria-hidden="true"/>}</button>;})}</div>{!query.trim()&&group.items.length>group.preview&&<button type="button" className="profile-hobby-more" aria-label={(isExpanded?t('收起','Show less'):t('显示更多','Show more'))+' '+group[locale]} aria-expanded={isExpanded} aria-controls={`${id}-${group.id}-options`} disabled={busy} onClick={()=>setExpanded(items=>isExpanded?items.filter(item=>item!==group.id):[...items,group.id])}><span/>{isExpanded?t('收起','Show less'):t('显示更多','Show more')}<ChevronDown size={17} style={{transform:isExpanded?'rotate(180deg)':undefined}}/><span/></button>}</section>;
  }):<Empty title={t('未找到爱好','No hobbies found')} description={t('试试其他关键词，或搜索爱好的英文名称。','Try another keyword or the English name of a hobby.')}/>}</div>
 </ProfileCardSheet>;
}
