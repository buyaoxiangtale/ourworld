import {createHash,randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {cp,mkdir,readFile,readdir,rename,rm,stat,symlink,writeFile} from 'node:fs/promises';
import {dirname,isAbsolute,join,relative,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

export const INPUTS=[
 'apps/web/src','apps/web/public','apps/web/index.html','apps/web/package.json','apps/web/tsconfig.json','apps/web/vite.config.ts',
 'packages/contracts/src','packages/contracts/assets','packages/contracts/package.json','packages/contracts/tsconfig.json',
 'packages/globe/src','packages/globe/public','packages/globe/index.html','packages/globe/mini.html','packages/globe/vite.config.ts','packages/globe/package.json','packages/globe/tsconfig.json',
 'package.json','package-lock.json','tsconfig.base.json','scripts/generate/sync-design.mjs','scripts/generate/sync-globe.mjs','scripts/generate/generate-openapi.mjs',
];
const DEPENDENCIES=INPUTS.filter(path=>path.endsWith('package.json')||path==='package-lock.json');
const log=(message)=>console.log(`[frontend-watch] ${new Date().toISOString()} ${message}`);
const exists=async path=>{try{await stat(path);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}};

async function filesUnder(root,paths){
 const files=[];
 async function visit(path){
  let info;try{info=await stat(join(root,path));}catch(e){if(e.code==='ENOENT')return;throw e;}
  if(info.isDirectory()){
   for(const entry of await readdir(join(root,path),{withFileTypes:true})){
    if(entry.isSymbolicLink())throw new Error(`Symlinks are not supported in frontend input: ${path}/${entry.name}`);
    if(entry.name==='node_modules'||entry.name==='dist'||entry.name==='.git')continue;
    await visit(join(path,entry.name));
   }
  }else if(info.isFile())files.push({path,info});
 }
 for(const path of paths)await visit(path);
 return files.sort((a,b)=>a.path.localeCompare(b.path));
}

export async function fingerprint(root,paths=INPUTS,cache=new Map()){
 const hash=createHash('sha256');
 for(const {path,info} of await filesUnder(root,paths)){
  const signature=`${info.mtimeMs}:${info.ctimeMs}:${info.size}:${info.ino}`;
  let entry=cache.get(path);
  if(entry?.signature!==signature){entry={signature,hash:createHash('sha256').update(await readFile(join(root,path))).digest('hex')};cache.set(path,entry);}
  hash.update(path).update('\0').update(entry.hash).update('\0');
 }
 return hash.digest('hex');
}

function run(command,args,cwd){
 return new Promise((yes,no)=>{
  const child=spawn(command,args,{cwd,stdio:'inherit',env:process.env});
  const stop=()=>child.kill('SIGTERM');process.once('SIGTERM',stop);process.once('SIGINT',stop);
  child.on('error',error=>{process.off('SIGTERM',stop);process.off('SIGINT',stop);no(error);});
  child.on('exit',(code,signal)=>{process.off('SIGTERM',stop);process.off('SIGINT',stop);code===0?yes():no(new Error(`${command} ${args.join(' ')} failed (${signal||code})`));});
 });
}

export async function buildFrontend(sourceRoot,workRoot){
 if(resolve(sourceRoot)===resolve(workRoot)||resolve(workRoot)==='/')throw new Error('Frontend builds require an isolated work directory');
 const before=await fingerprint(workRoot,DEPENDENCIES);
 for(const path of INPUTS){
  const target=join(workRoot,path);
  // Only allowlisted inputs are replaced; dependency folders and build output stay isolated.
  await rm(target,{force:true,recursive:true});
  if(await exists(join(sourceRoot,path))){await mkdir(dirname(target),{recursive:true});await cp(join(sourceRoot,path),target,{recursive:true});}
 }
 if(before!==await fingerprint(workRoot,DEPENDENCIES))await run('npm',['ci','--include=dev','--no-audit','--no-fund'],workRoot);
 await run(process.execPath,['scripts/generate/sync-design.mjs','--web-only'],workRoot);
 await run(process.execPath,['scripts/generate/generate-openapi.mjs'],workRoot);
 await run('npm',['run','build','-w','@ourworld/contracts'],workRoot);
 await run('npm',['run','build','-w','@ourworld/globe'],workRoot);
 await run(process.execPath,['scripts/generate/sync-globe.mjs','--web-only'],workRoot);
 await run('npm',['run','build','-w','@ourworld/web'],workRoot);
 return join(workRoot,'apps/web/dist');
}

export async function publishRelease(dist,releaseRoot,version){
 if(!/^[A-Za-z0-9-]+$/.test(version))throw new Error('Invalid frontend version');
 const html=await readFile(join(dist,'index.html'),'utf8');
 if(!html.includes('</head>'))throw new Error('Frontend output has no head element');
 const assets=[...html.matchAll(/(?:src|href)=["'](\/assets\/[^"']+)["']/g)].map(match=>match[1]);
 if(!assets.some(path=>path.endsWith('.js')))throw new Error('Frontend output has no module entry');
 for(const path of assets){if(path.includes('..')||!await exists(join(dist,path)))throw new Error(`Missing build asset: ${path}`);}
 const releases=join(releaseRoot,'releases');await mkdir(releases,{recursive:true});
 const stage=join(releases,`.staging-${randomUUID()}`),target=join(releases,version);
 try{
  await cp(dist,stage,{recursive:true});
  const metadata={version,builtAt:new Date().toISOString()};
  await writeFile(join(stage,'frontend-version.json'),JSON.stringify(metadata)+'\n');
  const meta=`<meta name="ourworld-frontend-version" content="${version}">`;
  await writeFile(join(stage,'index.html'),html.replace('</head>',`${meta}</head>`));
  // Old documents may still request their original content-hashed modules after a switch.
  for(const path of ['assets','globe/assets'])if(await exists(join(stage,path))){
   const shared=join(releaseRoot,'shared',path);await mkdir(shared,{recursive:true});await cp(join(stage,path),shared,{recursive:true,force:false,errorOnExist:false});
  }
  await rename(stage,target);
  const next=join(releaseRoot,`.current-${randomUUID()}`);
  await symlink(relative(releaseRoot,target),next);
  await rename(next,join(releaseRoot,'current'));
  return metadata;
 }catch(error){await rm(stage,{force:true,recursive:true});throw error;}
}

async function pruneReleases(releaseRoot,current){
 const directory=join(releaseRoot,'releases');
 const releases=(await readdir(directory,{withFileTypes:true})).filter(e=>e.isDirectory()&&!e.name.startsWith('.')).map(e=>e.name).sort().reverse();
 for(const name of releases.slice(5))if(name!==current)await rm(join(directory,name),{recursive:true,force:true});
 // Keep hashed assets for at least a day, and always retain the current build's files.
 for(const path of ['assets','globe/assets']){
  const shared=join(releaseRoot,'shared',path);if(!await exists(shared))continue;
  for(const file of await filesUnder(shared,['.'])){
   if(file.info.mtimeMs<Date.now()-86400000&&!await exists(join(releaseRoot,'current',path,file.path)))await rm(join(shared,file.path));
  }
 }
}

export class FrontendWatcher {
 constructor({sourceRoot,workRoot,releaseRoot,pollMs=1000,debounceMs=1200,build=buildFrontend,onEvent=log}){
  Object.assign(this,{sourceRoot,workRoot,releaseRoot,pollMs,debounceMs,build,onEvent});
  this.cache=new Map();this.observed=null;this.pending=null;this.building=false;this.stopped=false;this.status={state:'starting'};
 }
 async setStatus(values){
  this.status={...this.status,...values,updatedAt:new Date().toISOString()};
  await mkdir(this.releaseRoot,{recursive:true});
  const temp=join(this.releaseRoot,`.status-${randomUUID()}`);await writeFile(temp,JSON.stringify(this.status)+'\n');await rename(temp,join(this.releaseRoot,'watch-status.json'));
 }
 async tick(){
  if(this.stopped||this.scanning)return;this.scanning=true;
  try{
   const current=await fingerprint(this.sourceRoot,INPUTS,this.cache);
   if(current!==this.observed){this.observed=current;this.pending=current;this.changedAt=Date.now();this.onEvent(`Source change detected: ${current.slice(0,12)}`);}
   if(this.pending&&!this.building&&Date.now()-this.changedAt>=this.debounceMs){
    const input=this.pending;this.pending=null;this.building=true;
    this.task=this.deploy(input).finally(()=>{this.building=false;});
   }
  }catch(error){this.onEvent(`Watch error: ${error.message}`);}finally{this.scanning=false;}
 }
 async deploy(input){
  try{
   await this.setStatus({state:'building',source:input,error:null});this.onEvent('Building frontend…');
   const dist=await this.build(this.sourceRoot,this.workRoot);
   if(this.stopped)return;
   if(input!==await fingerprint(this.sourceRoot,INPUTS,this.cache)){this.onEvent('Source changed during build; waiting for the latest snapshot.');return;}
   const version=`${Date.now()}-${input.slice(0,12)}`;
   const metadata=await publishRelease(dist,this.releaseRoot,version);
   await this.setStatus({state:'ready',...metadata,error:null});this.onEvent(`Published ${version}`);
   await pruneReleases(this.releaseRoot,version).catch(error=>this.onEvent(`Release cleanup: ${error.message}`));
  }catch(error){await this.setStatus({state:'failed',error:error.message});this.onEvent(`Build failed; current release retained: ${error.message}`);}
 }
 async start(){await this.tick();this.timer=setInterval(()=>void this.tick(),this.pollMs);}
 async stop(){this.stopped=true;clearInterval(this.timer);await this.task;}
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const sourceRoot=resolve(process.env.FRONTEND_SOURCE_ROOT||'/source');
 const workRoot=resolve(process.env.FRONTEND_WORK_ROOT||'/app');
 const releaseRoot=resolve(process.env.FRONTEND_RELEASE_ROOT||'/srv/frontend');
 if(!isAbsolute(sourceRoot)||sourceRoot===workRoot)throw new Error('Invalid frontend watcher paths');
 const watcher=new FrontendWatcher({sourceRoot,workRoot,releaseRoot,pollMs:Number(process.env.FRONTEND_POLL_MS||1000),debounceMs:Number(process.env.FRONTEND_DEBOUNCE_MS||1200)});
 await watcher.start();
 for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>{void watcher.stop().finally(()=>process.exit(0));});
}
