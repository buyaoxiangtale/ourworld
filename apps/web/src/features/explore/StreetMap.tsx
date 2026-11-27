import {useEffect,useRef,useState} from 'react';
import {ArrowLeft} from 'lucide-react';
import type {Map as MapLibreMap} from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import {useApp} from '../../context';
import {useDialogFocus} from '../../useDialogFocus';
import './street-map.css';

export type StreetMapView={lat:number;lng:number;zoom:number;name?:string};

export function StreetMap({view,onClose}:{view:StreetMapView;onClose:()=>void}){
 const {t}=useApp();
 const focus=useDialogFocus(onClose);
 const container=useRef<HTMLDivElement>(null);
 const [status,setStatus]=useState<'loading'|'ready'|'unavailable'>('loading');
 const [attempt,setAttempt]=useState(0);
 const {lat,lng,zoom}=view;
 useEffect(()=>{
  const element=container.current;
  if(!element)return;
  let disposed=false;
  let map:MapLibreMap|undefined;
  let removeRaster:(()=>void)|undefined;
  let fallbackStarted=false;
  let deadline:number;
  const latitude=Math.max(-85,Math.min(85,lat));
  const ready=()=>{window.clearTimeout(deadline);setStatus('ready');};
  const fallback=()=>{
   if(disposed||fallbackStarted)return;
   fallbackStarted=true;
   const center=map?.getCenter();
   const rasterZoom=Math.min(19,Math.round((map?.getZoom()??zoom)+1));
   map?.remove();
   map=undefined;
   window.clearTimeout(deadline);
   setStatus('loading');
   deadline=window.setTimeout(()=>setStatus('unavailable'),10000);
   void Promise.all([import('leaflet'),import('leaflet/dist/leaflet.css')]).then(([L])=>{
    if(disposed)return;
    const raster=L.map(element,{minZoom:3,maxZoom:19,attributionControl:true})
     .setView([center?.lat??latitude,center?.lng??lng],rasterZoom);
    removeRaster=()=>raster.remove();
    raster.attributionControl?.setPrefix(false);
    L.control.scale({imperial:false}).addTo(raster);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{
     maxZoom:19,attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).once('tileload',ready).addTo(raster);
   }).catch(()=>{if(!disposed){window.clearTimeout(deadline);setStatus('unavailable');}});
  };
  deadline=window.setTimeout(fallback,8000);
  void Promise.all([import('maplibre-gl'),import('maplibre-gl/dist/maplibre-gl.css')]).then(([{Map,NavigationControl,ScaleControl,setWorkerUrl}])=>{
   if(disposed||fallbackStarted)return;
   setWorkerUrl(workerUrl);
   map=new Map({
    container:element,
    style:'https://tiles.openfreemap.org/styles/bright',
    center:[lng,latitude],
    zoom,minZoom:3,maxZoom:19,maxPitch:0,dragRotate:false,
    attributionControl:{compact:true},
   });
   map.touchZoomRotate.disableRotation();
   map.addControl(new NavigationControl({showCompass:false}),'top-right');
   map.addControl(new ScaleControl({unit:'metric'}),'bottom-left');
   map.on('sourcedata',event=>{
    if(event.sourceId==='openmaptiles'&&event.coord&&event.tile?.state==='loaded')ready();
   });
   map.on('webglcontextlost',fallback);
  }).catch(fallback);
  return()=>{disposed=true;window.clearTimeout(deadline);map?.remove();removeRaster?.();};
 },[lat,lng,zoom,attempt]);
 return <section ref={focus} className="street-map-page" role="dialog" aria-modal="true" aria-label={t('街道地图','Street map')}>
  <header className="street-map-header">
   <button type="button" onClick={onClose}><ArrowLeft size={18}/>{t('返回','Back')}</button>
   <h2>{view.name||t('街道地图','Street map')}</h2>
  </header>
  <div className="street-map-body">
   <div ref={container} className="street-map-canvas"/>
   {status!=='ready'&&<p className="street-map-status" role="status">{status==='loading'?t('正在加载街道地图','Loading street map'):t('暂时无法加载街道地图','Street map is temporarily unavailable')}{status==='unavailable'&&<button type="button" onClick={()=>{setStatus('loading');setAttempt(n=>n+1);}}>{t('重试','Retry')}</button>}</p>}
  </div>
 </section>;
}
