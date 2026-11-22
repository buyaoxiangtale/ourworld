import { existsSync, mkdirSync, chmodSync, copyFileSync, readdirSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const source=resolve(root,'packages/globe/dist');
if(!existsSync(resolve(source,'index.html'))) throw new Error('Build @ourworld/globe before syncing resources.');
const targets=['apps/web/public/globe'];
if(!process.argv.includes('--web-only')) targets.push('apps/android/app/src/main/assets/globe','apps/ios/Resources/globe');
function copyTree(from,to){
 mkdirSync(to,{recursive:true});
 // These generated resources are also served by a separate web-server user.
 chmodSync(to,0o755);
 for(const entry of readdirSync(from,{withFileTypes:true})){
  if(entry.isSymbolicLink())throw new Error('Unexpected symlink in globe build');
  const input=resolve(from,entry.name),output=resolve(to,entry.name);
  if(entry.isDirectory())copyTree(input,output);
  else {copyFileSync(input,output);chmodSync(output,0o644);}
 }
}
const currentAssets=new Set(readdirSync(resolve(source,'assets')));
for(const name of targets){
 const target=resolve(root,name);
 if(!target.startsWith(root+'\\')&&!target.startsWith(root+'/')) throw new Error('Resource target outside workspace');
 copyTree(source,target);
 // Retire only old generated bundles; leave any other resource files alone.
 const assets=resolve(target,'assets');
 for(const entry of readdirSync(assets,{withFileTypes:true})){
  if(entry.isFile()&&/^(?:index|mini|earth-material|planet-icons|three\.module)-[A-Za-z0-9_-]+\.(js|css)$/.test(entry.name)&&!currentAssets.has(entry.name)){
   const file=resolve(assets,entry.name);
   if(!file.startsWith(assets+'\\')&&!file.startsWith(assets+'/'))throw new Error('Asset outside generated resource directory');
   unlinkSync(file);
  }
 }
 console.log('Synced '+name);
}
