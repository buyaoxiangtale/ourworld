// Eight name slots, one per generated portrait; the order matches each portrait's
// presentation so a display name never contradicts the face shown beside it.
// seed.ts reuses this list so the fixture names and the upgrade guard stay in lockstep.
export const LOAD_DEMO_NAMES=['Mia','Sofia','Isabella','Kai','Rin','Yuna','Chloe','Theo'];
const names=LOAD_DEMO_NAMES;
const surnames=['Laurent','Martin','Rivera','Chen','Silva','Sato','Lin','Rossi','Taylor','Park'];

/** Display-only upgrade of exact, untouched load fixtures; database and edited profiles stay intact. */
export function demoDisplayCopy(row:{id:string;name:string;bio:string}):{name:string;bio:string}{
 const match=/^load-(\d{4})$/.exec(row.id),city=/^Development sample profile · ([^。]+)。喜欢用当地人的视角发现城市。$/.exec(row.bio);
 if(!match||!city)return {name:row.name,bio:row.bio};
 const i=Number(match[1]);
 if(i>=1000||row.name!==`${names[i%8]} ${String(i+1).padStart(3,'0')}`)return {name:row.name,bio:row.bio};
 return {name:`${names[i%8]} ${surnames[Math.floor(i/8)%surnames.length]}`,bio:`喜欢用步行和摄影认识城市，愿意分享 ${city[1]} 的街区、咖啡馆与日常路线。 City walks, photography and everyday discoveries.`};
}
