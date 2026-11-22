import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from 'playwright';
const base=process.env.OURWORLD_WEB_URL||'http://127.0.0.1:8188',out=resolve('artifacts/auth-session');await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--no-proxy-server','--disable-gpu']});
const checks=[],errors=[];const check=(value,label)=>{assert(value,label);checks.push(label);console.log('ok: '+label);};
const user={id:'auth-fixture',name:'登录测试用户',avatar:'',bio:'保留登录测试',verified:true,providerStatus:'none',role:'admin',accountType:'individual',tags:['摄影'],cityIds:[],priceRange:{min:80,max:120,currency:'CNY',unit:'day'}};
const saved=page=>page.evaluate(()=>JSON.parse(localStorage.getItem('ourworld.session')||'null'));
async function fixture(initial,withoutLocks=false){
 const context=await browser.newContext({viewport:{width:390,height:844},locale:'zh-CN'});
 await context.addInitScript(({initial,withoutLocks})=>{if(withoutLocks)Object.defineProperty(navigator,'locks',{value:undefined});localStorage.setItem('ourworld.locale','zh');if(initial&&!sessionStorage.getItem('fixture-initialized')){sessionStorage.setItem('fixture-initialized','1');if(initial==='invalid')localStorage.setItem('ourworld.session','{broken JSON');else sessionStorage.setItem('ourworld.session',JSON.stringify(initial));}},{initial,withoutLocks});
 await context.route('**/globe/**',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html></html>'}));await context.route('**/frontend-version.json',route=>route.abort());await context.routeWebSocket('**/api/v1/ws**',socket=>socket.close());
 const state={access:'access-1',refresh:'refresh-1',logins:0,refreshes:0,logouts:[],expired:false,failRefresh:false,abortRefresh:false,invalidRefresh:false,failLogout:false,holdRefresh:null};
 await context.route('**/api/v1/**',async route=>{
  const path=new URL(route.request().url()).pathname.replace('/api/v1',''),method=route.request().method(),token=route.request().headers().authorization;let json={items:[]};
  if(path==='/auth/login'){state.logins++;return route.fulfill({json:{user,accessToken:state.access,refreshToken:state.refresh}});}
  if(path==='/auth/refresh'){
   state.refreshes++;if(state.holdRefresh)await state.holdRefresh;
   if(state.abortRefresh){state.abortRefresh=false;return route.abort('internetdisconnected');}
   if(state.failRefresh){state.failRefresh=false;return route.fulfill({status:503,json:{message:'暂时无法更新登录'}});}
   if(state.invalidRefresh||route.request().postDataJSON().refreshToken!==state.refresh)return route.fulfill({status:401,json:{code:'UNAUTHORIZED',message:'Session expired'}});
   state.access=`access-${state.refreshes+1}`;state.refresh=`refresh-${state.refreshes+1}`;state.expired=false;
   return route.fulfill({json:{user,accessToken:state.access,refreshToken:state.refresh}});
  }
  if(path==='/auth/logout'){state.logouts.push(route.request().postDataJSON().refreshToken);return route.fulfill({status:state.failLogout?503:200,json:{ok:!state.failLogout}});}
  if(path==='/me'||path==='/conversations'||path.startsWith('/admin/')){
   if(state.expired||token!==`Bearer ${state.access}`)return route.fulfill({status:401,json:{code:'UNAUTHORIZED',message:'Access token expired'}});
   if(path==='/me')json=user;
   if(path==='/admin/overview')json={users:1};
  }else if(path===`/users/${user.id}`)json={user,layout:{schemaVersion:1,theme:'nocturne',accent:'#DBB473',blocks:[]},posts:[],packages:[],reviews:[],places:[]};
  else if(path.startsWith('/users/'))return route.fulfill({status:404,json:{message:'No demo fixture'}});
  return route.fulfill({json});
 });
 const open=async()=>{const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(12000);await page.goto(base);await profile(page);return page;};
 return {context,state,open};
}
async function profile(page){await page.locator('[data-tab="profile"]').click();}
async function login(page){await page.getByRole('button',{name:'开始我的主页',exact:true}).click();const dialog=page.getByRole('dialog',{name:'欢迎来到 Ourworld',exact:true});await dialog.getByLabel('邮箱',{exact:true}).fill('login@example.test');await dialog.getByLabel('密码',{exact:true}).fill('Fixture-password-2026!');await dialog.getByRole('button',{name:'进入我的世界',exact:true}).click();await page.locator('.owner-name').waitFor();}
async function confirmSignOut(page,trigger){await trigger.click();const dialog=page.getByRole('dialog',{name:'确认退出登录',exact:true});await dialog.waitFor();await dialog.getByRole('button',{name:'确认退出',exact:true}).click();}
async function guest(page){await page.getByRole('button',{name:'开始我的主页',exact:true}).waitFor();check(await page.locator('.owner-name').count()===0,'logged-out page hides private owner information');}
try{
 const {context,state,open}=await fixture();const page=await open();await login(page);
 const first=await saved(page);check(first.user.id===user.id&&!!first.clientId,'login is persisted with the account identity');check(await page.evaluate(()=>sessionStorage.getItem('ourworld.session'))===null,'legacy tab session is removed after persistence');
 await page.reload();await profile(page);await page.locator('.owner-name').waitFor();check(state.logins===1&&(await saved(page)).user.id===user.id,'refresh keeps the login without another password request');
 const second=await open();await second.locator('.owner-name').waitFor();check((await saved(second)).clientId===first.clientId,'a new tab restores the existing login');
 state.expired=true;const refreshes=state.refreshes;await Promise.all([page.reload(),second.reload()]);await Promise.all([profile(page),profile(second)]);await page.waitForFunction(()=>JSON.parse(localStorage.getItem('ourworld.session')).accessToken!=='access-1');await page.locator('.owner-name').waitFor();
 check(state.refreshes===refreshes+1,'concurrent tabs renew a rotating refresh token once');check((await saved(page)).accessToken===(await saved(second)).accessToken,'renewed tokens are shared across tabs');
 state.expired=true;state.failRefresh=true;const old=(await saved(page)).refreshToken;const failedRenewal=page.waitForResponse(response=>response.url().endsWith('/auth/refresh'));await page.reload();await profile(page);await failedRenewal;await page.locator('.owner-name').waitFor();
 check((await saved(page))?.refreshToken===old,'a temporary refresh server error preserves the saved login');
 await page.reload();await profile(page);await page.waitForFunction(old=>JSON.parse(localStorage.getItem('ourworld.session'))?.refreshToken!==old,old);check((await saved(page)).user.id===user.id,'retry after a temporary server error restores API access');
 state.expired=true;state.abortRefresh=true;await page.reload();await profile(page);await page.locator('.owner-name').waitFor();await page.waitForTimeout(150);check((await saved(page))?.user.id===user.id,'network failure during renewal does not log the user out');
 const offlineToken=(await saved(page)).accessToken;await page.reload();await profile(page);await page.waitForFunction(token=>JSON.parse(localStorage.getItem('ourworld.session'))?.accessToken!==token,offlineToken);await page.locator('.owner-name').waitFor();
 const beforeCancel=await saved(page),beforeLogoutRequests=state.logouts.length;const signout=page.getByRole('button',{name:'退出登录',exact:true});
 for(const dismiss of ['cancel','Escape','backdrop','Close']){await signout.click();const confirmation=page.getByRole('dialog',{name:'确认退出登录',exact:true});await confirmation.waitFor();check((await saved(page)).clientId===beforeCancel.clientId&&state.logouts.length===beforeLogoutRequests,`opening confirmation (${dismiss}) does not sign out or call the logout API`);if(dismiss==='cancel')await confirmation.getByRole('button',{name:'取消',exact:true}).click();else if(dismiss==='Escape')await page.keyboard.press('Escape');else if(dismiss==='backdrop')await page.mouse.click(3,3);else await confirmation.getByRole('button',{name:'Close',exact:true}).click();await confirmation.waitFor({state:'hidden'});check((await saved(page)).clientId===beforeCancel.clientId&&state.logouts.length===beforeLogoutRequests,`dismissing confirmation (${dismiss}) preserves login`);}
 check(await second.locator('.owner-name').count()===1,'cancelling sign-out leaves other tabs signed in');
 state.failLogout=true;await confirmSignOut(page,page.getByRole('button',{name:'退出登录',exact:true}));await guest(page);await guest(second);check(await saved(page)===null&&await page.evaluate(()=>sessionStorage.getItem('ourworld.session'))===null,'logout clears persistent and tab session storage even if logout API fails');
 await page.reload();await profile(page);await guest(page);check(await saved(page)===null,'refresh after logout does not restore the old login');
 state.failLogout=false;state.expired=false;await login(page);await page.getByRole('button',{name:'设置',exact:true}).click();const settings=page.getByRole('dialog',{name:'设置',exact:true});check(await settings.getByRole('button',{name:'退出登录',exact:true}).count()===1,'settings retains a clear sign-out action');await settings.getByRole('button',{name:'退出登录',exact:true}).click();let confirmation=page.getByRole('dialog',{name:'确认退出登录',exact:true});await confirmation.getByRole('button',{name:'取消',exact:true}).click();await confirmation.waitFor({state:'hidden'});check(await settings.isVisible()&&!!await saved(page),'cancelling nested confirmation keeps settings and login open');await confirmSignOut(page,settings.getByRole('button',{name:'退出登录',exact:true}));await guest(page);check(await settings.count()===0,'logout closes private settings immediately');
 await login(page);state.expired=true;state.invalidRefresh=true;await page.reload();await profile(page);await guest(page);check(await saved(page)===null,'a revoked or expired refresh token clears the invalid session');state.invalidRefresh=false;state.expired=false;
 await login(page);let release;state.holdRefresh=new Promise(resolve=>release=resolve);state.expired=true;const started=page.waitForRequest(request=>request.url().endsWith('/auth/refresh'));await page.reload();await started;await profile(page);await page.locator('.owner-name').waitFor();await confirmSignOut(page,page.getByRole('button',{name:'退出登录',exact:true}));await guest(page);release();state.holdRefresh=null;await page.waitForTimeout(350);check(await saved(page)===null,'an in-flight token renewal cannot restore a logged-out account');check(state.logouts.includes(state.refresh),'tokens returned after logout are revoked');
 state.expired=false;await login(page);await page.goto(base+'/admin');await page.getByRole('heading',{name:'工作台',exact:true}).waitFor();await confirmSignOut(page,page.getByRole('button',{name:'退出登录',exact:true}));await page.getByRole('button',{name:'管理员登录',exact:true}).waitFor();check(await page.locator('.admin-sidebar').count()===0,'administrator logout removes the management view');await context.close();
 const legacy=await fixture({user,accessToken:'access-1',refreshToken:'refresh-1'}),migrated=await legacy.open();await migrated.locator('.owner-name').waitFor();check((await saved(migrated)).user.id===user.id&&await migrated.evaluate(()=>sessionStorage.getItem('ourworld.session'))===null,'existing tab sessions migrate without asking users to log in again');await legacy.context.close();
 const fallback=await fixture(undefined,true),http=await fallback.open();await login(http);const http2=await fallback.open();await http2.locator('.owner-name').waitFor();fallback.state.expired=true;await Promise.all([http.reload(),http2.reload()]);await Promise.all([profile(http),profile(http2)]);await http.waitForFunction(()=>JSON.parse(localStorage.getItem('ourworld.session'))?.accessToken!=='access-1');check(fallback.state.refreshes===1,'HTTP deployments without Web Locks coordinate renewal across tabs');await fallback.context.close();
 const corrupt=await fixture('invalid'),invalid=await corrupt.open();await guest(invalid);await login(invalid);check((await saved(invalid)).user.id===user.id,'corrupt stored sessions do not prevent a fresh login');await corrupt.context.close();
 check(errors.length===0,`no browser errors: ${errors.join('; ')}`);await writeFile(resolve(out,'report.json'),JSON.stringify({passed:true,checks},null,2));console.log(`auth-session: ${checks.length} checks passed`);
}catch(error){await writeFile(resolve(out,'report.json'),JSON.stringify({passed:false,error:error.message,checks,errors},null,2));throw error;}finally{await browser.close();}
