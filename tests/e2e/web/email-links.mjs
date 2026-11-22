import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
process.env.PLAYWRIGHT_BROWSERS_PATH=resolve(root,'.playwright-browsers');
const {chromium}=await import('playwright');
const base=process.env.OURWORLD_WEB_URL||'http://127.0.0.1:5175';
const api='http://127.0.0.1:8188/api/v1';
const email=`ui-links-${Date.now()}@ourworld.test`;
const initial='Local-UI-Start-2026!';const updated='Local-UI-Updated-2026!';
const checks=[];
async function post(path,body){const response=await fetch(api+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(10000)});const text=await response.text();if(!response.ok)throw new Error(`${path}: ${response.status} ${text.slice(0,150)}`);return text?JSON.parse(text):null;}
async function tokenFromMail(kind){
 for(let attempt=0;attempt<35;attempt++){
  const listing=await (await fetch('http://127.0.0.1:8025/api/v1/messages',{signal:AbortSignal.timeout(5000)})).json();
  for(const item of listing.messages||[]){
   if(!item.To?.some(to=>to.Address===email))continue;
   const mail=await (await fetch(`http://127.0.0.1:8025/api/v1/message/${item.ID}`,{signal:AbortSignal.timeout(5000)})).json();
   const text=mail.Text||mail.HTML||'';const match=text.match(new RegExp(`[?&]${kind}=([^\\s<]+)`));if(match)return decodeURIComponent(match[1]);
  }
  await new Promise(resolve=>setTimeout(resolve,600));
 }
 throw new Error(`No ${kind} email delivered for local UI test account`);
}
const browser=await chromium.launch({headless:true,args:['--no-proxy-server','--disable-gpu']});
const context=await browser.newContext({viewport:{width:390,height:844},locale:'zh-CN'});const page=await context.newPage();page.setDefaultTimeout(15000);
try{
 await post('/auth/register',{email,password:initial,name:'UI email link test'});
 const session=await post('/auth/login',{email,password:initial});if(!session.user.verified)throw new Error('Registration must mark the account verified immediately');checks.push('registration is immediately usable without a verification email');
 await post('/auth/forgot',{email});const reset=await tokenFromMail('reset');
 await page.goto(`${base}/?reset=${encodeURIComponent(reset)}`,{waitUntil:'domcontentloaded',timeout:25000});
 await page.getByLabel('新密码 / New password').fill(updated);await page.getByRole('button',{name:'更新密码 / Update password',exact:true}).click();
 await page.getByRole('heading',{name:'密码已更新 / Password updated',exact:true}).waitFor();
 await post('/auth/login',{email,password:updated});checks.push('real Mailpit /?reset= link updates password and allows login');
 await mkdir(resolve(root,'artifacts'),{recursive:true});await page.screenshot({path:resolve(root,'artifacts/ui-email-reset.png'),timeout:15000});
 await writeFile(resolve(root,'artifacts/ui-email-links-report.json'),JSON.stringify({passed:true,checks},null,2));console.log(JSON.stringify({passed:true,checks}));
}finally{await context.close();await browser.close();}
