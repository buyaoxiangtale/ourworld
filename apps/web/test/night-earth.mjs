import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
process.env.PLAYWRIGHT_BROWSERS_PATH=resolve('.playwright-browsers');
const {chromium}=await import('playwright');
const base=process.env.OURWORLD_WEB_URL||'http://127.0.0.1:8188';
const out=resolve('artifacts/photo-focus');await mkdir(out,{recursive:true});
const checks=[],errors=[],textures=new Map(),external=[];
const assert=(ok,label)=>{if(!ok)throw new Error(label);checks.push(label);};
const browser=await chromium.launch({headless:true,args:['--no-proxy-server','--disable-gpu']});
const context=await browser.newContext({viewport:{width:390,height:844},locale:'zh-CN'});
const page=await context.newPage();page.setDefaultTimeout(15000);
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
page.on('response',r=>{if(/\/globe\/textures\/earth-/.test(r.url()))textures.set(new URL(r.url()).pathname,r.status());});
page.on('request',r=>{if(/^https?:/.test(r.url())&&new URL(r.url()).origin!==new URL(base).origin)external.push(r.url());});
await page.addInitScript(()=>{window.__globeEvents=[];window.addEventListener('message',e=>{if(e.data?.bridgeVersion===1)window.__globeEvents.push(e.data);});});
const command=async data=>{
 await page.waitForFunction(()=>typeof document.querySelector('iframe')?.contentWindow?.OurworldGlobe?.receive==='function');
 return page.frameLocator('iframe').locator('body').evaluate((_,message)=>window.OurworldGlobe.receive(message),{bridgeVersion:1,...data});
};
const pause=()=>command({event:'setActive',data:{active:false}});
const resume=()=>command({event:'setActive',data:{active:true}});
try{
 await page.goto(base,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__globeEvents.some(e=>e.event==='rendererReady'&&e.data.texturesReady===true),null,{timeout:30000});
 await page.waitForTimeout(500);await pause();
 assert(errors.length===0,'no JavaScript, Three.js or WebGL shader errors on startup');
 assert(textures.size===1&&textures.get('/globe/textures/earth-day.jpg')===200,'only the cloud-free surface image loads; no cloud, night or bump texture requests');
 const appearance=await page.evaluate(()=>window.__globeEvents.find(e=>e.event==='rendererReady').data);
 assert(appearance.style==='dark-map'&&appearance.clouds===false&&appearance.dayNight===false&&appearance.lighting==='uniform-view-relative','uniform dark-map renderer has no clouds or sun-dependent lighting');
 assert((await page.locator('body').innerText()).trim()==='搜索国家、城市、景点','first screen only shows the search hint');
 assert(await page.locator('.bottom-nav>button').count()===3,'exactly three icon destinations remain');
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
   const frame=document.querySelector('iframe').getBoundingClientRect(),size=Math.floor(Math.min(frame.width,frame.height)*.25);
   const pixels=ctx.getImageData(Math.floor(frame.x+frame.width/2-size/2),Math.floor(frame.y+frame.height/2-size/2),size,size).data;
   let lit=0,min=255,max=0;for(let i=0;i<pixels.length;i+=4){const value=Math.max(pixels[i],pixels[i+1],pixels[i+2]);if(value>30)lit++;min=Math.min(min,value);max=Math.max(max,value);}
   return lit>pixels.length/4*.15&&max-min>30;
  },shot.toString('base64'));
  assert(visible,`${name} screenshot contains the textured Earth, not an empty paused canvas`);
  console.log(`Screenshot ready: ui-night-earth-${name}.png`);
 }
 await page.setViewportSize({width:390,height:844});await resume();await page.waitForTimeout(500);
 const globeCanvas=page.frameLocator('iframe').locator('canvas:visible').first(),initialBox=await globeCanvas.boundingBox();
 const previousCount=await page.evaluate(()=>window.__globeEvents.filter(e=>e.event==='cameraChanged').length);
 await page.mouse.move(initialBox.x+initialBox.width*.43,initialBox.y+initialBox.height*.48);await page.mouse.down();
 await page.mouse.move(initialBox.x+initialBox.width*.64,initialBox.y+initialBox.height*.45,{steps:12});await page.mouse.up();
 await page.waitForFunction(count=>window.__globeEvents.filter(e=>e.event==='cameraChanged').length>count,previousCount);
 const camera=await page.evaluate(()=>window.__globeEvents.filter(e=>e.event==='cameraChanged').at(-1).data);
 assert(['lat','lng','altitude'].every(key=>Number.isFinite(camera[key])),'dragging sends a finite cameraChanged bridge event');
 assert(await page.locator('.bottom-sheet:visible').count()===0,'dragging does not accidentally select a country');
 await page.waitForTimeout(900);
 await command({event:'restoreCamera',data:camera});await page.waitForTimeout(300);
 await pause();
 const frozenA=await globeCanvas.screenshot();await page.waitForTimeout(350);const frozenB=await globeCanvas.screenshot();
 assert(frozenA.equals(frozenB),'setActive false freezes the actual globe frame');await resume();
 for(const [name,lat,lng] of [['africa',20,20],['americas',15,-85],['pacific',8,160]]){
  await command({event:'restoreCamera',data:{lat,lng,altitude:camera.altitude}});await page.waitForTimeout(850);await pause();
  await page.screenshot({path:resolve(out,`uniform-globe-${name}.png`),animations:'disabled'});await resume();
 }
 await command({event:'restoreCamera',data:{lat:22,lng:85,altitude:camera.altitude}});await page.waitForTimeout(850);await pause();
 const darkMap=await globeCanvas.screenshot();
 await command({event:'setTheme',data:{theme:'light'}});await resume();await page.waitForTimeout(300);await pause();
 const lightMap=await globeCanvas.screenshot();
 await writeFile(resolve(out,'globe-theme-dark.png'),darkMap);await writeFile(resolve(out,'globe-theme-light.png'),lightMap);
 const themeDifference=await page.evaluate(async images=>{
  const pixels=await Promise.all(images.map(async data=>{const image=new Image();image.src='data:image/png;base64,'+data;await image.decode();const c=document.createElement('canvas');c.width=image.width;c.height=image.height;const ctx=c.getContext('2d');ctx.drawImage(image,0,0);return ctx.getImageData(0,0,c.width,c.height).data;}));
  let total=0,changed=0;for(let i=0;i<pixels[0].length;i+=4){let delta=0;for(let channel=0;channel<3;channel++)delta+=Math.abs(pixels[0][i+channel]-pixels[1][i+channel]);total+=delta;if(delta>12)changed++;}
  return {meanChannelDifference:total/(pixels[0].length/4*3),changedFraction:changed/(pixels[0].length/4)};
 },[darkMap.toString('base64'),lightMap.toString('base64')]);
 console.log('Theme comparison:',JSON.stringify(themeDifference));
 // Orbit damping can shift a few edge pixels after resuming; a palette change cannot fit this tolerance.
 assert(themeDifference.meanChannelDifference<.75&&themeDifference.changedFraction<.02,'switching the host theme preserves the rendered globe palette');
 await command({event:'setTheme',data:{theme:'dark'}});await resume();

 await page.locator('.home-search').click();await page.getByPlaceholder('搜索国家、城市、景点').fill('巴黎');
 await page.locator('.place-result').filter({hasText:'巴黎'}).first().click();
 await page.getByRole('button',{name:'找当地人',exact:true}).waitFor();checks.push('real search for Paris opens city details');
 await page.getByRole('button',{name:'返回地球',exact:true}).click();
 const countries=await (await context.request.get(`${base}/api/v1/places?kind=country`)).json();
 const france=countries.items.find(p=>p.name.en==='France');if(!france)throw new Error('France missing from real catalog');
 await command({event:'focusPlace',data:{place:{...france,lat:46.6,lng:2.35}}});await page.waitForTimeout(1000);
 const canvas=page.frameLocator('iframe').locator('canvas:visible').first(),box=await canvas.boundingBox();
 await canvas.click({position:{x:box.width/2+12,y:box.height/2+15},delay:100});
 await page.getByRole('dialog',{name:'法国',exact:true}).waitFor();checks.push('natural surface still resolves a physical tap on France');
 assert(await page.locator('.place-detail-description>p').count()>=2,'country description preserves paragraphs');
 await pause();await page.screenshot({path:resolve(out,'ui-night-earth-country.png'),animations:'disabled'});
 await page.locator('.country-city-list .place-result').filter({hasText:'巴黎'}).first().click();
 await page.getByRole('button',{name:'找当地人',exact:true}).click();await page.locator('.person-card').waitFor();
 const navBand=await page.locator('.bottom-nav').evaluate(el=>getComputedStyle(el).backgroundColor);
 assert(navBand==='rgba(0, 0, 0, 0)','navigation band stays transparent so the floating discs carry the surface');
 const navDisc=await page.locator('.bottom-nav>button').first().evaluate(el=>getComputedStyle(el).backgroundColor);
 assert(navDisc==='rgba(0, 0, 0, 0.32)','navigation discs keep the glass surface over the globe');
 await page.locator('.bottom-nav').getByRole('button',{name:'Profile',exact:true}).click();
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
 await quiet.waitForTimeout(1900);const staticCanvas=quiet.frameLocator('iframe').locator('canvas:visible').first();
 const staticA=await staticCanvas.screenshot();await quiet.waitForTimeout(600);const staticB=await staticCanvas.screenshot();
 assert(staticA.equals(staticB),'prefers-reduced-motion disables automatic globe rotation');await reduced.close();
 assert(errors.length===0,'reduced-motion startup also has no shader or browser errors');
 await writeFile(resolve(out,'ui-night-earth-report.json'),JSON.stringify({passed:true,base,checks,errors,textures:[...textures],external},null,2));
 console.log(JSON.stringify({passed:true,checks,errors},null,2));
}catch(error){
 await page.screenshot({path:resolve(out,'ui-night-earth-failure.png'),timeout:8000}).catch(()=>{});
 await writeFile(resolve(out,'ui-night-earth-report.json'),JSON.stringify({passed:false,checks,errors,textures:[...textures],external,error:String(error)},null,2));throw error;
}finally{await browser.close();}
