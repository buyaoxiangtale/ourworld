/** Only migrates the exact, known seed resource expected for one development row. */
export function normalizeSeedMedia(value:string,expectedPath:string):string {
 if(!expectedPath.startsWith('/api/v1/seed/'))throw new Error('Expected a seed resource path');
 if(value===expectedPath)return value;
 const legacyPath=expectedPath.replace('/api/v1/seed/','/api/v1/assets/');
 if(value===legacyPath)return expectedPath;
 try {
  const parsed=new URL(value);
  if(!['http:','https:'].includes(parsed.protocol)||!['localhost','127.0.0.1','[::1]'].includes(parsed.hostname))return value;
  if(parsed.search||parsed.hash)return value;
  return parsed.pathname===expectedPath||parsed.pathname===legacyPath?expectedPath:value;
 } catch { return value; }
}
