import { useCallback, useEffect, useRef, useState } from 'react';
import type { RealtimeEvent } from '@ourworld/contracts';
export function useLoad<T>(loader:()=>Promise<T>,deps:unknown[]=[]){
  const ref=useRef(loader);ref.current=loader;const [serial,setSerial]=useState(0);const [data,setData]=useState<T>();const [error,setError]=useState('');const [loading,setLoading]=useState(true);
  useEffect(()=>{let alive=true;setLoading(true);setError('');ref.current().then(v=>{if(alive)setData(v);}).catch(e=>{if(alive)setError(e instanceof Error?e.message:String(e));}).finally(()=>{if(alive)setLoading(false);});return()=>{alive=false;};},[...deps,serial]);
  const reload=useCallback(()=>setSerial(n=>n+1),[]);return {data,error,loading,reload,setData};
}
export function useRealtime(listener:(event:RealtimeEvent)=>void){const ref=useRef(listener);ref.current=listener;useEffect(()=>{const callback=(e:Event)=>ref.current((e as CustomEvent<RealtimeEvent>).detail);window.addEventListener('ourworld:realtime',callback);return()=>window.removeEventListener('ourworld:realtime',callback);},[]);}
export function errorMessage(e:unknown){
  const chinese=localStorage.getItem('ourworld.locale')!=='en';
  const code=e&&typeof e==='object'&&'code' in e?String(e.code):'';
  const labels:Record<string,string>={MODEL_NOT_CONFIGURED:'主页排版模型尚未配置。你仍可手动搭建和保存主页。',MODEL_TIMEOUT:'排版生成超时。当前草稿已保留，可以重试。',MODEL_ERROR:'模型服务暂时未能完成排版，请稍后重试。',REVISION_CONFLICT:'草稿已发生变化。请保留当前修改，重新载入或生成新的方案。',TRIP_CHANGED:'行程结束时间已更新，请查看新时间后重新确认。',INVALID_CREDENTIALS:'邮箱或密码不正确。',INVALID_TOKEN:'链接无效或已过期，请重新获取。',FEED_EXPIRED:'这一轮相遇已过期，请重新开始。',FEED_FILTER_CONFLICT:'城市范围已变化，请开始新一轮。',INVALID_REFERENCE:'部分内容引用已失效，请重新选择自己的照片或资料。'};
  return chinese&&labels[code]?labels[code]:e instanceof Error?e.message:String(e);
}
