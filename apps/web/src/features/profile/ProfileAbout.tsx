import {useEffect, useRef, useState} from 'react';
import {ImagePlus, Pencil, Trash2} from 'lucide-react';
import type {BioBackground, ProfileDraft, ProfileLayout} from '@ourworld/contracts';
import {api, send, upload} from '../../api';
import {useApp} from '../../context';
import {errorMessage} from '../../hooks';
import {Button, ErrorBox, IconButton} from '../../ui';
import {LifePuzzleBoard} from './LifePuzzleBoard';
import {centeredCrop, makePuzzlePiece, readLifePuzzle, writeLifePuzzle, type PuzzlePiece} from './life-puzzle';

export function BioBackgroundImage({background}: {background: BioBackground}) {
 return <img className="profile-bio-background" src={background.image} alt="" style={{opacity:background.opacity/100}}/>;
}

export function ProfileAbout({bio, bioBackground, layout, onEditBio, onPublished}: {
 bio: string;
 bioBackground?: BioBackground;
 layout: ProfileLayout | null;
 onEditBio: () => void;
 onPublished: () => void;
}) {
 const {t} = useApp();
 const [editing, setEditing] = useState(false);
 const [selected, setSelected] = useState(0);
 const [working, setWorking] = useState<PuzzlePiece[] | null>(null);
 const [dirty, setDirty] = useState(false);
 const [loading, setLoading] = useState(false);
 const [uploading, setUploading] = useState(false);
 const [saving, setSaving] = useState(false);
 const [typing, setTyping] = useState(false);
 const [error, setError] = useState('');
 const [status, setStatus] = useState('');
 const draft = useRef<ProfileDraft | null>(null);
 const draftRequest = useRef<Promise<ProfileDraft> | null>(null);
 const input = useRef<HTMLInputElement>(null);
 const target = useRef<number | null>(null);
 const pieces = working ?? readLifePuzzle(layout);
 const piece = pieces[selected];
 const busy = loading || uploading || saving;

 useEffect(() => {
  if (!editing) setWorking(null);
 }, [layout]);

 const loadDraft = () => {
  draft.current = null;
  setLoading(true);
  setError('');
  const request = api<ProfileDraft>('/profile/draft');
  draftRequest.current = request;
  void request.then(value => {
   draft.current = value;
   const next = readLifePuzzle(value.layout);
   setWorking(next);
   setSelected(index => Math.min(index, next.length));
  }).catch(e => setError(errorMessage(e))).finally(()=>setLoading(false));
 };
 const select = (index: number) => {
  if (uploading || saving) return;
  setSelected(index);
  setStatus('');
  if (!editing) {
   setEditing(true);
   loadDraft();
  }
  if (index === pieces.length) {
   target.current = null;
   input.current?.click();
  }
 };
 const pick = () => {
  target.current = piece ? selected : null;
  input.current?.click();
 };
 const change = (next: PuzzlePiece[]) => {
  setWorking(next);
  setDirty(true);
  setError('');
  setStatus('');
 };
 const uploadPhoto = async (file: File) => {
  setUploading(true);
  setError('');
  try {
   const base = working ?? readLifePuzzle((await draftRequest.current)?.layout ?? layout);
   const at = target.current ?? base.length;
   const {url} = await upload(file);
   const next = [...base];
   next[at] = next[at] ? {...next[at], ...centeredCrop, photo: url} : makePuzzlePiece(url);
   change(next);
   setSelected(at);
  } catch (e) {
   setError(errorMessage(e));
  } finally {
   setUploading(false);
  }
 };
 const adjust = (fields: Partial<PuzzlePiece>) => {
  if (!piece || busy || !draft.current) return;
  setWorking(current => (current ?? pieces).map((item,index)=>index===selected?{...item,...fields}:item));
  setDirty(true);setError('');setStatus('');
 };
 const remove = () => {
  const next = pieces.filter((_,index)=>index!==selected);
  change(next);
  setSelected(Math.min(selected,next.length));
 };
 const save = async (done = false) => {
  const previous = draft.current;
  if (!previous || busy) return;
  if (!dirty) {
   if (done) {setEditing(false);setStatus('');}
   return;
  }
  const next = writeLifePuzzle(previous.layout,pieces);
  if (!next) {
   setError(t('拼图已超出主页容量，请删减照片或配文后重试。','The puzzle exceeds the profile capacity. Remove some photos or captions and try again.'));
   return;
  }
  setSaving(true);setError('');
  try {
   const saved = await send<ProfileDraft>('/profile/draft',{revision:previous.revision,layout:next},'PUT');
   draft.current = saved;
   await send('/profile/publish',{revision:saved.revision});
   setDirty(false);
   setStatus(t('拼图已保存','Puzzle saved'));
   if (done) setEditing(false);
   onPublished();
  } catch (e) {
   setError(errorMessage(e));
  } finally {
   setSaving(false);
  }
 };
 useEffect(() => {
  if (!editing || !dirty || busy || typing || error) return;
  const timer = window.setTimeout(()=>void save(),650);
  return ()=>window.clearTimeout(timer);
 }, [editing,dirty,busy,typing,error,working]);

 return <section className="owner-section owner-about" aria-labelledby="owner-about-title">
  <header className="owner-section-heading">
   <h2 id="owner-about-title">{t('关于我','About me')}</h2>
  </header>
  <div className="life-puzzle-layout">
   <article className={`life-puzzle-bio${bioBackground?' has-bio-background':''}`}>
    {bioBackground&&<BioBackgroundImage background={bioBackground}/>}
    <div className="life-puzzle-bio-heading">
     <h3>{t('简介','Bio')}</h3>
     <IconButton label={t('编辑个人简介','Edit bio')} onClick={onEditBio}><Pencil size={16}/></IconButton>
    </div>
    <p tabIndex={0}>{bio.trim() || t('介绍一下自己','Share a little about yourself')}</p>
   </article>
   <div className="life-puzzle-gallery">
    <LifePuzzleBoard pieces={pieces} selected={editing ? selected : undefined} select={select} adjust={editing ? adjust : undefined} visibleColumns={1} fullBleed/>
   </div>
  </div>
  <input ref={input} className="life-puzzle-file" type="file" accept="image/*" hidden aria-label={t('选择拼图照片','Choose a puzzle photo')}
   onChange={event=>{
    const file=event.target.files?.[0];event.target.value='';
    if(file)void uploadPhoto(file);
   }}/>
  {editing && <div className="life-puzzle-editor">
   <header><strong>{t(`第 ${Math.floor(selected / 2)+1} 列 · 第 ${selected % 2+1} 块`,`Column ${Math.floor(selected / 2)+1} · Piece ${selected % 2+1}`)}</strong>
    <span role="status">{loading?t('正在读取…','Loading…'):uploading?t('正在上传…','Uploading…'):saving?t('正在保存…','Saving…'):status}</span>
    <Button type="button" kind="secondary" className="life-puzzle-edit" busy={saving} disabled={loading||uploading} onClick={()=>{
     if (!draft.current) {setEditing(false);setError('');}
     else void save(true);
    }}>{t('完成编辑','Done')}</Button>
   </header>
   <fieldset className="life-puzzle-controls" disabled={busy||!piece}>
    <label>{t('缩放','Zoom')}<input type="range" min="100" max="300" value={Math.round((piece?.zoom??1)*100)}
     onChange={event=>adjust({zoom:Number(event.target.value)/100})}/><output>{Math.round((piece?.zoom??1)*100)}%</output></label>
    <label>{t('水平位置','Horizontal position')}<input type="range" min="-100" max="100" value={Math.round(piece?.panX??0)}
     onChange={event=>adjust({panX:Number(event.target.value)})}/></label>
    <label>{t('垂直位置','Vertical position')}<input type="range" min="-100" max="100" value={Math.round(piece?.panY??0)}
     onChange={event=>adjust({panY:Number(event.target.value)})}/></label>
   </fieldset>
   {piece && <details className="life-puzzle-story" key={piece.id}
    onFocus={event=>{if(event.target.matches('input,textarea'))setTyping(true);}}
    onBlur={()=>setTyping(false)}>
    <summary>{t('照片说明（选填）','Photo notes (optional)')}</summary>
    <label>{t('标题','Title')}<input value={piece.title??''} maxLength={120} disabled={busy} onChange={event=>adjust({title:event.target.value})}/></label>
    <label>{t('照片配文','Photo caption')}<textarea value={piece.caption??''} maxLength={500} rows={3} disabled={busy} onChange={event=>adjust({caption:event.target.value})}/></label>
   </details>}
   <div className="life-puzzle-actions">
    <Button type="button" kind="secondary" disabled={busy||!draft.current} onClick={pick}><ImagePlus size={16}/>{piece?t('替换照片','Replace photo'):t('上传照片','Upload photo')}</Button>
    {piece && <Button type="button" kind="ghost" disabled={busy||!draft.current} onClick={remove}><Trash2 size={16}/>{t('删除这张照片','Remove photo')}</Button>}
   </div>
   <ErrorBox message={error} retry={!draft.current?loadDraft:dirty?()=>void save():undefined}/>
  </div>}
 </section>;
}
