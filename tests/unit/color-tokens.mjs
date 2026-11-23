// Static colour-token guardrail: every frontend colour literal must come from
// packages/contracts/assets/visual.json. Run: node tests/unit/color-tokens.mjs
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const read = async (p) => readFile(resolve(root, p), 'utf8');
const checks = [];
const fail = (label) => { throw new Error(label); };
const ok = (label) => checks.push(label);

const visual = JSON.parse(await read('packages/contracts/assets/visual.json'));
const colorValues = new Set(Object.values(visual.colors).map((v) => v.toLowerCase()));
const colorNames = new Set(Object.keys(visual.colors));

// 1. Generated token files are in sync with visual.json (same check as CI).
execFileSync('node', ['scripts/generate/sync-design.mjs', '--check'], { cwd: root, stdio: 'pipe' });
ok('visual tokens synced across web, Android, iOS and globe');

// 2. Web CSS: no raw hex outside visual-tokens.css; rgba limited to photo scrims.
const cssFiles = ['apps/web/src/styles.css', 'apps/web/src/starlight.css', 'apps/web/src/discovery.css', 'apps/web/src/mature.css', 'apps/web/src/features/profile/profile-owner.css', 'apps/web/src/features/explore/country-cities.css'];
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
  for (const name of new Set(css.match(/var\(--ow-([a-zA-Z0-9-]+)/g) || [])) {
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

// Compare opaque token pairs. Component overlays and photos are checked in the browser.
const luminance = (hex) => hex.slice(1).match(/../g)
  .map((channel) => parseInt(channel, 16) / 255)
  .map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
  .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
const contrastPairs = [
  ...['bg', 'surface', 'raised'].flatMap((surface) =>
    ['ink', 'inkMuted', 'inkFaint', 'accent', 'danger'].map((foreground) => [foreground, surface, 4.5])),
  ['accentInk', 'accent', 4.5],
  ['accentInk', 'accentHover', 4.5],
  ['accentInk', 'photoMat', 4.5],
  ['photoMat', 'upload', 4.5],
  ...['bg', 'surface', 'raised', 'upload'].flatMap((surface) =>
    ['controlOutline', 'focus'].map((foreground) => [foreground, surface, 3])),
];
for (const [foreground, background, threshold] of contrastPairs) {
  const values = [foreground, background].map((name) => luminance(visual.colors[name]));
  const ratio = (Math.max(...values) + 0.05) / (Math.min(...values) + 0.05);
  if (!(ratio >= threshold)) fail(`${foreground} on ${background}: ${ratio.toFixed(2)} is below ${threshold}:1`);
}
ok(`${contrastPairs.length} text, border and focus token pairs meet contrast targets`);

console.log(`color-tokens: ${checks.length} checks passed`);
for (const label of checks) console.log(`  ✓ ${label}`);
