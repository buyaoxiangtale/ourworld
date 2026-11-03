const names=['Mia','Noah','Sofia','Leo','Amelia','Kai','Isabella','Luca','Olivia','Ethan','Ava','Hugo','Yuna','Theo','Emma','Finn','Chloe','Aria','Jules','Rin'];
const surnames=['Laurent','Martin','Rivera','Chen','Silva','Sato','Lin','Rossi','Taylor','Park'];

/** Display-only upgrade of exact, untouched load fixtures; database and edited profiles stay intact. */
export function demoDisplayCopy(row:{id:string;name:string;bio:string}):{name:string;bio:string}{
 const match=/^load-(\d{4})$/.exec(row.id),city=/^Development sample profile · ([^。]+)。喜欢用当地人的视角发现城市。$/.exec(row.bio);
 if(!match||!city)return {name:row.name,bio:row.bio};
 const i=Number(match[1]);
 if(i>=1000||row.name!==`${names[i%names.length]} ${String(i+1).padStart(3,'0')}`)return {name:row.name,bio:row.bio};
 return {name:`${names[i%names.length]} ${surnames[Math.floor(i/names.length)%surnames.length]}`,bio:`喜欢用步行和摄影认识城市，愿意分享 ${city[1]} 的街区、咖啡馆与日常路线。 City walks, photography and everyday discoveries.`};
}
