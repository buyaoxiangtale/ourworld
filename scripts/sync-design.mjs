import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root=new URL('../',import.meta.url);
const tokens=JSON.parse(await readFile(new URL('packages/contracts/assets/visual.json',root),'utf8'));
const header='Generated from packages/contracts/assets/visual.json. Run node scripts/sync-design.mjs.';
const css=`/* ${header} */\n:root{${Object.entries(tokens.colors).map(([k,v])=>`--ow-${k}:${v};`).join('')}${['radii','spacing','type'].flatMap(group=>Object.entries(tokens[group]).map(([k,v])=>`--ow-${group}-${k}:${v}px;`)).join('')}}\n`;
const kotlin=`// ${header}\npackage app.ourworld\nimport androidx.compose.ui.graphics.Color\ninternal object OWVisual {\n${Object.entries(tokens.colors).map(([k,v])=>`    val ${k} = Color(0xff${v.slice(1)})`).join('\n')}\n${['radii','spacing','type','motion'].flatMap(g=>Object.entries(tokens[g]).map(([k,v])=>`    const val ${g}_${k} = ${v}`)).join('\n')}\n}\n`;
const swift=`// ${header}\nimport SwiftUI\nenum OWVisual {\n${Object.entries(tokens.colors).map(([k,v])=>`    static let ${k} = Color(hex: "${v.slice(1)}")`).join('\n')}\n${['radii','spacing','type','motion'].flatMap(g=>Object.entries(tokens[g]).map(([k,v])=>`    static let ${g}_${k}: CGFloat = ${v}`)).join('\n')}\n}\n`;
const outputs=[['apps/web/src/visual-tokens.css',css],['apps/android/app/src/main/java/app/ourworld/VisualTokens.kt',kotlin],['apps/ios/Sources/VisualTokens.swift',swift]];
for(const [path,content]of outputs){const file=new URL(path,root);if(process.argv.includes('--check')){if(await readFile(file,'utf8')!==content)throw new Error(`Stale visual tokens: ${fileURLToPath(file)}`);}else await writeFile(file,content);}
console.log(`Shared visual tokens ${process.argv.includes('--check')?'verified':'synced'} across web, Android and iOS.`);
