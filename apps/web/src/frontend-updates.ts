/** Production builds publish a version only after all assets are ready. */
export function startFrontendUpdates(){
 const current=document.querySelector<HTMLMetaElement>('meta[name="ourworld-frontend-version"]')?.content;
 if(!current)return;
 let checking=false;let reloading=false;
 const editing=()=>{
  if(document.querySelector('[role="dialog"],.editor-overlay'))return true;
  if(document.querySelector('.message-composer textarea') instanceof HTMLTextAreaElement){
   const field=document.querySelector<HTMLTextAreaElement>('.message-composer textarea');if(field?.value.trim())return true;
  }
  return document.activeElement instanceof HTMLElement&&document.activeElement.matches('input,textarea,[contenteditable="true"]');
 };
 const check=async()=>{
  if(checking||reloading||document.hidden)return;checking=true;
  try{
   const response=await fetch('/frontend-version.json',{cache:'no-store',signal:AbortSignal.timeout(5000)});
   if(!response.ok)return;const next=await response.json();
   if(typeof next.version!=='string'||!next.version||next.version===current||editing())return;
   const active=document.querySelector<HTMLButtonElement>('.bottom-nav>button.active')?.dataset.tab;
   if(active)sessionStorage.setItem('ourworld.frontend.tab',active);
   reloading=true;location.reload();
  }catch{ /* A temporary connection or version-file error leaves the current app running. */ }
  finally{checking=false;}
 };
 window.setInterval(()=>void check(),4000);
 window.addEventListener('focus',()=>void check());
 document.addEventListener('visibilitychange',()=>void check());
 void check();
}
