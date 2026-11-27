import Globe from 'globe.gl';
import { geoArea, geoCentroid, geoContains } from 'd3-geo';
import { DoubleSide, MeshBasicMaterial, NoToneMapping, SRGBColorSpace, type PerspectiveCamera } from 'three';
import { createEarthAppearance } from './earth-material';
import { theme } from './theme';
import { countries } from './atlas';
import type { Feature, Geometry } from 'geojson';
import type { Place, GlobeCommand, GlobeEvent } from '@ourworld/contracts';

declare global { interface Window { OurworldGlobe:{receive:(command:GlobeCommand)=>void;readonly ready:boolean}; AndroidBridge?:{postMessage:(value:string)=>void}; AndroidGlobe?:{postMessage:(value:string)=>void}; webkit?:{messageHandlers?:{ourworldGlobe?:{postMessage:(value:unknown)=>void};globe?:{postMessage:(value:unknown)=>void}}} } }

const host=document.getElementById('globe')!;
let places:Place[]=[];
let active=true;
let untouched=true;
let cameraTimer:number|undefined;
// The search pin sits above the highlighted country plate.
const countryMarkerAltitude=.02;
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
const plateCap={
  // The opaque Earth already hides the far side. Avoid a second draw for each translucent cap.
  selected:new MeshBasicMaterial({color:theme.focus,opacity:.45,transparent:true,side:DoubleSide,forceSinglePass:true}),
  base:new MeshBasicMaterial({color:theme.focusDeep,opacity:.12,transparent:true,side:DoubleSide,forceSinglePass:true}),
};
const plateSide={selected:rgba(theme.focus,.25),base:rgba(theme.focusDeep,.10)};
const plateStroke={selected:`rgba(${towardWhite(theme.focus,.55)},.70)`,base:rgba(theme.focus,.32)};

// Starlight backdrop: a deterministic deep-space canvas plus a few CSS-twinkling
// stars, painted before the globe mounts so the launch moment is already starlit.
const paintStars=()=>{
  const canvas=document.getElementById('stars') as HTMLCanvasElement|null;
  if(!canvas)return;
  const dpr=Math.min(window.devicePixelRatio||1,2);
  const width=window.innerWidth,height=window.innerHeight;
  canvas.width=Math.floor(width*dpr);canvas.height=Math.floor(height*dpr);
  canvas.style.width=`${width}px`;canvas.style.height=`${height}px`;
  const context=canvas.getContext('2d');if(!context)return;
  context.setTransform(dpr,0,0,dpr,0,0);
  const sky=context.createLinearGradient(0,0,0,height);
  sky.addColorStop(0,theme.space);sky.addColorStop(.55,theme.nebula);sky.addColorStop(1,theme.space);
  context.fillStyle=sky;context.fillRect(0,0,width,height);
  let seed=20261106;
  const next=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  const count=Math.max(90,Math.round(width*height/6500));
  context.fillStyle=theme.starSoft;
  for(let i=0;i<count;i++){const r=next()<.12?1.6:next()<.5?1.1:.7;context.globalAlpha=.22+next()*.55;context.beginPath();context.arc(next()*width,next()*height,r,0,7);context.fill();}
  const bright=Math.round(count*.08);
  context.fillStyle=theme.starBright;
  for(let i=0;i<bright;i++){const x=next()*width,y=next()*height;context.globalAlpha=.85;context.beginPath();context.arc(x,y,1.7,0,7);context.fill();context.globalAlpha=.25;context.fillRect(x-4,y-.4,8,.8);context.fillRect(x-.4,y-4,.8,8);}
  context.globalAlpha=1;
  const twinkle=document.getElementById('twinkle');
  if(twinkle&&!twinkle.childElementCount){for(let i=0;i<26;i++){const star=document.createElement('i');star.style.left=`${next()*100}%`;star.style.top=`${next()*100}%`;star.style.animationDelay=`${next()*5}s`;twinkle.appendChild(star);}}
};
// While the globe is inactive the twinkle layer is removed from composition
// entirely so a frozen frame stays byte-identical.
const setTwinkleVisible=(visible:boolean)=>{const twinkle=document.getElementById('twinkle');if(twinkle)twinkle.style.display=visible?'':'none';};
paintStars();

