import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
process.env.PLAYWRIGHT_BROWSERS_PATH=resolve('.playwright-browsers');
const {chromium}=await import('playwright');
const base=process.env.OURWORLD_WEB_URL||'http://127.0.0.1:8188';
const out=resolve('artifacts/photo-focus');await mkdir(out,{recursive:true});
const checks=[],errors=[],textures=new Map(),external=[];
const assert=(ok,label)=>{if(!ok)throw new Error(label);checks.push(label);};
const browser=await chromium.launch({headless:true,args:['--no-proxy-server','--disable-gpu','--enable-unsafe-swiftshader']});
const context=await browser.newContext({viewport:{width:390,height:844},locale:'zh-CN',hasTouch:true});
const page=await context.newPage();page.setDefaultTimeout(15000);
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
page.on('response',r=>{if(/\/globe\/textures\/earth-(day\.jpg|topology\.png)$/.test(r.url()))textures.set(new URL(r.url()).pathname,r.status());});
page.on('request',r=>{if(/^https?:/.test(r.url())&&new URL(r.url()).origin!==new URL(base).origin)external.push(r.url());});
await page.addInitScript(()=>{window.__globeEvents=[];window.addEventListener('message',e=>{if(e.data?.bridgeVersion===1)window.__globeEvents.push(e.data);});});
const command=async data=>{
 await page.waitForFunction(()=>typeof document.querySelector('.globe-frame')?.contentWindow?.OurworldGlobe?.receive==='function');
 return page.frameLocator('.globe-frame').locator('body').evaluate((_,message)=>window.OurworldGlobe.receive(message),{bridgeVersion:1,...data});
};
const pause=()=>command({event:'setActive',data:{active:false}});
const resume=()=>command({event:'setActive',data:{active:true}});
// Pause and restore in one frame task: slow software rendering can otherwise let
// the rotation hold expire between bridge calls and invalidate pixel comparisons.
const freezeAt=(pov,theme)=>page.frameLocator('.globe-frame').locator('body').evaluate((_,{pov,theme})=>{
 const receive=(event,data)=>window.OurworldGlobe.receive({bridgeVersion:1,event,data});
 if(theme)receive('setTheme',{theme});
 receive('setActive',{active:false});receive('restoreCamera',pov);
 return new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
},{pov,theme});
try{
 await page.goto(base,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__globeEvents.some(e=>e.event==='rendererReady'&&e.data.texturesReady===true),null,{timeout:30000});
 await page.waitForTimeout(500);await pause();
 assert(errors.length===0,'no JavaScript, Three.js or WebGL shader errors on startup');
 assert(textures.size===2&&textures.get('/globe/textures/earth-day.jpg')===200&&textures.get('/globe/textures/earth-topology.png')===200,'only the baked-cloud surface image and the topology bump load; no cloud or night texture requests');
 const appearance=await page.evaluate(()=>window.__globeEvents.find(e=>e.event==='rendererReady').data);
 assert(appearance.style==='blue-marble'&&appearance.clouds==='baked'&&appearance.dayNight===false&&appearance.lighting==='uniform-view-relative','photographic blue-marble renderer has baked clouds and no sun-dependent lighting');
 assert((await page.locator('body').innerText()).trim()==='搜索国家、城市、景点','first screen only shows the search hint');
 assert(await page.locator('.bottom-nav>button').count()===4,'the four planet destinations are present');
 for(const [name,width,height] of [['mobile',390,844],['tablet',768,1024],['desktop',1440,900]]){
  // Canvas resizing clears its backing buffer. Resume for a fresh frame before freezing it.
  await resume();await page.setViewportSize({width,height});await page.waitForTimeout(650);await pause();
  const nav=await page.locator('.bottom-nav').boundingBox();
  assert(nav.y+nav.height<=height,`${name} bottom navigation stays inside viewport`);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${name} has no horizontal overflow`);
  for(const icon of await page.locator('.bottom-nav svg').all()){const box=await icon.boundingBox();if(box.y+box.height>height)throw new Error(`${name} navigation icon clipped`);}
  const chrome=await page.locator('.home-search').evaluate(el=>({shadow:getComputedStyle(el).boxShadow,blur:getComputedStyle(el).backdropFilter}));
  assert(chrome.shadow!=='none'&&chrome.blur==='none',`${name} search pill is raised over the globe without blur`);
  const shot=await page.screenshot({path:resolve(out,`ui-night-earth-${name}.png`),timeout:20000,animations:'disabled'});
  const visible=await page.evaluate(async data=>{
   const image=new Image();image.src=`data:image/png;base64,${data}`;await image.decode();
   const surface=document.createElement('canvas');surface.width=image.width;surface.height=image.height;
   const ctx=surface.getContext('2d');ctx.drawImage(image,0,0);
   const frame=document.querySelector('.globe-frame').getBoundingClientRect(),size=Math.floor(Math.min(frame.width,frame.height)*.25);
   const pixels=ctx.getImageData(Math.floor(frame.x+frame.width/2-size/2),Math.floor(frame.y+frame.height/2-size/2),size,size).data;
   let lit=0,min=255,max=0;for(let i=0;i<pixels.length;i+=4){const value=Math.max(pixels[i],pixels[i+1],pixels[i+2]);if(value>30)lit++;min=Math.min(min,value);max=Math.max(max,value);}
   return lit>pixels.length/4*.15&&max-min>30;
  },shot.toString('base64'));
  assert(visible,`${name} screenshot contains the textured Earth, not an empty paused canvas`);
  console.log(`Screenshot ready: ui-night-earth-${name}.png`);
 }
 await page.setViewportSize({width:390,height:844});await resume();await page.waitForTimeout(500);
 const globeCanvas=page.frameLocator('.globe-frame').locator('#globe canvas').first(),initialBox=await globeCanvas.boundingBox();
 const previousCount=await page.evaluate(()=>window.__globeEvents.filter(e=>e.event==='cameraChanged').length);
 await page.mouse.move(initialBox.x+initialBox.width*.43,initialBox.y+initialBox.height*.48);await page.mouse.down();
 await page.mouse.move(initialBox.x+initialBox.width*.64,initialBox.y+initialBox.height*.45,{steps:12});await page.mouse.up();
 await page.waitForFunction(count=>window.__globeEvents.filter(e=>e.event==='cameraChanged').length>count,previousCount);
 const camera=await page.evaluate(()=>window.__globeEvents.filter(e=>e.event==='cameraChanged').at(-1).data);
 assert(['lat','lng','altitude'].every(key=>Number.isFinite(camera[key])),'dragging sends a finite cameraChanged bridge event');
 assert(await page.locator('.bottom-sheet:visible').count()===0,'dragging does not accidentally select a country');
 await page.waitForTimeout(900);
 await freezeAt(camera);
 const frozenA=await globeCanvas.screenshot();await page.waitForTimeout(350);const frozenB=await globeCanvas.screenshot();
 assert(frozenA.equals(frozenB),'setActive false freezes the actual globe frame');await resume();
 for(const [name,lat,lng] of [['africa',20,20],['americas',15,-85],['pacific',8,160]]){
  await command({event:'restoreCamera',data:{lat,lng,altitude:camera.altitude}});await page.waitForTimeout(850);await pause();
  await page.screenshot({path:resolve(out,`uniform-globe-${name}.png`),animations:'disabled'});await resume();
 }
 await freezeAt({lat:22,lng:85,altitude:camera.altitude});
 const darkMap=await globeCanvas.screenshot();
 // The globe keeps auto-rotating by design, so reset to the identical point of view
 // before capturing the second frame; only palette changes should remain.
 await freezeAt({lat:22,lng:85,altitude:camera.altitude},'light');
 const lightMap=await globeCanvas.screenshot();
 await writeFile(resolve(out,'globe-theme-dark.png'),darkMap);await writeFile(resolve(out,'globe-theme-light.png'),lightMap);
 const themeDifference=await page.evaluate(async images=>{
  // Rotation-invariant palette check: compare normalised luminance histograms. The
  // globe auto-rotates by design, so pixel positions drift between frames, but a
  // palette change shifts the whole colour distribution instead.
  const histograms=await Promise.all(images.map(async data=>{const image=new Image();image.src='data:image/png;base64,'+data;await image.decode();const c=document.createElement('canvas');c.width=image.width;c.height=image.height;const ctx=c.getContext('2d');ctx.drawImage(image,0,0);const d=ctx.getImageData(0,0,c.width,c.height).data;const h=[new Array(64).fill(0),new Array(64).fill(0),new Array(64).fill(0)];for(let i=0;i<d.length;i+=4){h[0][d[i]>>2]++;h[1][d[i+1]>>2]++;h[2][d[i+2]>>2]++;}return h.map(channel=>channel.map(v=>v/(d.length/4)));}));
  // Per-channel histograms: rotation moves pixels between positions, but a palette or
  // hue change shifts at least one channel's distribution.
  let l1=0;for(let c=0;c<3;c++)for(let i=0;i<64;i++)l1+=Math.abs(histograms[0][c][i]-histograms[1][c][i]);
  return {histogramDistance:l1};
 },[darkMap.toString('base64'),lightMap.toString('base64')]);
 console.log('Theme comparison:',JSON.stringify(themeDifference));
 assert(themeDifference.histogramDistance<.03,'switching the host theme preserves the rendered globe palette');
 await command({event:'setTheme',data:{theme:'dark'}});await resume();

 await page.locator('.home-search').click();await page.getByPlaceholder('搜索国家、城市、景点').fill('巴黎');
 await page.locator('.place-result').filter({hasText:'巴黎'}).first().click();
 await page.getByRole('button',{name:'找当地人',exact:true}).waitFor();checks.push('real search for Paris opens city details');
 await page.getByRole('button',{name:'返回地球',exact:true}).click();
 const countries=await (await context.request.get(`${base}/api/v1/places?kind=country`)).json();
 const france=countries.items.find(p=>p.name.en==='France');if(!france)throw new Error('France missing from real catalog');
 // Under software rendering every cross-context round-trip can cost seconds: the focus
 // tween stalls short of France and the spin hold can lapse before a CDP tap lands.
 // Snap the camera and dispatch the pointer tap inside one iframe task (zero round
 // trips), so the tap resolves against the settled camera like a real touch would.
 const canvas=page.frameLocator('.globe-frame').locator('#globe canvas').first(),box=await canvas.boundingBox();
 const tapFrance=()=>page.frameLocator('.globe-frame').locator('body').evaluate((_,point)=>{
  window.OurworldGlobe.receive({bridgeVersion:1,event:'restoreCamera',data:{lat:46.6,lng:2.35,altitude:1.15}});
  const target=document.querySelector('#globe canvas');
  // A synthetic pointer has no live pointer id, so the controls' capture call would
  // throw; neuter it for the duration of the tap only.
  const proto=Element.prototype,capture=proto.setPointerCapture,release=proto.releasePointerCapture;
  proto.setPointerCapture=function(){};proto.releasePointerCapture=function(){};
  try{for(const type of ['pointerdown','pointerup'])target.dispatchEvent(new PointerEvent(type,{pointerId:31,isPrimary:true,pointerType:'touch',bubbles:true,cancelable:true,clientX:point.x,clientY:point.y}));}
  finally{proto.setPointerCapture=capture;proto.releasePointerCapture=release;}
 },{x:box.width/2+12,y:box.height/2+15});
 const beforeCountryTap=await page.evaluate(()=>window.__globeEvents.length);
 await tapFrance();
 await page.waitForFunction(start=>window.__globeEvents.slice(start).some(e=>e.event==='cameraChanged'&&Math.abs(e.data.altitude-1.1)<.02),beforeCountryTap);
 assert(await page.getByRole('dialog',{name:'法国',exact:true}).count()===0,'first country tap focuses France without opening its information');
 assert(await page.evaluate(start=>!window.__globeEvents.slice(start).some(e=>e.event==='placeSelected'),beforeCountryTap),'first country tap does not emit a selection through either click handler');
 await tapFrance();
 await page.getByRole('dialog',{name:'法国',exact:true}).waitFor();checks.push('second tap on France opens country information');
 assert(await page.locator('.place-detail-description>p').count()>=2,'country description preserves paragraphs');
 await pause();await page.screenshot({path:resolve(out,'ui-night-earth-country.png'),animations:'disabled'});
 await page.getByRole('button',{name:'浏览城市',exact:true}).click();
 await page.locator('.country-city-card.is-active').getByRole('button',{name:'查看城市',exact:true}).click();
 await page.getByRole('button',{name:'找当地人',exact:true}).click();await page.locator('.person-card.deck-front').waitFor();
 const navBand=await page.locator('.bottom-nav').evaluate(el=>getComputedStyle(el).backgroundColor);
 assert(navBand==='rgba(0, 0, 0, 0)','navigation band stays transparent so the floating discs carry the surface');
 assert(await page.locator('.bottom-nav iframe').count()===0,'nav planets share the transparent app surface');
 const community=page.locator('[data-tab="community"]');
 const inactivePlanet=community.locator('.planet-atlas');
 assert(await inactivePlanet.evaluate(el=>{const opacity=Number(getComputedStyle(el).opacity);return opacity>=.58&&opacity<=.65;}),'inactive planets are recognizably dimmer');
 const activePlanet=page.locator('.bottom-nav [aria-current="page"] .nav-planet');
 assert(await activePlanet.evaluate(el=>getComputedStyle(el,'::before').display==='block'),'only the selected planet has a bright ring');
 assert((await community.locator('.planet-atlas').evaluate(el=>getComputedStyle(el).backgroundImage)).includes('planet-community.png'),'community keeps its rendered ringed planet');
 await page.locator('.bottom-nav [data-tab="profile"]').click();
 await page.getByText('看看示例主页',{exact:true}).waitFor();
 assert(await page.locator('.demo-profile-grid>button').count()===4,'Profile still shows real example profile links');
 const credits=await context.request.get(`${base}/globe/credits.html`);
 assert(credits.status()===200&&(await credits.text()).includes('NASA'),'offline imagery attribution page is bundled');
 assert(external.length===0,'exploration uses no runtime CDN or external imagery requests');
 assert(errors.length===0,'no browser errors throughout real search and country navigation');
 await context.close();
 const reduced=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'}),quiet=await reduced.newPage();
 quiet.on('pageerror',e=>errors.push(e.message));quiet.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await quiet.addInitScript(()=>{window.__ready=false;window.addEventListener('message',e=>{if(e.data?.event==='rendererReady'&&e.data.data?.texturesReady)window.__ready=true;});});
 await quiet.goto(base,{waitUntil:'domcontentloaded'});await quiet.waitForFunction(()=>window.__ready,null,{timeout:30000});
 await quiet.waitForTimeout(1900);const staticCanvas=quiet.frameLocator('.globe-frame').locator('#globe canvas').first();
 const staticA=await staticCanvas.screenshot();await quiet.waitForTimeout(600);const staticB=await staticCanvas.screenshot();
 assert(staticA.equals(staticB),'prefers-reduced-motion disables automatic globe rotation');await reduced.close();
 assert(errors.length===0,'reduced-motion startup also has no shader or browser errors');
 await writeFile(resolve(out,'ui-night-earth-report.json'),JSON.stringify({passed:true,base,checks,errors,textures:[...textures],external},null,2));
 console.log(JSON.stringify({passed:true,checks,errors},null,2));
}catch(error){
 await page.screenshot({path:resolve(out,'ui-night-earth-failure.png'),timeout:8000}).catch(()=>{});
 await writeFile(resolve(out,'ui-night-earth-report.json'),JSON.stringify({passed:false,checks,errors,textures:[...textures],external,error:String(error)},null,2));throw error;
}finally{await browser.close();}
