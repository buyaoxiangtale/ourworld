import {Fragment,createContext,useCallback,useContext,useLayoutEffect,useRef,useState,type ReactNode,type RefObject} from 'react';

const SlideExitContext=createContext<{exiting:boolean;onExited:()=>void}|null>(null);

/** Keep the last overlay mounted until its slide-out animation finishes. */
export function SlidePresence({children}:{children:ReactNode}){
 const [retained,setRetained]=useState(children);
 const [closing,setClosing]=useState(false),[generation,setGeneration]=useState(0);
 const current=useRef(children);current.current=children;
 if(children&&children!==retained)setRetained(children);
 if(!children&&retained&&!closing)setClosing(true);
 // Reopening before exit finishes starts a fresh editor or photo viewer.
 if(children&&closing){setClosing(false);setGeneration(value=>value+1);}
 const onExited=useCallback(()=>{if(!current.current)setRetained(null);},[]);
 return <SlideExitContext.Provider value={{exiting:!children&&!!retained,onExited}}><Fragment key={generation}>{children||retained}</Fragment></SlideExitContext.Provider>;
}

export function useSlideExiting(){
 return useContext(SlideExitContext)?.exiting??false;
}

export function useSlideExit(root:RefObject<HTMLElement|null>){
 const presence=useContext(SlideExitContext),exiting=presence?.exiting,onExited=presence?.onExited;
 useLayoutEffect(()=>{
  const element=root.current;
  if(!exiting||!onExited||!element||!element.matches('.profile-card-sheet,.bottom-sheet,.service-cities-page,.profile-photo-viewer,.public-profile-shell,.country-cities-page'))return;
  if(matchMedia('(prefers-reduced-motion: reduce)').matches){onExited();return;}
  const style=getComputedStyle(element),sheet=element.matches('.profile-card-sheet,.bottom-sheet');
  const property=sheet?'transform':'translate',from=style.getPropertyValue(property);
  const search=element.classList.contains('explore-search-sheet');
  const backdrop=element.parentElement?.matches('.profile-card-sheet-backdrop,.sheet-backdrop')?element.parentElement:null;
  let distance=`${innerHeight}px`;
  if(search&&backdrop){
   // The keyboard can shorten the backdrop without moving the bottom of the page.
   const pageBottom=Math.max(innerHeight,document.documentElement.clientHeight);
   const gap=Math.max(0,pageBottom-backdrop.getBoundingClientRect().bottom);
   distance=`calc(100% + ${gap}px)`;
  }
  const to=sheet?`translateY(${distance})`:`0 ${distance}`;
  element.dataset.slideExiting='true';
  // The exiting overlay still shields the page, but cannot submit or edit again.
  const block=(event:Event)=>{event.preventDefault();event.stopImmediatePropagation();};
  const events=['click','pointerdown','keydown','submit'];
  events.forEach(event=>element.addEventListener(event,block,true));
  const options:KeyframeAnimationOptions={duration:280,easing:search?'cubic-bezier(.4,0,.2,1)':'cubic-bezier(.4,0,.8,.2)',fill:'forwards'};
  const animation=element.animate([{[property]:from},{[property]:to}],options);animation.id='slide-exit';
  const backdropStyle=backdrop&&getComputedStyle(backdrop);
  // Fade the search backdrop's tint while keeping the sliding panel visible.
  const fade=backdrop&&backdropStyle&&backdrop.animate(search?[
   {opacity:backdropStyle.opacity,backgroundColor:backdropStyle.backgroundColor},
   {opacity:backdropStyle.opacity,backgroundColor:'transparent'},
  ]:[{opacity:backdropStyle.opacity},{opacity:0}],options);
  if(fade)fade.id='slide-backdrop-exit';
  let active=true;const finish=()=>{if(active)onExited();};
  animation.finished.then(finish,finish);
  const fallback=window.setTimeout(finish,450);
  return ()=>{active=false;clearTimeout(fallback);animation.cancel();fade?.cancel();delete element.dataset.slideExiting;events.forEach(event=>element.removeEventListener(event,block,true));};
 },[exiting,onExited,root]);
}
