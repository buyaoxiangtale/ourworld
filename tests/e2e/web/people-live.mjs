import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
process.loadEnvFile(resolve(root,'.env'));
process.env.PLAYWRIGHT_BROWSERS_PATH=resolve(root,'.playwright-browsers');
const {chromium}=await import('playwright');
const base=process.env.OURWORLD_WEB_URL||'http://127.0.0.1:8188';
const out=resolve(root,'artifacts/photo-focus');await mkdir(out,{recursive:true});
const password=process.env.DEMO_PASSWORD||'Ourworld2026!';
const browser=await chromium.launch({headless:true,args:['--no-proxy-server','--disable-gpu']});
const context=await browser.newContext({viewport:{width:390,height:844},locale:'zh-CN'});
const page=await context.newPage();page.setDefaultTimeout(20000);const checks=[],errors=[];
page.on('pageerror',error=>errors.push(error.message));
try{
 await page.goto(base,{waitUntil:'domcontentloaded'});await page.locator('.home-search').waitFor();await page.evaluate(()=>document.fonts.ready);
 await page.locator('.home-search').click();await page.getByPlaceholder('搜索国家、城市、景点').fill('法国');await page.locator('.place-result').filter({hasText:'法国'}).first().click();
 const country=page.locator('.country-info-modal');await country.waitFor();await country.locator('.country-dialog-cover .cover').evaluate(img=>img.decode());assert((await country.locator('.country-dialog-cover .cover').getAttribute('src')).endsWith('.jpg'));await page.screenshot({path:resolve(out,'live-country.png'),animations:'disabled'});checks.push('live country photograph');
 await country.getByRole('button',{name:'浏览城市',exact:true}).click();await page.locator('.country-city-card.is-active').getByRole('button',{name:'查看城市',exact:true}).click();await page.getByRole('button',{name:'找当地人',exact:true}).click();await page.locator('.person-card.deck-front').waitFor();await page.locator('.person-photo>.cover').evaluate(img=>img.decode());assert((await page.locator('.person-photo>.cover').getAttribute('src')).endsWith('.jpg'));checks.push('live random feed returns photographic profiles');
 const first=await page.locator('.person-photo-name h2').innerText();const box=await page.locator('.person-card.deck-front').boundingBox();await page.mouse.move(box.x+box.width*.6,box.y+100);await page.mouse.down();await page.mouse.move(box.x+box.width*.2,box.y+100,{steps:10});await page.mouse.up();await page.waitForFunction(name=>document.querySelector('.person-photo-name h2')?.textContent!==name,first);checks.push('live left swipe advances');
 const rightCard=await page.locator('.person-card.deck-front').boundingBox();await page.mouse.move(rightCard.x+rightCard.width*.4,rightCard.y+100);await page.mouse.down();await page.mouse.move(rightCard.x+rightCard.width*.8,rightCard.y+100,{steps:12});await page.mouse.up();await page.getByLabel('邮箱',{exact:true}).fill('traveler@ourworld.test');await page.getByLabel('密码',{exact:true}).fill(password);await page.getByRole('button',{name:'进入我的世界',exact:true}).click();await page.getByRole('status').filter({hasText:'已加入对话'}).waitFor();checks.push('real sign-in restores pending connect');
 assert(await page.locator('.people-overlay').isVisible());await page.locator('.person-photo>.cover').evaluate(img=>img.decode());await page.locator('.toast').waitFor({state:'hidden'});await page.screenshot({path:resolve(out,'live-people.png'),animations:'disabled'});
 const current=await page.locator('.person-photo-name h2').innerText();await page.locator('.person-details').click();await page.getByRole('dialog').locator('.profile-portrait .cover').evaluate(img=>img.decode());await page.screenshot({path:resolve(out,'live-profile.png'),animations:'disabled'});await page.getByRole('dialog').getByRole('button',{name:'返回',exact:true}).click();assert.equal(await page.locator('.person-photo-name h2').innerText(),current);checks.push('live profile preserves the current feed card');
 await page.locator('.bottom-nav').getByRole('button',{name:'聊天',exact:true}).click();await page.locator('.conversation-row').first().waitFor();await page.locator('.conversation-row').first().click();await page.locator('.chat-thread').waitFor();await page.screenshot({path:resolve(out,'live-chat.png'),animations:'disabled'});checks.push('live conversation entry opens');
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.equal(errors.length,0);
 await page.goto(base+'/admin',{waitUntil:'domcontentloaded'});assert.equal(await page.locator('.app-shell').count(),0);checks.push('admin remains outside user visual scope');
 await writeFile(resolve(out,'live-report.json'),JSON.stringify({passed:true,base,checks,errors,method:'Real deployed Docker app and local demo account. Created one demo conversation; no messages sent.'},null,2));console.log(JSON.stringify({passed:true,checks,errors},null,2));
}catch(error){const safe=String(error).replaceAll(password,'[redacted]');await page.screenshot({path:resolve(out,'live-failure.png')}).catch(()=>{});await writeFile(resolve(out,'live-report.json'),JSON.stringify({passed:false,checks,errors,error:safe},null,2));console.error(safe);process.exitCode=1;}finally{await browser.close();}
