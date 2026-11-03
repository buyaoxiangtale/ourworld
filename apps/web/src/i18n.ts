import type { Locale } from '@ourworld/contracts';
export type Translate=(zh:string,en:string)=>string;
export const translator=(locale:Locale):Translate=>(zh,en)=>locale==='zh'?zh:en;
export const formatDate=(value:string,locale:Locale)=>new Date(value).toLocaleString(locale==='zh'?'zh-CN':'en-GB',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
