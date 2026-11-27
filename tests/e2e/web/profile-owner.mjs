import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {preview} from 'vite';
import {chromium} from 'playwright';
import sharp from 'sharp';

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
   const user={id:'owner-fixture',name:en?'Alexandria · A very long traveller name':'林予',avatar:state==='empty'?'':'/api/v1/fixture/avatar.jpg',bio:state==='empty'?'':'用步行认识一座城市，喜欢街头摄影与安静的咖啡馆。',verified:true,providerStatus:'approved',accountType:'individual',role:'user',tags:state==='empty'?[]:['城市漫步','摄影','咖啡'],cityIds:['city-paris'],priceRange:state==='empty'?undefined:{min:80,max:120,currency:'USD',unit:'day'},experienceYears:3,languages:['中文','English','地方话']};
   if(en)user.bio=user.bio.repeat(12);
   let layout={schemaVersion:1,theme:'nocturne',accent:'#DBB473',blocks:state==='empty'?[]:[{id:'intro',type:'intro',span:2,size:'compact'},{id:'gallery',type:'gallery',span:2,size:'expanded',refs:Array.from({length:8},(_,i)=>`/api/v1/fixture/photo-${i}.jpg`)},{id:'photo-caption',type:'gallery',span:2,size:'expanded',title:'这张照片背后的故事',content:'旅途中，一次慢下来的清晨。',refs:['/api/v1/fixture/caption-only.jpg']},{id:'prompts',type:'prompts',span:2,size:'compact',prompts:[{question:'我最喜欢的城市角落',answer:'清晨的河边。'},{question:'一起去做什么',answer:'步行、拍照，喝一杯咖啡。'}]}]};
   let revision=1,published=0,uploads=0,avatarUploads=0,failPublishOnce=false,failBioOnce=false,failLanguageOnce=false;const patches=[];
   const context=await browser.newContext({viewport:{width,height:844},locale:'zh-CN',hasTouch:true});
   await context.routeWebSocket('**/api/v1/ws**',ws=>ws.close());
   await context.addInitScript(({user,en})=>{Object.defineProperty(crypto,'randomUUID',{value:undefined});sessionStorage.setItem('ourworld.session',JSON.stringify({user,accessToken:'fixture',refreshToken:'fixture'}));localStorage.setItem('ourworld.locale',en?'en':'zh');},{user,en});
   await context.route('**/globe/**',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html></html>'}));
   await context.route('**/api/v1/**',async route=>{
    const path=new URL(route.request().url()).pathname.replace('/api/v1','');const method=route.request().method();
    if(path.startsWith('/fixture/'))return route.fulfill({contentType:'image/jpeg',body:path.includes('avatar')?portrait:photo});
    let json={};
    if(path.startsWith('/users/'))json={user,layout,posts:[{id:'story-fixture',images:['/api/v1/fixture/post-photo.jpg']}],packages:[],reviews:[],places:[{id:'city-paris',kind:'city',name:{zh:'巴黎',en:'Paris'},country:'France',lat:48.86,lng:2.35,description:{zh:'',en:''},image:''}]};
    else if(path==='/me'){if(method==='PATCH'){if(failBioOnce){failBioOnce=false;return route.fulfill({status:503,json:{message:'暂时无法保存简介，请重试'}});}const patch=route.request().postDataJSON();if(failLanguageOnce&&Object.hasOwn(patch,'languages')){failLanguageOnce=false;return route.fulfill({status:503,json:{message:'暂时无法保存语言，请重试'}});}patches.push(patch);Object.assign(user,patch);if(patch.bioBackground)user.bioBackground={...patch.bioBackground,image:'/api/v1/fixture/'+patch.bioBackground.fileId+'.jpg'};}json=user;}
    else if(path==='/profile/draft'){if(method==='PUT'){assert.equal(route.request().postDataJSON().revision,revision,'saved draft uses the latest revision');layout=route.request().postDataJSON().layout;revision++;}json={revision,layout,publishedRevision:1};}
    else if(path==='/profile/publish'){if(failPublishOnce){failPublishOnce=false;return route.fulfill({status:503,json:{message:'暂时无法更新，请重试'}});}published++;json={};}
    else if(path==='/uploads'){
     const form=await new Response(route.request().postDataBuffer(),{headers:{'content-type':route.request().headers()['content-type']}}).formData();
     const file=form.get('file');
     if(file.name==='avatar.jpg'){
      const image=await sharp(Buffer.from(await file.arrayBuffer())).metadata();
      assert.equal(image.width,512);assert.equal(image.height,512);assert.equal(image.format,'jpeg');
      avatarUploads++;json={id:'avatar-'+avatarUploads,url:'/api/v1/fixture/avatar-'+avatarUploads+'.jpg'};
     }else{uploads++;json={id:'upload-'+uploads,url:'/api/v1/fixture/upload-'+uploads+'.jpg'};}
    }
    else if(path==='/places')json={items:[]};
    else if(path==='/conversations')json={items:[]};
    else if(path==='/favorites')json={items:[]};
    return route.fulfill({json});
   });
   const page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
   await page.goto(base,{waitUntil:'domcontentloaded'});await page.locator('.bottom-nav button[data-tab="profile"]').click();
   await page.locator('.owner-identity h1').waitFor();
   check(await page.getByRole('button',{name:'搭建主页',exact:true}).count()===0,'legacy profile builder entry is removed');await page.evaluate(()=>document.fonts.ready);
   const about=page.locator('.owner-about');
   const board=about.locator('.life-puzzle-viewport');
   const bioPanel=about.locator('.life-puzzle-bio');
   const galleryPanel=about.locator('.life-puzzle-gallery');
   const [bioBox,galleryBox]=await Promise.all([bioPanel.boundingBox(),galleryPanel.boundingBox()]);
   check(bioBox.x<galleryBox.x&&Math.abs(bioBox.y-galleryBox.y)<1,'the bio and life puzzle sit side by side');
   check(await about.locator('.owner-section-heading button').count()===0,
    'puzzle tiles are the editing entry point without a header button');
   check(await bioPanel.getByRole('heading',{name:en?'Bio':'简介',exact:true}).count()===1&&await galleryPanel.locator(':scope > p').count()===0,
    'the compact panels use the short bio heading and omit the puzzle hint');
   check(await galleryPanel.locator('h3,.life-puzzle-navigation').count()===0&&await board.evaluate(el=>{
    const gallery=el.closest('.life-puzzle-gallery');
    return el.offsetWidth===gallery.clientWidth&&el.offsetHeight===gallery.clientHeight;
   }),'the puzzle fills the gallery edge to edge without a title or arrow buttons');
   check(await board.evaluate(el=>Math.abs(el.querySelector('svg').getBoundingClientRect().height-2*el.getBoundingClientRect().width)<1),
    'the panel fits two square puzzle pieces vertically');
   check(Math.abs(galleryBox.width/(bioBox.width+galleryBox.width)-(width<=360?.38:.39))<.01,
    'the puzzle column is two thirds of its previous width');
   if(en)check(await bioPanel.locator('p').evaluate(el=>el.scrollHeight>el.clientHeight),
    'a long bio scrolls inside the height set by the puzzle');
   check(await board.getByRole('button',{name:en?'Add a puzzle photo':'添加拼图照片',exact:true}).count()===1,'the puzzle shows exactly one empty piece');
   check(await page.getByText('再添加 2 条旅行问答',{exact:true}).count()===0,`${width}/${state}: old prompt reminder is removed`);
   check(await page.locator('.photo-wall-image').count()===(state==='empty'?0:8),`${width}/${state}: photo wall shows all uploaded photos`);
   check(await page.locator('.owner-about').evaluate(element=>element.nextElementSibling?.classList.contains('photo-wall')),
    `${width}/${state}: About me appears before My footprints`);
   check(await page.locator('.owner-name svg').count()===0,`${width}/${state}: no checkmark beside the name`);
   check(await page.locator('.owner-profile-page .profile-portrait,.owner-profile-page .profile-banner-donut').count()===0,`${width}/${state}: compact header without progress indicator`);
   check(await page.locator('.tab-panel:has(.owner-profile-page)').evaluate(el=>getComputedStyle(el).scrollbarWidth)==='none',`${width}/${state}: sidebar scrollbar hidden`);
   if(state==='empty'){
    check(await board.locator('image').count()===0&&await bioPanel.isVisible(),'an empty profile has an empty puzzle and a bio editor');
   }else{
    check(await board.locator('image').first().getAttribute('href')===layout.blocks.find(isStory).refs[0]&&
     await board.locator('image').last().getAttribute('href')===layout.blocks.find(block=>block.id==='gallery').refs[0]&&
     await bioPanel.getByText(user.bio,{exact:true}).count()===1,'legacy photos and the bio appear in the new layout');
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
    const gallery=layout.blocks.find(block=>block.id==='gallery');
    const savedRefs=gallery.refs;
    const main=wall.getByRole('region',{name:'主照片',exact:true});
    const others=wall.getByRole('region',{name:'普通照片',exact:true});
    const loadWall=async()=>{
     await page.reload();await page.locator('.bottom-nav button[data-tab="profile"]').click();await wall.waitFor();
    };
    for(const count of [1,2,3,4,5,6,7,8]){
     gallery.refs=savedRefs.slice(0,count);
     await loadWall();
     check(await main.locator('img').getAttribute('src')===savedRefs[0]&&await others.locator('.photo-wall-card').count()===count-1,
      `${width}: an unmarked album of ${count} photos defaults to its first photo`);
    }
    gallery.content='ourworld:photo-wall:1:'+JSON.stringify({featuredPhoto:savedRefs[2],captions:[[savedRefs[2],'山间的午后，微风吹过树梢。']]});
    await loadWall();
    check(await main.locator('img').getAttribute('src')===savedRefs[2]&&await others.locator('.photo-wall-card').count()===7,`${width}: a stored single main photo stays exclusively on the left`);
    const left=await main.boundingBox(),right=await others.boundingBox();
    check(left.x<right.x&&Math.abs(left.width-2*right.width)<2,`${width}: main and other photos use a 2:1 split`);
    const image=await main.locator('.photo-wall-image').boundingBox();
    const caption=await main.locator('.photo-wall-caption').boundingBox();
    check(image.height>=image.width*.7&&caption.y>image.y&&caption.y+caption.height<=image.y+image.height+1,
     `${width}: the caption fits inside the main photo at the bottom`);
    const secondImage=await others.locator('.photo-wall-image').nth(1).boundingBox();
    check(Math.abs(image.y+image.height-secondImage.y-secondImage.height)<1,
     `${width}: the bottom photo in each column still aligns with no external caption row`);
    check(await others.locator('.photo-wall-caption, figcaption').count()===0,
     `${width}: photos with no introduction have no visible placeholder or reserved row`);
    check(await others.evaluate(el=>el.scrollHeight>el.clientHeight),`${width}: additional photos are still reachable by scrolling the right column`);
    gallery.refs=[savedRefs[0],savedRefs[2]];
    await loadWall();
    const soleMain=await main.locator('.photo-wall-image').boundingBox(),soleOther=await others.locator('.photo-wall-image').boundingBox();
    check(Math.abs(soleMain.height-soleOther.height)<1,`${width}: one photo per column aligns at the same height`);
    delete gallery.content;
    gallery.refs=savedRefs;
    await page.reload();await page.locator('.bottom-nav button[data-tab="profile"]').click();await wall.waitFor();
   }
   if(width===390)await page.screenshot({path:resolve(out,`${state}-top.png`),animations:'disabled'});
   if(state!=='empty'){
    const expected=layout.blocks.find(b=>b.id==='gallery').refs[0];
    check(await page.locator('.owner-avatar img').getAttribute('src')===user.avatar&&await page.locator('.photo-wall-image img').first().getAttribute('src')===expected,`${width}/${state}: the independent avatar displays and the photo wall retains the first image`);
    await page.locator('.owner-preview').click();const viewer=page.locator('.profile-photo-viewer');await viewer.waitFor();
    await viewer.locator('.profile-photo-position').getByText('1 / 8',{exact:true}).waitFor();
    check(await viewer.locator('.profile-photo-viewer-slide').count()===8,`${width}/${state}: viewer contains every gallery photo without story or caption photos`);
    check(await viewer.locator('.profile-photo-viewer-slide').first().evaluate(element=>{const card=element.getBoundingClientRect(),track=element.parentElement.getBoundingClientRect();return card.width<track.width*.9&&parseFloat(getComputedStyle(element).borderRadius)>20;}),`${width}/${state}: photo preview uses rounded cards narrower than the viewport`);

    await page.keyboard.press('ArrowRight');await viewer.locator('.profile-photo-position').getByText('2 / 8',{exact:true}).waitFor();
    await viewer.locator('.profile-photo-next').click();await viewer.locator('.profile-photo-position').getByText('3 / 8',{exact:true}).waitFor();
    await viewer.locator('.profile-photo-previous').click();await viewer.locator('.profile-photo-position').getByText('2 / 8',{exact:true}).waitFor();
    await page.keyboard.press('Escape');await viewer.waitFor({state:'hidden'});
    check(await page.locator('.owner-preview').evaluate(el=>el===document.activeElement),`${width}/${state}: closing the viewer restores focus to the photo`);
    await page.getByRole('button',{name:en?'View photo 6':'查看第 6 张照片',exact:true}).click();await viewer.locator('.profile-photo-position').getByText('6 / 8',{exact:true}).waitFor();
    await viewer.locator('.profile-photo-next').click();await viewer.locator('.profile-photo-position').getByText('7 / 8',{exact:true}).waitFor();
    await viewer.locator('.profile-photo-next').click();await viewer.locator('.profile-photo-position').getByText('8 / 8',{exact:true}).waitFor();
    check(await viewer.locator('.profile-photo-next').isDisabled(),`${width}/${state}: final photo has no next action`);
    await page.waitForFunction(()=>{const track=document.querySelector('.profile-photo-viewer-track'),card=track.lastElementChild.getBoundingClientRect(),box=track.getBoundingClientRect();return Math.abs(card.left+card.width/2-box.left-box.width/2)<2;});
    check(true,`${width}/${state}: the last card can be centered`);await page.keyboard.press('Escape');
    await page.locator('.owner-preview').click();await viewer.locator('.profile-photo-position').getByText('1 / 8',{exact:true}).waitFor();
    check(true,`${width}/${state}: reopening the header always starts with the first photo`);
    if(width===390&&state==='filled'){
     const track=viewer.locator('.profile-photo-viewer-track');await viewer.evaluate(element=>Promise.all(element.getAnimations().map(animation=>animation.finished.catch(()=>{}))));const box=await track.boundingBox();const cdp=await context.newCDPSession(page);const y=box.y+box.height*.4;
     await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+box.width*.85,y}]});
     for(let step=1;step<=8;step++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:box.x+box.width*(.85-.7*step/8),y}]});
     await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
     await viewer.locator('.profile-photo-position').getByText('2 / 8',{exact:true}).waitFor();check(true,'touch swipe moves to the next photo');
     await page.keyboard.press('Escape');await page.locator('.owner-preview').click();await viewer.locator('.profile-photo-position').getByText('1 / 8',{exact:true}).waitFor();await viewer.locator('.profile-photo-next').click();await page.waitForFunction(()=>{const el=document.querySelector('.profile-photo-viewer-track');const card=el.children[1].getBoundingClientRect(),track=el.getBoundingClientRect();return Math.abs(card.left+card.width/2-track.left-track.width/2)<2;});
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
     await page.locator('.photo-wall-manage').click();
     const caption=manager.getByRole('textbox',{name:'照片 2 的介绍',exact:true});
     await caption.waitFor();
     check(await caption.getAttribute('placeholder')==='照片 2 的介绍','the caption prompt is available in the photo editor');
     await caption.fill('下过雨的街角。');
     await manager.locator('article').nth(1).getByRole('button',{name:'前移照片',exact:true}).click();
     await manager.getByRole('button',{name:'保存并更新主页',exact:true}).click();await manager.waitFor({state:'hidden'});
     await page.waitForFunction(()=>document.querySelector('.photo-wall-secondary img')?.getAttribute('src')==='/api/v1/fixture/photo-1.jpg');
     check(await page.locator('.photo-wall-primary img').getAttribute('src')==='/api/v1/fixture/photo-0.jpg','reordering changes the header image and preserves the main photo');
     await page.reload();await page.locator('.bottom-nav button[data-tab="profile"]').click();
     await page.locator('.photo-wall-slogan').getByText('用脚步收集光和风。',{exact:true}).waitFor();
     await page.locator('.photo-wall-secondary .photo-wall-caption').getByText('下过雨的街角。',{exact:true}).waitFor();
     check(true,'slogan survives reload and a caption follows its photo after reordering');
     await page.getByRole('button',{name:'查看第 1 张照片',exact:true}).click();
     await viewer.locator('.profile-photo-viewer-caption').getByText('下过雨的街角。',{exact:true}).waitFor();
     await page.keyboard.press('Escape');await viewer.waitFor({state:'hidden'});
     check(true,'the enlarged photo shows its complete caption');
     await page.locator('.photo-wall').scrollIntoViewIfNeeded();
     await page.screenshot({path:resolve(out,'photo-wall.png'),animations:'disabled'});

     await page.locator('.photo-wall-manage').click();
     const mainPhotoCard=manager.locator('article').nth(2);
     check(await manager.locator('article').nth(1).getByRole('button',{name:'主照片',pressed:true,exact:true}).isDisabled(),'the only main photo cannot be unmarked');
     await mainPhotoCard.getByRole('button',{name:'设为主照片',exact:true}).click();
     check(await manager.getByRole('button',{name:'主照片',pressed:true,exact:true}).count()===2,'multiple photos can be selected as main photos');
     check(await mainPhotoCard.getByRole('button',{name:'主照片',pressed:true,exact:true}).count()===1,'the selected card shows the main-photo state');
     await manager.getByRole('button',{name:'保存并更新主页',exact:true}).click();await manager.waitFor({state:'hidden'});
     await page.reload();await page.locator('.bottom-nav button[data-tab="profile"]').click();
     const featured=page.locator('.photo-wall-primary');
     const ordinary=page.locator('.photo-wall-secondary');
     check(await featured.locator('img').evaluateAll(images=>images.map(img=>img.getAttribute('src')).join())===
      '/api/v1/fixture/photo-0.jpg,/api/v1/fixture/photo-2.jpg','both chosen main photos stay on the left after reload');
     const ordinaryImages=await ordinary.locator('img').evaluateAll(images=>images.map(img=>img.getAttribute('src')));
     check(ordinaryImages.length===6&&!ordinaryImages.includes('/api/v1/fixture/photo-0.jpg')&&!ordinaryImages.includes('/api/v1/fixture/photo-2.jpg'),'right column only contains unmarked photos');
     check(await featured.evaluate(el=>el.scrollHeight>el.clientHeight),'multiple main photos form a scrollable column');
     check(await board.locator('image').last().getAttribute('href')==='/api/v1/fixture/photo-0.jpg','the original About photo still follows the chosen main photo before puzzle editing');
     await board.getByRole('button',{name:'编辑第 1 块拼图',exact:true}).click();
     await about.getByText('照片说明（选填）',{exact:true}).click();
     check(await about.getByRole('textbox',{name:'照片配文'}).inputValue()===layout.blocks.find(isStory).content,'the legacy story caption is still editable in its puzzle piece');
     await about.getByRole('button',{name:'完成编辑',exact:true}).click();
     await about.locator('.life-puzzle-editor').waitFor({state:'hidden'});
     check(await page.locator('.owner-avatar img').getAttribute('src')===user.avatar,'choosing the main photo preserves the profile avatar');
     await featured.getByRole('button',{name:'查看第 3 张照片',exact:true}).click();
     await viewer.locator('.profile-photo-position').getByText('3 / 8',{exact:true}).waitFor();
     await page.keyboard.press('Escape');await viewer.waitFor({state:'hidden'});
     check(true,'opening a main photo uses its album position');
     await page.locator('.photo-wall-manage').click();
     await manager.locator('article').nth(1).getByRole('button',{name:'主照片',pressed:true,exact:true}).click();
     await manager.getByRole('button',{name:'删除照片 3',exact:true}).click();
     await manager.getByRole('button',{name:'保存并更新主页',exact:true}).click();await manager.waitFor({state:'hidden'});
     await page.reload();await page.locator('.bottom-nav button[data-tab="profile"]').click();
     await ordinary.getByRole('button',{name:'查看第 2 张照片',exact:true}).waitFor();
     check(await featured.locator('img').getAttribute('src')==='/api/v1/fixture/photo-1.jpg'&&await ordinary.locator('.photo-wall-card').count()===6,
      'deleting the sole main photo promotes the first remaining photo');

    }
   }else check(await page.locator('.owner-avatar img').count()===0,`${width}: an owner without an avatar sees a placeholder`);

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
    const avatarButton=page.locator('.owner-avatar');
    check(await avatarButton.evaluate(el=>el.offsetWidth===el.offsetHeight&&parseFloat(getComputedStyle(el).borderRadius)>0),'avatar button is a rounded square');
    for(const uploadNumber of [1,2]){
     await avatarButton.click();
     const avatarEditor=page.getByRole('dialog',{name:'编辑头像',exact:true});
     await avatarEditor.getByLabel('选择头像图片').setInputFiles({name:'travel.jpg',mimeType:'image/jpeg',buffer:photo});
     const preview=avatarEditor.getByRole('group',{name:'头像裁剪预览'});
     const zoom=avatarEditor.getByRole('slider',{name:'缩放'});
     await zoom.fill('2');
     const before=await preview.locator('img').evaluate(img=>img.style.left);
     const box=await preview.boundingBox();
     await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
     await page.mouse.down();await page.mouse.move(box.x+box.width/2+24,box.y+box.height/2,{steps:3});await page.mouse.up();
     check(await preview.locator('img').evaluate(img=>img.style.left)!==before,'dragging offsets the zoomed crop');
     const afterDrag=await preview.locator('img').evaluate(img=>img.style.left);
     await preview.press('ArrowRight');
     check(await preview.locator('img').evaluate(img=>img.style.left)!==afterDrag,'the crop also supports keyboard adjustment');
     await avatarEditor.getByRole('button',{name:'保存头像',exact:true}).click();
     await avatarEditor.waitFor({state:'hidden'});
     const target='/api/v1/fixture/avatar-'+uploadNumber+'.jpg';
     await avatarButton.locator('img[src="'+target+'"]').waitFor();
     check(user.avatar===target&&await page.locator('.photo-wall-image').count()===0,'saving an avatar updates the profile without adding a gallery photo');
    }
    await page.reload();await page.locator('.bottom-nav button[data-tab="profile"]').click();
    await avatarButton.locator('img[src="/api/v1/fixture/avatar-2.jpg"]').waitFor();
    await page.locator('.photo-wall-manage').click();await page.getByRole('dialog').waitFor();
    check(await page.locator('.editor-overlay,.agent-panel,.layout-editor-block').count()===0,'photo editing has no legacy studio or AI tools');
    await page.getByRole('dialog',{name:'我的照片',exact:true}).getByText('添加照片',{exact:true}).waitFor();
    check(true,'photo card opens its independent upload control');
    await page.locator('.profile-gallery-editor input[type=file]').setInputFiles({name:'travel.jpg',mimeType:'image/jpeg',buffer:photo});
    await page.locator('.card-photo-editor-grid article').waitFor();
    check(await page.getByRole('button',{name:'主照片',pressed:true,exact:true}).isDisabled(),'the first uploaded photo is immediately marked as main');
    await page.getByRole('button',{name:'保存并更新主页',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});
    check(layout.blocks.some(b=>b.type==='gallery'&&b.refs.includes('/api/v1/fixture/upload-1.jpg')),'photo card uploads and publishes a real selected file');
    await page.waitForFunction(()=>document.querySelector('.photo-wall-primary img')?.getAttribute('src')==='/api/v1/fixture/upload-1.jpg');
    check(await page.locator('.photo-wall-caption').count()===0,'uploads can be published without an introduction');

    await page.locator('.owner-preview').click();let photosDialog=page.locator('.profile-photo-viewer');await photosDialog.locator('.profile-photo-position').getByText('1 / 1',{exact:true}).waitFor();
    check(await photosDialog.locator('.profile-photo-next,.profile-photo-previous').count()===0,'a single photo has no redundant navigation controls');await page.keyboard.press('Escape');
    await photosDialog.waitFor({state:'hidden'});

    await page.locator('.photo-wall-manage').click();await page.getByRole('button',{name:'删除照片 1',exact:true}).click();
    await page.getByRole('button',{name:'保存并更新主页',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});
    check(layout.blocks.length>0&&!layout.blocks.some(b=>b.type==='gallery'),'removing the last photo preserves a valid non-empty layout');
    check(await page.locator('.owner-avatar img').getAttribute('src')===user.avatar,'removing the last gallery photo preserves the avatar');
    await page.locator('.photo-wall-upload').click();await page.getByRole('dialog',{name:'我的照片',exact:true}).waitFor();await page.getByRole('button',{name:'Close',exact:true}).click();
    check(true,'the empty photo wall opens its management dialog');

    const beforeBio=patches.length;
    await page.getByRole('button',{name:'编辑个人简介',exact:true}).click();
    let editor=page.getByRole('dialog',{name:'添加个人简介',exact:true});
    check(await editor.getByRole('button',{name:'保存',exact:true}).isDisabled(),'empty bio starts with save disabled');
    await editor.getByRole('textbox',{name:'个人简介',exact:true}).fill('这段简介取消保存');
    await editor.getByRole('button',{name:'取消',exact:true}).click();
    check(user.bio===''&&patches.length===beforeBio,'cancelling the bio editor leaves the profile unchanged');
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
    await bioPanel.getByText(user.bio,{exact:true}).waitFor();
    await page.getByRole('button',{name:'编辑个人简介',exact:true}).click();
    editor=page.getByRole('dialog',{name:'编辑个人简介',exact:true});
    const backgroundFile=page.waitForEvent('filechooser');
    await editor.getByRole('button',{name:'上传背景图',exact:true}).click();
    await (await backgroundFile).setFiles({name:'background.jpg',mimeType:'image/jpeg',buffer:photo});
    const opacity=editor.getByRole('slider',{name:/背景透明度/});
    check(await opacity.inputValue()==='40','a new bio background defaults to 40% opacity');
    await opacity.fill('65');
    await editor.getByRole('button',{name:'保存',exact:true}).click();await editor.waitFor({state:'hidden'});
    await page.reload();await page.locator('.bottom-nav button[data-tab="profile"]').click();
    const background=bioPanel.locator('.profile-bio-background');
    check(await background.evaluate(el=>getComputedStyle(el).objectFit==='cover'&&getComputedStyle(el).opacity==='0.65'),
     'bio background persists after reload and covers the panel at the saved opacity');
    await page.getByRole('button',{name:'编辑个人简介',exact:true}).click();
    await editor.getByRole('button',{name:'移除背景图',exact:true}).click();
    await editor.getByRole('button',{name:'保存',exact:true}).click();await editor.waitFor({state:'hidden'});
    await background.waitFor({state:'detached'});
    check(patches.at(-1).bioBackground===null&&await bioPanel.evaluate(el=>getComputedStyle(el).backgroundImage.startsWith('radial-gradient')),
     'removing the saved image restores the dotted background');
    const blank=board.getByRole('button',{name:'添加拼图照片',exact:true});
    const file={name:'puzzle.jpg',mimeType:'image/jpeg',buffer:photo};
    const puzzleEditor=about.locator('.life-puzzle-editor');
    const done=about.getByRole('button',{name:'完成编辑',exact:true});
    const storedPuzzle=()=>layout.blocks.find(block=>block.id==='life-puzzle');
    const firstPick=page.waitForEvent('filechooser');
    await blank.click();
    await (await firstPick).setFiles(file);
    await puzzleEditor.getByRole('status').getByText('拼图已保存',{exact:true}).waitFor();
    check(storedPuzzle().refs.length===1&&await blank.count()===1&&await board.locator('image').count()===1,
     'uploading the first photo saves it and appends one empty interlocking piece');
    check(await board.evaluate(el=>el.scrollWidth===el.clientWidth),'two pieces fit without horizontal scrolling');
    await puzzleEditor.getByText('照片说明（选填）',{exact:true}).click();
    const notes=puzzleEditor.getByRole('textbox',{name:'照片配文',exact:true});
    await notes.fill('清晨安静的河岸。');
    failPublishOnce=true;await done.click();
    await puzzleEditor.getByRole('alert').filter({hasText:'暂时无法更新'}).waitFor();
    check(await notes.inputValue()==='清晨安静的河岸。','a failed publish keeps the piece and its notes');
    await done.click();await puzzleEditor.waitFor({state:'hidden'});
    check(JSON.parse(storedPuzzle().content)[0].caption==='清晨安静的河岸。','retry publishes the latest revision');
    for(let count=2;count<=7;count++){
     const nextPick=page.waitForEvent('filechooser');
     await blank.click();
     await (await nextPick).setFiles(file);
     await puzzleEditor.getByRole('status').getByText('拼图已保存',{exact:true}).waitFor();
     check(storedPuzzle().refs.length===count&&await blank.count()===1,'adding a photo appends it and leaves a single empty tile');
     if(count===2) check(await board.evaluate(el=>el.scrollWidth>el.clientWidth),'the third piece enables horizontal scrolling');
    }
    await done.click();await puzzleEditor.waitFor({state:'hidden'});
    await page.reload();await page.locator('.bottom-nav button[data-tab="profile"]').click();
    await board.locator('image').last().waitFor({state:'attached'});
    check(await board.locator('image').count()===7,'all puzzle photos survive reload');
    const dimensions=await board.evaluate(el=>({screen:el.clientWidth,content:el.scrollWidth}));
    check(Math.abs(dimensions.content/dimensions.screen-4)<.08,'the puzzle shows one column and scrolls to the other three');
    check(await galleryPanel.locator('.life-puzzle-navigation').count()===0,'the scrollable puzzle uses the native bar without arrow buttons');
    check(await board.evaluate(el=>{
     const viewport=el.getBoundingClientRect();
     const track=el.querySelector('svg').getBoundingClientRect();
     return Math.abs(viewport.height-track.height-(el.offsetHeight-el.clientHeight))<1&&Math.abs(track.height-2*viewport.width)<1;
    }),'the native scrollbar leaves room for both square puzzle pieces');
    const repeated=await board.locator('.life-puzzle-hit').evaluateAll(paths=>[paths[1],paths[7]].map((path,col)=>{
     const top=path.getAttribute('d').split(' L '+(col?1200:300)+' 300')[0];
     return top.replace(/(-?\d+) (-?\d+)/g,(_,x,y)=>[Number(x)-(col?900:0),y].join(' '));
    }));
    check(repeated[0]===repeated[1],'the interlocking seam pattern repeats every three columns');
    await board.focus();await page.keyboard.press('ArrowRight');
    await page.waitForFunction(()=>document.querySelector('.life-puzzle-viewport').scrollLeft>20);
    await board.scrollIntoViewIfNeeded();
    await page.screenshot({path:resolve(out,'life-puzzle.png'),animations:'disabled'});

    await board.getByRole('button',{name:'编辑第 2 块拼图',exact:true}).click();
    const zoom=puzzleEditor.getByRole('slider',{name:'缩放'});
    await zoom.fill('165');
    await puzzleEditor.getByRole('slider',{name:'水平位置'}).fill('55');
    await done.click();await puzzleEditor.waitFor({state:'hidden'});
    const framed=JSON.parse(storedPuzzle().content)[1];
    check(framed.zoom===1.65&&framed.panX===55,'the selected piece stores its zoom and position');
    await board.getByRole('button',{name:'编辑第 2 块拼图',exact:true}).click();
    const replacePick=page.waitForEvent('filechooser');
    await puzzleEditor.getByRole('button',{name:'替换照片',exact:true}).click();
    await (await replacePick).setFiles(file);
    await puzzleEditor.getByRole('status').getByText('拼图已保存',{exact:true}).waitFor();
    const replaced=storedPuzzle().refs.slice();
    check(replaced.length===7&&JSON.parse(storedPuzzle().content)[1].zoom===1,'replacement retains the slot and resets framing');
    await puzzleEditor.getByRole('button',{name:'删除这张照片',exact:true}).click();
    await puzzleEditor.getByRole('status').getByText('拼图已保存',{exact:true}).waitFor();
    check(storedPuzzle().refs.join()===replaced.filter((_,index)=>index!==1).join(),'deleting a piece packs later photos forward in order');
    await done.click();await puzzleEditor.waitFor({state:'hidden'});

    await page.locator('.photo-wall-manage').click();await page.getByRole('dialog').waitFor();
    await page.locator('.profile-gallery-editor input[type=file]').setInputFiles({name:'gallery.jpg',mimeType:'image/jpeg',buffer:photo});await page.locator('.card-photo-editor-grid article').waitFor();
    await page.getByRole('button',{name:'保存并更新主页',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});
    check(storedPuzzle().refs.length===6&&JSON.parse(storedPuzzle().content)[0].caption==='清晨安静的河岸。','editing My footprints preserves the puzzle and its notes');
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
    check(!Object.hasOwn(patches.at(-1),'avatar'),'saving personal details cannot overwrite the profile avatar');
    check(user.priceRange.min===0&&user.priceRange.max===1000000&&user.priceRange.currency==='CNY','zero rates and the explicitly chosen currency are saved accurately');
    check(await page.locator('.owner-completion').count()===0,'saving a valid price range clears the personal details reminder even with one photo');
    check(!Object.hasOwn(patches.at(-1),'languages'),'saving personal details cannot overwrite separately saved languages');
    check(JSON.stringify(user.languages.slice().sort())===JSON.stringify(['中文 Chinese','English','粤语 Cantonese','日本語','地方话'].sort()),'selected service languages persist without typed comma-separated text');
    await page.getByRole('button',{name:'编辑 语言',exact:true}).click();const savedLanguages=page.getByRole('dialog',{name:'服务语言',exact:true});
    check(await savedLanguages.locator('[role=checkbox][aria-checked=true]').count()===5,'saved language selections are restored through the direct profile language entry');await savedLanguages.getByRole('button',{name:'返回',exact:true}).click();
    await savedLanguages.waitFor({state:'hidden'});
   }
   await panel.evaluate(el=>el.scrollTop=0);
   const galleryPhotos=layout.blocks.filter(b=>b.type==='gallery'&&!isStory(b)&&!b.id.startsWith('life-puzzle')).flatMap(b=>b.refs||[]);
   if(galleryPhotos.length){
    await page.locator('.owner-preview').click();const preview=page.locator('.profile-photo-viewer');await preview.waitFor();
    check(await page.locator('.public-profile-shell').count()===0,`${width}/${state}: Preview opens photos directly`);
    check(await preview.locator('.profile-photo-viewer-slide').count()===galleryPhotos.length&&await preview.locator('.profile-photo-viewer-slide img').first().getAttribute('src')===galleryPhotos[0],`${width}/${state}: Preview uses the same photo order and first image`);
    await page.keyboard.press('Escape');await preview.waitFor({state:'hidden'});
   }else check(await page.locator('.owner-preview').isDisabled(),`${width}: empty photo previews are disabled`);
   if(width===390&&state==='empty'){
    const editButton=()=>board.getByRole('button',{name:'编辑第 1 块拼图',exact:true});
    await editButton().click();
    const puzzleEditor=about.locator('.life-puzzle-editor');
    for(let remaining=5;remaining>=0;remaining--){
     if(remaining<5)await editButton().click();
     await puzzleEditor.getByRole('button',{name:'删除这张照片',exact:true}).click();
     await puzzleEditor.getByRole('status').getByText('拼图已保存',{exact:true}).waitFor();
    }
    await about.getByRole('button',{name:'完成编辑',exact:true}).click();
    await page.reload();await page.locator('.bottom-nav button[data-tab="profile"]').click();await board.waitFor();
    check(await board.locator('image').count()===0&&await board.getByRole('button',{name:'添加拼图照片',exact:true}).count()===1&&await page.locator('.photo-wall-image').count()===1,'the cleared puzzle stays empty after reload and retains the independent photo wall');
   }

   await context.close();
  }
 }
 check(errors.length===0,`no browser runtime errors: ${errors.join('; ')}`);
 await writeFile(resolve(out,'report.json'),JSON.stringify({passed:true,checks},null,2));
 console.log(`profile-owner: ${checks.length} checks passed; screenshots in ${out}`);
}finally{await browser.close();await server?.httpServer.close();}
