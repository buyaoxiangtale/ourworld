import {ImagePlus, Pencil} from 'lucide-react';
import type {ProfileLayout} from '@ourworld/contracts';
import {useApp} from '../../context';
import {Cover} from '../../ui';
import {photoWallPhotoKey, readPhotoWall} from './profile-content';

export type PhotoWallEditTarget = 'slogan';

export function ProfilePhotoWall({layout, photos, onOpenPhoto, onEdit}: {
 layout: ProfileLayout | null;
 photos: string[];
 onOpenPhoto: (index: number) => void;
 onEdit: (target?: PhotoWallEditTarget) => void;
}) {
 const {t} = useApp();
 const {slogan, captions, featuredPhotos} = readPhotoWall(layout);
 const primary: {url: string; index: number}[] = [];
 const secondary: typeof primary = [];
 photos.forEach((url, index) => {
  const column = featuredPhotos.has(photoWallPhotoKey(url)) ? primary : secondary;
  column.push({url, index});
 });

 const photoCard = ({url, index}: {url: string; index: number}) => {
  const caption = captions.get(photoWallPhotoKey(url))?.trim();
  return <figure className="photo-wall-card" key={`${url}-${index}`}>
   <button type="button" className="photo-wall-image" onClick={() => onOpenPhoto(index)}
    aria-label={t(`查看第 ${index + 1} 张照片`, `View photo ${index + 1}`)} title={caption}>
    <Cover src={url} alt="" />
    {caption && <span className="photo-wall-caption">
     <span className="photo-wall-quote" aria-hidden="true">“</span>
     <span className="photo-wall-caption-text">{caption}</span>
    </span>}
   </button>
  </figure>;
 };

 return <section className="owner-section photo-wall" aria-labelledby="owner-photos-title">
  <div className="photo-wall-header">
   <h2 id="owner-photos-title">{t('我的足迹', 'My footprints')}</h2>
   <button type="button" className="photo-wall-manage" onClick={() => onEdit()}>
    <Pencil size={14} aria-hidden="true" />{t('编辑照片墙', 'Edit photo wall')}
   </button>
  </div>
  <button type="button" className={slogan ? 'photo-wall-slogan' : 'photo-wall-slogan is-empty'}
   onClick={() => onEdit('slogan')} aria-label={t('编辑照片墙标语', 'Edit photo wall slogan')}>
   <span>{slogan || t('用一句话介绍你的照片墙', 'Introduce your photo wall in one line')}</span>
   <Pencil size={14} aria-hidden="true" />
  </button>
  {photos.length ? <div className={`photo-wall-grid${primary.length === 1 && secondary.length > 0 ? ' is-aligned' : ''}`}>
   {primary.length > 0 && <div className={`photo-wall-column photo-wall-primary${primary.length === 1 ? ' is-single' : ''}`}
    role="region" tabIndex={primary.length > 1 ? 0 : undefined} aria-label={t('主照片','Main photos')}>
    {primary.map(photoCard)}
   </div>}
   {secondary.length > 0 && <div className={`photo-wall-column photo-wall-secondary${secondary.length > 1 ? ' has-paired-rows' : ''}`} role="region"
    tabIndex={secondary.length > 1 ? 0 : undefined} aria-label={t('普通照片','Other photos')}>
    {secondary.map(photoCard)}
   </div>}
  </div> : <button type="button" className="photo-wall-upload" onClick={() => onEdit()}>
   <ImagePlus size={24} aria-hidden="true" />{t('添加照片', 'Add photos')}
  </button>}
 </section>;
}
