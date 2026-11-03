import { createContext, useContext } from 'react';
import type { Locale, User } from '@ourworld/contracts';
import type { Translate } from './i18n';
export interface AppState {user:User|null;locale:Locale;t:Translate;setLocale:(locale:Locale)=>void;toast:(message:string)=>void;openAuth:()=>void;requireAuth:(action?:()=>void)=>boolean;openProfile:(id:string)=>void;refreshUser:()=>Promise<void>;conversationAdded:()=>void;}
export const AppContext=createContext<AppState>(null!);
export const useApp=()=>useContext(AppContext);
