import {useId,useRef,useState,type ReactNode} from 'react';
import {Check,ImagePlus,Lightbulb,X} from 'lucide-react';
import {DEFAULT_BIO_BACKGROUND_OPACITY,type BioBackground,type User} from '@ourworld/contracts';
import {getSession,send,setSession,upload} from '../../api';
import {useApp} from '../../context';
import {errorMessage} from '../../hooks';
import {ProfileCardSheet} from './ProfileCardSheet';
import {BioBackgroundImage} from './ProfileAbout';
import {Button,EarthSpinner,ErrorBox,IconButton} from '../../ui';

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
 const fileInput=useRef<HTMLInputElement>(null);
 const [background,setBackground]=useState<BioBackground|null>(initialUser.bioBackground??null);
 const [uploading,setUploading]=useState(false);
 const bioChanged=bio.trim()!==initialUser.bio;
 const backgroundChanged=background?.fileId!==initialUser.bioBackground?.fileId||background?.opacity!==initialUser.bioBackground?.opacity;
 const uploadBackground=async(file:File)=>{
  setUploading(true);setError('');
  try{
   const result=await upload(file);
   setBackground(current=>({fileId:result.id,image:result.url,opacity:current?.opacity??DEFAULT_BIO_BACKGROUND_OPACITY}));
  }catch(error){setError(errorMessage(error));}finally{setUploading(false);}
 };
 const save=async()=>{
  setBusy(true);setError('');
  try{
   const changes={
    ...(bioChanged?{bio:bio.trim()}:{}),
    ...(backgroundChanged?{bioBackground:background?{fileId:background.fileId,opacity:background.opacity}:null}:{}),
   };
   const updated=await send<User>('/me',changes,'PATCH');setSession({...getSession()!,user:updated});
   await refreshUser();onDone();toast(t('个人简介已更新','Bio updated'));onClose();
  }catch(error){setError(errorMessage(error));}finally{setBusy(false);}
 };
 return <AboutEditorPage title={initialUser.bio?t('编辑个人简介','Edit bio'):t('添加个人简介','Add a bio')} busy={busy||uploading} disabled={bio.length>500||(!bioChanged&&!backgroundChanged)} onClose={onClose} onSave={()=>void save()}>
  <div className="profile-about-text-field"><textarea id={id} aria-label={t('个人简介','Bio')} aria-describedby={`${id}-count`} value={bio} maxLength={500} disabled={busy||uploading} onChange={event=>setBio(event.target.value)} placeholder={t('喜欢散步、摄影和不赶时间的旅行。说说你的兴趣，以及想与旅人分享的日常。','Share your interests, your everyday life and what you love about exploring with others.')} rows={5}/><span id={`${id}-count`} className={`profile-about-count ${bio.length>500?'is-over-limit':''}`} aria-live="polite">{bio.length}/500</span></div>
  <section className="profile-bio-background-editor" aria-labelledby={`${id}-background`}>
   <h3 id={`${id}-background`}>{t('简介背景','Bio background')}</h3>
   {background&&<>
    <div className="profile-bio-background-preview"><BioBackgroundImage background={background}/><span>{t('简介','Bio')}</span></div>
    <label className="profile-bio-opacity">{t('背景透明度','Background opacity')}
     <input type="range" min="0" max="100" value={background.opacity} disabled={busy||uploading}
      onChange={event=>setBackground({...background,opacity:Number(event.target.value)})}/>
     <output>{background.opacity}%</output>
    </label>
   </>}
   <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={event=>{
    const file=event.target.files?.[0];event.target.value='';
    if(file)void uploadBackground(file);
   }}/>
   <div className="profile-bio-background-actions">
    <Button type="button" kind="secondary" busy={uploading} disabled={busy} onClick={()=>fileInput.current?.click()}><ImagePlus size={16}/>{background?t('更换背景图','Replace background image'):t('上传背景图','Upload background image')}</Button>
    {background&&<Button type="button" kind="ghost" disabled={busy||uploading} onClick={()=>{setBackground(null);setError('');}}>{t('移除背景图','Remove background image')}</Button>}
   </div>
  </section>
  <aside className="profile-about-tip"><h3><Lightbulb size={18}/>{t('个人简介提示','A little inspiration')}</h3><p>{t('简短自然的介绍就很好。分享你的兴趣、旅行方式，以及希望与旅人一起体验的事。','Keep it short and natural. Share your interests, how you like to travel and what you would enjoy experiencing with others.')}</p></aside>
  <ErrorBox message={error}/>
 </AboutEditorPage>;
}
