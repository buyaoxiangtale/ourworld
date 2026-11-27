import {useEffect,useRef,useState} from 'react';
import {ImagePlus} from 'lucide-react';
import type {User} from '@ourworld/contracts';
import {getSession,send,setSession,upload} from '../../api';
import {useApp} from '../../context';
import {errorMessage} from '../../hooks';
import {Button,ErrorBox,Modal} from '../../ui';

type Crop={zoom:number;x:number;y:number};
const centered:Crop={zoom:1,x:0,y:0};
const avatarSize=512;
const imageScale=(image:{width:number;height:number},zoom:number)=>{
 const edge=Math.min(image.width,image.height);
 return {width:image.width*zoom/edge,height:image.height*zoom/edge};
};
const clampOffset=(offset:number,length:number)=>{
 const limit=(length-1)/2;
 return Math.max(-limit,Math.min(limit,offset));
};

export function ProfileAvatarEditor({onClose,onSaved}:{onClose:()=>void;onSaved:()=>void}){
 const {t,toast}=useApp();
 const [file,setFile]=useState<File>();
 const [source,setSource]=useState('');
 const [size,setSize]=useState<{width:number;height:number}>();
 const [crop,setCrop]=useState(centered);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const image=useRef<HTMLImageElement>(null);
 const drag=useRef<{id:number;x:number;y:number}|null>(null);
 const uploaded=useRef<string|undefined>(undefined);
 useEffect(()=>{
  if(!file)return;
  const url=URL.createObjectURL(file);
  setSource(url);
  return()=>URL.revokeObjectURL(url);
 },[file]);
 const choose=(next:File)=>{
  drag.current=null;
  uploaded.current=undefined;
  setSource('');setSize(undefined);setCrop(centered);setError('');setFile(next);
 };
 const updateCrop=(change:(current:Crop)=>Crop)=>{
  if(!size||busy)return;
  uploaded.current=undefined;
  setCrop(current=>{
   const next=change(current);
   const scale=imageScale(size,next.zoom);
   return {...next,x:clampOffset(next.x,scale.width),y:clampOffset(next.y,scale.height)};
  });
 };
 const save=async()=>{
  const element=image.current,session=getSession();
  if(busy||!size||!element||!session)return;
  setBusy(true);setError('');
  try{
   if(!uploaded.current){
    const canvas=document.createElement('canvas');
    canvas.width=canvas.height=avatarSize;
    const context=canvas.getContext('2d');
    if(!context)throw new Error(t('无法裁剪这张图片','This image could not be cropped'));
    const {width,height}=imageScale(size,crop.zoom);
    context.fillStyle='#121112';
    context.fillRect(0,0,avatarSize,avatarSize);
    context.drawImage(element,(.5+crop.x-width/2)*avatarSize,(.5+crop.y-height/2)*avatarSize,width*avatarSize,height*avatarSize);
    const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(result=>{
     if(result)resolve(result);else reject(new Error(t('无法生成头像','Unable to create the avatar')));
    },'image/jpeg',.9));
    uploaded.current=(await upload(new File([blob],'avatar.jpg',{type:blob.type}))).url;
   }
   if(getSession()?.clientId!==session.clientId)return;
   const user=await send<User>('/me',{avatar:uploaded.current},'PATCH');
   const current=getSession();
   if(!current||current.clientId!==session.clientId)return;
   setSession({...current,user});
   onSaved();onClose();
   toast(t('头像已更新','Profile photo updated'));
  }catch(e){setError(errorMessage(e));}finally{setBusy(false);}
 };
 const scaled=size&&imageScale(size,crop.zoom);
 return <Modal title={t('编辑头像','Edit profile photo')} className="profile-avatar-editor" onClose={()=>{if(!busy)onClose();}}>
  <form className="form-stack" onSubmit={event=>{event.preventDefault();void save();}}>
   <ErrorBox message={error}/>
   <label className="file-button"><ImagePlus size={18}/>{file?t('更换图片','Change image'):t('选择图片','Choose image')}
    <input type="file" accept="image/*" aria-label={t('选择头像图片','Choose a profile photo')} disabled={busy} onChange={event=>{
     const next=event.target.files?.[0];event.target.value='';if(next)choose(next);
    }}/>
   </label>
   {source&&<div className="avatar-crop" role="group" tabIndex={size&&!busy?0:undefined} aria-label={t('头像裁剪预览','Profile photo crop preview')}
    onPointerDown={event=>{
     if(!event.isPrimary||event.button!==0||busy||!size)return;
     event.currentTarget.setPointerCapture(event.pointerId);
     drag.current={id:event.pointerId,x:event.clientX,y:event.clientY};
    }}
    onPointerMove={event=>{
     const active=drag.current;
     if(active?.id!==event.pointerId)return;
     const edge=event.currentTarget.clientWidth;
     const x=(event.clientX-active.x)/edge,y=(event.clientY-active.y)/edge;
     drag.current={id:active.id,x:event.clientX,y:event.clientY};
     updateCrop(current=>({...current,x:current.x+x,y:current.y+y}));
    }}
    onLostPointerCapture={()=>{drag.current=null;}}
    onKeyDown={event=>{
     const offsets:Record<string,readonly [number,number]>={ArrowLeft:[-.03,0],ArrowRight:[.03,0],ArrowUp:[0,-.03],ArrowDown:[0,.03]};
     const offset=offsets[event.key];if(!offset)return;
     event.preventDefault();
     updateCrop(current=>({...current,x:current.x+offset[0],y:current.y+offset[1]}));
    }}>
    <img ref={image} src={source} alt="" draggable={false} style={scaled?{width:`${scaled.width*100}%`,height:`${scaled.height*100}%`,left:`${(crop.x+.5)*100}%`,top:`${(crop.y+.5)*100}%`}:undefined}
     onLoad={event=>setSize({width:event.currentTarget.naturalWidth,height:event.currentTarget.naturalHeight})}
     onError={()=>{setSize(undefined);setError(t('无法读取这张图片，请换一张。','This image could not be read. Choose another one.'));}}/>
   </div>}
   {size&&<label className="avatar-crop-zoom">{t('缩放','Zoom')}<input type="range" min="1" max="4" step=".01" value={crop.zoom} disabled={busy}
    onChange={event=>{const zoom=Number(event.currentTarget.value);updateCrop(current=>({...current,zoom}));}}/></label>}
   <Button type="submit" busy={busy} disabled={!size}>{t('保存头像','Save profile photo')}</Button>
  </form>
 </Modal>;
}
