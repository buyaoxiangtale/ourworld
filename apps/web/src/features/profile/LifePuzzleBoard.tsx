import {useEffect, useId, useRef, useState} from 'react';
import {ChevronLeft, ChevronRight} from 'lucide-react';
import {useApp} from '../../context';
import {IconButton} from '../../ui';
import {pieceOutline, tileSize, type PuzzleCrop, type PuzzlePiece} from './life-puzzle';

const imageBox = 440;
const bound = (value: number) => Math.max(-100, Math.min(100, value));

function PuzzleImage({piece, x, y, tileAspect, dragTravel}: {
 piece: PuzzlePiece; x: number; y: number; tileAspect: number; dragTravel: (x: number, y: number) => void;
}) {
 const [size, setSize] = useState<{width: number; height: number}>();
 useEffect(() => {
  const image = new Image();
  image.onload = () => setSize({width: image.naturalWidth, height: image.naturalHeight});
  image.src = piece.photo;
  return () => { image.onload = null; };
 }, [piece.photo]);
 const scale = size ? imageBox * piece.zoom * Math.max(tileAspect / size.width, 1 / size.height) : piece.zoom;
 const width = size ? size.width * scale / tileAspect : imageBox * scale;
 const height = size ? size.height * scale : imageBox * scale;
 const travelX = Math.max(0, width - imageBox) / 2, travelY = Math.max(0, height - imageBox) / 2;
 useEffect(() => { dragTravel(travelX, travelY); }, [dragTravel, travelX, travelY]);
 return <image href={piece.photo} width={width} height={height}
  x={x + tileSize / 2 - width / 2 + piece.panX / 100 * travelX}
  y={y + tileSize / 2 - height / 2 + piece.panY / 100 * travelY}
  preserveAspectRatio={size ? 'none' : 'xMidYMid slice'}/>;
}

