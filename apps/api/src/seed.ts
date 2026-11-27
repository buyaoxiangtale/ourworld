import { fileURLToPath } from 'node:url';
import { query,pool,transaction } from './db.js';
import { hashPassword } from './security.js';
import { DEFAULT_LAYOUT } from '@ourworld/contracts';
import { migrate } from './migrate.js';
import { normalizeSeedMedia } from './seed-media.js';
import { LOAD_DEMO_NAMES } from './demo-copy.js';
import { CITY_COPY } from './city-copy.js';
import { enrichSeed } from './enrich-seed.js';
import { migrateSeedPhotography } from './photography.js';

// Illustrative development catalog; these are not listings from real service providers.
const CITIES:[string,string,string,string,number,number][]=[
 ['paris','巴黎','Paris','france',48.86,2.35],['lyon','里昂','Lyon','france',45.76,4.84],['nice','尼斯','Nice','france',43.70,7.27],['marseille','马赛','Marseille','france',43.30,5.37],['bordeaux','波尔多','Bordeaux','france',44.84,-0.58],
 ['tokyo','东京','Tokyo','japan',35.68,139.69],['kyoto','京都','Kyoto','japan',35.01,135.77],['osaka','大阪','Osaka','japan',34.69,135.50],['sapporo','札幌','Sapporo','japan',43.06,141.35],['fukuoka','福冈','Fukuoka','japan',33.59,130.40],
 ['shanghai','上海','Shanghai','china',31.23,121.47],['beijing','北京','Beijing','china',39.90,116.40],['chengdu','成都','Chengdu','china',30.57,104.07],['hangzhou','杭州','Hangzhou','china',30.27,120.16],['xian','西安','Xi’an','china',34.34,108.94],
 ['new-york','纽约','New York','usa',40.71,-74.01],['san-francisco','旧金山','San Francisco','usa',37.77,-122.42],['los-angeles','洛杉矶','Los Angeles','usa',34.05,-118.24],['chicago','芝加哥','Chicago','usa',41.88,-87.63],['seattle','西雅图','Seattle','usa',47.61,-122.33],
 ['london','伦敦','London','uk',51.51,-0.13],['edinburgh','爱丁堡','Edinburgh','uk',55.95,-3.19],['bath','巴斯','Bath','uk',51.38,-2.36],['oxford','牛津','Oxford','uk',51.75,-1.26],['bristol','布里斯托','Bristol','uk',51.45,-2.59],
 ['rome','罗马','Rome','italy',41.90,12.50],['florence','佛罗伦萨','Florence','italy',43.77,11.25],['venice','威尼斯','Venice','italy',45.44,12.32],['milan','米兰','Milan','italy',45.46,9.19],['naples','那不勒斯','Naples','italy',40.85,14.27],
 ['barcelona','巴塞罗那','Barcelona','spain',41.39,2.17],['madrid','马德里','Madrid','spain',40.42,-3.70],['seville','塞维利亚','Seville','spain',37.39,-5.98],['valencia','瓦伦西亚','Valencia','spain',39.47,-0.38],['granada','格拉纳达','Granada','spain',37.18,-3.60],
 ['sydney','悉尼','Sydney','australia',-33.87,151.21],['melbourne','墨尔本','Melbourne','australia',-37.81,144.96],['brisbane','布里斯班','Brisbane','australia',-27.47,153.03],['perth','珀斯','Perth','australia',-31.95,115.86],['adelaide','阿德莱德','Adelaide','australia',-34.93,138.60],
 ['bangkok','曼谷','Bangkok','thailand',13.76,100.50],['chiang-mai','清迈','Chiang Mai','thailand',18.79,98.99],['phuket','普吉','Phuket','thailand',7.88,98.39],['krabi','甲米','Krabi','thailand',8.09,98.91],['hua-hin','华欣','Hua Hin','thailand',12.57,99.96],
 ['vancouver','温哥华','Vancouver','canada',49.28,-123.12],['toronto','多伦多','Toronto','canada',43.65,-79.38],['montreal','蒙特利尔','Montreal','canada',45.50,-73.57],['quebec','魁北克','Quebec City','canada',46.81,-71.21],['victoria','维多利亚','Victoria','canada',48.43,-123.37]
];
export const BASE_CITY_IDS=CITIES.map(([slug])=>`city-${slug}`);
const countries:Record<string,[string,string,number,number]>={france:['法国','France',46,2],japan:['日本','Japan',36,138],china:['中国','China',35,105],usa:['美国','United States',39,-98],uk:['英国','United Kingdom',54,-2],italy:['意大利','Italy',42,12],spain:['西班牙','Spain',40,-4],australia:['澳大利亚','Australia',-25,134],thailand:['泰国','Thailand',15,101],canada:['加拿大','Canada',56,-106]};

