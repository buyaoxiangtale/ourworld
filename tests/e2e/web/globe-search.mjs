import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const base=process.env.OURWORLD_WEB_URL||'http://127.0.0.1:8188';
const browser=await chromium.launch({args:['--no-proxy-server','--disable-gpu']});
const place=(id,kind,zh,en,country,parentId)=>({
 id,kind,country,parentId,name:{zh,en},description:{zh:'',en:''},image:'',lat:1,lng:2
});
const france=place('country-france','country','法国','France','France');
const paris=place('city-paris','city','巴黎','Paris','France',france.id);
const tokyo=place('city-tokyo','city','东京','Tokyo','Japan');
const japan=place('country-japan','country','日本','Japan','Japan');
const landmark=place('attraction-skytree','attraction','东京晴空塔','Tokyo Skytree','Japan',tokyo.id);
const requests=[];
try{
 const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
 await context.addInitScript(()=>{
  localStorage.setItem('ourworld.locale','zh');
  const viewport=new EventTarget();
  Object.assign(viewport,{height:innerHeight,offsetTop:0});
  Object.defineProperty(window,'visualViewport',{value:viewport});
  window.setSearchViewport=(height,offsetTop,event)=>{
   Object.assign(viewport,{height,offsetTop});
   viewport.dispatchEvent(new Event(event));
  };
 });
 await context.route('**/globe/**',route=>route.fulfill({contentType:'text/html',body:`<!doctype html><script>
 window.startGlobe=()=>{
  window.commands=[];
  window.OurworldGlobe={ready:true};
  addEventListener('message',event=>{if(event.data?.bridgeVersion===1)commands.push(event.data);});
  parent.postMessage({bridgeVersion:1,event:'rendererReady',data:{}},location.origin);
 };
 </script>`}));
 let failTokyo=true;
 await context.route('**/api/v1/**',route=>{
  const {pathname,searchParams}=new URL(route.request().url());
  const destinations=[france,paris,tokyo];
  if(pathname==='/api/v1/places'){
   const term=searchParams.get('q');
   const offset=Number(searchParams.get('offset')||0);
   if(term!==null)requests.push({term,offset});
   if(term==='Tokyo'&&failTokyo)return route.fulfill({status:503,json:{message:'暂时无法搜索'}});
   if(term==='Tokyo')return route.fulfill({json:{items:[tokyo],nextOffset:null}});
   if(term==='Skytree')return route.fulfill({json:{items:[landmark],nextOffset:null}});
   if(term==='Japan')return route.fulfill({json:{items:[japan],nextOffset:null}});
   if(term==='Paris')return route.fulfill({json:{items:[paris],nextOffset:null}});
   if(term==='France')return route.fulfill({json:{items:[france],nextOffset:null}});
   if(term==='')return route.fulfill({json:offset?{items:[tokyo],nextOffset:null}:{items:[france,paris],nextOffset:2}});
   return route.fulfill({json:{items:destinations.filter(p=>p.kind===searchParams.get('kind'))}});
  }
  if(pathname.startsWith('/api/v1/users/'))return route.fulfill({status:404,json:{message:'No demo profile fixture'}});
  const matched=destinations.find(p=>pathname===`/api/v1/places/${p.id}`);
  return route.fulfill({json:matched??{items:[]}});
 });
 const page=await context.newPage();
 page.setDefaultTimeout(10000);
 await page.goto(base,{waitUntil:'domcontentloaded'});
 const open=()=>page.locator('.home-search').click();
 const search=page.getByRole('dialog',{name:'探索地点'});
 const input=search.getByRole('searchbox');
 const rows=search.locator('.place-result strong');
 const close=()=>search.getByRole('button',{name:'关闭',exact:true}).click();
 const homepage=()=>page.locator('.mobile-app').boundingBox();
 const restingPage=await homepage();
 await open();
 await rows.first().waitFor();
 assert.deepEqual(await rows.allTextContents(),['法国','巴黎']);
 const expectControlsInViewport=async(height,top,event)=>{
  await page.evaluate(({height,top,event})=>window.setSearchViewport(height,top,event),{height,top,event});
  const field=await input.boundingBox();
  const button=await search.getByRole('button',{name:'关闭',exact:true}).boundingBox();
  for(const box of [field,button]){
   assert(box.y>=top-1&&box.y+box.height<=top+height+1,'search controls fit above the simulated keyboard');
  }
  assert.deepEqual(await search.boundingBox(),restingSheet,'the overlay keeps its full-page frame');
  assert.deepEqual(await homepage(),restingPage,'the underlying homepage stays in place');
  const surfaces=await search.evaluate(sheet=>{
   const body=sheet.querySelector('.sheet-body');
   return {
    panel:getComputedStyle(sheet).backgroundColor,
    backdrop:getComputedStyle(sheet.parentElement).backgroundColor,
    content:getComputedStyle(body).backgroundColor,
    contentBottom:body.getBoundingClientRect().bottom,
   };
  });
  assert.equal(surfaces.panel,'rgba(0, 0, 0, 0)');
  assert.equal(surfaces.backdrop,'rgba(0, 0, 0, 0)');
  assert.equal(surfaces.content,'rgb(37, 34, 37)');
  assert.equal(surfaces.contentBottom,restingSheet.height,'the search surface extends behind the keyboard toolbar');
  return field;
 };
 const restingSheet=await search.boundingBox();
 assert.deepEqual(restingSheet,{x:0,y:0,width:390,height:844});
 const restingField=await input.boundingBox();
 assert.equal((await expectControlsInViewport(325,0,'resize')).y,restingField.y,'the keyboard does not push up the input');
 const movedField=await expectControlsInViewport(220,135,'scroll');
 assert(movedField.y>=135&&movedField.y<200,'the field follows viewport panning');
 const results=search.locator('.explore-search-results');
 const loadMore=search.getByRole('button',{name:'加载更多地点'});
 const listBottom=await results.evaluate(el=>el.getBoundingClientRect().bottom);
 const nextPageBeforeScroll=await loadMore.boundingBox();
 assert(nextPageBeforeScroll.y+nextPageBeforeScroll.height>355&&listBottom>nextPageBeforeScroll.y,'the search list is rendered behind the simulated toolbar');
 assert(await results.evaluate(el=>el.scrollHeight>el.clientHeight),'results scroll inside the available space');
 await results.evaluate(el=>el.scrollTop=el.scrollHeight);
 const nextPageAfterScroll=await loadMore.boundingBox();
 assert(nextPageAfterScroll.y+nextPageAfterScroll.height<=355,'the last control can scroll above the keyboard');
 assert.equal((await input.boundingBox()).y,movedField.y,'scrolling results keeps the input visible');
 const restoredField=await expectControlsInViewport(844,0,'resize');
 assert(Math.abs(restoredField.y-restingField.y)<1,'dismissing the keyboard restores the original sheet position');
 await loadMore.click();
 await search.getByText('东京',{exact:true}).waitFor();
 assert.deepEqual(await rows.allTextContents(),['法国','巴黎','东京']);
 assert(requests.some(request=>request.term===''&&request.offset===2));

 await input.fill('Paris');
 await search.getByText('巴黎',{exact:true}).waitFor();
 await input.fill('Tokyo');
 assert.equal(await rows.count(),0,'changing the query immediately clears earlier results');
 await input.press('Enter');
 assert(await search.isVisible(),'Enter does not choose a result while the request is pending');
 await search.getByRole('alert').waitFor();
 assert.equal(await rows.count(),0,'failed requests do not show results for a previous query');
 failTokyo=false;
 await search.getByRole('button',{name:'重试'}).click();
 await search.getByText('东京',{exact:true}).waitFor();
 await close();
 await open();
 assert.equal(await input.inputValue(),'');
 assert.equal(await rows.count(),0,'reopening does not show the previous query');
 await input.fill('Paris');
 await search.getByText('巴黎',{exact:true}).waitFor();
 await input.press('Enter');
 const parisDetails=page.getByRole('dialog',{name:'巴黎',exact:true});
 await search.waitFor({state:'detached'});
 assert.equal(await parisDetails.count(),0,'a search result does not directly open details');

 const globe=page.frames().find(frame=>frame.url().includes('/globe/'));
 const waitForLocate=id=>globe.waitForFunction(id=>window.commands.filter(command=>command.event==='focusPlace'&&command.data.locateOnly).at(-1)?.data.place.id===id,id);
 const selectOnGlobe=place=>globe.evaluate(place=>parent.postMessage({bridgeVersion:1,event:'placeSelected',data:{place}},location.origin),place);
 await globe.evaluate(()=>window.startGlobe());
 await waitForLocate(france.id);
 const country=page.getByRole('dialog',{name:'法国',exact:true});
 assert.equal(await country.count(),0,'city results locate their country without opening details');
 await open();
 await input.fill('Skytree');
 await search.getByText('东京晴空塔',{exact:true}).click();
 await search.waitFor({state:'detached'});
 await waitForLocate(japan.id);
 assert(requests.some(request=>request.term==='Japan'),'the parent country is fetched when absent from the catalog');
 assert.equal(await page.getByRole('dialog',{name:'日本',exact:true}).count(),0);
 await open();
 await input.fill('France');
 await search.getByText('法国',{exact:true}).click();
 await search.waitFor({state:'detached'});
 await waitForLocate(france.id);
 assert.equal(await country.count(),0,'country results also locate without opening details');
 await selectOnGlobe(france);
 await country.getByRole('button',{name:'浏览城市',exact:true}).waitFor();
 assert.equal(await country.getByRole('button',{name:'搜索该国城市',exact:true}).count(),0);
 await country.getByRole('button',{name:'Close',exact:true}).click();
 await open();
 await search.getByRole('button',{name:'加载更多地点'}).waitFor();
 assert.deepEqual(await rows.allTextContents(),['法国','巴黎']);
 console.log('globe-search: pagination, stale-result protection, retry, keyboard selection, and deferred focus passed');
}finally{await browser.close();}
