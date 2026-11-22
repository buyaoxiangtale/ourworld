import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from 'playwright';
const base=process.env.OURWORLD_WEB_URL||'http://127.0.0.1:8188',out=resolve('artifacts/profile-package-cities');await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--no-proxy-server','--disable-gpu']});const checks=[],errors=[];
const check=(value,label)=>{assert(value,label);checks.push(label);};
const city=(id,zh,en,country,aliases=[])=>({id,kind:'city',name:{zh,en},country,aliases,lat:0,lng:0,description:{zh:'',en:''},image:''});
const cities=[city('city-paris','巴黎','Paris','France',['city of light']),city('city-shanghai','上海','Shanghai','China'),city('city-hong-kong','香港','Hong Kong','China',['HK','Hongkong']),city('city-sao-paulo','圣保罗','São Paulo','Brazil'),...Array.from({length:266},(_,i)=>city(`city-fixture-${i}`,`收录城市 ${i}`,`Catalogue city ${i}`,'China'))];
const countries=[{id:'country-france',kind:'country',country:'France',name:{zh:'法国',en:'France'}},{id:'country-china',kind:'country',country:'China',name:{zh:'中国',en:'China'}},{id:'country-brazil',kind:'country',country:'Brazil',name:{zh:'巴西',en:'Brazil'}}];
try{
 for(const width of [360,390,430]){
  const user={id:'package-city-fixture',name:'套餐城市测试',avatar:'',bio:'',verified:true,providerStatus:'approved',accountType:'individual',role:'user',tags:[],cityIds:['city-paris']};
  const packages=[{id:'package-fixture',userId:user.id,title:'原有套餐',description:'原有服务内容',cityIds:['city-shanghai'],price:'80',currency:'CNY',unit:'day',image:'',status:'draft'}];
  const writes=[],profileWrites=[],offsets=[];let failSave=false;
  const context=await browser.newContext({viewport:{width,height:844},locale:'zh-CN',hasTouch:true});
  await context.addInitScript(user=>{sessionStorage.setItem('ourworld.session',JSON.stringify({user,accessToken:'fixture',refreshToken:'fixture'}));localStorage.setItem('ourworld.locale','zh');},user);
  await context.route('**/globe/**',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html></html>'}));await context.routeWebSocket('**/api/v1/ws**',socket=>socket.close());
  await context.route('**/api/v1/**',route=>{
   const url=new URL(route.request().url()),path=url.pathname.replace('/api/v1',''),method=route.request().method();let json={items:[]};
   if(path.startsWith('/users/'))json={user,layout:null,posts:[],packages,reviews:[],places:[cities[0]]};
   else if(path==='/places'){const items=url.searchParams.get('kind')==='country'?countries:cities,offset=Number(url.searchParams.get('offset')||0);if(items===cities)offsets.push(offset);json={items:items.slice(offset,offset+250),nextOffset:offset+250<items.length?offset+250:null};}
   else if(path==='/packages')json={items:packages};
   else if(path==='/packages/package-fixture'&&method==='PATCH'){
    const patch=route.request().postDataJSON();if(failSave){failSave=false;return route.fulfill({status:503,json:{message:'套餐暂时无法保存，请重试'}});}writes.push(patch);Object.assign(packages[0],patch);json=packages[0];
   }else if(path==='/me'){if(method==='PATCH'){profileWrites.push(route.request().postDataJSON());}json=user;}
   return route.fulfill({json});
  });
  const page=await context.newPage();page.setDefaultTimeout(12000);page.on('pageerror',error=>errors.push(error.message));await page.goto(base);await page.locator('.bottom-nav button[data-tab="profile"]').click();await page.locator('.owner-name').waitFor();
  await page.getByRole('button',{name:'我的服务套餐',exact:true}).click();const management=page.getByRole('dialog',{name:'可以一起体验的事',exact:true});await management.getByRole('button',{name:'编辑',exact:true}).click();
  const editor=page.getByRole('dialog',{name:'服务详情',exact:true});await editor.waitFor();check(await editor.locator('.city-checkboxes').count()===0,`${width}: inline package city checkboxes are removed`);
  await editor.getByLabel('名称',{exact:true}).fill(`未保存的套餐 ${width}`);await editor.getByLabel('服务内容',{exact:true}).fill('已修改但尚未保存的内容');await editor.getByLabel('报价',{exact:true}).fill('120');
  await editor.getByRole('button',{name:'选择服务城市',exact:true}).click();const picker=page.getByRole('dialog',{name:'服务城市',exact:true});await picker.getByText('全部 270 座城市',{exact:true}).waitFor();
  check(offsets.includes(250)&&await picker.getByRole('checkbox').count()===270,`${width}: package picker loads every catalogue page`);
  check(await picker.getByRole('checkbox',{name:'上海 · 中国',exact:true}).getAttribute('aria-checked')==='true'&&await picker.getByRole('checkbox',{name:'巴黎 · 法国',exact:true}).getAttribute('aria-checked')==='false',`${width}: package cities are preselected independently of profile cities`);
  const search=picker.getByRole('searchbox');await search.fill('HK');await picker.getByRole('checkbox',{name:'香港 · 中国',exact:true}).click();
  await search.fill('Sao Paulo');check(await picker.getByRole('checkbox').count()===1,`${width}: accented city search works like the personal city picker`);
  await search.fill('not-a-city');await picker.getByText('未找到城市',{exact:true}).waitFor();
  await picker.getByRole('button',{name:'返回',exact:true}).click();await picker.waitFor({state:'hidden'});
  check(writes.length===0&&profileWrites.length===0&&packages[0].cityIds.join(',')==='city-shanghai',`${width}: cancelling selection writes neither package nor profile`);
  check(await editor.getByLabel('名称',{exact:true}).inputValue()===`未保存的套餐 ${width}`&&await editor.getByLabel('报价',{exact:true}).inputValue()==='120',`${width}: returning retains unsaved package fields`);
  await editor.getByRole('button',{name:'选择服务城市',exact:true}).click();await picker.getByText('全部 270 座城市',{exact:true}).waitFor();
  await picker.getByRole('checkbox',{name:'上海 · 中国',exact:true}).click();check(await picker.getByRole('button',{name:'确定所选城市（0）',exact:true}).isDisabled(),`${width}: packages require at least one service city`);
  await search.fill('香港');await picker.getByRole('checkbox',{name:'香港 · 中国',exact:true}).click();await search.fill('上海');await picker.getByRole('checkbox',{name:'上海 · 中国',exact:true}).click();
  await search.fill('Catalogue city 265');await picker.getByRole('checkbox',{name:'收录城市 265 · 中国',exact:true}).click();await search.fill('中国');check(await picker.getByRole('checkbox').count()>1,`${width}: localized country names are searchable`);
  if(width===390){await search.fill('香港');await page.screenshot({path:resolve(out,'package-city-search.png'),animations:'disabled'});}
  await picker.getByRole('button',{name:'确定所选城市（3）',exact:true}).click();await picker.waitFor({state:'hidden'});
  const summary=editor.getByRole('button',{name:'选择服务城市',exact:true});await summary.getByText(/香港/).waitFor();check((await summary.innerText()).includes('收录城市 265'),`${width}: confirmed cities appear in the package summary beyond the first catalogue page`);
  check(writes.length===0&&profileWrites.length===0,`${width}: confirming cities only updates the package draft`);
  failSave=true;await editor.getByRole('button',{name:'保存服务',exact:true}).click();await editor.getByRole('alert').filter({hasText:'套餐暂时无法保存'}).waitFor();check((await summary.innerText()).includes('香港')&&await editor.getByLabel('名称',{exact:true}).inputValue()===`未保存的套餐 ${width}`,`${width}: save failure preserves cities and other package inputs`);
  await editor.getByRole('button',{name:'保存服务',exact:true}).click();await editor.waitFor({state:'hidden'});
  check(JSON.stringify(packages[0].cityIds.slice().sort())===JSON.stringify(['city-hong-kong','city-shanghai','city-fixture-265'].sort())&&packages[0].title===`未保存的套餐 ${width}`,`${width}: saving the package submits its selected cities`);
  check(user.cityIds.join(',')==='city-paris'&&profileWrites.length===0,`${width}: package city selection never changes personal service cities`);
  await management.getByRole('button',{name:'发布服务',exact:true}).click();await editor.getByRole('button',{name:'选择服务城市',exact:true}).click();await picker.getByText('全部 270 座城市',{exact:true}).waitFor();
  check(await picker.getByRole('checkbox',{name:'巴黎 · 法国',exact:true}).getAttribute('aria-checked')==='true'&&await picker.getByRole('checkbox',{name:'香港 · 中国',exact:true}).getAttribute('aria-checked')==='false',`${width}: a new package starts from profile cities rather than a previous package draft`);
  const box=await picker.boundingBox();check(box.x>=0&&box.x+box.width<=width+1&&await picker.evaluate(element=>element.scrollWidth<=element.clientWidth),`${width}: city selection fits the mobile viewport`);
  await context.close();
 }
 check(errors.length===0,`no browser errors: ${errors.join('; ')}`);await writeFile(resolve(out,'report.json'),JSON.stringify({passed:true,checks},null,2));console.log(`profile-package-cities: ${checks.length} checks passed`);
}finally{await browser.close();}