export async function seed():Promise<void>{
 await migrate();
 const password=process.env.DEMO_PASSWORD||'Ourworld2026!';const hash=await hashPassword(password);
 await transaction(async c=>{
  for(const [id,[zh,en,lat,lng]]of Object.entries(countries))await c.query("INSERT INTO places(id,kind,country,name,lat,lng,description,aliases) VALUES($1,'country',$2,$3,$4,$5,$6,$7) ON CONFLICT(id) DO NOTHING",[`country-${id}`,en,JSON.stringify({zh,en}),lat,lng,JSON.stringify({zh:`从${zh}开始探索世界`,en:`Explore ${en} with local people`}),id==='usa'?['美国','US','USA','America']:id==='uk'?['英国','UK','Britain']:[]]);
  for(const [id,zh,en,country,lat,lng]of CITIES){
   const cityId=`city-${id}`,image=`/api/v1/seed/city/${id}.svg`;
   await c.query("INSERT INTO places(id,kind,parent_id,country,name,lat,lng,description,image,aliases) VALUES($1,'city',$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(id) DO NOTHING",[cityId,`country-${country}`,countries[country][1],JSON.stringify({zh,en}),lat,lng,JSON.stringify(CITY_COPY[cityId]),image,id==='paris'?['巴黎市','city of light']:id==='tokyo'?['东京市','東京']:[]]);
   for(let i=0;i<4;i++){const labels=[['老城漫步','Old Town Walk'],['当地市集','Local Market'],['河畔日落','Riverside Sunset'],['城市博物馆','City Museum']];let attractionZh=`${zh} · ${labels[i][0]}`,attractionEn=`${en} · ${labels[i][1]}`;
    const attractionId=id==='paris'&&i===0?'attraction-eiffel-tower':id==='beijing'&&i===0?'attraction-great-wall':`attraction-${id}-${i}`;
    let attractionLat=lat+(i-1)*0.015,attractionLng=lng+(i-1)*0.015;
    if(attractionId==='attraction-eiffel-tower'){
     // https://www.wikidata.org/wiki/Q243
     attractionZh='埃菲尔铁塔';attractionEn='Eiffel Tower';attractionLat=48.858296;attractionLng=2.294479;
    }
    if(attractionId==='attraction-great-wall'){
     // https://whc.unesco.org/document/216747 (Badaling)
     attractionZh='八达岭长城';attractionEn='Badaling Great Wall';attractionLat=40.35;attractionLng=116.017;
    }
    await c.query("INSERT INTO places(id,kind,parent_id,country,name,lat,lng,description,image,aliases) VALUES($1,'attraction',$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(id) DO NOTHING",[attractionId,cityId,countries[country][1],JSON.stringify({zh:attractionZh,en:attractionEn}),attractionLat,attractionLng,JSON.stringify({zh:'示例地点，具体体验请与当地人沟通。',en:'Illustrative place. Discuss your experience with a local.'}),image,attractionId==='attraction-eiffel-tower'?['铁塔','Tour Eiffel']:attractionId==='attraction-great-wall'?['长城','万里长城','Great Wall']:[]]);
   }
  }
  const demo=[{id:'demo-traveler',email:'traveler@ourworld.test',name:'林间 · Lin',role:'user',status:'none',bio:'喜欢散步、旧书店和不赶时间的旅行。 Looking for little moments in a big world.'},{id:'demo-local',email:'local@ourworld.test',name:'Léa · 林屿',role:'user',status:'approved',bio:'住在巴黎，喜欢摄影、艺术和街角咖啡。 Let’s discover the city at your pace.',price:{min:70,max:120},years:6,languages:['中文 Chinese','English','Français']},{id:'demo-admin',email:'admin@ourworld.test',name:'Ourworld Admin',role:'admin',status:'none',bio:'Local development administrator'}];
  for(const u of demo)await c.query('INSERT INTO users(id,email,password_hash,name,verified,role,provider_status,bio,avatar,tags,city_ids,quote,account_type,price_range,experience_years,languages) VALUES($1,$2,$3,$4,true,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14,$15) ON CONFLICT(id) DO NOTHING',[u.id,u.email,hash,u.name,u.role,u.status,u.bio,`/api/v1/seed/avatar/${u.id}.svg`,JSON.stringify(['摄影 Photography','城市漫步 City walks','咖啡 Coffee']),['city-paris','city-tokyo','city-shanghai'],u.id==='demo-local'?'$70–120 / day':'','individual',u.price?JSON.stringify({min:u.price.min,max:u.price.max,currency:'USD',unit:'day'}):null,u.years??null,u.languages||[]]);
  // Sample names follow the eight portrait slots (slot order matches the gender of
  // each generated portrait) so a name never contradicts the face on its card.
  const names=LOAD_DEMO_NAMES;
  for(let chunk=0;chunk<1000;chunk+=100){const data=[];for(let i=chunk;i<chunk+100;i++){const city=CITIES[i%CITIES.length];const id=`load-${String(i).padStart(4,'0')}`;const base=60+i%90;const languageSets=[['中文 Chinese','English'],['English','Español'],['中文 Chinese','English','日本語']];data.push({id,email:`load${String(i).padStart(4,'0')}@ourworld.test`,name:`${names[i%8]} ${String(i+1).padStart(3,'0')}`,avatar:`/api/v1/seed/avatar/${id}.svg`,bio:`Development sample profile · ${city[2]}。喜欢用当地人的视角发现城市。`,city_ids:[`city-${city[0]}`,`city-${CITIES[(i+7)%50][0]}`,'city-paris'],quote:`$${base}–${Math.round(base*1.6)} / day`,price_range:{min:base,max:Math.round(base*1.6),currency:'USD',unit:'day'},experience_years:3+i%15,languages:languageSets[i%3],tags:['摄影 Photography',i%2?'历史 History':'徒步 Hiking',i%3?'咖啡 Coffee':'冲浪 Surfing']});}
   await c.query("INSERT INTO users(id,email,password_hash,name,avatar,bio,verified,provider_status,city_ids,quote,price_range,experience_years,languages,tags) SELECT x.id,x.email,$2,x.name,x.avatar,x.bio,true,'approved',ARRAY(SELECT jsonb_array_elements_text(x.city_ids)),x.quote,x.price_range,x.experience_years,x.languages,x.tags FROM jsonb_to_recordset($1::jsonb) AS x(id text,email text,name text,avatar text,bio text,city_ids jsonb,quote text,price_range jsonb,experience_years int,languages text[],tags jsonb) ON CONFLICT(id) DO NOTHING",[JSON.stringify(data),hash]);
  }
  const baseSeedUserIds=[...demo.map(x=>x.id),...Array.from({length:1000},(_,i)=>`load-${String(i).padStart(4,'0')}`)];
  await c.query('INSERT INTO profile_drafts(user_id,layout) SELECT id,$1::jsonb FROM users WHERE id=ANY($2::text[]) ON CONFLICT DO NOTHING',[JSON.stringify(DEFAULT_LAYOUT),baseSeedUserIds]);
  await c.query("INSERT INTO profile_publications(user_id,revision,layout) SELECT id,1,$1::jsonb FROM users WHERE provider_status='approved' AND id=ANY($2::text[]) ON CONFLICT DO NOTHING",[JSON.stringify(DEFAULT_LAYOUT),baseSeedUserIds]);
  await c.query('INSERT INTO profile_history(user_id,revision,layout) SELECT user_id,revision,layout FROM profile_publications WHERE user_id=ANY($1::text[]) ON CONFLICT DO NOTHING',[baseSeedUserIds]);
  await c.query("INSERT INTO favorites(user_id,city_id) VALUES('demo-traveler','city-paris'),('demo-traveler','city-tokyo') ON CONFLICT DO NOTHING");
  const seedUserIds=[...demo.map(x=>x.id),...Array.from({length:1000},(_,i)=>`load-${String(i).padStart(4,'0')}`)];
  const localRows=(await c.query("SELECT * FROM users WHERE provider_status='approved' AND id=ANY($1::text[]) ORDER BY id LIMIT 80",[seedUserIds])).rows;
  for(let i=0;i<localRows.length;i++){const u=localRows[i];await c.query("INSERT INTO packages(id,user_id,title,description,city_ids,price,currency,unit,image,status) VALUES($1,$2,$3,$4,$5,$6,'USD','day',$7,'published') ON CONFLICT DO NOTHING",[`package-${u.id}`,u.id,i===0?'跟我走进巴黎的小街巷':'A slow day, a local story',`与 ${u.name} 一起探索当地生活。路线、时间和具体服务请在聊天中沟通。This is an illustrative development listing.`,u.city_ids,String(60+i%90),'/api/v1/seed/city/paris.svg']);}
  for(let i=0;i<100;i++){const city=CITIES[i%50],u=localRows[i%localRows.length];await c.query('INSERT INTO posts(id,user_id,city_id,title,body,images,created_at) VALUES($1,$2,$3,$4,$5,$6,now()-($7::int*interval \'1 hour\')) ON CONFLICT DO NOTHING',[`seed-post-${i}`,u.id,`city-${city[0]}`,`${city[1]}，值得慢下来的一天`,`沿着小街漫步，发现那些没有写进攻略的日常。\nA small corner, a good coffee, and a story worth sharing.\n\n示例社区内容 / Development sample.`,JSON.stringify([`/api/v1/seed/city/${city[0]}.svg`]),i]);}
  // Repair only known fixture rows and their exact expected internal artwork. Never rewrite uploads or outside URLs.
  for(const u of (await c.query('SELECT id,avatar FROM users WHERE id=ANY($1::text[])',[seedUserIds])).rows){const next=normalizeSeedMedia(u.avatar,`/api/v1/seed/avatar/${u.id}.svg`);if(next!==u.avatar)await c.query('UPDATE users SET avatar=$2 WHERE id=$1',[u.id,next]);}
  const expectedPlaceImages=new Map<string,string>();
  for(const [id]of CITIES){expectedPlaceImages.set(`city-${id}`,`/api/v1/seed/city/${id}.svg`);for(let i=0;i<4;i++){const attractionId=id==='paris'&&i===0?'attraction-eiffel-tower':id==='beijing'&&i===0?'attraction-great-wall':`attraction-${id}-${i}`;expectedPlaceImages.set(attractionId,`/api/v1/seed/city/${id}.svg`);}}
  for(const p of (await c.query('SELECT id,image FROM places WHERE id=ANY($1::text[])',[[...expectedPlaceImages.keys()]])).rows){const next=normalizeSeedMedia(p.image,expectedPlaceImages.get(p.id)!);if(next!==p.image)await c.query('UPDATE places SET image=$2 WHERE id=$1',[p.id,next]);}
  for(const p of (await c.query('SELECT id,image FROM packages WHERE id=ANY($1::text[])',[localRows.map(u=>`package-${u.id}`)])).rows){const next=normalizeSeedMedia(p.image,'/api/v1/seed/city/paris.svg');if(next!==p.image)await c.query('UPDATE packages SET image=$2 WHERE id=$1',[p.id,next]);}
  const seededPosts=(await c.query('SELECT id,images FROM posts WHERE id=ANY($1::text[])',[Array.from({length:100},(_,i)=>`seed-post-${i}`)])).rows;
  for(const p of seededPosts){const index=Number(p.id.replace('seed-post-',''));const expected=`/api/v1/seed/city/${CITIES[index%50][0]}.svg`;const next=p.images.map((image:string)=>normalizeSeedMedia(image,expected));if(JSON.stringify(next)!==JSON.stringify(p.images))await c.query('UPDATE posts SET images=$2 WHERE id=$1',[p.id,JSON.stringify(next)]);}
  await c.query("INSERT INTO conversations(id,user_a,user_b,city_id) VALUES('demo-conversation','demo-local','demo-traveler','city-paris') ON CONFLICT DO NOTHING");
  await c.query("INSERT INTO messages(id,conversation_id,sender_id,client_message_id,sequence,type,body) VALUES('demo-message-1','demo-conversation','demo-local','seed-welcome',1,'text','你好，欢迎来到巴黎！很高兴认识你。 Hello, lovely to meet you — what would you like to discover?') ON CONFLICT DO NOTHING");
  await c.query("UPDATE conversations SET last_sequence=GREATEST(last_sequence,1),last_message=CASE WHEN last_sequence<2 THEN 'Hello, lovely to meet you!' ELSE last_message END WHERE id='demo-conversation'");
 });
 await enrichSeed();
 await transaction(migrateSeedPhotography);
 if(process.env.LOAD_SEED==='true')await seedLoadHistory();
 console.log('Seed complete: 50 cities, 200 illustrative attractions, 1,003 verified development users, 80 packages and 100 posts.');
}
export async function seedLoadHistory():Promise<void>{
 await transaction(async c=>{
  await c.query("INSERT INTO conversations(id,user_a,user_b,city_id,last_sequence,last_message) SELECT 'load-conversation-'||lpad(i::text,4,'0'),'load-'||lpad((i*2)::text,4,'0'),'load-'||lpad((i*2+1)::text,4,'0'),'city-paris',400,'Load-test historical message' FROM generate_series(0,249) i ON CONFLICT DO NOTHING");
  await c.query("INSERT INTO messages(id,conversation_id,sender_id,client_message_id,sequence,type,body,created_at) SELECT 'load-message-'||g::text,'load-conversation-'||lpad(((g-1)/400)::text,4,'0'),'load-'||lpad((((g-1)/400)*2+(g%2))::text,4,'0'),'load-history-'||g::text,((g-1)%400)+1,'text','Historical load fixture '||g::text,now()-((400-((g-1)%400)) * interval '1 second') FROM generate_series(1,100000) g ON CONFLICT DO NOTHING");
 });console.log('Load fixture ready: 250 conversations, 100,000 persisted messages.');
}
if(process.argv[1]===fileURLToPath(import.meta.url))seed().then(()=>pool.end()).catch(error=>{console.error(error);process.exitCode=1;return pool.end();});
