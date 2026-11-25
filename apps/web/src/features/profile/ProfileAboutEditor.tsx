import {useEffect,useId,useState,type ReactNode} from 'react';
import {Check,ImagePlus,Lightbulb,X} from 'lucide-react';
import type {ProfileDraft,ProfileLayout,User} from '@ourworld/contracts';
import {api,getSession,send,setSession,upload} from '../../api';
import {useApp} from '../../context';
import {errorMessage,useLoad} from '../../hooks';
import {ProfileCardSheet} from './ProfileCardSheet';
import { EarthSpinner,Button,Cover,ErrorBox,IconButton,Loading} from '../../ui';
import {createPhotoCaptionId,isPhotoCaption} from './profile-content';

export type ProfileAboutSection='bio'|'photo-caption';

function AboutEditorPage({title,busy,disabled,onClose,onSave,children}:{title:string;busy:boolean;disabled:boolean;onClose:()=>void;onSave:()=>void;children:ReactNode}){
 const {t}=useApp();const close=()=>{if(!busy)onClose();};
 return <ProfileCardSheet title={title} className="profile-about-editor" busy={busy} onClose={onClose}>
  <form onSubmit={event=>{event.preventDefault();if(!disabled&&!busy)onSave();}}>
   <header className="profile-about-editor-header"><IconButton type="button" label={t('取消','Cancel')} disabled={busy} onClick={close}><X size={24}/></IconButton><h2>{title}</h2><IconButton type="submit" label={t('保存','Save')} className="profile-about-save" disabled={disabled||busy}>{busy?<EarthSpinner small/>:<Check size={26}/>}</IconButton></header>
   <div className="profile-about-editor-body">{children}</div>
  </form>
 </ProfileCardSheet>;
}

export function BiographyEditor({initialUser,onClose,onDone}:{initialUser:User;onClose:()=>void;onDone:()=>void}){
 const {t,toast,refreshUser}=useApp();const id=useId();const [bio,setBio]=useState(initialUser.bio);const [busy,setBusy]=useState(false);const [error,setError]=useState('');
 const save=async()=>{
  setBusy(true);setError('');
  try{
   const updated=await send<User>('/me',{bio:bio.trim()},'PATCH');setSession({...getSession()!,user:updated});
   await refreshUser();onDone();toast(t('个人简介已更新','Bio updated'));onClose();
  }catch(error){setError(errorMessage(error));}finally{setBusy(false);}
 };
 return <AboutEditorPage title={initialUser.bio?t('编辑个人简介','Edit bio'):t('添加个人简介','Add a bio')} busy={busy} disabled={bio.length>500||bio.trim()===initialUser.bio} onClose={onClose} onSave={()=>void save()}>
  <div className="profile-about-text-field"><textarea id={id} aria-label={t('个人简介','Bio')} aria-describedby={`${id}-count`} value={bio} maxLength={500} disabled={busy} onChange={event=>setBio(event.target.value)} placeholder={t('喜欢散步、摄影和不赶时间的旅行。说说你的兴趣，以及想与旅人分享的日常。','Share your interests, your everyday life and what you love about exploring with others.')} rows={5}/><span id={`${id}-count`} className={`profile-about-count ${bio.length>500?'is-over-limit':''}`} aria-live="polite">{bio.length}/500</span></div>
  <aside className="profile-about-tip"><h3><Lightbulb size={18}/>{t('个人简介提示','A little inspiration')}</h3><p>{t('简短自然的介绍就很好。分享你的兴趣、旅行方式，以及希望与旅人一起体验的事。','Keep it short and natural. Share your interests, how you like to travel and what you would enjoy experiencing with others.')}</p></aside>
  <ErrorBox message={error}/>
 </AboutEditorPage>;
}

