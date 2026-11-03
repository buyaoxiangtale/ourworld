import visual from '../../../packages/contracts/assets/visual.json' with {type:'json'};
export const swipeMotion=visual.motion;
export function swipeDirection(x:number,y:number,width:number,velocity:number): -1|0|1 {
  if(width<=0||Math.abs(x)<=Math.abs(y)*1.2)return 0;
  const fast=Math.abs(velocity)>=swipeMotion.flingVelocity;
  if(fast&&Math.sign(velocity)!==Math.sign(x))return 0;
  return Math.abs(x)>=width*swipeMotion.distancePercent/100||(fast&&Math.abs(x)>=width*swipeMotion.flingPercent/100)?x>0?1:-1:0;
}
