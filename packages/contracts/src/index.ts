export type Locale = 'zh' | 'en';
export type Localized = { zh: string; en: string };
export type Currency = 'USD'|'CNY'|'EUR'|'GBP'|'JPY';
export type PriceUnit = 'hour'|'half-day'|'day'|'experience';
export interface PriceRange { min: number; max: number; currency: Currency; unit: PriceUnit }
export const EDUCATION_LEVELS = ['high-school','vocational','associate','bachelor','master','doctorate','other'] as const;
export type EducationLevel = typeof EDUCATION_LEVELS[number];
export interface User { id: string; email?: string; name: string; avatar: string; bio: string; verified: boolean; providerStatus: 'none'|'pending'|'approved'|'rejected'; role: 'user'|'admin'; accountType: 'individual'|'agency'; priceRange?: PriceRange; experienceYears?: number; languages?: string[]; school?: string; educationLevel?: EducationLevel; tags: string[]; cityIds: string[]; quote?: string; socialLinks?: {label:string;url:string}[] }
export interface Place { id: string; kind: 'country'|'city'|'attraction'; parentId?: string; country: string; name: Localized; lat: number; lng: number; description: Localized; image: string; aliases?: string[] }
export interface Person extends User { quote: string; rating?: number }
export interface Page<T> { items: T[]; nextCursor: string|null }
export interface PeopleFeed extends Page<Person> { feedId: string; exhausted: boolean }
export type BlockType = 'intro'|'prompts'|'gallery'|'experiences'|'skills'|'cities'|'packages'|'posts'|'reviews'|'social';
export interface ProfileBlock { id: string; type: BlockType; span: 1|2; size: 'compact'|'expanded'; title?: string; content?: string; refs?: string[]; prompts?: {question:string;answer:string}[] }
export interface ProfileLayout { schemaVersion: 1; theme: 'ocean'|'forest'|'nocturne'; accent: string; blocks: ProfileBlock[] }
export interface ProfileDraft { revision: number; layout: ProfileLayout; publishedRevision: number|null }
export interface ServicePackage { id:string; userId:string; title:string; description:string; cityIds:string[]; price:string; currency:string; unit:string; image:string; status:'draft'|'published'|'archived' }
export interface Post { id:string; userId:string; author?:User; cityId:string; title:string; body:string; images:string[]; likes:number; liked?:boolean; createdAt:string }
export interface Conversation { id:string; peer:User; cityId?:string; lastMessage?:string; unread:number; createdAt:string; updatedAt:string }
export interface Message { id:string; conversationId:string; senderId:string; clientMessageId:string; sequence:number; type:'text'|'image'|'contact'|'place'|'package'|'trip'; body:string; data?:Record<string,unknown>; createdAt:string }
export interface Trip { id:string; conversationId:string; creatorId:string; peerId:string; cityId:string; endAt:string; status:'proposed'|'active'|'reviewable'|'cancelled'; frozen:boolean; confirmations:string[]; openedBy?:'scheduled'|'mutual'|'admin'; title:string }
export interface LayoutJob { id:string; status:'queued'|'running'|'validating'|'ready'|'failed'|'cancelled'; baseRevision:number; layout?:ProfileLayout; error?:string }
export interface RealtimeEvent { event:string; data:Record<string,unknown> }
export interface GlobeCommand { bridgeVersion:1; event:'focusPlace'|'clearCountryFocus'|'setMarkers'|'restoreCamera'|'setTheme'|'setActive'; data:Record<string,unknown> }
export interface GlobeEvent { bridgeVersion:1; event:'rendererReady'|'placeSelected'|'cameraChanged'|'rendererError'; data:Record<string,unknown> }
export const BLOCK_TYPES: BlockType[] = ['intro','prompts','gallery','experiences','skills','cities','packages','posts','reviews','social'];
export const PROFILE_THEMES = ['ocean','forest','nocturne'] as const;
export const CURRENCIES: Currency[] = ['USD','CNY','EUR','GBP','JPY'];
export const PRICE_UNITS: PriceUnit[] = ['hour','half-day','day','experience'];
export const DEFAULT_LAYOUT: ProfileLayout = { schemaVersion:1, theme:'nocturne', accent:'#d9a670', blocks:[{id:'intro',type:'intro',span:2,size:'compact'},{id:'prompts',type:'prompts',span:2,size:'compact'},{id:'gallery',type:'gallery',span:2,size:'expanded'},{id:'skills',type:'skills',span:1,size:'compact'},{id:'cities',type:'cities',span:1,size:'compact'},{id:'packages',type:'packages',span:2,size:'expanded'},{id:'reviews',type:'reviews',span:2,size:'compact'}] };
export const DESIGN_TOKENS = { colors:{night:'#071b26',paper:'#f7f5ed',ink:'#193936',coral:'#d9846a',mint:'#cbe8d4',rose:'#efc6c2'},radius:{card:26,button:18},motion:{card:260,focus:850} } as const;
export interface PaymentProvider { createPayment(input:unknown):Promise<unknown>; getStatus(id:string):Promise<unknown>; refund(input:unknown):Promise<unknown>; settle(input:unknown):Promise<unknown>; verifyWebhook(input:unknown):Promise<boolean> }
