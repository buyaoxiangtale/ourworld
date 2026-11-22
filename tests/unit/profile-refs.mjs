import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const server=await createServer({configFile:resolve(root,'apps/web/vite.config.ts'),root:resolve(root,'apps/web'),server:{middlewareMode:true,hmr:false},appType:'custom'});
const checks=[];
const assert=(condition,message)=>{if(!condition)throw new Error(message);checks.push(message);};
try{
  const {ProfileRenderer}=await server.ssrLoadModule('/src/features/profile/Profile.tsx');
  const {AppContext}=await server.ssrLoadModule('/src/context.tsx');
  const noop=()=>{};
  const context={locale:'en',t:(_zh,en)=>en,openProfile:noop,user:null,setLocale:noop,toast:noop,openAuth:noop,requireAuth:()=>true,refreshUser:async()=>{},conversationAdded:noop};
  const user={id:'owner',name:'Render test owner',avatar:'',bio:'Only supplied resource data is rendered.',verified:true,providerStatus:'approved',role:'user',tags:[],cityIds:['city-a','city-b']};
  const resource={user,layout:null,
    packages:['a','b'].map(id=>({id:`package-${id}`,userId:user.id,title:`PACKAGE_${id.toUpperCase()}`,description:'Example service',cityIds:user.cityIds,price:'10',currency:'USD',unit:'day',image:'',status:'published'})),
    posts:['a','b'].map(id=>({id:`post-${id}`,userId:user.id,title:`POST_${id.toUpperCase()}`,body:'Example story',cityId:'city-a',images:[],likes:0,createdAt:'2026-01-01T00:00:00Z'})),
    reviews:['a','b'].map(id=>({id:`review-${id}`,rating:5,body:`REVIEW_${id.toUpperCase()}`,createdAt:'2026-01-01T00:00:00Z'})),
    places:['a','b','outside'].map(id=>({id:`city-${id}`,kind:'city',parentId:'country',country:'Example',name:{zh:`CITY_${id.toUpperCase()}`,en:`CITY_${id.toUpperCase()}`},lat:0,lng:0,description:{zh:'',en:''},image:''}))};
  const render=(blocks)=>renderToStaticMarkup(React.createElement(AppContext.Provider,{value:context},React.createElement(ProfileRenderer,{resource,layout:{schemaVersion:1,theme:'nocturne',accent:'#ce795f',blocks}})));
  for(const [type,prefix] of [['packages','package'],['posts','post'],['reviews','review'],['cities','city']]){
    const marker=prefix==='package'?'PACKAGE':prefix==='post'?'POST':prefix==='review'?'REVIEW':'CITY';
    // The identity header always summarises every service city, so selection for the
    // cities block is asserted inside the block's own container rather than the page.
    const scope=(html)=>type==='cities'?html.split('profile-city-list')[1]||'':html;
    const selected=scope(render([{id:type,type,span:2,size:'compact',refs:[`${prefix}-b`]}]));
    assert(selected.includes(`${marker}_B`)&&!selected.includes(`${marker}_A`),`${type}: only explicitly referenced resource is rendered`);
    const ordered=scope(render([{id:type,type,span:2,size:'compact',refs:[`${prefix}-b`,`${prefix}-a`]}]));
    assert(ordered.indexOf(`${marker}_B`)<ordered.indexOf(`${marker}_A`),`${type}: explicit reference order is respected`);
    const fallback=render([{id:type,type,span:2,size:'compact',refs:[]}]);
    assert(fallback.includes(`${marker}_A`)&&fallback.includes(`${marker}_B`),`${type}: empty refs retain the existing fallback`);
  }
  const cities=render([{id:'cities',type:'cities',span:2,size:'expanded',refs:['city-outside','city-b']}]);
  assert(cities.includes('CITY_B')&&!cities.includes('CITY_OUTSIDE'),'cities: references cannot expand real service coverage');
  const unknown=render([{id:'posts',type:'posts',span:2,size:'compact',refs:['nonexistent-post']}]);
  assert(!unknown.includes('POST_A')&&!unknown.includes('POST_B'),'unknown refs do not fall back to unrelated resource data');
  user.tags=['政治','平等','社会性发展','咖啡','旧爱好'];
  const hobbies=render([{id:'skills',type:'skills',span:2,size:'expanded'}]);
  assert((hobbies.match(/class="profile-hobby-card"/g)||[]).length===3,'public homepage groups related hobbies into three category cards');
  assert(hobbies.includes('Politics, Equality, Social development')&&hobbies.includes('Coffee')&&hobbies.includes('旧爱好'),'public hobby cards localize known hobbies and retain custom interests');
  assert(!hobbies.includes('profile-hobby-card-edit')&&!hobbies.includes('owner-interest-card'),'visitors see hobby cards without editing controls');
  await mkdir(resolve(root,'artifacts'),{recursive:true});
  await writeFile(resolve(root,'artifacts/ui-profile-refs-report.json'),JSON.stringify({passed:true,checks},null,2));
  console.log(JSON.stringify({passed:true,checks},null,2));
}finally{await server.close();}
