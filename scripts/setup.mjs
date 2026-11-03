import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const env=resolve(root,'.env');
if(!existsSync(env)){
  const value=readFileSync(resolve(root,'.env.example'),'utf8').replace('replace-with-a-random-64-character-secret',randomBytes(48).toString('hex'));
  writeFileSync(env,value,{mode:0o600});
  console.log('Created local .env with a random signing secret. Configure PUBLIC_BASE_URL for phone access and LLM_* for real layout generation.');
}else console.log('Existing .env preserved.');
mkdirSync(resolve(root,'artifacts'),{recursive:true});
