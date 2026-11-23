import {useEffect,useId,useRef,useState} from 'react';
import {ArrowDown,ArrowUp,ImagePlus,Plus,Star,Trash2} from 'lucide-react';
import type {ProfileBlock,ProfileDraft,ProfileLayout} from '@ourworld/contracts';
import {api,send,upload} from '../../api';
import {useApp} from '../../context';
import {errorMessage,useLoad} from '../../hooks';
import {Button,Cover,ErrorBox,IconButton,Loading,Modal} from '../../ui';
import type {PhotoWallEditTarget} from './ProfilePhotoWall';
import {isPhotoCaption,photoWallPhotoKey,profileGalleryPhotos,readPhotoWall,writePhotoWall} from './profile-content';

export type ProfileCardSection='gallery'|'prompts';
// getRandomValues also works on the current public HTTP origin.
const newBlockId=()=>Array.from(crypto.getRandomValues(new Uint8Array(16)),byte=>byte.toString(16).padStart(2,'0')).join('');
const galleryRefLimit=50;
/** Edit one section without exposing layout, themes or AI generation. */
export function ProfileCardsEditor({section,photoWallEditTarget,onClose,onPublished}:{section:ProfileCardSection;photoWallEditTarget?:PhotoWallEditTarget;onClose:()=>void;onPublished:()=>void}){
 const {t,toast}=useApp();const editorId=useId();const load=useLoad(()=>api<ProfileDraft>('/profile/draft'),[]);
 const [draft,setDraft]=useState<ProfileDraft>();const [photos,setPhotos]=useState<string[]>([]);const [prompts,setPrompts]=useState<{question:string;answer:string}[]>([]);
 const [slogan,setSlogan]=useState('');
 const [captions,setCaptions]=useState<ReadonlyMap<string,string>>(new Map());
 const [featuredPhoto,setFeaturedPhoto]=useState<string>();
 const focusedTarget=useRef(false);
 const [busy,setBusy]=useState(false);const [uploading,setUploading]=useState(false);const [error,setError]=useState('');
 useEffect(()=>{
  if(!load.data)return;
  setDraft(load.data);
  setPhotos(profileGalleryPhotos(load.data.layout));
  const wall=readPhotoWall(load.data.layout);
  setSlogan(wall.slogan);
  setCaptions(wall.captions);
  setFeaturedPhoto(wall.featuredPhoto);
  const items=load.data.layout.blocks.filter(b=>b.type==='prompts').flatMap(b=>b.prompts||[]);
  setPrompts(items.length?items:[{question:'',answer:''}]);
 },[load.data]);
 useEffect(()=>{
  if(!draft||!photoWallEditTarget||focusedTarget.current)return;
  const photoIndex=photoWallEditTarget==='slogan'?-1:photos.findIndex(
   url=>photoWallPhotoKey(url)===photoWallPhotoKey(photoWallEditTarget.photo)
  );
  const field=document.getElementById(`${editorId}-${photoIndex<0?'slogan':`caption-${photoIndex}`}`);
  field?.focus();
  focusedTarget.current=!!field;
 },[draft,editorId,photoWallEditTarget,photos]);
 const uploadPhotos=async(files:File[])=>{
  if(!files.length)return;
  setError('');
  if(photos.length+files.length>galleryRefLimit){
   setError(t('照片墙最多上传 50 张照片。','Upload up to 50 photos to the wall.'));
   return;
  }
  setUploading(true);
  try{
   for(const file of files){
    const result=await upload(file);
    setPhotos(items=>[...items,result.url]);
   }
  }catch(e){setError(errorMessage(e));}finally{setUploading(false);}
 };
 const save=async()=>{
  if(!draft||busy||uploading)return;setBusy(true);setError('');
  try{
   const current=draft.layout;
   const matchesSection=(block:ProfileBlock)=>block.type===section&&!isPhotoCaption(block);
   const originals=current.blocks.filter(matchesSection);
   const makeBlock=(original?:ProfileBlock):ProfileBlock=>({
    ...original,id:original?.id||newBlockId(),type:section,span:original?.span||2,size:original?.size||'compact'
   });
   const replacement:ProfileBlock[]=[];
   if(section==='gallery'){
    const text=slogan.trim();
    const featured=photos.some(url=>photoWallPhotoKey(url)===featuredPhoto)?featuredPhoto:undefined;
    for(let start=0;start<photos.length||start===0&&text;start+=galleryRefLimit){
     const refs=photos.slice(start,start+galleryRefLimit);
     const content=writePhotoWall(start===0?text:'',refs,captions,start===0?featured:undefined);
     if(content&&content.length>10000){
      setError(t('照片介绍的总字数过长，请缩短后再保存。','The captions are too long in total. Shorten them before saving.'));
      return;
     }
     replacement.push({...makeBlock(originals[start/galleryRefLimit]),refs,content});
    }
   }else if(prompts.length){
    replacement.push({...makeBlock(originals[0]),prompts:prompts.map(p=>({question:p.question.trim(),answer:p.answer.trim()}))});
   }
   const blocks=current.blocks.filter(b=>!matchesSection(b));
   const at=current.blocks.findIndex(matchesSection);
   blocks.splice(at<0?blocks.length:at,0,...replacement);
   if(!blocks.length)blocks.push({id:newBlockId(),type:'intro',span:2,size:'compact'});
   const layout:ProfileLayout={...current,blocks};
   const saved=await send<ProfileDraft>('/profile/draft',{revision:draft.revision,layout},'PUT');
   // Retain the new revision if publishing fails so retrying can succeed.
   setDraft(saved);await send('/profile/publish',{revision:saved.revision});
   onPublished();toast(t('主页已更新','Profile updated'));onClose();
  }catch(e){setError(errorMessage(e));}finally{setBusy(false);}
 };
 return <Modal title={section==='gallery'?t('我的照片','My photos'):t('我的旅行问答','My travel prompts')} onClose={onClose}>
  <form className="form-stack profile-card-editor" onSubmit={e=>{e.preventDefault();void save();}}>
   <ErrorBox message={load.error||error} retry={load.error?load.reload:undefined}/>
   {load.loading?<Loading/>:draft&&<>
    {section==='gallery'?<>
     <label className="photo-wall-field" htmlFor={`${editorId}-slogan`}>
      <span>{t('照片墙标语','Photo wall slogan')}</span>
      <textarea id={`${editorId}-slogan`} rows={2} maxLength={160} value={slogan} disabled={busy}
       placeholder={t('用一句话介绍你的照片墙','Introduce your photo wall in one line')}
       onChange={event=>setSlogan(event.target.value)}/>
     </label>
     <div className="card-photo-editor-grid">{photos.map((url,i)=>{
      const captionId=`${editorId}-caption-${i}`;
      const key=photoWallPhotoKey(url);
      const isFeatured=featuredPhoto===key;
      return <article key={url}>
       <Cover src={url} alt={t(`照片 ${i+1}`,`Photo ${i+1}`)}/>
       <div className="photo-wall-field photo-wall-caption-editor">
        <div className="photo-wall-field-heading">
         <label htmlFor={captionId}>{t(`照片 ${i+1} 的介绍`,`Caption for photo ${i+1}`)}</label>
         <button type="button" className="photo-wall-feature-toggle" aria-pressed={isFeatured}
          disabled={busy||uploading} onClick={()=>setFeaturedPhoto(key)}>
          <Star size={13} aria-hidden="true" />
          {isFeatured?t('主照片','Main photo'):t('设为主照片','Set as main photo')}
         </button>
        </div>
        <textarea id={captionId} rows={2} maxLength={140} value={captions.get(key)||''} disabled={busy}
         placeholder={t('介绍可以留空','Optional caption')}
         onChange={event=>{
          const value=event.target.value;
          setCaptions(items=>new Map(items).set(key,value));
         }}/>
       </div>
       <div className="photo-wall-photo-actions">
        <IconButton type="button" label={t('前移照片','Move photo earlier')} disabled={i===0||busy||uploading} onClick={()=>setPhotos(items=>{const next=[...items];[next[i-1],next[i]]=[next[i],next[i-1]];return next;})}><ArrowUp size={16}/></IconButton>
        <IconButton type="button" label={t('后移照片','Move photo later')} disabled={i===photos.length-1||busy||uploading} onClick={()=>setPhotos(items=>{const next=[...items];[next[i+1],next[i]]=[next[i],next[i+1]];return next;})}><ArrowDown size={16}/></IconButton>
        <IconButton type="button" label={t(`删除照片 ${i+1}`,`Remove photo ${i+1}`)} disabled={busy||uploading} onClick={()=>{
         setPhotos(items=>items.filter((_,j)=>j!==i));
         if(isFeatured)setFeaturedPhoto(undefined);
        }}><Trash2 size={16}/></IconButton>
       </div>
      </article>;
     })}</div>
     <label className="file-button"><ImagePlus size={18}/>{uploading?t('正在上传…','Uploading…'):t('添加照片','Add photos')}
      <input type="file" accept="image/*" multiple disabled={busy||uploading} onChange={event=>{
       const files=Array.from(event.target.files||[]);
       event.target.value='';
       void uploadPhotos(files);
      }}/>
     </label>
    </>:<>
     <p className="muted">{t('回答一些小问题，让旅人更了解你。','A few little answers to help travellers get to know you.')}</p>
     {prompts.map((prompt,i)=><div key={i} className="card-prompt-editor-row"><label htmlFor={`${editorId}-question-${i}`}>{t('问题','Question')}</label><input id={`${editorId}-question-${i}`} required maxLength={120} value={prompt.question} placeholder={t('我城市里最值得早起的地方是…','The place in my city worth waking up early for…')} onChange={e=>setPrompts(items=>items.map((item,j)=>i===j?{...item,question:e.target.value}:item))}/><label htmlFor={`${editorId}-answer-${i}`}>{t('我的回答','My answer')}</label><textarea id={`${editorId}-answer-${i}`} required maxLength={500} rows={3} value={prompt.answer} onChange={e=>setPrompts(items=>items.map((item,j)=>i===j?{...item,answer:e.target.value}:item))}/><IconButton type="button" label={t(`删除问答 ${i+1}`,`Remove prompt ${i+1}`)} disabled={busy} onClick={()=>setPrompts(items=>items.filter((_,j)=>i!==j))}><Trash2 size={17}/></IconButton></div>)}
     <Button type="button" kind="secondary" disabled={prompts.length>=5||busy} onClick={()=>setPrompts(items=>[...items,{question:'',answer:''}])}><Plus size={17}/>{t('添加旅行问答','Add travel prompt')}</Button>
    </>}
    <Button type="submit" busy={busy} disabled={uploading}>{t('保存并更新主页','Save and update profile')}</Button>
   </>}
  </form>
 </Modal>;
}
