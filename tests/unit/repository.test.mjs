import {test} from 'node:test';
import assert from 'node:assert/strict';
import {access,readFile,readdir} from 'node:fs/promises';
import {dirname,resolve,sep} from 'node:path';

const root=resolve(import.meta.dirname,'../..');
async function documentation(directory){
 const files=[];
 for(const entry of await readdir(directory,{withFileTypes:true})){
  const file=resolve(directory,entry.name);
  if(entry.isDirectory())files.push(...await documentation(file));
  else if(entry.name.endsWith('.md')&&(!file.split(sep).includes('archive')||entry.name==='README.md'))files.push(file);
 }
 return files;
}

test('current documentation links resolve after directory moves',async()=>{
 const files=[resolve(root,'README.md'),...await documentation(resolve(root,'docs')),
  ...['web','android','ios'].map(app=>resolve(root,'apps',app,'README.md'))];
 for(const file of files){
  const text=await readFile(file,'utf8');
  for(const [,link] of text.matchAll(/\]\(([^\s)]+)\)/g)){
   if(/^(?:[a-z]+:|#)/i.test(link))continue;
   const target=resolve(dirname(file),decodeURI(link.split('#')[0]));
   await assert.doesNotReject(access(target),`${file}: missing linked file ${link}`);
  }
 }
});

test('npm command entrypoints and workspace manifests exist',async()=>{
 const manifest=JSON.parse(await readFile(resolve(root,'package.json'),'utf8'));
 for(const workspace of manifest.workspaces)await access(resolve(root,workspace,'package.json'));
 for(const [name,command] of Object.entries(manifest.scripts)){
  for(const [,file] of command.matchAll(/\bnode\s+([^\s]+\.mjs)\b/g)){
   await assert.doesNotReject(access(resolve(root,file)),`${name}: missing script ${file}`);
  }
 }
});

test('container entrypoints use the current script and configuration paths',async()=>{
 for(const name of ['Dockerfile','compose.yaml']){
  const text=await readFile(resolve(root,name),'utf8');
  for(const [file] of text.matchAll(/(?:scripts\/[\w/-]+\.mjs|infra\/nginx\/[\w.-]+)/g)){
   await assert.doesNotReject(access(resolve(root,file)),`${name}: missing entrypoint ${file}`);
  }
 }
});
