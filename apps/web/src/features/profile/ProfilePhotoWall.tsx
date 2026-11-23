import {ImagePlus, Pencil} from 'lucide-react';
import type {ProfileLayout} from '@ourworld/contracts';
import {useApp} from '../../context';
import {Cover} from '../../ui';
import {photoWallPhotoKey, readPhotoWall} from './profile-content';

export type PhotoWallEditTarget = 'slogan' | {photo: string};

export function ProfilePhotoWall({layout, photos, onOpenPhoto, onEdit}: {
 layout: ProfileLayout | null;
 photos: string[];
 onOpenPhoto: (index: number) => void;
 onEdit: (target?: PhotoWallEditTarget) => void;
}) {
 const {t} = useApp();
 const {slogan, captions, featuredPhoto} = readPhotoWall(layout);
 const featuredIndex = Math.max(0, photos.findIndex(url => photoWallPhotoKey(url) === featuredPhoto));
 const featured = photos[featuredIndex];
 const otherPhotos = photos.map((url, index) => ({url, index})).filter(photo => photo.index !== featuredIndex);
 const photoCard = (url: string, index: number) => {
  const caption = captions.get(photoWallPhotoKey(url));
  return <figure className="photo-wall-card" key={url}>
   <button type="button" className="photo-wall-image" onClick={() => onOpenPhoto(index)}
    aria-label={t(`查看第 ${index + 1} 张照片`, `View photo ${index + 1}`)}>
    <Cover src={url} alt="" />
   </button>
   <figcaption>
    <button type="button" className={caption ? 'photo-wall-caption' : 'photo-wall-caption is-empty'}
     onClick={() => onEdit({photo: url})} title={caption}
     aria-label={t(`编辑第 ${index + 1} 张照片的介绍`, `Edit caption for photo ${index + 1}`)}>
     <span>{caption || t('添加介绍', 'Add a caption')}</span><Pencil size={12} aria-hidden="true" />
    </button>
   </figcaption>
  </figure>;
 };

 return <section className="owner-section photo-wall" aria-labelledby="owner-photos-title">
  <div className="photo-wall-header">
   <h2 id="owner-photos-title">{t('我的照片', 'My photos')}</h2>
   <button type="button" className="photo-wall-manage" onClick={() => onEdit()}>
    <Pencil size={14} aria-hidden="true" />{t('编辑照片墙', 'Edit photo wall')}
   </button>
  </div>
  <button type="button" className={slogan ? 'photo-wall-slogan' : 'photo-wall-slogan is-empty'}
   onClick={() => onEdit('slogan')} aria-label={t('编辑照片墙标语', 'Edit photo wall slogan')}>
   <span>{slogan || t('用一句话介绍你的照片墙', 'Introduce your photo wall in one line')}</span>
   <Pencil size={14} aria-hidden="true" />
  </button>
  {featured ? <div className={`photo-wall-grid photo-wall-grid-${Math.min(photos.length, 3)}`}>
   <div className="photo-wall-feature">{photoCard(featured, featuredIndex)}</div>
   {otherPhotos.length > 1 && <div className="photo-wall-column photo-wall-left">
    {otherPhotos.map(({url, index}, i) => i % 2 === 0 && photoCard(url, index))}
   </div>}
   {otherPhotos.length > 0 && <div className="photo-wall-column photo-wall-right">
    {otherPhotos.map(({url, index}, i) => (otherPhotos.length === 1 || i % 2 === 1) && photoCard(url, index))}
   </div>}
  </div> : <button type="button" className="photo-wall-upload" onClick={() => onEdit()}>
   <ImagePlus size={24} aria-hidden="true" />{t('添加照片', 'Add photos')}
  </button>}
 </section>;
}
