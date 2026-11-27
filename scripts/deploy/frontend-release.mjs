import {randomUUID} from 'node:crypto';
import {cp,mkdir,readFile,readdir,rename,rm,stat,symlink,writeFile} from 'node:fs/promises';
import {join,relative,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const exists=async path=>{try{await stat(path);return true;}catch(error){if(error.code==='ENOENT')return false;throw error;}};

export async function publishRelease(dist,releaseRoot,version,revision){
 if(!/^[A-Za-z0-9-]+$/.test(version))throw new Error('Invalid frontend version');
 if(revision!==undefined&&!/^[0-9a-f]{40}$/.test(revision))throw new Error('Invalid Git revision');
 const html=await readFile(join(dist,'index.html'),'utf8');
 if(!html.includes('</head>'))throw new Error('Frontend output has no head element');
 const assets=[...html.matchAll(/(?:src|href)=["'](\/assets\/[^"']+)["']/g)].map(match=>match[1]);
 if(!assets.some(path=>path.endsWith('.js')))throw new Error('Frontend output has no module entry');
 for(const path of assets){if(path.includes('..')||!await exists(join(dist,path)))throw new Error(`Missing build asset: ${path}`);}
 const releases=join(releaseRoot,'releases');await mkdir(releases,{recursive:true});
 const stage=join(releases,`.staging-${randomUUID()}`),target=join(releases,version);
 try{
  await cp(dist,stage,{recursive:true});
  const metadata={version,builtAt:new Date().toISOString(),...(revision?{revision}:{})};
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


export async function pruneReleases(releaseRoot,current){
 const directory=join(releaseRoot,'releases');
 const releases=(await readdir(directory,{withFileTypes:true}))
  .filter(entry=>entry.isDirectory()&&!entry.name.startsWith('.')).map(entry=>entry.name).sort().reverse();
 for(const name of releases.slice(5)){
  if(name!==current)await rm(join(directory,name),{recursive:true,force:true});
 }
 // Prior documents may still fetch original chunks, including after a successful switch.
 const expireAt=Date.now()-86400000;
 for(const path of ['assets','globe/assets']){
  const shared=join(releaseRoot,'shared',path);
  if(!await exists(shared))continue;
  for(const entry of await readdir(shared,{withFileTypes:true,recursive:true})){
   if(!entry.isFile())continue;
   const file=join(entry.parentPath,entry.name);
   if((await stat(file)).mtimeMs<expireAt&&!await exists(join(releaseRoot,'current',path,relative(shared,file))))
    await rm(file,{force:true});
  }
 }
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const argument=process.argv[2];
 const revision=argument==='--local'?undefined:argument;
 if(argument!=='--local'&&(!revision||!/^[0-9a-f]{40}$/.test(revision)))throw new Error('Expected the deployed Git revision');
 const version=`${Date.now()}-${revision?.slice(0,12)??'local'}-${randomUUID().slice(0,8)}`;
 await publishRelease('/app/dist','/srv/frontend',version,revision);
 await pruneReleases('/srv/frontend',version).catch(error=>console.warn('Release cleanup:',error.message));
}
