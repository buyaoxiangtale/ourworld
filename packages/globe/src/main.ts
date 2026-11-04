import Globe from 'globe.gl';
import { geoCentroid, geoContains, geoDistance } from 'd3-geo';
import { ACESFilmicToneMapping, SRGBColorSpace } from 'three';
import { createEarthAppearance } from './earth-material';
import { theme } from './theme';
import { countries } from './atlas';
import type { Feature, Geometry } from 'geojson';
import type { Place, GlobeCommand, GlobeEvent } from '@ourworld/contracts';

declare global { interface Window { OurworldGlobe:{receive:(command:GlobeCommand)=>void}; AndroidBridge?:{postMessage:(value:string)=>void}; AndroidGlobe?:{postMessage:(value:string)=>void}; webkit?:{messageHandlers?:{ourworldGlobe?:{postMessage:(value:unknown)=>void};globe?:{postMessage:(value:unknown)=>void}}} } }

const host=document.getElementById('globe')!;
let places:Place[]=[];
let favorites=new Set<string>();
let active=true;
let untouched=true;
let cameraTimer:number|undefined;
// Markers sit above the country plates so the cobalt layer never hides a city pin.
const cityMarkerAltitude=.02;
const emit=(event:GlobeEvent['event'],data:Record<string,unknown>)=>{
  const message:GlobeEvent={bridgeVersion:1,event,data};
  if(window.parent!==window) window.parent.postMessage(message,window.location.origin==='null'?'*':window.location.origin);
  window.AndroidBridge?.postMessage(JSON.stringify(message));
  window.AndroidGlobe?.postMessage(JSON.stringify(message));
  window.webkit?.messageHandlers?.ourworldGlobe?.postMessage(message);
  window.webkit?.messageHandlers?.globe?.postMessage(message);
};
const clean=(s:string)=>s.toLowerCase().replace(/[^a-z]/g,'').replace('unitedstatesofamerica','unitedstates').replace('russianfederation','russia');
// Country plates derive from the shared focus tokens; the selected stroke lifts toward
// white so it stays readable against the brightened selected cap.
const rgba=(hex:string,alpha:number)=>{const n=parseInt(hex.slice(1),16);return `rgba(${(n>>16)&255},${(n>>8)&255},${n&255},${alpha})`;};
const towardWhite=(hex:string,amount:number)=>{const n=parseInt(hex.slice(1),16);const c=[0,1,2].map(i=>{const v=(n>>((2-i)*8))&255;return Math.round(v*(1-amount)+255*amount);});return `${c[0]},${c[1]},${c[2]}`;};
const plateCap={selected:rgba(theme.focus,.45),base:rgba(theme.focusDeep,.30)};
const plateSide={selected:rgba(theme.focus,.25),base:rgba(theme.focusDeep,.10)};
const plateStroke={selected:`rgba(${towardWhite(theme.focus,.55)},.70)`,base:rgba(theme.focus,.50)};

