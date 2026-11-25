import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from 'playwright';
const out=resolve('artifacts/profile-hobbies');await mkdir(out,{recursive:true});
const base=process.env.OURWORLD_WEB_URL||'http://127.0.0.1:8188';
const browser=await chromium.launch({headless:true,args:['--no-proxy-server','--disable-gpu']});
const hobbyPhoto=await readFile(resolve('apps/api/assets/photos/portraits/01.jpg'));
const mediaId='caa8389a-bfcc-4026-9245-63c20d012345';
const sampleFiles=process.env.OURWORLD_HOBBY_PHOTOS?.split(':')??[];
const samplePhotos=await Promise.all(sampleFiles.map(file=>readFile(file)));
const preview=process.env.OURWORLD_HOBBY_PREVIEW;
const checks=[],errors=[];const check=(value,label)=>{assert(value,label);checks.push(label);};
try{
 for(const width of [360,390,430]){
  const user={id:'hobby-fixture',name:'爱好测试',avatar:'',bio:'喜欢散步和摄影。',verified:true,providerStatus:'none',role:'user',accountType:'individual',tags:['摄影 Photography','城市漫步','咖啡','旧爱好'],cityIds:['city-paris'],priceRange:{min:80,max:120,currency:'CNY',unit:'day'}};
  const patches=[];let failSave=false;let uploads=0;
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
   else if(path.startsWith(`/media/${mediaId}`)){
    const index=Number(path.slice(`/media/${mediaId}`.length).slice(1));
    return route.fulfill({contentType:'image/jpeg',body:samplePhotos[index]??hobbyPhoto});
   }else if(path==='/uploads'){
    const id=uploads===0?mediaId:`${mediaId}-${uploads}`;
    uploads++;
    json={id,url:`/api/v1/media/${id}`};
   }
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
  await page.waitForFunction(()=>document.querySelectorAll('.profile-hobby-card').length===3);
  check(await page.locator('.owner-hobby-add').count()===1,`${width}: add-hobbies remains available after saving ten hobbies`);
  check((await page.locator('[data-hobby-category="values"] .profile-hobby-card-tags li').allTextContents()).join('、')==='社会性发展、平等、政治、行动主义、人权、心理健康意识',`${width}: saved hobbies in the same category have separate tags on one card`);
  check(user.tags.length===10&&Object.keys(patches.at(-1)).join(',')==='tags'&&user.name==='爱好测试'&&user.bio==='喜欢散步和摄影。',`${width}: hobby save updates only tags and refreshes the profile`);
  await page.getByRole('button',{name:'编辑个人简介',exact:true}).click();const bio=page.getByRole('dialog',{name:'编辑个人简介',exact:true});await bio.waitFor();await waitForEntrance(bio);
  check(await bio.getByRole('textbox',{name:'个人简介',exact:true}).inputValue()===user.bio,`${width}: biography retains its text inside the animated sheet`);await bio.getByRole('button',{name:'取消',exact:true}).click();
  await page.locator('.owner-about-add').click();const story=page.getByRole('dialog',{name:'新增卡片',exact:true});await story.waitFor();await waitForEntrance(story);await story.getByRole('button',{name:'取消',exact:true}).click();
  await page.emulateMedia({reducedMotion:'reduce'});dialog=await open();
  check(await dialog.evaluate(element=>getComputedStyle(element).animationName)==='none',`${width}: reduced-motion preference disables the slide animation`);await dialog.getByRole('button',{name:'取消',exact:true}).click();
  user.tags=['政治','平等','社会性发展','咖啡','摄影 Photography','旧爱好'];await page.reload();await page.locator('.bottom-nav button[data-tab="profile"]').click();await page.locator('.owner-name').waitFor();
  const cards=page.locator('.profile-hobby-cards'),values=cards.locator('[data-hobby-category="values"]');await values.scrollIntoViewIfNeeded();
  check(await cards.locator('[data-hobby-category]').count()===4&&(await values.locator('.profile-hobby-card-tags li').allTextContents()).join('、')==='政治、平等、社会性发展',`${width}: three related interests share a card while different categories stay separate`);
  check(await cards.locator('.owner-hobby-add').count()===0&&await page.locator('.owner-hobby-add').count()===1,`${width}: add-hobbies sits outside the carousel`);
  check(await cards.locator('[data-hobby-category="arts"] .profile-hobby-card-tags li').innerText()==='摄影'&&await cards.locator('[data-hobby-category="other"] .profile-hobby-card-tags li').innerText()==='旧爱好',`${width}: homepage localizes aliases and preserves custom hobbies`);
  check(await values.locator('.profile-hobby-card-emojis>span').count()===3&&await page.locator('.profile-hobby-heading .profile-hobby-card-edit').count()===1,`${width}: no-photo cards preserve Emoji and the section offers editing`);
  check(await cards.evaluate(element=>{const children=[...element.children].map(child=>child.getBoundingClientRect());const style=getComputedStyle(element);return style.overflowX==='auto'&&style.scrollbarWidth==='none'&&element.scrollWidth>element.clientWidth&&children.every(child=>Math.abs(child.top-children[0].top)<1&&Math.abs(child.width-element.clientWidth)<1);}),`${width}: carousel shows one full-width card per snap without a scrollbar`);
  if(width===390)await page.screenshot({path:resolve(out,'homepage-grouped-hobbies.png'),animations:'disabled'});
  dialog=await open();check(await dialog.getByLabel('已选爱好数量',{exact:true}).innerText()==='6/10',`${width}: grouped card opens the existing picker with all saved selections`);await dialog.getByRole('button',{name:'取消',exact:true}).click();
  check(user.tags.join('|')==='政治|平等|社会性发展|咖啡|摄影 Photography|旧爱好',`${width}: displaying grouped hobbies never rewrites saved tags`);
  if(width===390){
   check(await page.locator('#owner-photos-title').innerText()==='我的足迹','the photo wall title is translated to My footprints');
   dialog=await open();
   const imageChoice=dialog.getByRole('group',{name:'爱好图片',exact:true});
   const pickPhotoHobby=name=>imageChoice.getByRole('button',{name,exact:true}).click();
   for(const hobby of ['建筑','设计']){
    await dialog.getByRole('searchbox').fill(hobby);
    await dialog.getByRole('checkbox',{name:hobby,exact:true}).click();
   }
   check(await dialog.getByRole('combobox',{name:'爱好图片'}).count()===0&&await imageChoice.evaluate(el=>{
    const children=[...el.children].map(child=>child.getBoundingClientRect());
    return el.scrollWidth>el.clientWidth&&children.every(child=>Math.abs(child.top-children[0].top)<1);
   }),'photo hobby selection is a single horizontally scrollable row of buttons');
   check(await imageChoice.getByRole('button',{name:'设计',exact:true}).getAttribute('aria-pressed')==='true','adding a hobby opens its own photo editor');
   await imageChoice.evaluate(el=>el.scrollTo({left:0,behavior:'instant'}));
   await imageChoice.scrollIntoViewIfNeeded();
   const railBounds=await imageChoice.boundingBox(),railTouch=await context.newCDPSession(page);
   const startX=railBounds.x+railBounds.width*.8,railY=railBounds.y+railBounds.height/2;
   await railTouch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:startX,y:railY}]});
   for(let step=1;step<=8;step++){
    await railTouch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:startX-step*railBounds.width*.075,y:railY}]});
    await new Promise(resolve=>setTimeout(resolve,20));
   }
   await railTouch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
   await page.waitForFunction(()=>document.querySelector('.profile-hobby-image-choices')?.scrollLeft>40);
   check(true,'swiping on a touch viewport scrolls the photo hobby choices horizontally');
   await pickPhotoHobby('摄影');
   await dialog.locator('input[type=file]').setInputFiles(Array.from({length:3},(_,index)=>({name:`hobby-${index}.jpg`,mimeType:'image/jpeg',buffer:samplePhotos[index]??hobbyPhoto})));
   await dialog.getByRole('button',{name:'更换图片',exact:true}).nth(2).waitFor();
   await page.mouse.move(1,1);
   check(await imageChoice.getByRole('button',{name:'摄影',exact:true}).evaluate(el=>getComputedStyle(el).backgroundColor)==='rgb(229, 219, 135)','the selected chip uses sulfur yellow');
   check(await dialog.getByRole('button',{name:'移除图片',exact:true}).first().evaluate(el=>getComputedStyle(el).color)==='rgb(232, 165, 170)','photo removal has its own color');
   await pickPhotoHobby('政治');
   check(await dialog.getByRole('button',{name:'更换图片',exact:true}).count()===0&&await dialog.getByRole('textbox',{name:'价值公益介绍（选填）'}).count()===1,'switching hobbies shows only the new hobby’s images and category introduction');
   await pickPhotoHobby('摄影');
   check(await dialog.getByRole('button',{name:'更换图片',exact:true}).count()===3,'switching back restores the uploaded photos before saving');
   await page.screenshot({path:resolve(out,'hobby-photo-editor.png'),animations:'disabled'});

   await dialog.getByRole('textbox',{name:'文化艺术介绍（选填）'}).fill('用镜头收藏街角的光，\n也记录日常里不经意的浪漫。\n这段文字会在第二行截断。');
   await dialog.getByRole('button',{name:'保存爱好',exact:true}).click();
   await dialog.waitFor({state:'hidden'});
   await page.reload();await page.locator('.bottom-nav button[data-tab="profile"]').click();
   const arts=cards.locator('[data-hobby-category="arts"]');
   const gallery=arts.locator('.profile-hobby-card-photos');
   const image=gallery.getByRole('img',{name:'摄影',exact:true}).first();
   await image.waitFor();
   await arts.scrollIntoViewIfNeeded();
   await arts.evaluate(el=>el.scrollIntoView({block:'center',inline:'start'}));
   await page.waitForFunction(()=>document.querySelector('[data-hobby-category="arts"] img')?.naturalWidth>0);
   check(await image.evaluate(el=>{
    const box=el.getBoundingClientRect(), frame=el.parentElement.getBoundingClientRect();
    return getComputedStyle(el).objectFit==='cover'&&Math.abs(box.width-frame.width)<1&&Math.abs(box.height-frame.height)<1&&Math.abs(frame.width/frame.height-1.88)<.03;
   }),'uploaded photos cover a stable landscape frame');
   check(await arts.locator('.profile-hobby-card-intro').evaluate(el=>{
    const tag=el.parentElement.querySelector('li:last-child').getBoundingClientRect();
    const intro=el.getBoundingClientRect();
    return intro.left>tag.right&&intro.top<tag.bottom&&getComputedStyle(el).whiteSpace==='normal';
   }),'the introduction starts beside the last hobby tag and collapses line breaks');
   check(await arts.locator('.profile-hobby-card-intro').evaluate(el=>getComputedStyle(el).webkitLineClamp==='2'&&el.scrollHeight>el.clientHeight),'long introductions are clipped at two lines');
   check(await gallery.locator('img').count()===3&&await arts.locator('.profile-hobby-photo-position>span').count()===3,'all uploaded photos and position markers survive reload');
   if(preview)await page.screenshot({path:preview,animations:'disabled'});
   const touch=await context.newCDPSession(page);
   const swipe=async(dx,dy,element=gallery)=>{
    const box=await element.boundingBox();
    const x=box.x+box.width*(dx<0?.75:.25),y=box.y+box.height*(dy<0?.78:.22);
    await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
    for(let i=1;i<=8;i++){
     await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+dx*i/8,y:y+dy*i/8}]});
     await new Promise(resolve=>setTimeout(resolve,24));
    }
    await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
   };
   const scrollTop=()=>page.locator('.owner-profile-page').evaluate(el=>{
    for(let node=el;node;node=node.parentElement){
     if(node.scrollHeight>node.clientHeight&&/auto|scroll/.test(getComputedStyle(node).overflowY))return node.scrollTop;
    }
    return document.scrollingElement.scrollTop;
   });
   const initialX=await cards.evaluate(el=>el.scrollLeft);
   const initialY=await scrollTop();
   await swipe(0,-105);
   await arts.getByRole('status',{name:'第 2 张，共 3 张'}).waitFor();
   check(await cards.evaluate(el=>el.scrollLeft)===initialX&&await scrollTop()===initialY,'vertical touch changes only the photo');
   await swipe(225,0);
   await page.waitForFunction(x=>document.querySelector('.profile-hobby-cards').scrollLeft<x-100,initialX);
   check(await arts.getByRole('status',{name:'第 2 张，共 3 张'}).count()===1,'horizontal touch changes only the card');
   await gallery.focus();
   await gallery.press('ArrowDown');
   await arts.getByRole('status',{name:'第 3 张，共 3 张'}).waitFor();
   check(await cards.evaluate(el=>getComputedStyle(el).scrollSnapType)==='x mandatory','desktop keyboard changes photos and the outer carousel snaps cards');
   const beforePageSwipe=await scrollTop();
   await swipe(0,110,page.locator('.profile-hobby-heading'));
   check(await scrollTop()<beforePageSwipe,'vertical touch outside the image scrolls the page');
   check(published.blocks.find(block=>block.type==='skills')?.refs.some(ref=>ref.includes(mediaId)),'photos are stored in the existing profile layout');
   dialog=await open();
   await pickPhotoHobby('摄影');
   const removals=dialog.getByRole('button',{name:'移除图片',exact:true});
   await removals.first().click();await removals.first().click();
   await dialog.getByRole('button',{name:'保存爱好',exact:true}).click();
   await dialog.waitFor({state:'hidden'});
   await page.waitForFunction(()=>document.querySelectorAll('[data-hobby-category="arts"] img').length===1);
   check(await arts.locator('.profile-hobby-photo-position').count()===0,'single photo needs no position markers');
   dialog=await open();
   await pickPhotoHobby('摄影');
   await removals.first().click();
   await dialog.getByRole('button',{name:'保存爱好',exact:true}).click();
   await dialog.waitFor({state:'hidden'});
   await arts.locator('.profile-hobby-card-emojis').waitFor();
   check(await arts.locator('img').count()===0,'removing all photos restores the default Emoji');
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
