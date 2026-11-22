import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from 'playwright';

const base=process.env.OURWORLD_WEB_URL||'http://127.0.0.1:8188',out=resolve('artifacts/slide-exit');await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--no-proxy-server','--disable-gpu']});
const checks=[],errors=[],samples=[];const check=(value,label)=>{assert(value,label);checks.push(label);};
try{
 for(const width of [390,1280]){
  const user={id:'exit-fixture',name:'动画测试',avatar:'',bio:'原有个人简介',verified:true,providerStatus:'approved',role:'user',accountType:'individual',tags:['摄影'],cityIds:['city-paris'],languages:['English'],priceRange:{min:80,max:120,currency:'CNY',unit:'day'}};
  const city={id:'city-paris',kind:'city',name:{zh:'巴黎',en:'Paris'},country:'France',lat:48.86,lng:2.35,description:{zh:'沿着河岸散步。',en:'Walk along the river.'},image:''};
  const country={...city,id:'country-france',kind:'country',name:{zh:'法国',en:'France'}};
  const packages=[{id:'package-fixture',userId:user.id,title:'城市漫步',description:'认识巴黎',cityIds:[city.id],price:'100',currency:'CNY',unit:'day',status:'published',image:''}];
  let layout={schemaVersion:1,theme:'nocturne',accent:'#DBB473',blocks:[{id:'intro',type:'intro',span:2,size:'compact'},{id:'gallery',type:'gallery',span:2,size:'expanded',refs:['/api/v1/fixture/photo.svg']},{id:'photo-caption',type:'gallery',span:2,size:'expanded',title:'照片故事',content:'原有照片故事',refs:['/api/v1/fixture/photo.svg']}]};
  let revision=1,failBio=false;const writes=[];
  const context=await browser.newContext({viewport:{width,height:844},locale:'zh-CN'});
  await context.addInitScript(user=>{sessionStorage.setItem('ourworld.session',JSON.stringify({user,accessToken:'fixture',refreshToken:'fixture'}));localStorage.setItem('ourworld.locale','zh');},user);
  await context.route('**/globe/**',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html></html>'}));await context.routeWebSocket('**/api/v1/ws**',socket=>socket.close());
  await context.route('**/api/v1/**',async route=>{
   const url=new URL(route.request().url()),path=url.pathname.replace('/api/v1',''),method=route.request().method();let json={items:[]};
   if(path.startsWith('/fixture/'))return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400"><rect width="300" height="400" fill="navy"/></svg>'});
   if(path.startsWith('/users/'))json={user,layout,packages,posts:[],reviews:[],places:[city]};
   else if(path==='/me'){if(method==='PATCH'){if(failBio){failBio=false;return route.fulfill({status:503,json:{message:'暂时无法保存'}});}const patch=route.request().postDataJSON();writes.push(patch);Object.assign(user,patch);}json=user;}
   else if(path==='/profile/draft'){if(method==='PUT'){layout=route.request().postDataJSON().layout;revision++;}json={revision,publishedRevision:1,layout};}
   else if(path==='/places')json={items:url.searchParams.get('kind')==='country'?[country]:[city]};
   else if(path===`/places/${city.id}`)json=city;
   else if(path==='/packages')json={items:packages};
   else if(path.endsWith('/people-feed'))json={feedId:'fixture',items:[user],nextCursor:null};
   return route.fulfill({json});
  });
  const page=await context.newPage();page.setDefaultTimeout(12000);page.on('pageerror',error=>errors.push(error.message));await page.goto(base);await page.locator('.bottom-nav button[data-tab="profile"]').click();await page.locator('.owner-name').waitFor();
  const dialog=name=>page.getByRole('dialog',{name,exact:true});
  const exit=async(target,action,label,settle=true)=>{
   await target.waitFor();if(settle)await target.evaluate(element=>Promise.all(element.getAnimations().map(animation=>animation.finished.catch(()=>{}))));
   await target.evaluate(element=>{window.__exitCheck=new Promise(resolve=>{
    const start=performance.now();const frame=()=>{
     const animation=element.getAnimations().find(animation=>animation.id==='slide-exit');
     if(animation){animation.pause();const points=[];for(const time of [0,140,280]){animation.currentTime=time;points.push(element.getBoundingClientRect().top);}const retained=element.isConnected;const backdrop=element.parentElement?.getAnimations().find(animation=>animation.id==='slide-backdrop-exit');const original=animation;element.querySelector('button')?.click();const same=element.getAnimations().includes(original);animation.finish();resolve({points,retained,same,duration:animation.effect.getTiming().duration,backdrop:!!backdrop});}
     else if(!element.isConnected||performance.now()-start>2500)resolve({missing:true});else requestAnimationFrame(frame);
    };requestAnimationFrame(frame);
   });});
   await action();const result=await page.evaluate(()=>window.__exitCheck);samples.push({width,label,...result});
   check(!result.missing&&result.retained&&result.duration>=250,`${width}/${label}: overlay remains mounted while closing`);
   check(result.points[0]<result.points[1]&&result.points[1]<result.points[2]&&result.points[2]>=843,`${width}/${label}: closing moves continuously downward and off screen`);
   check(result.same,`${width}/${label}: repeated close clicks do not restart or submit the overlay`);
   await target.waitFor({state:'hidden'});check(await page.locator('[data-slide-exiting]').count()===0,`${width}/${label}: completed animations remove the overlay`);
  };
  const openBio=async()=>{await page.getByRole('button',{name:'编辑个人简介',exact:true}).click();return dialog('编辑个人简介');};
  let target=await openBio();await exit(target,()=>target.getByRole('button',{name:'取消',exact:true}).click(),'bio cancel');
  target=await openBio();await exit(target,()=>page.keyboard.press('Escape'),'bio Escape');
  target=await openBio();await exit(target,()=>page.mouse.click(width/2,8),'bio backdrop');
  target=await openBio();await target.getByRole('textbox',{name:'个人简介',exact:true}).fill('更新后的个人简介');failBio=true;await target.getByRole('button',{name:'保存',exact:true}).click();await target.getByRole('alert').waitFor();
  check(await target.getAttribute('data-slide-exiting')===null&&user.bio==='原有个人简介',`${width}: failed saves keep the editor open`);
  await exit(target,()=>target.getByRole('button',{name:'保存',exact:true}).click(),'bio save');check(user.bio==='更新后的个人简介',`${width}: saved bio survives the exit`);
  await page.locator('.owner-interest-card').first().click();target=dialog('我的爱好');await exit(target,()=>target.getByRole('button',{name:'取消',exact:true}).click(),'hobbies cancel');
  await page.locator('.owner-interest-card').first().click();target=dialog('我的爱好');await exit(target,()=>target.getByRole('button',{name:'保存爱好',exact:true}).click(),'hobbies save');
  await page.getByRole('button',{name:'编辑照片故事 1',exact:true}).click();target=dialog('编辑照片故事');await target.getByRole('textbox',{name:'照片配文',exact:true}).fill('修改后的照片故事');await exit(target,()=>target.getByRole('button',{name:'保存',exact:true}).click(),'photo story save');
  await page.getByRole('button',{name:'编辑照片故事 1',exact:true}).click();target=dialog('编辑照片故事');await exit(target,()=>target.getByRole('button',{name:'移除照片配文',exact:true}).click(),'photo story remove');
  await page.locator('.owner-story-add').click();target=dialog('新增照片故事');await exit(target,()=>target.getByRole('button',{name:'取消',exact:true}).click(),'new story cancel');
  for(const [trigger,title,save] of [['编辑 服务城市','服务城市','保存所选城市（1）'],['编辑 语言','服务语言','保存所选语言（1）']]){
   await page.getByRole('button',{name:trigger,exact:true}).click();target=dialog(title);await exit(target,()=>target.getByRole('button',{name:'返回',exact:true}).click(),`${title} back`);
   await page.getByRole('button',{name:trigger,exact:true}).click();target=dialog(title);await target.getByRole('button',{name:save,exact:true}).waitFor();await exit(target,()=>target.getByRole('button',{name:save,exact:true}).click(),`${title} save`);
  }
  await page.getByRole('button',{name:'我的服务套餐',exact:true}).click();await dialog('可以一起体验的事').getByRole('button',{name:'编辑',exact:true}).click();await dialog('服务详情').getByRole('button',{name:'选择服务城市',exact:true}).click();target=dialog('服务城市');await exit(target,()=>target.getByRole('button',{name:'确定所选城市（1）',exact:true}).click(),'package cities confirm');
  await dialog('服务详情').getByRole('button',{name:'Close',exact:true}).click();await dialog('可以一起体验的事').getByRole('button',{name:'Close',exact:true}).click();
  await page.getByRole('button',{name:'预览照片',exact:true}).click();target=dialog('我的照片');await exit(target,()=>target.getByRole('button',{name:'关闭照片',exact:true}).click(),'photo viewer close');
  target=await openBio();await exit(target,()=>target.getByRole('button',{name:'取消',exact:true}).evaluate(button=>button.click()),'close during entrance',false);
  target=await openBio();await target.getByRole('textbox',{name:'个人简介',exact:true}).fill('取消后不应保留的草稿');await target.evaluate(element=>element.dataset.previousEditor='true');await target.getByRole('button',{name:'取消',exact:true}).evaluate(button=>button.click());await page.locator('[data-slide-exiting]').waitFor();await page.getByRole('button',{name:'编辑个人简介',exact:true}).evaluate(button=>button.click());target=dialog('编辑个人简介');
  check(await target.getAttribute('data-previous-editor')===null&&await target.getByRole('textbox',{name:'个人简介',exact:true}).inputValue()===user.bio,`${width}: reopening during exit starts a fresh editor without cancelled input`);await exit(target,()=>target.getByRole('button',{name:'取消',exact:true}).click(),'reopened editor cancel');
  await page.emulateMedia({reducedMotion:'reduce'});target=await openBio();await target.getByRole('button',{name:'取消',exact:true}).click();await target.waitFor({state:'hidden'});check(await page.locator('[data-slide-exiting]').count()===0,`${width}: reduced motion closes immediately without leaving an overlay`);await page.emulateMedia({reducedMotion:'no-preference'});
  await page.getByRole('button',{name:'地球',exact:true}).click();await page.getByRole('button',{name:'搜索国家、城市、景点',exact:true}).click();target=dialog('探索地点');await exit(target,()=>target.getByRole('button',{name:'关闭',exact:true}).click(),'map search close');
  await page.getByRole('button',{name:'搜索国家、城市、景点',exact:true}).click();await dialog('探索地点').locator('.place-result').first().click();target=dialog('巴黎');await exit(target,()=>target.getByRole('button',{name:'返回地球',exact:true}).click(),'city sheet close');
  await page.getByRole('button',{name:'搜索国家、城市、景点',exact:true}).click();await dialog('探索地点').locator('.place-result').first().click();await dialog('巴黎').getByRole('button',{name:'找当地人',exact:true}).click();await page.getByRole('button',{name:'查看主页',exact:true}).click();target=dialog('个人主页');await exit(target,()=>target.getByRole('button',{name:'返回',exact:true}).click(),'public profile back');
  check(writes.length>=4,`${width}: successful edits submit their data`);await context.close();
 }
 check(errors.length===0,`no browser errors: ${errors.join('; ')}`);await writeFile(resolve(out,'report.json'),JSON.stringify({passed:true,checks,samples},null,2));console.log(`slide-exit: ${checks.length} checks passed`);
}catch(error){await writeFile(resolve(out,'report.json'),JSON.stringify({passed:false,error:error.message,checks,samples,errors},null,2));throw error;}finally{await browser.close();}
