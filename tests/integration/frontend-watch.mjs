// Opt-in end-to-end check on the deployment host; probe files are removed in finally.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir,rm,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from 'playwright';
const root=resolve(import.meta.dirname,'../..');const base=process.env.OURWORLD_WEB_URL||'http://127.0.0.1:8188';
const id=randomUUID();const probe=`__frontend_watch_${id}.txt`;const file=resolve(root,'apps/web/public',probe),invalid=resolve(root,'apps/web/src',`__frontend_watch_${id}.ts`);
const execute=promisify(execFile);const checks=[];const versions=[];
const check=(value,label)=>{assert(value,label);checks.push(label);console.log(`ok: ${label}`);};
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function waitFor(label,test){const end=Date.now()+150000;while(Date.now()<end){try{const value=await test();if(value)return value;}catch{}await delay(750);}throw new Error(`Timed out: ${label}`);}
async function version(){const response=await fetch(base+'/frontend-version.json',{cache:'no-store',signal:AbortSignal.timeout(5000)});assert.equal(response.status,200);return response.json();}
async function state(){const args=['compose','exec','-T','frontend-watch','cat','/srv/frontend/watch-status.json'];const result=process.env.OURWORLD_DOCKER_SUDO==='1'?await execute('sudo',['-n','docker',...args],{cwd:root}):await execute('docker',args,{cwd:root});return JSON.parse(result.stdout);}
const browser=await chromium.launch({headless:true,args:['--no-proxy-server','--disable-gpu']});
let baseline;
try{
 baseline=await version();versions.push(baseline.version);
 const context=await browser.newContext({viewport:{width:390,height:844}});
 const user={id:'watch-fixture',name:'热部署验收',avatar:'',bio:'',verified:true,providerStatus:'none',role:'user',accountType:'individual',tags:[],cityIds:[]};
 await context.addInitScript(user=>{sessionStorage.setItem('ourworld.session',JSON.stringify({user,accessToken:'fixture',refreshToken:'fixture'}));localStorage.setItem('ourworld.locale','zh');},user);
 await context.route('**/globe/**',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html></html>'}));
 await context.routeWebSocket('**/api/v1/ws**',socket=>socket.close());
 await context.route('**/api/v1/**',route=>route.fulfill({json:route.request().url().includes('/users/')?{user,layout:null,posts:[],packages:[],reviews:[],places:[]}:{items:[]}}));
 const page=await context.newPage();let loads=0;page.on('domcontentloaded',()=>loads++);
 await page.goto(base);await page.locator('.bottom-nav button[aria-label="Profile"]').click();await page.locator('.owner-name').waitFor();const initialLoads=loads;
 const initialHtml=await (await fetch(base)).text();const oldScript=initialHtml.match(/src="(\/assets\/[^" ]+\.js)"/)[1];
 const first=`first-${id}`;await writeFile(file,first);
 const firstVersion=await waitFor('first source save is published',async()=>{const next=await version();return next.version!==baseline.version&&(await(await fetch(base+'/'+probe)).text())===first?next:null;});versions.push(firstVersion.version);
 check(true,'saving a frontend public file automatically publishes it online');
 await waitFor('browser reload after deployment',()=>loads>initialLoads);await page.locator('.owner-name').waitFor();
 check(await page.locator('.bottom-nav button[aria-label="Profile"]').evaluate(el=>el.classList.contains('active')),'an already open browser refreshes and retains the Profile tab');
 await writeFile(file,`intermediate-${id}`);await delay(100);const latest=`latest-${id}`;await writeFile(file,latest);
 const second=await waitFor('latest rapid edit is published',async()=>{const next=await version();return next.version!==firstVersion.version&&(await(await fetch(base+'/'+probe)).text())===latest?next:null;});versions.push(second.version);
 check(true,'rapid consecutive edits publish the final saved content');check((await fetch(base+oldScript)).status===200,'old hashed JavaScript remains available across deployments');
 await writeFile(invalid,'export const broken: = ;\n');
 const failure=await waitFor('invalid TypeScript build fails',async()=>{const result=await state();return result.state==='failed'?result:null;});
 check(!!failure.error,'an invalid frontend edit is reported as a failed build');
 check((await version()).version===second.version,'a failed build leaves the working release active');check((await fetch(base)).status===200,'the website keeps serving HTTP 200 during build failure');
 await rm(invalid);
 const recovered=await waitFor('fixing TypeScript recovers automatically',async()=>{const next=await version();return next.version!==second.version&&(await state()).state==='ready'?next:null;});versions.push(recovered.version);
 check(true,'fixing the source automatically restores successful deployment');
}finally{
 await rm(file,{force:true});await rm(invalid,{force:true});await browser.close();
}
const final=await waitFor('probe cleanup is published',async()=>{const next=await version();return next.version!==versions.at(-1)&&(await state()).state==='ready'?next:null;});versions.push(final.version);
check(!(await(await fetch(base+'/'+probe)).text()).includes(`latest-${id}`),'temporary probe files are removed from the active website');
const out=resolve(root,'artifacts/frontend-watch');await mkdir(out,{recursive:true});await writeFile(resolve(out,'live-report.json'),JSON.stringify({passed:true,checks,versions,base},null,2));console.log(`frontend-watch-live: ${checks.length} checks passed`);
