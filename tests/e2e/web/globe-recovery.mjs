import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from 'playwright';
const base=process.env.OURWORLD_WEB_URL||'http://127.0.0.1:8188',out=resolve('artifacts/globe-recovery');await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--no-proxy-server','--disable-gpu','--enable-unsafe-swiftshader']});
const checks=[],errors=[],measurements=[];const check=(value,label)=>{assert(value,label);checks.push(label);};
const city={id:'city-paris',kind:'city',name:{zh:'巴黎',en:'Paris'},country:'France',lat:48.86,lng:2.35,description:{zh:'',en:''},image:''};
const country={...city,id:'country-france',kind:'country',name:{zh:'法国',en:'France'}};
const setup=async({hidden=false}={})=>{
 const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
 await context.addInitScript(hidden=>{
  if(window===parent){window.__events=[];addEventListener('message',event=>{if(event.data?.bridgeVersion===1)window.__events.push(event.data);});if(hidden)sessionStorage.setItem('ourworld.frontend.tab','profile');localStorage.setItem('ourworld.locale','zh');}
  else{window.__loadToken=crypto.randomUUID();window.__commands=[];addEventListener('message',event=>{if(event.data?.bridgeVersion===1)window.__commands.push(event.data);});}
 },hidden);
 await context.route('**/api/v1/**',route=>{const url=new URL(route.request().url());if(url.pathname.includes('/users/'))return route.fulfill({status:404,json:{message:'No demo fixture'}});return route.fulfill({json:{items:url.pathname.endsWith('/places')?(url.searchParams.get('kind')==='country'?[country]:[city]):[]}});});
 const page=await context.newPage();page.setDefaultTimeout(20000);page.on('pageerror',error=>errors.push(error.message));await page.goto(base,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(hidden=>hidden?document.querySelector('.globe-frame')?.contentWindow?.OurworldGlobe?.ready:window.__events.some(event=>event.event==='rendererReady'&&event.data.texturesReady),hidden,{timeout:45000});
 return {page,context};
};
const frame=page=>page.frames().find(frame=>frame.url().includes('/globe/'));
const command=(page,event,data)=>frame(page).evaluate(message=>window.OurworldGlobe.receive(message),{bridgeVersion:1,event,data});
const visible=async(page,label)=>{
 const shot=await page.frameLocator('.globe-frame').locator('#globe canvas').first().screenshot({path:resolve(out,`${label}.png`)});
 const result=await page.evaluate(async data=>{const image=new Image();image.src='data:image/png;base64,'+data;await image.decode();const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);const size=Math.floor(Math.min(image.width,image.height)*.35),pixels=ctx.getImageData(Math.floor((image.width-size)/2),Math.floor((image.height-size)/2),size,size).data;let lit=0,min=255,max=0;for(let i=0;i<pixels.length;i+=4){const value=Math.max(pixels[i],pixels[i+1],pixels[i+2]);if(value>30)lit++;min=Math.min(min,value);max=Math.max(max,value);}const all=ctx.getImageData(0,0,canvas.width,canvas.height).data;let fullLit=0,fullMin=255,fullMax=0;for(let i=0;i<all.length;i+=4){const value=Math.max(all[i],all[i+1],all[i+2]);if(value>30)fullLit++;fullMin=Math.min(fullMin,value);fullMax=Math.max(fullMax,value);}return {lit:lit/(pixels.length/4),contrast:max-min,fullLit:fullLit/(all.length/4),fullContrast:fullMax-fullMin};},shot.toString('base64'));
 measurements.push({label,...result});check(result.lit>.15&&result.contrast>30||result.fullLit>.01&&result.fullContrast>40,`${label}: the textured Earth is visible, rather than only stars`);console.log(`globe-recovery: ${label} visible`);
};
const lose=async page=>{await frame(page).evaluate(()=>{const canvas=document.querySelector('#globe canvas');const gl=canvas.getContext('webgl2');window.__lostContext=gl.getExtension('WEBGL_lose_context');if(!window.__lostContext)throw new Error('WebGL context-loss extension unavailable');window.__lostContext.loseContext();});};
try{
 const {page,context}=await setup();await page.waitForTimeout(1400);await visible(page,'initial');
 const token=await frame(page).evaluate(()=>window.__loadToken);
 for(let i=1;i<=2;i++){
  const count=await page.evaluate(()=>window.__events.filter(event=>event.event==='rendererReady'&&event.data.recovered).length);await lose(page);await page.waitForTimeout(180);
  check(await frame(page).evaluate(()=>!window.OurworldGlobe.ready&&!document.querySelector('#boot').classList.contains('done')),`loss ${i}: renderer readiness is cleared and recovery loading is shown`);
  await frame(page).evaluate(()=>window.__lostContext.restoreContext());
  await page.waitForFunction(count=>window.__events.filter(event=>event.event==='rendererReady'&&event.data.recovered).length>count,count);await page.waitForTimeout(850);await visible(page,`restored-${i}`);
  check(await frame(page).evaluate(()=>window.__loadToken)===token,`restore ${i}: context recovery keeps the same iframe and scene`);
 }
 await command(page,'setActive',{active:false});await page.setViewportSize({width:430,height:900});await page.waitForTimeout(550);await visible(page,'paused-resize');
 const frozenA=await page.frameLocator('.globe-frame').locator('#globe canvas').first().screenshot();await page.waitForTimeout(250);const frozenB=await page.frameLocator('.globe-frame').locator('#globe canvas').first().screenshot();check(frozenA.equals(frozenB),'resizing a paused renderer repaints without restarting rotation');
 await command(page,'setActive',{active:true});
 for(let i=0;i<3;i++){await page.locator('[data-tab="profile"]').click();await page.setViewportSize({width:390+i*10,height:844});await page.getByRole('button',{name:'地球',exact:true}).click();await page.waitForTimeout(700);await visible(page,`tab-return-${i}`);}
 await frame(page).evaluate(()=>{window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));window.dispatchEvent(new Event('focus'));});await page.waitForTimeout(750);await visible(page,'page-return');
 await page.emulateMedia({reducedMotion:'no-preference'});await command(page,'setActive',{active:true});await page.waitForTimeout(800);await lose(page);await page.waitForTimeout(180);await frame(page).evaluate(()=>window.__lostContext.restoreContext());await page.waitForTimeout(1100);await visible(page,'rotating-restore');
 await command(page,'focusPlace',{place:city});await page.waitForFunction(()=>window.__events.some(event=>event.event==='cameraChanged'&&Math.abs(event.data.lat-48.86)<.01));
 const camera=await page.evaluate(()=>window.__events.filter(event=>event.event==='cameraChanged').at(-1).data),oldToken=await frame(page).evaluate(()=>window.__loadToken);await lose(page);
 await page.waitForFunction(token=>{const globe=document.querySelector('.globe-frame')?.contentWindow;return globe?.__loadToken&&globe.__loadToken!==token&&globe.OurworldGlobe?.ready;},oldToken,{timeout:20000});
 await page.waitForTimeout(850);await visible(page,'automatic-reload');
 const restored=await frame(page).evaluate(()=>({markers:window.__commands.find(command=>command.event==='setMarkers'),camera:window.__commands.find(command=>command.event==='restoreCamera'),active:window.__commands.filter(command=>command.event==='setActive').at(-1)}));
 check(restored.markers?.data.places.some(place=>place.id==='city-paris'),'automatic reload restores city and country markers');
 check(restored.camera&&['lat','lng','altitude'].every(key=>Math.abs(restored.camera.data[key]-camera[key])<.001),'automatic reload restores the previous camera');
 check(restored.active?.data.active===true&&await page.locator('.globe-fallback').count()===0,'automatic reload resumes the globe and clears the error state');
 await context.close();
 const hidden=await setup({hidden:true});check(await hidden.page.locator('.earth-panel').isHidden(),'globe can finish loading while another tab is selected');await hidden.page.getByRole('button',{name:'地球',exact:true}).click();await hidden.page.waitForTimeout(1000);await visible(hidden.page,'initial-hidden-tab');await hidden.context.close();
 const failed=await browser.newContext({viewport:{width:390,height:844}});let loads=0;
 await failed.route('**/globe/index.html',route=>{loads++;return route.fulfill({contentType:'text/html',body:'<!doctype html><script>setTimeout(()=>parent.postMessage({bridgeVersion:1,event:"rendererError",data:{message:"fixture failure"}},location.origin),50)</script>'});});
 await failed.route('**/api/v1/**',route=>route.request().url().includes('/users/')?route.fulfill({status:404,json:{message:'No demo fixture'}}):route.fulfill({json:{items:[]}}));const failure=await failed.newPage();await failure.goto(base);await failure.getByRole('button',{name:'重新加载地球',exact:true}).waitFor();await failure.waitForTimeout(1400);check(loads===2,'repeated startup failures stop after one automatic retry');await failure.getByRole('button',{name:'重新加载地球',exact:true}).click();await failure.waitForTimeout(250);check(loads===3,'manual retry remains available after automatic recovery fails');await failed.close();
 check(errors.length===0,`no browser errors: ${errors.join('; ')}`);await writeFile(resolve(out,'report.json'),JSON.stringify({passed:true,checks,measurements,errors},null,2));console.log(`globe-recovery: ${checks.length} checks passed`);
}catch(error){await writeFile(resolve(out,'report.json'),JSON.stringify({passed:false,error:error.message,checks,measurements,errors},null,2));throw error;}finally{await browser.close();}
