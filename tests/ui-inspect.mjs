import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
const browser=await chromium.launch({headless:true,args:['--no-proxy-server','--disable-gpu']});
const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true});
const errors=[];page.on('pageerror',error=>{errors.push(error.message);console.error('PAGE_ERROR '+error.message)});
await page.addInitScript(()=>{window.__ourworldRendererReady=false;window.addEventListener('message',event=>{if(event.data?.bridgeVersion===1&&event.data?.event==='rendererReady')window.__ourworldRendererReady=true;});});
await page.goto(process.env.UI_BASE_URL||'http://127.0.0.1:8188',{waitUntil:'domcontentloaded'});
console.log('Document loaded: '+await page.title());
try{await page.locator('iframe').first().waitFor({state:'visible',timeout:10000});await page.waitForFunction(()=>window.__ourworldRendererReady,{},{timeout:20000});}catch(e){errors.push(e.message)}
await page.screenshot({path:'artifacts/home-mobile.png',fullPage:true,timeout:15000});
const snapshot=await page.locator('body').innerText();
writeFileSync('artifacts/home-dom.txt',snapshot);
writeFileSync('artifacts/ui-inspect.json',JSON.stringify({errors,viewport:{width:390,height:844},horizontalOverflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)},null,2));
console.log(snapshot.slice(0,7000));console.log(JSON.stringify({errors}));await browser.close();
