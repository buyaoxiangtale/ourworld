import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from 'playwright';

const base=process.env.OURWORLD_WEB_URL||'http://127.0.0.1:8188',out=resolve('artifacts/country-cities');await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--no-proxy-server','--disable-gpu']});
const checks=[],errors=[];const check=(value,label)=>{assert(value,label);checks.push(label);};
const country={id:'country-france',kind:'country',country:'France',name:{zh:'法国',en:'France'},lat:46,lng:2,image:'/api/v1/fixture/france.svg',description:{zh:'法国的旅行，从城市街巷开始。\n\n留一点时间，发现日常的风景。',en:'Discover the streets of France.\n\nLeave time for everyday life.'}};
const cities=[['paris','巴黎','Paris'],['lyon','里昂','Lyon'],['nice','尼斯','Nice']].map(([id,zh,en])=>({...country,id:`city-${id}`,kind:'city',parentId:country.id,name:{zh,en},image:`/api/v1/fixture/${id}.svg`,description:{zh:`在${zh}的街头，发现建筑、美食与当地人的日常。`,en:`Discover architecture, food and everyday life in ${en}.`}}));
let currentPage;
try{
 for(const width of [390,1280]){
  let mode='many',fail=false,cityRequests=0;
  const context=await browser.newContext({viewport:{width,height:844},hasTouch:true,locale:'zh-CN'});
  await context.addInitScript(()=>localStorage.setItem('ourworld.locale','zh'));
  await context.route('**/globe/**',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><body>Globe<script>window.__commands=[];window.OurworldGlobe={ready:true,receive:command=>window.__commands.push(command)};addEventListener("message",e=>{if(e.data?.bridgeVersion===1)window.__commands.push(e.data)});setTimeout(()=>parent.postMessage({bridgeVersion:1,event:"rendererReady",data:{texturesReady:true}},location.origin),30)</script>'}));
  await context.route('**/api/v1/**',route=>{
   const url=new URL(route.request().url()),path=url.pathname;
   if(path.startsWith('/api/v1/fixture/'))return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="700" height="500"><rect width="700" height="500" fill="#294969"/><circle cx="500" cy="130" r="70" fill="#dfb76a"/><path d="M0 400V200H80V300H160V160H240V230H320V90H350V230H400V300H480V250H600V180H700V500H0" fill="#172840"/></svg>'});
   if(path.startsWith('/api/v1/users/'))return route.fulfill({status:404,json:{message:'No demo fixture'}});
   if(path==='/api/v1/places'){
    if(url.searchParams.has('parentId')){cityRequests++;if(fail){fail=false;return route.fulfill({status:503,json:{message:'城市暂时无法加载'}});}return route.fulfill({json:{items:mode==='empty'?[]:mode==='single'?cities.slice(0,1):cities}});}
    return route.fulfill({json:{items:url.searchParams.get('kind')==='country'?[country]:cities}});
   }
   if(path.startsWith('/api/v1/places/')){
    const place=[country,...cities].find(place=>path.endsWith('/'+place.id))||country;
    const description=place.id==='city-lyon'?{...place.description,zh:(place.description.zh+'\n\n').repeat(24)}:place.description;
    return route.fulfill({json:{...place,description}});
   }
   return route.fulfill({json:{items:[]}});
  });
  const page=await context.newPage();currentPage=page;page.on('pageerror',error=>errors.push(error.message));await page.goto(base);
  const frame=page.frameLocator('.globe-frame');await frame.locator('body').waitFor();
  const openCountry=async()=>{await frame.locator('body').evaluate((_,place)=>parent.postMessage({bridgeVersion:1,event:'placeSelected',data:{place}},location.origin),country);await page.getByRole('dialog',{name:'法国',exact:true}).waitFor();};
  const cards=()=>page.getByRole('dialog',{name:'浏览城市',exact:true});
  const position=async index=>page.waitForFunction(value=>{
   const track=document.querySelector('.country-city-track'),card=track?.children[value-1];if(!track||!card)return false;
   const bounds=track.getBoundingClientRect(),city=card.getBoundingClientRect();
   return document.querySelector('.country-city-controls [aria-live]')?.textContent===`${value} / 3`&&Math.abs(city.x+city.width/2-bounds.x-bounds.width/2)<2;
  },index);
  const closeCards=async()=>{await cards().getByRole('button',{name:'返回国家信息',exact:true}).click();await page.locator('.country-cities-page').waitFor({state:'hidden'});await page.getByRole('dialog',{name:'法国',exact:true}).getByRole('button',{name:'Close',exact:true}).click();};
  await openCountry();const modal=page.getByRole('dialog',{name:'法国',exact:true}),modalBox=await modal.boundingBox();
  check(await modal.evaluate(el=>el.classList.contains('modal'))&&modalBox.y>0,`${width}: country information is a centered modal`);
  check(await page.locator('.home-search').isHidden(),`${width}: the home search outline is hidden behind country information`);
  check(await modal.locator('.modal-footer').getByRole('button').count()===1,`${width}: country information has one footer action`);
  check(await modal.getByRole('button',{name:'切换语言'}).count()===0,`${width}: country information uses the interface language`);
  check(await modal.locator('.place-detail-description>p').count()===2&&await modal.locator('.place-result').count()===0,`${width}: modal shows country paragraphs without a city list`);
  check(cityRequests===0,`${width}: cities load only after entering the browser`);
  await modal.getByRole('button',{name:'浏览城市',exact:true}).click();await cards().waitFor();await cards().locator('.country-city-card').first().waitFor();
  check(await cards().locator('.country-city-card').count()===3,`${width}: cities are displayed as cards`);
  check(await cards().getByRole('button',{name:'上一座城市',exact:true}).isDisabled(),`${width}: previous control is disabled at the beginning`);
  check(await frame.locator('body').evaluate(()=>window.__commands.filter(command=>command.event==='setActive').at(-1)?.data.active===false),`${width}: globe is paused behind the country browser`);
  await page.screenshot({path:resolve(out,`cards-${width}.png`),animations:'disabled'});
  await cards().getByRole('button',{name:'下一座城市',exact:true}).click();await position(2);
  check(await cards().locator('.country-city-card.is-active h2').textContent()==='里昂',`${width}: next control centers the next city`);
  await cards().locator('.country-city-track').focus();await page.keyboard.press('ArrowRight');await position(3);
  check(await cards().getByRole('button',{name:'下一座城市',exact:true}).isDisabled(),`${width}: keyboard navigation reaches the last card without wrapping`);
  await page.keyboard.press('ArrowLeft');await position(2);
  const browserLayout=()=>page.locator('.country-city-track').evaluate(track=>{
   const card=track.querySelector('.is-active');
   return {track:track.getBoundingClientRect().toJSON(),card:card.getBoundingClientRect().toJSON(),left:track.scrollLeft};
  });
  await page.locator('.country-city-card.is-active').evaluate(card=>Promise.all(card.getAnimations().map(animation=>animation.finished)));
  const beforeDetails=await browserLayout();
  await cards().locator('.country-city-card.is-active').getByRole('button',{name:'查看城市',exact:true}).click();
  const city=page.getByRole('dialog',{name:'里昂',exact:true});await city.waitFor();check(await city.getByRole('button',{name:'找当地人',exact:true}).isVisible(),`${width}: viewing a card opens the existing city details`);
  assert.deepEqual(await browserLayout(),beforeDetails,`${width}: the carousel keeps its layout behind city details`);
  check(await city.getByRole('button',{name:'切换语言'}).count()===0,`${width}: city information uses the interface language`);
  await page.screenshot({path:resolve(out,`city-details-${width}.png`),animations:'disabled'});
  const cityBounds=await city.boundingBox(),appBounds=await page.locator('.mobile-app').boundingBox();
  check(Math.abs(cityBounds.y-appBounds.y)<3&&cityBounds.height>=appBounds.height-4,`${width}: city details fill the complete app viewport`);
  check(await city.evaluate(el=>el.closest('.city-detail-layer').parentElement.classList.contains('mobile-app')),`${width}: city details are outside the carousel clipping container`);
  if(width===390){
   const description=city.locator('.place-detail-description');
   await description.locator('p').nth(23).waitFor({state:'attached'});
   check(await description.evaluate(el=>el.scrollHeight>el.clientHeight),`${width}: long city descriptions scroll inside their region`);
   const actions=await city.locator('.city-actions').boundingBox();
   check(actions.y+actions.height<=cityBounds.y+cityBounds.height,`${width}: city actions fit on the first screen`);
   const descriptionBounds=await description.boundingBox();
   check(actions.y-descriptionBounds.y-descriptionBounds.height<=16,`${width}: the city actions follow the description`);
   check(await city.locator('.city-actions>.button').evaluateAll(buttons=>buttons.every(button=>{
    const {x,y,width,height}=button.getBoundingClientRect();
    return button.contains(document.elementFromPoint(x+width/2,y+height-2));
   })),`${width}: both city actions are fully exposed for tapping`);
   await description.evaluate(el=>{el.scrollTop=el.scrollHeight;});
   assert.deepEqual(await city.locator('.city-actions').boundingBox(),actions,`${width}: scrolling the description leaves actions in place`);
  }
  check(await page.locator('.bottom-nav').isHidden(),`${width}: city details use the navigation area too`);
  await city.getByRole('button',{name:'返回城市列表',exact:true}).click();await city.waitFor({state:'hidden'});await position(2);
  assert.deepEqual(await browserLayout(),beforeDetails,`${width}: returning keeps the same carousel frame and scroll position`);
  check(await page.locator('.bottom-nav').isVisible(),`${width}: returning from full-screen details restores navigation`);
  check(await cards().isVisible(),`${width}: returning from city details keeps the browser position`);
  await cards().getByRole('button',{name:'上一座城市',exact:true}).click();await position(1);
  const track=cards().locator('.country-city-track'),box=await track.boundingBox(),cdp=await context.newCDPSession(page);
  const y=box.y+box.height*.3,start=box.x+box.width*.8,end=box.x+box.width*.2;
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:start,y}]});
  for(let i=1;i<=10;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:start+(end-start)*i/10,y}]});await page.waitForTimeout(35);}
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await position(2);
  check(true,`${width}: a native horizontal touch swipe changes cities`);
  await cards().getByRole('button',{name:'上一座城市',exact:true}).click();await position(1);
  await page.mouse.move(start,y);await page.mouse.down();await page.mouse.move(end,y,{steps:16});await page.mouse.up();await position(2);
  check(true,`${width}: desktop mouse dragging changes cities`);
  check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${width}: carousel causes no page overflow`);
  await closeCards();check(await page.getByRole('dialog').count()===0,`${width}: back returns to country information and close returns to the globe`);
  for(const variant of ['single','empty','error']){
   mode=variant==='error'?'many':variant;fail=variant==='error';await openCountry();await page.getByRole('button',{name:'浏览城市',exact:true}).click();await cards().waitFor();
   if(variant==='single'){await cards().locator('.country-city-card').waitFor();check(await cards().getByRole('button',{name:'下一座城市',exact:true}).isDisabled()&&await cards().getByRole('button',{name:'上一座城市',exact:true}).isDisabled(),`${width}: a single city disables both navigation controls`);}
   if(variant==='empty'){await cards().getByText('这里的城市尚未收录',{exact:true}).waitFor();check(await cards().locator('.country-city-card').count()===0,`${width}: an empty country shows a useful empty state`);}
   if(variant==='error'){await cards().getByRole('alert').waitFor();await cards().getByRole('button',{name:'↻',exact:true}).click();await cards().locator('.country-city-card').first().waitFor();check(await cards().locator('.country-city-card').count()===3,`${width}: failed city loading can be retried`);}
   await closeCards();
  }
  await page.emulateMedia({reducedMotion:'reduce'});await openCountry();await page.getByRole('button',{name:'浏览城市',exact:true}).click();await cards().locator('.country-city-card').first().waitFor();await page.keyboard.press('Escape');await page.locator('.country-cities-page').waitFor({state:'hidden'});check(await page.locator('[data-slide-exiting]').count()===0,`${width}: reduced motion closes the browser without an exit overlay`);
  await context.close();
 }
 check(errors.length===0,`no browser errors: ${errors.join('; ')}`);
 await writeFile(resolve(out,'report.json'),JSON.stringify({passed:true,checks,errors},null,2));console.log(`country-cities: ${checks.length} checks passed`);
}catch(error){await currentPage?.screenshot({path:resolve(out,'failure.png')}).catch(()=>{});await writeFile(resolve(out,'report.json'),JSON.stringify({passed:false,error:error.message,checks,errors},null,2));throw error;}finally{await browser.close();}
