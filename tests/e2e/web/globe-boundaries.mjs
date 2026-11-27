import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
process.env.PLAYWRIGHT_BROWSERS_PATH=resolve(root,'.playwright-browsers');
const {chromium}=await import('playwright');
const {preview}=await import('vite');
const server=await preview({configFile:resolve(root,'apps/web/vite.config.ts'),root:resolve(root,'apps/web'),preview:{host:'127.0.0.1',port:5187,strictPort:true}});
const browser=await chromium.launch({headless:true,args:['--no-proxy-server','--disable-gpu','--enable-unsafe-swiftshader']});
const output=resolve(root,'artifacts/deep-sea');await mkdir(output,{recursive:true});
const errors=[],external=[],countries=[];
const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
await context.addInitScript(()=>{window.__events=[];window.AndroidGlobe={postMessage:json=>window.__events.push(JSON.parse(json))};window.addEventListener('message',e=>{if(e.data?.bridgeVersion===1)window.__events.push(e.data);});});
await context.route('**/api/v1/**',async route=>{
 assert.equal(route.request().method(),'GET','desktop reference check only reads public data');
 const response=await fetch(route.request().url().replace(':5187/',':8188/'));
 return route.fulfill({status:response.status,contentType:response.headers.get('content-type')||'application/json',body:Buffer.from(await response.arrayBuffer())});
});
context.on('request',r=>{if(new URL(r.url()).hostname!=='127.0.0.1')external.push(r.url());});
const page=await context.newPage();page.setDefaultTimeout(30000);
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error'&&!m.text().includes('Failed to load resource'))errors.push(m.text());});
const command=(event,data)=>page.evaluate(({event,data})=>window.OurworldGlobe.receive({bridgeVersion:1,event,data}),{event,data});
// Set the view and tap in a single task so the test uses a deterministic
// point on the spinning globe even under software rendering.
const tapGlobe=(x,y,pov)=>page.evaluate(({x,y,pov})=>{
 if(pov)window.OurworldGlobe.receive({bridgeVersion:1,event:'restoreCamera',data:pov});
 const target=document.querySelector('#globe canvas');
 const proto=Element.prototype,capture=proto.setPointerCapture,release=proto.releasePointerCapture;
 proto.setPointerCapture=function(){};proto.releasePointerCapture=function(){};
 try{for(const type of ['pointerdown','pointerup'])target.dispatchEvent(new PointerEvent(type,{pointerId:41,isPrimary:true,pointerType:'touch',bubbles:true,cancelable:true,clientX:x,clientY:y}));}
 finally{proto.setPointerCapture=capture;proto.releasePointerCapture=release;}
},{x,y,pov});
const tapCountryTwice=async(name,lat,lng)=>{
 const pov={lat,lng,altitude:initialAltitude};
 await page.evaluate(()=>window.__events=[]);
 await tapGlobe(195,422,pov);
 await waitForCountryZoom();
 const focusedAltitude=await page.evaluate(()=>window.__events.filter(e=>e.event==='cameraChanged').at(-1).data.altitude);
 assert.equal(await page.evaluate(()=>window.__events.filter(e=>e.event==='placeSelected').length),0,`${name}: first tap only focuses, with no duplicate selection from the pointer fallback`);
 await tapGlobe(195,422,pov);
 await page.waitForFunction(()=>window.__events.some(e=>e.event==='placeSelected'));
 const selections=await page.evaluate(()=>window.__events.filter(e=>e.event==='placeSelected'));
 assert.equal(selections.length,1,`${name}: second tap opens exactly once`);
 assert.equal(selections[0].data.geoName,name);
 return {...selections[0].data,focusedAltitude};
};
let initialAltitude;
const waitForCountryZoom=()=>page.waitForFunction(overview=>window.__events.some(
 e=>e.event==='cameraChanged'&&e.data.altitude<overview-.1
),initialAltitude);
try{
 await page.goto('http://127.0.0.1:5187/globe/index.html');
 await page.waitForFunction(()=>window.__events.some(e=>e.event==='rendererReady'));
 await page.mouse.click(10,10);
 await page.waitForFunction(()=>window.__events.some(e=>e.event==='cameraChanged'));
 initialAltitude=await page.evaluate(()=>window.__events.find(e=>e.event==='cameraChanged').data.altitude);
 const waitForAltitude=altitude=>page.waitForFunction(altitude=>window.__events.some(
  e=>e.event==='cameraChanged'&&Math.abs(e.data.altitude-altitude)<.01
 ),altitude);
 const chengdu={id:'test-chengdu',kind:'city',parentId:'test-china',name:{zh:'成都',en:'Chengdu'},lat:30.57,lng:104.07};
 const paris={id:'test-paris',kind:'city',parentId:'test-france',name:{zh:'巴黎',en:'Paris'},lat:48.86,lng:2.35};
 await command('setMarkers',{places:[chengdu,paris]});
 assert.equal(await page.locator('.city-marker').count(),0,'overview has no city markers');
 await page.evaluate(()=>window.__events=[]);
 await tapGlobe(250,393);
 await waitForCountryZoom();
 const coldChina=await page.evaluate(()=>window.__events.filter(e=>e.event==='cameraChanged').at(-1).data);
 assert(coldChina.lat>25&&coldChina.lng>95&&coldChina.lng<115,'the opening tap focuses China');
 const projectedDiameter=altitude=>1/Math.sqrt((altitude+1)**2-1);
 const focusedWidth=altitude=>.75*projectedDiameter(altitude)/projectedDiameter(initialAltitude);
 const chinaWidth=focusedWidth(coldChina.altitude);
 assert(Math.abs(chinaWidth-1.14)<.02,'China uses the closer country framing on a phone');
 assert.equal(await page.evaluate(()=>window.__events.filter(e=>e.event==='placeSelected').length),0,'the first tap only focuses the country');
 await page.addStyleTag({content:'#twinkle{visibility:hidden}'});
 const canvas=page.locator('#globe canvas');
 const china={id:'test-china',kind:'country',name:{zh:'中国',en:'China'},lat:coldChina.lat,lng:coldChina.lng};
 await command('setMarkers',{places:[china,chengdu,paris],locale:'zh'});
 const cityMarker=page.getByRole('button',{name:'成都',exact:true});
 await cityMarker.waitFor();
 assert.equal(await page.locator('.city-marker').count(),1,'only cities in the focused country appear');
 await cityMarker.click();
 await page.waitForFunction(id=>window.__events.some(e=>e.event==='placeSelected'&&e.data.place?.id===id),chengdu.id);
 await page.evaluate(()=>window.__events=[]);
 await tapGlobe(195,422,{lat:30.57,lng:104.07,altitude:coldChina.altitude});
 const countrySelection=await page.evaluate(()=>window.__events.find(e=>e.event==='placeSelected')?.data);
 assert.equal(countrySelection?.place?.id,china.id,'another tap on the country opens the country');
 await page.evaluate(()=>window.__events=[]);
 await command('focusPlace',{place:china,locateOnly:true});
 assert.equal(await page.evaluate(()=>window.__events.filter(e=>e.event==='placeSelected').length),0,'locating a country from search does not open details');
 await tapGlobe(195,422);
 await page.waitForFunction(id=>window.__events.some(e=>e.event==='placeSelected'&&e.data.place?.id===id),china.id);
 await page.evaluate(()=>window.__events=[]);
 await command('clearCountryFocus',{});
 await waitForAltitude(coldChina.altitude);
 await cityMarker.waitFor({state:'detached'});
 await command('focusPlace',{place:china});
 await command('focusPlace',{place:chengdu});
 await page.evaluate(()=>window.__events=[]);
 await tapGlobe(195,422,{lat:0,lng:-140,altitude:.65});
 await waitForAltitude(.65);
 await page.emulateMedia({reducedMotion:'no-preference'});
 await page.evaluate(china=>{
  window.__events=[];
  const send=(event,data)=>window.OurworldGlobe.receive({bridgeVersion:1,event,data});
  send('focusPlace',{place:china});
  send('clearCountryFocus',{});
 },china);
 await waitForAltitude(.65);
 await command('setMarkers',{places:[]});
 // New Zealand anchors inland on the North Island: an archipelago's centroid often
 // falls in open water at 1:110m resolution.
 for(const [name,lat,lng]of [['Germany',51,10],['Indonesia',-7.6,110.2],['New Zealand',-38.4,176.0],['Russia',66,179]]){
  const selection=await tapCountryTwice(name,lat,lng);
  countries.push({name,lat,lng,geoId:selection.geoId,focusedAltitude:selection.focusedAltitude,selected:true,tap:true,twoStep:true});
 }
 assert(countries.find(country=>country.name==='Russia').focusedAltitude>countries.find(country=>country.name==='Germany').focusedAltitude,'a larger country keeps a wider view');
 const germanyWidth=focusedWidth(countries.find(country=>country.name==='Germany').focusedAltitude);
 const russiaWidth=focusedWidth(countries.find(country=>country.name==='Russia').focusedAltitude);
 assert(Math.abs(germanyWidth-1.62)<.02&&Math.abs(russiaWidth-1.026)<.02,'both smaller and larger countries use the closer framing');
 // Compare rendered frames after the camera settles, with background twinkles hidden.
 const firstFocus={lat:-38.4,lng:176,altitude:initialAltitude};
 await page.mouse.click(10,10);
 await page.evaluate(()=>window.__events=[]);
 await tapGlobe(195,422,firstFocus);
 await waitForCountryZoom();
 const locked=await canvas.screenshot();
 await page.waitForTimeout(500);
 assert(locked.equals(await canvas.screenshot()),'the first country tap stops rotation after focusing');
 const lockedAltitude=countries.find(country=>country.name==='New Zealand').focusedAltitude;
 await page.evaluate(()=>window.__events=[]);
 await page.mouse.move(195,422);await page.mouse.down();await page.mouse.move(260,440,{steps:5});await page.mouse.up();
 await waitForAltitude(lockedAltitude);
 const dragged=await canvas.screenshot();
 assert(!locked.equals(dragged),'dragging while locked rotates the globe');
 await page.waitForTimeout(500);
 assert(dragged.equals(await canvas.screenshot()),'locked globe stays still after the drag');
 await page.evaluate(()=>window.__events=[]);
 await page.mouse.click(10,10);
 await waitForAltitude(lockedAltitude);
 const unlocked=await canvas.screenshot();
 await page.waitForTimeout(500);
 assert(!unlocked.equals(await canvas.screenshot()),'clicking the surrounding sky preserves zoom and resumes autorotation');
 const oceanFocus=await tapCountryTwice('New Zealand',-38.4,176.0);
 await page.evaluate(()=>window.__events=[]);
 await tapGlobe(195,422,{lat:0,lng:-140,altitude:oceanFocus.focusedAltitude});
 await waitForAltitude(oceanFocus.focusedAltitude);
 const ocean=await canvas.screenshot();
 await page.waitForTimeout(500);
 assert(!ocean.equals(await canvas.screenshot()),'clicking the ocean preserves zoom and resumes autorotation');
 await page.emulateMedia({reducedMotion:'reduce'});
 const reducedFocus=await tapCountryTwice('New Zealand',-38.4,176.0);
 await page.evaluate(()=>window.__events=[]);
 await command('clearCountryFocus',{});
 await waitForAltitude(reducedFocus.focusedAltitude);
 const reducedOverview=await canvas.screenshot();
 await page.waitForTimeout(250);
 assert(reducedOverview.equals(await canvas.screenshot()),'reduced motion keeps the unlocked globe still');
 await page.emulateMedia({reducedMotion:'no-preference'});
 for(const [name,lat,lng] of [['Russia',66,179]]){
  await page.evaluate(()=>window.__events=[]);
  await command('focusPlace',{place:{id:`probe-${name.toLowerCase().replace(/ /g,'-')}`,kind:'country',name:{zh:name,en:name},lat,lng}});
  // focusPlace is host-initiated and does not echo placeSelected; its completed focus
  // is reported through cameraChanged, which lands on the requested coordinates.
  await page.waitForFunction(()=>window.__events.some(e=>e.event==='cameraChanged'));
  const settled=await page.evaluate(()=>window.__events.filter(e=>e.event==='cameraChanged').at(-1).data);
  assert.ok(Math.abs(settled.lat-lat)<2&&Math.abs(settled.lng-lng)<2,`${name} focus settles on target`);
  countries.push({name,lat,lng,selected:true,focus:true});
 }
 // Taiwan is merged into China in packages/globe/src/atlas.ts, so the same tap must
 // resolve to China instead of an unlisted country.
 const taiwan=await tapCountryTwice('China',23.7,121);
 assert.equal(taiwan.geoName,'China','Taiwan must resolve to China');
 assert.equal(String(taiwan.geoId),'156');
 countries.push({name:'Taiwan',lat:23.7,lng:121,geoId:taiwan.geoId,selected:true,mergedInto:'China'});
 const city={id:'test-paris',kind:'city',name:{zh:'巴黎',en:'Paris'},lat:48.86,lng:2.35};
 await page.evaluate(city=>{window.__events=[];for(const [event,data]of [['focusPlace',{place:city}],['setActive',{active:false}]])window.OurworldGlobe.receive({bridgeVersion:1,event,data});},city);
 const frozen=await page.evaluate(()=>window.__events.filter(e=>e.event==='cameraChanged').at(-1)?.data);
 assert(frozen);for(const key of ['lat','lng'])assert(Math.abs(frozen[key]-city[key])<1e-6);assert(Math.abs(frozen.altitude-.65)<1e-6);
 await page.mouse.click(195,422);await page.mouse.move(195,422);await page.mouse.down();await page.mouse.move(285,440,{steps:8});await page.mouse.up();
 await new Promise(r=>setTimeout(r,180));assert.equal(await page.evaluate(()=>window.__events.filter(e=>e.event==='placeSelected').length),0);
 await command('setActive',{active:true});await command('restoreCamera',frozen);
 for(const viewport of [{width:1440,height:900},{width:768,height:1024}]){
  await page.setViewportSize(viewport);await page.goto('http://127.0.0.1:5187/');await page.waitForFunction(()=>window.__events.some(e=>e.event==='rendererReady'));
  await page.screenshot({path:resolve(output,`earth-ready-${viewport.width}.png`)});
 }
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 const report={countries,coldChina,twoStepCountrySelection:true,manualRotationWhileLocked:true,zoomRetainedOnUnlock:true,focusCompletesBeforeFreeze:true,inactiveGlobeIgnoresTouch:true,externalRequests:external,errors,device:false};
 await writeFile(resolve(output,'globe-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}catch(error){await page.screenshot({path:resolve(output,'globe-test-failure.png')}).catch(()=>{});console.error(JSON.stringify({errors,external,countries,events:await page.evaluate(()=>window.__events).catch(()=>null),url:page.url()}));throw error;}finally{await browser.close();await server.httpServer.close();}
