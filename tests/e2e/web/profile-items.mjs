import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
import {preview} from 'vite';
import {chromium} from 'playwright';
const root=resolve(import.meta.dirname,'../../..'),out=resolve(root,'artifacts/profile-items');await mkdir(out,{recursive:true});
const server=process.env.OURWORLD_WEB_URL?null:await preview({configFile:false,root:resolve(root,'apps/web'),preview:{host:'127.0.0.1',port:5191,strictPort:true}});
const base=process.env.OURWORLD_WEB_URL||'http://127.0.0.1:5191';const browser=await chromium.launch({headless:true,args:['--no-proxy-server','--disable-gpu']});
const checks=[],errors=[];const check=(value,label)=>{assert(value,label);checks.push(label);};
const city=(id,zh,en,country,aliases=[])=>({id,kind:'city',name:{zh,en},country,aliases,lat:0,lng:0,description:{zh:'',en:''},image:''});
const cities=[city('city-paris','巴黎','Paris','France',['city of light']),city('city-shanghai','上海','Shanghai','China'),city('city-sao-paulo','圣保罗','São Paulo','Brazil'),...Array.from({length:267},(_,i)=>city(`city-fixture-${i}`,`收录城市 ${i}`,`Catalogue city ${i}`,'China'))];
const countries=[{id:'country-france',kind:'country',country:'France',name:{zh:'法国',en:'France'}},{id:'country-china',kind:'country',country:'China',name:{zh:'中国',en:'China'}},{id:'country-brazil',kind:'country',country:'Brazil',name:{zh:'巴西',en:'Brazil'}}];
try{
 for(const width of [360,390,430]){
  const user={id:'items-fixture',name:'测试旅人',avatar:'',bio:'',verified:true,providerStatus:'none',accountType:'individual',role:'user',tags:[],cityIds:['city-paris']};const patches=[],offsets=[];let failSave=false;
  const context=await browser.newContext({viewport:{width,height:844},locale:'zh-CN'});
  await context.addInitScript(user=>{sessionStorage.setItem('ourworld.session',JSON.stringify({user,accessToken:'fixture',refreshToken:'fixture'}));localStorage.setItem('ourworld.locale','zh');},user);
  await context.route('**/globe/**',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html></html>'}));await context.routeWebSocket('**/api/v1/ws**',socket=>socket.close());
  await context.route('**/api/v1/**',route=>{
   const url=new URL(route.request().url()),path=url.pathname.replace('/api/v1','');let json={items:[]};
   if(path.startsWith('/users/'))json={user,layout:null,packages:[],posts:[],reviews:[],places:cities.filter(city=>user.cityIds.includes(city.id))};
   else if(path==='/places'){const data=url.searchParams.get('kind')==='country'?countries:cities;const offset=Number(url.searchParams.get('offset')||0);if(data===cities)offsets.push(offset);json={items:data.slice(offset,offset+250),nextOffset:offset+250<data.length?offset+250:null};}
   else if(path==='/me'){
    if(route.request().method()==='PATCH'){const patch=route.request().postDataJSON();if(failSave&&patch.cityIds){failSave=false;return route.fulfill({status:503,json:{message:'暂时无法保存，请重试'}});}patches.push(patch);for(const [key,value] of Object.entries(patch)){if(value===null)delete user[key];else user[key]=value;}}
    json=user;
   }
   return route.fulfill({json});
  });
  user.school='原有学校';user.educationLevel='master';
  const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',error=>errors.push(error.message));await page.goto(base);await page.locator('.bottom-nav button[data-tab="profile"]').click();await page.locator('.owner-name').waitFor();
  await page.getByRole('button',{name:'编辑 学校与学历',exact:true}).click();const education=page.getByRole('dialog',{name:'学校与学历',exact:true});
  check(await education.getByLabel('学校',{exact:true}).inputValue()==='原有学校',`${width}: school is prefilled from the current profile rather than an older cached session`);check(await education.getByLabel('学历',{exact:true}).inputValue()==='master',`${width}: current education level is prefilled`);
  await education.getByLabel('学校',{exact:true}).fill('复旦大学');await education.getByLabel('学历',{exact:true}).selectOption('bachelor');await education.getByRole('button',{name:'保存',exact:true}).click();await education.waitFor({state:'hidden'});
  check(user.school==='复旦大学'&&user.educationLevel==='bachelor',`${width}: education item saves both school and degree`);await page.getByRole('button',{name:'编辑 学校与学历',exact:true}).getByText('复旦大学 · 本科',{exact:true}).waitFor();check(await page.getByRole('button',{name:'编辑 学校与学历',exact:true}).innerText()==='复旦大学 · 本科',`${width}: education summary updates`);check(Object.keys(patches.at(-1)).sort().join(',')==='educationLevel,school',`${width}: education saves independently`);
  await page.getByRole('button',{name:'编辑 服务城市',exact:true}).click();const picker=page.getByRole('dialog',{name:'服务城市',exact:true});await picker.getByText('全部 270 座城市',{exact:true}).waitFor();
  check(offsets.includes(0)&&offsets.includes(250),`${width}: every city page is loaded beyond the first 250 records`);check(await picker.getByRole('checkbox').count()===270,`${width}: all collected cities are selectable`);check(await picker.getByRole('checkbox',{name:'巴黎 · 法国',exact:true}).getAttribute('aria-checked')==='true',`${width}: existing cities are preselected`);
  const search=picker.getByRole('searchbox');await search.fill('city of light');check(await picker.getByRole('checkbox').count()===1,`${width}: aliases are searchable`);await search.fill('Sao Paulo');check(await picker.getByRole('checkbox').count()===1,`${width}: accented English names match unaccented searches`);await search.fill('法国');check(await picker.getByRole('checkbox').count()===1,`${width}: localized country names are searchable`);
  await search.fill('not-a-catalogue-city');await picker.getByText('未找到城市',{exact:true}).waitFor();check(true,`${width}: empty search results are explained`);
  await search.fill('Shanghai');await picker.getByRole('checkbox',{name:'上海 · 中国',exact:true}).click();await search.fill('Paris');check(await picker.getByRole('checkbox').getAttribute('aria-checked')==='true',`${width}: changing search keeps selections`);
  if(width===390)await page.screenshot({path:resolve(out,'cities-search.png'),animations:'disabled'});
  const previousPatches=patches.length;await picker.getByRole('button',{name:'返回',exact:true}).click();check(patches.length===previousPatches&&!user.cityIds.includes('city-shanghai'),`${width}: back cancels unsaved city changes`);
  await page.locator('.owner-toolbar button').first().click();const details=page.getByRole('dialog',{name:'让别人认识你',exact:true});await details.getByLabel('名字',{exact:true}).fill('尚未保存的名字');check(await details.locator('.city-checkboxes').count()===0,`${width}: city checkboxes are removed from personal details`);
  await details.getByRole('button',{name:/服务城市/}).click();await picker.getByText('全部 270 座城市',{exact:true}).waitFor();await picker.getByRole('searchbox').fill('上海');await picker.getByRole('checkbox',{name:'上海 · 中国',exact:true}).click();failSave=true;await picker.getByRole('button',{name:'保存所选城市（2）',exact:true}).click();await picker.getByRole('alert').waitFor();check(await picker.getByRole('checkbox').getAttribute('aria-checked')==='true',`${width}: save failure retains selected cities`);
  await picker.getByRole('button',{name:'保存所选城市（2）',exact:true}).click();await picker.waitFor({state:'hidden'});check(user.cityIds.includes('city-shanghai')&&user.cityIds.includes('city-paris'),`${width}: independent city page saves multiple cities`);check(Object.keys(patches.at(-1)).join(',')==='cityIds',`${width}: city save only changes cityIds`);check(await details.getByLabel('名字',{exact:true}).inputValue()==='尚未保存的名字',`${width}: returning from the city page preserves unsaved details`);
  await details.getByRole('button',{name:'保存资料',exact:true}).click();await details.waitFor({state:'hidden'});check(!Object.hasOwn(patches.at(-1),'cityIds')&&user.cityIds.includes('city-shanghai'),`${width}: saving other details does not overwrite service cities`);
  await page.getByRole('button',{name:'编辑 学校与学历',exact:true}).click();await education.getByLabel('学校',{exact:true}).fill('');await education.getByLabel('学历',{exact:true}).selectOption('');await education.getByRole('button',{name:'保存',exact:true}).click();await education.waitFor({state:'hidden'});check(!user.school&&!user.educationLevel,`${width}: school and degree can be cleared`);
  check(await page.locator('.owner-profile-page').evaluate(el=>el.scrollWidth<=el.clientWidth),`${width}: no horizontal overflow`);await context.close();
 }
 check(errors.length===0,`no browser errors: ${errors.join('; ')}`);await writeFile(resolve(out,'browser-report.json'),JSON.stringify({passed:true,checks},null,2));console.log(`profile-items: ${checks.length} checks passed`);
}finally{await browser.close();await server?.httpServer.close();}
