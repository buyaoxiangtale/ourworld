import {readFile,mkdir,writeFile} from 'node:fs/promises';
import sharp from 'sharp';
import {fileURLToPath} from 'node:url';
const root=new URL('../../',import.meta.url);
const manifest=process.argv[2];
if(!manifest)throw new Error('Provide a portrait source manifest: uv run ourworld media portraits --manifest path/to/records.json');
const records=JSON.parse(await readFile(manifest,'utf8'));
const target=new URL('apps/api/assets/photos/portraits/',root);await mkdir(target,{recursive:true});
for(const record of records){if(!record.source)throw new Error(`Missing generated portrait ${record.id}`);await sharp(record.source).resize(900,1200,{fit:'cover'}).jpeg({quality:86,mozjpeg:true}).toFile(fileURLToPath(new URL(`${record.id}.jpg`,target)));}
await writeFile(new URL('sources.json',target),JSON.stringify(records.map(({source,...record})=>({...record,file:`${record.id}.jpg`})),null,2));
console.log(`Prepared ${records.length} fictional portraits for all three clients.`);
