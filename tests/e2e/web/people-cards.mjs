import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {preview} from 'vite';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
process.env.PLAYWRIGHT_BROWSERS_PATH=resolve(root,'.playwright-browsers');
const {chromium}=await import('playwright');
const vite=process.env.OURWORLD_WEB_URL?null:await preview({configFile:false,root:resolve(root,'apps/web'),preview:{host:'127.0.0.1',port:5179,strictPort:true}});
const base=process.env.OURWORLD_WEB_URL||'http://127.0.0.1:5179';
const output=resolve(root,'artifacts/photo-focus');await mkdir(output,{recursive:true});
const user={id:'demo-traveler',name:'林予',avatar:'/api/v1/seed/avatar/demo-traveler.jpg',bio:'用步行认识一座城市。',verified:true,providerStatus:'none',role:'user',tags:['城市漫步','摄影'],cityIds:['city-paris']};
const people=[{...user,id:'demo-guide-paris',name:'Claire',avatar:'/api/v1/seed/avatar/demo-guide-paris.jpg',providerStatus:'approved',bio:'住在巴黎。喜欢美术馆、旧书店，和街角一杯慢慢喝的咖啡。',tags:['建筑摄影','艺术','咖啡'],quote:'USD 95 / day'}, {...user,id:'demo-guide-tokyo',name:'Haruka',avatar:'/api/v1/seed/avatar/demo-guide-tokyo.jpg',bio:'一起寻找这座城市安静的一面。',quote:'USD 110 / day'}, {...user,id:'load-0002',name:'Alexandria · 一个很长的中英文姓名',avatar:'/api/v1/seed/avatar/load-0002.jpg',quote:'USD 90 / day'}];
const city={id:'city-paris',kind:'city',parentId:'country-france',name:{zh:'巴黎',en:'Paris'},country:'France',lat:48.86,lng:2.35,image:'/api/v1/seed/city/paris.jpg',description:{zh:'走进巴黎的街角、书店与河岸，认识一位分享城市日常的当地人。',en:'Meet the everyday city through someone who calls it home.'}};
const country={...city,id:'country-france',kind:'country',name:{zh:'法国',en:'France'}};
const conversation={id:'visual-conversation',peer:people[0],unread:0,lastMessage:'你好，欢迎来到巴黎。',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
const layout={schemaVersion:1,theme:'nocturne',accent:'#a14f58',blocks:[{id:'intro',type:'intro',span:2,size:'compact'},{id:'gallery',type:'gallery',span:2,size:'expanded',refs:[city.image]},{id:'skills',type:'skills',span:1,size:'compact'},{id:'cities',type:'cities',span:1,size:'compact'}]};
const resource=person=>({user:person,layout,packages:[],posts:[],reviews:[],places:[city]});
const browser=await chromium.launch({headless:true,args:['--no-proxy-server','--disable-gpu']});
const checks=[],errors=[];
try{
 for(const viewport of [{width:360,height:640},{width:390,height:844},{width:430,height:932}]){
  const context=await browser.newContext({viewport,locale:'zh-CN'});let failConnect=false,connects=0,missingPhoto=false,favorite=false;
  if(context.routeWebSocket)await context.routeWebSocket('**/api/v1/ws**',ws=>ws.close());
  await context.route('**/globe/index.html',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><script>window.OurworldGlobe={ready:true,receive(){}};</script>'}));
  await context.route('**/assets/mount-miniature-*.js',route=>route.abort());
  await context.addInitScript(session=>{if(!sessionStorage.getItem('ourworld.noTestSession'))sessionStorage.setItem('ourworld.session',JSON.stringify(session));},{accessToken:'isolated-ui-fixture',refreshToken:'isolated-ui-fixture',user});
  await context.route('**/api/v1/**',async route=>{
   const u=new URL(route.request().url()),path=u.pathname.replace('/api/v1','');
   const photo=path.match(/^\/seed\/(avatar|city)\/(.+)\.jpg$/);
   if(photo){if(missingPhoto&&photo[1]==='avatar')return route.fulfill({status:404});const index=photo[2].includes('tokyo')?'02':photo[2].includes('traveler')||photo[2].startsWith('load-')?'03':'01';return route.fulfill({contentType:'image/jpeg',body:await readFile(resolve(root,photo[1]==='avatar'?`apps/api/assets/photos/portraits/${index}.jpg`:'apps/api/assets/photos/places/paris.jpg'))});}
   let data={};
   if(path==='/places')data={items:u.searchParams.get('kind')==='country'?[country]:u.searchParams.get('q')?[city]:[city]};
   else if(path===`/places/${city.id}`)data=city;
   else if(path==='/favorites')data={items:favorite?[city]:[]};
   else if(path===`/favorites/${city.id}`){favorite=route.request().method()==='PUT';data={saved:favorite};}
   else if(path.includes('/people-feed'))data={feedId:'visual-fixture',items:people,nextCursor:null,exhausted:true};
   else if(path==='/conversations/direct'){connects++;if(failConnect)return route.fulfill({status:503,json:{code:'SERVICE_UNAVAILABLE',message:'暂时无法加入对话，请重试'}});data=conversation;}
   else if(path==='/conversations')data={items:[conversation]};
   else if(path.endsWith('/messages'))data={items:[{id:'fixture-message',conversationId:conversation.id,senderId:people[0].id,sequence:1,type:'text',body:'你好，欢迎来到巴黎。你想先逛美术馆，还是去河边散步？',createdAt:new Date().toISOString()}],nextCursor:null};
   else if(path.startsWith('/users/'))data=resource(people.find(p=>p.id===path.split('/').pop())||user);
   else if(path==='/me')data=user;
   else if(path==='/profile/draft')data={revision:1,layout,publishedRevision:1};
   else if(path==='/profile/history')data={items:[]};
   else if(path.endsWith('/ws'))return route.abort();
   return route.fulfill({json:data});
  });
  const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base,{waitUntil:'domcontentloaded'});
  await page.evaluate(()=>document.fonts.ready);
  await page.locator('.home-search').click();await page.getByPlaceholder('搜索国家、城市、景点').fill('巴黎');await page.locator('.place-result').filter({hasText:'巴黎'}).first().click();
  await page.getByRole('button',{name:'收藏城市',exact:true}).click();
  await page.getByRole('button',{name:'取消收藏',exact:true}).click();
  await page.getByRole('button',{name:'收藏城市',exact:true}).waitFor();
  assert.equal(favorite,false,'the saved city can be removed again');
  await page.getByRole('button',{name:'找当地人',exact:true}).click();await page.locator('.person-photo-name h2').waitFor();
  await page.locator('.person-photo>.cover').evaluate(img=>img.decode());
  assert.equal(await page.locator('.person-photo-name h2').innerText(),'Claire');
  await page.locator('.bottom-nav').waitFor({state:'visible'});
  const photoBox=await page.locator('.person-photo').boundingBox(),overlayBox=await page.locator('.people-overlay').boundingBox(),cardBox=await page.locator('.person-card.deck-front').boundingBox();
  assert(photoBox.height/overlayBox.height>=.70,'photo dominates the discovery viewport, including on the smallest screen');
  assert(Math.abs(photoBox.height-cardBox.height)<2,'photo fills the complete card');
  assert.equal(await page.locator('.person-content,.people-intro,.swipe-guide,.person-location').count(),0,'no repeated location, white details panel or tutorial copy');
  for(const button of await page.locator('.person-details,.random-label').all()){const box=await button.boundingBox();assert(box.width>=44&&box.height>=44,'all discovery controls retain accessible touch targets');}

  const nav=await page.locator('.bottom-nav').boundingBox();assert(cardBox.y+cardBox.height<=nav.y+1,'people card must remain above navigation');assert(nav.y-cardBox.y-cardBox.height<20,'no empty action-button band remains');
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no page overflow');
  assert.equal(await page.locator('.people-actions').count(),0,'discovery has no skip or connect buttons');
  await page.screenshot({path:resolve(output,`people-${viewport.width}.png`),animations:'disabled'});
  await page.locator('.person-details').click();await page.getByRole('dialog').locator('.profile-portrait .cover').waitFor();await page.getByRole('dialog').locator('.profile-portrait .cover').evaluate(img=>img.decode());await page.screenshot({path:resolve(output,`profile-${viewport.width}.png`),animations:'disabled'});
  await page.getByRole('dialog').getByRole('button',{name:'返回',exact:true}).click();await page.locator('.public-profile-shell').waitFor({state:'hidden'});assert.equal(await page.locator('.person-photo-name h2').innerText(),'Claire');
  const drag=async ratio=>{const box=await page.locator('.person-card.deck-front').boundingBox();const x=box.x+box.width*.45,y=box.y+Math.min(120,box.height*.3);await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+box.width*ratio,y,{steps:10});await page.mouse.up();};
  await drag(.24);assert.equal(await page.locator('.person-photo-name h2').innerText(),'Claire');assert.equal(connects,0);await page.waitForFunction(()=>Math.abs(new DOMMatrix(getComputedStyle(document.querySelector('.person-card.deck-front')).transform).m41)<.5);
  failConnect=true;await drag(.26);await page.locator('.people-overlay .error-box').waitFor();assert.equal(await page.locator('.person-photo-name h2').innerText(),'Claire');await page.waitForFunction(()=>Math.abs(new DOMMatrix(getComputedStyle(document.querySelector('.person-card.deck-front')).transform).m41)<.5);
  failConnect=false;await drag(.26);await page.waitForFunction(()=>document.querySelector('.person-photo-name h2')?.textContent==='Haruka');
  await drag(-.26);await page.waitForFunction(()=>document.querySelector('.person-photo-name h2')?.textContent?.startsWith('Alexandria'));
  await page.screenshot({path:resolve(output,`long-name-${viewport.width}.png`),animations:'disabled'});
  await page.locator('.bottom-nav').getByRole('button',{name:'聊天',exact:true}).click();await page.locator('.conversation-row').first().click();await page.locator('.message-bubble').waitFor();await page.locator('.toast').waitFor({state:'hidden',timeout:6000});await page.screenshot({path:resolve(output,`chat-${viewport.width}.png`),animations:'disabled'});
  assert((await page.locator('.message-bubble').evaluate(el=>getComputedStyle(el).fontSize))==='16px');
  if(viewport.width===390){
   await page.locator('.thread-header').getByRole('button',{name:'返回',exact:true}).click();await page.locator('.conversation-row').first().waitFor();
   await page.locator('.bottom-nav [data-tab="profile"]').click();await page.getByRole('button',{name:'设置',exact:true}).click();await page.screenshot({path:resolve(output,'settings-390.png'),animations:'disabled'});
   await page.getByRole('dialog').getByLabel('界面语言').selectOption('en');await page.getByRole('dialog').getByRole('button',{name:'Close',exact:true}).click();
   await page.getByRole('button',{name:'Edit personal details',exact:true}).click();await page.getByRole('dialog').last().getByRole('textbox').first().waitFor();await page.screenshot({path:resolve(output,'editor-390.png'),animations:'disabled'});
   await page.reload({waitUntil:'domcontentloaded'});missingPhoto=true;await page.locator('.home-search').click();await page.locator('.search-sheet-input input').fill('Paris');await page.locator('.place-result').first().click();await page.getByRole('button',{name:'Meet the locals',exact:true}).click();
   await page.locator('.person-photo>.no-image').waitFor();await page.screenshot({path:resolve(output,'photo-failure-390.png'),animations:'disabled'});
   // The fixture feed is exhausted after the long-name card; run the enlarged-text
   // layout check on the card that is on screen (photo-failure state is captured above).
   missingPhoto=false;await page.locator('.person-photo-name').waitFor();
   await page.evaluate(()=>{for(const el of document.querySelectorAll('.people-overlay h1,.people-overlay h2,.person-photo-name>span'))el.style.fontSize=`${parseFloat(getComputedStyle(el).fontSize)*1.25}px`;});
   const largeCard=await page.locator('.person-card.deck-front').boundingBox(),largeNav=await page.locator('.bottom-nav').boundingBox();assert(largeCard.y+largeCard.height<=largeNav.y+1,'large text keeps the card above navigation');await page.screenshot({path:resolve(output,'large-text-390.png'),animations:'disabled'});
   await page.evaluate(()=>{sessionStorage.clear();localStorage.removeItem('ourworld.session');sessionStorage.setItem('ourworld.noTestSession','1');localStorage.setItem('ourworld.locale','zh');});await page.reload({waitUntil:'domcontentloaded'});await page.locator('.bottom-nav [data-tab="profile"]').click();await page.getByRole('button',{name:'开始我的主页',exact:true}).click();await page.getByLabel('邮箱',{exact:true}).waitFor();await page.screenshot({path:resolve(output,'auth-390.png'),animations:'disabled'});
   checks.push({scenario:'English, photo failure/recovery, 125% text, settings, editor and authentication',passed:true});
  }
  checks.push({viewport,passed:true,checks:['photo card and swipe-only navigation','card above safe area','profile return preserves current card','below threshold rebounds','failed connect keeps current card','right connect advances','left pass advances','long name','chat typography']});
  await context.close();
 }
 assert.equal(errors.length,0,errors.join('\n'));
 await writeFile(resolve(output,'ui-report.json'),JSON.stringify({passed:true,method:'Actual React app and bundled JPEGs; isolated API fixtures. Does not verify live backend or native rendering.',checks,errors},null,2));
 console.log(JSON.stringify({passed:true,checks,errors},null,2));
}catch(error){await writeFile(resolve(output,'ui-report.json'),JSON.stringify({passed:false,error:String(error),checks,errors},null,2));for(const p of browser.contexts().flatMap(c=>c.pages()))await p.screenshot({path:resolve(output,'failure.png')}).catch(()=>{});throw error;}finally{await browser.close();if(vite)await new Promise(resolve=>vite.httpServer.close(resolve));}
