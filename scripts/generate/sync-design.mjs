import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root=new URL('../../',import.meta.url);
const tokens=JSON.parse(await readFile(new URL('packages/contracts/assets/visual.json',root),'utf8'));
const header='Generated from packages/contracts/assets/visual.json. Run node scripts/generate/sync-design.mjs.';
const css=`/* ${header} */\n:root{${Object.entries(tokens.colors).map(([k,v])=>`--ow-${k}:${v};`).join('')}${['radii','spacing','type'].flatMap(group=>Object.entries(tokens[group]).map(([k,v])=>`--ow-${group}-${k}:${v}px;`)).join('')}}\n`;
const kotlin=`// ${header}\npackage app.ourworld\nimport androidx.compose.ui.graphics.Color\ninternal object OWVisual {\n${Object.entries(tokens.colors).map(([k,v])=>`    val ${k} = Color(0xff${v.slice(1)})`).join('\n')}\n${['radii','spacing','type','motion'].flatMap(g=>Object.entries(tokens[g]).map(([k,v])=>`    const val ${g}_${k} = ${v}`)).join('\n')}\n}\n`;
const swift=`// ${header}\nimport SwiftUI\nenum OWVisual {\n${Object.entries(tokens.colors).map(([k,v])=>`    static let ${k} = Color(hex: "${v.slice(1)}")`).join('\n')}\n${['radii','spacing','type','motion'].flatMap(g=>Object.entries(tokens[g]).map(([k,v])=>`    static let ${g}_${k}: CGFloat = ${v}`)).join('\n')}\n}\n`;
const globeTs=`// ${header}\nexport const theme = {\n${Object.entries(tokens.colors).map(([k,v])=>`  ${k}: '${v}',`).join('\n')}\n} as const;\nexport type ThemeColor = keyof typeof theme;\n`;
const launchColors={
 ow_night: tokens.colors.space,
 ow_nebula: tokens.colors.nebula,
 ow_star_soft: tokens.colors.starSoft,
 ow_star_bright: tokens.colors.starBright,
};
const androidLaunch=`<?xml version="1.0" encoding="utf-8"?>
<resources>
${Object.entries(launchColors).map(([name,value])=>`    <color name="${name}">${value}</color>`).join('\n')}
</resources>
`;
const space=tokens.colors.space;
const iosLaunch=`{
  "colors" : [
    {
      "color" : {
        "color-space" : "srgb",
        "components" : { "alpha" : "1.000", "blue" : "0x${space.slice(5,7)}", "green" : "0x${space.slice(3,5)}", "red" : "0x${space.slice(1,3)}" }
      },
      "idiom" : "universal"
    }
  ],
  "info" : { "author" : "xcode", "version" : 1 }
}
`;
const outputs=[
 ['apps/web/src/visual-tokens.css',css],
 ['apps/android/app/src/main/java/app/ourworld/VisualTokens.kt',kotlin],
 ['apps/ios/Sources/VisualTokens.swift',swift],
 ['packages/globe/src/theme.ts',globeTs],
 ['packages/globe/public/starlight-tokens.css',css],
 ['apps/android/app/src/main/res/values/colors.xml',androidLaunch],
 ['apps/ios/Assets.xcassets/LaunchNight.colorset/Contents.json',iosLaunch],
];
const targets=process.argv.includes('--web-only')?outputs.filter(([path])=>!/^apps\/(android|ios)\//.test(path)):outputs;
for(const [path,content]of targets){const file=new URL(path,root);if(process.argv.includes('--check')){if(await readFile(file,'utf8')!==content)throw new Error(`Stale visual tokens: ${fileURLToPath(file)}`);}else await writeFile(file,content);}
console.log(`Shared visual tokens ${process.argv.includes('--check')?'verified':'synced'} across web, Android and iOS.`);