async function mount(){
  document.documentElement.style.background=theme.space;
  document.body.style.background=theme.space;
  document.getElementById('fallback')!.style.background=theme.space;
  const appearance=createEarthAppearance();
  let locatedPlace:Place|undefined;
  let cityLabelLocale:'zh'|'en'='en';
  let streetMapEnabled=false;
  let gestureAltitude:number|undefined;
  const globe=new Globe(host,{animateIn:false})
    .backgroundColor('rgba(0,0,0,0)')
    .enablePointerInteraction(false)
    .globeImageUrl(new URL('textures/earth-day.jpg?v=4k',document.baseURI).href)
    .bumpImageUrl(new URL('textures/earth-topology.png',document.baseURI).href)
    .showAtmosphere(true).atmosphereColor(theme.atmosphere).atmosphereAltitude(.22)
    .globeCurvatureResolution(1.8)
    .pointsMerge(false).pointAltitude(countryMarkerAltitude).pointRadius(.85).pointColor(theme.accent)
    .pointLat((d:object)=>(d as Place).lat).pointLng((d:object)=>(d as Place).lng)
    .pointLabel((d:object)=>{const p=d as Place;return p.name.en||p.name.zh;})
    .htmlAltitude(countryMarkerAltitude).htmlTransitionDuration(0)
    .htmlElement((d:object)=>{
      const city=d as Place;
      const anchor=document.createElement('div');
      anchor.className='city-marker-anchor';
      const button=document.createElement('button');
      button.type='button';
      button.className='city-marker';
      button.textContent=city.name[cityLabelLocale]||city.name.en;
      button.addEventListener('pointerdown',event=>event.stopPropagation());
      button.addEventListener('click',()=>{
        const place=places.find(place=>place.id===city.id);
        if(active&&place)emit('placeSelected',{place});
      });
      anchor.append(button);
      return anchor;
    });
  // Country plates: the translucent cobalt layer from the reference design. Selection
  // lifts the plate instead of drawing an outline, so the hit area, the fill and the
  // side wall all change together.
  const BASE_ALTITUDE=.004, SELECTED_ALTITUDE=.014;
  let selectedCountryId:string|undefined;
  let focusedCountryId:string|undefined;
  let focusedCatalogCountryId:string|undefined;
  let focusedLocalPlace=false;
  let focusTimer:number|undefined;
  let pendingFocus:{lat:number;lng:number;altitude:number}|undefined;
  let mapDetail:ReturnType<typeof import('./map-detail').createMapDetail>|undefined;
  let loadingMapDetail=false;
  let showingMapDetail=false;
  const isSelected=(d:object)=>selectedCountryId!==undefined&&String((d as Feature).id??'')===selectedCountryId;
  const paintCountries=()=>globe.polygonsData(countries.features)
    .polygonAltitude((d:object)=>isSelected(d)&&!showingMapDetail?SELECTED_ALTITUDE:BASE_ALTITUDE)
    .polygonCapMaterial((d:object)=>isSelected(d)?plateCap.selected:plateCap.base)
    .polygonSideColor((d:object)=>isSelected(d)?plateSide.selected:plateSide.base)
    .polygonStrokeColor((d:object)=>showingMapDetail?null:isSelected(d)?plateStroke.selected:plateStroke.base)
    .polygonsTransitionDuration(0);
  paintCountries();
  const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
  const controls=globe.controls();
  controls.enablePan=false;controls.minDistance=120;controls.maxDistance=800;controls.rotateSpeed=.7;controls.zoomSpeed=.7;controls.dampingFactor=.08;controls.autoRotateSpeed=.9;
  let contextLost=false,texturesReady=false;
  let recoveryTimer:number|undefined;
  let hoverPointer=false;
  const syncHover=()=>{
    const enabled=hoverPointer&&active&&!document.hidden&&!contextLost;
    if(globe.enablePointerInteraction()!==enabled)globe.enablePointerInteraction(enabled);
  };
  // City and country taps are resolved on pointerup below. Only hover needs raycasts between taps.
  host.addEventListener('pointerenter',event=>{hoverPointer=event.pointerType!=='touch';syncHover();});
  host.addEventListener('pointerleave',()=>{hoverPointer=false;syncHover();});
  const syncAnimation=()=>{
    const locked=focusedCountryId!==undefined||focusedLocalPlace;
    controls.enableDamping=!locked;
    controls.autoRotate=!locked&&!pendingFocus&&!reducedMotion.matches;
    syncHover();
    if(active&&!document.hidden&&!contextLost)globe.resumeAnimation();
    else globe.pauseAnimation();
  };
  syncAnimation();
  reducedMotion.addEventListener('change',syncAnimation);
  globe.lights(appearance.lights);
  appearance.attachTo(globe.scene(),globe.camera() as PerspectiveCamera);
  const highlight=(place?:Place,geoId?:string)=>{
    const country=place?.kind==='country'?place:places.find(p=>p.kind==='country'&&(p.id===place?.parentId||p.name.en===place?.country));
    const polygon=countries.features.find(p=>geoId?String(p.id)===geoId:country&&(clean(String(p.properties?.name||''))===clean(country.name.en)||(country.aliases||[]).some(a=>clean(a)===clean(String(p.properties?.name||'')))));
    selectedCountryId=polygon&&polygon.id!=null?String(polygon.id):undefined;
    paintCountries();
    return polygon;
  };
  const configureRenderer=()=>{
    globe.renderer().toneMapping=NoToneMapping;
    globe.renderer().toneMappingExposure=1.0;
    globe.renderer().outputColorSpace=SRGBColorSpace;
  };
  configureRenderer();
  // A resize or restored WebGL context clears the drawing buffer even when the
  // animation loop is paused. Paint again after globe.gl's deferred size update.
  let repaintRequest:number|undefined;
  const repaint=()=>{
    if(repaintRequest!==undefined)cancelAnimationFrame(repaintRequest);
    repaintRequest=requestAnimationFrame(()=>{repaintRequest=requestAnimationFrame(()=>{
      repaintRequest=undefined;
      if(!contextLost&&host.clientWidth>0&&host.clientHeight>0)globe.renderer().render(globe.scene(),globe.camera());
    });});
  };
  const setCameraPose=(pov:{lat:number;lng:number;altitude:number})=>{
    const camera=globe.camera();
    globe.pointOfView(pov,0);
    // OrbitControls points the camera at its target on its next animation tick.
    // Bridge commands and hit testing can read the pose before that tick.
    camera.lookAt(controls.target);
    camera.updateMatrixWorld();
  };
  // The initial view frames the whole planet with breathing room for the starfield,
  // matching the reference presentation instead of an edge-to-edge zoom.
  let lastWidth=0,lastHeight=0;
  const framedAltitude=(width:number,height:number,diameterRatio:number)=>{
    const fov=(globe.camera() as PerspectiveCamera).fov||50;
    const angle=Math.atan((Math.min(width,height)*diameterRatio/height)*Math.tan(fov*Math.PI/360));
    return Math.min(1/Math.sin(angle),controls.maxDistance/globe.getGlobeRadius())-1;
  };
  const overviewAltitude=(width:number,height:number)=>framedAltitude(width,height,.75);
  const updateMapDetail=(altitude:number)=>{
    if(!lastWidth||!lastHeight)return;
    const overview=overviewAltitude(lastWidth,lastHeight);
    // Apparent diameter changes with both zoom and viewport size. Use a small
    // gap between the two thresholds so a slow pinch doesn't flicker.
    const magnification=Math.sqrt(overview*(2+overview)/(altitude*(2+altitude)));
    const near=magnification>=(showingMapDetail?1.17:1.27);
    if(near&&!mapDetail&&!loadingMapDetail){
      loadingMapDetail=true;
      void import('./map-detail').then(({createMapDetail})=>{
        mapDetail=createMapDetail(globe.getGlobeRadius()*1.007);
        mapDetail.outlines.visible=false;
        globe.scene().add(mapDetail.outlines);
        updateMapDetail(globe.pointOfView().altitude);
      }).catch(()=>{ /* Keep the coarse map if the optional detail layer fails to load. */ });
    }
    const show=near&&!!mapDetail;
    if(show===showingMapDetail)return;
    showingMapDetail=show;
    if(mapDetail)mapDetail.outlines.visible=show;
    plateCap.selected.opacity=show ? .27 : .45;
    paintCountries();
    repaint();
  };
  globe.onZoom(({altitude})=>updateMapDetail(altitude));
  const countryAltitude=(polygon?:Feature<Geometry>)=>{
    // Use the equivalent angular radius so split territories and the date line
    // don't make a country appear wider than it is.
    const radius=polygon?Math.sqrt(geoArea(polygon)/Math.PI):.18;
    const diameterRatio=String(polygon?.id)==='156'?1:.90+.65*Math.max(0,1-radius/.26);
    return framedAltitude(lastWidth,lastHeight,diameterRatio*1.14);
  };
  const resize=()=>{
    const width=host.clientWidth,height=host.clientHeight;
    if(width<=0||height<=0)return;
    // Keep high-density screens sharp while limiting the number of pixels shaded on every frame.
    const pixelRatio=Math.min(window.devicePixelRatio||1,2,Math.max(1,Math.sqrt(1_300_000/(width*height))));
    const renderer=globe.renderer();
    if(renderer.getPixelRatio()!==pixelRatio)renderer.setPixelRatio(pixelRatio);
    if(width!==lastWidth||height!==lastHeight){
      lastWidth=width;lastHeight=height;
      globe.width(width).height(height);paintStars();
      if(untouched)setCameraPose({lat:22,lng:85,altitude:overviewAltitude(width,height)});
      updateMapDetail(globe.pointOfView().altitude);
    }
    repaint();
  };
  window.addEventListener('resize',()=>{resize();syncAnimation();});resize();
  new ResizeObserver(()=>{resize();syncAnimation();}).observe(host);
  const finishFocus=()=>{
    if(!pendingFocus)return;
    clearTimeout(focusTimer);setCameraPose(pendingFocus);pendingFocus=undefined;
    syncAnimation();
    if(!contextLost)globe.renderer().render(globe.scene(),globe.camera());
    emit('cameraChanged',{...globe.pointOfView()});
  };
  const cancelFocus=()=>{
    if(!pendingFocus)return;
    clearTimeout(focusTimer);
    pendingFocus=undefined;
    setCameraPose(globe.pointOfView());
    syncAnimation();
  };
  const focusCamera=(pov:{lat:number;lng:number;altitude:number})=>{
    clearTimeout(focusTimer);pendingFocus=pov;
    syncAnimation();
    if(!active||reducedMotion.matches){finishFocus();return;}
    const duration=850;
    globe.pointOfView(pov,duration);
    focusTimer=window.setTimeout(finishFocus,duration+30);
  };
  const setLocatedPlace=(place?:Place)=>{
    if(!place&&!locatedPlace)return;
    locatedPlace=place;
    // The renderer attaches mesh references to its point records. Keep those off bridge payloads.
    globe.pointsData(place?[{...place}]:[]);
  };
  const updateCityMarkers=()=>{
    const polygon=countries.features.find(feature=>countryKey(feature)===focusedCountryId);
    const name=clean(String(polygon?.properties?.name||''));
    const countryId=focusedCatalogCountryId||(name?places.find(p=>p.kind==='country'&&
      [p.name.en,...(p.aliases||[])].some(alias=>clean(alias)===name))?.id:undefined);
    // Copy records so the renderer's object references never enter bridge payloads.
    globe.htmlElementsData(countryId?places.filter(p=>p.kind==='city'&&p.parentId===countryId).map(p=>({...p})):[]);
  };
  const clearCountryFocus=()=>{
    if(focusedCountryId===undefined&&!focusedLocalPlace)return;
    cancelFocus();
    focusedCountryId=undefined;
    focusedCatalogCountryId=undefined;
    focusedLocalPlace=false;
    setLocatedPlace();
    updateCityMarkers();
    highlight();
    syncAnimation();
    emit('cameraChanged',{...globe.pointOfView()});
  };
  const countryKey=(polygon:Feature<Geometry>)=>String(polygon.id??polygon.properties?.name??'');
  const chooseCountry=(polygon:Feature<Geometry>)=>{
    const name=String(polygon.properties?.name||'');
    const known=places.find(p=>p.kind==='country'&&(clean(p.name.en)===clean(name)||(p.aliases||[]).some(a=>clean(a)===clean(name))));
    const [lng,lat]=geoCentroid(polygon);
    const countryId=countryKey(polygon);
    const alreadyFocused=focusedCountryId===countryId;
    const locatedCountry=alreadyFocused&&locatedPlace?.kind==='country'?locatedPlace:undefined;
    setLocatedPlace();
    focusedCountryId=countryId;
    focusedCatalogCountryId=known?.id;
    focusedLocalPlace=false;
    highlight(known,String(polygon.id??''));
    const target={lat:known?.lat??lat,lng:known?.lng??lng,altitude:countryAltitude(polygon)};
    // A land tap first brings that country into view. Only another tap on the
    // same country opens details; changing countries starts with a fresh focus.
    if(!alreadyFocused){updateCityMarkers();focusCamera(target);return;}
    // Settle on the target before opening the sheet, including rapid repeat taps.
    focusCamera(target);finishFocus();
    if(locatedCountry||known)emit('placeSelected',{place:locatedCountry||known});
    else emit('placeSelected',{geoId:String(polygon.id??''),geoName:name,lat,lng});
  };
  // A rotating camera can outpace the library's cached hover hit. Resolve each
  // stationary tap from the visible camera in the pointer event itself.
  let tap:{id:number;x:number;y:number}|null=null;
  const pointers=new Set<number>();
  host.addEventListener('pointerdown',event=>{
    if(!active||(event.target as Element).closest('.city-marker'))return;
    pointers.add(event.pointerId);
    tap=pointers.size===1?{id:event.pointerId,x:event.clientX,y:event.clientY}:null;
    if(pointers.size>1)cancelFocus();
  },{capture:true});
  host.addEventListener('pointermove',event=>{
    if(!hoverPointer&&event.pointerType!=='touch'){hoverPointer=true;syncHover();}
    if(tap&&Math.hypot(event.clientX-tap.x,event.clientY-tap.y)>7){tap=null;cancelFocus();}
  },{capture:true});
  host.addEventListener('pointercancel',event=>{pointers.delete(event.pointerId);tap=null;},{capture:true});
  host.addEventListener('pointerup',event=>{
    pointers.delete(event.pointerId);const pressed=tap;tap=null;
    if(!active||!pressed||pressed.id!==event.pointerId||Math.hypot(event.clientX-pressed.x,event.clientY-pressed.y)>7)return;
    const rect=host.getBoundingClientRect();
    const x=event.clientX-rect.left,y=event.clientY-rect.top;
    const coords=globe.toGlobeCoords(x,y);
    if(!coords){clearCountryFocus();return;}
    // Only a location already selected in search has an actionable marker.
    if(locatedPlace){
      const marker=globe.getScreenCoords(locatedPlace.lat,locatedPlace.lng,countryMarkerAltitude);
      if(Math.hypot(marker.x-x,marker.y-y)<16){
        finishFocus();
        emit('placeSelected',{place:locatedPlace});
        return;
      }
    }
    const features=showingMapDetail&&mapDetail?mapDetail.countries.features:countries.features;
    const polygon=features.find(feature=>geoContains(feature,[coords.lng,coords.lat]));
    if(polygon){untouched=false;chooseCountry(polygon);}
    else clearCountryFocus();
  },{capture:true});
  host.addEventListener('wheel',()=>{if(active)cancelFocus();},{capture:true,passive:true});
  controls.addEventListener('start',()=>{
    untouched=false;
    gestureAltitude=globe.pointOfView().altitude;
    syncAnimation();
  });
  controls.addEventListener('end',()=>{
    const startAltitude=gestureAltitude;
    gestureAltitude=undefined;
    syncAnimation();
    clearTimeout(cameraTimer);
    cameraTimer=window.setTimeout(()=>{
      if(pendingFocus)return;
      const pose=globe.pointOfView();
      emit('cameraChanged',{...pose});
      if(active&&streetMapEnabled&&startAltitude!==undefined&&pose.altitude<=.38&&pose.altitude<startAltitude-.005)
        emit('streetMapRequested',{lat:pose.lat,lng:pose.lng});
    },400);
  });
  const receive=(command:GlobeCommand)=>{
    if(!command||command.bridgeVersion!==1||!command.data)return;
    const d=command.data;
    if(command.event==='setMarkers'){
      if(Array.isArray(d.places))places=(d.places as Place[]).filter(p=>p&&typeof p.id==='string'&&Number.isFinite(p.lat)&&Number.isFinite(p.lng));
      if(d.locale==='zh'||d.locale==='en')cityLabelLocale=d.locale;
      streetMapEnabled=d.streetMap===true;
      updateCityMarkers();
      syncAnimation();
    }
    if(command.event==='focusPlace'){
      const p=d.place as Place|undefined;
      if(p&&Number.isFinite(p.lat)&&Number.isFinite(p.lng)){
        untouched=false;
        const polygon=highlight(p);
        focusedCountryId=p.kind==='country'?(polygon?countryKey(polygon):p.id):undefined;
        focusedCatalogCountryId=p.kind==='country'?p.id:undefined;
        focusedLocalPlace=p.kind!=='country';
        setLocatedPlace(d.locateOnly===true&&p.kind==='country'?p:undefined);
        updateCityMarkers();
        focusCamera({lat:p.lat,lng:p.lng,altitude:p.kind==='country'?countryAltitude(polygon):.65});
      }
    }
    if(command.event==='clearCountryFocus')clearCountryFocus();
    if(command.event==='restoreCamera'&&Number.isFinite(d.lat)&&Number.isFinite(d.lng)&&Number.isFinite(d.altitude)){untouched=false;clearTimeout(focusTimer);pendingFocus=undefined;syncAnimation();setCameraPose({lat:Number(d.lat),lng:Number(d.lng),altitude:Number(d.altitude)});
     // A restored view must land immediately, even while the animation loop is
     // paused, so hit-testing and the visible frame both use the settled camera.
     if(!contextLost)globe.renderer().render(globe.scene(),globe.camera());}
    if(command.event==='setActive'){active=d.active!==false;controls.enabled=active&&!contextLost;document.documentElement.classList.toggle('globe-idle',!active);setTwinkleVisible(active);if(active)resize();else{finishFocus();tap=null;pointers.clear();}syncAnimation();}
    if(command.event==='setTheme')document.documentElement.dataset.theme=String(d.theme||'ocean');
  };
  window.OurworldGlobe={receive,get ready(){return texturesReady&&!contextLost;}};
  window.addEventListener('message',e=>{if(e.source===window.parent&&(e.origin===window.location.origin||e.origin==='null'))receive(e.data);});
  const resumeView=()=>{if(document.hidden)return;resize();syncAnimation();};
  document.addEventListener('visibilitychange',()=>{document.hidden?syncAnimation():resumeView();});
  window.addEventListener('pageshow',resumeView);
  window.addEventListener('focus',resumeView);
  const announceReady=(recovered=false)=>{
    document.getElementById('boot')?.classList.add('done');
    requestAnimationFrame(()=>requestAnimationFrame(()=>{if(!contextLost)emit('rendererReady',{version:1,style:'blue-marble',borders:true,texturesReady:true,textureCount:2,loadedTextureCount:2,lighting:'uniform-view-relative',clouds:'baked',dayNight:false,recovered});}));
  };
  const canvas=globe.renderer().domElement;
  canvas.addEventListener('webglcontextlost',event=>{
    event.preventDefault();contextLost=true;controls.enabled=false;
    finishFocus();tap=null;pointers.clear();
    syncAnimation();
    document.getElementById('boot')?.classList.remove('done');
    clearTimeout(recoveryTimer);recoveryTimer=window.setTimeout(()=>{
      if(contextLost)emit('rendererError',{message:'WebGL context recovery timed out',recoverable:true});
    },5000);
  });
  canvas.addEventListener('webglcontextrestored',()=>{
    contextLost=false;clearTimeout(recoveryTimer);configureRenderer();
    appearance.configure(globe.globeMaterial() as import('three').MeshPhongMaterial,globe.renderer().capabilities.getMaxAnisotropy());
    controls.enabled=active;resize();syncAnimation();
    if(texturesReady)announceReady(true);
  });
  globe.onGlobeReady(()=>{
    // globe.gl has applied the day + bump textures to its Phong material; tune colour
    // space, anisotropy and relief strength once so the photographs stay accurate.
    appearance.configure(globe.globeMaterial() as import('three').MeshPhongMaterial,globe.renderer().capabilities.getMaxAnisotropy());
    texturesReady=true;resize();
    syncAnimation();
    announceReady();
  });
}
void mount().catch(error=>{
  document.getElementById('boot')?.classList.add('done');
  document.getElementById('fallback')!.style.display='block';emit('rendererError',{message:error instanceof Error?error.message:'WebGL unavailable'});
});
