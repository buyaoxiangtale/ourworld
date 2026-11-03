import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {existsSync} from 'node:fs';
import assert from 'node:assert/strict';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
process.env.PLAYWRIGHT_BROWSERS_PATH=resolve(root,'.playwright-browsers');
const {chromium}=await import('playwright');
const {preview}=await import('vite');
const vite=process.env.OURWORLD_WEB_URL?null:await preview({configFile:resolve(root,'apps/web/vite.config.ts'),root:resolve(root,'apps/web'),preview:{host:'127.0.0.1',port:5186,strictPort:true}});
const base=process.env.OURWORLD_WEB_URL||'http://127.0.0.1:5186';
const output=resolve(root,'artifacts/deep-sea');await mkdir(output,{recursive:true});
const traveler={id:'demo-traveler-lin',name:'林予',avatar:'/api/v1/seed/avatar/demo-traveler-lin.jpg',bio:'用步行认识一座城市。',verified:true,providerStatus:'none',role:'user',tags:['城市漫步','摄影'],cityIds:['city-paris']};
const people=[{...traveler,id:'demo-guide-paris',name:'Claire',avatar:'/api/v1/seed/avatar/demo-guide-paris.jpg',providerStatus:'approved',bio:'住在巴黎。喜欢美术馆、旧书店，和街角的咖啡。',quote:'USD 95 / day'}, {...traveler,id:'demo-guide-tokyo',name:'Haruka',avatar:'/api/v1/seed/avatar/demo-guide-tokyo.jpg'}, {...traveler,id:'demo-traveler-anna',name:'Anna',avatar:'/api/v1/seed/avatar/demo-traveler-anna.jpg'}, {...traveler,id:'demo-long-name',name:'Alexandria · 一个很长的中英文姓名',avatar:'/api/v1/seed/avatar/demo-long-name.jpg'}];
const city={id:'city-paris',kind:'city',parentId:'country-france',name:{zh:'巴黎',en:'Paris'},country:'France',lat:48.86,lng:2.35,image:'/api/v1/seed/city/paris.jpg',description:{zh:'走进巴黎的街角、书店与河岸。',en:'Discover Paris through someone who calls it home.'}};
const country={...city,id:'country-france',kind:'country',name:{zh:'法国',en:'France'}};
const tokyo={...city,id:'city-tokyo',parentId:'country-japan',country:'Japan',name:{zh:'东京',en:'Tokyo'},lat:35.68,lng:139.69};
const conversation={id:'visual-conversation',peer:people[0],cityId:city.id,unread:0,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
const layout={schemaVersion:1,theme:'cream',accent:'#d92d4f',blocks:[{id:'intro',type:'intro',span:2,size:'compact'},{id:'gallery',type:'gallery',span:2,size:'expanded',refs:[]},{id:'skills',type:'skills',span:1,size:'compact'},{id:'cities',type:'cities',span:1,size:'compact'}]};
const resource=person=>({user:person,layout,packages:[],posts:[],reviews:[],places:[city]});
const browser=await chromium.launch({headless:true,args:['--no-proxy-server','--disable-gpu','--enable-unsafe-swiftshader']});
const checks=[],errors=[],taste=[];
const skill=process.env.TASTE_SKILL_HOME||'C:/Users/Huawei/.agents/skills/taste-skill';
const probes=existsSync(resolve(skill,'scripts/lib/probe.mjs'))?await import(pathToFileURL(resolve(skill,'scripts/lib/probe.mjs')).href):null;
const rules=probes?await import(pathToFileURL(resolve(skill,'scripts/lib/rules.mjs')).href):null;
const inspect=async(page,screen,width)=>{
 if(!probes)return;
 const metrics=await page.evaluate(probes.probe),app=await page.evaluate(probes.app),layout=await page.evaluate(probes.layout);
 const headingEvidence=await page.locator('h1').evaluateAll(nodes=>nodes.map(el=>({text:el.textContent,visible:el.getBoundingClientRect().width>0&&el.getBoundingClientRect().height>0})));
 const allow=screen==='earth'?['no-title']:['chat','conversations'].includes(screen)?['blank-gap','no-title']:[];
 if(['chat','conversations'].includes(screen))assert(headingEvidence.some(h=>h.visible),'chat screen has a real visible h1; inspector selects the first hidden h1');
 const findingsFor=allowed=>[...rules.judge(metrics,{width,allow:allowed}),...rules.judgeLayout(layout,{width,allow:allowed})].filter(f=>!rules.APP_SKIP.has(f.id)&&f.id!=='no-title'&&f.id!=='small-title').concat(rules.judgeApp(app,metrics,{width,allow:allowed}));
 const rawFindings=findingsFor([]),findings=findingsFor(allow);
 taste.push({screen,width,allow,headingEvidence,rawFindings,findings});
 assert.equal(findings.filter(f=>f.level==='FAIL').length,0,JSON.stringify({screen,width,findings}));
};

try{
 for(const viewport of [{width:360,height:640},{width:390,height:844},{width:430,height:932}]){
  const context=await browser.newContext({viewport,locale:'zh-CN',recordVideo:viewport.width===390?{dir:resolve(output,'video'),size:viewport}:undefined});
  let failConnect=false,failSend=true,connects=0,sendIds=[],storedMessages=[];
  await context.routeWebSocket('**/api/v1/ws**',ws=>ws.close());
  await context.addInitScript(session=>{sessionStorage.setItem('ourworld.session',JSON.stringify(session));window.__globeEvents=[];window.addEventListener('message',e=>{if(e.data?.bridgeVersion===1)window.__globeEvents.push(e.data);});},{accessToken:'isolated-ui-fixture',refreshToken:'isolated-ui-fixture',user:traveler});
  await context.route('**/api/v1/**',async route=>{
   const url=new URL(route.request().url()),path=url.pathname.replace('/api/v1','');
   const photo=path.match(/^\/seed\/(avatar|city)\/(.+)\.jpg$/);
   if(photo){if(photo[2]==='demo-long-name')return route.fulfill({status:404});const i=photo[2].includes('tokyo')?'02':photo[2].includes('anna')?'06':photo[2].includes('traveler')?'05':'01';return route.fulfill({contentType:'image/jpeg',body:await readFile(resolve(root,photo[1]==='avatar'?`apps/api/assets/photos/portraits/${i}.jpg`:'apps/api/assets/photos/places/paris.jpg'))});}
   let data={};
   if(path==='/places')data={items:url.searchParams.get('kind')==='country'?[country]:url.searchParams.get('q')?[city]:[city,tokyo]};
   else if(path===`/places/${city.id}`)data=city;
   else if(path==='/favorites')data={items:[]};
   else if(path.includes('/people-feed'))data={feedId:'visual-fixture',items:people,nextCursor:null,exhausted:true};
   else if(path==='/conversations/direct'){connects++;await new Promise(r=>setTimeout(r,120));if(failConnect)return route.fulfill({status:503,json:{code:'SERVICE_UNAVAILABLE',message:'暂时无法加入对话，请重试'}});data=conversation;}
   else if(path==='/conversations')data={items:[conversation]};
   else if(path.endsWith('/messages')&&route.request().method()==='POST'){const body=route.request().postDataJSON();sendIds.push(body.clientMessageId);if(failSend)return route.fulfill({status:503,json:{code:'SERVICE_UNAVAILABLE',message:'Offline test'}});data={...body,id:`message-${body.clientMessageId}`,conversationId:conversation.id,senderId:traveler.id,sequence:storedMessages.length+1,createdAt:new Date().toISOString()};storedMessages.push(data);}
   else if(path.endsWith('/messages'))data={items:storedMessages,nextCursor:null};
   else if(path.startsWith('/users/'))data=resource(people.find(p=>p.id===path.split('/').pop())||traveler);
   else if(path==='/auth/login')data={accessToken:'isolated-ui-fixture',refreshToken:'isolated-ui-fixture',user:traveler};
   else if(path==='/me')data=traveler;
   else if(path==='/profile/draft')data={revision:1,layout,publishedRevision:1};
   else if(path.endsWith('/trips')||path==='/packages')data={items:[]};
   return route.fulfill({json:data});
  });
  const page=await context.newPage();page.setDefaultTimeout(30000);page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base,{waitUntil:'domcontentloaded'});await page.evaluate(()=>document.fonts.ready);
  await page.waitForFunction(()=>window.__globeEvents.some(e=>e.event==='rendererReady'));
  const ready=await page.evaluate(()=>window.__globeEvents.find(e=>e.event==='rendererReady').data);assert.equal(ready.borders,true);assert.equal(ready.clouds,false);assert.equal(ready.dayNight,false);
  await page.screenshot({animations:'disabled',path:resolve(output,`earth-${viewport.width}.png`)});
  await inspect(page,'earth',viewport.width);
  if(viewport.width===390){for(const [name,lat,lng]of [['africa',8,18],['americas',18,-90],['pacific',5,-170],['europe',47,10]]){await page.locator('iframe').evaluate((el,pov)=>el.contentWindow.OurworldGlobe.receive({bridgeVersion:1,event:'restoreCamera',data:pov}),{lat,lng,altitude:2.8});await page.screenshot({animations:'disabled',path:resolve(output,`earth-${name}.png`)});}}
  await page.locator('.home-search').click();await page.getByPlaceholder('搜索国家、城市、景点').fill('巴黎');await page.locator('.place-result').filter({hasText:'巴黎'}).first().click();await page.getByRole('button',{name:'找当地人',exact:true}).click();
  await page.locator('.deck-front .person-photo-name h2').waitFor();await page.locator('.deck-front .cover').evaluate(el=>el.decode());
  assert.equal(await page.locator('.person-card').count(),3);assert.equal(await page.locator('.person-photo-name h2').innerText(),'Claire');
  assert.equal(await page.locator('.people-overlay').evaluate(el=>getComputedStyle(el).backgroundColor),'rgba(0, 0, 0, 0.14)');
  const action=await page.locator('.people-actions').boundingBox(),nav=await page.locator('.bottom-nav').boundingBox();assert(action.y+action.height<=nav.y+1);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({animations:'disabled',path:resolve(output,`people-${viewport.width}.png`),timeout:60000});
  console.log(`Viewport ${viewport.width}: earth and people captured`);
  await inspect(page,'people',viewport.width);
  const drag=async(ratio,slow=true,vertical=0)=>{const box=await page.locator('.deck-front').boundingBox(),x=box.x+box.width*.45,y=box.y+100;await page.mouse.move(x,y);await page.mouse.down();for(let i=1;i<=12;i++){await page.mouse.move(x+box.width*ratio*i/12,y+vertical*i/12);if(slow)await new Promise(r=>setTimeout(r,22));}await page.mouse.up();};
  await drag(.24);await page.waitForFunction(()=>document.querySelector('.people-deck')?.dataset.phase==='idle');assert.equal(connects,0);assert.equal(await page.locator('.person-photo-name h2').innerText(),'Claire');
  failConnect=true;await drag(.26);await page.locator('.people-overlay .error-box').waitFor();await page.waitForFunction(()=>document.querySelector('.people-deck')?.dataset.phase==='idle');assert.equal(await page.locator('.person-photo-name h2').innerText(),'Claire');
  failConnect=false;await page.getByRole('button',{name:'加入对话',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.person-photo-name h2')?.textContent==='Haruka');assert.equal(connects,2);
  await drag(-.26);await page.waitForFunction(()=>document.querySelector('.person-photo-name h2')?.textContent==='Anna');
  await page.getByRole('button',{name:'查看主页',exact:true}).click();await page.locator('.public-profile-shell .profile-portrait .cover').waitFor();assert.equal(await page.locator('.public-profile-shell .block-gallery').count(),0);assert.equal(await page.locator('.public-profile-shell .block-intro').count(),1);
  await page.screenshot({animations:'disabled',path:resolve(output,`profile-${viewport.width}.png`)});await inspect(page,'profile',viewport.width);
  await page.locator('.public-profile-header').getByRole('button',{name:'更多',exact:true}).click();assert(await page.getByRole('dialog').last().getByRole('button',{name:'举报用户',exact:true}).isVisible());await page.getByRole('dialog').last().getByRole('button',{name:'Close',exact:true}).click();await page.locator('.public-profile-header').getByRole('button',{name:'返回',exact:true}).click();assert.equal(await page.locator('.person-photo-name h2').innerText(),'Anna');
  await page.getByRole('button',{name:'略过',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.person-photo-name h2')?.textContent?.startsWith('Alexandria'));await page.locator('.deck-front .no-image').waitFor();
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({animations:'disabled',path:resolve(output,`long-name-photo-failure-${viewport.width}.png`)});
  if(viewport.width===390){await page.evaluate(()=>{for(const el of document.querySelectorAll('.people-overlay h1,.person-photo-name h2,.person-interests'))el.style.fontSize=`${parseFloat(getComputedStyle(el).fontSize)*1.25}px`;});const largeActions=await page.locator('.people-actions').boundingBox();assert(largeActions.y+largeActions.height<=nav.y+1);await page.screenshot({animations:'disabled',path:resolve(output,'large-text-390.png')});await page.emulateMedia({reducedMotion:'reduce'});}
  await page.locator('.bottom-nav').getByRole('button',{name:'聊天',exact:true}).click();await page.locator('.conversation-row').waitFor();await page.screenshot({animations:'disabled',path:resolve(output,`conversations-${viewport.width}.png`)});await inspect(page,'conversations',viewport.width);await page.locator('.conversation-row').click();await page.locator('.chat-prompts').waitFor();assert.equal(await page.locator('.bottom-nav').isVisible(),false);
  await page.locator('.chat-prompts button').first().click();assert.equal(sendIds.length,0);assert((await page.getByRole('textbox',{name:'消息',exact:true}).inputValue()).length>0);
  await page.getByRole('button',{name:'发送',exact:true}).click();await page.locator('.message-info').getByRole('button',{name:'重试',exact:true}).waitFor();failSend=false;await page.locator('.message-info').getByRole('button',{name:'重试',exact:true}).click();await page.locator('[aria-label="已发送"]').waitFor();assert.equal(sendIds.length,2);assert.equal(sendIds[0],sendIds[1]);assert.equal(storedMessages.length,1);
  await page.evaluate(id=>window.dispatchEvent(new CustomEvent('ourworld:realtime',{detail:{event:'conversation.read',data:{conversationId:id,userId:'demo-guide-paris',sequence:1}}})),conversation.id);await page.locator('[aria-label="已读"]').waitFor();
  await page.screenshot({animations:'disabled',path:resolve(output,`chat-${viewport.width}.png`)});
  await inspect(page,'chat',viewport.width);
  await page.getByRole('button',{name:'添加附件',exact:true}).click();for(const name of ['图片','联系方式','地点','我的服务','行程与评价'])assert(await page.getByRole('dialog').getByRole('button',{name,exact:true}).isVisible());
  await page.screenshot({animations:'disabled',path:resolve(output,`attachments-${viewport.width}.png`)});await page.getByRole('dialog').getByRole('button',{name:'Close',exact:true}).click();
  if(viewport.width===390){
   await page.locator('.thread-header').getByRole('button',{name:'返回',exact:true}).click();await page.locator('.bottom-nav').getByRole('button',{name:'Profile',exact:true}).click();await page.getByRole('button',{name:'设置',exact:true}).click();await page.getByRole('dialog').getByLabel('界面语言').selectOption('en');await page.getByRole('dialog').getByRole('button',{name:'Close',exact:true}).click();
   await page.locator('.bottom-nav').getByRole('button',{name:'Explore',exact:true}).click();await page.getByRole('button',{name:'Add to chats',exact:true}).waitFor();await page.screenshot({animations:'disabled',path:resolve(output,'people-390-en.png')});assert.equal(await page.locator('html').getAttribute('lang'),'en');
   await page.locator('.bottom-nav').getByRole('button',{name:'Profile',exact:true}).click();await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByRole('dialog').getByLabel('Interface language').selectOption('zh');await page.getByRole('dialog').getByRole('button',{name:'退出登录',exact:true}).click();
   await page.locator('.bottom-nav').getByRole('button',{name:'地球',exact:true}).click();const beforeAuth=connects;await page.getByRole('button',{name:'加入对话',exact:true}).click();await page.locator('form.auth-form').waitFor();await page.getByRole('dialog').getByRole('button',{name:'Close',exact:true}).click();assert.equal(connects,beforeAuth);
   await page.getByRole('button',{name:'加入对话',exact:true}).click();await page.locator('form.auth-form').getByLabel('邮箱',{exact:true}).fill('fixture@ourworld.test');await page.locator('form.auth-form').getByLabel('密码',{exact:true}).fill('FixturePassword123!');await page.locator('form.auth-form button[type="submit"]').click();await page.waitForFunction(()=>!document.querySelector('.person-photo-name'));assert.equal(connects,beforeAuth+1);
  }
  checks.push({viewport:viewport.width,globe:true,cardStack:true,slowReturn:true,failedConnectRestored:true,buttons:true,profileReturn:true,emptyGalleryHidden:true,promptsNeverAutoSend:true,retryIdempotent:true,readReceipt:true,attachments:true,longName:true,photoFailure:true,largeText:viewport.width===390?true:null,english:viewport.width===390?true:null,authCancelAndResume:viewport.width===390?true:null});
  const video=page.video();await context.close();if(video)await video.saveAs(resolve(output,'mobile-web-interactions.webm'));
 }
 assert.deepEqual(errors,[]);
 await writeFile(resolve(output,'ui-report.json'),JSON.stringify({checks,errors,backend:'isolated fixture API; no real messages sent',nativeDeviceRun:false},null,2));
 await writeFile(resolve(output,'taste-pages.json'),JSON.stringify(taste,null,2));
 console.log(JSON.stringify({passedGroups:checks.reduce((n,c)=>n+Object.values(c).filter(v=>v===true).length,0),viewports:checks.map(c=>c.viewport),errors}));
}catch(error){const page=browser.contexts().flatMap(c=>c.pages()).at(-1);if(page){await page.screenshot({animations:'disabled',path:resolve(output,'ui-failure.png')}).catch(()=>{});await writeFile(resolve(output,'ui-failure.html'),await page.content().catch(()=>''));}await writeFile(resolve(output,'ui-failure.txt'),JSON.stringify({stack:String(error.stack),errors},null,2));throw error;}finally{await browser.close();await vite?.httpServer.close();}
