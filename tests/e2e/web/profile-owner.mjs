import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {preview} from 'vite';
import {chromium} from 'playwright';

const root=resolve(import.meta.dirname,'../../..');
const out=resolve(root,'artifacts/profile-owner');await mkdir(out,{recursive:true});
const server=process.env.OURWORLD_WEB_URL?null:await preview({configFile:false,root:resolve(root,'apps/web'),preview:{host:'127.0.0.1',port:5186,strictPort:true}});
const base=process.env.OURWORLD_WEB_URL||'http://127.0.0.1:5186';
const browser=await chromium.launch({headless:true,args:['--no-proxy-server','--disable-gpu']});
const portrait=await readFile(resolve(root,'apps/api/assets/photos/portraits/01.jpg'));
const photo=await readFile(resolve(root,'apps/api/assets/photos/places/paris.jpg'));
const checks=[],errors=[];
const isStory=block=>block.type==='gallery'&&(block.id==='photo-caption'||block.id.startsWith('photo-caption-'));
const check=(value,label)=>{assert(value,label);checks.push(label);};
try{
 for(const width of (process.env.PROFILE_TEST_WIDTH?[Number(process.env.PROFILE_TEST_WIDTH)]:[360,390,430])){
  for(const state of (process.env.PROFILE_TEST_STATE?[process.env.PROFILE_TEST_STATE]:['empty','filled','long-name'])){
   const en=state==='long-name';
   const user={id:'owner-fixture',name:en?'Alexandria · A very long traveller name':'林予',avatar:'/api/v1/fixture/avatar.jpg',bio:state==='empty'?'':'用步行认识一座城市，喜欢街头摄影与安静的咖啡馆。',verified:true,providerStatus:'approved',accountType:'individual',role:'user',tags:state==='empty'?[]:['城市漫步','摄影','咖啡'],cityIds:['city-paris'],priceRange:state==='empty'?undefined:{min:80,max:120,currency:'USD',unit:'day'},experienceYears:3,languages:['中文','English','地方话']};
   let layout={schemaVersion:1,theme:'nocturne',accent:'#DBB473',blocks:state==='empty'?[]:[{id:'intro',type:'intro',span:2,size:'compact'},{id:'gallery',type:'gallery',span:2,size:'expanded',refs:Array.from({length:8},(_,i)=>`/api/v1/fixture/photo-${i}.jpg`)},{id:'photo-caption',type:'gallery',span:2,size:'expanded',title:'这张照片背后的故事',content:'旅途中，一次慢下来的清晨。',refs:['/api/v1/fixture/caption-only.jpg']},{id:'prompts',type:'prompts',span:2,size:'compact',prompts:[{question:'我最喜欢的城市角落',answer:'清晨的河边。'},{question:'一起去做什么',answer:'步行、拍照，喝一杯咖啡。'}]}]};
   let revision=1,published=0,uploads=0,failPublishOnce=false,failBioOnce=false,failLanguageOnce=false;const patches=[];
   const context=await browser.newContext({viewport:{width,height:844},locale:'zh-CN',hasTouch:true});
   await context.routeWebSocket('**/api/v1/ws**',ws=>ws.close());
   await context.addInitScript(({user,en})=>{Object.defineProperty(crypto,'randomUUID',{value:undefined});sessionStorage.setItem('ourworld.session',JSON.stringify({user,accessToken:'fixture',refreshToken:'fixture'}));localStorage.setItem('ourworld.locale',en?'en':'zh');},{user,en});
   await context.route('**/globe/**',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html></html>'}));
   await context.route('**/api/v1/**',async route=>{
    const path=new URL(route.request().url()).pathname.replace('/api/v1','');const method=route.request().method();
    if(path.startsWith('/fixture/'))return route.fulfill({contentType:'image/jpeg',body:path.includes('avatar')?portrait:photo});
    let json={};
    if(path.startsWith('/users/'))json={user,layout,posts:[{id:'story-fixture',images:['/api/v1/fixture/post-photo.jpg']}],packages:[],reviews:[],places:[{id:'city-paris',kind:'city',name:{zh:'巴黎',en:'Paris'},country:'France',lat:48.86,lng:2.35,description:{zh:'',en:''},image:''}]};
    else if(path==='/me'){if(method==='PATCH'){if(failBioOnce){failBioOnce=false;return route.fulfill({status:503,json:{message:'暂时无法保存简介，请重试'}});}const patch=route.request().postDataJSON();if(failLanguageOnce&&Object.hasOwn(patch,'languages')){failLanguageOnce=false;return route.fulfill({status:503,json:{message:'暂时无法保存语言，请重试'}});}patches.push(patch);Object.assign(user,patch);}json=user;}
    else if(path==='/profile/draft'){if(method==='PUT'){assert.equal(route.request().postDataJSON().revision,revision,'saved draft uses the latest revision');layout=route.request().postDataJSON().layout;revision++;}json={revision,layout,publishedRevision:1};}
    else if(path==='/profile/publish'){if(failPublishOnce){failPublishOnce=false;return route.fulfill({status:503,json:{message:'暂时无法更新，请重试'}});}published++;json={};}
    else if(path==='/uploads'){uploads++;json={id:`upload-${uploads}`,url:`/api/v1/fixture/upload-${uploads}.jpg`};}
    else if(path==='/places')json={items:[]};
    else if(path==='/conversations')json={items:[]};
    else if(path==='/favorites')json={items:[]};
    return route.fulfill({json});
   });
   const page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
   await page.goto(base,{waitUntil:'domcontentloaded'});await page.locator('.bottom-nav button[data-tab="profile"]').click();
   await page.locator('.owner-identity h1').waitFor();
   check(await page.getByRole('button',{name:'搭建主页',exact:true}).count()===0,'legacy profile builder entry is removed');await page.evaluate(()=>document.fonts.ready);
   const about=page.locator('.owner-about-track');
   const cards=about.locator('.owner-about-card');
   check(await cards.count()===(state==='empty'?1:3)&&await about.locator('.owner-about-add').count()===0,`${width}/${state}: add-card control stays outside the rail`);
   check(await cards.first().evaluate(el=>el.classList.contains('owner-about-bio')),`${width}/${state}: bio is always the first card`);
   check(await page.getByText('再添加 2 条旅行问答',{exact:true}).count()===0,`${width}/${state}: old prompt reminder is removed`);
   check(await page.locator('.photo-wall-image').count()===(state==='empty'?0:8),`${width}/${state}: photo wall shows all uploaded photos`);
   check(await page.locator('.owner-name svg').count()===0,`${width}/${state}: no checkmark beside the name`);
   check(await page.locator('.owner-profile-page .profile-portrait,.owner-profile-page .profile-banner-donut').count()===0,`${width}/${state}: compact header without progress indicator`);
   check(await page.locator('.tab-panel:has(.owner-profile-page)').evaluate(el=>getComputedStyle(el).scrollbarWidth)==='none',`${width}/${state}: sidebar scrollbar hidden`);
   if(state==='empty'){
    check(await about.locator('.owner-about-photo').count()===0&&await about.locator('.owner-about-bio').isVisible(),`${width}: empty About me keeps the bio editor without a blank photo`);
   }else{
    const [bio,first,picture]=['.owner-about-bio','.owner-about-story','.owner-about-photo'].map(selector=>about.locator(selector));
    const [rail,intro,story,image]=await Promise.all([about,bio,first,picture].map(item=>item.boundingBox()));
    check([story,image].every(card=>Math.abs(card.y-intro.y)<1&&Math.abs(card.width-intro.width)<1&&card.height===intro.height)&&
     Math.abs(rail.x-intro.x)<1&&Math.abs(rail.x+rail.width-story.x-story.width)<1&&image.x>=rail.x+rail.width,
     `${width}/${state}: one row of equal cards fits exactly two in the viewport`);
    check(await picture.locator('img').getAttribute('src')===layout.blocks.find(block=>block.id==='gallery').refs[0]&&
     (await picture.textContent()).trim()===''&&await first.locator('img').getAttribute('src')===layout.blocks.find(isStory).refs[0]&&
     await bio.getByText(user.bio,{exact:true}).count()===1,`${width}/${state}: About me keeps the original photos and bio, with no text on the photo-only tile`);
   }
   check(await page.locator('.owner-profile-page').evaluate(el=>el.scrollWidth<=el.clientWidth),`${width}/${state}: profile has no horizontal overflow`);
   check(await page.locator('.owner-completion').count()===(state==='empty'?1:0),`${width}/${state}: completion reminder reflects actual profile`);
   if(state==='empty')check((await page.locator('.owner-completion').innerText()).includes('报价区间'),`${width}: incomplete personal details specify the actual missing field`);
   if(width===390&&state==='filled'){
    const palette=await page.evaluate(()=>{
     const styles=(selector,property)=>getComputedStyle(document.querySelector(selector))[property];
     return [
      styles('.owner-profile-page','backgroundColor'),
      styles('.owner-toolbar .icon-button:not(.owner-toolbar-edit)','backgroundColor'),
      styles('.owner-toolbar-edit','backgroundColor'),
      styles('.owner-toolbar-edit','borderTopColor'),
      styles('.owner-name h1','color'),
      styles('[data-profile-chip="languages"]>span','color'),
      styles('.photo-wall-slogan.is-empty','color'),
      styles('.owner-toolbar-edit','color'),
      styles('[data-profile-chip="price"]>span','color'),
      styles('.owner-kicker','color'),
      styles('[data-profile-chip="cities"]','backgroundColor')
     ];
    });
    check(new Set(palette).size===11,'the profile uses eleven distinct reference colors before hover');
    const edit=page.locator('.owner-toolbar-edit');
    await edit.hover();
    await page.waitForFunction(()=>getComputedStyle(document.querySelector('.owner-toolbar-edit')).color==='rgb(240, 231, 164)');
    check(true,'toolbar hover adds cream yellow without changing the button layout');
    await page.mouse.move(1,1);
    const originalLayout=layout,originalBio=user.bio;
    layout={...layout,blocks:layout.blocks.filter(block=>block.type!=='gallery'&&block.type!=='prompts')};user.bio='';
    await page.reload();await page.locator('.bottom-nav button[data-tab="profile"]').click();await page.locator('.owner-name').waitFor();
    check(await page.locator('.owner-completion').count()===0,'complete personal details do not require photos, a bio, photo captions or legacy prompts');
    check(await page.getByText('再添加 3 张照片',{exact:true}).count()===0&&await page.locator('#owner-photos-title+svg').count()===0,'an empty optional gallery is not marked as incomplete');
    layout={...layout,blocks:[...layout.blocks,{id:'gallery',type:'gallery',span:2,size:'expanded',refs:['/api/v1/fixture/photo-0.jpg']}]};
    await page.reload();await page.locator('.bottom-nav button[data-tab="profile"]').click();await page.locator('.owner-name').waitFor();
    check(await page.locator('.owner-completion').count()===0,'one gallery photo does not trigger a three-photo completeness requirement');
    layout=originalLayout;user.bio=originalBio;await page.reload();await page.locator('.bottom-nav button[data-tab="profile"]').click();await page.locator('.owner-name').waitFor();
   }

   if(state==='filled'){
    const wall=page.locator('.photo-wall-grid');
    check(await wall.evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length)===3,`${width}: photo wall has three columns`);
    check(await wall.locator('.photo-wall-column').evaluateAll(columns=>columns.every(el=>el.scrollHeight>el.clientHeight&&getComputedStyle(el).overflowY==='auto')),`${width}: both side columns can scroll independently`);
    const gallery=layout.blocks.find(block=>block.id==='gallery');
    const savedRefs=gallery.refs;
    const initialGrid=await wall.boundingBox();
    const closeEnough=(a,b)=>Math.abs(a-b)<1;
    for(const count of [7,1,2,3,4,5,6]){
     gallery.refs=savedRefs.slice(0,count);
     await page.reload();await page.locator('.bottom-nav button[data-tab="profile"]').click();await wall.waitFor();
     if(count<=3){
      await page.locator('.photo-wall-manage').click();
      const editor=page.getByRole('dialog',{name:'我的照片',exact:true});
      await editor.locator('.card-photo-editor-grid article').first().waitFor();
      check(await editor.locator('.photo-wall-feature-toggle').count()===0,`${width}: main-photo option is hidden for ${count} photos`);
      await editor.getByRole('button',{name:'Close',exact:true}).click();
      await editor.waitFor({state:'hidden'});
      if(count===1)continue;
     }
     if(count===4||count===6){
      const primary=wall.getByRole('region',{name:'大图浏览'});
      const secondary=wall.getByRole('region',{name:'次图浏览'});
      const left=await primary.boundingBox(),right=await secondary.boundingBox(),grid=await wall.boundingBox();
      check(await primary.locator('.photo-wall-image').count()===count&&await secondary.locator('.photo-wall-image').count()===count-1,`${width}: ${count} photos start with the main image on the left and show the other photos on the right`);
      check(closeEnough(left.width,2*right.width)&&closeEnough(grid.width,initialGrid.width)&&closeEnough(grid.height,initialGrid.height),`${width}: ${count} photos use a 2:1 split at the original wall size`);
      check(await primary.locator('.photo-wall-image').first().getAttribute('aria-label')==='查看第 1 张照片',`${width}: the default main photo appears first`);
      for(const track of [primary,secondary]){
       check(await track.evaluate(el=>el.scrollHeight>el.clientHeight&&getComputedStyle(el).overflowY==='auto'),`${width}: both columns can scroll vertically with ${count} photos`);
       await track.evaluate(el=>el.scrollTo({top:el.scrollHeight}));
       check(await track.evaluate(el=>el.scrollTop>0),`${width}: the photo column can scroll beyond the first frame`);
      }
      continue;
     }
     const frames=await wall.locator('.photo-wall-image').evaluateAll(images=>images.map(image=>{
      const {x,y,width,height}=image.getBoundingClientRect();
      return {x,y,width,height};
     }));
     check(frames.length===count,`${width}: the ${count}-photo layout displays every photo`);
     const grid=await wall.boundingBox();
     check(closeEnough(grid.width,initialGrid.width)&&closeEnough(grid.height,initialGrid.height),`${width}: ${count} photos keep the original wall dimensions`);
     if(count===7){
      check(await wall.locator('.photo-wall-column').count()===2&&frames[0].width>frames[1].width,`${width}: seven photos retain the original center feature and side columns`);
     }else if(count===5){
      const [left,center,right,lowerLeft,lowerRight]=frames;
      check(left.x<center.x&&center.x<right.x&&closeEnough(left.width,center.width)&&closeEnough(right.width,center.width),`${width}: five photos have three equal columns with the main photo centered`);
      check(closeEnough(center.y,left.y)&&closeEnough(center.y,right.y)&&closeEnough(center.y+center.height,lowerLeft.y+lowerLeft.height)&&closeEnough(center.y+center.height,lowerRight.y+lowerRight.height),`${width}: the main and side images align at the top and bottom`);
     }else{
      const columns=count;
      check(frames.every((frame,index)=>{
       const column=frames[index%columns];
       const row=frames[Math.floor(index/columns)*columns];
       return closeEnough(frame.x,column.x)&&closeEnough(frame.y,row.y)&&closeEnough(frame.width,frames[0].width)&&closeEnough(frame.height,frames[0].height);
      }),`${width}: ${count} photos form equal cells across ${columns} columns`);
      if(count===3)check(await wall.locator('.photo-wall-image').nth(1).getAttribute('aria-label')==='查看第 1 张照片',`${width}: the main photo is centered for three photos`);
     }
    }
    gallery.refs=savedRefs;
    await page.reload();await page.locator('.bottom-nav button[data-tab="profile"]').click();await wall.waitFor();
   }
   if(width===390)await page.screenshot({path:resolve(out,`${state}-top.png`),animations:'disabled'});
   if(state!=='empty'){
    const expected=layout.blocks.find(b=>b.id==='gallery').refs[0];
    check(await page.locator('.owner-avatar-stack img').getAttribute('src')===expected&&await page.locator('.photo-wall-image img').first().getAttribute('src')===expected,`${width}/${state}: header and My photos use the same first image`);
    await page.locator('.owner-avatar-stack').click();const viewer=page.locator('.profile-photo-viewer');await viewer.waitFor();
    await viewer.locator('.profile-photo-position').getByText('1 / 8',{exact:true}).waitFor();
    check(await viewer.locator('.profile-photo-viewer-slide').count()===8,`${width}/${state}: viewer contains every gallery photo without story or caption photos`);
    check(await viewer.locator('.profile-photo-viewer-slide').first().evaluate(element=>{const card=element.getBoundingClientRect(),track=element.parentElement.getBoundingClientRect();return card.width<track.width*.9&&parseFloat(getComputedStyle(element).borderRadius)>20;}),`${width}/${state}: photo preview uses rounded cards narrower than the viewport`);

    await page.keyboard.press('ArrowRight');await viewer.locator('.profile-photo-position').getByText('2 / 8',{exact:true}).waitFor();
    await viewer.locator('.profile-photo-next').click();await viewer.locator('.profile-photo-position').getByText('3 / 8',{exact:true}).waitFor();
    await viewer.locator('.profile-photo-previous').click();await viewer.locator('.profile-photo-position').getByText('2 / 8',{exact:true}).waitFor();
    await page.keyboard.press('Escape');await viewer.waitFor({state:'hidden'});
    check(await page.locator('.owner-avatar-stack').evaluate(el=>el===document.activeElement),`${width}/${state}: closing the viewer restores focus to the photo`);
    await page.getByRole('button',{name:en?'View photo 6':'查看第 6 张照片',exact:true}).click();await viewer.locator('.profile-photo-position').getByText('6 / 8',{exact:true}).waitFor();
    await viewer.locator('.profile-photo-next').click();await viewer.locator('.profile-photo-position').getByText('7 / 8',{exact:true}).waitFor();
    await viewer.locator('.profile-photo-next').click();await viewer.locator('.profile-photo-position').getByText('8 / 8',{exact:true}).waitFor();
    check(await viewer.locator('.profile-photo-next').isDisabled(),`${width}/${state}: final photo has no next action`);
    await page.waitForFunction(()=>{const track=document.querySelector('.profile-photo-viewer-track'),card=track.lastElementChild.getBoundingClientRect(),box=track.getBoundingClientRect();return Math.abs(card.left+card.width/2-box.left-box.width/2)<2;});
    check(true,`${width}/${state}: the last card can be centered`);await page.keyboard.press('Escape');
    await page.locator('.owner-avatar-stack').click();await viewer.locator('.profile-photo-position').getByText('1 / 8',{exact:true}).waitFor();
    check(true,`${width}/${state}: reopening the header always starts with the first photo`);
    if(width===390&&state==='filled'){
     const track=viewer.locator('.profile-photo-viewer-track');await viewer.evaluate(element=>Promise.all(element.getAnimations().map(animation=>animation.finished.catch(()=>{}))));const box=await track.boundingBox();const cdp=await context.newCDPSession(page);const y=box.y+box.height*.4;
     await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+box.width*.85,y}]});
     for(let step=1;step<=8;step++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:box.x+box.width*(.85-.7*step/8),y}]});
     await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
     await viewer.locator('.profile-photo-position').getByText('2 / 8',{exact:true}).waitFor();check(true,'touch swipe moves to the next photo');
     await page.keyboard.press('Escape');await page.locator('.owner-avatar-stack').click();await viewer.locator('.profile-photo-position').getByText('1 / 8',{exact:true}).waitFor();await viewer.locator('.profile-photo-next').click();await page.waitForFunction(()=>{const el=document.querySelector('.profile-photo-viewer-track');const card=el.children[1].getBoundingClientRect(),track=el.getBoundingClientRect();return Math.abs(card.left+card.width/2-track.left-track.width/2)<2;});
     await page.mouse.move(box.x+box.width*.2,y);await page.mouse.down();await page.mouse.move(box.x+box.width*.9,y,{steps:12});await page.mouse.up();
     await viewer.locator('.profile-photo-position').getByText('1 / 8',{exact:true}).waitFor();check(true,'mouse drag moves back to the previous photo');
     await page.waitForFunction(()=>document.querySelector('.profile-photo-viewer-track')?.scrollLeft<2);check(await viewer.locator('.profile-photo-viewer-slide img').first().evaluate(el=>getComputedStyle(el).backgroundColor)==='rgba(0, 0, 0, 0)','photo letterboxing uses the viewer background');await page.screenshot({path:resolve(out,'photo-viewer.png'),animations:'disabled'});
     await viewer.getByRole('button',{name:'查看照片 4',exact:true}).click();await viewer.locator('.profile-photo-position').getByText('4 / 8',{exact:true}).waitFor();
     await page.waitForFunction(()=>{const track=document.querySelector('.profile-photo-viewer-track'),card=track.children[3].getBoundingClientRect(),box=track.getBoundingClientRect();return Math.abs(card.left+card.width/2-box.left-box.width/2)<2;});
     check(await viewer.locator('.profile-photo-viewer-track').evaluate(element=>{const track=element.getBoundingClientRect(),previous=element.children[2].getBoundingClientRect(),next=element.children[4].getBoundingClientRect();return previous.right>track.left&&next.left<track.right;}),'middle cards show neighboring photo previews on both sides');
     await page.screenshot({path:resolve(out,'photo-cards.png'),animations:'disabled'});

    }
    await page.keyboard.press('Escape');
    if(width===390&&state==='filled'){
     await page.getByRole('button',{name:'编辑照片墙标语',exact:true}).click();
     let manager=page.getByRole('dialog',{name:'我的照片',exact:true});
     const rail=manager.getByRole('region',{name:'左右浏览照片编辑卡片'});
     const firstCaption=rail.getByRole('textbox',{name:'照片 1 的介绍',exact:true});
     await firstCaption.waitFor();
     check(await firstCaption.getAttribute('placeholder')==='照片 1 的介绍'&&await rail.locator('label').count()===0,'photo captions are labeled inside the field without a duplicate heading');
     check(await rail.evaluate(el=>{
      const cards=[...el.children].map(card=>card.getBoundingClientRect());
      return cards.length===8&&el.scrollWidth>el.clientWidth&&el.scrollHeight<=el.clientHeight+1
       &&cards.every(card=>Math.abs(card.y-cards[0].y)<1);
     }),'eight photo cards remain on one horizontally scrollable row');
     const editorColors=await rail.evaluate(el=>[
      getComputedStyle(el.closest('.modal')).backgroundColor,
      getComputedStyle(el.querySelector('article')).backgroundColor,
      getComputedStyle(el.querySelector('textarea')).backgroundColor,
      getComputedStyle(el.querySelector('.photo-wall-photo-actions button:last-child')).color
     ]);
     assert.deepEqual(editorColors,['rgb(18, 17, 18)','rgb(27, 25, 27)','rgb(37, 34, 37)','rgb(232, 165, 170)']);
     checks.push('the modal, cards, fields and delete action use distinct palette colors');
     await rail.press('ArrowRight');
     await page.waitForFunction(()=>document.querySelector('.card-photo-editor-grid')?.scrollLeft>0);
     check(true,'the editing rail supports keyboard scrolling without leaving the dialog');
     await rail.evaluate(el=>el.scrollTo({left:0,behavior:'instant'}));
     await rail.scrollIntoViewIfNeeded();
     const bounds=await rail.boundingBox(),touch=await context.newCDPSession(page);
     const startX=bounds.x+bounds.width*.8,y=bounds.y+45;
     await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:startX,y}]});
     for(let step=1;step<=8;step++){
      await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:startX-step*bounds.width*.075,y}]});
      await new Promise(resolve=>setTimeout(resolve,20));
     }
     await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
     await page.waitForFunction(()=>document.querySelector('.card-photo-editor-grid')?.scrollLeft>40);
     check(true,'a touch swipe scrolls the cards sideways');
     await manager.screenshot({path:resolve(out,'photo-editor-rail.png'),animations:'disabled'});
     const slogan=manager.getByRole('textbox',{name:'照片墙标语',exact:true});
     await slogan.fill('用脚步收集光和风。');
     await manager.getByRole('button',{name:'保存并更新主页',exact:true}).click();
     await manager.waitFor({state:'hidden'});
     await page.locator('.photo-wall-slogan').getByText('用脚步收集光和风。',{exact:true}).waitFor();
     await page.getByRole('button',{name:'编辑第 8 张照片的介绍',exact:true}).click();
     const lastCaption=manager.getByRole('textbox',{name:'照片 8 的介绍',exact:true});
     await lastCaption.waitFor();
     await page.waitForFunction(()=>document.activeElement?.getAttribute('aria-label')==='照片 8 的介绍');
     check(await lastCaption.evaluate(el=>{
      const frame=el.closest('.card-photo-editor-grid').getBoundingClientRect(),box=el.getBoundingClientRect();
      return box.left>=frame.left&&box.right<=frame.right+1;
     }),'opening a later caption scrolls its card into view and focuses the field');
     await manager.getByRole('button',{name:'Close',exact:true}).click();
     await manager.waitFor({state:'hidden'});
     await page.getByRole('button',{name:'编辑第 2 张照片的介绍',exact:true}).click();
     const caption=manager.getByRole('textbox',{name:'照片 2 的介绍',exact:true});
     await caption.waitFor();
     check(await caption.evaluate(el=>el===document.activeElement),'caption shortcut focuses that photo’s field');
     await caption.fill('下过雨的街角。');
     await manager.locator('article').nth(1).getByRole('button',{name:'前移照片',exact:true}).click();
     await manager.getByRole('button',{name:'保存并更新主页',exact:true}).click();await manager.waitFor({state:'hidden'});
     await page.waitForFunction(()=>document.querySelector('.owner-avatar-stack img')?.getAttribute('src')==='/api/v1/fixture/photo-1.jpg');
     check(await page.locator('.photo-wall-image img').first().getAttribute('src')==='/api/v1/fixture/photo-1.jpg','reordering My photos changes the default header image');
     await page.reload();await page.locator('.bottom-nav button[data-tab="profile"]').click();
     await page.locator('.photo-wall-slogan').getByText('用脚步收集光和风。',{exact:true}).waitFor();
     await page.locator('.photo-wall-feature .photo-wall-caption').getByText('下过雨的街角。',{exact:true}).waitFor();
     check(true,'slogan survives reload and a caption follows its photo after reordering');
     await page.locator('.photo-wall').scrollIntoViewIfNeeded();
     await page.screenshot({path:resolve(out,'photo-wall.png'),animations:'disabled'});

     await page.locator('.photo-wall-manage').click();
     const mainPhotoCard=manager.locator('article').nth(2);
     await manager.locator('article').nth(1).getByRole('button',{name:'设为主照片',exact:true}).click();
     await mainPhotoCard.getByRole('button',{name:'设为主照片',exact:true}).click();
     check(await manager.getByRole('button',{name:'主照片',pressed:true,exact:true}).count()===1,'only one photo can be selected as the main photo');
     check(await mainPhotoCard.getByRole('button',{name:'主照片',pressed:true,exact:true}).count()===1,'the selected card shows the main-photo state');
     await manager.getByRole('button',{name:'保存并更新主页',exact:true}).click();await manager.waitFor({state:'hidden'});
     await page.reload();await page.locator('.bottom-nav button[data-tab="profile"]').click();
     const featured=page.locator('.photo-wall-feature');
     check(await featured.locator('img').getAttribute('src')==='/api/v1/fixture/photo-2.jpg','the chosen main photo stays in the center after reload');
     const aboutPhoto=page.locator('.owner-about-photo');
     check(await aboutPhoto.locator('img').getAttribute('src')==='/api/v1/fixture/photo-2.jpg','About me uses the chosen main photo');
     await aboutPhoto.click();
     await viewer.locator('.profile-photo-position').getByText('3 / 8',{exact:true}).waitFor();
     await page.keyboard.press('Escape');await viewer.waitFor({state:'hidden'});
     check(await page.locator('.owner-avatar-stack img').getAttribute('src')==='/api/v1/fixture/photo-1.jpg','choosing the main photo preserves album order and the header image');
     await featured.getByRole('button',{name:'查看第 3 张照片',exact:true}).click();
     await viewer.locator('.profile-photo-position').getByText('3 / 8',{exact:true}).waitFor();
     await page.keyboard.press('Escape');await viewer.waitFor({state:'hidden'});
     check(true,'opening the centered photo uses its album position');
     await page.locator('.photo-wall-manage').click();
     await manager.getByRole('button',{name:'删除照片 3',exact:true}).click();
     await manager.getByRole('button',{name:'删除照片 1',exact:true}).click();
     await manager.getByRole('button',{name:'保存并更新主页',exact:true}).click();await manager.waitFor({state:'hidden'});
     await page.waitForFunction(()=>document.querySelector('.photo-wall-grid-6 .photo-wall-image img')?.getAttribute('src')==='/api/v1/fixture/photo-0.jpg');
     check(await page.locator('.owner-avatar-stack img').getAttribute('src')==='/api/v1/fixture/photo-0.jpg','deleting the main photo falls back to the first remaining photo in the six-photo split layout');
     const largePhotos=page.getByRole('region',{name:'大图浏览'});
     await largePhotos.evaluate(el=>el.scrollTo({top:el.scrollHeight}));
     await page.locator('.photo-wall-manage').click();
     await manager.locator('article').nth(1).getByRole('button',{name:'设为主照片',exact:true}).click();
     await manager.getByRole('button',{name:'保存并更新主页',exact:true}).click();await manager.waitFor({state:'hidden'});
     await page.waitForFunction(()=>document.querySelector('.photo-wall-primary img')?.getAttribute('src')==='/api/v1/fixture/photo-3.jpg');
     check(await largePhotos.evaluate(el=>el.scrollTop===0),'saving a new main photo jumps the large gallery back to the selected photo');
     await page.reload();await page.locator('.bottom-nav button[data-tab="profile"]').click();
     check(await largePhotos.locator('img').first().getAttribute('src')==='/api/v1/fixture/photo-3.jpg','the selected large photo stays first after reload');
    }
   }else check(await page.locator('.owner-avatar-stack img').count()===0,`${width}: an empty gallery has a shared add-photo entry instead of an independent avatar`);

   await page.locator('.owner-toolbar button').first().click();
   const form=page.getByRole('dialog',{name:en?'The person behind the profile':'让别人认识你',exact:true});
   check(await form.locator('.avatar-edit,input[type=file]').count()===0&&await form.getByRole('button',{name:en?'Manage my photos':'管理我的照片',exact:true}).count()===0,`${width}/${state}: personal details have no photo editing`);
   const lower=form.getByLabel(en?'Rate from':'报价下限',{exact:true}),upper=form.getByLabel(en?'Rate to':'报价上限',{exact:true});
   const lowerBox=await lower.boundingBox(),upperBox=await upper.boundingBox(),bounds=await form.locator('.profile-rate-bounds').boundingBox();
   check(lowerBox.width>=bounds.width*.9&&upperBox.width>=bounds.width*.9&&upperBox.y>lowerBox.y,`${width}/${state}: rate bounds use full-width separate rows`);
   if(state==='empty'){
    check(await lower.inputValue()===''&&await upper.inputValue()==='',`${width}: unset rates have no example default amounts`);
    check(await form.getByLabel('币种',{exact:true}).inputValue()===''&&await form.getByLabel('计价单位',{exact:true}).inputValue()==='',`${width}: unset rates do not assume a currency or unit`);
    check(await lower.getAttribute('placeholder')==='填写最低报价'&&await upper.getAttribute('placeholder')==='填写最高报价',`${width}: rate placeholders are instructions rather than sample prices`);
    if(width===390){await form.locator('.profile-rate-fields').scrollIntoViewIfNeeded();await page.screenshot({path:resolve(out,'rate-defaults.png'),animations:'disabled'});}
   }else check(await lower.inputValue()==='80'&&await upper.inputValue()==='120'&&await form.getByLabel(en?'Currency':'币种',{exact:true}).inputValue()==='USD',`${width}/${state}: saved rates and currency are prefilled accurately`);
   check(await form.getByRole('checkbox').count()===0,`${width}/${state}: language choices are moved off the personal details form`);
   await form.getByRole('button',{name:en?/^Service languages/:/^服务语言/}).click();
   const languageGroup=page.getByRole('dialog',{name:en?'Service languages':'服务语言',exact:true});await languageGroup.waitFor();
   check(await languageGroup.getByRole('searchbox').count()===1&&await languageGroup.getByRole('checkbox').count()>=20,`${width}/${state}: service languages have an independent searchable page`);
   check(await languageGroup.getByRole('checkbox',{name:en?'Mandarin Chinese':'中文（普通话）',exact:true}).getAttribute('aria-checked')==='true'&&await languageGroup.getByRole('checkbox',{name:'地方话',exact:true}).getAttribute('aria-checked')==='true',`${width}/${state}: existing language aliases and unlisted languages remain selected`);
   const japanese=languageGroup.getByRole('checkbox',{name:en?'Japanese':'日语',exact:true});await japanese.click();
   check(await japanese.getAttribute('aria-checked')==='true',`${width}/${state}: service languages support multiple selections`);
   const search=languageGroup.getByRole('searchbox');await search.fill('Francais');
   check(await languageGroup.getByRole('checkbox').count()===1,`${width}/${state}: language search ignores French accents`);
   await search.fill('mandarin');check(await languageGroup.getByRole('checkbox').count()===1,`${width}/${state}: aliases are searchable`);
   await search.fill('粤语');check(await languageGroup.getByRole('checkbox').count()===1,`${width}/${state}: Chinese language names are searchable`);
   await search.fill('not-a-language');await languageGroup.getByText(en?'No languages found':'未找到语言',{exact:true}).waitFor();
   await search.fill('Japanese');check(await languageGroup.getByRole('checkbox').getAttribute('aria-checked')==='true',`${width}/${state}: changing search preserves selected languages`);
   const beforeCancel=patches.length;await languageGroup.getByRole('button',{name:en?'Back':'返回',exact:true}).click();await languageGroup.waitFor({state:'hidden'});
   await form.getByRole('button',{name:'Close',exact:true}).click();check(patches.length===beforeCancel,`${width}/${state}: cancelling language edits sends no changes`);
   const panel=page.locator('.tab-panel:has(.owner-profile-page)');await panel.evaluate(el=>el.scrollTop=900);
   check(await panel.evaluate(el=>el.scrollTop)>0,`${width}/${state}: profile still scrolls`);
   const settings=await page.locator('.owner-toolbar button').last().boundingBox();const nav=await page.locator('.bottom-nav').boundingBox();
   check(settings.y>=0&&settings.y+settings.height<nav.y,`${width}/${state}: toolbar stays accessible while scrolling`);
   if(width===390){await page.locator('#owner-about-title').scrollIntoViewIfNeeded();await page.screenshot({path:resolve(out,`${state}-cards.png`),animations:'disabled'});}
   await page.locator('.owner-toolbar button').last().click();await page.getByRole('dialog').waitFor();await page.getByRole('button',{name:'Close',exact:true}).click();
   if(width===390&&state==='empty'){
    await page.locator('.photo-wall-manage').click();await page.getByRole('dialog').waitFor();
    check(await page.locator('.editor-overlay,.agent-panel,.layout-editor-block').count()===0,'photo editing has no legacy studio or AI tools');
    await page.getByRole('dialog',{name:'我的照片',exact:true}).getByText('添加照片',{exact:true}).waitFor();
    check(true,'photo card opens its independent upload control');
    await page.locator('input[type=file]').setInputFiles({name:'travel.jpg',mimeType:'image/jpeg',buffer:photo});
    await page.locator('.card-photo-editor-grid article').waitFor();
    await page.getByRole('button',{name:'保存并更新主页',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});
    check(layout.blocks.some(b=>b.type==='gallery'&&b.refs.includes('/api/v1/fixture/upload-1.jpg')),'photo card uploads and publishes a real selected file');
    await page.waitForFunction(()=>document.querySelector('.owner-avatar-stack img')?.getAttribute('src')==='/api/v1/fixture/upload-1.jpg');
    check(await page.locator('.photo-wall-caption.is-empty').count()===1,'uploads can be published without an introduction');

    await page.locator('.owner-avatar-stack').click();let photosDialog=page.locator('.profile-photo-viewer');await photosDialog.locator('.profile-photo-position').getByText('1 / 1',{exact:true}).waitFor();
    check(await photosDialog.locator('.profile-photo-next,.profile-photo-previous').count()===0,'a single photo has no redundant navigation controls');await page.keyboard.press('Escape');
    await photosDialog.waitFor({state:'hidden'});

    await page.locator('.photo-wall-manage').click();await page.getByRole('button',{name:'删除照片 1',exact:true}).click();
    await page.getByRole('button',{name:'保存并更新主页',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});
    check(layout.blocks.length>0&&!layout.blocks.some(b=>b.type==='gallery'),'removing the last photo preserves a valid non-empty layout');
    check(await page.locator('.owner-avatar-stack img').count()===0,'removing the last gallery photo also clears the header photo');
    await page.locator('.owner-avatar-stack').click();await page.getByRole('dialog',{name:'我的照片',exact:true}).waitFor();await page.getByRole('button',{name:'Close',exact:true}).click();
    check(true,'the empty header opens the same My photos management dialog');

    await page.getByRole('button',{name:'编辑个人简介',exact:true}).click();
    let editor=page.getByRole('dialog',{name:'添加个人简介',exact:true});
    check(await editor.getByRole('button',{name:'保存',exact:true}).isDisabled(),'empty bio starts with save disabled');
    await editor.getByRole('textbox',{name:'个人简介',exact:true}).fill('这段简介取消保存');
    await editor.getByRole('button',{name:'取消',exact:true}).click();
    check(user.bio===''&&patches.length===0,'cancelling the bio editor leaves the profile unchanged');
    await page.getByRole('button',{name:'编辑个人简介',exact:true}).click();
    await editor.getByRole('textbox',{name:'个人简介',exact:true}).fill('旅'.repeat(501));
    check((await editor.getByRole('textbox',{name:'个人简介',exact:true}).inputValue()).length===500,'bio input is limited to 500 characters');
    await editor.getByText('500/500',{exact:true}).waitFor();
    await editor.getByRole('textbox',{name:'个人简介',exact:true}).fill('喜欢城市漫步、摄影和海边的日常。');
    await page.locator('.toast').waitFor({state:'hidden'});await page.screenshot({path:resolve(out,'bio-editor.png'),animations:'disabled'});
    failBioOnce=true;await editor.getByRole('button',{name:'保存',exact:true}).click();await editor.getByRole('alert').waitFor();
    check(await editor.getByRole('textbox',{name:'个人简介',exact:true}).inputValue()==='喜欢城市漫步、摄影和海边的日常。','bio save failure preserves the entered text');
    await editor.getByRole('button',{name:'保存',exact:true}).click();await editor.waitFor({state:'hidden'});
    check(Object.keys(patches.at(-1)).join(',')==='bio'&&user.bio==='喜欢城市漫步、摄影和海边的日常。','bio editor saves only the bio and updates the owner card');
    await page.locator('.owner-about-bio').getByText(user.bio,{exact:true}).waitFor();
    await page.getByRole('button',{name:'新增卡片',exact:true}).click();editor=page.getByRole('dialog',{name:'新增卡片',exact:true});
    await editor.getByRole('button',{name:'保存',exact:true}).waitFor();check(await editor.getByRole('button',{name:'保存',exact:true}).isDisabled(),'photo card requires a photo');
    const uploadContrast=await editor.locator('.profile-caption-upload').evaluate(element=>{
     const canvas=document.createElement('canvas');canvas.width=canvas.height=1;const context=canvas.getContext('2d');
     const sample=color=>{context.fillStyle=color;context.fillRect(0,0,1,1);return [...context.getImageData(0,0,1,1).data].slice(0,3).map(value=>{const s=value/255;return s<=.04045?s/12.92:((s+.055)/1.055)**2.4;}).reduce((sum,value,index)=>sum+value*[.2126,.7152,.0722][index],0);};
     const bg=sample(getComputedStyle(element).backgroundColor),fg=sample(getComputedStyle(element.querySelector('span')).color);return (Math.max(bg,fg)+.05)/(Math.min(bg,fg)+.05);
    });check(uploadContrast>=4.5,'photo upload button has readable text contrast on its stronger background');
    await page.locator('.toast').waitFor({state:'hidden'});await page.screenshot({path:resolve(out,'photo-story-upload.png'),animations:'disabled'});

    await editor.locator('input[type=file]').setInputFiles({name:'story.jpg',mimeType:'image/jpeg',buffer:photo});
    await editor.getByRole('button',{name:'选择照片 1',exact:true}).waitFor();
    await editor.getByLabel('标题（选填）',{exact:true}).fill('我想与你分享的风景');await editor.getByRole('textbox',{name:'照片配文',exact:true}).fill('清晨安静的河岸。');
    failPublishOnce=true;await editor.getByRole('button',{name:'保存',exact:true}).click();await editor.getByRole('alert').filter({hasText:'暂时无法更新'}).waitFor();
    await page.screenshot({path:resolve(out,'photo-story-editor.png'),animations:'disabled'});
    check(await editor.getByRole('textbox',{name:'照片配文',exact:true}).inputValue()==='清晨安静的河岸。','failed publish preserves the photo caption');
    await editor.getByRole('button',{name:'保存',exact:true}).click();await editor.waitFor({state:'hidden'});
    const captionBlock=layout.blocks.find(isStory);
    check(published===3&&captionBlock.content==='清晨安静的河岸。'&&captionBlock.title==='我想与你分享的风景'&&captionBlock.refs[0]==='/api/v1/fixture/upload-2.jpg','photo story retries with the latest draft revision and publishes its selected image, title and caption');
    await page.locator('.owner-about-story').getByText('清晨安静的河岸。',{exact:true}).waitFor();
    check(await page.locator('.owner-about-add').count()===1&&await cards.count()===2,'saving the first story adds one card');
    await page.getByRole('button',{name:'新增卡片',exact:true}).click();editor=page.getByRole('dialog',{name:'新增卡片',exact:true});
    await editor.getByRole('textbox',{name:'照片配文',exact:true}).waitFor();check(await editor.getByRole('textbox',{name:'照片配文',exact:true}).inputValue()==='','adding another story opens a blank editor');
    await editor.locator('input[type=file]').setInputFiles({name:'another-story.jpg',mimeType:'image/jpeg',buffer:photo});await editor.getByRole('button',{name:'选择照片 1',exact:true}).waitFor();
    await editor.getByRole('textbox',{name:'照片配文',exact:true}).fill('第二段故事：山间的日落。');await editor.getByRole('button',{name:'保存',exact:true}).click();await editor.waitFor({state:'hidden'});
    await page.locator('.owner-about-story').getByText('第二段故事：山间的日落。',{exact:true}).waitFor();
    check(layout.blocks.filter(isStory).length===2&&new Set(layout.blocks.filter(isStory).map(block=>block.id)).size===2,'multiple stories use independent identifiers');
    check(layout.blocks.find(block=>block.id===captionBlock.id).content==='清晨安静的河岸。'&&await cards.count()===3,'adding a second story keeps the first');
    const firstStoryImage=page.locator('.owner-about-story .owner-about-image').nth(0);
    const secondStoryImage=page.locator('.owner-about-story .owner-about-image').nth(1);
    check(await page.locator('.owner-about-story').nth(1).getByText('第二段故事：山间的日落。',{exact:true}).count()===1&&
     Math.abs((await firstStoryImage.boundingBox()).height-(await secondStoryImage.boundingBox()).height)<1,'both photo stories use the same layout');
    await page.getByRole('button',{name:'新增卡片',exact:true}).click();await page.getByRole('button',{name:'取消',exact:true}).click();await page.getByRole('dialog',{name:'新增卡片',exact:true}).waitFor({state:'hidden'});check(layout.blocks.filter(isStory).length===2,'cancelling a new story does not create an empty saved block');
    await page.getByRole('button',{name:'编辑卡片 1',exact:true}).click();editor=page.getByRole('dialog',{name:'编辑卡片',exact:true});
    await editor.getByRole('textbox',{name:'照片配文',exact:true}).waitFor();check(await editor.getByRole('textbox',{name:'照片配文',exact:true}).inputValue()==='清晨安静的河岸。','editing a story opens only that story');
    await editor.getByRole('textbox',{name:'照片配文',exact:true}).fill('清晨安静的河岸，一起走走。');await editor.getByRole('button',{name:'保存',exact:true}).click();await editor.waitFor({state:'hidden'});
    await page.locator('.owner-about-story').getByText('清晨安静的河岸，一起走走。',{exact:true}).waitFor();
    check(layout.blocks.filter(isStory).length===2&&layout.blocks.filter(isStory)[1].content==='第二段故事：山间的日落。','editing the first story preserves the second');
    await page.locator('#owner-about-title').scrollIntoViewIfNeeded();await page.screenshot({path:resolve(out,'multiple-photo-stories.png'),animations:'disabled'});

    await page.locator('.photo-wall-manage').click();await page.getByRole('dialog').waitFor();
    await page.locator('input[type=file]').setInputFiles({name:'gallery.jpg',mimeType:'image/jpeg',buffer:photo});await page.locator('.card-photo-editor-grid article').waitFor();
    await page.getByRole('button',{name:'保存并更新主页',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});
    check(layout.blocks.filter(isStory).length===2&&layout.blocks.find(block=>block.id===captionBlock.id)?.content==='清晨安静的河岸，一起走走。','editing the photo gallery preserves every separate photo story');
    await page.waitForFunction(()=>document.querySelector('.owner-avatar-stack img')?.getAttribute('src')==='/api/v1/fixture/upload-4.jpg');
    check(await cards.count()===4&&await cards.last().locator('img').getAttribute('src')==='/api/v1/fixture/upload-4.jpg','the uploaded photo joins the four-card row');
    const seek=offset=>page.waitForFunction(index=>{
     const rail=document.querySelector('.owner-about-track');
     return Math.abs(rail.scrollLeft-index*(rail.children[1].offsetLeft-rail.children[0].offsetLeft))<1;
    },offset);
    await about.evaluate(rail=>{rail.scrollLeft=0;});await seek(0);
    await about.focus();await page.keyboard.press('ArrowRight');await seek(1);
    await page.getByRole('button',{name:'下一张卡片',exact:true}).click();await seek(2);
    const railBox=await about.boundingBox();const dragY=railBox.y+railBox.height*.3;
    await page.mouse.move(railBox.x+railBox.width*.2,dragY);await page.mouse.down();
    await page.mouse.move(railBox.x+railBox.width*.72,dragY,{steps:12});await page.mouse.up();await seek(1);
    const cdp=await context.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:railBox.x+railBox.width*.78,y:dragY}]});
    for(let step=1;step<=10;step++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:railBox.x+railBox.width*(.78-.57*step/10),y:dragY}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await seek(2);
    check(await page.getByRole('button',{name:'下一张卡片',exact:true}).isDisabled(),'keyboard, buttons, mouse drag and touch snap to card boundaries');
    await page.getByRole('button',{name:'新增卡片',exact:true}).click();
    editor=page.getByRole('dialog',{name:'新增卡片',exact:true});
    await editor.getByRole('button',{name:'选择照片 1',exact:true}).click();
    await editor.getByRole('button',{name:'保存',exact:true}).click();await editor.waitFor({state:'hidden'});
    const imageOnly=about.locator('.owner-about-story.is-image-only');
    await imageOnly.waitFor({state:'attached'});
    const savedImage=layout.blocks.filter(isStory).at(-1);
    check(!savedImage.title&&!savedImage.content&&await cards.count()===5&&await imageOnly.locator('.owner-about-copy').count()===0&&
     (await imageOnly.boundingBox()).height===(await imageOnly.locator('img').boundingBox()).height,'pure-image cards save without text and fill the entire card');
    await imageOnly.getByRole('button').click();editor=page.getByRole('dialog',{name:'编辑卡片',exact:true});
    await editor.getByRole('textbox',{name:'照片配文',exact:true}).fill('一段很长的照片故事。'.repeat(45));
    await editor.getByRole('button',{name:'保存',exact:true}).click();await editor.waitFor({state:'hidden'});
    const longStory=about.locator('.owner-about-story').last();
    await longStory.locator('.owner-about-copy').waitFor({state:'attached'});
    check(await longStory.locator('.owner-about-copy').evaluate(element=>{element.scrollTop=20;return element.scrollTop>0;})&&
     (await longStory.boundingBox()).height===(await cards.first().boundingBox()).height,'long stories scroll vertically inside a card of the same height');
    await longStory.getByRole('button').click();await editor.getByRole('button',{name:'移除卡片',exact:true}).click();await editor.waitFor({state:'hidden'});
    await page.locator('.owner-toolbar button').first().click();await page.getByLabel('名字',{exact:true}).fill('林予 · 更新');
    const details=page.getByRole('dialog',{name:'让别人认识你',exact:true});
    check(await details.locator('.avatar-edit,input[type=file]').count()===0&&await details.getByRole('button',{name:'管理我的照片',exact:true}).count()===0,'personal details contain no photo editor or photo-management entry');
    await details.getByLabel('报价下限',{exact:true}).fill('500');await details.getByLabel('报价上限',{exact:true}).fill('200');
    check(await details.getByRole('button',{name:'保存资料',exact:true}).isDisabled(),'rate validation rejects an upper rate below the lower');
    await details.getByLabel('报价下限',{exact:true}).fill('0');await details.getByLabel('报价上限',{exact:true}).fill('1000000');
    await details.locator('.profile-rate-fields').scrollIntoViewIfNeeded();await page.screenshot({path:resolve(out,'details-rates.png'),animations:'disabled'});
    check(await details.getByRole('button',{name:'保存资料',exact:true}).isDisabled(),'entering rates requires explicitly choosing the currency and unit');
    await details.getByLabel('币种',{exact:true}).selectOption('CNY');await details.getByLabel('计价单位',{exact:true}).selectOption('day');
    await details.getByRole('button',{name:/^服务语言/}).click();const languages=page.getByRole('dialog',{name:'服务语言',exact:true});await languages.waitFor();
    while(await languages.locator('[role=checkbox][aria-checked=true]').count()<12)await languages.locator('[role=checkbox][aria-checked=false]:not([disabled])').first().click();
    check(await languages.locator('[role=checkbox][aria-checked=false]:not([disabled])').count()===0,'language options enforce the API limit of twelve selected languages');
    while(await languages.locator('[role=checkbox][aria-checked=true]').count())await languages.locator('[role=checkbox][aria-checked=true]').first().click();
    for(const name of ['中文（普通话）','英语','粤语','日语','地方话'])await languages.getByRole('checkbox',{name,exact:true}).click();
    await languages.getByRole('searchbox').fill('Cantonese');await page.screenshot({path:resolve(out,'details-languages.png'),animations:'disabled'});
    failLanguageOnce=true;await languages.getByRole('button',{name:'保存所选语言（5）',exact:true}).click();await languages.getByRole('alert').waitFor();
    check(await languages.getByRole('checkbox').getAttribute('aria-checked')==='true','language save failure retains selections and search');
    await languages.getByRole('button',{name:'保存所选语言（5）',exact:true}).click();await languages.waitFor({state:'hidden'});
    check(Object.keys(patches.at(-1)).join(',')==='languages','the language page saves only service languages');
    check(await details.getByLabel('名字',{exact:true}).inputValue()==='林予 · 更新'&&await details.getByLabel('报价下限',{exact:true}).inputValue()==='0','returning from language selection preserves other unsaved personal details');
    await page.getByRole('button',{name:'保存资料',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});
    await page.waitForFunction(()=>document.querySelector('.owner-name h1')?.textContent==='林予 · 更新');
    check(await page.locator('.owner-name h1').innerText()==='林予 · 更新','personal-details entry saves and refreshes the profile name');
    check(!Object.hasOwn(patches.at(-1),'avatar'),'saving personal details cannot overwrite the shared gallery photo');
    check(user.priceRange.min===0&&user.priceRange.max===1000000&&user.priceRange.currency==='CNY','zero rates and the explicitly chosen currency are saved accurately');
    check(await page.locator('.owner-completion').count()===0,'saving a valid price range clears the personal details reminder even with one photo');
    check(!Object.hasOwn(patches.at(-1),'languages'),'saving personal details cannot overwrite separately saved languages');
    check(JSON.stringify(user.languages.slice().sort())===JSON.stringify(['中文 Chinese','English','粤语 Cantonese','日本語','地方话'].sort()),'selected service languages persist without typed comma-separated text');
    await page.getByRole('button',{name:'编辑 语言',exact:true}).click();const savedLanguages=page.getByRole('dialog',{name:'服务语言',exact:true});
    check(await savedLanguages.locator('[role=checkbox][aria-checked=true]').count()===5,'saved language selections are restored through the direct profile language entry');await savedLanguages.getByRole('button',{name:'返回',exact:true}).click();
    await savedLanguages.waitFor({state:'hidden'});
   }
   await panel.evaluate(el=>el.scrollTop=0);
   const galleryPhotos=layout.blocks.filter(b=>b.type==='gallery'&&!isStory(b)).flatMap(b=>b.refs||[]);
   if(galleryPhotos.length){
    await page.locator('.owner-preview').click();const preview=page.locator('.profile-photo-viewer');await preview.waitFor();
    check(await page.locator('.public-profile-shell').count()===0,`${width}/${state}: Preview opens photos directly`);
    check(await preview.locator('.profile-photo-viewer-slide').count()===galleryPhotos.length&&await preview.locator('.profile-photo-viewer-slide img').first().getAttribute('src')===galleryPhotos[0],`${width}/${state}: Preview uses the same photo order and first image`);
    await page.keyboard.press('Escape');await preview.waitFor({state:'hidden'});
   }else check(await page.locator('.owner-preview').isDisabled(),`${width}: empty photo previews are disabled`);
   if(width===390&&state==='empty'){
    await page.getByRole('button',{name:'编辑卡片 1',exact:true}).click();await page.getByRole('button',{name:'移除卡片',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});
    await page.locator('.owner-about-story').getByText('第二段故事：山间的日落。',{exact:true}).waitFor();
    check(layout.blocks.filter(isStory).length===1&&layout.blocks.find(isStory).content==='第二段故事：山间的日落。','removing one story preserves the other story');
    await page.getByRole('button',{name:'编辑卡片 1',exact:true}).click();await page.getByRole('button',{name:'移除卡片',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});
    check(!layout.blocks.some(isStory)&&layout.blocks.some(b=>b.type==='gallery')&&await page.locator('.owner-about-add').count()===1,'removing the last story preserves the gallery and a new-story placeholder');
   }

   await context.close();
  }
 }
 check(errors.length===0,`no browser runtime errors: ${errors.join('; ')}`);
 await writeFile(resolve(out,'report.json'),JSON.stringify({passed:true,checks},null,2));
 console.log(`profile-owner: ${checks.length} checks passed; screenshots in ${out}`);
}finally{await browser.close();await server?.httpServer.close();}
