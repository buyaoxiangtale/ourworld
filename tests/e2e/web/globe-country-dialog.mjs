import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from 'playwright';

const base=process.env.OURWORLD_WEB_URL||'http://127.0.0.1:8188',out=resolve('artifacts/globe-country-dialog');
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--no-proxy-server','--disable-gpu']});
const checks=[],errors=[];
const check=(value,label)=>{assert(value,label);checks.push(label);};
const country={id:'country-france',kind:'country',name:{zh:'法国',en:'France'},country:'France',lat:46,lng:2,description:{zh:'法国的城市与日常。',en:'Cities and everyday life in France.'},image:''};
try{
 for(const width of [390,1280]){
  const context=await browser.newContext({viewport:{width,height:844},hasTouch:true,locale:'zh-CN'});
  await context.addInitScript(()=>localStorage.setItem('ourworld.locale','zh'));
  // The renderer's two-tap bridge is exercised elsewhere. Isolate the host here
  // so both delayed touch clicks and unknown-country lookups are deterministic.
  await context.route('**/globe/**',route=>route.fulfill({contentType:'text/html',body:`<!doctype html><style>html,body{margin:0;width:100%;height:100%}</style><body><div>Interactive globe</div><script>
   const emit=(event,data)=>parent.postMessage({bridgeVersion:1,event,data},location.origin);
   window.OurworldGlobe={ready:true,receive(){}};let taps=0;
   addEventListener('pointerup',()=>{if(++taps%2)emit('cameraChanged',{lat:46,lng:2,altitude:1.1});else emit('placeSelected',{place:${JSON.stringify(country)}});});
   setTimeout(()=>emit('rendererReady',{texturesReady:true}),30);
  </script>`}));
  await context.route('**/api/v1/**',route=>{
   const url=new URL(route.request().url());
   if(url.pathname.startsWith('/api/v1/users/'))return route.fulfill({status:404,json:{message:'No demo fixture'}});
   if(url.pathname==='/api/v1/places/country-france')return route.fulfill({json:country});
   if(url.pathname==='/api/v1/places')return route.fulfill({json:{items:url.searchParams.get('kind')==='country'&&!url.searchParams.has('q')?[country]:[]}});
   return route.fulfill({json:{items:[]}});
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(base);
  const frame=page.frameLocator('.globe-frame');await frame.locator('body').waitFor();
  const canvas=await page.locator('.globe-frame').boundingBox(),x=canvas.x+canvas.width/2,y=canvas.y+canvas.height/2;
  const cdp=await context.newCDPSession(page);
  const tap=async()=>{await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});};
  await tap();check(await page.getByRole('dialog').count()===0,`${width}: first country tap only focuses`);
  await tap();let dialog=page.getByRole('dialog',{name:'法国',exact:true});await dialog.waitFor();
  // Safari can deliver a compatibility click after pointerup has opened a sheet.
  // It has no corresponding pointerdown inside that newly mounted overlay.
  await page.locator('.modal-backdrop').dispatchEvent('click',{detail:1,bubbles:true});
  await page.waitForTimeout(550);
  check(await dialog.isVisible()&&await dialog.getAttribute('data-slide-exiting')===null,`${width}: trailing touch click on backdrop keeps country details open`);
  await dialog.getByRole('button',{name:'Close',exact:true}).dispatchEvent('click',{detail:1,bubbles:true});await page.waitForTimeout(550);
  check(await dialog.isVisible(),`${width}: trailing touch click on close handle is ignored`);
  await dialog.getByRole('button',{name:'Close',exact:true}).click();await dialog.waitFor({state:'hidden'});
  check(true,`${width}: a new intentional click still closes the country sheet`);
  await frame.locator('body').evaluate(()=>parent.postMessage({bridgeVersion:1,event:'placeSelected',data:{geoName:'Unlisted country',geoId:'fixture',lat:10,lng:10}},location.origin));
  dialog=page.getByRole('dialog',{name:'Unlisted country',exact:true});await dialog.waitFor();
  await page.locator('.modal-backdrop').dispatchEvent('click',{detail:1,bubbles:true});await page.waitForTimeout(550);
  check(await dialog.isVisible(),`${width}: an asynchronously resolved country sheet also survives trailing clicks`);
  // The desktop app clips overlays to its central mobile viewport. Click within
  // that visible viewport rather than the backdrop's offscreen top-left corner.
  await page.mouse.click(width/2,110);await dialog.waitFor({state:'hidden'});
  check(true,`${width}: a deliberate backdrop click closes normally`);
  await frame.locator('body').evaluate((_,place)=>parent.postMessage({bridgeVersion:1,event:'placeSelected',data:{place}},location.origin),country);
  dialog=page.getByRole('dialog',{name:'法国',exact:true});await dialog.waitFor();
  await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});check(true,`${width}: Escape still dismisses country details`);
  await context.close();
 }
 check(errors.length===0,`no browser errors: ${errors.join('; ')}`);
 await writeFile(resolve(out,'report.json'),JSON.stringify({passed:true,checks,errors},null,2));console.log(`globe-country-dialog: ${checks.length} checks passed`);
}catch(error){await writeFile(resolve(out,'report.json'),JSON.stringify({passed:false,error:error.message,checks,errors},null,2));throw error;}finally{await browser.close();}
