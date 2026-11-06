// Static colour-token guardrail: every frontend colour literal must come from
// packages/contracts/assets/visual.json. Run: node apps/web/test/color-tokens.mjs
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../../..');
const read = async (p) => readFile(resolve(root, p), 'utf8');
const checks = [];
const fail = (label) => { throw new Error(label); };
const ok = (label) => checks.push(label);

const visual = JSON.parse(await read('packages/contracts/assets/visual.json'));
const colorValues = new Set(Object.values(visual.colors).map((v) => v.toLowerCase()));
const colorNames = new Set(Object.keys(visual.colors));

// 1. Generated token files are in sync with visual.json (same check as CI).
execFileSync('node', ['scripts/sync-design.mjs', '--check'], { cwd: root, stdio: 'pipe' });
ok('visual tokens synced across web, Android, iOS and globe');

// 2. Web CSS: no raw hex outside visual-tokens.css; rgba limited to photo scrims.
const cssFiles = ['apps/web/src/styles.css', 'apps/web/src/discovery.css', 'apps/web/src/mature.css'];
for (const file of cssFiles) {
  const css = await read(file);
  const hex = css.match(/#[0-9a-fA-F]{3,8}\b/g) || [];
  if (hex.length) fail(`${file}: raw hex literals ${hex.join(', ')} — use var(--ow-*) tokens`);
  const rgba = (css.match(/rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+[^)]*\)/g) || [])
    .filter((v) => !/^rgba?\(\s*(0,\s*0,\s*0|255,\s*255,\s*255)\b/.test(v));
  if (rgba.length) fail(`${file}: non-scrim rgb/rgba literals ${rgba.join(', ')} — derive from tokens via color-mix()`);
}
ok('web CSS contains only token references (hex-free, scrim-only rgba)');

// 3. Every --ow-* variable used in CSS exists in visual.json (catches typos).
const generated = ['radii', 'spacing', 'type'].flatMap((g) => Object.keys(visual[g]).map((k) => `${g}-${k}`));
const valid = new Set([...colorNames, ...generated]);
for (const file of cssFiles) {
  const css = await read(file);
  for (const name of new Set(css.match(/var\(--ow-([a-zA-Z]+)/g) || [])) {
    const token = name.slice(9);
    if (!valid.has(token)) fail(`${file}: unknown token var(--ow-${token})`);
  }
}
ok('all --ow-* references resolve to visual.json keys');

// 4. Globe: theme.ts matches visual.json; no palette hex smuggled into globe sources.
const theme = await read('packages/globe/src/theme.ts');
for (const [name, value] of Object.entries(visual.colors)) {
  if (!new RegExp(`${name}: '${value}'`).test(theme)) fail(`packages/globe/src/theme.ts: ${name} is not ${value}`);
}
const MASK = new Set(['#000000', '#ff0000']); // land/water mask channels, not palette colours
for (const file of ['packages/globe/src/earth-material.ts', 'packages/globe/src/main.ts']) {
  const src = await read(file);
  for (const hex of src.match(/#[0-9a-fA-F]{3,8}\b/g) || []) {
    if (!MASK.has(hex.toLowerCase())) fail(`${file}: raw colour ${hex} — import from './theme'`);
  }
}
ok('globe sources take every colour from theme.ts');

// 5. Globe static HTML: only palette values may appear (pre-JS boot/fallback surfaces).
// Print stylesheets keep their paper colours — strip @media print blocks first.
for (const file of ['packages/globe/index.html', 'packages/globe/public/credits.html', 'apps/web/index.html']) {
  const html = (await read(file)).replace(/@media print\{.+?\}\s*(?=@media|<\/style>)/gs, '');
  for (const hex of html.match(/#[0-9a-fA-F]{3,8}\b/g) || []) {
    if (!colorValues.has(hex.toLowerCase())) fail(`${file}: ${hex} is not a visual.json colour`);
  }
}
ok('globe boot/credits pages use only visual.json values');

console.log(`color-tokens: ${checks.length} checks passed`);
for (const label of checks) console.log(`  ✓ ${label}`);
