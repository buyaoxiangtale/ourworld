/** Explicit references win over fallback ordering/limits; data always comes from the supplied resources. */
export function selectProfileResources<T extends {id:string}>(resources:readonly T[],refs?:readonly string[],fallbackLimit?:number):T[]{
  if(!refs?.length)return fallbackLimit===undefined?[...resources]:resources.slice(0,fallbackLimit);
  const available=new Map(resources.map(resource=>[resource.id,resource]));
  return [...new Set(refs)].map(id=>available.get(id)).filter((resource):resource is T=>resource!==undefined);
}
