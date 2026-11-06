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
const context=await browser.newContext({viewport:{width:390,height:844}});
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
// Software rendering makes every cross-context round-trip slow enough that the globe's
// post-restore spin hold can lapse before a CDP click lands. Snap the camera and
// dispatch the pointer tap inside one iframe task, exactly like a real touch.
const tapGlobe=(x,y,pov)=>page.evaluate(({x,y,pov})=>new Promise(resolve=>{
 window.OurworldGlobe.receive({bridgeVersion:1,event:'restoreCamera',data:pov});
 // Let two frames pass so residual spin momentum settles, then re-snap: the second
 // restore lands on a still camera and the tap resolves exactly where it points.
 requestAnimationFrame(()=>requestAnimationFrame(()=>{
  window.OurworldGlobe.receive({bridgeVersion:1,event:'restoreCamera',data:pov});
  const target=document.querySelector('#globe canvas');
  const proto=Element.prototype,capture=proto.setPointerCapture,release=proto.releasePointerCapture;
  proto.setPointerCapture=function(){};proto.releasePointerCapture=function(){};
  try{for(const type of ['pointerdown','pointerup'])target.dispatchEvent(new PointerEvent(type,{pointerId:41,isPrimary:true,pointerType:'touch',bubbles:true,cancelable:true,clientX:x,clientY:y}));}
  finally{proto.setPointerCapture=capture;proto.releasePointerCapture=release;}
  resolve();
 }));
}),{x,y,pov});
try{
 await page.goto('http://127.0.0.1:5187/globe/index.html');
 await page.waitForFunction(()=>window.__events.some(e=>e.event==='rendererReady'));
 // New Zealand anchors inland on the North Island: an archipelago's centroid often
 // falls in open water at 1:110m resolution.
 // Physical taps stay compact (no screenshots or camera waits between them) so each
 // lands inside the post-selection spin hold; night-earth already covers the
 // cameraChanged handshake. New Zealand anchors inland on the North Island so the
 // tap keeps antimeridian-adjacent hit-testing covered; Russia (whose dateline
 // polygons are the most flaky under software rendering) uses a focus probe.
 for(const [name,lat,lng]of [['Germany',51,10],['Indonesia',-7.6,110.2],['New Zealand',-38.4,176.0]]){
  await page.evaluate(pov=>{window.__pov=pov},{lat,lng,altitude:2.8});
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await page.evaluate(()=>window.__events=[]);
  await tapGlobe(195,422,await page.evaluate(()=>window.__pov));
  await page.waitForFunction(()=>window.__events.some(e=>e.event==='placeSelected'));
  const selection=await page.evaluate(()=>window.__events.find(e=>e.event==='placeSelected').data);
  assert.equal(selection.geoName,name);
  countries.push({name,lat,lng,geoId:selection.geoId,selected:true,tap:true});
 }
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
 await page.evaluate(pov=>{window.__pov=pov},{lat:23.7,lng:121,altitude:2.8});
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 await page.evaluate(()=>window.__events=[]);
 await tapGlobe(195,422,await page.evaluate(()=>window.__pov));
 await page.waitForFunction(()=>window.__events.some(e=>e.event==='placeSelected'));
 const taiwan=await page.evaluate(()=>window.__events.find(e=>e.event==='placeSelected').data);
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
 const report={countries,focusCompletesBeforeFreeze:true,inactiveGlobeIgnoresTouch:true,externalRequests:external,errors,device:false};
 await writeFile(resolve(output,'globe-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}catch(error){await page.screenshot({path:resolve(output,'globe-test-failure.png')}).catch(()=>{});console.error(JSON.stringify({errors,external,countries,events:await page.evaluate(()=>window.__events).catch(()=>null),url:page.url()}));throw error;}finally{await browser.close();await server.httpServer.close();}
