import { mkdirSync, writeFileSync, readFileSync, copyFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const directory=resolve(root,'packages/contracts/assets/fonts');mkdirSync(directory,{recursive:true});
const fonts=[['Manrope','manrope','Manrope%5Bwght%5D.ttf'],['Newsreader','newsreader','Newsreader%5Bopsz%2Cwght%5D.ttf'],['NotoSansSC','notosanssc','NotoSansSC%5Bwght%5D.ttf']];
const hashes={};
for(const [name,folder,file] of fonts){
 const target=resolve(directory,name+'.ttf');
 if(!existsSync(target)){const r=await fetch(`https://raw.githubusercontent.com/google/fonts/main/ofl/${folder}/${file}`,{signal:AbortSignal.timeout(45000)});if(!r.ok)throw new Error(`${name}: ${r.status}`);const data=Buffer.from(await r.arrayBuffer());writeFileSync(target,data);hashes[name]=createHash('sha256').update(data).digest('hex');}
 hashes[name]=createHash('sha256').update(readFileSync(target)).digest('hex');
 try { const license=await fetch(`https://raw.githubusercontent.com/google/fonts/main/ofl/${folder}/OFL.txt`,{signal:AbortSignal.timeout(10000)});if(license.ok)writeFileSync(resolve(directory,name+'-OFL.txt'),await license.text()); } catch { console.warn('License download retry required for '+name); }
 console.log('Font ready: '+name);
}
for(const dest of ['apps/android/app/src/main/assets/fonts','apps/ios/Resources/fonts']){const target=resolve(root,dest);mkdirSync(target,{recursive:true});for(const [name]of fonts){copyFileSync(resolve(directory,name+'.ttf'),resolve(target,name+'.ttf'));const license=resolve(directory,name+'-OFL.txt');if(existsSync(license))copyFileSync(license,resolve(target,name+'-OFL.txt'));}}
writeFileSync(resolve(directory,'sources.json'),JSON.stringify({source:'https://github.com/google/fonts',hashes},null,2));
