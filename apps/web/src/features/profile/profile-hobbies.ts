import type {ProfileLayout} from '@ourworld/contracts';

type HobbyTuple=[string,string,string,string,string[]?];
export interface Hobby {id:string;emoji:string;zh:string;en:string;aliases:string[]}
export interface HobbyGroup {id:string;zh:string;en:string;preview:number;items:Hobby[]}
const group=(id:string,zh:string,en:string,items:HobbyTuple[],preview=6):HobbyGroup=>({id,zh,en,preview,items:items.map(([id,emoji,zh,en,aliases=[]])=>({id,emoji,zh,en,aliases}))});
export const HOBBY_LIMIT=10;
export const HOBBY_GROUPS:HobbyGroup[]=[
 group('values','价值公益','Values & causes',[
  ['development','🧑‍🤝‍🧑','社会性发展','Social development'],['equality','⚖️','平等','Equality'],['politics','🏛️','政治','Politics'],['activism','✊','行动主义','Activism'],['human-rights','⚖️','人权','Human rights'],['mental-health','🧠','心理健康意识','Mental health awareness'],['volunteering','🤝','志愿服务','Volunteering'],['environment','🌱','环境保护','Environment'],['animal-welfare','🐾','动物保护','Animal welfare'],['community','🏘️','社区活动','Community activities'],
 ]),
 group('wellbeing','健康生活','Wellbeing',[
  ['self-love','💖','自爱','Self-love'],['new-things','🦋','尝试新事物','Trying new things'],['tarot','🔮','塔罗牌','Tarot'],['spa','🕯️','水疗','Spa'],['self-care','🌼','自我照顾','Self-care'],['meditation','🧘','冥想','Meditation'],['skincare','🧴','护肤','Skincare'],['yoga','🧘‍♀️','瑜伽','Yoga'],['pilates','🤸','普拉提','Pilates'],['slow-living','🌿','慢生活','Slow living'],
 ],7),
 group('going-out','外出游玩','Going out',[
  ['escape-rooms','🔑','密室逃脱','Escape rooms'],['bars','🍺','酒吧','Bars'],['museums','🏛️','博物馆','Museums'],['thrifting','👜','淘二手货','Thrifting'],['parties','🕺','跳舞派对','Dance parties'],['drive-in','🚗','汽车影院','Drive-in cinema'],['concerts','🎵','演唱会','Concerts'],['stand-up','🎤','脱口秀','Stand-up comedy'],['exhibitions','🖼️','看展','Exhibitions'],['theme-parks','🎡','游乐园','Theme parks'],
 ]),
 group('travel','旅行户外','Travel & outdoors',[
  ['city-walks','🚶','城市漫步','City walks',['城市漫步 City walks','City walking']],['hiking','🥾','徒步','Hiking'],['camping','🏕️','露营','Camping'],['road-trips','🚙','自驾旅行','Road trips'],['beaches','🏖️','海边','Beaches'],['diving','🤿','潜水','Diving'],['cycling','🚲','骑行','Cycling'],['climbing','🧗','攀岩','Climbing'],['skiing','⛷️','滑雪','Skiing'],['birdwatching','🦜','观鸟','Birdwatching'],['travel','🌍','旅行','Travel'],['surfing','🏄','冲浪','Surfing'],
 ]),
 group('food','美食饮品','Food & drink',[
  ['coffee','☕','咖啡','Coffee'],['cooking','🍳','烹饪','Cooking'],['baking','🥐','烘焙','Baking'],['food-spots','🍜','美食探店','Food spots'],['tea','🍵','茶','Tea'],['wine','🍷','葡萄酒','Wine'],['desserts','🍰','甜品','Desserts'],['street-food','🥟','街头美食','Street food'],['vegetarian','🥗','素食','Vegetarian food'],['seafood','🦐','海鲜','Seafood'],
 ]),
 group('arts','文化艺术','Arts & culture',[
  ['photography','📷','摄影','Photography',['摄影 Photography']],['music','🎧','音乐','Music'],['films','🎬','电影','Films',['Movies']],['reading','📚','阅读','Reading'],['painting','🎨','绘画','Painting'],['dance','💃','舞蹈','Dance'],['crafts','🧶','手工','Crafts'],['writing','✍️','写作','Writing'],['architecture','🏛️','建筑','Architecture'],['design','✏️','设计','Design'],['anime','🌸','动漫','Anime'],['history','📜','历史','History'],
 ]),
 group('sports','运动健身','Sports & fitness',[
  ['running','🏃','跑步','Running'],['fitness','🏋️','健身','Fitness'],['swimming','🏊','游泳','Swimming'],['basketball','🏀','篮球','Basketball'],['football','⚽','足球','Football',['Soccer']],['tennis','🎾','网球','Tennis'],['badminton','🏸','羽毛球','Badminton'],['table-tennis','🏓','乒乓球','Table tennis'],['boxing','🥊','拳击','Boxing'],['skating','🛼','轮滑','Skating'],
 ]),
 group('everyday','日常兴趣','Everyday interests',[
  ['gaming','🎮','游戏','Gaming'],['board-games','🎲','桌游','Board games'],['technology','💻','科技','Technology'],['coding','⌨️','编程','Coding'],['podcasts','🎙️','播客','Podcasts'],['gardening','🪴','园艺','Gardening'],['pets','🐱','宠物','Pets'],['collecting','🎟️','收藏','Collecting'],['shopping','🛍️','购物','Shopping'],['languages','🗣️','学语言','Learning languages'],
 ]),
];
export const normalizeHobby=(value:string)=>value.normalize('NFKD').replace(/\p{Diacritic}/gu,'').toLocaleLowerCase().replace(/\s+/g,' ').trim();
const byAlias=new Map(HOBBY_GROUPS.flatMap(group=>group.items).flatMap(item=>[item.zh,item.en,`${item.zh} ${item.en}`,...item.aliases].map(alias=>[normalizeHobby(alias),item] as const)));
export const findHobby=(value:string)=>byAlias.get(normalizeHobby(value));
export const hobbyLabel=(value:string,locale:'zh'|'en')=>findHobby(value)?.[locale]||value;
export const hobbyKey=(value:string)=>findHobby(value)?.id||normalizeHobby(value);

