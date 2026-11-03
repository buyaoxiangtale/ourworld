import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
process.env.PLAYWRIGHT_BROWSERS_PATH=resolve(root,'.playwright-browsers');
globalThis.localStorage={getItem:()=>null,setItem:()=>{}};
globalThis.sessionStorage={getItem:()=>null,setItem:()=>{}};
globalThis.location={pathname:'/',search:'',origin:'http://127.0.0.1'};
const server=await createServer({configFile:resolve(root,'apps/web/vite.config.ts'),root:resolve(root,'apps/web'),server:{middlewareMode:true,hmr:false},appType:'custom'});
const {chromium}=await import('playwright');
const browser=await chromium.launch({headless:true,args:['--no-proxy-server','--disable-gpu']});
const checks=[];
try{
 const {App}=await server.ssrLoadModule('/src/App.tsx');
 const html=renderToStaticMarkup(React.createElement(App));
 const css=(await Promise.all(['styles.css','visual-tokens.css','mature.css'].map(name=>readFile(resolve(root,'apps/web/src',name),'utf8')))).join('\n');
 for(const viewport of [{width:390,height:844},{width:360,height:640},{width:430,height:932}]){
  const page=await browser.newPage({viewport});
  await page.route('**/*',route=>route.abort());
  await page.setContent(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"/><style>${css}</style></head><body>${html}</body></html>`,{waitUntil:'domcontentloaded'});
  const nav=await page.locator('.bottom-nav').boundingBox();
  const innerHeight=await page.evaluate(()=>window.innerHeight);
  if(!nav||nav.y+nav.height>innerHeight)throw new Error(`Navigation clips at ${viewport.width}x${viewport.height}`);
  checks.push({viewport,nav,innerHeight,bottom:nav.y+nav.height,passed:true});
  await page.close();
 }
 await mkdir(resolve(root,'artifacts'),{recursive:true});
 await writeFile(resolve(root,'artifacts/ui-nav-layout-report.json'),JSON.stringify({passed:true,method:'SSR actual App + current styles; isolated browser; no backend or WebGL requests',checks},null,2));
 console.log(JSON.stringify({passed:true,checks},null,2));
}finally{await browser.close();await server.close();}