async function mount(){
  document.documentElement.style.background=theme.bg;
  document.body.style.background=theme.bg;
  document.getElementById('fallback')!.style.background=theme.bg;
  const appearance=await createEarthAppearance(countries);
  const globe=new Globe(host,{animateIn:false})
    .backgroundColor('rgba(0,0,0,0)')
    .globeCurvatureResolution(1.8).showAtmosphere(false)
    .pointsMerge(false).pointAltitude(cityMarkerAltitude).pointRadius((d:object)=>favorites.has((d as Place).id)?.62:.28)
    .pointColor((d:object)=>favorites.has((d as Place).id)?theme.accent:theme.inkMuted)
    .pointLat((d:object)=>(d as Place).lat).pointLng((d:object)=>(d as Place).lng)
    .pointLabel((d:object)=>{const p=d as Place;return p.name.en||p.name.zh;});
  // Country plates: the translucent cobalt layer from the reference design. Selection
  // lifts the plate instead of drawing an outline, so the hit area, the fill and the
  // side wall all change together.
  const BASE_ALTITUDE=.004, SELECTED_ALTITUDE=.014;
  let selectedCountryId:string|undefined;
  const isSelected=(d:object)=>selectedCountryId!==undefined&&String((d as Feature).id??'')===selectedCountryId;
  const paintCountries=()=>globe.polygonsData(countries.features)
    .polygonAltitude((d:object)=>isSelected(d)?SELECTED_ALTITUDE:BASE_ALTITUDE)
    .polygonCapColor((d:object)=>isSelected(d)?plateCap.selected:plateCap.base)
    .polygonSideColor((d:object)=>isSelected(d)?plateSide.selected:plateSide.base)
    .polygonStrokeColor((d:object)=>isSelected(d)?plateStroke.selected:plateStroke.base)
    .polygonsTransitionDuration(0);
  paintCountries();
  const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
  const controls=globe.controls();
  controls.autoRotate=!reducedMotion.matches;controls.enablePan=false;controls.minDistance=120;controls.maxDistance=800;controls.rotateSpeed=.7;controls.zoomSpeed=.7;controls.enableDamping=true;controls.dampingFactor=.08;
  const spinToggle=document.getElementById('spin-toggle');
  const pauseIcon=document.getElementById('spin-pause-icon');
  const playIcon=document.getElementById('spin-play-icon');
  // The reference design keeps the globe turning while the Earth tab is open, so the
  // render loop runs continuously here instead of waking for short bursts. It still
  // stops when the tab is hidden, when another tab is active, or on reduced motion.
  let spin=!reducedMotion.matches;
  let idleTimer:number|undefined;
  const paintSpin=()=>{
    if(pauseIcon&&playIcon){pauseIcon.style.display=spin?'':'none';playIcon.style.display=spin?'none':'';}
    if(spinToggle)spinToggle.setAttribute('aria-label',spin?'Pause rotation':'Resume rotation');
  };
  const syncAnimation=()=>{
    controls.autoRotate=spin&&!reducedMotion.matches;
    if(active&&!document.hidden)globe.resumeAnimation();
    else globe.pauseAnimation();
  };
  const wake=(duration=350)=>{
    if(!active||document.hidden)return;
    clearTimeout(idleTimer);globe.resumeAnimation();
    if(!spin)idleTimer=window.setTimeout(()=>globe.pauseAnimation(),duration);
  };
  const stopSpin=()=>{if(!spin)return;spin=false;controls.autoRotate=false;paintSpin();};
  spinToggle?.addEventListener('click',()=>{spin=!spin;controls.autoRotate=spin&&!reducedMotion.matches;paintSpin();wake(600);});
  paintSpin();
  reducedMotion.addEventListener('change',event=>{controls.autoRotate=!event.matches&&spin;});
  globe.lights(appearance.lights);
  globe.scene().add(appearance.atmosphere);
  const highlight=(place?:Place,geoId?:string)=>{
    const country=place?.kind==='country'?place:places.find(p=>p.kind==='country'&&(p.id===place?.parentId||p.name.en===place?.country));
    const polygon=countries.features.find(p=>geoId?String(p.id)===geoId:country&&(clean(String(p.properties?.name||''))===clean(country.name.en)||(country.aliases||[]).some(a=>clean(a)===clean(String(p.properties?.name||'')))));
    selectedCountryId=polygon&&polygon.id!=null?String(polygon.id):undefined;
    paintCountries();
  };
  globe.renderer().setPixelRatio(Math.min(window.devicePixelRatio||1,1.7));
  globe.renderer().toneMapping=ACESFilmicToneMapping;
  globe.renderer().toneMappingExposure=1.0;
  globe.renderer().outputColorSpace=SRGBColorSpace;
  appearance.configureTextures(globe.renderer().capabilities.getMaxAnisotropy());
  const resize=()=>{const width=host.clientWidth||innerWidth;const height=host.clientHeight||innerHeight;globe.width(width).height(height);if(untouched){const fov=Number((globe.camera() as unknown as {fov:number}).fov)||50;const angle=Math.atan((Math.min(width,height)*.88/height)*Math.tan(fov*Math.PI/360));globe.pointOfView({lat:22,lng:85,altitude:1/Math.sin(angle)-1},0);}};
  window.addEventListener('resize',()=>{resize();wake();});resize();
  let focusTimer:number|undefined;
  let pendingFocus:{lat:number;lng:number;altitude:number}|undefined;
  const finishFocus=()=>{
    if(!pendingFocus)return;
    clearTimeout(focusTimer);globe.pointOfView(pendingFocus,0);pendingFocus=undefined;
    globe.renderer().render(globe.scene(),globe.camera());
    emit('cameraChanged',{...globe.pointOfView()});
  };
  const focusCamera=(pov:{lat:number;lng:number;altitude:number})=>{
    clearTimeout(focusTimer);pendingFocus=pov;
    if(!active||reducedMotion.matches){finishFocus();return;}
    wake(1000);globe.pointOfView(pov,850);
    focusTimer=window.setTimeout(()=>{pendingFocus=undefined;emit('cameraChanged',{...globe.pointOfView()});},880);
  };
  let lastSelectionAt=0;
  const selectPlace=(place:Place)=>{if(!active)return;lastSelectionAt=performance.now();untouched=false;stopSpin();highlight(place);focusCamera({lat:place.lat,lng:place.lng,altitude:place.kind==='country'?1.15:.65});emit('placeSelected',{place});};
  const chooseCountry=(polygon:Feature<Geometry>)=>{
    const name=String(polygon.properties?.name||'');
    const known=places.find(p=>p.kind==='country'&&(clean(p.name.en)===clean(name)||(p.aliases||[]).some(a=>clean(a)===clean(name))));
    const [lng,lat]=geoCentroid(polygon);
    highlight(known,String(polygon.id??''));
    wake(1000);
    if(known){focusCamera({lat:known.lat,lng:known.lng,altitude:1.1});emit('placeSelected',{place:known});}
    else{focusCamera({lat,lng,altitude:1.1});emit('placeSelected',{geoId:String(polygon.id??''),geoName:name,lat,lng});}
  };
  const selectCountry=({lat:hitLat,lng:hitLng}:{lat:number;lng:number})=>{
    if(!active)return;
    const polygon=countries.features.find(p=>geoContains(p,[hitLng,hitLat]));
    if(!polygon)return;
    lastSelectionAt=performance.now();untouched=false;stopSpin();
    chooseCountry(polygon);
  };
  globe.onPointClick((d:object)=>selectPlace(d as Place));
  // Polygons sit above the globe mesh, so land taps arrive here; ocean taps fall through
  // to the pointer handler below, which resolves the same polygon from the tap position.
  globe.onPolygonClick((polygon:object)=>{
    if(!active)return;
    lastSelectionAt=performance.now();untouched=false;stopSpin();
    chooseCountry(polygon as Feature<Geometry>);
  });
  // A touch can finish between animation frames, before the library's hover hit is refreshed.
  // Resolve only stationary taps directly from the current camera; dragging/pinching never selects.
  let tap:{id:number;x:number;y:number}|null=null;
  const pointers=new Set<number>();
  host.addEventListener('pointerdown',event=>{if(!active)return;pointers.add(event.pointerId);tap=pointers.size===1?{id:event.pointerId,x:event.clientX,y:event.clientY}:null;},{capture:true});
  host.addEventListener('pointermove',event=>{if(tap&&Math.hypot(event.clientX-tap.x,event.clientY-tap.y)>7)tap=null;},{capture:true});
  host.addEventListener('pointercancel',event=>{pointers.delete(event.pointerId);tap=null;},{capture:true});
  host.addEventListener('pointerup',event=>{
    pointers.delete(event.pointerId);const pressed=tap;tap=null;
    if(!pressed||pressed.id!==event.pointerId||Math.hypot(event.clientX-pressed.x,event.clientY-pressed.y)>7)return;
    const rect=host.getBoundingClientRect();const x=event.clientX-rect.left,y=event.clientY-rect.top;
    const coords=globe.toGlobeCoords(x,y);if(!coords)return;
    const releasedAt=performance.now();
    window.setTimeout(()=>{
      if(lastSelectionAt>=releasedAt-5)return;
      const nearby=places.filter(p=>p.kind==='city'&&geoDistance([p.lng,p.lat],[coords.lng,coords.lat])<.12).map(place=>({place,point:globe.getScreenCoords(place.lat,place.lng,cityMarkerAltitude)})).map(item=>({...item,distance:Math.hypot(item.point.x-x,item.point.y-y)})).filter(item=>item.distance<11).sort((a,b)=>a.distance-b.distance)[0];
      if(nearby)selectPlace(nearby.place);else selectCountry(coords);
    },70);
  },{capture:true});
  controls.addEventListener('start',()=>{untouched=false;stopSpin();clearTimeout(focusTimer);pendingFocus=undefined;clearTimeout(idleTimer);if(active)globe.resumeAnimation();});
  controls.addEventListener('end',()=>{wake(450);clearTimeout(cameraTimer);cameraTimer=window.setTimeout(()=>{emit('cameraChanged',{...globe.pointOfView()});},400);});
  const update=()=>globe.pointsData(places.filter(p=>p.kind==='city'));
  const receive=(command:GlobeCommand)=>{
    if(!command||command.bridgeVersion!==1||!command.data)return;
    const d=command.data;
    if(command.event==='setMarkers'){
      if(Array.isArray(d.places))places=(d.places as Place[]).filter(p=>p&&typeof p.id==='string'&&Number.isFinite(p.lat)&&Number.isFinite(p.lng));
      if(Array.isArray(d.favoriteIds))favorites=new Set((d.favoriteIds as unknown[]).filter((id):id is string=>typeof id==='string'));
      update();
      wake();
    }
    if(command.event==='focusPlace'){
      const p=d.place as Place|undefined;if(p&&Number.isFinite(p.lat)&&Number.isFinite(p.lng)){untouched=false;stopSpin();highlight(p);focusCamera({lat:p.lat,lng:p.lng,altitude:p.kind==='country'?1.15:.65});}
    }
    if(command.event==='restoreCamera'&&Number.isFinite(d.lat)&&Number.isFinite(d.lng)&&Number.isFinite(d.altitude)){untouched=false;clearTimeout(focusTimer);pendingFocus=undefined;wake();globe.pointOfView({lat:Number(d.lat),lng:Number(d.lng),altitude:Number(d.altitude)},0);}
    if(command.event==='setActive'){active=d.active!==false;controls.enabled=active;if(active){syncAnimation();wake();}else{finishFocus();tap=null;pointers.clear();clearTimeout(idleTimer);globe.pauseAnimation();}}
    if(command.event==='setTheme')document.documentElement.dataset.theme=String(d.theme||'ocean');
  };
  window.OurworldGlobe={receive};
  window.addEventListener('message',e=>{if(e.source===window.parent&&(e.origin===window.location.origin||e.origin==='null'))receive(e.data);});
  document.addEventListener('visibilitychange',()=>{document.hidden?globe.pauseAnimation():wake();});
  globe.onGlobeReady(()=>{
    // Set the material after globe.gl's first default-property update so it cannot clear bumpMap.
    globe.globeMaterial(appearance.earth);resize();
    wake(600);
    document.getElementById('boot')?.classList.add('done');
    requestAnimationFrame(()=>requestAnimationFrame(()=>emit('rendererReady',{version:1,style:'deep-sea',borders:true,texturesReady:true,textureCount:2,loadedTextureCount:1,lighting:'uniform-view-relative',clouds:false,dayNight:false})));
  });
}
void mount().catch(error=>{
  document.getElementById('boot')?.classList.add('done');
  document.getElementById('fallback')!.style.display='block';emit('rendererError',{message:error instanceof Error?error.message:'WebGL unavailable'});
});
