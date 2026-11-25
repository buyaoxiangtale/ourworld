import {useRef, useState} from 'react';
import {ChevronLeft, ChevronRight, Pencil, Plus} from 'lucide-react';
import type {ProfileLayout} from '@ourworld/contracts';
import {useApp} from '../../context';
import {Cover, IconButton} from '../../ui';
import type {ProfileAboutSection} from './ProfileAboutEditor';
import {isPhotoCaption, photoWallPhotoKey, readPhotoWall} from './profile-content';

export function ProfileAbout({bio, layout, photos, onOpenPhoto, onEdit}: {
 bio: string;
 layout: ProfileLayout | null;
 photos: string[];
 onOpenPhoto: (index: number) => void;
 onEdit: (section: ProfileAboutSection, storyId?: string) => void;
}) {
 const {t} = useApp();
 const track = useRef<HTMLDivElement>(null);
 const drag = useRef<{id: number; x: number; y: number; left: number; moved: boolean} | null>(null);
 const [dragging, setDragging] = useState(false);
 const [firstVisible, setFirstVisible] = useState(0);
 const stories = (layout?.blocks ?? []).flatMap(story => {
  const photo = story.refs?.[0];
  return isPhotoCaption(story) && photo ? [{story, photo}] : [];
 });
 const {featuredPhoto} = readPhotoWall(layout);
 const storyPhotoKeys = new Set(stories.map(({photo}) => photoWallPhotoKey(photo)));
 const preferredIndex = Math.max(0, photos.findIndex(photo => photoWallPhotoKey(photo) === featuredPhoto));
 const alternateIndex = photos.findIndex(photo => !storyPhotoKeys.has(photoWallPhotoKey(photo)));
 const photoIndex = photos[preferredIndex] && storyPhotoKeys.has(photoWallPhotoKey(photos[preferredIndex])) && alternateIndex >= 0
  ? alternateIndex : preferredIndex;
 const photo = photos[photoIndex];
 const lastStart = Math.max(0, stories.length + Number(Boolean(photo)) - 1);

 const stride = (element: HTMLDivElement) => {
  const first = element.children[0] as HTMLElement | undefined;
  const second = element.children[1] as HTMLElement | undefined;
  return first && second ? Math.max(1, second.offsetLeft - first.offsetLeft) : 1;
 };
 const go = (index: number) => {
  const element = track.current;
  if (!element) return;
  const left = Math.max(0, Math.min(index, lastStart)) * stride(element);
  element.scrollTo({left, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'});
 };
 const finishDrag = () => {
  const gesture = drag.current;
  drag.current = null;
  if (!gesture?.moved || !track.current) return;
  setDragging(false);
  go(Math.round(track.current.scrollLeft / stride(track.current)));
 };

 return <section className="owner-section owner-about" aria-labelledby="owner-about-title">
  <div className="owner-section-heading owner-about-heading">
   <h2 id="owner-about-title">{t('关于我','About me')}</h2>
   <div className="owner-about-controls">
    {lastStart > 0 && <>
     <IconButton label={t('上一张卡片','Previous card')} disabled={firstVisible <= 0} onClick={() => go(firstVisible - 1)}><ChevronLeft size={18} /></IconButton>
     <IconButton label={t('下一张卡片','Next card')} disabled={firstVisible >= lastStart} onClick={() => go(firstVisible + 1)}><ChevronRight size={18} /></IconButton>
    </>}
    <button type="button" className="owner-about-add" onClick={() => onEdit('photo-caption')}>
     <Plus size={16} aria-hidden="true" />{t('新增卡片','Add card')}
    </button>
   </div>
  </div>
  <p className="owner-section-hint">{t('用一段介绍、一张照片，让旅人认识你','A few words and a photo to get to know you')}</p>
  <div ref={track} className={`owner-about-track${dragging ? ' is-dragging' : ''}`} role="group" aria-labelledby="owner-about-title" tabIndex={lastStart > 0 ? 0 : undefined}
   onScroll={event => setFirstVisible(Math.round(event.currentTarget.scrollLeft / stride(event.currentTarget)))}
   onKeyDown={event => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    go(firstVisible + (event.key === 'ArrowLeft' ? -1 : 1));
   }}
   onPointerDown={event => {
    if (!lastStart || event.pointerType === 'touch' || event.button !== 0 || (event.target as HTMLElement).closest('.owner-about-edit')) return;
    drag.current = {id: event.pointerId, x: event.clientX, y: event.clientY, left: event.currentTarget.scrollLeft, moved: false};
   }}
   onPointerMove={event => {
    const gesture = drag.current;
    if (!gesture || gesture.id !== event.pointerId) return;
    const delta = event.clientX - gesture.x;
    if (!gesture.moved) {
     if (Math.abs(delta) < 8 || Math.abs(delta) <= Math.abs(event.clientY - gesture.y)) return;
     gesture.moved = true;
     event.currentTarget.setPointerCapture(event.pointerId);
     setDragging(true);
    }
    event.preventDefault();
    event.currentTarget.scrollLeft = gesture.left - delta;
   }}
   onPointerUp={finishDrag} onPointerCancel={finishDrag} onLostPointerCapture={finishDrag}
   onPointerLeave={() => { if (!drag.current?.moved) drag.current = null; }}
   onDragStart={event => event.preventDefault()}>
   <article className="owner-about-card owner-about-bio">
    <div className="owner-about-copy" tabIndex={bio.trim() ? 0 : undefined} aria-label={t('个人简介','Bio')}>
     <span className="owner-about-label">{t('个人简介','Bio')}</span>
     <span className="owner-about-rule" aria-hidden="true" />
     <p>{bio.trim() ? bio : t('介绍一下自己','Share a little about yourself')}</p>
    </div>
    <IconButton className="owner-about-edit" label={t('编辑个人简介','Edit bio')} onClick={() => onEdit('bio')}><Pencil size={16} /></IconButton>
   </article>
   {stories.map(({story, photo: storyPhoto}, index) => {
    const title = story.title?.trim();
    const text = story.content?.trim();
    return <article key={story.id} className={`owner-about-card owner-about-story${title || text ? '' : ' is-image-only'}`}>
     <div className="owner-about-image"><Cover src={storyPhoto} alt="" /></div>
     {(title || text) && <div className="owner-about-copy" tabIndex={0} aria-label={t('照片故事','Photo story')}>
      {title && <span className="owner-about-label">{title}</span>}
      {text && <p>{text}</p>}
     </div>}
     <IconButton className="owner-about-edit" label={t(`编辑卡片 ${index + 1}`, `Edit card ${index + 1}`)} onClick={() => onEdit('photo-caption', story.id)}><Pencil size={16} /></IconButton>
    </article>;
   })}
   {photo && <button type="button" className="owner-about-card owner-about-photo"
    aria-label={t('查看关于我的照片', 'View About me photo')} onClick={() => onOpenPhoto(photoIndex)}>
    <span className="owner-about-image"><Cover src={photo} alt="" /></span>
   </button>}
  </div>
 </section>;
}
