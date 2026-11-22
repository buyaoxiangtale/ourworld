import {CURRENCIES,PRICE_UNITS,type ProfileBlock,type ProfileLayout,type User} from '@ourworld/contracts';

// A caption uses the existing gallery contract: one owned image, title and text.
export const PHOTO_CAPTION_ID='photo-caption';
export const isPhotoCaption=(block:ProfileBlock)=>block.type==='gallery'&&(block.id===PHOTO_CAPTION_ID||block.id.startsWith(`${PHOTO_CAPTION_ID}-`));
export const createPhotoCaptionId=()=>`${PHOTO_CAPTION_ID}-${Array.from(crypto.getRandomValues(new Uint8Array(16)),byte=>byte.toString(16).padStart(2,'0')).join('')}`;
export const isPhotoGallery=(block:ProfileBlock)=>block.type==='gallery'&&!isPhotoCaption(block);
export const profileGalleryPhotos=(layout:ProfileLayout|null)=>[...new Set((layout?.blocks||[]).filter(isPhotoGallery).flatMap(block=>block.refs||[]).filter(Boolean))];

/** Optional profile cards never determine whether personal details are complete. */
export function missingProfileDetails(user:User):('name'|'price')[]{
 const missing:('name'|'price')[]=[];
 if(!user.name.trim())missing.push('name');
 const range=user.priceRange;
 if(!range||!Number.isFinite(range.min)||!Number.isFinite(range.max)||range.min<0||range.max<range.min||range.max>1000000||!CURRENCIES.includes(range.currency)||!PRICE_UNITS.includes(range.unit))missing.push('price');
 return missing;
}