export function LifePuzzleBoard({pieces, selected, select, adjust, visibleColumns = 3, fullBleed = false}: {
 pieces: PuzzlePiece[];
 selected?: number;
 select?: (index: number) => void;
 adjust?: (crop: Partial<PuzzleCrop>) => void;
 visibleColumns?: number;
 fullBleed?: boolean;
}) {
 const {t} = useApp();
 const seed = useId();
 const viewport = useRef<HTMLDivElement>(null);
 const travel = useRef(new Map<string, [number, number]>());
 const drag = useRef<{id: number; x: number; y: number; panX: number; panY: number; moved: boolean} | null>(null);
 const hoverX = useRef<number | null>(null);
 const [position, setPosition] = useState({start: true, end: true});
 const [tileAspect, setTileAspect] = useState(1);
 const slots = pieces.length + Number(Boolean(select));
 const columns = Math.ceil(slots / 2), visible = Math.min(columns, visibleColumns), rows = slots === 1 ? 1 : 2;
 const canScroll = columns > visible;
 const updatePosition = (element: HTMLDivElement) => setPosition({
  start: element.scrollLeft < 1,
  end: element.scrollWidth - element.clientWidth - element.scrollLeft < 1,
 });
 const move = (direction: number) => {
  const element = viewport.current;
  if (!element) return;
  element.scrollBy({left: direction * element.clientWidth / visible,
   behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'});
 };

 useEffect(() => {
  const element = viewport.current;
  if (!element) return;
  const measure = () => {
   if (fullBleed) {
    if (element.clientWidth && element.clientHeight)
     setTileAspect(element.clientWidth * rows / (visible * element.clientHeight));
   } else updatePosition(element);
  };
  measure();
  const observer = new ResizeObserver(measure);
  observer.observe(element);
  const wheel = (event: WheelEvent) => {
   if (event.deltaX || !canScroll) return;
   const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? element.clientWidth : 1);
   const before = element.scrollLeft;
   element.scrollLeft += delta;
   if (element.scrollLeft !== before) event.preventDefault();
  };
  element.addEventListener('wheel', wheel, {passive: false});
  return () => { observer.disconnect(); element.removeEventListener('wheel', wheel); };
 }, [canScroll, slots, rows, visible, fullBleed]);

 useEffect(() => {
  const element = viewport.current;
  if (!element || selected === undefined || !canScroll) return;
  const stride = element.clientWidth / visible, start = Math.floor(selected / 2) * stride;
  if (element.scrollLeft > start) element.scrollLeft = start;
  else if (element.scrollLeft + element.clientWidth < start + stride) element.scrollLeft = start + stride - element.clientWidth;
 }, [selected, slots, canScroll, visible]);

 if (!slots) return null;
 const tiles = Array.from({length: slots}, (_, index) => ({piece: pieces[index], index,
  x: Math.floor(index / 2) * tileSize, y: (index % 2) * tileSize, outline: pieceOutline(index, slots)}));
 return <div className="life-puzzle-board" style={fullBleed ? undefined : {width: `min(100%, ${visible * 120}px)`}}>
  <div ref={viewport} className="life-puzzle-viewport" role="group" aria-label={t('生活拼图','Life puzzle')}
   tabIndex={canScroll ? 0 : undefined} onScroll={fullBleed ? undefined : event=>updatePosition(event.currentTarget)}
   onKeyDown={event=>{
    if (!canScroll || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) return;
    event.preventDefault();move(event.key === 'ArrowLeft' ? -1 : 1);
   }}>
   <svg className="life-puzzle-svg" style={{width: `${columns / visible * 100}%`}}
    viewBox={`0 0 ${columns * tileSize} ${rows * tileSize}`}
    preserveAspectRatio={fullBleed ? 'none' : undefined}
    onPointerEnter={event=>{if(event.pointerType==='mouse')hoverX.current=event.clientX;}}
    onPointerLeave={()=>{hoverX.current=null;}}
    onPointerMove={event=>{
     if(fullBleed||event.pointerType!=='mouse'||!canScroll)return;
     const last=hoverX.current;hoverX.current=event.clientX;
     if(!event.buttons&&selected===undefined&&last!==null&&viewport.current)
      viewport.current.scrollLeft+=last-event.clientX;
    }}>
    <defs>{tiles.map(({outline,index})=><clipPath key={index} id={`${seed}-${index}`}><path d={outline}/></clipPath>)}</defs>
    <g pointerEvents="none">{tiles.map(({piece,index,x,y,outline})=><g key={index}>
     <g clipPath={`url(#${seed}-${index})`}>
      <path d={outline} className="life-puzzle-fill"/>
      {piece ? <PuzzleImage key={piece.photo} piece={piece} x={x} y={y} tileAspect={tileAspect} dragTravel={(dx,dy)=>travel.current.set(piece.id,[dx,dy])}/>
       : <text className="life-puzzle-plus" transform={`translate(${x+tileSize/2} ${y+tileSize/2}) scale(${1/tileAspect} 1)`} dy=".32em" textAnchor="middle">+</text>}
     </g>
    </g>)}</g>
    <g pointerEvents="none">
     {tiles.map(({outline,index})=><path key={index} d={outline} className="life-puzzle-outline"/>)}
     {selected!==undefined&&tiles[selected]&&<path d={tiles[selected].outline} className="life-puzzle-outline is-selected"/>}
    </g>
    {select && <g>{tiles.map(({piece,outline,index})=><path key={index} d={outline} className="life-puzzle-hit"
     role="button" tabIndex={0} aria-pressed={adjust && piece ? selected===index : undefined}
     aria-label={piece ? t(`编辑第 ${index+1} 块拼图`,`Edit piece ${index+1}`) : t('添加拼图照片','Add a puzzle photo')}
     onClick={()=>{const moved=drag.current?.moved;drag.current=null;if(!moved)select(index);}}
     onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();select(index);}}}
     onPointerDown={event=>{
      if (!adjust || !piece || event.pointerType==='touch' || event.button!==0) return;
      if (index!==selected) select(index);
      event.currentTarget.setPointerCapture(event.pointerId);
      drag.current={id:event.pointerId,x:event.clientX,y:event.clientY,panX:piece.panX,panY:piece.panY,moved:false};
     }}
     onPointerMove={event=>{
      const gesture=drag.current;
      if(!gesture || gesture.id!==event.pointerId || !adjust || !piece) return;
      const element=viewport.current;
      const distance=travel.current.get(piece.id);
      if(!element || !distance) return;
      const dx=event.clientX-gesture.x,dy=event.clientY-gesture.y;
      if(!gesture.moved&&Math.abs(dx)+Math.abs(dy)<4)return;
      gesture.moved=true;
      const unitsX=visible*tileSize/element.clientWidth;
      const unitsY=fullBleed ? rows*tileSize/element.clientHeight : unitsX;
      adjust({panX:distance[0] ? bound(gesture.panX+dx*unitsX/distance[0]*100) : 0,
       panY:distance[1] ? bound(gesture.panY+dy*unitsY/distance[1]*100) : 0});
     }}
     onPointerUp={()=>{
      const gesture=drag.current;
      if(gesture)window.setTimeout(()=>{if(drag.current===gesture)drag.current=null;},0);
     }}
     onPointerCancel={()=>{drag.current=null;}}/>)}</g>}
   </svg>
  </div>
  {canScroll && !fullBleed && <div className="life-puzzle-navigation">
   <IconButton label={t('向左浏览拼图','Scroll puzzle left')} disabled={position.start} onClick={()=>move(-1)}><ChevronLeft size={17}/></IconButton>
   <IconButton label={t('向右浏览拼图','Scroll puzzle right')} disabled={position.end} onClick={()=>move(1)}><ChevronRight size={17}/></IconButton>
  </div>}
 </div>;
}
