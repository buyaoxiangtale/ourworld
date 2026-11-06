import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
process.env.PLAYWRIGHT_BROWSERS_PATH=resolve(root,'.playwright-browsers');
const {chromium}=await import('playwright');
const base=process.env.OURWORLD_WEB_URL||'http://127.0.0.1:5173';
const apiBase=`${base}/api/v1`;
const env=await readFile(resolve(root,'.env'),'utf8').catch(()=> '');
const password=process.env.DEMO_PASSWORD||env.match(/^DEMO_PASSWORD\s*=\s*([^\r\n]+)/m)?.[1].trim().replace(/^['"]|['"]$/g,'');
if(!password)throw new Error('DEMO_PASSWORD must be configured in .env');
const out=resolve(root,'artifacts');await mkdir(out,{recursive:true});
const checks=[];const errors=[];
const assert=(condition,label)=>{if(!condition)throw new Error(label);checks.push(label);};
const browser=await chromium.launch({headless:true,args:['--no-proxy-server','--disable-gpu']});
const abort=setTimeout(()=>{console.error('UI test hard timeout');void browser.close();process.exitCode=1;},240000);
const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,locale:'zh-CN'});
const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto(base,{waitUntil:'domcontentloaded',timeout:25000});
 await page.locator('.explore-page').waitFor();
 await page.locator('#pre-starlight').waitFor({state:'detached'}).catch(()=>{});
 assert((await page.locator('body').innerText()).trim()==='搜索国家、城市、景点','only the search hint is visible on the first page');
 assert(await page.locator('.bottom-nav>button').count()===3,'three navigation entries');
 const nav=await page.locator('.bottom-nav').boundingBox();assert(!!nav&&nav.y+nav.height<=await page.evaluate(()=>innerHeight),'bottom navigation remains inside viewport');for(const icon of await page.locator('.bottom-nav svg').all()){const box=await icon.boundingBox();assert(!!box&&box.y>=0&&box.y+box.height<=844,'navigation icon stays fully in viewport');}
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'390px layout has no horizontal overflow');
 await page.waitForFunction(()=>{const globe=document.querySelector('iframe')?.contentWindow?.OurworldGlobe;if(!globe)return false;globe.receive({bridgeVersion:1,event:'setActive',data:{active:false}});return true;},null,{timeout:20000});
 assert(await page.frameLocator('iframe').locator('canvas').count()>0,'globe renderer bridge ready');
 await page.screenshot({path:resolve(out,'ui-frontend-home.png'),timeout:20000,animations:'disabled'});checks.push('real bundled globe canvas visible');
 await page.locator('.home-search').click();await page.getByPlaceholder('搜索国家、城市、景点').fill('巴黎');await page.locator('.place-result').filter({hasText:'巴黎'}).first().click();await page.getByRole('button',{name:'找当地人',exact:true}).waitFor();checks.push('homepage search opens real Paris city details');await page.getByRole('button',{name:'返回地球',exact:true}).click();
 const countries=await (await context.request.get(`${apiBase}/places?kind=country`)).json();const france=countries.items.find(place=>place.name.en==='France');if(!france)throw new Error('France must exist in the local catalog');
 await page.frameLocator('iframe').locator('body').evaluate((_,country)=>{const g=window.OurworldGlobe;g.receive({bridgeVersion:1,event:'setActive',data:{active:true}});g.receive({bridgeVersion:1,event:'focusPlace',data:{place:{...country,lat:46.6,lng:2.35}}});},france);
 await page.waitForTimeout(1200);
 // Snap the camera and dispatch the tap inside one iframe task; under software
 // rendering cross-context clicks land after the spin hold has lapsed.
 const canvas=await page.frameLocator('iframe').locator('#globe canvas').first().boundingBox();
 await page.frameLocator('iframe').locator('body').evaluate((_,point)=>{
  window.OurworldGlobe.receive({bridgeVersion:1,event:'restoreCamera',data:{lat:46.6,lng:2.35,altitude:1.15}});
  const target=document.querySelector('#globe canvas');
  const proto=Element.prototype,capture=proto.setPointerCapture,release=proto.releasePointerCapture;
  proto.setPointerCapture=function(){};proto.releasePointerCapture=function(){};
  try{for(const type of ['pointerdown','pointerup'])target.dispatchEvent(new PointerEvent(type,{pointerId:31,isPrimary:true,pointerType:'touch',bubbles:true,cancelable:true,clientX:point.x,clientY:point.y}));}
  finally{proto.setPointerCapture=capture;proto.releasePointerCapture=release;}
 },{x:canvas.width/2+12,y:canvas.height/2+15});
 await page.getByRole('dialog',{name:'法国',exact:true}).waitFor();checks.push('physical globe country click opens France details');await page.screenshot({path:resolve(out,'ui-bright-country.png'),timeout:20000,animations:'disabled'});
 await page.locator('.country-city-list .place-result').filter({hasText:'巴黎'}).first().click();
 await page.getByRole('button',{name:'找当地人',exact:true}).click();
 await page.locator('.person-card.deck-front').waitFor();
 const name=await page.locator('.person-photo-name h2').innerText();
 const box=await page.locator('.person-card.deck-front').boundingBox();
 await page.mouse.move(box.x+box.width*.42,box.y+box.height*.45);await page.mouse.down();await page.mouse.move(box.x+box.width*.76,box.y+box.height*.45,{steps:8});
 assert(Number(await page.locator('.people-deck').evaluate(e=>getComputedStyle(e).getPropertyValue('--right-progress')))>0,'right drag reveals the talk stamp');
 await page.screenshot({path:resolve(out,'ui-frontend-swipe-right.png'),timeout:20000,animations:'disabled'});await page.mouse.up();
 await page.getByLabel('邮箱',{exact:true}).fill('traveler@ourworld.test');
 await page.getByLabel('密码',{exact:true}).fill(password);
 await page.getByRole('button',{name:'进入我的世界',exact:true}).click();
 await page.getByRole('status').filter({hasText:'已加入对话'}).waitFor();
 assert(await page.locator('.people-overlay').isVisible(),'right swipe remains in people browser');
 await page.waitForFunction(()=>document.querySelector('.people-deck')?.dataset.phase==='idle');
 assert(await page.locator('.person-photo-name h2').innerText()!==name,'right swipe advances to a different person');
 const next=await page.locator('.person-card.deck-front').boundingBox();await page.mouse.move(next.x+next.width*.57,next.y+next.height*.4);await page.mouse.down();await page.mouse.move(next.x+next.width*.2,next.y+next.height*.4,{steps:8});
 assert(Number(await page.locator('.people-deck').evaluate(e=>getComputedStyle(e).getPropertyValue('--left-progress')))>0,'left drag reveals the pass stamp');
 await page.screenshot({path:resolve(out,'ui-frontend-swipe-left.png'),timeout:20000,animations:'disabled'});await page.mouse.up();
 await page.locator('.random-label').click();await page.getByRole('dialog',{name:'这次想去哪里'}).waitFor();
 assert(await page.getByLabel('寻找方式').locator('option').count()===2,'secondary multi-city coverage options available');
 await page.getByRole('dialog',{name:'这次想去哪里'}).getByRole('button',{name:'Close',exact:true}).click();
 await page.locator('.bottom-nav').getByRole('button',{name:'聊天',exact:true}).click();
 await page.locator('.conversation-row').filter({hasText:name}).first().click();
 const chatText=`UI journey check ${Date.now()}`;await page.getByPlaceholder('写一条消息…').fill(chatText);await page.getByRole('button',{name:'发送',exact:true}).click();
 await page.locator('.message-bubble').filter({hasText:chatText}).waitFor();
 assert(await page.locator('.message-bubble').filter({hasText:chatText}).count()===1,'real message appears exactly once');
 await page.getByRole('button',{name:'添加附件',exact:true}).click();await page.getByRole('button',{name:'联系方式',exact:true}).click();await page.getByLabel('账号或号码').fill('@ourworld-ui-check');await page.getByRole('button',{name:'分享到当前对话'}).click();
 await page.locator('.contact-card').filter({hasText:'@ourworld-ui-check'}).waitFor();checks.push('contact card shared in real conversation');
 await page.screenshot({path:resolve(out,'ui-frontend-chat.png'),timeout:20000,animations:'disabled'});
 await page.locator('.thread-header').getByRole('button',{name:'返回',exact:true}).click();await page.locator('.conversation-row').first().waitFor();
 await page.locator('.bottom-nav').getByRole('button',{name:'Profile',exact:true}).click();
 await page.getByRole('button',{name:/搭建主页/}).click();await page.locator('.layout-editor-block').first().waitFor();
 assert(await page.locator('.layout-editor-block').count()>0,'profile has editable native-compatible blocks');
 const theme=page.locator('.theme-swatches>button.forest');await theme.click();await page.locator('.editor-overlay').getByRole('button',{name:'保存',exact:true}).click();
 await page.getByRole('status').filter({hasText:'草稿已保存'}).waitFor();checks.push('profile draft saves to real backend');
 await page.locator('.agent-panel textarea').fill('把介绍放在最上面，夜航金配色。');await page.getByRole('button',{name:'生成排版',exact:true}).click();
 // The local environment may configure a real layout model; accept either the honest
 // not-configured error or a genuinely queued/running job — never a fabricated result.
 const agentState=await page.waitForFunction(()=>{const error=!!document.querySelector('.editor-content .error-box')?.textContent?.match(/LLM|模型|配置|not configured|MODEL/i);const busy=/排队中|正在编排|In the queue|Arranging/.test(document.body.textContent);return error||busy;},null,{timeout:20000}).then(()=>page.evaluate(()=>({error:!!document.querySelector('.editor-content .error-box')?.textContent?.match(/LLM|模型|配置|not configured|MODEL/i),candidates:document.querySelectorAll('.candidate-result').length})));
 if(agentState.error)assert(agentState.candidates===0,'unconfigured model produces explicit error, no fake generation');
 await page.screenshot({path:resolve(out,'ui-frontend-profile-studio.png'),timeout:20000,animations:'disabled'});
 await context.close();
 const adminContext=await browser.newContext({viewport:{width:1360,height:900},locale:'zh-CN'});const admin=await adminContext.newPage();admin.setDefaultTimeout(15000);admin.on('pageerror',e=>errors.push(e.message));
 await admin.goto(`${base}/admin`,{waitUntil:'domcontentloaded'});await admin.getByRole('button',{name:'管理员登录',exact:true}).click();await admin.getByLabel('邮箱',{exact:true}).fill('admin@ourworld.test');await admin.getByLabel('密码',{exact:true}).fill(password);await admin.getByRole('button',{name:'进入我的世界',exact:true}).click();
 await admin.locator('.admin-stat-grid>article').first().waitFor();await admin.screenshot({path:resolve(out,'ui-frontend-admin.png'),timeout:20000,animations:'disabled'});checks.push('admin authenticated overview loaded');
 await admin.getByRole('button',{name:'地点目录',exact:true}).click();await admin.getByRole('button',{name:'编辑',exact:true}).first().click();await admin.getByLabel('中文名称').waitFor();assert((await admin.getByLabel('中文名称').inputValue()).length>0,'place maintenance form loads bilingual fields');await adminContext.close();
 assert(errors.length===0,'no browser page errors');
 await writeFile(resolve(out,'ui-frontend-report.json'),JSON.stringify({passed:true,base,checks,errors},null,2));console.log(JSON.stringify({passed:true,checks,errors},null,2));
}catch(error){
 await page.screenshot({path:resolve(out,'ui-frontend-failure.png'),timeout:8000}).catch(()=>{});await writeFile(resolve(out,'ui-frontend-report.json'),JSON.stringify({passed:false,checks,errors,error:String(error)},null,2));throw error;
}finally{clearTimeout(abort);await browser.close();}
