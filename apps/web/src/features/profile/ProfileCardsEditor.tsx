import {useEffect,useId,useState} from 'react';
import {ArrowDown,ArrowUp,ImagePlus,Plus,Trash2} from 'lucide-react';
import type {ProfileBlock,ProfileDraft,ProfileLayout} from '@ourworld/contracts';
import {api,send,upload} from '../../api';
import {useApp} from '../../context';
import {errorMessage,useLoad} from '../../hooks';
import {Button,Cover,ErrorBox,IconButton,Loading,Modal} from '../../ui';
import {isPhotoCaption,profileGalleryPhotos} from './profile-content';

export type ProfileCardSection='gallery'|'prompts';
// getRandomValues also works on the current public HTTP origin.
const newBlockId=()=>Array.from(crypto.getRandomValues(new Uint8Array(16)),byte=>byte.toString(16).padStart(2,'0')).join('');
/** Edit one section without exposing layout, themes or AI generation. */
export function ProfileCardsEditor({section,onClose,onPublished}:{section:ProfileCardSection;onClose:()=>void;onPublished:()=>void}){
 const {t,toast}=useApp();const editorId=useId();const load=useLoad(()=>api<ProfileDraft>('/profile/draft'),[]);
 const [draft,setDraft]=useState<ProfileDraft>();const [photos,setPhotos]=useState<string[]>([]);const [prompts,setPrompts]=useState<{question:string;answer:string}[]>([]);
 const [busy,setBusy]=useState(false);const [uploading,setUploading]=useState(false);const [error,setError]=useState('');
 useEffect(()=>{if(!load.data)return;setDraft(load.data);setPhotos(profileGalleryPhotos(load.data.layout));const items=load.data.layout.blocks.filter(b=>b.type==='prompts').flatMap(b=>b.prompts||[]);setPrompts(items.length?items:[{question:'',answer:''}]);},[load.data]);
 const save=async()=>{
  if(!draft)return;setBusy(true);setError('');
  try{
   const current=draft.layout;const original=current.blocks.find(b=>b.type===section&&!isPhotoCaption(b));
   const block:ProfileBlock={...original,id:original?.id||newBlockId(),type:section,span:original?.span||2,size:original?.size||'compact',...(section==='gallery'?{refs:photos}:{prompts:prompts.map(p=>({question:p.question.trim(),answer:p.answer.trim()}))})};
   const blocks=current.blocks.filter(b=>b.type!==section||isPhotoCaption(b));const at=current.blocks.findIndex(b=>b.type===section&&!isPhotoCaption(b));
   // Empty sections are removed: API prompt blocks require at least one answer.
   if(section==='gallery'?photos.length>0:prompts.length>0)blocks.splice(at<0?blocks.length:Math.min(at,blocks.length),0,block);
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
     <p className="muted">{t('添加或调整照片顺序，让大家看到不同的你。','Add and arrange photos to share a few different sides of you.')}</p>
     <div className="card-photo-editor-grid">{photos.map((url,i)=><article key={`${url}-${i}`}><Cover src={url} alt={t(`照片 ${i+1}`,`Photo ${i+1}`)}/><div><IconButton type="button" label={t('前移照片','Move photo earlier')} disabled={i===0||busy||uploading} onClick={()=>setPhotos(items=>{const next=[...items];[next[i-1],next[i]]=[next[i],next[i-1]];return next;})}><ArrowUp size={16}/></IconButton><IconButton type="button" label={t('后移照片','Move photo later')} disabled={i===photos.length-1||busy||uploading} onClick={()=>setPhotos(items=>{const next=[...items];[next[i],next[i+1]]=[next[i+1],next[i]];return next;})}><ArrowDown size={16}/></IconButton><IconButton type="button" label={t(`删除照片 ${i+1}`,`Remove photo ${i+1}`)} disabled={busy||uploading} onClick={()=>setPhotos(items=>items.filter((_,j)=>j!==i))}><Trash2 size={16}/></IconButton></div></article>)}</div>
     <label className="file-button"><ImagePlus size={18}/>{uploading?t('正在上传…','Uploading…'):t('添加照片','Add photos')}<input type="file" accept="image/*" multiple disabled={busy||uploading} onChange={async e=>{const files=Array.from(e.target.files||[]);e.target.value='';setUploading(true);setError('');try{for(const file of files){const result=await upload(file);setPhotos(items=>[...items,result.url]);}}catch(e){setError(errorMessage(e));}finally{setUploading(false);}}}/></label>
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
