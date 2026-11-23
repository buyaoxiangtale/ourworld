import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from 'playwright';
const out=resolve('artifacts/profile-hobbies');await mkdir(out,{recursive:true});
const base=process.env.OURWORLD_WEB_URL||'http://127.0.0.1:8188';
const browser=await chromium.launch({headless:true,args:['--no-proxy-server','--disable-gpu']});
const hobbyPhoto=await readFile(resolve('apps/api/assets/photos/portraits/01.jpg'));
const mediaId='caa8389a-bfcc-4026-9245-63c20d012345';
const checks=[],errors=[];const check=(value,label)=>{assert(value,label);checks.push(label);};
try{
 for(const width of [360,390,430]){
  const user={id:'hobby-fixture',name:'爱好测试',avatar:'',bio:'喜欢散步和摄影。',verified:true,providerStatus:'none',role:'user',accountType:'individual',tags:['摄影 Photography','城市漫步','咖啡','旧爱好'],cityIds:['city-paris'],priceRange:{min:80,max:120,currency:'CNY',unit:'day'}};
  const patches=[];let failSave=false;
  let draft={schemaVersion:1,theme:'nocturne',accent:'#DBB473',blocks:[{id:'intro',type:'intro',span:2,size:'compact'}]};
  let published=draft, revision=1, publishedRevision=1;
  const context=await browser.newContext({viewport:{width,height:844},locale:'zh-CN',hasTouch:true});
  await context.addInitScript(user=>{
   sessionStorage.setItem('ourworld.session',JSON.stringify({user,accessToken:'fixture',refreshToken:'fixture'}));localStorage.setItem('ourworld.locale','zh');
   window.__sheetAnimations=[];document.addEventListener('animationstart',event=>{if(event.target.matches('.profile-card-sheet'))window.__sheetAnimations.push({name:event.animationName,label:event.target.getAttribute('aria-label'),top:event.target.getBoundingClientRect().top,duration:getComputedStyle(event.target).animationDuration});});
  },user);
  await context.route('**/globe/**',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html></html>'}));await context.routeWebSocket('**/api/v1/ws**',socket=>socket.close());
  await context.route('**/api/v1/**',route=>{
   const path=new URL(route.request().url()).pathname.replace('/api/v1','');let json={items:[]};
   if(path.startsWith('/users/'))json={user,layout:published,posts:[],packages:[],reviews:[],places:[]};
   else if(path===`/media/${mediaId}`)return route.fulfill({contentType:'image/jpeg',body:hobbyPhoto});
   else if(path==='/uploads')json={id:mediaId,url:`/api/v1/media/${mediaId}`};
   else if(path==='/me'){
    if(route.request().method()==='PATCH'){const patch=route.request().postDataJSON();if(failSave){failSave=false;return route.fulfill({status:503,json:{message:'暂时无法保存爱好，请重试'}});}patches.push(patch);Object.assign(user,patch);}json=user;
   }else if(path==='/profile/draft'){
    if(route.request().method()==='PUT'){
     const payload=route.request().postDataJSON();
     assert.equal(payload.revision,revision);
     draft=payload.layout;
     revision++;
    }
    json={revision,publishedRevision,layout:draft};
   }else if(path==='/profile/publish'){
    assert.equal(route.request().postDataJSON().revision,revision);
    published=draft;
    publishedRevision=revision;
   }
   return route.fulfill({json});
  });
  const page=await context.newPage();page.setDefaultTimeout(12000);page.on('pageerror',error=>errors.push(error.message));await page.goto(base);await page.locator('.bottom-nav button[data-tab="profile"]').click();await page.locator('.owner-name').waitFor();
  const open=async()=>{await page.getByRole('button',{name:'新增爱好',exact:true}).click();const dialog=page.getByRole('dialog',{name:'我的爱好',exact:true});await dialog.waitFor();return dialog;};
  const waitForEntrance=async dialog=>{await page.waitForFunction(()=>document.querySelector('.profile-card-sheet')?.getAnimations().every(animation=>animation.playState==='finished'));check(await page.evaluate(()=>{const animation=window.__sheetAnimations.at(-1);return animation.name==='profileCardSheetEnter'&&parseFloat(animation.duration)>=.3;}),`${width}: editor plays the slide-up entry animation`);const bounds=await dialog.boundingBox();check(bounds.y>=0&&bounds.y<84&&bounds.y+bounds.height<=845,`${width}: slide animation settles fully inside the viewport`);};
  let dialog=await open();await waitForEntrance(dialog);
  check(await dialog.getByRole('searchbox',{name:'搜索爱好',exact:true}).count()===1&&await dialog.getByRole('heading',{name:'价值公益',exact:true}).count()===1&&await dialog.getByRole('heading',{name:'健康生活',exact:true}).count()===1,`${width}: hobby picker has a search field and reference categories`);
  check(await dialog.getByLabel('已选爱好数量',{exact:true}).innerText()==='4/10',`${width}: existing hobbies are counted and retained`);
  check(await dialog.getByRole('checkbox',{name:'摄影',exact:true}).getAttribute('aria-checked')==='true'&&await dialog.getByRole('checkbox',{name:'旧爱好',exact:true}).getAttribute('aria-checked')==='true',`${width}: catalog aliases and older custom hobbies are selected`);
  check(await dialog.getByRole('checkbox',{name:'志愿服务',exact:true}).count()===0,`${width}: categories initially show a preview`);
  await dialog.getByRole('button',{name:'显示更多 价值公益',exact:true}).click();await dialog.getByRole('checkbox',{name:'志愿服务',exact:true}).waitFor();
  check(await dialog.getByRole('button',{name:'收起 价值公益',exact:true}).getAttribute('aria-expanded')==='true',`${width}: Show more expands a category`);
  const beforeTyping=await page.evaluate(()=>window.__sheetAnimations.length);const search=dialog.getByRole('searchbox');await search.fill('Photography');
  check(await dialog.getByRole('checkbox').count()===1,`${width}: English hobby search finds the matching Chinese chip`);await dialog.getByRole('checkbox',{name:'摄影',exact:true}).click();await search.fill('City walks');
  check(await dialog.getByRole('checkbox').getAttribute('aria-checked')==='true',`${width}: searching keeps other selected hobbies`);
  await search.fill('not-a-hobby');await dialog.getByText('未找到爱好',{exact:true}).waitFor();
  check(await page.evaluate(()=>window.__sheetAnimations.length)===beforeTyping,`${width}: searching does not replay the entry animation`);
  await dialog.getByRole('button',{name:'取消',exact:true}).click();await dialog.waitFor({state:'hidden'});
  check(patches.length===0&&user.tags.includes('摄影 Photography'),`${width}: cancel preserves the original saved hobbies`);
  dialog=await open();while(await dialog.locator('[role=checkbox][aria-checked=true]').count())await dialog.locator('[role=checkbox][aria-checked=true]').first().click();
  check(await dialog.getByLabel('已选爱好数量',{exact:true}).innerText()==='0/10',`${width}: selected hobbies can all be cleared`);
  if(width===390)await page.screenshot({path:resolve(out,'hobbies-empty.png'),animations:'disabled'});
  while(await dialog.locator('[role=checkbox][aria-checked=true]').count()<10)await dialog.locator('[role=checkbox][aria-checked=false]:not([disabled])').first().click();
  check(await dialog.locator('[role=checkbox][aria-checked=false]:not([disabled])').count()===0,`${width}: selection is limited to ten hobbies`);
  if(width===390){await search.fill('平等');await page.screenshot({path:resolve(out,'hobbies-search.png'),animations:'disabled'});}
  const selected=await dialog.getByLabel('已选爱好数量',{exact:true}).innerText();failSave=true;await dialog.getByRole('button',{name:'保存爱好',exact:true}).click();await dialog.getByRole('alert').waitFor();
  check(await dialog.getByLabel('已选爱好数量',{exact:true}).innerText()===selected,`${width}: a failed save keeps all selections`);
  await dialog.getByRole('button',{name:'保存爱好',exact:true}).click();await dialog.waitFor({state:'hidden'});
  await page.waitForFunction(()=>document.querySelectorAll('.owner-interest-card').length===4);
  check(await page.locator('.owner-hobby-add').count()===1,`${width}: exactly one add-hobbies card remains after saving ten hobbies`);
  check(await page.locator('[data-hobby-category="values"] .profile-hobby-card-names').innerText()==='社会性发展、平等、政治、行动主义、人权、心理健康意识',`${width}: saved hobbies in the same category share one homepage card`);
  check(await page.locator('[data-hobby-category="values"] .profile-hobby-card-names').evaluate(element=>{const style=getComputedStyle(element);return style.textOverflow==='ellipsis'&&style.whiteSpace==='nowrap'&&element.scrollWidth>element.clientWidth;}),`${width}: long hobby names are truncated with an ellipsis`);
  check(user.tags.length===10&&Object.keys(patches.at(-1)).join(',')==='tags'&&user.name==='爱好测试'&&user.bio==='喜欢散步和摄影。',`${width}: hobby save updates only tags and refreshes the profile`);
  await page.getByRole('button',{name:'编辑个人简介',exact:true}).click();const bio=page.getByRole('dialog',{name:'编辑个人简介',exact:true});await bio.waitFor();await waitForEntrance(bio);
  check(await bio.getByRole('textbox',{name:'个人简介',exact:true}).inputValue()===user.bio,`${width}: biography retains its text inside the animated sheet`);await bio.getByRole('button',{name:'取消',exact:true}).click();
  await page.locator('.owner-story-add').click();const story=page.getByRole('dialog',{name:'新增照片故事',exact:true});await story.waitFor();await waitForEntrance(story);await story.getByRole('button',{name:'取消',exact:true}).click();
  await page.emulateMedia({reducedMotion:'reduce'});dialog=await open();
  check(await dialog.evaluate(element=>getComputedStyle(element).animationName)==='none',`${width}: reduced-motion preference disables the slide animation`);await dialog.getByRole('button',{name:'取消',exact:true}).click();
  user.tags=['政治','平等','社会性发展','咖啡','摄影 Photography','旧爱好'];await page.reload();await page.locator('.bottom-nav button[data-tab="profile"]').click();await page.locator('.owner-name').waitFor();
  const cards=page.locator('.profile-hobby-cards'),values=cards.locator('[data-hobby-category="values"]');await values.scrollIntoViewIfNeeded();
  check(await cards.locator('[data-hobby-category]').count()===4&&await values.locator('.profile-hobby-card-names').innerText()==='政治、平等、社会性发展',`${width}: three related interests share a card while different categories stay separate`);
  check(await cards.locator('.owner-hobby-add').count()===1&&await cards.locator('.profile-hobby-card').last().getAttribute('aria-label')==='新增爱好',`${width}: the add-hobbies card stays last after every saved category`);
  check(await cards.locator('[data-hobby-category="arts"] .profile-hobby-card-names').innerText()==='摄影'&&await cards.locator('[data-hobby-category="other"] .profile-hobby-card-names').innerText()==='旧爱好',`${width}: homepage localizes catalog aliases and preserves custom hobbies`);
  check(await values.locator('.profile-hobby-card-emojis>span').count()===3&&await values.locator('.profile-hobby-card-edit').count()===1,`${width}: category cards show large hobby illustrations and a pencil edit control`);
  check(await cards.evaluate(element=>{const children=[...element.children].map(child=>child.getBoundingClientRect());return getComputedStyle(element).overflowX==='auto'&&element.scrollWidth>element.clientWidth&&children.every(child=>Math.abs(child.top-children[0].top)<1);}),`${width}: all hobby cards fit on one scrollable row`);
  check(await values.evaluate(element=>{const about=document.querySelector('.owner-bio-card'),style=getComputedStyle(element),reference=getComputedStyle(about);return style.backgroundColor===reference.backgroundColor&&style.color===reference.color&&element.getBoundingClientRect().height<=208;}),`${width}: compact hobby cards share the About me card colors`);
  if(width===390)await page.screenshot({path:resolve(out,'homepage-grouped-hobbies.png'),animations:'disabled'});
  dialog=await open();check(await dialog.getByLabel('已选爱好数量',{exact:true}).innerText()==='6/10',`${width}: grouped card opens the existing picker with all saved selections`);await dialog.getByRole('button',{name:'取消',exact:true}).click();
  check(user.tags.join('|')==='政治|平等|社会性发展|咖啡|摄影 Photography|旧爱好',`${width}: displaying grouped hobbies never rewrites saved tags`);
  if(width===390){
   check(await page.locator('#owner-photos-title').innerText()==='我的足迹','the photo wall title is translated to My footprints');
   dialog=await open();
   const imageChoice=dialog.getByRole('combobox',{name:'爱好图片'});
   await imageChoice.selectOption('摄影 Photography');
   await dialog.locator('input[type=file]').setInputFiles({name:'hobby.jpg',mimeType:'image/jpeg',buffer:hobbyPhoto});
   await dialog.getByRole('button',{name:'更换图片',exact:true}).waitFor();
   await dialog.getByRole('button',{name:'保存爱好',exact:true}).click();
   await dialog.waitFor({state:'hidden'});
   await page.reload();await page.locator('.bottom-nav button[data-tab="profile"]').click();
   const arts=cards.locator('[data-hobby-category="arts"]');
   const image=arts.getByRole('img',{name:'摄影',exact:true});
   await image.waitFor();
   await image.scrollIntoViewIfNeeded();
   await page.waitForFunction(()=>document.querySelector('[data-hobby-category="arts"] img')?.naturalWidth>0);
   check(await image.evaluate(el=>{
    const box=el.getBoundingClientRect(), frame=el.parentElement.getBoundingClientRect();
    return getComputedStyle(el).objectFit==='cover'&&Math.abs(box.width-frame.width)<1&&box.height===84&&frame.height===84;
   }),'uploaded photos cover a fixed-height frame without stretching the card');
   check(await arts.locator('.profile-hobby-card-emojis').count()===0&&await values.locator('.profile-hobby-card-emojis').count()===1,'only a category with uploaded photos replaces Emoji');
   check(published.blocks.find(block=>block.type==='skills')?.refs.some(ref=>ref.includes(mediaId)),'the photo is stored in the existing profile layout');
   dialog=await open();
   await imageChoice.selectOption('摄影 Photography');
   await dialog.getByRole('button',{name:'移除图片',exact:true}).click();
   await dialog.getByRole('button',{name:'保存爱好',exact:true}).click();
   await dialog.waitFor({state:'hidden'});
   await arts.locator('.profile-hobby-card-emojis').waitFor();
   check(await arts.locator('img').count()===0,'removing an uploaded photo restores the default Emoji');
   user.tags=[];await page.reload();await page.locator('.bottom-nav button[data-tab="profile"]').click();await page.locator('.owner-name').waitFor();dialog=await open();
   check(await dialog.locator('.profile-hobby-pills>button').first().evaluate(element=>getComputedStyle(element).backgroundColor!==getComputedStyle(element.closest('.profile-hobby-category')).backgroundColor),'hobby chips have a visible background distinct from their category');
   await page.screenshot({path:resolve(out,'hobbies-empty.png'),animations:'disabled'});await dialog.getByRole('button',{name:'取消',exact:true}).click();
   user.tags=Array.from({length:12},(_,index)=>`原有爱好 ${index+1}`);await page.reload();await page.locator('.bottom-nav button[data-tab="profile"]').click();await page.locator('.owner-name').waitFor();dialog=await open();
   check(await dialog.getByLabel('已选爱好数量',{exact:true}).innerText()==='12/10'&&await dialog.getByRole('button',{name:'保存爱好',exact:true}).isDisabled(),`legacy profiles with more than ten hobbies are preserved and can be reduced explicitly`);
   await dialog.locator('[role=checkbox][aria-checked=true]').first().click();await dialog.locator('[role=checkbox][aria-checked=true]').first().click();check(await dialog.getByRole('button',{name:'保存爱好',exact:true}).isEnabled(),'legacy selections can be reduced to the new limit without truncation');await dialog.getByRole('button',{name:'取消',exact:true}).click();
   check(user.tags.length===12,'cancelling an over-limit edit preserves all original hobbies');
  }
  check(await page.locator('.owner-profile-page').evaluate(element=>element.scrollWidth<=element.clientWidth),`${width}: profile has no horizontal overflow`);
  await context.close();
 }
 check(errors.length===0,`no browser errors: ${errors.join('; ')}`);await writeFile(resolve(out,'report.json'),JSON.stringify({passed:true,checks},null,2));console.log(`profile-hobbies: ${checks.length} checks passed`);
}finally{await browser.close();}
