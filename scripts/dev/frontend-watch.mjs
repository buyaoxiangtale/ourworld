import {createHash,randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {cp,mkdir,readFile,readdir,rename,rm,stat,writeFile} from 'node:fs/promises';
import {dirname,isAbsolute,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {pruneReleases,publishRelease} from '../deploy/frontend-release.mjs';
export {publishRelease};

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
