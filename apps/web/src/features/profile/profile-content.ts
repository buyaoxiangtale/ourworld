import {CURRENCIES,PRICE_UNITS,type ProfileBlock,type ProfileLayout,type User} from '@ourworld/contracts';

// A caption uses the existing gallery contract: one owned image, title and text.
export const PHOTO_CAPTION_ID='photo-caption';
export const isPhotoCaption=(block:ProfileBlock)=>block.type==='gallery'&&(block.id===PHOTO_CAPTION_ID||block.id.startsWith(`${PHOTO_CAPTION_ID}-`));
export const createPhotoCaptionId=()=>`${PHOTO_CAPTION_ID}-${Array.from(crypto.getRandomValues(new Uint8Array(16)),byte=>byte.toString(16).padStart(2,'0')).join('')}`;
export const isLifePuzzleBlock=(block:ProfileBlock)=>block.type==='gallery'&&(block.id==='life-puzzle'||block.id.startsWith('life-puzzle-'));
export const isPhotoGallery=(block:ProfileBlock)=>block.type==='gallery'&&!isPhotoCaption(block)&&!isLifePuzzleBlock(block);
export const profileGalleryPhotos=(layout:ProfileLayout|null)=>[...new Set((layout?.blocks||[]).filter(isPhotoGallery).flatMap(block=>block.refs||[]).filter(Boolean))];

// Gallery content already round-trips through drafts and publications. Keep wall
// captions separate from photo story blocks and key them by the upload, not its order.
const PHOTO_WALL_CONTENT = 'ourworld:photo-wall:1:';
export const photoWallPhotoKey = (ref: string) => ref.match(/\/(?:media|uploads)\/([^/?#]+)/)?.[1] || ref;

export function resolveMainPhotos(photos: readonly string[], selected: ReadonlySet<string>) {
 const keys = photos.map(photoWallPhotoKey);
 const main = new Set(keys.filter(key => selected.has(key)));
 if (!main.size && keys.length) main.add(keys[0]);
 return main;
}

export function readPhotoWall(layout: ProfileLayout | null) {
 let slogan = '';
 const featuredPhotos = new Set<string>();
 const captions = new Map<string, string>();
 for (const block of layout?.blocks.filter(isPhotoGallery) ?? []) {
  const content = block.content;
  if (!content) continue;
  if (!content.startsWith(PHOTO_WALL_CONTENT)) {
   slogan ||= content;
   continue;
  }
  try {
   const parsed = JSON.parse(content.slice(PHOTO_WALL_CONTENT.length));
   if (typeof parsed?.slogan === 'string') slogan ||= parsed.slogan;
   if (Array.isArray(parsed?.featuredPhotos)) {
    for (const key of parsed.featuredPhotos) if (typeof key === 'string') featuredPhotos.add(key);
   } else if (typeof parsed?.featuredPhoto === 'string') {
    featuredPhotos.add(parsed.featuredPhoto);
   }
   if (!Array.isArray(parsed?.captions)) continue;
   for (const pair of parsed.captions) {
    if (Array.isArray(pair) && typeof pair[0] === 'string' && typeof pair[1] === 'string') {
     captions.set(pair[0], pair[1]);
    }
   }
  } catch {
   slogan ||= content;
  }
 }
 return {slogan, captions, featuredPhotos: resolveMainPhotos(profileGalleryPhotos(layout), featuredPhotos)};
}

export function writePhotoWall(slogan: string, photos: string[], captions: ReadonlyMap<string, string>, featured: ReadonlySet<string>) {
 const keys = photos.map(photoWallPhotoKey);
 const entries = keys.flatMap(key => {
  const caption = captions.get(key)?.trim();
  return caption ? [[key, caption]] : [];
 });
 const featuredPhotos = [...new Set(keys.filter(key => featured.has(key)))];
 if (!featuredPhotos.length && !entries.length && !slogan.startsWith(PHOTO_WALL_CONTENT)) return slogan || undefined;
 return PHOTO_WALL_CONTENT + JSON.stringify({slogan, captions: entries, featuredPhotos});
}

/** Optional profile cards never determine whether personal details are complete. */
export function missingProfileDetails(user:User):('name'|'price')[]{
 const missing:('name'|'price')[]=[];
 if(!user.name.trim())missing.push('name');
 const range=user.priceRange;
 if(!range||!Number.isFinite(range.min)||!Number.isFinite(range.max)||range.min<0||range.max<range.min||range.max>1000000||!CURRENCIES.includes(range.currency)||!PRICE_UNITS.includes(range.unit))missing.push('price');
 return missing;
}
