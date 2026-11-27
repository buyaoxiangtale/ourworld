export async function openLocatedResult(page,result,{lat,lng}){
 await page.evaluate(({lat,lng})=>{
  window.ourworldTestLocationReady=false;
  const receive=event=>{
   const {event:name,data}=event.data??{};
   if(name!=='cameraChanged'||!data||event.source!==document.querySelector('.globe-frame')?.contentWindow)return;
   if(Math.abs(data.lat-lat)>.05||Math.abs(data.lng-lng)>.05)return;
   window.removeEventListener('message',receive);
   window.ourworldTestLocationReady=true;
  };
  window.addEventListener('message',receive);
 },{lat,lng});
 await result.click();
 await page.locator('.explore-search-sheet').waitFor({state:'detached'});
 await page.waitForFunction(()=>window.ourworldTestLocationReady);
 const canvas=page.frameLocator('.globe-frame').locator('#globe canvas').first();
 const box=await canvas.boundingBox();
 await canvas.click({position:{x:box.width/2,y:box.height/2}});
}

export async function openLocatedFixture(page,result,place){
 await result.click();
 await page.locator('.explore-search-sheet').waitFor({state:'detached'});
 await page.frameLocator('.globe-frame').locator('body').evaluate((_,place)=>{
  parent.postMessage({bridgeVersion:1,event:'placeSelected',data:{place}},location.origin);
 },place);
}

export async function browseLocatedCity(page,cityName){
 await page.getByRole('button',{name:/^(浏览城市|Browse cities)$/}).click();
 const headings=page.locator('.country-city-card h2');
 const active=page.locator('.country-city-card.is-active');
 await headings.first().waitFor({state:'attached'});
 const names=await headings.allTextContents();
 const index=names.indexOf(cityName);
 if(index<0)throw new Error(`Missing city card: ${cityName}`);
 for(let i=0;i<index;i++){
  await page.getByRole('button',{name:/^(下一座城市|Next city)$/}).click();
  await active.getByRole('heading',{name:names[i+1],exact:true}).waitFor();
 }
 await active.getByRole('button',{name:/^(查看城市|Explore city)$/}).click();
}
