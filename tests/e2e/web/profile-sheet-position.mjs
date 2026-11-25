import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from 'playwright';
const base=process.env.OURWORLD_WEB_URL||'http://127.0.0.1:8188';const out=resolve('artifacts/profile-sheet-position');await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--no-proxy-server','--disable-gpu']});const checks=[],reports=[];
const check=(value,label)=>{assert(value,label);checks.push(label);};
try{
 for(const width of [390,1280]){
  const user={id:'sheet-fixture',name:'页面位置测试',avatar:'',bio:'喜欢散步、摄影和海边的日常。',verified:true,providerStatus:'none',role:'user',accountType:'individual',tags:['摄影','咖啡','城市漫步'],cityIds:['city-paris'],priceRange:{min:80,max:120,currency:'CNY',unit:'day'}};
  const layout={schemaVersion:1,theme:'nocturne',accent:'#DBB473',blocks:[{id:'intro',type:'intro',span:2,size:'compact'},{id:'gallery',type:'gallery',span:2,size:'expanded',refs:Array.from({length:6},(_,i)=>`/api/v1/fixture/${i}.svg`)},{id:'photo-caption',type:'gallery',span:2,size:'expanded',title:'这张照片背后的故事',content:'一段已保存的故事。',refs:['/api/v1/fixture/0.svg']}]};
  const context=await browser.newContext({viewport:{width,height:844},hasTouch:width===390,isMobile:width===390});
  await context.addInitScript(user=>{sessionStorage.setItem('ourworld.session',JSON.stringify({user,accessToken:'fixture',refreshToken:'fixture'}));localStorage.setItem('ourworld.locale','zh');},user);
  await context.route('**/globe/**',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html></html>'}));await context.routeWebSocket('**/api/v1/ws**',socket=>socket.close());
  await context.route('**/api/v1/**',route=>{
   const path=new URL(route.request().url()).pathname.replace('/api/v1','');
   if(path.startsWith('/fixture/'))return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400"><rect width="300" height="400" fill="navy"/></svg>'});
   const json=path.startsWith('/users/')?{user,layout,posts:[],packages:[],reviews:[],places:[]}:path==='/profile/draft'?{revision:1,publishedRevision:1,layout}:path==='/me'?user:{items:[]};return route.fulfill({json});
  });
  const page=await context.newPage();page.setDefaultTimeout(10000);await page.goto(base);await page.locator('.bottom-nav button[data-tab="profile"]').click();await page.locator('.owner-name').waitFor();
  for(const [button,title] of [['编辑个人简介','编辑个人简介'],['编辑卡片 1','编辑卡片'],['编辑爱好 · 文化艺术','我的爱好']]){
   const trigger=page.getByRole('button',{name:button,exact:true});await trigger.scrollIntoViewIfNeeded();const before=await page.locator('.tab-panel:has(.owner-profile-page)').evaluate(element=>element.scrollTop);await trigger.click();
   const dialog=page.getByRole('dialog',{name:title,exact:true});await dialog.waitFor();
   const samples=await dialog.evaluate(async element=>{
    const samples=[],start=performance.now();await new Promise(resolve=>{const frame=()=>{const rect=element.getBoundingClientRect(),backdrop=element.parentElement;samples.push({top:rect.top,bottom:rect.bottom,scrollTop:backdrop.scrollTop});if(performance.now()-start<550)requestAnimationFrame(frame);else resolve();};requestAnimationFrame(frame);});return samples;
   });
   const position=await dialog.evaluate(element=>{const rect=element.getBoundingClientRect();return {top:rect.top,bottom:rect.bottom,left:rect.left,right:rect.right,width:innerWidth,height:innerHeight};});
   reports.push({width,title,before,position,samples});console.log(JSON.stringify({width,title,position,minTop:Math.min(...samples.map(sample=>sample.top)),maxBackdropScroll:Math.max(...samples.map(sample=>sample.scrollTop))}));
   check(samples.every(sample=>sample.top>=-1&&sample.scrollTop===0),`${width}/${title}: opening does not scroll or fly above the viewport`);
   check(position.top>=0&&position.bottom<=position.height+1&&position.left>=-1&&position.right<=position.width+1,`${width}/${title}: editor settles fully inside the viewport`);
   if(width===390&&title==='编辑个人简介'){
    await dialog.getByRole('textbox',{name:'个人简介',exact:true}).focus();await page.setViewportSize({width,height:500});
    await page.waitForTimeout(150);const bounds=await dialog.boundingBox();check(bounds.y>=0&&bounds.y+bounds.height<=501,'editor remains on screen after keyboard-sized viewport changes');await page.setViewportSize({width,height:844});
   }
   await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
   check(Math.abs((await page.locator('.tab-panel:has(.owner-profile-page)').evaluate(element=>element.scrollTop))-before)<2,`${width}/${title}: closing restores focus without moving the profile`);
  }
  await context.close();
 }
 await writeFile(resolve(out,'report.json'),JSON.stringify({passed:true,checks,reports},null,2));console.log(`profile-sheet-position: ${checks.length} checks passed`);
}catch(error){await writeFile(resolve(out,'report.json'),JSON.stringify({passed:false,error:error.message,checks,reports},null,2));throw error;}finally{await browser.close();}