// Keep hobby metadata in the existing skills block and accept legacy single-photo refs.
const HOBBY_PHOTO_PREFIX='hobby-photo:';
const HOBBY_INTRO_PREFIX='hobby-intro:';
export const HOBBY_PHOTO_LIMIT=6;
export const HOBBY_INTRO_LIMIT=180;

export function readHobbyDetails(layout?:ProfileLayout|null){
 const photos=new Map<string,string[]>();
 const intros=new Map<string,string>();
 for(const block of layout?.blocks??[]){
  if(block.type!=='skills')continue;
  for(const ref of block.refs??[]){
   const isPhoto=ref.startsWith(HOBBY_PHOTO_PREFIX);
   if(!isPhoto&&!ref.startsWith(HOBBY_INTRO_PREFIX))continue;
   try{
    const pair=JSON.parse(ref.slice((isPhoto?HOBBY_PHOTO_PREFIX:HOBBY_INTRO_PREFIX).length));
    if(!Array.isArray(pair)||typeof pair[0]!=='string')continue;
    const [key,value]=pair;
    if(!isPhoto){
     if(typeof value==='string'&&value.trim())intros.set(key,value);
     continue;
    }
    const ids=(Array.isArray(value)?value:[value]).filter(
     (id):id is string=>typeof id==='string'&&/^[a-z0-9-]+$/i.test(id)
    );
    if(ids.length)photos.set(key,[...new Set(ids)]);
   }catch{continue;}
  }
 }
 return {photos,intros};
}

export function updateHobbies(layout:ProfileLayout,selected:string[],photoChanges:ReadonlyMap<string,string[]>,introChanges:ReadonlyMap<string,string>):ProfileLayout{
 const {photos,intros}=readHobbyDetails(layout);
 for(const [key,ids] of photoChanges)photos.set(key,ids);
 for(const [key,intro] of introChanges)intros.set(key,intro.trim());
 const hobbyRefs=selected.map(hobbyKey).flatMap(key=>{
  const ids=photos.get(key);
  return ids?.length?[HOBBY_PHOTO_PREFIX+JSON.stringify([key,ids.length===1?ids[0]:ids])]:[];
 });
 for(const group of groupSelectedHobbies(selected)){
  const intro=intros.get(group.id);
  if(intro)hobbyRefs.push(HOBBY_INTRO_PREFIX+JSON.stringify([group.id,intro]));
 }
 const index=layout.blocks.findIndex(block=>block.type==='skills');
 const blocks=layout.blocks.map((block,i)=>{
  if(block.type!=='skills')return block;
  const refs=(block.refs??[]).filter(ref=>!ref.startsWith(HOBBY_PHOTO_PREFIX)&&!ref.startsWith(HOBBY_INTRO_PREFIX));
  if(i===index)refs.push(...hobbyRefs);
  return {...block,refs};
 });
 if(index<0&&hobbyRefs.length){
  const id=Array.from(crypto.getRandomValues(new Uint8Array(16)),byte=>byte.toString(16).padStart(2,'0')).join('');
  blocks.push({id,type:'skills',span:1,size:'compact',refs:hobbyRefs});
 }
 return {...layout,blocks};
}

export function groupSelectedHobbies(values:string[]){
 const groups=new Map<string,{id:string;zh:string;en:string;items:{value:string;hobby:Hobby|undefined}[]}>();
 const seen=new Set<string>();
 for(const value of values){
  const hobby=findHobby(value),key=hobby?.id||normalizeHobby(value);
  if(!key||seen.has(key))continue;
  seen.add(key);
  const category=HOBBY_GROUPS.find(group=>group.items.some(item=>item.id===hobby?.id))||{id:'other',zh:'其他爱好',en:'Other interests'};
  if(!groups.has(category.id))groups.set(category.id,{id:category.id,zh:category.zh,en:category.en,items:[]});
  groups.get(category.id)!.items.push({value,hobby});
 }
 return [...groups.values()];
}
