import type {ProfileBlock, ProfileLayout} from '@ourworld/contracts';
import {createPhotoCaptionId, isLifePuzzleBlock, isPhotoCaption, photoWallPhotoKey, profileGalleryPhotos, readPhotoWall} from './profile-content';

export type PuzzleCrop = {zoom: number; panX: number; panY: number};
export type PuzzlePiece = PuzzleCrop & {id: string; photo: string; title?: string; caption?: string};

export const centeredCrop: PuzzleCrop = {zoom: 1, panX: 0, panY: 0};
const clamp = (value: unknown, min: number, max: number, fallback: number) =>
 typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;

export function readLifePuzzle(layout: ProfileLayout | null): PuzzlePiece[] {
 const blocks = layout?.blocks ?? [];
 const stored = blocks.filter(isLifePuzzleBlock);
 if (stored.length) return stored.flatMap(block => {
  let metadata: Partial<PuzzlePiece>[] = [];
  try {
   const value: unknown = JSON.parse(block.content || '[]');
   if (Array.isArray(value)) metadata = value;
  } catch {
   // Keep the photos even if the optional framing data is unreadable.
  }
  return (block.refs ?? []).map((photo, index) => {
   const tile = metadata[index];
   return {
    id: typeof tile?.id === 'string' ? tile.id : `${block.id}-${index}`,
    photo,
    title: typeof tile?.title === 'string' ? tile.title : undefined,
    caption: typeof tile?.caption === 'string' ? tile.caption : undefined,
    zoom: clamp(tile?.zoom, 1, 3, 1),
    panX: clamp(tile?.panX, -100, 100, 0),
    panY: clamp(tile?.panY, -100, 100, 0),
   };
  });
 });

 const pieces = blocks.flatMap(block => isPhotoCaption(block) && block.refs?.[0]
  ? [{...centeredCrop, id: block.id, photo: block.refs[0], title: block.title, caption: block.content}]
  : []);
 const gallery = profileGalleryPhotos(layout);
 const featured = readPhotoWall(layout).featuredPhotos;
 const used = new Set(pieces.map(piece => photoWallPhotoKey(piece.photo)));
 const available = gallery.filter(photo => !used.has(photoWallPhotoKey(photo)));
 const previousAboutPhoto = available.find(photo => featured.has(photoWallPhotoKey(photo))) ?? available[0];
 if (previousAboutPhoto) pieces.push({...centeredCrop, id: 'previous-about-photo', photo: previousAboutPhoto, title: undefined, caption: undefined});
 return pieces;
}

export function makePuzzlePiece(photo: string): PuzzlePiece {
 return {...centeredCrop, id: createPhotoCaptionId(), photo};
}

export function writeLifePuzzle(layout: ProfileLayout, pieces: PuzzlePiece[]): ProfileLayout | undefined {
 const belongsToPuzzle = (block: ProfileBlock) => isLifePuzzleBlock(block) || isPhotoCaption(block);
 const first = layout.blocks.findIndex(belongsToPuzzle);
 const blocks = layout.blocks.filter(block => !belongsToPuzzle(block));
 const puzzleBlocks: ProfileBlock[] = [];
 let refs: string[] = [];
 let metadata: Omit<PuzzlePiece, 'photo'>[] = [];
 const finishBlock = () => {
  const part = puzzleBlocks.length;
  puzzleBlocks.push({id: part ? `life-puzzle-${part}` : 'life-puzzle', type: 'gallery', span: 2,
   size: 'expanded', refs, content: JSON.stringify(metadata)});
  refs = [];
  metadata = [];
 };
 for (const {photo, ...tile} of pieces) {
  if (JSON.stringify([tile]).length > 10000) return;
  if (refs.length === 50 || JSON.stringify([...metadata, tile]).length > 10000) finishBlock();
  refs.push(photo);
  metadata.push(tile);
 }
 // The empty block distinguishes a deliberately cleared puzzle from a legacy profile.
 if (refs.length || !puzzleBlocks.length) finishBlock();
 if (blocks.length + puzzleBlocks.length > 24) return;
 blocks.splice(first < 0 ? blocks.length : first, 0, ...puzzleBlocks);
 return {...layout, blocks};
}

type Point = [number, number];
type Segment = {from: Point; to: Point; control?: [Point, Point]};
export const tileSize = 300;
const straight = (from: Point, to: Point): Segment => ({from, to});

function tabEdge(x: number, y: number, vertical: boolean, sign: number): Segment[] {
 const point = (along: number, across = 0): Point => vertical ? [x + sign * across, y + along] : [x + along, y + sign * across];
 return [
  straight(point(0), point(105)),
  {from: point(105), control: [point(117), point(113,17)], to: point(109,27)},
  {from: point(109,27), control: [point(100,48), point(122,62)], to: point(150,62)},
  {from: point(150,62), control: [point(178,62), point(200,48)], to: point(191,27)},
  {from: point(191,27), control: [point(187,17), point(183)], to: point(195)},
  straight(point(195), point(tileSize)),
 ];
}

const reversed = (edge: Segment[]) => [...edge].reverse().map(({from, to, control}): Segment =>
 ({from: to, to: from, control: control && [control[1], control[0]]}));

export function pieceOutline(index: number, slots: number) {
 const row = index % 2, col = Math.floor(index / 2);
 const x = col * tileSize, y = row * tileSize;
 const points: Point[] = [[x,y],[x+tileSize,y],[x+tileSize,y+tileSize],[x,y+tileSize]];
 const horizontal = () => tabEdge(x, tileSize, false, [1,-1,1][col % 3]);
 const vertical = (boundary: number) => tabEdge(boundary * tileSize, y, true,
  (row ? [-1,-1,1] : [1,1,-1])[boundary % 3]);
 const edges = [
  row ? horizontal() : [straight(points[0], points[1])],
  index + 2 < slots ? vertical(col + 1) : [straight(points[1], points[2])],
  !row && index + 1 < slots ? reversed(horizontal()) : [straight(points[2], points[3])],
  col ? reversed(vertical(col)) : [straight(points[3], points[0])],
 ];
 return `M ${x} ${y} ${edges.flat().map(({to, control}) => control
  ? `C ${control[0].join(' ')} ${control[1].join(' ')} ${to.join(' ')}`
  : `L ${to.join(' ')}`).join(' ')} Z`;
}