export function PhotoCaptionEditor({photos,storyId,onClose,onPublished}:{photos:string[];storyId?:string;onClose:()=>void;onPublished:()=>void}){
 const {t,toast}=useApp();const id=useId();const load=useLoad(()=>api<ProfileDraft>('/profile/draft'),[]);
 const [blockId]=useState(()=>storyId||createPhotoCaptionId());
 const [draft,setDraft]=useState<ProfileDraft>();const [photo,setPhoto]=useState('');const [caption,setCaption]=useState('');const [title,setTitle]=useState('');
 const [uploaded,setUploaded]=useState<string[]>([]);const [busy,setBusy]=useState(false);const [uploading,setUploading]=useState(false);const [error,setError]=useState('');
 useEffect(()=>{if(!load.data)return;setDraft(load.data);const existing=load.data.layout.blocks.find(block=>block.id===blockId&&isPhotoCaption(block));setPhoto(existing?.refs?.[0]||'');setCaption(existing?.content||'');setTitle(existing?.title||'');},[load.data,blockId]);
 const choices=[...new Set([...photos,...uploaded,...(photo?[photo]:[])])];
 const save=async(remove=false)=>{
  if(!draft)return;setBusy(true);setError('');
  try{
   const blocks=draft.layout.blocks.filter(block=>block.id!==blockId);
   if(!remove){
    const at=draft.layout.blocks.findIndex(block=>block.id===blockId);
    const lastStory=blocks.map(isPhotoCaption).lastIndexOf(true);
    const insertAt=at>=0?Math.min(at,blocks.length):lastStory>=0?lastStory+1:Math.max(0,blocks.findIndex(block=>block.type==='intro')+1);
    blocks.splice(insertAt,0,{id:blockId,type:'gallery',span:2,size:'expanded',title:title.trim()||undefined,content:caption.trim()||undefined,refs:[photo]});
   }
   if(!blocks.length)blocks.push({id:'intro',type:'intro',span:2,size:'compact'});
   const layout:ProfileLayout={...draft.layout,blocks};const saved=await send<ProfileDraft>('/profile/draft',{revision:draft.revision,layout},'PUT');setDraft(saved);
   await send('/profile/publish',{revision:saved.revision});onPublished();toast(t('卡片已更新','Card updated'));onClose();
  }catch(error){setError(errorMessage(error));}finally{setBusy(false);}
 };
 return <AboutEditorPage title={storyId?t('编辑卡片','Edit card'):t('新增卡片','Add card')} busy={busy||uploading} disabled={!draft||!photo||caption.length>500} onClose={onClose} onSave={()=>void save()}>
  <ErrorBox message={load.error||error} retry={load.error?load.reload:undefined}/>
  {load.loading?<Loading/>:draft&&<>
   <p className="profile-about-description">{t('选一张照片。标题和配文可以留空。','Choose a photo. A title and caption are optional.')}</p>
   {photo&&<div className="profile-caption-preview"><Cover src={photo} alt={t('所选照片','Selected photo')}/></div>}
   <fieldset className="profile-caption-choices" disabled={busy||uploading}><legend>{t('选择照片','Choose a photo')}</legend><div>{choices.map((url,index)=><button type="button" key={url} aria-label={t(`选择照片 ${index+1}`,`Select photo ${index+1}`)} aria-pressed={photo===url} onClick={()=>setPhoto(url)}><Cover src={url} alt={t(`照片 ${index+1}`,`Photo ${index+1}`)}/>{photo===url&&<span><Check size={16}/></span>}</button>)}</div></fieldset>
   <label className="file-button profile-caption-upload" aria-disabled={busy||uploading}>{uploading?<EarthSpinner small/>:<ImagePlus size={18}/>}<span>{uploading?t('正在上传…','Uploading…'):t('上传一张照片','Upload a photo')}</span><input type="file" accept="image/*" disabled={busy||uploading} onChange={async event=>{const file=event.target.files?.[0];event.target.value='';if(!file)return;setUploading(true);setError('');try{const result=await upload(file);setUploaded(items=>[...items,result.url]);setPhoto(result.url);}catch(error){setError(errorMessage(error));}finally{setUploading(false);}}}/></label>
   <label className="profile-caption-label" htmlFor={`${id}-title`}>{t('标题（选填）','Title (optional)')}</label><input id={`${id}-title`} className="profile-caption-title" value={title} maxLength={120} disabled={busy} onChange={event=>setTitle(event.target.value)}/>
   <div className="profile-about-text-field"><textarea aria-label={t('照片配文','Photo caption')} aria-describedby={`${id}-count`} value={caption} maxLength={500} disabled={busy} rows={4} placeholder={t('写下这一刻的故事……','Tell the story of this moment…')} onChange={event=>setCaption(event.target.value)}/><span id={`${id}-count`} className="profile-about-count" aria-live="polite">{caption.length}/500</span></div>
   {draft.layout.blocks.some(block=>block.id===blockId&&isPhotoCaption(block))&&<Button type="button" kind="ghost" disabled={busy||uploading} onClick={()=>void save(true)}>{t('移除卡片','Remove card')}</Button>}
  </>}
 </AboutEditorPage>;
}
